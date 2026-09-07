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

export interface ManifestEdge {
  animated?: boolean;
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

/** Save a canvas manifest to disk (atomic write). */
export async function saveManifest(
  wsPath: string,
  viewFile: string,
  manifest: CanvasManifest
): Promise<void> {
  const filePath = resolveWorkspaceManifestPath(wsPath, viewFile);
  await atomicWrite(filePath, JSON.stringify(manifest, null, 2));
}
