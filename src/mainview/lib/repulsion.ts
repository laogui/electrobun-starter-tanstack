import type { Node } from '@xyflow/react';

import { isCanvasContentNode } from './canvasNodePredicates';
import { buildAbsoluteRects, type Point } from './collision';

/** Minimum clearance kept between an active (dragged / resized) node and the
 *  nodes it pushes away. */
export const REPULSION_GAP = 20;
/** Minimum clearance enforced between pushed neighbors and obstacles once a
 *  node has been disturbed by the drag chain. */
export const REPULSION_MARGIN = 8;
/** Penetrations below this are ignored so float noise never causes jitter or
 *  keeps the solver from converging. */
const OVERLAP_EPSILON = 0.5;
/** Upper bound for the Gauss-Seidel relaxation loop. Long push chains
 *  converge well below this; impossible squeezes bail out gracefully and are
 *  allowed to keep some overlap. */
const MAX_ITERATIONS = 32;
/** Threshold under which a solved position is considered unchanged, so the
 *  original node object (and its identity) is preserved. */
const POSITION_EPSILON = 0.01;

interface SolverBox {
  awake: boolean;
  height: number;
  id: string;
  node: Node;
  /** Extra clearance this box demands from a pair partner. */
  pad: number;
  /** Pinned boxes push others but are never displaced themselves. */
  pinned: boolean;
  width: number;
  x: number;
  y: number;
}

export interface ApplyDragRepulsionParams {
  /** Ids of the nodes being dragged or resized. They are pinned: they push
   *  neighbors away but are never moved by the solver. */
  activeIds: Set<string>;
  /** Clearance kept around active nodes. Defaults to {@link REPULSION_GAP}. */
  gap?: number;
  /** Clearance between pushed neighbors. Defaults to {@link REPULSION_MARGIN}. */
  margin?: number;
  /** Current nodes, with the active nodes already at their live positions. */
  nodes: Node[];
  /** Top-level node positions captured at gesture start. Every frame is
   *  re-solved from these origins, which makes the result path-independent
   *  and lets pushed nodes flow back when the drag moves away. */
  origins: Map<string, Point>;
  /** When true (e.g. hovering a folder / group drop target) no repulsion is
   *  applied and every pushed node is restored to its origin. */
  paused?: boolean;
}

/** Capture the positions of all top-level nodes at gesture start. */
export function captureRepulsionOrigins(nodes: Node[]): Map<string, Point> {
  const origins = new Map<string, Point>();
  for (const node of nodes) {
    if (!node.parentId) {
      origins.set(node.id, { x: node.position.x, y: node.position.y });
    }
  }
  return origins;
}

/** Axis-aligned rect in absolute canvas coordinates. */
export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

/**
 * Push a movable rect out of an immovable obstacle rect along the axis of
 * minimum penetration, keeping a `gap` clearance. Used to give a dragged node
 * that cannot enter a folder (widget, sticky, group, folder) a live "top it
 * off" effect: the folder acts as a hard wall the cursor cannot pull the node
 * through. Returns the new top-left position; unchanged when there is no
 * overlap.
 */
export function pushNodeAwayFromObstacle(
  node: Rect,
  obstacle: Rect,
  gap = REPULSION_GAP
): { x: number; y: number } {
  const dx = node.x + node.width / 2 - (obstacle.x + obstacle.width / 2);
  const dy = node.y + node.height / 2 - (obstacle.y + obstacle.height / 2);
  const px = (node.width + obstacle.width) / 2 + gap - Math.abs(dx);
  const py = (node.height + obstacle.height) / 2 + gap - Math.abs(dy);
  if (px <= OVERLAP_EPSILON || py <= OVERLAP_EPSILON) {
    return { x: node.x, y: node.y };
  }
  if (px < py) {
    const sign = dx > 0 ? 1 : -1;
    return { x: node.x + px * sign, y: node.y };
  }
  const sign = dy > 0 ? 1 : -1;
  return { x: node.x, y: node.y + py * sign };
}

function isLockedNode(node: Node): boolean {
  return Boolean((node.data as { locked?: unknown } | undefined)?.locked);
}

/** A node the solver may displace: a top-level, unlocked content node. Groups
 *  and folders are containers — they act as immovable obstacles instead so
 *  dragging toward them (to drop into them) never scatters them. */
function isPushableNode(node: Node): boolean {
  return (
    !node.parentId && isCanvasContentNode(node.type) && !isLockedNode(node)
  );
}

/**
 * Real-time drag repulsion, modeled as an iterative pairwise AABB separation
 * solver (minimum-translation-vector resolution with Gauss-Seidel relaxation).
 *
 * Every call re-solves the layout from the gesture-start `origins`, so the
 * output only depends on where the active nodes are *now* — never on the path
 * the pointer took. That gives three properties the previous grid-scan engine
 * could not guarantee:
 *
 * - pushed nodes move continuously with the pointer (no teleporting),
 * - they flow back to their origin as soon as the pressure is gone,
 * - chains (A pushes B pushes C) resolve without cascading drift.
 *
 * Roles:
 * - active nodes: pinned pushers (the user controls them),
 * - top-level content nodes: pushable, but only once the drag chain actually
 *   disturbs them — untouched nodes (and intentional pre-existing overlaps)
 *   are never rearranged,
 * - groups / folders / locked nodes: immovable obstacles pushed nodes flow
 *   around; the active node itself may freely overlap them (drop targeting),
 * - child nodes (inside groups): never moved; their parent is the obstacle.
 */
