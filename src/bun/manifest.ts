import { join } from 'node:path';

import { atomicWrite } from './workspace';

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
  schema: 'spatial-canvas/v1';
  viewId: string;
  viewport?: { x: number; y: number; zoom: number };
}

/** Load a canvas manifest from disk. Returns null if file doesn't exist. */
export async function loadManifest(
  wsPath: string,
  viewFile: string
): Promise<CanvasManifest | null> {
  const filePath = join(wsPath, '.spatial', viewFile);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  return await file.json();
}

/** Save a canvas manifest to disk (atomic write). */
export async function saveManifest(
  wsPath: string,
  viewFile: string,
  manifest: CanvasManifest
): Promise<void> {
  const filePath = join(wsPath, '.spatial', viewFile);
  await atomicWrite(filePath, JSON.stringify(manifest, null, 2));
}
