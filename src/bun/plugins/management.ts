import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

import type {
  InstalledPluginSummary,
  PluginInstallPreview,
  PluginPackageSummary,
  PluginSourceSummary,
} from '../../shared/plugins/management';
import {
  LEGACY_PLUGIN_MESSAGE,
  type PluginManifest,
} from '../../shared/plugins/manifest';
import { getAppDataRoot } from '../appPaths';
import {
  DevelopmentDirectories,
  type DevelopmentDirectoryRecord,
  withPluginSourceLock,
} from './developmentDirectories';
import {
  type LoadedPluginDirectory,
  loadPluginDirectory,
  PluginDirectoryError,
} from './loadDirectory';
import {
  type InstalledPluginPackage,
  PluginInstallError,
  type PluginInstallSource,
  PluginInstallStore,
} from './pluginInstall';

const PACKAGE_EXTENSIONS = new Set(['.zip', '.ghostboard-plugin']);
const stores = new Map<string, PluginInstallStore>();
const enablementWrites = new Map<string, Promise<unknown>>();

export function pluginInstallRoot(appDataRoot = getAppDataRoot()): string {
  return join(appDataRoot, 'plugins');
}

export function pluginInstallErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Plugin installation failed.';
}

function sourceSummary(source: PluginInstallSource): PluginSourceSummary {
  switch (source.kind) {
    case 'file':
      return { kind: 'file', label: source.name };
    case 'url':
      return { kind: 'url', label: `${source.origin}${source.path}` };
    default:
      return { kind: 'zip', label: 'Plugin package' };
  }
}

function packageSummary(manifest: PluginManifest): PluginPackageSummary {
  return {
    ...(manifest.author ? { author: manifest.author } : {}),
    ...(manifest.description ? { description: manifest.description } : {}),
    capabilities: manifest.capabilities,
    ghostboard: manifest.engines.ghostboard,
    id: manifest.id,
    name: manifest.name,
    signatureStatus: 'unverified',
    ...(manifest.update ? { updateUrl: manifest.update.url } : {}),
    version: manifest.version,
  };
}

function previewFromPrepared(input: {
  digest: string;
  manifest: PluginManifest;
  source: PluginInstallSource;
  transactionId: string;
}): PluginInstallPreview {
  return {
    digest: input.digest,
    plugin: packageSummary(input.manifest),
    source: sourceSummary(input.source),
    transactionId: input.transactionId,
  };
}

function baseSummary(installed: InstalledPluginPackage) {
  return {
    digest: installed.digest,
    enabled: false,
    installedAt: installed.installedAt,
    name: installed.name,
    pluginId: installed.pluginId,
    source: sourceSummary(installed.source),
    version: installed.version,
  };
}

export class PluginManagementService {
  private readonly root: string;
  private readonly directories: DevelopmentDirectories;
  private readonly store: PluginInstallStore;
  private readonly legacyStore: PluginInstallStore;
  private readonly enablementPath: string;

  constructor(workspacePath: string, options?: { appDataRoot?: string }) {
    const root = resolve(pluginInstallRoot(options?.appDataRoot));
    this.root = root;
    this.directories = new DevelopmentDirectories(root);
    let store = stores.get(root);
    if (!store) {
      store = new PluginInstallStore(root);
      stores.set(root, store);
    }
    this.store = store;
    this.legacyStore = new PluginInstallStore(
      join(workspacePath, '.ghostboard', 'plugins')
    );
    const workspaceKey = createHash('sha256')
      .update(resolve(workspacePath))
      .digest('hex');
    this.enablementPath = join(root, 'workspaces', `${workspaceKey}.json`);
  }

  async recover(): Promise<void> {
    await withPluginSourceLock(this.root, async () => {
      await this.directories.list();
      await this.store.recover();
    });
  }

  async list(): Promise<InstalledPluginSummary[]> {
    const installed = await this.store.listInstalled();
    const development = await this.directories.list();
    const summaries = await Promise.all([
      ...installed.map((entry) => this.installedSummary(entry)),
      ...development.map((entry) => this.directorySummary(entry)),
    ]);
    const installedIds = new Set(
      [...installed, ...development].map((entry) => entry.pluginId)
    );
    // Old workspace installs are read-only diagnostics, never a source of activation.
    const legacy = (await this.legacyStore.listInstalled()).filter(
      (entry) => !installedIds.has(entry.pluginId)
    );
    return [
      ...summaries,
      ...legacy.map((entry) => ({
        ...baseSummary(entry),
        status: 'legacy' as const,
        validationError: LEGACY_PLUGIN_MESSAGE,
      })),
    ];
  }

