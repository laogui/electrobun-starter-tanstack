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

/**
 * Painted shell edge of FolderNode as fractions of the node box.
 * Derived from the folder SVG:
 *   viewBox="48 73 304 189"
 *   path left/right x=50/350, bottom y=260
 *
 * Handles and floating-edge fallbacks must share these so connection dots sit
 * on the shell stroke (not outside the bounding-box edge / transparent tab band).
 */
export const FOLDER_SHELL_EDGE = {
  /**
   * Top silhouette at the horizontal center (where the top handle sits).
   * Center x falls on the tab→body cubic, ~y=97.4 — not the flat body lip
   * (y=100), which sits a bit lower and made the handle feel too inset.
   */
  top: (97.4 - 73) / 189,
  left: (50 - 48) / 304,
  right: (352 - 350) / 304,
  bottom: (262 - 260) / 189,
} as const;

/** @deprecated Use FOLDER_SHELL_EDGE.top — kept for existing imports/tests. */
export const FOLDER_TOP_EDGE_INSET_RATIO = FOLDER_SHELL_EDGE.top;

const SHELL_EDGE_BY_TYPE: Readonly<
  Record<string, { top: number; right: number; bottom: number; left: number }>
> = {
  folder: FOLDER_SHELL_EDGE,
};

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
 * Prefer the measured handle so edge endpoints meet the connection dots.
 * Uses React Flow's outer-edge convention (same as getHandlePosition): the path
 * ends on the outer rim of the handle, not its center — otherwise top edges look
 * a few pixels too inset compared with other node types.
 */
const getHandleAnchor = (
  node: InternalNode<Node>,
  position: Position
): XYPoint | null => {
  const bounds = node.internals.handleBounds;
  if (!bounds) {
    return null;
  }
  // NodeHandles registers all four sides as `type="source"`; Loose mode still
  // connects to them. Merge both lists so target-only handles also work.
  const handles = [...(bounds.source ?? []), ...(bounds.target ?? [])];
  // DOM measurements store position as a string attribute ("top", …); compare
  // via String so enum/string mismatches never miss the handle.
  const handle = handles.find(
    (entry) => String(entry.position) === String(position)
  );
  if (!handle) {
    return null;
  }
  const x = node.internals.positionAbsolute.x + handle.x;
  const y = node.internals.positionAbsolute.y + handle.y;
  const { width, height } = handle;
  switch (position) {
    case Position.Top:
      return { x: x + width / 2, y };
    case Position.Right:
      return { x: x + width, y: y + height / 2 };
    case Position.Bottom:
      return { x: x + width / 2, y: y + height };
    case Position.Left:
      return { x, y: y + height / 2 };
    default:
      return { x: x + width / 2, y: y + height / 2 };
  }
};

const getNodeType = (node: InternalNode<Node>): string =>
  node.type ?? node.internals.userNode?.type ?? '';

const getBoxSideAnchor = (
  node: InternalNode<Node>,
  position: Position
): XYPoint => {
  const { x, y } = node.internals.positionAbsolute;
  const { width, height } = getNodeSize(node);
  const center = getNodeCenter(node);
  const shell = SHELL_EDGE_BY_TYPE[getNodeType(node)];
  const top = shell?.top ?? 0;
  const right = shell?.right ?? 0;
  const bottom = shell?.bottom ?? 0;
  const left = shell?.left ?? 0;
  // Folder CSS insets place the handle *center*. Box fallback must land on the
  // outer rim (RF convention) so top edges are not a few px too inset. Plain
  // rectangular nodes keep exact box midpoints.
  const handleHalf = shell ? 5 : 0;

  switch (position) {
    case Position.Right:
      return { x: x + width * (1 - right) + handleHalf, y: center.y };
    case Position.Left:
      return { x: x + width * left - handleHalf, y: center.y };
    case Position.Bottom:
      return { x: center.x, y: y + height * (1 - bottom) + handleHalf };
    case Position.Top:
      return { x: center.x, y: y + height * top - handleHalf };
    default:
      return center;
  }
};

/**
 * Picks the side of `node` that faces `point` and returns its midpoint, so the
 * edge always anchors to the center of one of the four straight edges (matching
 * the visible handles). The aspect ratio is taken into account so wide or tall
 * cards still choose the visually closest side.
 *
 * When handleBounds are available, the anchor is the measured handle so the
 * path ends on the purple connection dot. Otherwise falls back to the box side
 * (with per-type top insets for irregular shapes like folders).
 */
const getSideAnchor = (
  node: InternalNode<Node>,
  point: XYPoint
): { anchor: XYPoint; position: Position } => {
  const { width, height } = getNodeSize(node);
  const center = getNodeCenter(node);

  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const w = width / 2 || 1;
  const h = height / 2 || 1;

  const position =
    Math.abs(dx) / w >= Math.abs(dy) / h
      ? dx >= 0
        ? Position.Right
        : Position.Left
      : dy >= 0
        ? Position.Bottom
        : Position.Top;

  const anchor =
    getHandleAnchor(node, position) ?? getBoxSideAnchor(node, position);

  return { anchor, position };
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
