import type { InternalNode, Node } from '@xyflow/react';
import { Position } from '@xyflow/react';

export interface XYPoint {
  x: number;
  y: number;
}

interface FloatingEdgeParams {
  sourcePosition: Position;
  sourceX: number;
  sourceY: number;
  targetPosition: Position;
  targetX: number;
  targetY: number;
}

interface FloatingSourceParams {
  sourcePos: Position;
  sx: number;
  sy: number;
}

const isMeasured = (
  node: InternalNode<Node> | null | undefined
): node is InternalNode<Node> =>
  Boolean(node?.internals && node.measured?.width && node.measured.height);

const getNodeSize = (node: InternalNode<Node>) => ({
  width: node.measured.width ?? 0,
  height: node.measured.height ?? 0,
});

const getNodeCenter = (node: InternalNode<Node>): XYPoint => {
  const { x, y } = node.internals.positionAbsolute;
  const { width, height } = getNodeSize(node);
  return { x: x + width / 2, y: y + height / 2 };
};

/**
 * Picks the side of `node` that faces `point` and returns its midpoint, so the
 * edge always anchors to the center of one of the four straight edges (matching
 * the visible handles). The aspect ratio is taken into account so wide or tall
 * cards still choose the visually closest side.
 */
const getSideAnchor = (
  node: InternalNode<Node>,
  point: XYPoint
): { anchor: XYPoint; position: Position } => {
  const { x, y } = node.internals.positionAbsolute;
  const { width, height } = getNodeSize(node);
  const center = getNodeCenter(node);

  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const w = width / 2 || 1;
  const h = height / 2 || 1;

  if (Math.abs(dx) / w >= Math.abs(dy) / h) {
    return dx >= 0
      ? { anchor: { x: x + width, y: center.y }, position: Position.Right }
      : { anchor: { x, y: center.y }, position: Position.Left };
  }

  return dy >= 0
    ? { anchor: { x: center.x, y: y + height }, position: Position.Bottom }
    : { anchor: { x: center.x, y }, position: Position.Top };
};

/**
 * Computes floating edge endpoints between two nodes. Each endpoint snaps to the
 * midpoint of the side facing the other card, so the edge picks the nearest edge
 * centers and never detours. Returns null until both nodes are measured, so
 * callers can fall back to the handle-based coords.
 */
export const getFloatingEdgeParams = (
  source: InternalNode<Node> | null | undefined,
  target: InternalNode<Node> | null | undefined
): FloatingEdgeParams | null => {
  if (!(isMeasured(source) && isMeasured(target))) {
    return null;
  }

  const sourceSide = getSideAnchor(source, getNodeCenter(target));
  const targetSide = getSideAnchor(target, getNodeCenter(source));

  return {
    sourceX: sourceSide.anchor.x,
    sourceY: sourceSide.anchor.y,
    targetX: targetSide.anchor.x,
    targetY: targetSide.anchor.y,
    sourcePosition: sourceSide.position,
    targetPosition: targetSide.position,
  };
};

/**
 * Computes a floating source endpoint snapped to the midpoint of the side of
 * `source` facing `point` (e.g. the pointer while dragging a new connection).
 * Returns null when the node has not been measured yet so callers can fall back
 * to handle coords.
 */
export const getFloatingSourceParams = (
  source: InternalNode<Node> | null | undefined,
  point: XYPoint
): FloatingSourceParams | null => {
  if (!isMeasured(source)) {
    return null;
  }

  const { anchor, position } = getSideAnchor(source, point);

  return {
    sx: anchor.x,
    sy: anchor.y,
    sourcePos: position,
  };
};
