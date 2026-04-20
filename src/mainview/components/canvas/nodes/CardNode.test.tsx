// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CardNode, { CardContent } from './CardNode';

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
  useReactFlow: () => ({ updateNodeData: updateNodeDataMock }),
  useViewport: () => useViewportMock(),
}));

vi.mock('@/components/preview/NotePreview', () => ({
  NotePreview: ({
    excerpt,
    fallback,
    html,
  }: {
    excerpt?: string;
    fallback?: string;
    html?: string;
  }) => (
    <div data-testid="note-preview">
      {html ?? excerpt ?? fallback ?? 'empty-preview'}
    </div>
  ),
}));

describe('CardNode', () => {
  afterEach(() => {
    updateNodeDataMock.mockReset();
    useViewportMock.mockReset();
    useViewportMock.mockReturnValue({ zoom: 1 });
    document.body.className = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders default card preview content and hidden state classes', () => {
    render(
      <CardNode
        data={{
          color: '#ffffff',
          content: 'Body copy',
          isHidden: true,
          previewHtml: '<p>Stored preview</p>',
          title: 'Card title',
        }}
        id="card-1"
      />
    );

    expect(screen.getByText('Card title')).toBeInTheDocument();
    expect(screen.getByTestId('note-preview')).toHaveTextContent(
      '<p>Stored preview</p>'
    );
    expect(screen.getByTestId('handle-top')).toBeInTheDocument();
    expect(
      screen.getByText('Card title').closest('.pointer-events-none')
    ).not.toBeNull();
  });

  it('renders zoomed-out summary and toggles resize body class hooks', () => {
    useViewportMock.mockReturnValue({ zoom: 0.3 });

    render(
      <CardNode
        data={{
          color: '#111111',
          tag: 'Urgent',
          tagColor: '#ff0000',
          title: 'Condensed',
        }}
        id="card-2"
      />
    );

    expect(screen.getByText('Condensed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'start resize' }));
    expect(document.body.classList.contains('resizing-nwse')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'end resize' }));
    expect(document.body.classList.contains('resizing-nwse')).toBe(false);
  });

  it('renders checklist content and updates items through callbacks', () => {
    const onChange = vi.fn();

    render(
      <CardContent
        data={{
          color: '#ffffff',
          items: [
            { text: 'Header', isHeader: true },
            { checked: false, text: 'Ship it' },
          ],
          tag: 'Todo',
          tagColor: '#00ff00',
          title: 'Checklist',
          type: 'checklist',
        }}
        isFocused={false}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('Ship it'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { text: 'Header', isHeader: true },
          { checked: true, text: 'Ship it' },
        ],
      })
    );

    fireEvent.change(screen.getByPlaceholderText('Add item...'), {
      target: { value: 'New line' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Add item...'), {
      key: 'Enter',
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        items: [
          { text: 'Header', isHeader: true },
          { checked: false, text: 'Ship it' },
          { checked: false, text: 'New line' },
        ],
      })
    );
  });

  it('renders image card legends and editable focused content updates', () => {
    const onChange = vi.fn();

    const { rerender } = render(
      <CardContent
        data={{
          color: '#ffffff',
          pieData: [{ color: '#123456', label: 'Slice A' }],
          title: 'Insight',
          type: 'image',
        }}
        isFocused={true}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Insight')).toBeInTheDocument();
    expect(screen.getByText('Slice A')).toBeInTheDocument();

    rerender(
      <CardContent
        data={{
          color: '#ffffff',
          content: 'Original body',
          title: 'Original title',
        }}
        isFocused={true}
        onChange={onChange}
      />
    );

    const title = screen.getByText('Original title');
    const content = screen.getByText('Original body');

    title.textContent = 'Renamed title';
    fireEvent.blur(title);
    expect(onChange).toHaveBeenCalledWith({ title: 'Renamed title' });

    content.textContent = 'Updated body';
    fireEvent.blur(content);
    expect(onChange).toHaveBeenCalledWith({
      content: 'Updated body',
      previewBlocks: undefined,
      previewExcerpt: undefined,
      previewHtml: undefined,
      previewVersion: undefined,
    });
  });
});
