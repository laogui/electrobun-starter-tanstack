import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { atomicWrite } from './atomicWrite';
import { rotateBackup } from './persistence/backupFile';
import { readJsonOrEmpty } from './persistence/corruptFile';
import { assertInside, normalizeManifestPath } from './workspacePaths';

export interface ManifestNode {
  data: Record<string, unknown>;
  extent?: string;
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  style?: Record<string, unknown>;
  type: string;
}

/**
 * Persisted edge record.
 *
 * `data` is the canonical home for edge fields (`label`, `animated`,
 * `pathType`, `color`, and `kind` for host-owned Topic tree relations). It is
 * typed as an open record so unknown keys written by a newer build survive a
 * load/save round-trip untouched.
 *
 * Top-level `label` / `animated` are historical compatibility fields still
 * present in templates and older manifests. Readers must resolve both through
 * `resolveEdgeFields` (src/shared/canvasEdgeFields.ts) so rendering, search and
 * export agree on which value wins.
 */
export interface ManifestEdge {
  animated?: boolean;
  data?: Record<string, unknown>;
  id: string;
  label?: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
  type?: string;
}

export interface CanvasManifest {
  edges: ManifestEdge[];
  nodes: ManifestNode[];
  schema: 'ghostboard-canvas/v1';
  viewId: string;
  viewport?: { x: number; y: number; zoom: number };
}

/**
 * Resolve a workspace.json `file` / `trashFile` to an absolute path under
 * `.ghostboard/views/` or `.ghostboard/trash/`. Rejects absolute paths,
 * `..` segments, and any other prefix so a crafted workspace config cannot
 * read or write outside the canvas manifests.
 */
export function resolveWorkspaceManifestPath(
  wsPath: string,
  viewFile: string
): string {
  if (!viewFile.trim()) {
    throw new Error('Manifest path is required.');
  }
  if (isAbsolute(viewFile)) {
    throw new Error('Manifest path must be relative.');
  }

  const relativePath = normalizeManifestPath(viewFile);
  const inViews =
    relativePath.startsWith('views/') && relativePath !== 'views/';
  const inTrash =
    relativePath.startsWith('trash/') && relativePath !== 'trash/';
  if (
    !(inViews || inTrash) ||
    relativePath.split('/').includes('..') ||
    relativePath.split('/').includes('')
  ) {
    throw new Error('Manifest path must stay inside views/ or trash/.');
  }

  return assertInside(
    resolve(wsPath, '.ghostboard'),
    relativePath,
    'Manifest path escapes .ghostboard/.'
  );
}

export type ManifestRead =
  | { kind: 'ok'; manifest: CanvasManifest }
  | { kind: 'missing' }
  | { error: Error; kind: 'invalid-path' }
  | {
      /** Copy of the unreadable bytes, kept next to the manifest. */
      backupPath: string;
      error: Error;
      kind: 'corrupt';
      /** A usable manifest restored from a backup, when one parsed. */
      recovered?: { from: string; manifest: CanvasManifest };
    };

/**
 * Thrown by `loadManifest` when a manifest is damaged and no backup could be
 * used. Callers that delete data based on manifest references must stop.
 */
export class ManifestCorruptError extends Error {
  readonly backupPath: string;
  readonly viewFile: string;

  constructor(viewFile: string, backupPath: string, cause: Error) {
    super(
      `Canvas manifest ${viewFile} is corrupt or unreadable; a copy was kept at ${backupPath}.`,
      { cause }
    );
    this.name = 'ManifestCorruptError';
    this.backupPath = backupPath;
    this.viewFile = viewFile;
  }
}

/**
 * Recovery approvals are bound to the exact damaged bytes and backup shown.
 * Merely reading a canvas never grants permission to replace damaged data.
 */
const recoveryTickets = new Map<
  string,
  { token: string; fingerprint: string; authorized: boolean }
