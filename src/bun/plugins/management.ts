import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

import type {
  InstalledPluginSummary,
  PluginInstallPreview,
  PluginPackageSummary,
  PluginSourceSummary,
  PluginUpdatePreview,
} from '../../shared/plugins/management';
import {
  compareSemver,
  LEGACY_PLUGIN_MESSAGE,
  type PluginManifest,
} from '../../shared/plugins/manifest';
import {
  isPluginReleaseError,
  parsePluginReleaseDocument,
  releaseMatchesManifest,
  selectCompatibleRelease,
} from '../../shared/plugins/release';
import { getAppDataRoot } from '../appPaths';
import { atomicWrite } from '../atomicWrite';
import {
  pluginMigrationBackupSummary,
  restorePluginMigrationBackups,
} from '../extensions/instanceStore';
import { readJsonOrEmpty } from '../persistence/corruptFile';
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
  getPluginPermissionStore,
  type PluginPermissionStore,
} from './permissions';
import {
  PluginDirectoryCache,
  type PluginDirectorySnapshot,
} from './pluginDirectoryCache';
import {
  type InstalledPluginPackage,
  PluginInstallError,
  type PluginInstallSource,
  PluginInstallStore,
} from './pluginInstall';
import { downloadPluginReleaseDocument } from './urlInstall';

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

function packageSummary(
  manifest: PluginManifest,
  signatureStatus: PluginPackageSummary['signatureStatus']
): PluginPackageSummary {
  return {
    ...(manifest.author ? { author: manifest.author } : {}),
    ...(manifest.description ? { description: manifest.description } : {}),
    capabilities: manifest.capabilities,
    ghostboard: manifest.engines.ghostboard,
    id: manifest.id,
    name: manifest.name,
    signatureStatus,
    ...(manifest.update ? { updateUrl: manifest.update.url } : {}),
    version: manifest.version,
  };
}

function previewFromPrepared(input: {
  digest: string;
  manifest: PluginManifest;
  signature?: InstalledPluginPackage['signature'];
  source: PluginInstallSource;
  transactionId: string;
}): PluginInstallPreview {
  return {
    digest: input.digest,
    plugin: packageSummary(
      input.manifest,
      input.signature ? 'verified' : 'unsigned'
    ),
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
    ...(installed.previous
      ? { previousVersion: installed.previous.version }
      : {}),
    source: sourceSummary(installed.source),
    treeDigest: installed.treeDigest,
    version: installed.version,
  };
}

export class PluginManagementService {
  private readonly root: string;
  private readonly workspacePath: string;
  private readonly directories: DevelopmentDirectories;
  private readonly store: PluginInstallStore;
  private readonly legacyStore: PluginInstallStore;
  private readonly enablementPath: string;
  private readonly permissionStore: PluginPermissionStore;
  /** Installed package directory → tree digest verified by this service. */
  private readonly directoryCache = new PluginDirectoryCache();

