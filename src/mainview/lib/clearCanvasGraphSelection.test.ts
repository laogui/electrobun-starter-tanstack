import { describe, expect, it, vi } from 'vitest';

import { clearCanvasGraphSelection } from '@/lib/clearCanvasGraphSelection';

const setNodes = vi.fn();
const setEdges = vi.fn();

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: {
    getState: () => ({ setEdges, setNodes }),
  },
}));

describe('clearCanvasGraphSelection', () => {
  it('deselects only selected nodes and edges', () => {
    const selected = { id: 'a', selected: true };
    const plain = { id: 'b', selected: false };
    setNodes.mockImplementation(
      (updater: (items: (typeof selected)[]) => (typeof selected)[]) => {
        const next = updater([selected, plain]);
        expect(next[0]).toEqual({ id: 'a', selected: false });
        expect(next[1]).toBe(plain);
      }
    );
    const edgeSelected = { id: 'e1', selected: true };
    const edgePlain = { id: 'e2', selected: false };
    setEdges.mockImplementation(
      (
        updater: (
          items: Array<{ id: string; selected?: boolean }>
        ) => Array<{ id: string; selected?: boolean }>
      ) => {
        const next = updater([edgeSelected, edgePlain]);
        expect(next[0]).toEqual({ id: 'e1', selected: false });
        expect(next[1]).toBe(edgePlain);
      }
    );

    clearCanvasGraphSelection();
    expect(setNodes).toHaveBeenCalledTimes(1);
    expect(setEdges).toHaveBeenCalledTimes(1);
  });
});
