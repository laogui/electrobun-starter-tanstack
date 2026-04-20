// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useHelperLines } from '@/hooks/useHelperLines';

const setNodesMock = vi.fn();
const saveSnapshotMock = vi.fn();
const applyCanvasNodeChangesMock = vi.fn();
const getHelperLinesMock = vi.fn();
const applyRepulsionMock = vi.fn();

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      setNodes: typeof setNodesMock;
      saveSnapshot: typeof saveSnapshotMock;
    }) => unknown
  ) => selector({ setNodes: setNodesMock, saveSnapshot: saveSnapshotMock }),
}));

vi.mock('@/lib/collision', () => ({
  applyRepulsion: (...args: Parameters<typeof applyRepulsionMock>) =>
    applyRepulsionMock(...args),
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
      nodes
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

  it('clears helper lines and still applies node changes when dragging stops', () => {
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
    expect(applyCanvasNodeChangesMock).toHaveBeenCalledWith(
      [
        {
          id: 'node-1',
          type: 'position',
          position: { x: 150, y: 150 },
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
    applyRepulsionMock.mockImplementation(({ nodes }) => nodes);
    setNodesMock.mockImplementation(
      (updater: (value: typeof nodes) => unknown) => {
        updater(nodes);
      }
    );

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'resize' }));

    expect(saveSnapshotMock).toHaveBeenCalled();
    expect(applyRepulsionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeNodeId: 'node-1',
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
    expect(applyRepulsionMock).toHaveBeenCalledTimes(1);
  });
});
