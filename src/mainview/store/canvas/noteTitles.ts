import type { Node } from '@xyflow/react';
import { applyNoteTitlesToCanvasNodes } from '@/lib/noteTitleProjection';
import type { FocusedItem } from '../canvasStore';
// Split out of canvasStore.ts; see store/canvasStore.ts for composition.

export function noteTitleMap(
  titles: Record<string, string>
): Map<string, string> | null {
  const map = new Map(
    Object.entries(titles).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
  return map.size === 0 ? null : map;
}

export function projectNoteTitles(
  nodes: Node[],
  focusedNode: FocusedItem | null,
  map: Map<string, string>
): { focusedNode: FocusedItem | null; nodes: Node[] } {
  const nextNodes = applyNoteTitlesToCanvasNodes(nodes, map);
  const focused = focusedNode
    ? applyNoteTitlesToCanvasNodes(
        [
          {
            id: focusedNode.id,
            type: focusedNode.type,
            position: { x: 0, y: 0 },
            data: focusedNode.data,
          },
        ],
        map
      )[0]
    : undefined;
  return {
    nodes: nextNodes,
    focusedNode:
      focusedNode && focused
        ? { ...focusedNode, data: focused.data }
        : focusedNode,
  };
}
