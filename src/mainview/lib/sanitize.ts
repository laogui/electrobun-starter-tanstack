import type { Edge, Node } from '@xyflow/react';

const RUNTIME_NODE_KEYS = new Set([
  'selected',
  'dragging',
  'resizing',
  'measured',
  'draggable',
  'selectable',
  'deletable',
  'focusable',
  'width',
  'height',
  'internals',
]);

/**
 * Fields that may appear on `node.data` during runtime but must never be
 * persisted to manifest. Folder children's `data` objects flow through the
 * same filter via {@link sanitizeNodeData} below.
 *
 * - `isHidden` / `isDropTarget`: transient drag/focus highlight flags.
 * - `previewUrl` / `thumbnailUrl`: hydrated runtime URLs (object URLs, data
 *   URLs) for asset / link / image nodes. The persisted source of truth is
 *   `attachmentFile` / `thumbnailFile`; the URL is regenerated on hydrate.
 */
const RUNTIME_DATA_KEYS = new Set([
  'isHidden',
  'isDropTarget',
  'missing',
  'previewUrl',
  'thumbnailUrl',
]);

interface FolderChildLike {
  data?: unknown;
  [key: string]: unknown;
}

/**
 * Strip runtime-only data fields. Folder nodes carry an embedded
 * `data.children` array of folder-child entries; each child has its own
 * `data` blob which must be filtered with the same rules. Anything other
 * than an array under `data.children` is left alone.
 */
function sanitizeNodeData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const cleanData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (RUNTIME_DATA_KEYS.has(k)) {
      continue;
    }
    if (k === 'children' && Array.isArray(v)) {
      cleanData[k] = (v as FolderChildLike[]).map(sanitizeFolderChild);
      continue;
    }
    cleanData[k] = v;
  }
  return cleanData;
}

function sanitizeFolderChild(child: FolderChildLike): FolderChildLike {
  const clean: FolderChildLike = {};
  for (const [k, v] of Object.entries(child)) {
    clean[k] = v;
  }
  if (clean.data && typeof clean.data === 'object') {
    clean.data = sanitizeNodeData(clean.data as Record<string, unknown>);
  }
  return clean;
}

/** Strip runtime-only fields from a node before persisting to disk. */
function sanitizeNode(node: Node): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (!RUNTIME_NODE_KEYS.has(k)) {
      clean[k] = v;
    }
  }
  if (clean.data && typeof clean.data === 'object') {
    clean.data = sanitizeNodeData(clean.data as Record<string, unknown>);
  }
  return clean;
}

/** Strip runtime-only fields from an edge before persisting. */
function sanitizeEdge(edge: Edge): Record<string, unknown> {
  const { selected, ...clean } = edge as any;
  return clean;
}

/** Sanitize nodes and edges arrays for persistence. */
export function sanitizeForPersistence(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map(sanitizeNode),
    edges: edges.map(sanitizeEdge),
  };
}
