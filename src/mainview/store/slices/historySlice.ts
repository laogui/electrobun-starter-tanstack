import type { StateCreator } from 'zustand';
import type { UndoRedoState } from '@/lib/undoRedo';
import {
  createUndoRedoState,
  pushSnapshot,
  redo as redoSnapshot,
  undo as undoSnapshot,
} from '@/lib/undoRedo';
import { unifiedUndoHistory } from '@/lib/unifiedUndoHistory';
import type { CanvasState } from '../canvasStore';

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
