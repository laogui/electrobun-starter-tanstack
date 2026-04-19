import type { Node } from '@xyflow/react';

import {
  CARD_H,
  CARD_W,
  FOLDER_H,
  FOLDER_W,
  IMAGE_H,
  IMAGE_W,
  STICKY_H,
  STICKY_W,
} from './canvasConstants';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  height: number;
  width: number;
}

export interface Rect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export type Direction = 'down' | 'left' | 'right' | 'up';

const DEFAULT_GROUP_W = 500;
const DEFAULT_GROUP_H = 300;

export const GRID_STEP = 40;
export const MAX_SCAN_RADIUS = 40;

function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function getNodeSize(node: Node): Size {
  const style = node.style as Record<string, unknown> | undefined;
  const width =
    node.measured?.width ??
    pickNumber(style?.width) ??
    defaultW(node.type ?? '');
  const height =
    node.measured?.height ??
    pickNumber(style?.height) ??
    defaultH(node.type ?? '');
  return { width, height };
}

function defaultW(type: string): number {
  switch (type) {
    case 'card':
      return CARD_W;
    case 'image':
      return IMAGE_W;
    case 'folder':
      return FOLDER_W;
    case 'sticky':
      return STICKY_W;
    case 'group':
      return DEFAULT_GROUP_W;
    default:
      return CARD_W;
  }
}

function defaultH(type: string): number {
  switch (type) {
    case 'card':
      return CARD_H;
    case 'image':
      return IMAGE_H;
    case 'folder':
      return FOLDER_H;
    case 'sticky':
      return STICKY_H;
    case 'group':
      return DEFAULT_GROUP_H;
    default:
      return CARD_H;
  }
}

/** Build absolute rects for every node, accounting for nested parent offsets. */
export function buildAbsoluteRects(nodes: Node[]): Map<string, Rect> {
  const byId = new Map<string, Node>();
  for (const n of nodes) {
    byId.set(n.id, n);
  }
  const resolved = new Map<string, Point>();

  const resolve = (node: Node): Point => {
    const cached = resolved.get(node.id);
    if (cached) {
      return cached;
    }
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const parentPos = parent ? resolve(parent) : { x: 0, y: 0 };
    const abs = {
      x: parentPos.x + node.position.x,
      y: parentPos.y + node.position.y,
    };
    resolved.set(node.id, abs);
    return abs;
  };

  const result = new Map<string, Rect>();
  for (const node of nodes) {
    const { x, y } = resolve(node);
    const { width, height } = getNodeSize(node);
    result.set(node.id, {
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
    });
  }
  return result;
}

export function rectFromAnchor(anchor: Point, size: Size): Rect {
  return {
    left: anchor.x,
    top: anchor.y,
    right: anchor.x + size.width,
    bottom: anchor.y + size.height,
  };
}

