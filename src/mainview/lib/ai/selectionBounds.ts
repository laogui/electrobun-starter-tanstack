import type { Node } from '@xyflow/react';

import { getNodeSize, type Rect } from '../collision';

/**
 * Flow-space axis-aligned bounds of every selected node.
 * Returns null when nothing is selected (or sizes cannot be resolved).
 *
 * Runs on every store update while something is selected (including drag
 * frames), so it only resolves the selected nodes and their parent chains
 * instead of building rects for the whole canvas.
 */
export function getSelectedNodesFlowBounds(nodes: Node[]): Rect | null {
  const selected: Node[] = [];
  let needsParents = false;
  for (const node of nodes) {
    if (node.selected) {
      selected.push(node);
      needsParents ||= Boolean(node.parentId);
    }
  }
  if (selected.length === 0) {
    return null;
  }

  const byId = needsParents ? new Map(nodes.map((n) => [n.id, n])) : null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const node of selected) {
    let x = node.position.x;
    let y = node.position.y;
    const visited = new Set<string>([node.id]);
    let parent = node.parentId ? byId?.get(node.parentId) : undefined;
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      x += parent.position.x;
      y += parent.position.y;
      parent = parent.parentId ? byId?.get(parent.parentId) : undefined;
    }
    const { width, height } = getNodeSize(node);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  }

  return { left, top, right, bottom };
}
