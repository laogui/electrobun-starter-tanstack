import type { Edge, Node } from '@xyflow/react';
import type { CanvasViewport } from '@/store/canvasStore';
import {
  type NoteContentCache,
  registerHistoryNoteCache,
  rememberNoteContent,
  restoreHistoryNoteContent,
  stripHistoryNoteContent,
} from './canvasNoteHistory';

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
const contentCaches = new WeakMap<object, NoteContentCache>();
function cacheFor(state: UndoRedoState): NoteContentCache {
  let cache = contentCaches.get(state) ?? contentCaches.get(state.past);
  if (!cache) {
    cache = new Map();
    registerHistoryNoteCache(cache);
    contentCaches.set(state, cache);
  }
  return cache;
}
function carry(state: UndoRedoState, cache: NoteContentCache): UndoRedoState {
  contentCaches.set(state, cache);
  contentCaches.set(state.past, cache);
  return state;
}
function thin(snapshot: CanvasSnapshot): CanvasSnapshot {
  return { ...snapshot, nodes: stripHistoryNoteContent(snapshot.nodes) };
}

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
  const cache = cacheFor(state);
  rememberNoteContent(snapshot.nodes, cache);
  const past = [...state.past, thin(snapshot)].slice(-MAX_HISTORY);
  return carry({ past, future: [] }, cache);
}

export function undo(
  state: UndoRedoState,
  current: CanvasSnapshot
): { state: UndoRedoState; snapshot: CanvasSnapshot } | null {
  if (state.past.length === 0) {
    return null;
  }
  const cache = cacheFor(state);
  rememberNoteContent(current.nodes, cache);
  const previous = state.past.at(-1)!;
  return {
    state: carry(
      {
        past: state.past.slice(0, -1),
        future: [thin(current), ...state.future],
      },
      cache
    ),
    snapshot: {
      ...previous,
      nodes: restoreHistoryNoteContent(previous.nodes, cache),
    },
  };
}

export function redo(
  state: UndoRedoState,
  current: CanvasSnapshot
): { state: UndoRedoState; snapshot: CanvasSnapshot } | null {
  if (state.future.length === 0) {
    return null;
  }
  const cache = cacheFor(state);
  rememberNoteContent(current.nodes, cache);
  const next = state.future[0]!;
  return {
    state: carry(
      {
        past: [...state.past, thin(current)],
        future: state.future.slice(1),
      },
      cache
    ),
    snapshot: { ...next, nodes: restoreHistoryNoteContent(next.nodes, cache) },
  };
}
