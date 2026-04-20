// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FolderNode from './FolderNode';

const useViewportMock = vi.fn(() => ({ zoom: 1 }));

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
  NodeResizeControl: ({
    children,
    onResizeEnd,
    onResizeStart,
  }: {
    children: React.ReactNode;
    onResizeEnd?: () => void;
    onResizeStart?: () => void;
  }) => (
    <div>
      <button onClick={onResizeStart} type="button">
        start resize
      </button>
      <button onClick={onResizeEnd} type="button">
        end resize
      </button>
      {children}
    </div>
  ),
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
  useViewport: () => useViewportMock(),
}));

describe('FolderNode', () => {
  afterEach(() => {
    useViewportMock.mockReset();
    useViewportMock.mockReturnValue({ zoom: 1 });
    document.body.className = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders folder title and subtitle at normal zoom', () => {
    render(
      <FolderNode
        data={{
          subtitle: '12 children',
          title: 'Research',
        }}
      />
    );

    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('12 children')).toBeInTheDocument();
    expect(screen.getByTestId('handle-left')).toBeInTheDocument();
  });

  it('hides subtitle when zoomed out and toggles resize body class hooks', () => {
    useViewportMock.mockReturnValue({ zoom: 0.3 });

    render(
      <FolderNode
        data={{
          isDropTarget: true,
          isHidden: true,
          subtitle: 'Hidden subtitle',
          title: 'Archive',
        }}
      />
    );

    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Hidden subtitle')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'start resize' }));
    expect(document.body.classList.contains('resizing-nwse')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'end resize' }));
    expect(document.body.classList.contains('resizing-nwse')).toBe(false);
  });
});
