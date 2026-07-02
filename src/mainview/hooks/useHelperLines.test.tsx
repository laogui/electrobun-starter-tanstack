// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useHelperLines } from '@/hooks/useHelperLines';

const setNodesMock = vi.fn();
const saveSnapshotMock = vi.fn();
const applyCanvasNodeChangesMock = vi.fn();
const getHelperLinesMock = vi.fn();
const applyDragRepulsionMock = vi.fn();

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      setNodes: typeof setNodesMock;
      saveSnapshot: typeof saveSnapshotMock;
    }) => unknown
  ) => selector({ setNodes: setNodesMock, saveSnapshot: saveSnapshotMock }),
}));

vi.mock('@/lib/repulsion', () => ({
  REPULSION_GAP: 20,
  applyDragRepulsion: (...args: Parameters<typeof applyDragRepulsionMock>) =>
    applyDragRepulsionMock(...args),
  captureRepulsionOrigins: (
    nodes: Array<{
      id: string;
      parentId?: string;
      position: { x: number; y: number };
    }>
  ) => {
    const origins = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      if (!node.parentId) {
        origins.set(node.id, { x: node.position.x, y: node.position.y });
      }
    }
    return origins;
  },
}));

vi.mock('@/lib/applyCanvasNodeChanges', () => ({
  applyCanvasNodeChanges: (
    ...args: Parameters<typeof applyCanvasNodeChangesMock>
  ) => applyCanvasNodeChangesMock(...args),
}));

vi.mock('@/lib/getHelperLines', () => ({
  getHelperLines: (...args: Parameters<typeof getHelperLinesMock>) =>
    getHelperLinesMock(...args),
}));

const nodes = [
  { id: 'node-1', type: 'card', position: { x: 0, y: 0 }, data: {} },
  { id: 'node-2', type: 'card', position: { x: 200, y: 200 }, data: {} },
];

const Harness = () => {
  const { helperLineH, helperLineV, onNodesChange } = useHelperLines();

  return (
    <div>
      <button
        onClick={() => {
          onNodesChange([
            {
              id: 'node-1',
              type: 'position',
              position: { x: 103, y: 197 },
              dragging: true,
            },
          ] as never);
        }}
        type="button"
      >
        dragging-change
      </button>
      <button
        onClick={() => {
          onNodesChange([
            {
              id: 'node-1',
              type: 'position',
              position: { x: 150, y: 150 },
              dragging: false,
            },
          ] as never);
        }}
        type="button"
      >
        stop-drag
      </button>
      <button
        onClick={() => {
          onNodesChange([
            {
              id: 'node-1',
              type: 'dimensions',
              dimensions: { width: 400, height: 500 },
              resizing: true,
            },
          ] as never);
        }}
        type="button"
      >
        resize
      </button>
      <output aria-label="helper-h">{helperLineH ?? 'none'}</output>
      <output aria-label="helper-v">{helperLineV ?? 'none'}</output>
    </div>
  );
};

describe('useHelperLines', () => {
  it('applies snapping helper lines for dragging position changes', () => {
    getHelperLinesMock.mockReturnValue({
      horizontal: 200,
      vertical: 100,
      snapPosition: { x: 100, y: 200 },
    });
    applyCanvasNodeChangesMock.mockImplementation((changes) => changes);
    setNodesMock.mockImplementation(
      (updater: (value: typeof nodes) => unknown) => {
        updater(nodes);
      }
    );

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'dragging-change' }));

    expect(getHelperLinesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        position: { x: 100, y: 200 },
      }),
      nodes,
      new Set(['node-1'])
    );
    expect(applyCanvasNodeChangesMock).toHaveBeenCalledWith(
      [
        {
          id: 'node-1',
          type: 'position',
          position: { x: 100, y: 200 },
          dragging: true,
        },
      ],
      nodes
    );
    expect(screen.getByLabelText('helper-h')).toHaveTextContent('200');
    expect(screen.getByLabelText('helper-v')).toHaveTextContent('100');
  });

  it('clears helper lines and strips the release position so snapping sticks', () => {
    getHelperLinesMock.mockReset();
    applyCanvasNodeChangesMock.mockImplementation((changes) => changes);
    setNodesMock.mockImplementation(
      (updater: (value: typeof nodes) => unknown) => {
        updater(nodes);
      }
    );

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'stop-drag' }));

    expect(getHelperLinesMock).not.toHaveBeenCalled();
    // The store already holds the last (snapped) drag position; the release
    // change only clears the dragging flag.
    expect(applyCanvasNodeChangesMock).toHaveBeenCalledWith(
      [
        {
          id: 'node-1',
          type: 'position',
          position: undefined,
          dragging: false,
        },
      ],
      nodes
    );
    expect(screen.getByLabelText('helper-h')).toHaveTextContent('none');
    expect(screen.getByLabelText('helper-v')).toHaveTextContent('none');
  });

  it('applies repulsion when a node is being resized', () => {
    applyCanvasNodeChangesMock.mockImplementation((_changes, nds) => nds);
    applyDragRepulsionMock.mockImplementation(({ nodes: nds }) => nds);
    setNodesMock.mockImplementation(
      (updater: (value: typeof nodes) => unknown) => {
        updater(nodes);
      }
    );

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'resize' }));

    expect(saveSnapshotMock).toHaveBeenCalled();
    expect(applyDragRepulsionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeIds: new Set(['node-1']),
        origins: expect.any(Map),
      })
    );
  });

  it('clears resize tracking when resizing ends', () => {
    applyCanvasNodeChangesMock.mockImplementation((changes) => changes);
    setNodesMock.mockImplementation(
      (updater: (value: typeof nodes) => unknown) => {
        updater(nodes);
      }
    );

    const EndHarness = () => {
      const { helperLineH, helperLineV, onNodesChange } = useHelperLines();
      return (
        <div>
          <button
            onClick={() => {
              onNodesChange([
                {
                  id: 'node-1',
                  type: 'dimensions',
                  dimensions: { width: 400, height: 500 },
                  resizing: true,
                },
              ] as never);
            }}
            type="button"
          >
            start-resize
          </button>
          <button
            onClick={() => {
              onNodesChange([
                {
                  id: 'node-1',
                  type: 'dimensions',
                  dimensions: { width: 410, height: 510 },
                  resizing: false,
                },
              ] as never);
            }}
            type="button"
          >
            end-resize
          </button>
          <output aria-label="helper-h">{helperLineH ?? 'none'}</output>
          <output aria-label="helper-v">{helperLineV ?? 'none'}</output>
        </div>
      );
    };

    render(<EndHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'start-resize' }));
    fireEvent.click(screen.getByRole('button', { name: 'end-resize' }));

    expect(screen.getByLabelText('helper-h')).toHaveTextContent('none');
    expect(screen.getByLabelText('helper-v')).toHaveTextContent('none');
    expect(applyDragRepulsionMock).toHaveBeenCalledTimes(1);
  });
});
