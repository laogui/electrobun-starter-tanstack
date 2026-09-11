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
import { readJsonOrEmpty } from '../persistence/corruptFile';
import {
  DevelopmentDirectories,
  type DevelopmentDirectoryRecord,
  withPluginSourceLock,
} from './developmentDirectories';
import { readPluginContents } from './directoryContents';
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
/** Enablement path → where its damaged contents were preserved. */
const enablementDamage = new Map<string, string>();

function parseEnablement(value: unknown): Record<string, string> {
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
    throw new Error('plugin enablement file does not match the schema');
  }
  return Object.fromEntries(
    Object.entries(value.enabled).filter(
      ([, digest]) => typeof digest === 'string'
    )
  ) as Record<string, string>;
}

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

function diagnosticSummary(
  name: string,
  validationError: string
): InstalledPluginSummary {
  return {
    digest: '',
    enabled: false,
    installedAt: new Date(0).toISOString(),
    name,
    pluginId: `ghostboard.diagnostic/${name}`,
    source: { kind: 'file', label: name },
    status: 'invalid',
    validationError,
    version: '',
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
    treeDigest: installed.treeDigest,
    version: installed.version,
  };
}

export class PluginManagementService {
  private readonly root: string;
  private readonly directories: DevelopmentDirectories;
  private readonly store: PluginInstallStore;
  private readonly legacyStore: PluginInstallStore;
  private readonly enablementPath: string;
  /** Installed package directory → tree digest verified by this service. */
  private readonly verifiedTrees = new Map<string, string>();

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
      ...(await this.corruptionDiagnostics()),
    ];
  }

  /**
   * Damaged state files surface as `invalid` rows so the settings panel shows
   * the problem instead of silently listing nothing.
   */
  private async corruptionDiagnostics(): Promise<InstalledPluginSummary[]> {
    const rows: InstalledPluginSummary[] = [];
    const registry = this.store.diagnostic();
    if (registry) {
      rows.push(diagnosticSummary('registry.json', registry.message));
    }
    const enablement = await this.enablementDiagnostic();
    if (enablement) {
      rows.push(diagnosticSummary('plugin enablement', enablement));
    }
    return rows;
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
    const base = baseSummary(installed);
    try {
      const { loaded } = await this.resolveStoredPackage({
        pluginId: installed.pluginId,
        digest: installed.digest,
      });
      return {
        ...base,
        enabled: await this.isEnabled(installed),
        name: loaded.manifest.name,
        plugin: packageSummary(loaded.manifest),
        status: 'stored',
      };
    } catch (error) {
      return {
        ...base,
        // Read after resolution: a failed integrity check disables the plugin,
        // and the row must not still claim it is running.
        enabled: await this.isEnabled(installed),
        status:
          error instanceof PluginDirectoryError &&
          error.code === 'legacy-contract'
            ? 'legacy'
            : 'invalid',
        validationError: pluginInstallErrorMessage(error),
      };
    }
  }

  private async isEnabled(installed: InstalledPluginPackage): Promise<boolean> {
    return (
      (await this.readEnablement())[installed.pluginId] === installed.digest
    );
  }

  private async readEnablement(): Promise<Record<string, string>> {
    const read = await readJsonOrEmpty(this.enablementPath, parseEnablement);
    if (read.kind === 'corrupt') {
      // Fail closed: treat every plugin as disabled rather than guessing, and
      // block writes so we never overwrite a recoverable file.
      enablementDamage.set(this.enablementPath, read.backupPath);
      return {};
    }
    enablementDamage.delete(this.enablementPath);
    return read.kind === 'empty' ? {} : read.value;
  }

  /** Non-null while the enablement file is damaged; blocks enable/disable. */
  async enablementDiagnostic(): Promise<string | undefined> {
    await this.readEnablement();
    const backupPath = enablementDamage.get(this.enablementPath);
    return backupPath
      ? `Plugin enablement is unreadable, so every plugin is treated as disabled. The original is at ${backupPath}.`
      : undefined;
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
        const backupPath = enablementDamage.get(this.enablementPath);
        if (backupPath) {
          throw new PluginInstallError(
            'enablement-corrupt',
            `Plugin enablement is unreadable; the original is at ${backupPath}. Restore or delete it before changing plugins.`
          );
        }
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
    await this.verifyStoredTree(installed);
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

  /**
   * Installed packages are immutable once committed, so any change to their
   * files is tampering or corruption. Hashing the whole tree is too expensive
   * to repeat on every settings read, so it happens once per directory per
   * service; the host controller re-compares the digest on every runtime
   * refresh using the tree it already reads to build a generation.
   */
  private async verifyStoredTree(
    installed: InstalledPluginPackage
  ): Promise<void> {
    if (this.verifiedTrees.get(installed.directory) === installed.treeDigest) {
      return;
    }
    const treeDigest = (await readPluginContents(installed.directory)).digest;
    if (!installed.treeDigest) {
      await this.store.adoptTreeDigest({
        digest: installed.digest,
        pluginId: installed.pluginId,
        treeDigest,
      });
      this.verifiedTrees.set(installed.directory, treeDigest);
      return;
    }
    if (treeDigest !== installed.treeDigest) {
      await this.quarantine(installed.pluginId);
      throw new PluginInstallError(
        'integrity',
        `Installed files for ${installed.pluginId} no longer match the package recorded at install. The plugin was disabled; reinstall it to continue.`
      );
    }
    this.verifiedTrees.set(installed.directory, treeDigest);
  }

  /**
   * Called by the host controller when the tree it read to build a generation
   * does not match the registry. That check runs on every refresh, so it sees
   * edits made after this service already verified the directory.
   */
  async reportIntegrityMismatch(input: {
    directory: string;
    pluginId: string;
  }): Promise<void> {
    this.verifiedTrees.delete(input.directory);
    await this.quarantine(input.pluginId);
  }

  /** Fails closed by disabling the plugin so nothing loads its code again. */
  private async quarantine(pluginId: string): Promise<void> {
    try {
      await this.writeEnablement(pluginId, undefined);
    } catch (error) {
      console.error('[plugins] quarantine failed', pluginId, error);
    }
  }
}
