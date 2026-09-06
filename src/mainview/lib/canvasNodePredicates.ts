import { canvasTypeRegistry } from '@/extensions/registry';
import { CANVAS_NODE_SPECS } from './canvasNodeRegistry';

/**
 * Centralized predicates for canvas node behavior. All callers should use
 * these instead of hand-rolling `node.type === 'card' || node.type === 'image'`
 * style checks. Predicates accept React Flow `node.type` (a string or undefined),
 * not `CanvasNodeKind`, since that's what runtime callers normally have.
 *
 * Implementation note: the group / folder eligibility sets are computed lazily
 * on first call, not at module load. This keeps derived sets out of the registry
 * initialization path.
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
    set.add('extension');
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
  'recording',
  'widget',
  'extension',
]);

/** React Flow node types that open a focused/zoom view on click.
 *  Widgets are interactive on the canvas itself and never open a note
 *  focused view. `asset` is reserved for Phase 1B; keeping it true here
 *  lets persisted experimental data route through focused view once the
 *  UI exists. */
const FOCUSABLE_NODE_TYPES = new Set<string>([
  'card',
  'image',
  'asset',
  'link',
]);

function canvasTypeFromData(
  data?: Record<string, unknown> | null
): ReturnType<typeof canvasTypeRegistry.get> {
  const canvasTypeId =
    typeof data?.canvasTypeId === 'string' ? data.canvasTypeId : '';
  return canvasTypeId ? canvasTypeRegistry.get(canvasTypeId) : undefined;
}

export function isCanvasContentNode(type: string | undefined): boolean {
  return type ? CANVAS_CONTENT_NODE_TYPES.has(type) : false;
}

export function isGroupChildNode(
  type: string | undefined,
  data?: Record<string, unknown> | null
): boolean {
  if (type === 'extension') {
    return canvasTypeFromData(data)?.surface.canEnterGroup ?? true;
  }
  return type ? getGroupChildNodeTypes().has(type) : false;
}

export function isFolderChildNode(
  type: string | undefined,
  data?: Record<string, unknown> | null
): boolean {
  if (type === 'extension') {
    return canvasTypeFromData(data)?.surface.canEnterFolder ?? false;
  }
  return type ? getFolderChildNodeTypes().has(type) : false;
}

/** React Flow node types that can never be absorbed into a folder from a drag
 *  (sticky, folder, group, and leftover checklist/pomodoro/reminder widgets). */
const REJECTED_FOLDER_CHILD_NODE_TYPES = new Set<string>([
  'sticky',
  'folder',
  'group',
  'widget',
]);

/** True when `nodeType` is a draggable node that a folder must visually reject
 *  (repel) instead of absorbing. Structural containers and widgets can never
 *  live inside a folder. Extension nodes follow their canvas-type capability. */
export function isRejectedFolderChildNode(
  nodeType: string | undefined,
  data?: Record<string, unknown> | null
): boolean {
  if (nodeType === 'extension') {
    return !(canvasTypeFromData(data)?.surface.canEnterFolder ?? false);
  }
  return nodeType ? REJECTED_FOLDER_CHILD_NODE_TYPES.has(nodeType) : false;
}

export function isFocusableNode(
  type: string | undefined,
  data?: Record<string, unknown> | null
): boolean {
  if (type === 'extension') {
    return canvasTypeFromData(data)?.surface.openBehavior === 'detail';
  }
  return type ? FOCUSABLE_NODE_TYPES.has(type) : false;
}

const LEGACY_DETACHABLE_NODE_TYPES = new Set<string>([
  'card',
  'image',
  'link',
  'asset',
]);

/** True when the node can move to the note library. Legacy types keep dual-read; extensions opt in via `canDetach`. */
export function isDetachableNode(
  type: string | undefined,
  data?: Record<string, unknown> | null
): boolean {
  if (type === 'extension') {
    return canvasTypeFromData(data)?.interactions?.canDetach === true;
  }
  return type ? LEGACY_DETACHABLE_NODE_TYPES.has(type) : false;
}
