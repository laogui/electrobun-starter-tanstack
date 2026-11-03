/** Positions in persisted graphs are relative to parentId, including legacy nesting. */
export interface PositionedNode {
  id: string;
  parentId?: string;
  position: { x: number; y: number };
}
export function absoluteNodePosition(
  node: PositionedNode,
  nodes: readonly PositionedNode[]
) {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const visited = new Set([node.id]);
  const position = { ...node.position };
  let parentId = node.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) {
      break;
    }
    position.x += parent.position.x;
    position.y += parent.position.y;
    parentId = parent.parentId;
  }
  return position;
}

interface NodeBox extends PositionedNode {
  height?: number;
  measured?: { width?: number; height?: number };
  style?: { width?: unknown; height?: unknown };
  width?: number;
}
export function absoluteNodeCenter(
  node: NodeBox,
  nodes: readonly PositionedNode[]
) {
  const position = absoluteNodePosition(node, nodes);
  const width =
    node.measured?.width ??
    node.width ??
    (typeof node.style?.width === 'number' ? node.style.width : 240);
  const height =
    node.measured?.height ??
    node.height ??
    (typeof node.style?.height === 'number' ? node.style.height : 160);
  return { x: position.x + width / 2, y: position.y + height / 2 };
}
