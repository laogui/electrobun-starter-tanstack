import type { Node, NodePositionChange } from '@xyflow/react';

interface HelperLineResult {
  horizontal: number | undefined;
  snapPosition: Partial<{ x: number; y: number }>;
  vertical: number | undefined;
}

const SNAP_THRESHOLD = 5;

// Node dimensions used for alignment (center, right, bottom)
const NODE_WIDTH: Record<string, number> = {
  card: 350,
  folder: 280,
};
const NODE_HEIGHT: Record<string, number> = {
  card: 450,
  folder: 280,
};

function getNodeDimensions(node: Node) {
  const style = node.style as Record<string, any> | undefined;
  const w =
    node.measured?.width ?? style?.width ?? NODE_WIDTH[node.type ?? ''] ?? 280;
  const h =
    node.measured?.height ??
    style?.height ??
    NODE_HEIGHT[node.type ?? ''] ??
    280;
  return { w, h };
}

export function getHelperLines(
  change: NodePositionChange,
  nodes: Node[],
  excludeIds?: Set<string>
): HelperLineResult {
  const result: HelperLineResult = {
    horizontal: undefined,
    vertical: undefined,
    snapPosition: {},
  };

  const draggingNode = nodes.find((n) => n.id === change.id);
  if (!(draggingNode && change.position)) {
    return result;
  }

  const dragPos = change.position;
  const { w: dragW, h: dragH } = getNodeDimensions(draggingNode);

  // Edges of dragging node
  const dragLeft = dragPos.x;
  const dragRight = dragPos.x + dragW;
  const dragTop = dragPos.y;
  const dragBottom = dragPos.y + dragH;
  const dragCenterX = dragPos.x + dragW / 2;
  const dragCenterY = dragPos.y + dragH / 2;

  let minDistX = SNAP_THRESHOLD;
  let minDistY = SNAP_THRESHOLD;

  // Runs on every drag frame for every node: keep it allocation-free.
  const considerX = (dist: number, snapX: number, line: number) => {
    if (dist < minDistX) {
      minDistX = dist;
      result.vertical = line;
      result.snapPosition.x = snapX;
    }
  };
  const considerY = (dist: number, snapY: number, line: number) => {
    if (dist < minDistY) {
      minDistY = dist;
      result.horizontal = line;
      result.snapPosition.y = snapY;
    }
  };

  for (const node of nodes) {
    if (node.id === change.id) {
      continue;
    }
    // Skip co-dragged nodes (they move with the reference node) and group
    // children (their positions are parent-relative, not canvas coords).
    if (excludeIds?.has(node.id) || node.parentId) {
      continue;
    }

    const { w: nodeW, h: nodeH } = getNodeDimensions(node);
    const { x: nodeX, y: nodeY } = node.position;
    const nodeLeft = nodeX;
    const nodeRight = nodeX + nodeW;
    const nodeTop = nodeY;
    const nodeBottom = nodeY + nodeH;
    const nodeCenterX = nodeX + nodeW / 2;
    const nodeCenterY = nodeY + nodeH / 2;

    // Vertical alignment checks (x-axis snapping)
    considerX(Math.abs(dragLeft - nodeLeft), nodeLeft, nodeLeft);
    considerX(Math.abs(dragRight - nodeRight), nodeRight - dragW, nodeRight);
    considerX(
      Math.abs(dragCenterX - nodeCenterX),
      nodeCenterX - dragW / 2,
      nodeCenterX
    );
    considerX(Math.abs(dragLeft - nodeRight), nodeRight, nodeRight);
    considerX(Math.abs(dragRight - nodeLeft), nodeLeft - dragW, nodeLeft);

    // Horizontal alignment checks (y-axis snapping)
    considerY(Math.abs(dragTop - nodeTop), nodeTop, nodeTop);
    considerY(
      Math.abs(dragBottom - nodeBottom),
      nodeBottom - dragH,
      nodeBottom
    );
    considerY(
      Math.abs(dragCenterY - nodeCenterY),
      nodeCenterY - dragH / 2,
      nodeCenterY
    );
    considerY(Math.abs(dragTop - nodeBottom), nodeBottom, nodeBottom);
    considerY(Math.abs(dragBottom - nodeTop), nodeTop - dragH, nodeTop);
  }

  return result;
}
