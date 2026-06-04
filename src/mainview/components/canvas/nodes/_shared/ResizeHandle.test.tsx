// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';

import { ResizeHandle } from './ResizeHandle';

vi.mock('@xyflow/react', () => ({
  NodeResizeControl: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('ResizeHandle', () => {
  afterEach(() => {
    useCanvasStore.getState().reset();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('resizes the node with arrow keys', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: {},
          style: { width: 100, height: 120 },
        },
      ],
    });

    render(
      <ResizeHandle
        hoverClassName="opacity-100"
        maxHeight={200}
        maxWidth={200}
        minHeight={80}
        minWidth={80}
        nodeId="node-1"
      />
    );

    const handle = screen.getByRole('button', { name: 'Resize node' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowDown', shiftKey: true });

    expect(useCanvasStore.getState().nodes[0]?.style).toMatchObject({
      width: 108,
      height: 144,
    });
  });

  it('clamps keyboard resizing to min and max bounds', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: {},
          style: { width: 84, height: 196 },
        },
      ],
    });

    render(
      <ResizeHandle
        hoverClassName="opacity-100"
        maxHeight={200}
        maxWidth={200}
        minHeight={80}
        minWidth={80}
        nodeId="node-1"
      />
    );

    const handle = screen.getByRole('button', { name: 'Resize node' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });

    expect(useCanvasStore.getState().nodes[0]?.style).toMatchObject({
      width: 80,
      height: 200,
    });
  });
});