>();
async function recoveryFingerprint(
  wsPath: string,
  viewFile: string
): Promise<string> {
  const damaged = await readFile(
    resolveWorkspaceManifestPath(wsPath, viewFile)
  );
  const backup = await readFile(
    resolveWorkspaceManifestPath(wsPath, manifestBackupViewFile(viewFile))
  );
  return createHash('sha256')
    .update(damaged.toString('base64'))
    .update('\0')
    .update(backup.toString('base64'))
    .digest('hex');
}
async function issueRecoveryTicket(
  wsPath: string,
  viewFile: string,
  originalPath: string,
  expectedBackup: CanvasManifest
): Promise<string> {
  const path = resolveWorkspaceManifestPath(wsPath, viewFile);
  const damaged = await readFile(originalPath);
  const backup = await readFile(
    resolveWorkspaceManifestPath(wsPath, manifestBackupViewFile(viewFile))
  );
  if (
    JSON.stringify(parseCanvasManifest(JSON.parse(backup.toString('utf8')))) !==
    JSON.stringify(expectedBackup)
  ) {
    throw new Error('Recovery backup changed while loading.');
  }
  const fingerprint = createHash('sha256')
    .update(damaged.toString('base64'))
    .update('\0')
    .update(backup.toString('base64'))
    .digest('hex');
  let ticket = recoveryTickets.get(path);
  if (!ticket || ticket.fingerprint !== fingerprint) {
    ticket = { token: randomUUID(), fingerprint, authorized: false };
    recoveryTickets.set(path, ticket);
  }
  return ticket.token;
}
export async function authorizeManifestRecovery(
  wsPath: string,
  viewFile: string,
  token: string
): Promise<void> {
  const path = resolveWorkspaceManifestPath(wsPath, viewFile);
  const ticket = recoveryTickets.get(path);
  if (
    !ticket ||
    ticket.token !== token ||
    ticket.fingerprint !== (await recoveryFingerprint(wsPath, viewFile))
  ) {
    throw new Error(
      'Recovery source changed; reload and review the backup again.'
    );
  }
  ticket.authorized = true;
}

/** Test helper: forget which manifests were read or recovered. */
export function resetManifestStateForTests(): void {
  recoveryTickets.clear();
}

/** Rolling copy of the previous on-disk manifest, refreshed on every save. */
export function manifestBackupViewFile(viewFile: string): string {
  return `${viewFile}.bak`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const manifestIssues = new WeakMap<CanvasManifest, string[]>();
export function getManifestIssues(manifest: CanvasManifest): string[] {
  return manifestIssues.get(manifest) ?? [];
}
function isPersistedManifestNode(value: unknown): value is ManifestNode {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.type !== 'string' ||
    !value.type ||
    !isRecord(value.data) ||
    !isRecord(value.position)
  ) {
    return false;
  }
  return (
    typeof value.position.x === 'number' &&
    Number.isFinite(value.position.x) &&
    typeof value.position.y === 'number' &&
    Number.isFinite(value.position.y)
  );
}
function isPersistedManifestEdge(value: unknown): value is ManifestEdge {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    Boolean(value.id) &&
    typeof value.source === 'string' &&
    typeof value.target === 'string'
  );
}
async function preserveManifestIssues(
  wsPath: string,
  viewFile: string,
  manifest: CanvasManifest
): Promise<string | undefined> {
  if (!getManifestIssues(manifest).length) {
    return;
  }
  const path = resolveWorkspaceManifestPath(wsPath, viewFile);
  const raw = await readFile(path, 'utf8');
  const evidence = `${path}.damaged-${createHash('sha256').update(raw).digest('hex').slice(0, 16)}.json`;
  if (!existsSync(evidence)) {
    await atomicWrite(evidence, raw);
  }
  return evidence;
}

/**
 * Same boundary for the manifest envelope: `schema` / `viewId` are not
 * required on load (older trash payloads were written as `{}`).
 */
function hasManifestArrays(
  value: Record<string, unknown>
): value is Record<string, unknown> & CanvasManifest {
  return Array.isArray(value.nodes) && Array.isArray(value.edges);
}

