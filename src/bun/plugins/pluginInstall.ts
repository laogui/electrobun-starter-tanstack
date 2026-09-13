import { existsSync } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  generatePluginInstallId,
  PLUGIN_INSTALL_ID_RE,
} from '../../shared/plugins/ids';
import {
  compareSemver,
  isPluginPublicKey,
  type PluginManifest,
} from '../../shared/plugins/manifest';
import { readJsonOrEmpty } from '../persistence/corruptFile';
import { readPluginContents } from './directoryContents';
import {
  type LoadedPluginDirectory,
  loadPluginDirectory,
  PluginDirectoryError,
} from './loadDirectory';
import {
  type VerifiedPluginSignature,
  verifyPluginDirectorySignature,
} from './pluginSignature';
import { downloadPluginZip, PluginDownloadError } from './urlInstall';
import { PluginZipError, unpackPluginZip } from './zipInstall';

export const PLUGIN_INSTALL_SCHEMA = 1;
export const PLUGIN_PACKAGE_DIGEST_RE = /^[a-f0-9]{64}$/;

const REGISTRY_NAME = 'registry.json';
const JOURNALS_DIR = 'journals';
const STAGING_DIR = 'staging';
const PACKAGES_DIR = 'packages';
const ZIP_NAME = 'package.zip';
const UNPACKED_DIR = 'unpacked';
const PENDING_STAGES = new Set(['ready-to-commit', 'committing']);
const UNCOMMITTED_STAGES = new Set([
  'acquiring',
  'inspecting',
  'staging',
  'ready-to-commit',
]);

export type PluginInstallStage =
  | 'acquiring'
  | 'inspecting'
  | 'staging'
  | 'ready-to-commit'
  | 'committing'
  | 'installed'
  | 'cancelled'
  | 'failed';

export type PluginInstallSource =
  | { kind: 'file'; name: string }
  | { kind: 'url'; origin: string; path: string }
  | { kind: 'zip' };

export type PluginInstallErrorCode =
  | 'already-installed'
  | 'author-key-changed'
  | 'digest-conflict'
  | 'download-failed'
  | 'enablement-corrupt'
  | 'integrity'
  | 'invalid-package'
  | 'invalid-state'
  | 'not-found'
  | 'pending-transaction'
  | 'registry-corrupt'
  | 'replaced'
  | 'rollback-unavailable'
  | 'signature-required'
  | 'update-source-changed';

export class PluginInstallError extends Error {
  code: PluginInstallErrorCode;

  constructor(code: PluginInstallErrorCode, message: string) {
    super(message);
    this.name = 'PluginInstallError';
    this.code = code;
  }
}

export interface PluginInstallJournal {
  createdAt: string;
  digest?: string;
  error?: { code: string; message: string };
  name?: string;
  pluginId?: string;
  pluginRoot?: string;
  schema: typeof PLUGIN_INSTALL_SCHEMA;
  signature?: VerifiedPluginSignature;
  source: PluginInstallSource;
  stage: PluginInstallStage;
  transactionId: string;
  updatedAt: string;
  version?: string;
}

export interface StoredPluginPackageVersion {
  digest: string;
  directory: string;
  installedAt: string;
  name: string;
  pluginId: string;
  signature?: VerifiedPluginSignature;
  source: PluginInstallSource;
  /**
   * Canonical digest of the installed file tree, recorded at commit. `digest`
   * covers the delivered zip; this covers what actually sits on disk, so
   * later edits to the installed files are detectable.
   */
  treeDigest?: string;
  version: string;
}

export interface InstalledPluginPackage extends StoredPluginPackageVersion {
  /** One verified code generation retained for explicit rollback. */
  previous?: StoredPluginPackageVersion;
}

export interface PreparedPluginInstall {
  digest: string;
  directory: string;
  journal: PluginInstallJournal;
  manifest: PluginManifest;
  pluginId: string;
  signature?: VerifiedPluginSignature;
  transactionId: string;
  version: string;
}

interface PluginRegistryFile {
  packages: InstalledPluginPackage[];
  schema: typeof PLUGIN_INSTALL_SCHEMA;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return toHex(new Uint8Array(digest));
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

async function writeJsonAtomic(
  filePath: string,
  value: unknown
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, filePath);
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

function wrapInstallError(error: unknown): PluginInstallError {
  if (error instanceof PluginInstallError) {
    return error;
  }
  if (error instanceof PluginDownloadError) {
    if (error.code === 'download-failed' || error.code === 'resource-limit') {
      return new PluginInstallError('download-failed', error.message);
    }
    return new PluginInstallError('invalid-package', error.message);
  }
  if (
    error instanceof PluginZipError ||
    error instanceof PluginDirectoryError
  ) {
    return new PluginInstallError('invalid-package', error.message);
  }
  return new PluginInstallError(
    'invalid-package',
    error instanceof Error ? error.message : 'plugin install failed'
  );
}

function parseSource(value: unknown): PluginInstallSource | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return;
  }
  if (value.kind === 'zip') {
    return { kind: 'zip' };
  }
  if (value.kind === 'file' && typeof value.name === 'string') {
    return { kind: 'file', name: value.name };
  }
  if (
    value.kind === 'url' &&
    typeof value.origin === 'string' &&
    typeof value.path === 'string'
  ) {
    return { kind: 'url', origin: value.origin, path: value.path };
  }
  return;
}