  async prepareFromFile(filePath: string): Promise<PluginInstallPreview> {
    const name = basename(filePath);
    if (!PACKAGE_EXTENSIONS.has(extname(name).toLowerCase())) {
      throw new PluginInstallError(
        'invalid-package',
        'Choose a .zip or .ghostboard-plugin package.'
      );
    }
    const prepared = await this.store.prepareFromZip({
      source: { kind: 'file', name },
      zipBytes: Uint8Array.from(await readFile(filePath)),
    });
    try {
      await this.assertNoDirectorySource(prepared.pluginId);
    } catch (error) {
      await this.store.cancel(prepared.transactionId);
      throw error;
    }
    return previewFromPrepared({
      ...prepared,
      source: prepared.journal.source,
    });
  }

  async prepareFromUrl(url: string): Promise<PluginInstallPreview> {
    const prepared = await this.store.prepareFromUrl({ url });
    try {
      await this.assertNoDirectorySource(prepared.pluginId);
    } catch (error) {
      await this.store.cancel(prepared.transactionId);
      throw error;
    }
    return previewFromPrepared({
      ...prepared,
      source: prepared.journal.source,
    });
  }

  async prepareDevelopmentDirectory(
    directory: string
  ): Promise<PluginInstallPreview> {
    return await withPluginSourceLock(this.root, async () => {
      const loaded = await loadPluginDirectory(directory);
      await this.assertNoInstalledSource(loaded.manifest.id);
      const { pending, loaded: reviewed } =
        await this.directories.prepare(directory);
      return {
        digest: pending.record.digest,
        plugin: packageSummary(reviewed.manifest),
        source: { kind: 'directory', label: pending.record.directory },
        transactionId: pending.transactionId,
      };
    });
  }

  async commit(transactionId: string): Promise<InstalledPluginSummary> {
    return await withPluginSourceLock(this.root, async () => {
      if (transactionId.startsWith('directory-')) {
        const pluginId = await this.directories.pendingPluginId(transactionId);
        if (pluginId) {
          await this.assertNoInstalledSource(pluginId);
        }
        return await this.directorySummary(
          await this.directories.commit(transactionId)
        );
      }
      const journal = await this.store.getJournal(transactionId);
      if (journal?.pluginId) {
        await this.assertNoDirectorySource(journal.pluginId);
      }
      return await this.installedSummary(
        await this.store.commit(transactionId)
      );
    });
  }

  async cancel(transactionId: string): Promise<void> {
    await withPluginSourceLock(this.root, async () => {
      if (transactionId.startsWith('directory-')) {
        await this.directories.cancel(transactionId);
      } else {
        await this.store.cancel(transactionId);
      }
    });
  }

