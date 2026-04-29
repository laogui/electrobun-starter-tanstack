// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import StickyNode from './StickyNode';

const updateNodeDataMock = vi.fn();
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

describe('StickyNode', () => {
  afterEach(() => {
    updateNodeDataMock.mockReset();
    useViewportMock.mockReset();
    useViewportMock.mockReturnValue({ zoom: 1 });
    document.body.className = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders sticky content and updates edited text on blur', () => {
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Remember this' }}
        id="sticky-1"
      />
    );

    const content = screen.getByText('Remember this');
    fireEvent.click(content.parentElement?.parentElement!);
    content.textContent = 'Updated note';
    fireEvent.blur(content);

    expect(updateNodeDataMock).toHaveBeenCalledWith('sticky-1', {
      content: 'Updated note',
    });
  });

  it('exits editing mode when Escape is pressed', () => {
    vi.useFakeTimers();
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Original' }}
        id="sticky-esc"
      />
    );

    const content = screen.getByText('Original');
    fireEvent.click(content.parentElement?.parentElement!);
    vi.advanceTimersByTime(20);
    expect(content.getAttribute('contenteditable')).toBe('true');

    content.textContent = 'Edited';
    fireEvent.keyDown(content, { key: 'Escape' });

    expect(content.getAttribute('contenteditable')).toBe('false');
    expect(updateNodeDataMock).toHaveBeenCalledWith('sticky-esc', {
      content: 'Edited',
    });
    vi.useRealTimers();
  });

  it('renders zoomed-out placeholder lines and hidden state support', () => {
    useViewportMock.mockReturnValue({ zoom: 0.2 });
    const { container } = render(
      <StickyNode
        data={{ color: '#ffee88', content: '', isHidden: true }}
        id="sticky-2"
      />
    );

    expect(screen.queryByText('Updated note')).toBeNull();
    expect(container.querySelector('.pointer-events-none')).not.toBeNull();
    expect(container.querySelectorAll('.bg-current')).toHaveLength(2);
  });

  it('toggles resize body classes', () => {
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Resize me' }}
        id="sticky-3"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'start resize' }));
    expect(document.body.classList.contains('resizing-nwse')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'end resize' }));
    expect(document.body.classList.contains('resizing-nwse')).toBe(false);
  });
});
