// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GroupNode from './GroupNode';

const updateNodeDataMock = vi.fn();
const updateNodeInternalsMock = vi.fn();

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
  NodeResizeControl: ({
    children,
    maxHeight,
    maxWidth,
    minHeight,
    minWidth,
    onResizeEnd,
    onResizeStart,
  }: {
    children: React.ReactNode;
    maxHeight?: number;
    maxWidth?: number;
    minHeight?: number;
    minWidth?: number;
    onResizeEnd?: () => void;
    onResizeStart?: () => void;
  }) => (
    <div
      data-max-height={maxHeight}
      data-max-width={maxWidth}
      data-min-height={minHeight}
      data-min-width={minWidth}
      data-testid="resize-control"
    >
      <button onClick={onResizeStart} type="button">
        start resize
      </button>
      <button onClick={onResizeEnd} type="button">
        end resize
      </button>
      {children}
    </div>
  ),
  useUpdateNodeInternals: () => updateNodeInternalsMock,
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
}));

const saveSnapshotMock = vi.fn();

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      commitNodeData: typeof updateNodeDataMock;
      saveSnapshot: typeof saveSnapshotMock;
    }) => unknown
  ) =>
    selector({
      commitNodeData: updateNodeDataMock,
      saveSnapshot: saveSnapshotMock,
    }),
}));

describe('GroupNode', () => {
  afterEach(() => {
    updateNodeDataMock.mockReset();
    updateNodeInternalsMock.mockReset();
    document.body.className = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders label, selected state, and refreshes node internals on mount', async () => {
    const { container } = render(
      <GroupNode
        data={{ active: true, color: 'green', label: 'Planning' }}
        id="group-1"
        selected={true}
      />
    );

    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByTestId('resize-control')).toBeInTheDocument();
    // Selection styling hangs off React Flow's wrapper `.selected` class via
    // the shared `.node-visual` rule; the group itself only flags drop-target.
    expect(container.querySelector('.node-visual')).not.toBeNull();
    expect(container.querySelector('.node-drop-target')).not.toBeNull();
    expect(container.querySelector('.ring-2')).toBeNull();
    await waitFor(() => {
      expect(updateNodeInternalsMock).toHaveBeenCalledWith('group-1');
    });
  });

  it('renders a hover resize affordance for unselected groups', () => {
    const { container } = render(
      <GroupNode
        data={{ active: false, color: 'blue', label: 'Unselected group' }}
        id="group-3"
        selected={false}
      />
    );

    expect(screen.getByTestId('resize-control')).toBeInTheDocument();
    expect(screen.getByTestId('resize-control')).toHaveAttribute(
      'data-min-width',
      '300'
    );
    expect(screen.getByTestId('resize-control')).toHaveAttribute(
      'data-min-height',
      '200'
    );
    expect(screen.getByTitle('Resize handle')).toBeInTheDocument();
    expect(
      container.querySelector('.group-hover\\/group-node\\:opacity-100')
    ).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'start resize' }));
    expect(saveSnapshotMock).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('resizing-nwse')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'end resize' }));
    expect(document.body.classList.contains('resizing-nwse')).toBe(false);
  });

  it('uses a grabbing cursor while the group is being dragged', () => {
    const { container } = render(
      <GroupNode
        data={{ active: false, color: 'blue', label: 'Dragging' }}
        dragging={true}
        id="group-drag"
        selected={false}
      />
    );

    expect(container.querySelector('.cursor-grabbing')).not.toBeNull();
  });

  it('clears the resize cursor if the node unmounts mid-resize', () => {
    const { unmount } = render(
      <GroupNode
        data={{ active: false, color: 'blue', label: 'Resize leak' }}
        id="group-unmount"
        selected={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'start resize' }));
    expect(document.body.classList.contains('resizing-nwse')).toBe(true);
    unmount();
    expect(document.body.classList.contains('resizing-nwse')).toBe(false);
  });

  it('updates label on blur and falls back to default label when cleared', () => {
    render(
      <GroupNode
        data={{ active: false, color: 'blue', label: 'Team' }}
        id="group-2"
        selected={false}
      />
    );

    const editable = screen.getByText('Team');

    fireEvent.doubleClick(editable);
    editable.textContent = 'Renamed';
    fireEvent.blur(editable);

    expect(updateNodeDataMock).toHaveBeenCalledWith('group-2', {
      label: 'Renamed',
    });

    fireEvent.doubleClick(editable);
    Object.defineProperty(editable, 'textContent', {
      configurable: true,
      value: '',
    });
    fireEvent.blur(editable);

    expect(updateNodeDataMock).toHaveBeenLastCalledWith('group-2', {
      label: 'Group',
    });
  });
});
