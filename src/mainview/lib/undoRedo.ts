import type { Edge, Node } from '@xyflow/react';
import type { CanvasViewport } from '@/store/canvasStore';

export interface CanvasSnapshot {
  edges: Edge[];
  nodes: Node[];
  viewport?: CanvasViewport | null;
}

// Each snapshot holds *references* to the nodes/edges arrays at commit time.
// Because store updates are immutable, the arrays differ between snapshots but
// unchanged node objects are shared (structural sharing), so the true memory
// cost is roughly (MAX_HISTORY array shells) + (changed node objects), not
// MAX_HISTORY full deep copies.
const MAX_HISTORY = 50;

export interface UndoRedoState {
  future: CanvasSnapshot[];
  past: CanvasSnapshot[];
}

export function createUndoRedoState(): UndoRedoState {
  return { past: [], future: [] };
}

export function pushSnapshot(
  state: UndoRedoState,
  snapshot: CanvasSnapshot
): UndoRedoState {
  const past = [...state.past, snapshot].slice(-MAX_HISTORY);
  return { past, future: [] };
}

export function undo(
  state: UndoRedoState,
  current: CanvasSnapshot
): { state: UndoRedoState; snapshot: CanvasSnapshot } | null {
  if (state.past.length === 0) {
    return null;
  }
  const previous = state.past.at(-1)!;
  return {
    state: {
      past: state.past.slice(0, -1),
      future: [current, ...state.future],
    },
    snapshot: previous,
  };
}

export function redo(
  state: UndoRedoState,
  current: CanvasSnapshot
): { state: UndoRedoState; snapshot: CanvasSnapshot } | null {
  if (state.future.length === 0) {
    return null;
  }
  const next = state.future[0]!;
  return {
    state: {
      past: [...state.past, current],
      future: state.future.slice(1),
    },
    snapshot: next,
  };
}
