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
  private readonly store: PluginInstallStore;
  private readonly legacyStore: PluginInstallStore;
  private readonly enablementPath: string;

  constructor(workspacePath: string, options?: { appDataRoot?: string }) {
    const root = resolve(pluginInstallRoot(options?.appDataRoot));
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
    await this.store.recover();
  }

  async list(): Promise<InstalledPluginSummary[]> {
    const installed = await this.store.listInstalled();
    const summaries = await Promise.all(
      installed.map((entry) => this.installedSummary(entry))
    );
    const installedIds = new Set(installed.map((entry) => entry.pluginId));
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
    return previewFromPrepared({
      ...prepared,
      source: prepared.journal.source,
    });
  }

  async prepareFromUrl(url: string): Promise<PluginInstallPreview> {
    const prepared = await this.store.prepareFromUrl({ url });
    return previewFromPrepared({
      ...prepared,
      source: prepared.journal.source,
    });
  }

  async commit(transactionId: string): Promise<InstalledPluginSummary> {
    return await this.installedSummary(await this.store.commit(transactionId));
  }

  async cancel(transactionId: string): Promise<void> {
    await this.store.cancel(transactionId);
  }

  async enable(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginSummary> {
    const { installed } = await this.resolveStoredPackage(input);
    await this.writeEnablement(input.pluginId, input.digest);
    return await this.installedSummary(installed);
  }

  async disable(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginSummary> {
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

  private async installedSummary(
    installed: InstalledPluginPackage
  ): Promise<InstalledPluginSummary> {
    const base = baseSummary(installed);
    try {
      const { loaded } = await this.resolveStoredPackage({
        pluginId: installed.pluginId,
        digest: installed.digest,
      });
      const enabled =
        (await this.readEnablement())[installed.pluginId] === installed.digest;
      return {
        ...base,
        enabled,
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
