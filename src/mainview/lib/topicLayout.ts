/**
 * Rightward tree layout for Topics.
 *
 * Children grow to the right of their parent, siblings stack downward in
 * `order`, and a parent sits vertically centred on the band its whole subtree
 * occupies. The traversal is fully determined by `order` (id as tie-break), so
 * the same tree always produces the same coordinates — which is what lets the
 * committed positions be part of a single undo step instead of drifting after
 * every re-measure.
 *
 * Coordinates are canvas logical units. Inside a Group they are local to the
 * container, matching how React Flow stores a child node's position; callers
 * convert obstacles and Group bounds into that same space before asking the
 * avoidance layer to search.
 */

import type { Node } from '@xyflow/react';

import {
  TOPIC_LEVEL_GAP,
  TOPIC_MIN_HEIGHT,
  TOPIC_MIN_WIDTH,
  TOPIC_SIBLING_GAP,
} from '../../shared/topic';
import {
  buildAbsoluteRects,
  type Point,
  type Rect,
  rectFromAnchor,
  rectInside,
  rectsIntersect,
  type Size,
} from './collision';
import {
  collectTopicBranch,
  getTopicChildren,
  type TopicIndex,
} from './topicTree';

/** Sibling-gap-sized steps so a downward search lands on a readable slot. */
export const TOPIC_AVOIDANCE_STEP = TOPIC_SIBLING_GAP;
/** Bounded ring count: 8 × 16 px = 128 px, enough to slip past a nearby card. */
export const TOPIC_AVOIDANCE_MAX_RADIUS = 8;

export interface TopicLayoutOptions {
  /** Top-left of the root. Keeping it fixed is what makes an edit feel local
   *  rather than re-flowing the user's whole canvas. */
  rootAnchor: Point;
  /** Measured size per Topic id. Missing entries fall back to the minimum. */
  sizes: ReadonlyMap<string, Size>;
}

export interface TopicLayoutResult {
  /** Bounding box of the laid-out tree, in the same space as `rootAnchor`. */
  bounds: { height: number; width: number; x: number; y: number };
  positions: Map<string, Point>;
}

export type TopicLayoutHardReason =
  | 'group-bounds'
  | 'intra-tree-overlap'
  | 'locked-node';

export interface TopicAvoidanceOptions extends TopicLayoutOptions {
  /** Positions before this pass, used to detect a locked Topic moving. */
  currentPositions?: ReadonlyMap<string, Point>;
  /** Direct Group inner box. The laid-out tree must stay inside. */
  hardBounds?: Rect;
  lockedIds?: ReadonlySet<string>;
  /** Occupied regions of unrelated content, in the same space as `rootAnchor`. */
  obstacles?: readonly Rect[];
}

export interface TopicAvoidanceResult extends TopicLayoutResult {
  hardFailure?: TopicLayoutHardReason;
  /** Soft obstacles still overlap after the bounded search; commit is allowed. */
  softOverlap: boolean;
}

function sizeOf(sizes: ReadonlyMap<string, Size>, id: string): Size {
  return sizes.get(id) ?? { height: TOPIC_MIN_HEIGHT, width: TOPIC_MIN_WIDTH };
}

/**
 * Total vertical extent of each subtree, computed bottom-up.
 *
 * Iterative (an explicit two-phase stack, not recursion) because a damaged file
 * can nest arbitrarily deep, and a stack overflow here would take down the
 * renderer rather than surfacing a diagnostic.
 */
