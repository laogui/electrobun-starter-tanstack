import type { Node, NodePositionChange } from '@xyflow/react';

type HelperLineResult = {
  horizontal: number | undefined;
  vertical: number | undefined;
  snapPosition: Partial<{ x: number; y: number }>;
};

const SNAP_THRESHOLD = 5;

// Node dimensions used for alignment (center, right, bottom)
const NODE_WIDTH: Record<string, number> = {
  card: 350,
  folder: 350,
};
const NODE_HEIGHT: Record<string, number> = {
  card: 450,
  folder: 350,
};

function getNodeDimensions(node: Node) {
  const style = node.style as Record<string, any> | undefined;
  const w = (node.measured?.width ?? style?.width ?? NODE_WIDTH[node.type ?? ''] ?? 350);
  const h = (node.measured?.height ?? style?.height ?? NODE_HEIGHT[node.type ?? ''] ?? 350);
  return { w, h };
}

export function getHelperLines(
  change: NodePositionChange,
  nodes: Node[]
): HelperLineResult {
  const result: HelperLineResult = {
    horizontal: undefined,
    vertical: undefined,
    snapPosition: {},
  };

  const draggingNode = nodes.find((n) => n.id === change.id);
  if (!draggingNode || !change.position) return result;

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

  for (const node of nodes) {
    if (node.id === change.id) continue;

    const { w: nodeW, h: nodeH } = getNodeDimensions(node);
    const nodeLeft = node.position.x;
    const nodeRight = node.position.x + nodeW;
    const nodeTop = node.position.y;
    const nodeBottom = node.position.y + nodeH;
    const nodeCenterX = node.position.x + nodeW / 2;
    const nodeCenterY = node.position.y + nodeH / 2;

    // Vertical alignment checks (x-axis snapping)
    const vChecks = [
      { dist: Math.abs(dragLeft - nodeLeft), snapX: nodeLeft, line: nodeLeft },
      { dist: Math.abs(dragRight - nodeRight), snapX: nodeRight - dragW, line: nodeRight },
      { dist: Math.abs(dragCenterX - nodeCenterX), snapX: nodeCenterX - dragW / 2, line: nodeCenterX },
      { dist: Math.abs(dragLeft - nodeRight), snapX: nodeRight, line: nodeRight },
      { dist: Math.abs(dragRight - nodeLeft), snapX: nodeLeft - dragW, line: nodeLeft },
    ];

    for (const { dist, snapX, line } of vChecks) {
      if (dist < minDistX) {
        minDistX = dist;
        result.vertical = line;
        result.snapPosition.x = snapX;
      }
    }

    // Horizontal alignment checks (y-axis snapping)
    const hChecks = [
      { dist: Math.abs(dragTop - nodeTop), snapY: nodeTop, line: nodeTop },
      { dist: Math.abs(dragBottom - nodeBottom), snapY: nodeBottom - dragH, line: nodeBottom },
      { dist: Math.abs(dragCenterY - nodeCenterY), snapY: nodeCenterY - dragH / 2, line: nodeCenterY },
      { dist: Math.abs(dragTop - nodeBottom), snapY: nodeBottom, line: nodeBottom },
      { dist: Math.abs(dragBottom - nodeTop), snapY: nodeTop - dragH, line: nodeTop },
    ];

    for (const { dist, snapY, line } of hChecks) {
      if (dist < minDistY) {
        minDistY = dist;
        result.horizontal = line;
        result.snapPosition.y = snapY;
      }
    }
  }

  return result;
}
