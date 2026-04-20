// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GroupNode from './GroupNode';

const updateNodeDataMock = vi.fn();

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
  NodeResizer: ({ isVisible }: { isVisible: boolean }) => (
    <div data-testid="node-resizer">{isVisible ? 'visible' : 'hidden'}</div>
  ),
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: { updateNodeData: typeof updateNodeDataMock }) => unknown
  ) => selector({ updateNodeData: updateNodeDataMock }),
}));

describe('GroupNode', () => {
  afterEach(() => {
    updateNodeDataMock.mockReset();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders label, selected state, and active ring state', () => {
    const { container } = render(
      <GroupNode
        data={{ active: true, color: 'green', label: 'Planning' }}
        id="group-1"
        selected={true}
      />
    );

    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByTestId('node-resizer')).toHaveTextContent('visible');
    expect(container.querySelector('.selected')).not.toBeNull();
    expect(container.querySelector('.ring-2')).not.toBeNull();
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
