// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import StickyNode from './StickyNode';

const updateNodeDataMock = vi.fn();
const isZoomedOutMock = vi.fn(() => false);

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
}));

vi.mock('@/contexts/ZoomLevelContext', () => ({
  useIsZoomedOut: () => isZoomedOutMock(),
}));

const saveSnapshotMock = vi.fn();
const setEditingStickyIdMock = vi.fn();

const storeState: {
  commitNodeData: typeof updateNodeDataMock;
  editingStickyId: string | null;
  nodes: Array<{ id: string; selected?: boolean }>;
  saveSnapshot: typeof saveSnapshotMock;
  setEditingStickyId: typeof setEditingStickyIdMock;
} = {
  commitNodeData: updateNodeDataMock,
  editingStickyId: null,
  nodes: [],
  saveSnapshot: saveSnapshotMock,
  setEditingStickyId: setEditingStickyIdMock,
};

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    {
      getState: () => storeState,
    }
  ),
}));

vi.mock('@/components/card/useNodeTagEditing', () => ({
  useNodeTagEditing: () => ({
    dimmedByFilter: false,
    tag: undefined,
    tagColor: undefined,
    tagEditor: null,
    tags: [],
  }),
}));

describe('StickyNode', () => {
  afterEach(() => {
    updateNodeDataMock.mockReset();
    setEditingStickyIdMock.mockReset();
    isZoomedOutMock.mockReset();
    isZoomedOutMock.mockReturnValue(false);
    storeState.nodes = [];
    storeState.editingStickyId = null;
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
    fireEvent.doubleClick(content.parentElement?.parentElement!);
    content.textContent = 'Updated note';
    fireEvent.blur(content);

    expect(updateNodeDataMock).toHaveBeenCalledWith('sticky-1', {
      content: 'Updated note',
    });
  });

  it('does not enter edit mode when clicking an unselected sticky', () => {
    vi.useFakeTimers();
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Select me' }}
        id="sticky-click"
      />
    );

    const content = screen.getByText('Select me');
    const visual = content.parentElement?.parentElement!;
    fireEvent.pointerDown(visual);
    fireEvent.click(visual);
    vi.advanceTimersByTime(20);
    expect(content.getAttribute('contenteditable')).toBe('false');
    vi.useRealTimers();
  });

  it('enters edit mode when clicking the already-selected sticky', () => {
    vi.useFakeTimers();
    storeState.nodes = [{ id: 'sticky-selected', selected: true }];
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Edit me' }}
        id="sticky-selected"
      />
    );

    const content = screen.getByText('Edit me');
    const visual = content.parentElement?.parentElement!;
    fireEvent.pointerDown(visual);
    fireEvent.click(visual);
    vi.advanceTimersByTime(20);
    expect(content.getAttribute('contenteditable')).toBe('true');
    vi.useRealTimers();
  });

  it('does not enter edit mode on shift-click (multi-select)', () => {
    vi.useFakeTimers();
    storeState.nodes = [{ id: 'sticky-shift', selected: true }];
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Shift me' }}
        id="sticky-shift"
      />
    );

    const content = screen.getByText('Shift me');
    const visual = content.parentElement?.parentElement!;
    fireEvent.pointerDown(visual, { shiftKey: true });
    fireEvent.click(visual, { shiftKey: true });
    vi.advanceTimersByTime(20);
    expect(content.getAttribute('contenteditable')).toBe('false');
    vi.useRealTimers();
  });

  it('enters edit mode when an editingStickyId request targets this node', () => {
    vi.useFakeTimers();
    storeState.editingStickyId = 'sticky-enter';
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Via Enter' }}
        id="sticky-enter"
      />
    );

    vi.advanceTimersByTime(20);
    const content = screen.getByText('Via Enter');
    expect(content.getAttribute('contenteditable')).toBe('true');
    expect(setEditingStickyIdMock).toHaveBeenCalledWith(null);
    vi.useRealTimers();
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
    fireEvent.doubleClick(content.parentElement?.parentElement!);
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
    isZoomedOutMock.mockReturnValue(true);
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
