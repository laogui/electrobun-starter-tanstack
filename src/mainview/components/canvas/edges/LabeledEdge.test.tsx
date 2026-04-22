// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { Position } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LabeledEdge from './LabeledEdge';

const updateEdgeDataMock = vi.fn();
const setEditingEdgeIdMock = vi.fn();
const useCanvasStoreMock = vi.fn((selector) =>
  selector({
    editingEdgeId: null,
    setEditingEdgeId: setEditingEdgeIdMock,
    updateEdgeData: updateEdgeDataMock,
  })
);

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    BaseEdge: ({ className, path, style }: Record<string, unknown>) => (
      <div
        data-path={path}
        data-testid="base-edge"
        style={style as React.CSSProperties}
      >
        {String(className)}
      </div>
    ),
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    getBezierPath: () => ['bezier-path', 10, 20],
    getSmoothStepPath: () => ['smooth-path', 30, 40],
  };
});

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (selector: (state: unknown) => unknown) =>
    useCanvasStoreMock(selector),
}));

describe('LabeledEdge', () => {
  afterEach(() => {
    updateEdgeDataMock.mockReset();
    setEditingEdgeIdMock.mockReset();
    useCanvasStoreMock.mockClear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders smoothstep labels and opens editor on double click', () => {
    render(
      <LabeledEdge
        data={{ animated: true, label: 'Edge label', pathType: 'smoothstep' }}
        id="edge-1"
        selected={true}
        source="node-1"
        sourcePosition={Position.Right}
        sourceX={0}
        sourceY={0}
        target="node-2"
        targetPosition={Position.Left}
        targetX={100}
        targetY={100}
      />
    );

    expect(screen.getByTestId('base-edge')).toHaveAttribute(
      'data-path',
      'smooth-path'
    );
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Edge label' }));
    expect(setEditingEdgeIdMock).toHaveBeenCalledWith('edge-1');
  });

  it('renders bezier path and commits edited labels on blur and enter', () => {
    useCanvasStoreMock.mockImplementation((selector) =>
      selector({
        editingEdgeId: 'edge-2',
        setEditingEdgeId: setEditingEdgeIdMock,
        updateEdgeData: updateEdgeDataMock,
      })
    );

    render(
      <LabeledEdge
        data={{ label: ' Current ', pathType: 'bezier' }}
        id="edge-2"
        selected={false}
        source="node-1"
        sourcePosition={Position.Right}
        sourceX={0}
        sourceY={0}
        target="node-2"
        targetPosition={Position.Left}
        targetX={100}
        targetY={100}
      />
    );

    const input = screen.getByRole('textbox');
    expect(screen.getByTestId('base-edge')).toHaveAttribute(
      'data-path',
      'bezier-path'
    );

    fireEvent.change(input, { target: { value: ' Updated ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(updateEdgeDataMock).toHaveBeenCalledWith('edge-2', {
      label: 'Updated',
    });
    expect(setEditingEdgeIdMock).toHaveBeenCalledWith(null);

    fireEvent.change(input, { target: { value: 'Blurred' } });
    fireEvent.blur(input);
    expect(updateEdgeDataMock).toHaveBeenLastCalledWith('edge-2', {
      label: 'Blurred',
    });
  });

  it('cancels editing on escape', () => {
    useCanvasStoreMock.mockImplementation((selector) =>
      selector({
        editingEdgeId: 'edge-3',
        setEditingEdgeId: setEditingEdgeIdMock,
        updateEdgeData: updateEdgeDataMock,
      })
    );

    render(
      <LabeledEdge
        data={{ label: 'Draft' }}
        id="edge-3"
        selected={false}
        source="node-1"
        sourcePosition={Position.Right}
        sourceX={0}
        sourceY={0}
        target="node-2"
        targetPosition={Position.Left}
        targetX={100}
        targetY={100}
      />
    );

    expect(screen.getByTestId('base-edge')).toHaveAttribute(
      'data-path',
      'bezier-path'
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(setEditingEdgeIdMock).toHaveBeenCalledWith(null);
    expect(updateEdgeDataMock).not.toHaveBeenCalled();
  });
});
