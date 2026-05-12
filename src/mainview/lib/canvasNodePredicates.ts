import { CANVAS_NODE_SPECS } from './canvasNodeRegistry';

/**
 * Centralized predicates for canvas node behavior. All callers should use
 * these instead of hand-rolling `node.type === 'card' || node.type === 'image'`
 * style checks. Predicates accept React Flow `node.type` (a string or undefined),
 * not `CanvasNodeKind`, since that's what runtime callers normally have.
 *
 * Implementation note: the group / folder eligibility sets are computed lazily
 * on first call, not at module load. This avoids a temporal-dead-zone bug
 * caused by the canvas-node import cycle:
 *   `canvasStore` → `canvasNodeRegistry` → `canvasConstants` → node components
 *   → `useCanvasStore` → `canvasUtils` → `canvasNodePredicates` → registry.
 * If the predicate sets were initialized eagerly, the inner reach back into
 * `CANVAS_NODE_SPECS` would hit it before the export had been assigned.
 */

let groupChildNodeTypes: Set<string> | null = null;
let folderChildNodeTypes: Set<string> | null = null;

function getGroupChildNodeTypes(): Set<string> {
  if (!groupChildNodeTypes) {
    const set = new Set<string>();
    for (const spec of Object.values(CANVAS_NODE_SPECS)) {
      if (spec.canEnterGroup) {
        set.add(spec.nodeType);
      }
    }
    groupChildNodeTypes = set;
  }
  return groupChildNodeTypes;
}

function getFolderChildNodeTypes(): Set<string> {
  if (!folderChildNodeTypes) {
    const set = new Set<string>();
    for (const spec of Object.values(CANVAS_NODE_SPECS)) {
      if (spec.canEnterFolder) {
        set.add(spec.nodeType);
      }
    }
    folderChildNodeTypes = set;
  }
  return folderChildNodeTypes;
}

/** React Flow node types that represent user-authored content (card, image,
 *  sticky, asset, link). Excludes structural containers (folder, group). */
const CANVAS_CONTENT_NODE_TYPES = new Set<string>([
  'card',
  'image',
  'sticky',
  'asset',
  'link',
]);

/** React Flow node types that open a focused/zoom view on double-click. MVP
 *  parity: card and image. `asset` and `link` will return `true` once their
 *  focused views land in Phase 1A / 1B. */
const FOCUSABLE_NODE_TYPES = new Set<string>([
  'card',
  'image',
  'asset',
  'link',
]);

export function isCanvasContentNode(type: string | undefined): boolean {
  return type ? CANVAS_CONTENT_NODE_TYPES.has(type) : false;
}

export function isGroupChildNode(type: string | undefined): boolean {
  return type ? getGroupChildNodeTypes().has(type) : false;
}

export function isFolderChildNode(type: string | undefined): boolean {
  return type ? getFolderChildNodeTypes().has(type) : false;
}

export function isFocusableNode(type: string | undefined): boolean {
  return type ? FOCUSABLE_NODE_TYPES.has(type) : false;
}
