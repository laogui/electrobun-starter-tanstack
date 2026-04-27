// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { Position } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LabeledEdge from './LabeledEdge';

const getBezierPathMock = vi.hoisted(() =>
  vi.fn(() => ['bezier-path', 10, 20])
);
const getSmoothStepPathMock = vi.hoisted(() =>
  vi.fn(() => ['smooth-path', 30, 40])
);
const updateEdgeDataMock = vi.fn();
const setEditingEdgeIdMock = vi.fn();
const useCanvasStoreMock = vi.fn((selector) =>
  selector({
    editingEdgeId: null,
    setEditingEdgeId: setEditingEdgeIdMock,
    updateEdgeData: updateEdgeDataMock,
    commitEdgeData: updateEdgeDataMock,
  })
);

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    BaseEdge: ({
      className,
      markerEnd,
      markerStart,
      path,
      style,
    }: Record<string, unknown>) => (
      <div
        data-marker-end={markerEnd}
        data-marker-start={markerStart}
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
    getBezierPath: getBezierPathMock,
    getSmoothStepPath: getSmoothStepPathMock,
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
    getBezierPathMock.mockClear();
    getSmoothStepPathMock.mockClear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders smoothstep labels and opens editor on double click', () => {
    render(
      <LabeledEdge
        data={{ animated: true, label: 'Edge label', pathType: 'smoothstep' }}
        id="edge-1"
        markerEnd="url(#compact-arrow)"
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
    expect(screen.getByTestId('base-edge')).toHaveAttribute(
      'data-marker-end',
      'url(#compact-arrow)'
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
        commitEdgeData: updateEdgeDataMock,
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

  it('reverses the rendered path when the edge direction was dragged backwards', () => {
    render(
      <LabeledEdge
        data={{ pathType: 'bezier', reverseVisualDirection: true }}
        id="edge-4"
        selected={false}
        source="node-1"
        sourcePosition={Position.Right}
        sourceX={10}
        sourceY={20}
        target="node-2"
        targetPosition={Position.Left}
        targetX={100}
        targetY={200}
      />
    );

    expect(getBezierPathMock).toHaveBeenCalledWith({
      sourcePosition: Position.Left,
      sourceX: 100,
      sourceY: 200,
      targetPosition: Position.Right,
      targetX: 10,
      targetY: 20,
    });
  });
});