export function inflateRect(rect: Rect, padding: number): Rect {
  return {
    left: rect.left - padding,
    top: rect.top - padding,
    right: rect.right + padding,
    bottom: rect.bottom + padding,
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

export function isPointInside(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

export function isPositionAvailable(
  anchor: Point,
  size: Size,
  nodeRects: Iterable<Rect>,
  obstacles: Iterable<Rect> = []
): boolean {
  const candidate = rectFromAnchor(anchor, size);
  for (const r of nodeRects) {
    if (rectsIntersect(candidate, r)) {
      return false;
    }
  }
  for (const r of obstacles) {
    if (rectsIntersect(candidate, r)) {
      return false;
    }
  }
  return true;
}

function candidateOffsets(radius: number): Point[] {
  const offsets: Point[] = [];
  const step = GRID_STEP;
  for (let dx = -radius; dx <= radius; dx += 1) {
    offsets.push({ x: dx * step, y: -radius * step });
    offsets.push({ x: dx * step, y: radius * step });
  }
  for (let dy = -radius + 1; dy <= radius - 1; dy += 1) {
    offsets.push({ x: -radius * step, y: dy * step });
    offsets.push({ x: radius * step, y: dy * step });
  }
  return offsets;
}

function squaredDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function axisCandidates(base: number, radius: number): number[] {
  const values = [base];
  for (let offset = 1; offset <= radius; offset += 1) {
    values.push(base + offset * GRID_STEP, base - offset * GRID_STEP);
  }
  return values;
}

export function findNearestFreePosition(
  desired: Point,
  size: Size,
  nodeRects: Rect[],
  obstacles: Rect[] = []
): Point | null {
  if (isPositionAvailable(desired, size, nodeRects, obstacles)) {
    return desired;
  }
  let best: Point | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let radius = 1; radius <= MAX_SCAN_RADIUS; radius += 1) {
    for (const offset of candidateOffsets(radius)) {
      const candidate = { x: desired.x + offset.x, y: desired.y + offset.y };
      if (!isPositionAvailable(candidate, size, nodeRects, obstacles)) {
        continue;
      }
      const score = squaredDistance(desired, candidate);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best) {
      return best;
    }
  }
  return null;
}

export function findNearestFreePositionWithinBounds(
  desired: Point,
  size: Size,
  bounds: Rect,
  nodeRects: Rect[],
  obstacles: Rect[] = []
): Point | null {
  const fits = (anchor: Point): boolean =>
    anchor.x >= bounds.left &&
    anchor.y >= bounds.top &&
    anchor.x + size.width <= bounds.right &&
    anchor.y + size.height <= bounds.bottom;

  if (
    fits(desired) &&
    isPositionAvailable(desired, size, nodeRects, obstacles)
  ) {
    return desired;
  }
  let best: Point | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let radius = 1; radius <= MAX_SCAN_RADIUS; radius += 1) {
    for (const offset of candidateOffsets(radius)) {
      const candidate = { x: desired.x + offset.x, y: desired.y + offset.y };
      if (!fits(candidate)) {
        continue;
      }
      if (!isPositionAvailable(candidate, size, nodeRects, obstacles)) {
        continue;
      }
      const score = squaredDistance(desired, candidate);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best) {
      return best;
    }
  }
  return null;
}

/** Compute shortest-escape directions sorted by penetration depth (smallest first). */
export function getEscapeDirections(moving: Rect, blocker: Rect): Direction[] {
  const pen: Record<Direction, number> = {
    left: Math.abs(moving.right - blocker.left),
    right: Math.abs(blocker.right - moving.left),
    up: Math.abs(moving.bottom - blocker.top),
    down: Math.abs(blocker.bottom - moving.top),
  };
  return (['right', 'down', 'left', 'up'] as Direction[]).sort(
    (a, b) => pen[a] - pen[b]
  );
}

export interface StoredOrigin {
  parentId?: string;
  position: Point;
}

/**
 * Pure repulsion engine. Given the already-updated nodes (with the active node
 * at its new position/size), push every overlapping non-exempt node to the
 * nearest free slot.
 */
export function applyRepulsion(params: {
  activeNodeId: string;
  exemptIds: Set<string>;
  gap?: number;
  nodes: Node[];
  pushedOrigins: Map<string, StoredOrigin>;
}): Node[] {
  const { activeNodeId, exemptIds, gap = 20, nodes, pushedOrigins } = params;
  const rects = buildAbsoluteRects(nodes);
  const activeRect = rects.get(activeNodeId);
  if (!activeRect) {
    return nodes;
  }

  const activeNode = nodes.find((n) => n.id === activeNodeId);
  const inflatedActive = inflateRect(activeRect, gap);

  const result = nodes.map((n) => {
    if (n.id === activeNodeId) {
      return n;
    }
    // Skip children of the active node (they move with it)
    if (n.parentId === activeNodeId) {
      return n;
    }
    // Skip exempt nodes (drop target, parent of active, etc.)
    if (exemptIds.has(n.id)) {
      return n;
    }
    // Skip children whose parent is the active node's parent (sibling inside same group)
    // but only if the active node is also inside that group
    if (
      n.parentId &&
      activeNode?.parentId &&
      n.parentId === activeNode.parentId
    ) {
      // Both are siblings — still apply repulsion between siblings
    }

    // Use stored original position for overlap test to avoid cascading drift
    const orig = pushedOrigins.get(n.id);
    const nSize = getNodeSize(n);
    let origAbsX: number;
    let origAbsY: number;
    if (orig) {
      if (orig.parentId) {
        const parentNode = nodes.find((p) => p.id === orig.parentId);
        if (parentNode) {
          const parentAbs = rects.get(parentNode.id);
          origAbsX = orig.position.x + (parentAbs?.left ?? 0);
          origAbsY = orig.position.y + (parentAbs?.top ?? 0);
        } else {
          origAbsX = orig.position.x;
          origAbsY = orig.position.y;
        }
      } else {
        origAbsX = orig.position.x;
        origAbsY = orig.position.y;
      }
    } else {
      const nRect = rects.get(n.id);
      if (!nRect) {
        return n;
      }
      origAbsX = nRect.left;
      origAbsY = nRect.top;
    }

    const origRect: Rect = {
      left: origAbsX,
      top: origAbsY,
      right: origAbsX + nSize.width,
      bottom: origAbsY + nSize.height,
    };

    if (!rectsIntersect(origRect, inflatedActive)) {
      // No longer overlapping — restore if previously pushed
      if (orig) {
        pushedOrigins.delete(n.id);
        return { ...n, position: { ...orig.position } };
      }
      return n;
    }

    // Store original position once
    if (!pushedOrigins.has(n.id)) {
      pushedOrigins.set(n.id, {
        position: { ...n.position },
        parentId: n.parentId,
      });
    }

    const directions = getEscapeDirections(origRect, activeRect);

    // Build obstacle rects: all other nodes except the one being pushed and the active node
    const obstacles = nodes
      .filter(
        (o) =>
          o.id !== n.id &&
          o.id !== activeNodeId &&
          // Don't treat parent group as obstacle for its own children
          o.id !== n.parentId
      )
      .map((o) => rects.get(o.id))
      .filter((r): r is Rect => r !== undefined)
      .map((r) => inflateRect(r, 2));

    const found = findNearestFreePositionAroundBounds({
      desired: { x: origAbsX, y: origAbsY },
      size: nSize,
      bounds: inflatedActive,
      directions,
      gap: 0,
      nodeRects: [],
      obstacles,
    });

    if (!found) {
      return n;
    }

    // Convert absolute position back to local coords if node has a parent
    let localX = found.x;
    let localY = found.y;
    if (n.parentId) {
      const parentAbs = rects.get(n.parentId);
      if (parentAbs) {
        localX -= parentAbs.left;
        localY -= parentAbs.top;
      }
    }

    return { ...n, position: { x: localX, y: localY } };
  });

  return result;
}

export function findNearestFreePositionAroundBounds(params: {
  bounds: Rect;
  desired: Point;
  directions: Direction[];
  gap: number;
  nodeRects: Rect[];
  obstacles?: Rect[];
  size: Size;
}): Point | null {
  const {
    bounds,
    desired,
    directions,
    gap,
    nodeRects,
    obstacles = [],
    size,
  } = params;
  for (let layer = 0; layer <= MAX_SCAN_RADIUS; layer += 1) {
    for (const dir of directions) {
      const offset = layer * GRID_STEP;
      if (dir === 'right') {
        const x = bounds.right + gap + offset;
        for (const y of axisCandidates(desired.y, layer)) {
          if (isPositionAvailable({ x, y }, size, nodeRects, obstacles)) {
            return { x, y };
          }
        }
      } else if (dir === 'left') {
        const x = bounds.left - size.width - gap - offset;
        for (const y of axisCandidates(desired.y, layer)) {
          if (isPositionAvailable({ x, y }, size, nodeRects, obstacles)) {
            return { x, y };
          }
        }
      } else if (dir === 'down') {
        const y = bounds.bottom + gap + offset;
        for (const x of axisCandidates(desired.x, layer)) {
          if (isPositionAvailable({ x, y }, size, nodeRects, obstacles)) {
            return { x, y };
          }
        }
      } else {
        const y = bounds.top - size.height - gap - offset;
        for (const x of axisCandidates(desired.x, layer)) {
          if (isPositionAvailable({ x, y }, size, nodeRects, obstacles)) {
            return { x, y };
          }
        }
      }
    }
  }
  return null;
}
