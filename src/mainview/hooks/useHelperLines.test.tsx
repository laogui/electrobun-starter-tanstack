// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useHelperLines } from '@/hooks/useHelperLines';

const setNodesMock = vi.fn();
const applyCanvasNodeChangesMock = vi.fn();
const getHelperLinesMock = vi.fn();

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: { setNodes: typeof setNodesMock }) => unknown
  ) => selector({ setNodes: setNodesMock }),
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
});