function parseVerifiedSignature(
  value: unknown
): VerifiedPluginSignature | undefined {
  if (
    !isRecord(value) ||
    typeof value.publicKey !== 'string' ||
    !isPluginPublicKey(value.publicKey) ||
    typeof value.treeSha256 !== 'string' ||
    !PLUGIN_PACKAGE_DIGEST_RE.test(value.treeSha256)
  ) {
    return;
  }
  if (value.updateUrl !== undefined && typeof value.updateUrl !== 'string') {
    return;
  }
  let updateUrl: string | undefined;
  if (typeof value.updateUrl === 'string') {
    try {
      const parsed = new URL(value.updateUrl);
      if (
        parsed.protocol !== 'https:' ||
        parsed.username.length > 0 ||
        parsed.password.length > 0 ||
        parsed.toString() !== value.updateUrl
      ) {
        return;
      }
      updateUrl = value.updateUrl;
    } catch {
      return;
    }
  }
  return {
    publicKey: value.publicKey,
    treeSha256: value.treeSha256,
    ...(updateUrl ? { updateUrl } : {}),
  };
}

function parseJournal(value: unknown): PluginInstallJournal | undefined {
  if (!isRecord(value) || value.schema !== PLUGIN_INSTALL_SCHEMA) {
    return;
  }
  if (
    typeof value.transactionId !== 'string' ||
    !PLUGIN_INSTALL_ID_RE.test(value.transactionId)
  ) {
    return;
  }
  if (typeof value.stage !== 'string' || typeof value.createdAt !== 'string') {
    return;
  }
  const source = parseSource(value.source);
  if (!source) {
    return;
  }
  const journal: PluginInstallJournal = {
    schema: PLUGIN_INSTALL_SCHEMA,
    transactionId: value.transactionId,
    stage: value.stage as PluginInstallStage,
    source,
    createdAt: value.createdAt,
    updatedAt:
      typeof value.updatedAt === 'string' ? value.updatedAt : value.createdAt,
  };
  if (typeof value.pluginId === 'string') {
    journal.pluginId = value.pluginId;
  }
  if (typeof value.version === 'string') {
    journal.version = value.version;
  }
  if (typeof value.digest === 'string') {
    journal.digest = value.digest;
  }
  if (typeof value.name === 'string') {
    journal.name = value.name;
  }
  if (typeof value.pluginRoot === 'string') {
    journal.pluginRoot = value.pluginRoot;
  }
  const signature = parseVerifiedSignature(value.signature);
  if (signature) {
    journal.signature = signature;
  }
  if (isRecord(value.error)) {
    journal.error = {
      code: String(value.error.code ?? 'failed'),
      message: String(value.error.message ?? ''),
    };
  }
  return journal;
}

/**
 * Structural check before entry-level parsing: a file that is not a registry
 * at all is corruption, not "no plugins installed".
 */
function requireRegistry(value: unknown): PluginRegistryFile {
  if (
    !isRecord(value) ||
    value.schema !== PLUGIN_INSTALL_SCHEMA ||
    !Array.isArray(value.packages)
  ) {
    throw new Error('registry.json does not match the registry schema');
  }
  return parseRegistry(value);
}

function parseStoredPackage(
  value: unknown
): StoredPluginPackageVersion | undefined {
  if (!isRecord(value)) {
    return;
  }
  const source = parseSource(value.source);
  if (
    !source ||
    typeof value.pluginId !== 'string' ||
    typeof value.version !== 'string' ||
    typeof value.digest !== 'string' ||
    !PLUGIN_PACKAGE_DIGEST_RE.test(value.digest) ||
    typeof value.directory !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.installedAt !== 'string'
  ) {
    return;
  }
  const parsed: StoredPluginPackageVersion = {
    pluginId: value.pluginId,
    version: value.version,
    digest: value.digest,
    directory: value.directory,
    name: value.name,
    source,
    installedAt: value.installedAt,
  };
  if (
    typeof value.treeDigest === 'string' &&
    PLUGIN_PACKAGE_DIGEST_RE.test(value.treeDigest)
  ) {
    parsed.treeDigest = value.treeDigest;
  }
  const signature = parseVerifiedSignature(value.signature);
  if (signature) {
    parsed.signature = signature;
  }
  return parsed;
}

