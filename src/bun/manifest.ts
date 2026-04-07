import { join } from "path";
import { atomicWrite } from "./workspace";

export interface ManifestNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  style?: Record<string, unknown>;
  parentId?: string;
  extent?: string;
  data: Record<string, unknown>;
}

export interface ManifestEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  label?: string;
  animated?: boolean;
}

export interface CanvasManifest {
  schema: "spatial-canvas/v1";
  viewId: string;
  viewport?: { x: number; y: number; zoom: number };
  nodes: ManifestNode[];
  edges: ManifestEdge[];
}

/** Load a canvas manifest from disk. Returns null if file doesn't exist. */
export async function loadManifest(wsPath: string, viewFile: string): Promise<CanvasManifest | null> {
  const filePath = join(wsPath, ".spatial", viewFile);
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
  manifest: CanvasManifest,
): Promise<void> {
  const filePath = join(wsPath, ".spatial", viewFile);
  await atomicWrite(filePath, JSON.stringify(manifest, null, 2));
}