function measureSubtreeHeights(
  index: TopicIndex,
  rootId: string,
  sizes: ReadonlyMap<string, Size>
): Map<string, number> {
  const heights = new Map<string, number>();
  const visited = new Set<string>();
  const stack: Array<{ expanded: boolean; id: string }> = [
    { expanded: false, id: rootId },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) {
      continue;
    }
    const children = getTopicChildren(index, frame.id);
    if (!frame.expanded) {
      if (visited.has(frame.id)) {
        continue;
      }
      visited.add(frame.id);
      stack.push({ expanded: true, id: frame.id });
      for (let i = children.length - 1; i >= 0; i -= 1) {
        const childId = children[i]?.childId;
        if (childId && !visited.has(childId)) {
          stack.push({ expanded: false, id: childId });
        }
      }
      continue;
    }
    const own = sizeOf(sizes, frame.id).height;
    let stacked = 0;
    let counted = 0;
    for (const child of children) {
      const childHeight = heights.get(child.childId);
      if (childHeight === undefined) {
        continue;
      }
      stacked += childHeight;
      counted += 1;
    }
    const childrenHeight =
      counted > 0 ? stacked + (counted - 1) * TOPIC_SIBLING_GAP : 0;
    heights.set(frame.id, Math.max(own, childrenHeight));
  }
  return heights;
}

/**
 * Position every Topic in the tree rooted at `rootId`.
 *
 * Only this tree is touched. Notes, images, extension cards, and other trees are
 * never moved to make room — the plan treats them as obstacles to route around,
 * not things to push aside.
 */
export function layoutTopicTree(
  index: TopicIndex,
  rootId: string,
  options: TopicLayoutOptions
): TopicLayoutResult {
  const { rootAnchor, sizes } = options;
  const heights = measureSubtreeHeights(index, rootId, sizes);
  const positions = new Map<string, Point>();

  let minX = rootAnchor.x;
  let minY = rootAnchor.y;
  let maxX = rootAnchor.x;
  let maxY = rootAnchor.y;

  // rootAnchor is the root node's top-left, not the top of its subtree.
  // Centre the subtree around that fixed node so repeated layout cannot
  // accumulate a downward offset as children are inserted.
  const rootHeight = sizeOf(sizes, rootId).height;
  const rootBandTop =
    rootAnchor.y - ((heights.get(rootId) ?? rootHeight) - rootHeight) / 2;

  // Each frame carries the top of the vertical band reserved for that subtree.
  const stack: Array<{ bandTop: number; id: string; x: number }> = [
    {
      bandTop: rootBandTop,
      id: rootId,
      x: rootAnchor.x,
    },
  ];
  const placed = new Set<string>();

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame || placed.has(frame.id)) {
      continue;
    }
    placed.add(frame.id);

    const size = sizeOf(sizes, frame.id);
    const bandHeight = heights.get(frame.id) ?? size.height;
    // Centre the parent on its band so a node with many children does not sit
    // at the top of a tall column.
    const y = frame.bandTop + (bandHeight - size.height) / 2;
    positions.set(frame.id, { x: frame.x, y });

    minX = Math.min(minX, frame.x);
    minY = Math.min(minY, frame.bandTop);
    maxX = Math.max(maxX, frame.x + size.width);
    maxY = Math.max(maxY, frame.bandTop + bandHeight);

    const children = getTopicChildren(index, frame.id);
    const childX = frame.x + size.width + TOPIC_LEVEL_GAP;
    let childTop = frame.bandTop;
    // Push in reverse so the stack pops siblings in `order`, keeping the walk
    // deterministic.
    const childFrames: Array<{ bandTop: number; id: string; x: number }> = [];
    for (const child of children) {
      const childBand =
        heights.get(child.childId) ?? sizeOf(sizes, child.childId).height;
      childFrames.push({ bandTop: childTop, id: child.childId, x: childX });
      childTop += childBand + TOPIC_SIBLING_GAP;
    }
    for (let i = childFrames.length - 1; i >= 0; i -= 1) {
      stack.push(childFrames[i] as (typeof childFrames)[number]);
    }
  }

  return {
    bounds: { height: maxY - minY, width: maxX - minX, x: minX, y: minY },
    positions,
  };
}

/**
 * Positions that actually changed, so the caller can rewrite only those nodes
 * and leave the rest of the array structurally shared with the previous undo
 * snapshot.
 */