/**
 * Structural check for a manifest read from disk. Missing `nodes` / `edges`
 * default to empty (older trash payloads were written as `{}`), but a value
 * that is not an object, or arrays of the wrong type, count as corruption.
 */
export function parseCanvasManifest(value: unknown): CanvasManifest {
  if (!isRecord(value)) {
    throw new Error('Manifest is not a JSON object.');
  }
  const nodes = value.nodes ?? [];
  const edges = value.edges ?? [];
  if (!(Array.isArray(nodes) && Array.isArray(edges))) {
    throw new Error('Manifest nodes/edges must be arrays.');
  }
  const issues: string[] = [];
  const ids = new Set<string>();
  const cleanedNodes: ManifestNode[] = [];
  for (const [index, node] of nodes.entries()) {
    if (!isPersistedManifestNode(node) || ids.has(node.id)) {
      issues.push(`nodes[${index}]: invalid or duplicate node`);
      continue;
    }
    ids.add(node.id);
    let next = node;
    if (node.type === 'folder' && node.data.children !== undefined) {
      const raw = node.data.children;
      const childIds = new Set<string>();
      const children: unknown[] = [];
      if (Array.isArray(raw)) {
        for (const [childIndex, child] of raw.entries()) {
          if (
            !isRecord(child) ||
            typeof child.id !== 'string' ||
            !child.id ||
            childIds.has(child.id) ||
            (child.type !== undefined && typeof child.type !== 'string') ||
            (child.data !== undefined && !isRecord(child.data))
          ) {
            issues.push(
              `nodes[${index}].children[${childIndex}]: invalid or duplicate child`
            );
            continue;
          }
          childIds.add(child.id);
          if (child.data === undefined || !child.type) {
            issues.push(
              `nodes[${index}].children[${childIndex}]: normalized legacy child`
            );
            const { id: _id, type: _type, size: _size, ...legacyData } = child;
            children.push({
              ...child,
              type: child.type || 'card',
              data: child.data ?? legacyData,
            });
          } else {
            children.push(child);
          }
        }
      } else {
        issues.push(`nodes[${index}].children: expected array`);
      }
      next = { ...node, data: { ...node.data, children } };
    }
    cleanedNodes.push(next);
  }
  const edgeIds = new Set<string>();
  const cleanedEdges = edges.filter((edge, index): edge is ManifestEdge => {
    if (
      !isPersistedManifestEdge(edge) ||
      edgeIds.has(edge.id) ||
      !ids.has(edge.source) ||
      !ids.has(edge.target)
    ) {
      issues.push(`edges[${index}]: invalid, duplicate or missing endpoint`);
      return false;
    }
    edgeIds.add(edge.id);
    return true;
  });
  const manifest = { ...value, nodes: cleanedNodes, edges: cleanedEdges };
  if (!hasManifestArrays(manifest)) {
    throw new Error('Manifest nodes/edges must be arrays.');
  }
  manifestIssues.set(manifest, issues);
  return manifest;
}

/**
 * Only the rolling `.bak` takes part in automatic recovery. `.pre-topic` is a
 * one-off snapshot that can be months old; silently loading it (and letting
 * autosave cement it) would quietly roll the canvas back, so it is left for an
 * explicit manual restore.
 */
async function readBackupManifest(
  wsPath: string,
  viewFile: string
): Promise<{ from: string; manifest: CanvasManifest } | undefined> {
  for (const candidate of [manifestBackupViewFile(viewFile)]) {
    let path: string;
    try {
      path = resolveWorkspaceManifestPath(wsPath, candidate);
    } catch {
      continue;
    }
    try {
      const manifest = parseCanvasManifest(
        JSON.parse(await readFile(path, 'utf8')) as unknown
      );
      return { from: candidate, manifest };
    } catch {
      // Missing or also damaged; try the next backup.
    }
  }
  return;
}

/**
 * Read a canvas manifest and say exactly what happened. A damaged file is
 * copied aside to `<file>.corrupt-<timestamp>` (never overwritten) and the
 * rolling `.bak` backup is tried for a usable copy.
 *
 * Reading a usable backup does not authorize replacement; approval is explicit.
 */