export function applyDragRepulsion(params: ApplyDragRepulsionParams): Node[] {
  const {
    activeIds,
    gap = REPULSION_GAP,
    margin = REPULSION_MARGIN,
    nodes,
    origins,
    paused = false,
  } = params;

  const rects = buildAbsoluteRects(nodes);
  const boxes: SolverBox[] = [];

  for (const node of nodes) {
    const rect = rects.get(node.id);
    if (!rect) {
      continue;
    }
    if (activeIds.has(node.id)) {
      boxes.push({
        id: node.id,
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        pinned: true,
        awake: true,
        pad: gap,
        node,
      });
      continue;
    }
    // Children move with their parent (active or not) and are spatially
    // covered by it — they never participate on their own.
    if (node.parentId) {
      continue;
    }
    if (isPushableNode(node)) {
      const origin = origins.get(node.id) ?? node.position;
      boxes.push({
        id: node.id,
        x: origin.x,
        y: origin.y,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        pinned: false,
        awake: false,
        pad: margin,
        node,
      });
      continue;
    }
    // Groups, folders, locked and unknown nodes: immovable obstacles.
    boxes.push({
      id: node.id,
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      pinned: true,
      awake: false,
      pad: margin,
      node,
    });
  }

  if (!paused) {
    solve(boxes);
  }

  // Write back: pushable boxes are always top-level, so the solved absolute
  // position is also the node-local position.
  const solved = new Map<string, SolverBox>();
  for (const box of boxes) {
    if (!box.pinned) {
      solved.set(box.id, box);
    }
  }

  let changed = false;
  const result = nodes.map((node) => {
    const box = solved.get(node.id);
    if (!box) {
      return node;
    }
    if (
      Math.abs(box.x - node.position.x) < POSITION_EPSILON &&
      Math.abs(box.y - node.position.y) < POSITION_EPSILON
    ) {
      return node;
    }
    changed = true;
    return { ...node, position: { x: box.x, y: box.y } };
  });
  return changed ? result : nodes;
}

/**
 * Iterative pairwise separation. In-place (Gauss-Seidel) so a push propagates
 * along chains within a single sweep; converges in a handful of iterations.
 *
 * Pair eligibility: at least one side must be awake (an active node, or a
 * pushable node already disturbed this frame) and at least one side must be
 * movable. This keeps untouched pre-existing overlaps intact.
 */
function solve(boxes: SolverBox[]): void {
  // Keep the original pair order, but skip sleeping/sleeping pairs entirely.
  // A sparse canvas with one dragged node now scans O(n) eligible pairs,
  // instead of visiting every pair just to discover that both are asleep.
  const awakeIndices = boxes.flatMap((box, index) =>
    box.awake ? [index] : []
  );
  const wake = (index: number) => {
    const box = boxes[index]!;
    if (box.awake) {
      return;
    }
    box.awake = true;
    const next = awakeIndices.findIndex((awakeIndex) => awakeIndex > index);
    awakeIndices.splice(next < 0 ? awakeIndices.length : next, 0, index);
  };
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let moved = false;

    for (let i = 0; i < boxes.length; i += 1) {
      const a = boxes[i]!;
      let awakeCursor = 0;
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (!a.awake) {
          while (
            awakeCursor < awakeIndices.length &&
            awakeIndices[awakeCursor]! < j
          ) {
            awakeCursor += 1;
          }
          if (awakeCursor === awakeIndices.length) {
            break;
          }
          j = awakeIndices[awakeCursor]!;
        }
        const b = boxes[j]!;
        if (a.pinned && b.pinned) {
          continue;
        }
        if (!(a.awake || b.awake)) {
          continue;
        }

        const pad = Math.max(a.pad, b.pad);
        const dx = a.x + a.width / 2 - (b.x + b.width / 2);
        const dy = a.y + a.height / 2 - (b.y + b.height / 2);
        const px = (a.width + b.width) / 2 + pad - Math.abs(dx);
        const py = (a.height + b.height) / 2 + pad - Math.abs(dy);
        if (px <= OVERLAP_EPSILON || py <= OVERLAP_EPSILON) {
          continue;
        }

        moved = true;
        if (px < py) {
          const sign = dx > 0 ? 1 : -1;
          if (a.pinned) {
            b.x -= px * sign;
            wake(j);
          } else if (b.pinned) {
            a.x += px * sign;
            wake(i);
          } else {
            a.x += (px / 2) * sign;
            b.x -= (px / 2) * sign;
            wake(i);
            wake(j);
          }
        } else {
          const sign = dy > 0 ? 1 : -1;
          if (a.pinned) {
            b.y -= py * sign;
            wake(j);
          } else if (b.pinned) {
            a.y += py * sign;
            wake(i);
          } else {
            a.y += (py / 2) * sign;
            b.y -= (py / 2) * sign;
            wake(i);
            wake(j);
          }
        }
      }
    }

    if (!moved) {
      break;
    }
  }
}