export function diffTopicPositions(
  current: ReadonlyMap<string, Point>,
  next: ReadonlyMap<string, Point>
): Map<string, Point> {
  const changed = new Map<string, Point>();
  for (const [id, position] of next) {
    const existing = current.get(id);
    if (!existing || existing.x !== position.x || existing.y !== position.y) {
      changed.set(id, position);
    }
  }
  return changed;
}

/** Translate a whole branch by a delta — used when dragging a subtree, where
 *  the shape is preserved and only the anchor moves. */
export function translateTopicBranch(
  index: TopicIndex,
  topicId: string,
  current: ReadonlyMap<string, Point>,
  delta: Point
): Map<string, Point> {
  const moved = new Map<string, Point>();
  for (const id of collectTopicBranch(index, topicId)) {
    const position = current.get(id);
    if (position) {
      moved.set(id, { x: position.x + delta.x, y: position.y + delta.y });
    }
  }
  return moved;
}

function layoutBounds(
  positions: ReadonlyMap<string, Point>,
  sizes: ReadonlyMap<string, Size>
): TopicLayoutResult['bounds'] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [id, position] of positions) {
    const size = sizeOf(sizes, id);
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + size.width);
    maxY = Math.max(maxY, position.y + size.height);
  }
  if (!Number.isFinite(minX)) {
    return { height: 0, width: 0, x: 0, y: 0 };
  }
  return { height: maxY - minY, width: maxX - minX, x: minX, y: minY };
}

function nodeRectsFromLayout(
  positions: ReadonlyMap<string, Point>,
  sizes: ReadonlyMap<string, Size>
): Rect[] {
  const rects: Rect[] = [];
  for (const [id, position] of positions) {
    rects.push(rectFromAnchor(position, sizeOf(sizes, id)));
  }
  return rects;
}

function translatePositions(
  positions: ReadonlyMap<string, Point>,
  delta: Point
): Map<string, Point> {
  const next = new Map<string, Point>();
  for (const [id, position] of positions) {
    next.set(id, { x: position.x + delta.x, y: position.y + delta.y });
  }
  return next;
}

function hasIntraTreeOverlap(rects: readonly Rect[]): boolean {
  for (let i = 0; i < rects.length; i += 1) {
    const a = rects[i];
    if (!a) {
      continue;
    }
    for (let j = i + 1; j < rects.length; j += 1) {
      const b = rects[j];
      if (b && rectsIntersect(a, b)) {
        return true;
      }
    }
  }
  return false;
}

function overlapsObstacles(
  rects: readonly Rect[],
  obstacles: readonly Rect[]
): boolean {
  for (const rect of rects) {
    for (const obstacle of obstacles) {
      if (rectsIntersect(rect, obstacle)) {
        return true;
      }
    }
  }
  return false;
}

function exceedsHardBounds(rects: readonly Rect[], bounds: Rect): boolean {
  return rects.some((rect) => !rectInside(rect, bounds));
}

function lockedNodeMoved(
  positions: ReadonlyMap<string, Point>,
  currentPositions: ReadonlyMap<string, Point>,
  lockedIds: ReadonlySet<string>
): boolean {
  for (const id of lockedIds) {
    const next = positions.get(id);
    const current = currentPositions.get(id);
    if (!(next && current)) {
      continue;
    }
    if (next.x !== current.x || next.y !== current.y) {
      return true;
    }
  }
  return false;
}

/**
 * Deterministic down-then-outward offsets, origin first.
 *
 * A rightward tree grows right and stacks siblings down, so those two axes
 * are the only ones the search is allowed to try. The sequence is fixed so
 * two identical trees always pick the same fallback slot.
 */
export function topicAvoidanceOffsets(
  maxRadius = TOPIC_AVOIDANCE_MAX_RADIUS,
  step = TOPIC_AVOIDANCE_STEP
): Point[] {
  const offsets: Point[] = [{ x: 0, y: 0 }];
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    offsets.push({ x: 0, y: radius * step });
    offsets.push({ x: radius * step, y: 0 });
    for (let diagonal = 1; diagonal < radius; diagonal += 1) {
      offsets.push({ x: diagonal * step, y: radius * step });
      offsets.push({ x: radius * step, y: diagonal * step });
    }
    offsets.push({ x: radius * step, y: radius * step });
  }
  return offsets;
}

