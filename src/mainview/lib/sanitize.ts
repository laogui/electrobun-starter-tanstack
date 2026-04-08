import type { Node, Edge } from '@xyflow/react';

const RUNTIME_NODE_KEYS = new Set([
  'selected', 'dragging', 'resizing', 'measured', 'draggable',
  'selectable', 'deletable', 'focusable',
  'width', 'height', 'internals',
]);

const RUNTIME_DATA_KEYS = new Set([
  'isHidden', 'isDropTarget',
]);

/** Strip runtime-only fields from a node before persisting to disk. */
function sanitizeNode(node: Node): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (!RUNTIME_NODE_KEYS.has(k)) {
      clean[k] = v;
    }
  }
  if (clean.data && typeof clean.data === 'object') {
    const cleanData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(clean.data as Record<string, unknown>)) {
      if (!RUNTIME_DATA_KEYS.has(k)) {
        cleanData[k] = v;
      }
    }
    clean.data = cleanData;
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