function parseRegistry(value: unknown): PluginRegistryFile {
  if (!isRecord(value) || value.schema !== PLUGIN_INSTALL_SCHEMA) {
    return { schema: PLUGIN_INSTALL_SCHEMA, packages: [] };
  }
  if (!Array.isArray(value.packages)) {
    return { schema: PLUGIN_INSTALL_SCHEMA, packages: [] };
  }
  const packages: InstalledPluginPackage[] = [];
  for (const entry of value.packages) {
    const parsed = parseStoredPackage(entry);
    if (!parsed) {
      continue;
    }
    const previous = isRecord(entry)
      ? parseStoredPackage(entry.previous)
      : undefined;
    packages.push(parsed);
    if (previous && previous.pluginId === parsed.pluginId) {
      packages[packages.length - 1] = { ...parsed, previous };
    }
  }
  return { schema: PLUGIN_INSTALL_SCHEMA, packages };
}

function redactUrl(raw: string): PluginInstallSource {
  try {
    const parsed = new URL(raw);
    return { kind: 'url', origin: parsed.origin, path: parsed.pathname };
  } catch {
    return { kind: 'url', origin: '', path: '' };
  }
}

function currentVersionOnly(
  installed: InstalledPluginPackage
): StoredPluginPackageVersion {
  const { previous: _previous, ...current } = installed;
  return current;
}

export interface PluginRegistryDiagnostic {
  backupPath: string;
  message: string;
}