interface ConstraintCheck {
  hard?: TopicLayoutHardReason;
  soft: boolean;
}

function checkConstraints(
  positions: ReadonlyMap<string, Point>,
  options: TopicAvoidanceOptions
): ConstraintCheck {
  const rects = nodeRectsFromLayout(positions, options.sizes);
  if (hasIntraTreeOverlap(rects)) {
    return { hard: 'intra-tree-overlap', soft: false };
  }
  if (
    options.lockedIds &&
    options.currentPositions &&
    lockedNodeMoved(positions, options.currentPositions, options.lockedIds)
  ) {
    return { hard: 'locked-node', soft: false };
  }
  if (options.hardBounds && exceedsHardBounds(rects, options.hardBounds)) {
    return {
      hard: 'group-bounds',
      soft: overlapsObstacles(rects, options.obstacles ?? []),
    };
  }
  return { soft: overlapsObstacles(rects, options.obstacles ?? []) };
}

/**
 * Tidy-tree plus the §5 avoidance layer: keep the root when possible, then
 * search down/out for a translation that clears soft obstacles without
 * breaking hard constraints.
 *
 * Soft failure still returns positions so the caller can commit and warn.
 * Hard failure returns the tidy-tree positions plus `hardFailure` so the
 * caller can keep the draft and write nothing.
 */
export function layoutTopicTreeAvoiding(
  index: TopicIndex,
  rootId: string,
  options: TopicAvoidanceOptions
): TopicAvoidanceResult {
  const base = layoutTopicTree(index, rootId, options);
  const originCheck = checkConstraints(base.positions, options);

  if (
    originCheck.hard === 'locked-node' ||
    originCheck.hard === 'intra-tree-overlap'
  ) {
    return { ...base, hardFailure: originCheck.hard, softOverlap: false };
  }

  if (!(originCheck.hard || originCheck.soft)) {
    return { ...base, softOverlap: false };
  }

  let bestHardOk: TopicAvoidanceResult | undefined;
  if (!originCheck.hard) {
    bestHardOk = { ...base, softOverlap: originCheck.soft };
  }

  for (const offset of topicAvoidanceOffsets()) {
    if (offset.x === 0 && offset.y === 0) {
      continue;
    }
    const positions = translatePositions(base.positions, offset);
    const check = checkConstraints(positions, options);
    if (check.hard) {
      continue;
    }
    const result: TopicAvoidanceResult = {
      bounds: layoutBounds(positions, options.sizes),
      positions,
      softOverlap: check.soft,
    };
    if (!check.soft) {
      return result;
    }
    if (!bestHardOk) {
      bestHardOk = result;
    }
  }

  if (bestHardOk) {
    return bestHardOk;
  }

  return {
    ...base,
    hardFailure: originCheck.hard ?? 'group-bounds',
    softOverlap: originCheck.soft,
  };
}

/**
 * Occupied rects of every node that is not part of the tree being laid out,
 * expressed in the same space as `rootAnchor` (absolute, or Group-local after
 * subtracting `origin`).
 *
 * The containing Group must be in `excludeIds` — its box is a hard bound, not
 * a soft obstacle, and would otherwise intersect every child.
 */
export function collectTopicLayoutObstacles(
  nodes: Node[],
  excludeIds: ReadonlySet<string>,
  origin: Point = { x: 0, y: 0 }
): Rect[] {
  const absolute = buildAbsoluteRects(nodes);
  const obstacles: Rect[] = [];
  for (const node of nodes) {
    if (excludeIds.has(node.id)) {
      continue;
    }
    const rect = absolute.get(node.id);
    if (!rect) {
      continue;
    }
    obstacles.push({
      bottom: rect.bottom - origin.y,
      left: rect.left - origin.x,
      right: rect.right - origin.x,
      top: rect.top - origin.y,
    });
  }
  return obstacles;
}
