// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';
import FolderNode from './FolderNode';

const useViewportMock = vi.fn(() => ({ zoom: 1 }));
const commitNodeDataMock = vi.fn();

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
  beforeEach(() => {
    useCanvasStore.setState({
      commitNodeData: commitNodeDataMock,
      renamingFolderId: null,
    });
  });

  afterEach(() => {
    commitNodeDataMock.mockReset();
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
          children: [{ id: 'a' }, { id: 'b' }],
          subtitle: '12 children',
          title: 'Research',
        }}
        id="folder-1"
      />
    );

    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
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
        id="folder-2"
      />
    );

    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Hidden subtitle')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'start resize' }));
    expect(document.body.classList.contains('resizing-nwse')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'end resize' }));
    expect(document.body.classList.contains('resizing-nwse')).toBe(false);
  });

  it('renames the folder title after the context menu requests editing', async () => {
    const keydownSpy = vi.fn();
    globalThis.addEventListener('keydown', keydownSpy);

    render(
      <FolderNode
        data={{
          subtitle: '12 children',
          title: 'Research',
        }}
        id="folder-3"
      />
    );

    const title = screen.getByText('Research');

    act(() => {
      useCanvasStore.getState().setRenamingFolderId('folder-3');
    });

    await waitFor(() => {
      expect(title).toHaveAttribute('contenteditable', 'true');
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(title);
    });

    title.textContent = 'Designs';
    fireEvent.keyDown(title, { key: 'Enter' });

    expect(commitNodeDataMock).toHaveBeenCalledWith('folder-3', {
      title: 'Designs',
    });
    expect(keydownSpy).not.toHaveBeenCalled();

    globalThis.removeEventListener('keydown', keydownSpy);
  });
});
