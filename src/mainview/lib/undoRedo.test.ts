import { describe, expect, it } from 'vitest';

import { createUndoRedoState, pushSnapshot, redo, undo } from '@/lib/undoRedo';
import type { CanvasSnapshot, UndoRedoState } from '@/lib/undoRedo';

function snap(label: string): CanvasSnapshot {
  return {
    nodes: [{ id: label, data: {}, position: { x: 0, y: 0 }, type: 'card' }],
    edges: [],
  };
}

describe('createUndoRedoState', () => {
  it('starts with empty past and future', () => {
    const state = createUndoRedoState();

    expect(state.past).toEqual([]);
    expect(state.future).toEqual([]);
  });
});

describe('pushSnapshot', () => {
  it('appends a snapshot to past and clears future', () => {
    let state = createUndoRedoState();
    state = pushSnapshot(state, snap('s1'));

    expect(state.past).toHaveLength(1);
    expect(state.past[0]!.nodes[0]!.id).toBe('s1');
    expect(state.future).toEqual([]);
  });

  it('clears future when pushing a new snapshot', () => {
    let state: UndoRedoState = {
      past: [snap('s1')],
      future: [snap('s3')],
    };
    state = pushSnapshot(state, snap('s2'));

    expect(state.past).toHaveLength(2);
    expect(state.future).toEqual([]);
  });

  it('caps history at 50 entries', () => {
    let state = createUndoRedoState();
    for (let i = 0; i < 60; i++) {
      state = pushSnapshot(state, snap(`s${i}`));
    }

    expect(state.past).toHaveLength(50);
    // The oldest entries should have been removed
    expect(state.past[0]!.nodes[0]!.id).toBe('s10');
  });
});

describe('undo', () => {
  it('returns null when past is empty', () => {
    const state = createUndoRedoState();
    const result = undo(state, snap('current'));

    expect(result).toBeNull();
  });

  it('restores the most recent snapshot and pushes current to future', () => {
    const state: UndoRedoState = {
      past: [snap('s1'), snap('s2')],
      future: [],
    };
    const current = snap('current');
    const result = undo(state, current)!;

    expect(result.snapshot.nodes[0]!.id).toBe('s2');
    expect(result.state.past).toHaveLength(1);
    expect(result.state.future).toHaveLength(1);
    expect(result.state.future[0]!.nodes[0]!.id).toBe('current');
  });
});

describe('redo', () => {
  it('returns null when future is empty', () => {
    const state = createUndoRedoState();
    const result = redo(state, snap('current'));

    expect(result).toBeNull();
  });

  it('restores the next future snapshot and pushes current to past', () => {
    const state: UndoRedoState = {
      past: [snap('s1')],
      future: [snap('s3'), snap('s4')],
    };
    const current = snap('current');
    const result = redo(state, current)!;

    expect(result.snapshot.nodes[0]!.id).toBe('s3');
    expect(result.state.past).toHaveLength(2);
    expect(result.state.past[1]!.nodes[0]!.id).toBe('current');
    expect(result.state.future).toHaveLength(1);
    expect(result.state.future[0]!.nodes[0]!.id).toBe('s4');
  });

  it('supports full undo-redo cycle', () => {
    let state = createUndoRedoState();
    state = pushSnapshot(state, snap('s1'));
    state = pushSnapshot(state, snap('s2'));
    const current = snap('s3');

    // undo once
    const undoResult = undo(state, current)!;
    expect(undoResult.snapshot.nodes[0]!.id).toBe('s2');

    // redo back
    const redoResult = redo(undoResult.state, undoResult.snapshot)!;
    expect(redoResult.snapshot.nodes[0]!.id).toBe('s3');
  });
});