  constructor(workspacePath: string, options?: { appDataRoot?: string }) {
    this.workspacePath = resolve(workspacePath);
    const root = resolve(pluginInstallRoot(options?.appDataRoot));
    this.root = root;
    this.permissionStore = getPluginPermissionStore(
      options?.appDataRoot ?? getAppDataRoot()
    );
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

  async prepareFromUrl(
    url: string,
    options?: { allowLoopback?: boolean }
  ): Promise<PluginInstallPreview> {
    const prepared = await this.store.prepareFromUrl({
      url,
      allowLoopback: options?.allowLoopback,
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

  async prepareUpdate(
    input: { digest: string; pluginId: string },
    options?: { allowLoopback?: boolean }
  ): Promise<PluginUpdatePreview> {
    const installed = (await this.store.listInstalled()).find(
      (entry) =>
        entry.pluginId === input.pluginId && entry.digest === input.digest
    );
    const updateUrl = installed?.signature?.updateUrl;
    if (!(installed && updateUrl)) {
      throw new PluginInstallError(
        'invalid-state',
        `Plugin ${input.pluginId} has no verified update source.`
      );
    }
    await this.assertNoDirectorySource(input.pluginId);
    const raw = await downloadPluginReleaseDocument(updateUrl, {
      allowLoopback: options?.allowLoopback,
    });
    const document = parsePluginReleaseDocument(raw);
    if (isPluginReleaseError(document)) {
      throw new PluginInstallError('invalid-package', document.message);
    }
    if (document.pluginId !== installed.pluginId) {
      throw new PluginInstallError(
        'invalid-package',
        `Release source identifies ${document.pluginId}, not ${installed.pluginId}.`
      );
    }
    const release = selectCompatibleRelease(document);
    if (isPluginReleaseError(release)) {
      throw new PluginInstallError('invalid-package', release.message);
    }
    if (compareSemver(release.version, installed.version) <= 0) {
      throw new PluginInstallError(
        'invalid-state',
        `${installed.name} is already up to date at ${installed.version}.`
      );
    }
    const prepared = await this.store.prepareFromUrl({
      url: release.url,
      allowLoopback: options?.allowLoopback,
    });
    try {
      if (prepared.version !== release.version) {
        throw new PluginInstallError(
          'invalid-package',
          `Release ${release.version} delivered package ${prepared.version}.`
        );
      }
      const mismatch = releaseMatchesManifest(
        document,
        prepared.manifest,
        prepared.digest
      );
      if (mismatch) {
        throw new PluginInstallError('invalid-package', mismatch.message);
      }
      await this.assertNoDirectorySource(prepared.pluginId);
    } catch (error) {
      await this.store.cancel(prepared.transactionId);
      throw error;
    }
    return {
      ...previewFromPrepared({
        ...prepared,
        source: prepared.journal.source,
      }),
      currentVersion: installed.version,
      ...(release.notes ? { notes: release.notes } : {}),
    };
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
        plugin: packageSummary(reviewed.manifest, 'unsigned'),
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
      const previous = journal?.pluginId
        ? (await this.store.listInstalled()).find(
            (entry) => entry.pluginId === journal.pluginId
          )
        : undefined;
      if (journal?.pluginId) {
        await this.assertNoDirectorySource(journal.pluginId);
      }
      const committed =
        previous && previous.digest !== journal?.digest
          ? await this.withWorkspacesDisabled(previous, () =>
              this.store.commit(transactionId)
            )
          : await this.store.commit(transactionId);
      return await this.installedSummary(committed);
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

  async rollback(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginSummary> {
    return await withPluginSourceLock(this.root, async () => {
      await this.assertNoDirectorySource(input.pluginId);
      const current = (await this.store.listInstalled()).find(
        (entry) =>
          entry.pluginId === input.pluginId && entry.digest === input.digest
      );
      if (!current) {
        throw new PluginInstallError(
          'not-found',
          'Installed package changed; refresh and try again.'
        );
      }
      const restored = await this.withWorkspacesDisabled(current, () =>
        this.store.rollback(input)
      );
      this.directoryCache.invalidate(restored.directory);
      return await this.installedSummary(restored);
    });
  }

  async restoreMigrationBackup(pluginId: string): Promise<{
    restored: number;
    skipped: number;
  }> {
    return await withPluginSourceLock(this.root, async () => {
      await this.writeEnablement(pluginId);
      const result = await restorePluginMigrationBackups(
        this.workspacePath,
        pluginId
      );
      if (result.restored === 0) {
        throw new PluginInstallError(
          'invalid-state',
          `No compatible migration backup is available for ${pluginId}.`
        );
      }
      return result;
    });
  }

  async enable(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginSummary> {
    return withPluginSourceLock(this.root, () => this.enableUnlocked(input));
  }
  private async enableUnlocked(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginSummary> {
    const directory = (await this.directories.list()).find(
      (entry) =>
        entry.pluginId === input.pluginId && entry.digest === input.digest
    );
    if (directory) {
      await this.resolveDevelopmentDirectory(directory, true);
      await this.writeEnablement(input.pluginId, input.digest);
      return await this.directorySummary(directory);
    }
    const { installed } = await this.resolveStoredPackage(input, true);
    await this.writeEnablement(input.pluginId, input.digest);
    return await this.installedSummary(installed);
  }

  async disable(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginSummary> {
    return withPluginSourceLock(this.root, () => this.disableUnlocked(input));
  }
  private async disableUnlocked(input: {
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

  /** Remove the code source in every workspace; content and plugin storage remain. */
  async remove(input: { digest: string; pluginId: string }): Promise<void> {
    return withPluginSourceLock(this.root, async () => {
      const development = (await this.directories.list()).find(
        (entry) =>
          entry.pluginId === input.pluginId && entry.digest === input.digest
      );
      const installed = (await this.store.listInstalled()).find(
        (entry) =>
          entry.pluginId === input.pluginId && entry.digest === input.digest
      );
      if (!(development || installed)) {
        throw new PluginInstallError(
          'not-found',
          'Plugin source changed; refresh and try again.'
        );
      }
      await this.withWorkspacesDisabled(input, async () => {
        await this.permissionStore.revoke(input.pluginId);
        if (development) {
          await this.directories.disconnect(input);
        } else {
          await this.store.remove(input);
        }
      });
      this.directoryCache.invalidate();
    });
  }

  /** Global code changes must clear every pinned workspace generation. */
  private async withWorkspacesDisabled<T>(
    input: { pluginId: string; digest: string },
    operation: () => Promise<T>
  ): Promise<T> {
    const directory = join(this.root, 'workspaces');
    const entries = existsSync(directory) ? await readdir(directory) : [];
    const snapshots: Array<{ path: string; enabled: Record<string, string> }> =
      [];
    // Preflight every state file before altering any of them.
    for (const name of entries.filter((entry) => entry.endsWith('.json'))) {
      const path = join(directory, name);
      const read = await readJsonOrEmpty(path, parseEnablement);
      if (read.kind === 'corrupt') {
        throw new PluginInstallError(
          'enablement-corrupt',
          `Workspace plugin state is unreadable; original retained at ${read.backupPath}.`
        );
      }
      if (read.kind === 'ok' && read.value[input.pluginId]) {
        snapshots.push({ path, enabled: read.value });
      }
    }
    const changed: typeof snapshots = [];
    try {
      for (const snapshot of snapshots) {
        await this.writeWorkspaceEnablement(snapshot.path, input.pluginId);
        changed.push(snapshot);
      }
      return await operation();
    } catch (error) {
      const current = (await this.store.listInstalled()).find(
        (entry) => entry.pluginId === input.pluginId
      );
      const development = (await this.directories.list()).find(
        (entry) => entry.pluginId === input.pluginId
      );
      if (
        (current?.digest === input.digest && existsSync(current.directory)) ||
        development?.digest === input.digest
      ) {
        for (const snapshot of changed) {
          await this.writeWorkspaceEnablement(
            snapshot.path,
            input.pluginId,
            snapshot.enabled[input.pluginId]
          );
        }
      }
      throw error;
    }
  }

  private async writeWorkspaceEnablement(
    path: string,
    pluginId: string,
    digest?: string
  ): Promise<void> {
    const next = (enablementWrites.get(path) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const read = await readJsonOrEmpty(path, parseEnablement);
        if (read.kind === 'corrupt') {
          throw new PluginInstallError(
            'enablement-corrupt',
            `Unreadable workspace state: ${read.backupPath}`
          );
        }
        const enabled = read.kind === 'ok' ? read.value : {};
        if (digest) {
          enabled[pluginId] = digest;
        } else {
          delete enabled[pluginId];
        }
        await atomicWrite(path, JSON.stringify({ schema: 2, enabled }));
      });
    enablementWrites.set(path, next);
    try {
      await next;
    } finally {
      if (enablementWrites.get(path) === next) {
        enablementWrites.delete(path);
      }
    }
  }

  async resolveRuntimePackage(
    summary: InstalledPluginSummary,
    force = false
  ): Promise<PluginDirectorySnapshot> {
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
      await this.resolveDevelopmentDirectory(record, force);
      return this.directoryCache.read(record.directory);
    }
    return (await this.resolveStoredPackage(summary, force)).snapshot;
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
    record: DevelopmentDirectoryRecord,
    force = false
  ): Promise<LoadedPluginDirectory> {
    await this.assertNoInstalledSource(record.pluginId);
    const loaded = (
      await this.directoryCache.read(record.directory, force)
    ).load();
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
    const migration = await pluginMigrationBackupSummary(
      this.workspacePath,
      record.pluginId
    );
    const base: InstalledPluginSummary = {
      development: true,
      digest: record.digest,
      enabled: (await this.readEnablement())[record.pluginId] === record.digest,
      installedAt: record.installedAt,
      ...(migration.count > 0 ? { migrationBackupCount: migration.count } : {}),
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
        permissionIdentity: `directory:${record.digest}:${loaded.manifest.publicKey ?? ''}:${loaded.manifest.author ?? ''}`,
        version: loaded.manifest.version,
        plugin: packageSummary(loaded.manifest, 'unsigned'),
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
    const migration = await pluginMigrationBackupSummary(
      this.workspacePath,
      installed.pluginId
    );
    const base = {
      ...baseSummary(installed),
      ...(migration.count > 0 ? { migrationBackupCount: migration.count } : {}),
    };
    try {
      const { loaded, installed: verified } = await this.resolveStoredPackage({
        pluginId: installed.pluginId,
        digest: installed.digest,
      });
      return {
        ...base,
        treeDigest: verified.treeDigest,
        permissionIdentity: installed.signature
          ? `key:${installed.signature.publicKey}`
          : `package:${installed.digest}`,
        enabled: await this.isEnabled(installed),
        name: loaded.manifest.name,
        plugin: packageSummary(
          loaded.manifest,
          installed.signature ? 'verified' : 'unsigned'
        ),
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

  private async resolveStoredPackage(
    input: {
      digest: string;
      pluginId: string;
    },
    force = false
  ): Promise<{
    installed: InstalledPluginPackage;
    loaded: LoadedPluginDirectory;
    snapshot: PluginDirectorySnapshot;
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
    const snapshot = await this.verifyStoredTree(installed, force);
    const loaded = snapshot.load();
    if (
      loaded.manifest.id !== installed.pluginId ||
      loaded.manifest.version !== installed.version
    ) {
      throw new PluginInstallError(
        'invalid-package',
        `Stored plugin metadata does not match its package: ${input.pluginId}`
      );
    }
    return { installed, loaded, snapshot };
  }

  /**
   * Installed packages are immutable once committed, so any change to their
   * files is tampering or corruption. Hashing the whole tree is too expensive
   * to repeat on every settings read. Metadata changes, explicit activation
   * and reload force fresh bytes; unchanged cache entries age out in 30s.
   */
  private async verifyStoredTree(
    installed: InstalledPluginPackage,
    force: boolean
  ): Promise<PluginDirectorySnapshot> {
    const snapshot = await this.directoryCache.read(installed.directory, force);
    const contents = snapshot.contents;
    const treeDigest = contents.digest;
    if (
      !installed.treeDigest ||
      (installed.treeDigest !== treeDigest &&
        installed.treeDigest === contents.legacyDigest)
    ) {
      await this.store.adoptTreeDigest({
        digest: installed.digest,
        previousTreeDigest: installed.treeDigest,
        pluginId: installed.pluginId,
        treeDigest,
      });
      installed.treeDigest = treeDigest;
      return snapshot;
    }
    if (treeDigest !== installed.treeDigest) {
      await this.quarantine(installed.pluginId);
      throw new PluginInstallError(
        'integrity',
        `Installed files for ${installed.pluginId} no longer match the package recorded at install. The plugin was disabled; reinstall it to continue.`
      );
    }
    return snapshot;
  }

  /**
   * Called by the host controller when the tree it read to build a generation
   * does not match the registry. Cached snapshots still check file metadata
   * on each lookup and force full byte verification before activation.
   */
  async reportIntegrityMismatch(input: {
    directory: string;
    pluginId: string;
  }): Promise<void> {
    this.directoryCache.invalidate(input.directory);
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
