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
 * same filter via {@link serializeNodeDataForManifest} below.
 *
 * - `isHidden` / `isDropTarget`: transient drag/focus highlight flags.
 * - `previewUrl` / `thumbnailUrl`: hydrated runtime URLs (object URLs, data
 *   URLs) for asset / link / image nodes. The persisted source of truth is
 *   `attachmentFile` / `thumbnailFile`; the URL is regenerated on hydrate.
 * - `unfurlError`: transient error string from the link preview fetch. The
 *   `unfurlStatus` is stripped when it is in a non-terminal state (loading)
 *   so the next session can re-attempt the fetch instead of being stuck.
 */
const RUNTIME_DATA_KEYS = new Set([
  'isHidden',
  'isDropTarget',
  'missing',
  'previewUrl',
  'thumbnailUrl',
  'unfurlError',
]);

const TRANSIENT_UNFURL_STATUSES = new Set(['loading', 'idle']);

interface FolderChildLike {
  data?: unknown;
  [key: string]: unknown;
}

/**
 * Strip the runtime-only fields that hydrate an asset / link / image node
 * (preview URLs, transient unfurl state, drag highlights). Used both as a
 * standalone helper and as a building block for {@link serializeNodeForManifest}.
 */
export function stripRuntimeAssetFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const cleanData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (RUNTIME_DATA_KEYS.has(k)) {
      continue;
    }
    if (
      k === 'unfurlStatus' &&
      typeof v === 'string' &&
      TRANSIENT_UNFURL_STATUSES.has(v)
    ) {
      // Drop "in flight" statuses so a fresh hydrate can retry the unfurl
      // instead of remaining stuck in a loading spinner.
      continue;
    }
    cleanData[k] = v;
  }
  return cleanData;
}

/**
 * Sanitize a node's `data` blob for persistence. Folder nodes carry an
 * embedded `data.children` array of folder-child entries; each child has its
 * own `data` blob which is filtered with the same rules. Anything other than
 * an array under `data.children` is left alone.
 */
export function serializeNodeDataForManifest(
  data: Record<string, unknown>
): Record<string, unknown> {
  const cleanData = stripRuntimeAssetFields(data);
  if (Array.isArray(cleanData.children)) {
    cleanData.children = (cleanData.children as FolderChildLike[]).map(
      serializeFolderChild
    );
  }
  return cleanData;
}

function serializeFolderChild(child: FolderChildLike): FolderChildLike {
  const clean: FolderChildLike = {};
  for (const [k, v] of Object.entries(child)) {
    clean[k] = v;
  }
  if (clean.type === 'widget' && clean.data && typeof clean.data === 'object') {
    const data = clean.data as { kind?: unknown; widgetId?: unknown };
    clean.data = { widgetId: data.widgetId, kind: data.kind };
    return clean;
  }
  if (clean.data && typeof clean.data === 'object') {
    clean.data = serializeNodeDataForManifest(
      clean.data as Record<string, unknown>
    );
  }
  return clean;
}

/** Strip runtime-only fields from a node before persisting to disk. */
export function serializeNodeForManifest(node: Node): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (!RUNTIME_NODE_KEYS.has(k)) {
      clean[k] = v;
    }
  }
  if (node.type === 'widget' && clean.data && typeof clean.data === 'object') {
    const data = clean.data as { kind?: unknown; widgetId?: unknown };
    clean.data = { widgetId: data.widgetId, kind: data.kind };
    return clean;
  }
  if (clean.data && typeof clean.data === 'object') {
    clean.data = serializeNodeDataForManifest(
      clean.data as Record<string, unknown>
    );
  }
  return clean;
}

/** Strip runtime-only fields from an edge before persisting. */
function serializeEdgeForManifest(edge: Edge): Record<string, unknown> {
  const { selected, ...clean } = edge as any;
  return clean;
}

/** Sanitize nodes and edges arrays for persistence. */
export function sanitizeForPersistence(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map(serializeNodeForManifest),
    edges: edges.map(serializeEdgeForManifest),
  };
}
