// Canvas store slice: Canvas snapshot history (undo/redo), registered with the unified undo timeline.

import type { Edge, Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import { topicCanvasWritePaused } from '@/lib/topicTree';
import type { UndoRedoState } from '@/lib/undoRedo';
import {
  createUndoRedoState,
  pushSnapshot,
  redo as redoSnapshot,
  undo as undoSnapshot,
} from '@/lib/undoRedo';
import { unifiedUndoHistory } from '@/lib/unifiedUndoHistory';
import type { FolderChildEntry } from '../canvas/folderChildren';
import type { CanvasState, FocusedItem } from '../canvasStore';

function reconcileFocus(
  item: FocusedItem | null,
  nodes: Node[]
): FocusedItem | null {
  if (!item) {
    return null;
  }
  if (item.folderId) {
    const children = nodes.find((node) => node.id === item.folderId)?.data
      .children;
    if (!Array.isArray(children)) {
      return null;
    }
    const child = (children as FolderChildEntry[]).find(
      (value) => value?.id === item.id
    );
    return child ? { ...item, data: child.data, type: child.type } : null;
  }
  const node = nodes.find((candidate) => candidate.id === item.id);
  return node ? { ...item, data: node.data, type: node.type } : null;
}

function restoredUi(state: CanvasState, nodes: Node[], edges: Edge[]) {
  return {
    focusedNode: reconcileFocus(state.focusedNode, nodes),
    focusedFolder: reconcileFocus(state.focusedFolder, nodes),
    topicWritePaused: topicCanvasWritePaused(nodes, edges),
    editingTopicId: null,
    topicCommandContextId: null,
    topicDraft: null,
    topicEditPreviews: {},
  };
}

export interface HistorySlice {
  // Undo / Redo
  _undoRedo: UndoRedoState;
  canRedo: () => boolean;
  canUndo: () => boolean;
  redo: () => boolean;
  saveSnapshot: () => void;
  undo: () => boolean;
}

export const createHistorySlice: StateCreator<
  CanvasState,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  _undoRedo: createUndoRedoState(),

  saveSnapshot: () => {
    const { nodes, edges, viewport, _undoRedo, activeViewId } = get();
    set({
      _undoRedo: pushSnapshot(_undoRedo, { nodes, edges, viewport }),
    });
    unifiedUndoHistory.recordCanvas(activeViewId);
  },

  // Note: undo/redo intentionally leave `viewport` / sessionViewport untouched.
  // The React Flow camera only reads the stored viewport on mount, so writing a
  // stale snapshot value back would not move the camera — it would only corrupt
  // the session cache and cause a jump when re-entering the view.
  undo: () => {
    const { nodes, edges, viewport, _undoRedo, activeViewId } = get();
    const result = undoSnapshot(_undoRedo, { nodes, edges, viewport });
    if (!result) {
      return false;
    }
    set({
      ...restoredUi(get(), result.snapshot.nodes, result.snapshot.edges),
      nodes: result.snapshot.nodes,
      edges: result.snapshot.edges,
      _undoRedo: result.state,
    });
    unifiedUndoHistory.observeCanvasTransition('undo', activeViewId);
    return true;
  },

  redo: () => {
    const { nodes, edges, viewport, _undoRedo, activeViewId } = get();
    const result = redoSnapshot(_undoRedo, { nodes, edges, viewport });
    if (!result) {
      return false;
    }
    set({
      ...restoredUi(get(), result.snapshot.nodes, result.snapshot.edges),
      nodes: result.snapshot.nodes,
      edges: result.snapshot.edges,
      _undoRedo: result.state,
    });
    unifiedUndoHistory.observeCanvasTransition('redo', activeViewId);
    return true;
  },

  canUndo: () => get()._undoRedo.past.length > 0,

  canRedo: () => get()._undoRedo.future.length > 0,
});