export class PluginInstallStore {
  private readonly rootDir: string;
  private tail: Promise<unknown> = Promise.resolve();
  private registryDiagnostic: PluginRegistryDiagnostic | undefined;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
  }

  /** Set while the last registry read hit damage, cleared by a clean read. */
  diagnostic(): PluginRegistryDiagnostic | undefined {
    return this.registryDiagnostic;
  }

  listInstalled(): Promise<InstalledPluginPackage[]> {
    return this.enqueue(async () => {
      try {
        return (await this.readRegistry()).packages;
      } catch (error) {
        if (
          error instanceof PluginInstallError &&
          error.code === 'registry-corrupt'
        ) {
          // Listing stays available so the UI can show the diagnostic; every
          // mutating path still throws.
          return [];
        }
        throw error;
      }
    });
  }

  getJournal(transactionId: string): Promise<PluginInstallJournal | undefined> {
    return this.enqueue(async () => this.readJournal(transactionId));
  }

  recover(): Promise<PluginInstallJournal[]> {
    return this.enqueue(async () => this.recoverLocked());
  }

  prepareFromZip(input: {
    source?: PluginInstallSource;
    zipBytes: Uint8Array;
  }): Promise<PreparedPluginInstall> {
    return this.enqueue(async () =>
      this.prepareFromZipLocked(input.zipBytes, input.source ?? { kind: 'zip' })
    );
  }

  prepareFromUrl(input: {
    allowLoopback?: boolean;
    url: string;
  }): Promise<PreparedPluginInstall> {
    return this.enqueue(async () => {
      const zipBytes = await downloadPluginZip(input.url, {
        allowLoopback: input.allowLoopback,
      });
      return this.prepareFromZipLocked(zipBytes, redactUrl(input.url));
    });
  }

  commit(transactionId: string): Promise<InstalledPluginPackage> {
    return this.enqueue(async () => this.commitLocked(transactionId));
  }

  cancel(transactionId: string): Promise<PluginInstallJournal> {
    return this.enqueue(async () => this.cancelLocked(transactionId));
  }

  rollback(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginPackage> {
    return this.enqueue(async () => this.rollbackLocked(input));
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private journalsDir(): string {
    return join(this.rootDir, JOURNALS_DIR);
  }

  private stagingDir(transactionId: string): string {
    return join(this.rootDir, STAGING_DIR, transactionId);
  }

  private journalPath(transactionId: string): string {
    return join(this.journalsDir(), `${transactionId}.json`);
  }

  private registryPath(): string {
    return join(this.rootDir, REGISTRY_NAME);
  }

  private packageDir(
    pluginId: string,
    version: string,
    digest: string
  ): string {
    return join(this.rootDir, PACKAGES_DIR, pluginId, version, digest);
  }

  private async readRegistry(): Promise<PluginRegistryFile> {
    const read = await readJsonOrEmpty(this.registryPath(), requireRegistry);
    if (read.kind === 'empty') {
      this.registryDiagnostic = undefined;
      return { schema: PLUGIN_INSTALL_SCHEMA, packages: [] };
    }
    if (read.kind === 'ok') {
      this.registryDiagnostic = undefined;
      return read.value;
    }
    // The damaged file is already preserved. `packages/` is the ground truth
    // for what is actually on disk; journals only supply the metadata the
    // directory layout does not carry.
    let rebuilt: PluginRegistryFile;
    try {
      rebuilt = await this.rebuildRegistryFromDisk();
    } catch (error) {
      this.registryDiagnostic = {
        backupPath: read.backupPath,
        message: `registry.json is unreadable and could not be rebuilt: ${(error as Error).message}`,
      };
      throw new PluginInstallError(
        'registry-corrupt',
        this.registryDiagnostic.message
      );
    }
    this.registryDiagnostic = {
      backupPath: read.backupPath,
      message: `registry.json was unreadable and was rebuilt from installed packages; the original is at ${read.backupPath}`,
    };
    if (!existsSync(read.backupPath)) {
      // Never overwrite the damaged file unless the copy really landed.
      throw new PluginInstallError(
        'registry-corrupt',
        'registry.json is unreadable and its backup is missing, so it was left untouched'
      );
    }
    await this.writeRegistry(rebuilt);
    return rebuilt;
  }

  /** Reconstructs registry entries from `packages/<id>/<version>/<digest>/`. */
  private async rebuildRegistryFromDisk(): Promise<PluginRegistryFile> {
    const journals = await this.listJournals();
    const packagesRoot = join(this.rootDir, PACKAGES_DIR);
    if (!existsSync(packagesRoot)) {
      return { schema: PLUGIN_INSTALL_SCHEMA, packages: [] };
    }
    const versionsByPlugin = new Map<string, StoredPluginPackageVersion[]>();
    for (const pluginId of await readdir(packagesRoot)) {
      const versionsRoot = join(packagesRoot, pluginId);
      for (const version of await readdir(versionsRoot).catch(() => [])) {
        const digestsRoot = join(versionsRoot, version);
        for (const digest of await readdir(digestsRoot).catch(() => [])) {
          if (!PLUGIN_PACKAGE_DIGEST_RE.test(digest)) {
            continue;
          }
          const directory = join(digestsRoot, digest);
          if (!existsSync(join(directory, 'manifest.json'))) {
            continue;
          }
          let loaded: LoadedPluginDirectory;
          let signature: VerifiedPluginSignature | undefined;
          try {
            loaded = await loadPluginDirectory(directory);
            if (
              loaded.manifest.id !== pluginId ||
              loaded.manifest.version !== version
            ) {
              continue;
            }
            signature = await verifyPluginDirectorySignature(
              directory,
              loaded.manifest
            );
          } catch {
            continue;
          }
          const journal = journals
            .filter(
              (entry) =>
                entry.pluginId === pluginId &&
                entry.version === version &&
                entry.digest === digest
            )
            .sort((left, right) =>
              left.updatedAt.localeCompare(right.updatedAt)
            )
            .at(-1);
          const candidate: StoredPluginPackageVersion = {
            pluginId: loaded.manifest.id,
            version: loaded.manifest.version,
            digest,
            directory,
            name: journal?.name ?? loaded.manifest.name,
            source: journal?.source ?? { kind: 'zip' },
            ...(signature ? { signature } : {}),
            installedAt: journal?.updatedAt ?? new Date(0).toISOString(),
          };
          const candidates = versionsByPlugin.get(candidate.pluginId) ?? [];
          candidates.push(candidate);
          versionsByPlugin.set(candidate.pluginId, candidates);
        }
      }
    }
    return {
      schema: PLUGIN_INSTALL_SCHEMA,
      packages: [...versionsByPlugin.values()].map((candidates) => {
        candidates.sort((left, right) => {
          const installedOrder = right.installedAt.localeCompare(
            left.installedAt
          );
          return installedOrder !== 0
            ? installedOrder
            : compareSemver(right.version, left.version);
        });
        const [current, previous] = candidates;
        if (!current) {
          throw new Error('installed package candidate disappeared');
        }
        return previous ? { ...current, previous } : current;
      }),
    };
  }

  private async writeRegistry(registry: PluginRegistryFile): Promise<void> {
    await writeJsonAtomic(this.registryPath(), registry);
  }

  private async readJournal(
    transactionId: string
  ): Promise<PluginInstallJournal | undefined> {
    if (!PLUGIN_INSTALL_ID_RE.test(transactionId)) {
      return;
    }
    const path = this.journalPath(transactionId);
    if (!existsSync(path)) {
      return;
    }
    try {
      return parseJournal(await readJson(path));
    } catch {
      return;
    }
  }

  private async writeJournal(journal: PluginInstallJournal): Promise<void> {
    const next: PluginInstallJournal = { ...journal, updatedAt: nowIso() };
    await writeJsonAtomic(this.journalPath(journal.transactionId), next);
  }

  private async listJournals(): Promise<PluginInstallJournal[]> {
    const dir = this.journalsDir();
    if (!existsSync(dir)) {
      return [];
    }
    const names = await readdir(dir);
    const journals: PluginInstallJournal[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) {
        continue;
      }
      const journal = await this.readJournal(name.slice(0, -5));
      if (journal) {
        journals.push(journal);
      }
    }
    return journals;
  }

  private async removeStaging(transactionId: string): Promise<void> {
    await rm(this.stagingDir(transactionId), {
      force: true,
      recursive: true,
    });
  }

  private async failLocked(
    journal: PluginInstallJournal,
    error: PluginInstallError
  ): Promise<void> {
    await this.writeJournal({
      ...journal,
      stage: 'failed',
      error: { code: error.code, message: error.message },
    });
    await this.removeStaging(journal.transactionId);
  }

  private findPending(
    journals: PluginInstallJournal[],
    pluginId: string,
    except?: string
  ): PluginInstallJournal | undefined {
    return journals.find(
      (journal) =>
        journal.pluginId === pluginId &&
        journal.transactionId !== except &&
        PENDING_STAGES.has(journal.stage)
    );
  }

  private assertUpdateAllowed(
    installed: InstalledPluginPackage,
    manifest: PluginManifest,
    signature: VerifiedPluginSignature | undefined
  ): void {
    if (!installed.signature) {
      throw new PluginInstallError(
        'signature-required',
        `Unsigned plugin ${manifest.id} cannot be updated in place; publish signed releases under a new plugin ID.`
      );
    }
    if (!signature) {
      throw new PluginInstallError(
        'signature-required',
        `Plugin update ${manifest.id}@${manifest.version} must be signed by the trusted author key.`
      );
    }
    if (signature.publicKey !== installed.signature.publicKey) {
      throw new PluginInstallError(
        'author-key-changed',
        `Plugin update rejected because the author key changed for ${manifest.id}. Install it under a new plugin ID.`
      );
    }
    if (signature.updateUrl !== installed.signature.updateUrl) {
      throw new PluginInstallError(
        'update-source-changed',
        `Plugin update rejected because update.url changed for ${manifest.id}.`
      );
    }
    if (compareSemver(manifest.version, installed.version) <= 0) {
      throw new PluginInstallError(
        'invalid-state',
        `Plugin update must advance ${manifest.id} beyond ${installed.version}.`
      );
    }
  }

  private async prepareFromZipLocked(
    zipBytes: Uint8Array,
    source: PluginInstallSource
  ): Promise<PreparedPluginInstall> {
    const transactionId = generatePluginInstallId();
    const createdAt = nowIso();
    let journal: PluginInstallJournal = {
      schema: PLUGIN_INSTALL_SCHEMA,
      transactionId,
      stage: 'acquiring',
      source,
      createdAt,
      updatedAt: createdAt,
    };
    const staging = this.stagingDir(transactionId);
    const unpacked = join(staging, UNPACKED_DIR);
    await mkdir(unpacked, { recursive: true });
    await this.writeJournal(journal);
    try {
      const zipPath = join(staging, ZIP_NAME);
      await writeFile(zipPath, zipBytes);
      const digest = await sha256Hex(zipBytes);
      journal = {
        ...journal,
        stage: 'inspecting',
        digest,
      };
      await this.writeJournal(journal);
      const unpackedRoot = await unpackPluginZip(zipBytes, unpacked);
      const loaded = await loadPluginDirectory(unpackedRoot.pluginRoot);
      const signature = await verifyPluginDirectorySignature(
        loaded.directory,
        loaded.manifest
      );
      const pluginRoot = toPosix(relative(staging, loaded.directory));
      if (
        pluginRoot.length === 0 ||
        pluginRoot.startsWith('..') ||
        pluginRoot.startsWith('/')
      ) {
        throw new PluginInstallError(
          'invalid-package',
          'unpacked plugin root is outside staging'
        );
      }
      journal = {
        ...journal,
        stage: 'staging',
        pluginId: loaded.manifest.id,
        version: loaded.manifest.version,
        name: loaded.manifest.name,
        pluginRoot,
        digest,
        ...(signature ? { signature } : {}),
      };
      await this.writeJournal(journal);
      const registry = await this.readRegistry();
      const sameIdentity = registry.packages.find(
        (entry) =>
          entry.pluginId === loaded.manifest.id &&
          entry.version === loaded.manifest.version
      );
      if (sameIdentity?.digest === digest) {
        throw new PluginInstallError(
          'already-installed',
          `${loaded.manifest.id}@${loaded.manifest.version} is already installed`
        );
      }
      if (sameIdentity) {
        throw new PluginInstallError(
          'digest-conflict',
          `${loaded.manifest.id}@${loaded.manifest.version} is already installed with a different digest`
        );
      }
      const installed = registry.packages.find(
        (entry) => entry.pluginId === loaded.manifest.id
      );
      if (installed) {
        this.assertUpdateAllowed(installed, loaded.manifest, signature);
      }
      const pending = this.findPending(
        await this.listJournals(),
        loaded.manifest.id,
        transactionId
      );
      if (pending) {
        if (
          pending.digest === digest &&
          pending.pluginRoot &&
          pending.version === loaded.manifest.version
        ) {
          const existingStaging = this.stagingDir(pending.transactionId);
          const existingDirectory = resolve(
            existingStaging,
            pending.pluginRoot
          );
          const existingRelative = relative(existingStaging, existingDirectory);
          if (
            existingRelative &&
            !existingRelative.startsWith('..') &&
            !isAbsolute(existingRelative)
          ) {
            try {
              const existing = await loadPluginDirectory(existingDirectory);
              await this.removeStaging(transactionId);
              await this.writeJournal({ ...journal, stage: 'cancelled' });
              return {
                transactionId: pending.transactionId,
                pluginId: existing.manifest.id,
                version: existing.manifest.version,
                digest,
                directory: existing.directory,
                manifest: existing.manifest,
                ...(pending.signature ? { signature: pending.signature } : {}),
                journal: pending,
              };
            } catch {
              // Fall through to the normal pending-transaction error when
              // the existing staged package is no longer readable.
            }
          }
        }
        throw new PluginInstallError(
          'pending-transaction',
          `plugin ${loaded.manifest.id} already has a pending install ${pending.transactionId}`
        );
      }
      journal = { ...journal, stage: 'ready-to-commit' };
      await this.writeJournal(journal);
      return {
        transactionId,
        pluginId: loaded.manifest.id,
        version: loaded.manifest.version,
        digest,
        directory: loaded.directory,
        manifest: loaded.manifest,
        ...(signature ? { signature } : {}),
        journal,
      };
    } catch (error) {
      const wrapped = wrapInstallError(error);
      await this.failLocked(journal, wrapped);
      throw wrapped;
    }
  }

  private async commitLocked(
    transactionId: string
  ): Promise<InstalledPluginPackage> {
    const journal = await this.readJournal(transactionId);
    if (!journal) {
      throw new PluginInstallError(
        'not-found',
        `install transaction not found: ${transactionId}`
      );
    }
    if (journal.stage === 'installed') {
      return this.requireInstalled(journal);
    }
    if (journal.stage !== 'ready-to-commit' && journal.stage !== 'committing') {
      throw new PluginInstallError(
        'invalid-state',
        `install ${transactionId} cannot be committed from ${journal.stage}`
      );
    }
    return this.finishCommit(journal);
  }

  private async requireInstalled(
    journal: PluginInstallJournal
  ): Promise<InstalledPluginPackage> {
    const registry = await this.readRegistry();
    const found = registry.packages.find(
      (entry) =>
        entry.pluginId === journal.pluginId &&
        entry.version === journal.version &&
        entry.digest === journal.digest
    );
    if (found) {
      return found;
    }
    return this.finishCommit({ ...journal, stage: 'committing' });
  }

  private async finishCommit(
    journal: PluginInstallJournal
  ): Promise<InstalledPluginPackage> {
    const pluginId = journal.pluginId;
    const version = journal.version;
    const digest = journal.digest;
    const pluginRoot = journal.pluginRoot;
    if (
      !(
        pluginId &&
        version &&
        digest &&
        PLUGIN_PACKAGE_DIGEST_RE.test(digest) &&
        pluginRoot
      )
    ) {
      throw new PluginInstallError(
        'invalid-state',
        'install journal is missing package identity'
      );
    }
    const staging = this.stagingDir(journal.transactionId);
    const zipPath = join(staging, ZIP_NAME);
    if (existsSync(zipPath)) {
      const currentDigest = await sha256Hex(
        Uint8Array.from(await readFile(zipPath))
      );
      if (currentDigest !== digest) {
        const error = new PluginInstallError(
          'replaced',
          'staged zip changed before commit'
        );
        await this.failLocked(journal, error);
        throw error;
      }
    }
    await this.writeJournal({ ...journal, stage: 'committing' });
    const dest = this.packageDir(pluginId, version, digest);
    const sourceDir = resolve(staging, ...pluginRoot.split('/'));
    const sourceRelative = relative(staging, sourceDir);
    if (
      !sourceRelative ||
      sourceRelative.startsWith('..') ||
      isAbsolute(sourceRelative)
    ) {
      throw new PluginInstallError(
        'invalid-package',
        'staged plugin root is outside staging'
      );
    }
    let loaded: LoadedPluginDirectory;
    let signature: VerifiedPluginSignature | undefined;
    try {
      loaded = await loadPluginDirectory(existsSync(dest) ? dest : sourceDir);
      if (
        loaded.manifest.id !== pluginId ||
        loaded.manifest.version !== version
      ) {
        throw new PluginInstallError(
          'replaced',
          'staged manifest no longer matches the reviewed package'
        );
      }
      signature = await verifyPluginDirectorySignature(
        loaded.directory,
        loaded.manifest
      );
      if (JSON.stringify(signature) !== JSON.stringify(journal.signature)) {
        throw new PluginInstallError(
          'replaced',
          'staged plugin signature identity changed before commit'
        );
      }
    } catch (error) {
      const wrapped =
        error instanceof PluginInstallError
          ? error
          : new PluginInstallError(
              'replaced',
              error instanceof Error
                ? `staged plugin changed before commit: ${error.message}`
                : 'staged plugin changed before commit'
            );
      await this.failLocked(journal, wrapped);
      throw wrapped;
    }
    const existing = (await this.readRegistry()).packages.find(
      (entry) => entry.pluginId === pluginId && entry.digest !== digest
    );
    if (existing) {
      try {
        this.assertUpdateAllowed(existing, loaded.manifest, signature);
      } catch (error) {
        const wrapped = wrapInstallError(error);
        await this.failLocked(journal, wrapped);
        throw wrapped;
      }
    }
    if (!existsSync(dest)) {
      if (!existsSync(sourceDir)) {
        const error = new PluginInstallError(
          'invalid-state',
          'staged plugin files are missing'
        );
        await this.failLocked(journal, error);
        throw error;
      }
      await mkdir(dirname(dest), { recursive: true });
      await rename(sourceDir, dest);
    }
    const installed: InstalledPluginPackage = {
      pluginId,
      version,
      digest,
      directory: dest,
      name: journal.name ?? pluginId,
      source: journal.source,
      ...(signature ? { signature } : {}),
      installedAt: nowIso(),
      treeDigest: (await readPluginContents(dest)).digest,
      ...(existing ? { previous: currentVersionOnly(existing) } : {}),
    };
    await this.upsertRegistry(installed);
    await this.writeJournal({ ...journal, stage: 'installed' });
    await this.removeStaging(journal.transactionId);
    return installed;
  }

  /**
   * Adopts the tree digest of a package installed before this field existed,
   * or rebuilt from disk. Trust on first use: there is nothing older to
   * compare against, so the goal is only to detect later edits.
   */
  adoptTreeDigest(input: {
    digest: string;
    pluginId: string;
    treeDigest: string;
  }): Promise<void> {
    return this.enqueue(async () => {
      const registry = await this.readRegistry();
      let changed = false;
      const packages = registry.packages.map((entry) => {
        if (
          entry.pluginId !== input.pluginId ||
          entry.digest !== input.digest ||
          entry.treeDigest
        ) {
          return entry;
        }
        changed = true;
        return { ...entry, treeDigest: input.treeDigest };
      });
      if (changed) {
        await this.writeRegistry({ schema: PLUGIN_INSTALL_SCHEMA, packages });
      }
    });
  }

  private async upsertRegistry(
    installed: InstalledPluginPackage
  ): Promise<void> {
    const registry = await this.readRegistry();
    const current = registry.packages.find(
      (entry) => entry.pluginId === installed.pluginId
    );
    const next =
      current && current.digest !== installed.digest
        ? { ...installed, previous: currentVersionOnly(current) }
        : current?.previous
          ? { ...installed, previous: current.previous }
          : installed;
    const packages = registry.packages.filter(
      (entry) => entry.pluginId !== installed.pluginId
    );
    packages.push(next);
    await this.writeRegistry({ schema: PLUGIN_INSTALL_SCHEMA, packages });
  }

  private async rollbackLocked(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginPackage> {
    const registry = await this.readRegistry();
    const current = registry.packages.find(
      (entry) =>
        entry.pluginId === input.pluginId && entry.digest === input.digest
    );
    if (!current?.previous) {
      throw new PluginInstallError(
        'rollback-unavailable',
        `No previous code version is available for ${input.pluginId}.`
      );
    }
    const previous = current.previous;
    if (
      !(current.signature && previous.signature) ||
      current.signature.publicKey !== previous.signature.publicKey ||
      current.signature.updateUrl !== previous.signature.updateUrl
    ) {
      throw new PluginInstallError(
        'rollback-unavailable',
        `The retained version of ${input.pluginId} does not match the trusted author identity.`
      );
    }
    let loaded: LoadedPluginDirectory;
    let signature: VerifiedPluginSignature | undefined;
    try {
      loaded = await loadPluginDirectory(previous.directory);
      signature = await verifyPluginDirectorySignature(
        previous.directory,
        loaded.manifest
      );
    } catch (error) {
      throw new PluginInstallError(
        'integrity',
        `The retained version of ${input.pluginId} could not be verified: ${(error as Error).message}`
      );
    }
    if (
      loaded.manifest.id !== previous.pluginId ||
      loaded.manifest.version !== previous.version ||
      JSON.stringify(signature) !== JSON.stringify(previous.signature)
    ) {
      throw new PluginInstallError(
        'integrity',
        `The retained version of ${input.pluginId} no longer matches its recorded identity.`
      );
    }
    const treeDigest = (await readPluginContents(previous.directory)).digest;
    if (previous.treeDigest && previous.treeDigest !== treeDigest) {
      throw new PluginInstallError(
        'integrity',
        `The retained version of ${input.pluginId} was changed after installation.`
      );
    }
    const restored: InstalledPluginPackage = {
      ...previous,
      treeDigest,
      installedAt: nowIso(),
    };
    await this.writeRegistry({
      schema: PLUGIN_INSTALL_SCHEMA,
      packages: registry.packages.map((entry) =>
        entry.pluginId === input.pluginId ? restored : entry
      ),
    });
    return restored;
  }

  private async cancelLocked(
    transactionId: string
  ): Promise<PluginInstallJournal> {
    const journal = await this.readJournal(transactionId);
    if (!journal) {
      throw new PluginInstallError(
        'not-found',
        `install transaction not found: ${transactionId}`
      );
    }
    if (journal.stage === 'installed' || journal.stage === 'committing') {
      throw new PluginInstallError(
        'invalid-state',
        `install ${transactionId} cannot be cancelled from ${journal.stage}`
      );
    }
    if (journal.stage === 'cancelled') {
      await this.removeStaging(transactionId);
      return journal;
    }
    const next: PluginInstallJournal = { ...journal, stage: 'cancelled' };
    await this.writeJournal(next);
    await this.removeStaging(transactionId);
    return { ...next, updatedAt: nowIso() };
  }

  private async recoverLocked(): Promise<PluginInstallJournal[]> {
    await mkdir(this.journalsDir(), { recursive: true });
    await mkdir(join(this.rootDir, PACKAGES_DIR), { recursive: true });
    await mkdir(join(this.rootDir, STAGING_DIR), { recursive: true });
    const journals = (await this.listJournals()).sort((left, right) =>
      left.updatedAt.localeCompare(right.updatedAt)
    );
    for (const journal of journals) {
      if (journal.stage === 'installed') {
        await this.removeStaging(journal.transactionId);
        const registry = await this.readRegistry();
        if (
          journal.pluginId &&
          journal.version &&
          journal.digest &&
          PLUGIN_PACKAGE_DIGEST_RE.test(journal.digest) &&
          existsSync(
            this.packageDir(journal.pluginId, journal.version, journal.digest)
          ) &&
          !registry.packages.some(
            (entry) => entry.pluginId === journal.pluginId
          )
        ) {
          await this.upsertRegistry({
            pluginId: journal.pluginId,
            version: journal.version,
            digest: journal.digest,
            directory: this.packageDir(
              journal.pluginId,
              journal.version,
              journal.digest
            ),
            name: journal.name ?? journal.pluginId,
            source: journal.source,
            ...(journal.signature ? { signature: journal.signature } : {}),
            installedAt: journal.updatedAt,
          });
        }
        continue;
      }
      if (journal.stage === 'committing') {
        try {
          await this.finishCommit(journal);
        } catch (error) {
          if (!(error instanceof PluginInstallError)) {
            throw error;
          }
        }
        continue;
      }
      if (UNCOMMITTED_STAGES.has(journal.stage)) {
        await this.writeJournal({ ...journal, stage: 'cancelled' });
        await this.removeStaging(journal.transactionId);
      } else {
        await this.removeStaging(journal.transactionId);
      }
    }
    if (existsSync(join(this.rootDir, STAGING_DIR))) {
      const leftover = await readdir(join(this.rootDir, STAGING_DIR));
      for (const name of leftover) {
        const journal = await this.readJournal(name);
        if (!(journal && PENDING_STAGES.has(journal.stage))) {
          await rm(join(this.rootDir, STAGING_DIR, name), {
            force: true,
            recursive: true,
          });
        }
      }
    }
    return this.listJournals();
  }
}
