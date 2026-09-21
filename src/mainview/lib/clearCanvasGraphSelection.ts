import type { Edge, Node } from '@xyflow/react';

import { useCanvasStore } from '@/store/canvasStore';

function deselectItems<T extends { selected?: boolean }>(items: T[]): T[] {
  let changed = false;
  const next = items.map((item) => {
    if (!item.selected) {
      return item;
    }
    changed = true;
    return { ...item, selected: false };
  });
  return changed ? next : items;
}

/** Clear node and edge selection without cloning untouched items. */
export function clearCanvasGraphSelection(): void {
  const { setEdges, setNodes } = useCanvasStore.getState();
  setNodes((nodes: Node[]) => deselectItems(nodes));
  setEdges((edges: Edge[]) => deselectItems(edges));
}