  async enable(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginSummary> {
    const directory = (await this.directories.list()).find(
      (entry) =>
        entry.pluginId === input.pluginId && entry.digest === input.digest
    );
    if (directory) {
      await this.resolveDevelopmentDirectory(directory);
      await this.writeEnablement(input.pluginId, input.digest);
      return await this.directorySummary(directory);
    }
    const { installed } = await this.resolveStoredPackage(input);
    await this.writeEnablement(input.pluginId, input.digest);
    return await this.installedSummary(installed);
  }

  async disable(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginSummary> {
    const directory = (await this.directories.list()).find(
      (entry) =>
        entry.pluginId === input.pluginId && entry.digest === input.digest
    );
    if (directory) {
      await this.writeEnablement(input.pluginId);
      return await this.directorySummary(directory);
    }
    const installed = (await this.store.listInstalled()).find(
      (entry) =>
        entry.pluginId === input.pluginId && entry.digest === input.digest
    );
    if (!installed) {
      throw new PluginInstallError(
        'not-found',
        `Stored plugin is not available: ${input.pluginId}`
      );
    }
    await this.writeEnablement(input.pluginId);
    return await this.installedSummary(installed);
  }

  async resolveRuntimePackage(
    summary: InstalledPluginSummary
  ): Promise<LoadedPluginDirectory> {
    if ((await this.readEnablement())[summary.pluginId] !== summary.digest) {
      throw new PluginInstallError(
        'not-found',
        `Plugin is not enabled: ${summary.pluginId}`
      );
    }
    if (summary.development) {
      const record = (await this.directories.list()).find(
        (entry) =>
          entry.pluginId === summary.pluginId && entry.digest === summary.digest
      );
      if (!record) {
        throw new PluginInstallError(
          'not-found',
          'Development connection no longer exists.'
        );
      }
      return await this.resolveDevelopmentDirectory(record);
    }
    return (await this.resolveStoredPackage(summary)).loaded;
  }

  private async assertNoInstalledSource(pluginId: string): Promise<void> {
    if (
      (await this.store.listInstalled()).some(
        (entry) => entry.pluginId === pluginId
      )
    ) {
      throw new PluginInstallError(
        'already-installed',
        `Plugin ID conflicts with an installed package: ${pluginId}`
      );
    }
  }

  private async assertNoDirectorySource(pluginId: string): Promise<void> {
    if (
      (await this.directories.list()).some(
        (entry) => entry.pluginId === pluginId
      )
    ) {
      throw new PluginInstallError(
        'already-installed',
        `Plugin ID conflicts with a development directory: ${pluginId}`
      );
    }
  }

  private async resolveDevelopmentDirectory(
    record: DevelopmentDirectoryRecord
  ): Promise<LoadedPluginDirectory> {
    await this.assertNoInstalledSource(record.pluginId);
    const loaded = await loadPluginDirectory(record.directory);
    if (loaded.manifest.id !== record.pluginId) {
      throw new PluginInstallError(
        'invalid-package',
        `Development directory identity changed: expected ${record.pluginId}, found ${loaded.manifest.id}. Connect the new identity separately.`
      );
    }
    return loaded;
  }

  private async directorySummary(
    record: DevelopmentDirectoryRecord
  ): Promise<InstalledPluginSummary> {
    const base: InstalledPluginSummary = {
      development: true,
      digest: record.digest,
      enabled: (await this.readEnablement())[record.pluginId] === record.digest,
      installedAt: record.installedAt,
      name: record.name,
      pluginId: record.pluginId,
      source: { kind: 'directory', label: record.directory },
      status: 'stored',
      version: record.version,
    };
    try {
      const loaded = await this.resolveDevelopmentDirectory(record);
      return {
        ...base,
        name: loaded.manifest.name,
        version: loaded.manifest.version,
        plugin: packageSummary(loaded.manifest),
      };
    } catch (error) {
      return {
        ...base,
        status:
          error instanceof PluginDirectoryError &&
          error.code === 'legacy-contract'
            ? 'legacy'
            : 'invalid',
        validationError: pluginInstallErrorMessage(error),
      };
    }
  }

  private async installedSummary(
    installed: InstalledPluginPackage
  ): Promise<InstalledPluginSummary> {
    const base = {
      ...baseSummary(installed),
      enabled:
        (await this.readEnablement())[installed.pluginId] === installed.digest,
    };
    try {
      const { loaded } = await this.resolveStoredPackage({
        pluginId: installed.pluginId,
        digest: installed.digest,
      });
      return {
        ...base,
        name: loaded.manifest.name,
        plugin: packageSummary(loaded.manifest),
        status: 'stored',
      };
    } catch (error) {
      return {
        ...base,
        status:
          error instanceof PluginDirectoryError &&
          error.code === 'legacy-contract'
            ? 'legacy'
            : 'invalid',
        validationError: pluginInstallErrorMessage(error),
      };
    }
  }

  private async readEnablement(): Promise<Record<string, string>> {
    try {
      const value: unknown = JSON.parse(
        await readFile(this.enablementPath, 'utf8')
      );
      if (
        !value ||
        typeof value !== 'object' ||
        !('schema' in value) ||
        value.schema !== 2 ||
        !('enabled' in value) ||
        !value.enabled ||
        typeof value.enabled !== 'object' ||
        Array.isArray(value.enabled)
      ) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(value.enabled).filter(
          ([, digest]) => typeof digest === 'string'
        )
      );
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === 'ENOENT' ||
        error instanceof SyntaxError
      ) {
        return {};
      }
      throw error;
    }
  }

  private async writeEnablement(
    pluginId: string,
    digest?: string
  ): Promise<void> {
    const previous =
      enablementWrites.get(this.enablementPath) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const enabled = await this.readEnablement();
        if (digest) {
          enabled[pluginId] = digest;
        } else {
          delete enabled[pluginId];
        }
        await mkdir(dirname(this.enablementPath), { recursive: true });
        const temporary = `${this.enablementPath}.${crypto.randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify({ schema: 2, enabled }));
        await rename(temporary, this.enablementPath);
      });
    enablementWrites.set(this.enablementPath, next);
    try {
      await next;
    } finally {
      if (enablementWrites.get(this.enablementPath) === next) {
        enablementWrites.delete(this.enablementPath);
      }
    }
  }

  private async resolveStoredPackage(input: {
    digest: string;
    pluginId: string;
  }): Promise<{
    installed: InstalledPluginPackage;
    loaded: LoadedPluginDirectory;
  }> {
    const installed = (await this.store.listInstalled()).find(
      (entry) =>
        entry.pluginId === input.pluginId && entry.digest === input.digest
    );
    if (!installed) {
      throw new PluginInstallError(
        'not-found',
        `Stored plugin is not available: ${input.pluginId}`
      );
    }
    await this.assertNoDirectorySource(input.pluginId);
    const loaded = await loadPluginDirectory(installed.directory);
    if (
      loaded.manifest.id !== installed.pluginId ||
      loaded.manifest.version !== installed.version
    ) {
      throw new PluginInstallError(
        'invalid-package',
        `Stored plugin metadata does not match its package: ${input.pluginId}`
      );
    }
    return { installed, loaded };
  }
}