export async function readManifest(
  wsPath: string,
  viewFile: string
): Promise<ManifestRead> {
  let filePath: string;
  try {
    filePath = resolveWorkspaceManifestPath(wsPath, viewFile);
  } catch (error) {
    return {
      kind: 'invalid-path',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
  const read = await readJsonOrEmpty(filePath, parseCanvasManifest);
  if (read.kind === 'empty') {
    return { kind: 'missing' };
  }
  if (read.kind === 'ok') {
    await preserveManifestIssues(wsPath, viewFile, read.value);
    recoveryTickets.delete(filePath);
    return { kind: 'ok', manifest: read.value };
  }
  console.warn(
    `[manifest] ${viewFile} is corrupt (${read.error.message}); preserved at ${read.backupPath}`
  );
  const recovered = await readBackupManifest(wsPath, viewFile);

  return {
    kind: 'corrupt',
    backupPath: read.backupPath,
    error: read.error,
    ...(recovered ? { recovered } : {}),
  };
}

export interface LoadedManifest {
  manifest: CanvasManifest;
  /**
   * Set when the manifest on disk was unreadable and this is the content of
   * a backup. The damaged bytes are kept at `backupPath`.
   */
  recovered?: { backupPath: string; from: string; token: string };
}

/**
 * Load a canvas manifest for display, saying whether it came from a backup.
 * Returns null when the file doesn't exist (or the path is refused). A
 * corrupt manifest falls back to its `.bak`; with no usable backup it throws
 * `ManifestCorruptError` instead of pretending the canvas is empty, so
 * nothing overwrites it.
 */
export async function loadManifestDetailed(
  wsPath: string,
  viewFile: string
): Promise<LoadedManifest | null> {
  const read = await readManifest(wsPath, viewFile);
  switch (read.kind) {
    case 'ok':
      return { manifest: read.manifest };
    case 'missing':
      return null;
    case 'invalid-path':
      console.warn(
        `[manifest] Refused to load ${viewFile}: ${read.error.message}`
      );
      return null;
    default:
      if (read.recovered) {
        console.warn(
          `[manifest] Recovered ${viewFile} from ${read.recovered.from}`
        );
        return {
          manifest: read.recovered.manifest,
          recovered: {
            backupPath: read.backupPath,
            from: read.recovered.from,
            token: await issueRecoveryTicket(
              wsPath,
              viewFile,
              read.backupPath,
              read.recovered.manifest
            ),
          },
        };
      }
      throw new ManifestCorruptError(viewFile, read.backupPath, read.error);
  }
}

/** `loadManifestDetailed` without the recovery details. */
export async function loadManifest(
  wsPath: string,
  viewFile: string
): Promise<CanvasManifest | null> {
  return (await loadManifestDetailed(wsPath, viewFile))?.manifest ?? null;
}

/**
 * Load every manifest that reference-based cleanup depends on. Any manifest
 * that is unreadable (even if a backup could be shown) aborts with
 * `ManifestCorruptError`: a stale or missing reference set would make live
 * notes and instances look unreferenced and get deleted.
 */
export async function loadManifestsStrict(
  wsPath: string,
  viewFiles: readonly string[]
): Promise<CanvasManifest[]> {
  const reads = await Promise.all(
    viewFiles.map(async (file) => ({
      file,
      read: await readManifest(wsPath, file),
    }))
  );
  const manifests: CanvasManifest[] = [];
  for (const { file, read } of reads) {
    if (read.kind === 'corrupt') {
      throw new ManifestCorruptError(file, read.backupPath, read.error);
    }
    if (read.kind === 'invalid-path') {
      throw new Error(
        `Refusing to scan references: ${file} has an invalid manifest path (${read.error.message}).`
      );
    }
    if (read.kind === 'ok') {
      if (getManifestIssues(read.manifest).length) {
        throw new ManifestCorruptError(
          file,
          (await preserveManifestIssues(wsPath, file, read.manifest)) ?? file,
          new Error(
            'Manifest has isolated invalid records; repair before collecting references'
          )
        );
      }
      manifests.push(read.manifest);
    }
  }
  return manifests;
}

export function preTopicBackupViewFile(viewFile: string): string {
  return `${viewFile}.pre-topic`;
}

function nodesIncludeTopics(
  nodes: ReadonlyArray<{ type?: string | undefined }>
): boolean {
  return nodes.some((node) => node.type === 'topic');
}

/**
 * Copy the on-disk manifest before the first Topic write so a downgrade can
 * restore the pre-Topic file. Existing backups are left alone; restore is an
 * explicit later action.
 */
export async function backupManifestBeforeFirstTopics(
  wsPath: string,
  viewFile: string,
  incomingNodes: ReadonlyArray<{ type?: string | undefined }>
): Promise<{ backupFile?: string; created: boolean }> {
  if (!nodesIncludeTopics(incomingNodes)) {
    return { created: false };
  }

  let sourcePath: string;
  try {
    sourcePath = resolveWorkspaceManifestPath(wsPath, viewFile);
  } catch {
    return { created: false };
  }

  if (!existsSync(sourcePath)) {
    return { created: false };
  }

  const existing = await readManifest(wsPath, viewFile);
  if (existing.kind !== 'ok' || nodesIncludeTopics(existing.manifest.nodes)) {
    // Never snapshot a damaged file as the pre-Topic restore point.
    return { created: false };
  }

  const backupFile = preTopicBackupViewFile(viewFile);
  const destPath = resolveWorkspaceManifestPath(wsPath, backupFile);
  if (existsSync(destPath)) {
    return { backupFile, created: false };
  }

  await atomicWrite(destPath, await readFile(sourcePath, 'utf8'));
  return { backupFile, created: true };
}

/**
 * Throw `ManifestCorruptError` when the manifest on disk does not parse and
 * the exact damaged file and backup have not been explicitly approved. Returns whether the on-disk
 * file is currently damaged (but acknowledged). Callers that write other
 * files before the manifest should call this first to fail before any write.
 */
export async function assertManifestWritable(
  wsPath: string,
  viewFile: string
): Promise<{ onDiskCorrupt: boolean }> {
  const filePath = resolveWorkspaceManifestPath(wsPath, viewFile);
  const current = await readJsonOrEmpty(filePath, parseCanvasManifest);
  if (current.kind !== 'corrupt') {
    if (current.kind === 'ok') {
      await preserveManifestIssues(wsPath, viewFile, current.value);
    }
    return { onDiskCorrupt: false };
  }
  const ticket = recoveryTickets.get(filePath);
  if (
    !ticket?.authorized ||
    ticket.fingerprint !==
      (await recoveryFingerprint(wsPath, viewFile).catch(() => ''))
  ) {
    throw new ManifestCorruptError(viewFile, current.backupPath, current.error);
  }
  return { onDiskCorrupt: true };
}

/**
 * Save a canvas manifest to disk (atomic write).
 *
 * Refuses (via `assertManifestWritable`) to replace an unacknowledged damaged
 * manifest. When the on-disk file is damaged the `.bak` rotation is skipped,
 * so a good backup is never replaced by garbage; the damaged bytes are
 * already kept as `.corrupt-*`.
 */
export async function saveManifest(
  wsPath: string,
  viewFile: string,
  manifest: CanvasManifest
): Promise<void> {
  const filePath = resolveWorkspaceManifestPath(wsPath, viewFile);
  const { onDiskCorrupt } = await assertManifestWritable(wsPath, viewFile);
  if (!onDiskCorrupt) {
    await backupManifestBeforeFirstTopics(wsPath, viewFile, manifest.nodes);
    await rotateBackup(
      filePath,
      resolveWorkspaceManifestPath(wsPath, manifestBackupViewFile(viewFile))
    );
  }
  await atomicWrite(filePath, JSON.stringify(manifest, null, 2));
  recoveryTickets.delete(filePath);
}
