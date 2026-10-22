import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
// Split out of canvasStore.ts; see store/canvasStore.ts for composition.

export function cleanNodeForClipboard(node: Node): Node {
  const { isHidden, isDropTarget, ...cleanData } = node.data as any;
  return { ...node, data: cleanData };
}

export function cleanEdgeForClipboard(edge: Edge): Edge {
  const { selected: _selected, ...clean } = edge as Edge & {
    selected?: boolean;
  };
  return clean as Edge;
}

export function getInternalEdgesForNodes(
  edges: Edge[],
  nodeIds: Set<string>
): Edge[] {
  const internalEdges: Edge[] = [];
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      internalEdges.push(cleanEdgeForClipboard(edge));
    }
  }
  return internalEdges;
}

export function buildPastedClipboard(
  clipboard: Node[],
  clipboardEdges: Edge[],
  currentNodes: Node[],
  offset: number
): { edges: Edge[]; nodes: Node[] } {
  const existingIds = new Set(currentNodes.map((n) => n.id));
  const clipboardIds = new Set(clipboard.map((n) => n.id));

  const idMap = new Map<string, string>(
    clipboard.map((n) => [n.id, `paste-${nanoid(8)}`])
  );

  const nodes = clipboard.map((n) => {
    const newId = idMap.get(n.id)!;
    const { parentId, extent, ...rest } = n as any;
    const remappedParentId =
      parentId != null
        ? clipboardIds.has(parentId)
          ? idMap.get(parentId)
          : existingIds.has(parentId)
            ? parentId
            : null
        : null;

    return {
      ...rest,
      ...(remappedParentId != null
        ? { parentId: remappedParentId, extent }
        : {}),
      id: newId,
      position: { x: n.position.x + offset, y: n.position.y + offset },
      selected: true,
    } as Node;
  });

  const edges = clipboardEdges.flatMap((edge) => {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!(source && target)) {
      return [];
    }
    const rest = cleanEdgeForClipboard(edge);
    return [
      {
        ...rest,
        id: `paste-edge-${nanoid(8)}`,
        source,
        target,
      } as Edge,
    ];
  });

  return { edges, nodes };
}
