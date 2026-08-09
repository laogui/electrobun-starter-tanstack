import type { Node } from '@xyflow/react';

import { buildAbsoluteRects, type Rect } from '../collision';

/**
 * Flow-space axis-aligned bounds of every selected node.
 * Returns null when nothing is selected (or sizes cannot be resolved).
 */
export function getSelectedNodesFlowBounds(nodes: Node[]): Rect | null {
  const selected = nodes.filter((node) => node.selected);
  if (selected.length === 0) {
    return null;
  }

  const absoluteRects = buildAbsoluteRects(nodes);
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let any = false;

  for (const node of selected) {
    const rect = absoluteRects.get(node.id);
    if (!rect) {
      continue;
    }
    any = true;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  if (!any) {
    return null;
  }

  return { left, top, right, bottom };
}
