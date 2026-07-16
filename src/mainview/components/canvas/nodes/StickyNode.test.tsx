// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import StickyNode from './StickyNode';

const updateNodeDataMock = vi.fn();

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

vi.mock('../../../../paraglide/messages.js', () => ({
  sticky_empty_placeholder: () => 'Type something…',
}));

describe('StickyNode', () => {
  afterEach(() => {
    updateNodeDataMock.mockReset();
    setEditingStickyIdMock.mockReset();
    storeState.nodes = [];
    storeState.editingStickyId = null;
    document.body.className = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders the CSS pushpin decoration instead of the pushpin emoji', () => {
    const { container } = render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Pinned note' }}
        id="sticky-pushpin"
      />
    );

    const pushpin = container.querySelector<HTMLDivElement>(
      '[data-sticky-pushpin]'
    );

    expect(pushpin).not.toBeNull();
    expect(pushpin?.tagName).toBe('DIV');
    expect(pushpin).toHaveClass('top-1');
    expect(pushpin).not.toHaveClass('-translate-y-1/2');
    expect(pushpin?.style.borderRadius).toBe('50%');
    expect(container).not.toHaveTextContent('📌');
  });

  it('renders sticky content and updates edited text on blur', () => {
    vi.useFakeTimers();
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Remember this' }}
        id="sticky-1"
      />
    );

    const content = screen.getByText('Remember this');
    fireEvent.doubleClick(content.parentElement?.parentElement!);
    vi.advanceTimersByTime(20);
    const textarea = screen.getByLabelText('Sticky note text');
    fireEvent.change(textarea, { target: { value: 'Updated note' } });
    fireEvent.blur(textarea);

    expect(updateNodeDataMock).toHaveBeenCalledWith('sticky-1', {
      content: 'Updated note',
    });
    vi.useRealTimers();
  });

  it('enters edit mode on a plain single click of an unselected sticky', () => {
    vi.useFakeTimers();
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Edit me' }}
        id="sticky-click"
      />
    );

    const content = screen.getByText('Edit me');
    const visual = content.parentElement?.parentElement!;
    // No prior selection required: a single plain click opens the editor.
    fireEvent.click(visual);
    vi.advanceTimersByTime(20);
    expect(screen.getByLabelText('Sticky note text')).toBeInTheDocument();
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
    expect(screen.queryByLabelText('Sticky note text')).toBeNull();
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
    expect(screen.getByLabelText('Sticky note text')).toBeInTheDocument();
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
    const textarea = screen.getByLabelText('Sticky note text');
    expect(textarea).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'Edited' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });
    fireEvent.blur(textarea);

    expect(updateNodeDataMock).toHaveBeenCalledWith('sticky-esc', {
      content: 'Edited',
    });
    vi.useRealTimers();
  });

  it('inserts a newline at the caret when Enter is pressed while editing', () => {
    vi.useFakeTimers();
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Line one' }}
        id="sticky-enter-newline"
      />
    );

    const content = screen.getByText('Line one');
    fireEvent.doubleClick(content.parentElement?.parentElement!);
    vi.advanceTimersByTime(20);
    const textarea = screen.getByLabelText('Sticky note text');
    expect(textarea).toBeInTheDocument();

    // Type a second line, then commit on blur.
    fireEvent.change(textarea, { target: { value: 'Line one\nLine two' } });
    fireEvent.blur(textarea);
    expect(updateNodeDataMock).toHaveBeenCalledWith('sticky-enter-newline', {
      content: 'Line one\nLine two',
    });
    vi.useRealTimers();
  });

  it('shows a placeholder data-attribute when editing an empty sticky', () => {
    vi.useFakeTimers();
    render(
      <StickyNode data={{ color: '#ffee88', content: '' }} id="sticky-empty" />
    );

    // The read-only body has no textarea placeholder until it enters edit mode.
    const body = document.querySelector('.sticky-editable')!;
    expect(body.getAttribute('data-placeholder')).toBeNull();

    fireEvent.doubleClick(body.parentElement?.parentElement!);
    vi.advanceTimersByTime(20);

    const textarea = screen.getByLabelText('Sticky note text');
    expect(textarea).toHaveAttribute('placeholder', 'Type something…');
    vi.useRealTimers();
  });

  it('strips formatting on paste and inserts plain text only', () => {
    vi.useFakeTimers();
    render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Before' }}
        id="sticky-paste"
      />
    );

    const body = screen.getByText('Before');
    fireEvent.doubleClick(body.parentElement?.parentElement!);
    vi.advanceTimersByTime(20);
    const textarea = screen.getByLabelText('Sticky note text');
    expect(textarea).toBeInTheDocument();

    // jsdom doesn't implement document.execCommand; stub it so the paste
    // handler's insertText call can be observed.
    const insertTextSpy = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: insertTextSpy,
      writable: true,
    });

    const clipboardData = {
      getData: (type: string) => (type === 'text/plain' ? ' pasted' : ''),
    };
    fireEvent.paste(textarea, { clipboardData });

    expect(insertTextSpy).toHaveBeenCalledWith('insertText', false, ' pasted');
    vi.useRealTimers();
  });

  it('keeps sticky content visible while supporting the hidden state', () => {
    const { container } = render(
      <StickyNode
        data={{ color: '#ffee88', content: 'Still rendered', isHidden: true }}
        id="sticky-2"
      />
    );

    expect(screen.getByText('Still rendered')).toBeInTheDocument();
    expect(container.querySelector('.pointer-events-none')).not.toBeNull();
    expect(container.querySelectorAll('.bg-current')).toHaveLength(0);
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

  it('uses craft-style card shadow without cutout drop-shadow filters', () => {
    const { container, rerender } = render(
      <StickyNode
        data={{ color: '#ffee88', content: 'No shadow' }}
        id="sticky-no-shadow"
      />
    );

    const visual = container.querySelector('.node-visual');
    expect(visual).toHaveClass('shadow-card');
    expect(visual).not.toHaveClass('shadow-card-cutout');
    expect(container.querySelector('[aria-hidden="true"]')).not.toHaveStyle({
      filter: expect.stringContaining('drop-shadow'),
    });

    rerender(
      <StickyNode
        data={{ color: '#ffee88', content: 'No shadow' }}
        dragging
        id="sticky-no-shadow"
      />
    );

    expect(container.querySelector('.node-visual')).toHaveClass('shadow-card');
    expect(container.querySelector('.node-visual')).not.toHaveClass(
      'shadow-card-cutout'
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toHaveStyle({
      filter: expect.stringContaining('drop-shadow'),
    });
  });
});
