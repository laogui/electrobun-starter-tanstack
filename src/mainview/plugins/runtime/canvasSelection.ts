import type { Node } from '@xyflow/react';
import type {
  PlacementSelectionSnapshot,
  SelectionPlacement,
} from '../../../../packages/plugin-sdk';
import { EMPTY_PLACEMENTS } from './selection';

function contentReference(node: Node): SelectionPlacement['content'] {
  if (node.type === 'folder' || node.type === 'group') {
    return null;
  }
  for (const [field, kind] of [
    ['noteId', 'note'],
    ['widgetId', 'widget'],
    ['instanceId', 'extension'],
  ] as const) {
    const id = node.data[field];
    if (typeof id === 'string' && id) {
      return { id, kind };
    }
  }
  return null;
}

export function canvasSelection(state: {
  _hydrated: boolean;
  activeViewId: string;
  nodes: Node[];
}): PlacementSelectionSnapshot {
  if (!state._hydrated) {
    return EMPTY_PLACEMENTS;
  }
  return {
    viewId: state.activeViewId,
    items: state.nodes
      .filter((node) => node.selected && !node.hidden && !node.data.detached)
      .map((node) => ({ id: node.id, content: contentReference(node) }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}
