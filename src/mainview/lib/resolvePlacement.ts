import type { Node } from '@xyflow/react';

import { isGroupChildNode } from './canvasNodePredicates';
import {
  buildAbsoluteRects,
  type Direction,
  findNearestFreePosition,
  findNearestFreePositionAroundBounds,
  findNearestFreePositionWithinBounds,
  inflateRect,
  isPointInside,
  isPositionAvailable,
  type Point,
  type Rect,
  type Size,
} from './collision';

/** Padding around groups used for placement avoidance / inner bounds. */
export const GROUP_PADDING = 20;

export interface PlacementResult {
  /** True when a non-overlapping slot was found for the new node. */
  canPlace: boolean;
  /** Group id the node should be parented to, or null to stay at canvas root. */
  parentId: string | null;
  /** Absolute top-left placement (canvas coords) before parent conversion. */
  placement: Point;
}

export interface ResolvePlacementOptions {
  /** Top-left anchor the caller *prefers* for the new node (canvas coords). */
  anchor: Point;
  /** Type of the node being created (decides group-adoption eligibility). */
  newType: string;
  /** Existing nodes on the canvas. */
  nodes: Node[];
  /** Size of the node being created. */
  size: Size;
}

/**
 * Pure placement resolver for new nodes. Search order:
 *   1. If the anchor lies inside a group and the new node is adoptable:
 *      try the anchor in-place → a bounded search within the group.
 *   2. Try the anchor with all groups treated as obstacles.
 *   3. If the anchor is engulfed by a group, scan around that group.
 *   4. Fall back to the nearest free spot on the wider canvas.
 * Returns `canPlace: false` only when step 4 can't find anything.
 */
export function resolveNodePlacement(
  options: ResolvePlacementOptions
): PlacementResult {
  const { anchor, nodes, newType, size } = options;
  const absoluteRects = buildAbsoluteRects(nodes);

  const groups = nodes.filter((n) => n.type === 'group');
  const groupRectsById = new Map<string, Rect>();
  for (const g of groups) {
    const r = absoluteRects.get(g.id);
    if (r) {
      groupRectsById.set(g.id, r);
    }
  }

  const nodeRects = nodes
    .filter((n) => n.type !== 'group')
    .map((n) => absoluteRects.get(n.id))
    .filter((r): r is Rect => r !== undefined);

  const allGroupObstacles = Array.from(groupRectsById.values()).map((r) =>
    inflateRect(r, GROUP_PADDING)
  );

  const anchorCenter: Point = {
    x: anchor.x + size.width / 2,
    y: anchor.y + size.height / 2,
  };

  // Step 1: anchor's center sits inside a group → try to adopt it as a child.
  const canAdopt = isGroupChildNode(newType);
  const targetGroup = canAdopt
    ? (groups.find((g) => {
        const r = groupRectsById.get(g.id);
        return r ? isPointInside(anchorCenter, r) : false;
      }) ?? null)
    : null;

  if (targetGroup) {
    const targetRect = groupRectsById.get(targetGroup.id)!;
    const otherGroupObstacles = Array.from(groupRectsById.entries())
      .filter(([id]) => id !== targetGroup.id)
      .map(([, r]) => inflateRect(r, GROUP_PADDING));

    if (isPositionAvailable(anchor, size, nodeRects, otherGroupObstacles)) {
      return { placement: anchor, parentId: targetGroup.id, canPlace: true };
    }

    const bounds: Rect = {
      left: targetRect.left + GROUP_PADDING,
      top: targetRect.top + GROUP_PADDING,
      right: targetRect.right - GROUP_PADDING,
      bottom: targetRect.bottom - GROUP_PADDING,
    };
    const bounded = findNearestFreePositionWithinBounds(
      anchor,
      size,
      bounds,
      nodeRects,
      otherGroupObstacles
    );
    if (bounded) {
      return { placement: bounded, parentId: targetGroup.id, canPlace: true };
    }
    // No room inside the target group → fall through to outside-the-group logic.
  }

  // Step 2: anchor free with all groups as obstacles.
  if (isPositionAvailable(anchor, size, nodeRects, allGroupObstacles)) {
    return { placement: anchor, parentId: null, canPlace: true };
  }

  // Step 3: anchor center sits inside some group → scan around it.
  const engulfingGroup = groups.find((g) => {
    const r = groupRectsById.get(g.id);
    return r ? isPointInside(anchorCenter, r) : false;
  });
  if (engulfingGroup) {
    const r = groupRectsById.get(engulfingGroup.id)!;
    const otherObstacles = Array.from(groupRectsById.entries())
      .filter(([id]) => id !== engulfingGroup.id)
      .map(([, rect]) => inflateRect(rect, GROUP_PADDING));
    const around = findNearestFreePositionAroundBounds({
      desired: anchor,
      size,
      bounds: r,
      directions: preferredDirections(anchor, size, r),
      gap: GROUP_PADDING,
      nodeRects,
      obstacles: otherObstacles,
    });
    if (around) {
      return { placement: around, parentId: null, canPlace: true };
    }
  }

  // Step 4: global nearest free.
  const global = findNearestFreePosition(
    anchor,
    size,
    nodeRects,
    allGroupObstacles
  );
  if (global) {
    return { placement: global, parentId: null, canPlace: true };
  }

  return { placement: anchor, parentId: null, canPlace: false };
}

function preferredDirections(
  anchor: Point,
  size: Size,
  rect: Rect
): Direction[] {
  const scores: Record<Direction, number> = {
    right: Math.abs(rect.right - (anchor.x + size.width)),
    down: Math.abs(rect.bottom - (anchor.y + size.height)),
    left: Math.abs(anchor.x - rect.left),
    up: Math.abs(anchor.y - rect.top),
  };
  return (['right', 'down', 'left', 'up'] as Direction[]).sort(
    (a, b) => scores[a] - scores[b]
  );
}
