import { readFile } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve } from 'node:path';

import { atomicWrite } from './atomicWrite';

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

function normalizeWorkspaceRelativePath(filePath: string): string {
  return normalize(filePath).replaceAll('\\', '/');
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

  const relativePath = normalizeWorkspaceRelativePath(viewFile);
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

  const ghostRoot = resolve(wsPath, '.ghostboard');
  const fullPath = resolve(ghostRoot, relativePath);
  const rootRelative = relative(ghostRoot, fullPath);
  if (rootRelative.startsWith('..') || isAbsolute(rootRelative)) {
    throw new Error('Manifest path escapes .ghostboard/.');
  }
  return fullPath;
}

/** Load a canvas manifest from disk. Returns null if file doesn't exist. */
export async function loadManifest(
  wsPath: string,
  viewFile: string
): Promise<CanvasManifest | null> {
  let filePath: string;
  try {
    filePath = resolveWorkspaceManifestPath(wsPath, viewFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[manifest] Refused to load ${viewFile}: ${message}`);
    return null;
  }
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  try {
    return await file.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[manifest] Failed to load ${viewFile}: ${message}`);
    return null;
  }
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

  const source = Bun.file(sourcePath);
  if (!(await source.exists())) {
    return { created: false };
  }

  const existing = await loadManifest(wsPath, viewFile);
  if (existing && nodesIncludeTopics(existing.nodes)) {
    return { created: false };
  }

  const backupFile = preTopicBackupViewFile(viewFile);
  const destPath = resolveWorkspaceManifestPath(wsPath, backupFile);
  if (await Bun.file(destPath).exists()) {
    return { backupFile, created: false };
  }

  await atomicWrite(destPath, await readFile(sourcePath, 'utf8'));
  return { backupFile, created: true };
}

/** Save a canvas manifest to disk (atomic write). */
export async function saveManifest(
  wsPath: string,
  viewFile: string,
  manifest: CanvasManifest
): Promise<void> {
  const filePath = resolveWorkspaceManifestPath(wsPath, viewFile);
  await backupManifestBeforeFirstTopics(wsPath, viewFile, manifest.nodes);
  await atomicWrite(filePath, JSON.stringify(manifest, null, 2));
}
