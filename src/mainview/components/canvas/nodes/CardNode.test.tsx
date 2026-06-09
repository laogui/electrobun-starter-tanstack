// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';

import CardNode, { CardContent } from './CardNode';

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
  useReactFlow: () => ({ updateNodeData: updateNodeDataMock }),
}));

vi.mock('@/contexts/ZoomLevelContext', () => ({
  useIsZoomedOut: () => isZoomedOutMock(),
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

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({ data: [] }),
}));

const setMetadataMock = vi.fn();
const metadataStore: Record<
  string,
  { tag?: string; tagColor?: string; tags?: string[] } | undefined
> = {};
vi.mock('@/hooks/useNodeMetadata', () => ({
  useNodeMetadata: () => ({
    map: metadataStore,
    get: (id: string | undefined) => (id ? metadataStore[id] : undefined),
  }),
  useSetNodeMetadata: () => ({ mutate: setMetadataMock }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

describe('CardNode', () => {
  afterEach(() => {
    updateNodeDataMock.mockReset();
    isZoomedOutMock.mockReset();
    isZoomedOutMock.mockReturnValue(false);
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
    isZoomedOutMock.mockReturnValue(true);

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
    expect(screen.getByText('Ship it').closest('.nodrag')).not.toBeNull();
    expect(screen.getByText('Ship it').closest('.nopan')).not.toBeNull();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { text: 'Header', isHeader: true },
          { checked: true, text: 'Ship it' },
        ],
      })
    );

    const input = screen.getByPlaceholderText('Add item...');
    expect(input).toHaveClass('nodrag');
    expect(input).toHaveClass('nopan');

    fireEvent.change(input, {
      target: { value: 'New line' },
    });
    fireEvent.keyDown(input, {
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

  it('renders checklist in readOnly mode without click handlers or add-item input', () => {
    const onChange = vi.fn();

    render(
      <CardContent
        data={{
          color: '#ffffff',
          items: [
            { checked: false, text: 'Ship it' },
            { checked: true, text: 'Done already' },
          ],
          title: 'Readonly Checklist',
          type: 'checklist',
        }}
        isFocused={false}
        onChange={onChange}
        readOnly
      />
    );

    expect(screen.queryByPlaceholderText('Add item...')).toBeNull();

    fireEvent.click(screen.getByText('Ship it'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps default card in preview mode when readOnly even if isFocused', () => {
    render(
      <CardContent
        data={{
          color: '#ffffff',
          content: 'Do not touch',
          previewHtml: '<p>Preview body</p>',
          title: 'Static',
        }}
        isFocused={true}
        readOnly
      />
    );

    expect(screen.getByText('Static')).toBeInTheDocument();
    expect(screen.getByTestId('note-preview')).toHaveTextContent(
      '<p>Preview body</p>'
    );
    expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(
      0
    );
  });

  it('renders tag on default text card preview', () => {
    render(
      <CardContent
        data={{
          color: '#ffffff',
          content: 'Body',
          tag: 'Idea',
          tagColor: '#ffcc00',
          title: 'Tagged card',
        }}
        isFocused={false}
      />
    );

    expect(screen.getByText('Tagged card')).toBeInTheDocument();
    expect(screen.getByText('Idea')).toBeInTheDocument();
  });

  it('renders secondary tag chips alongside primary tag on text card preview', () => {
    render(
      <CardContent
        data={{
          color: '#ffffff',
          content: 'Body',
          tag: 'Idea',
          tagColor: '#ffcc00',
          tags: ['Alpha', 'Beta'],
          title: 'Multi-tagged card',
        }}
        isFocused={false}
      />
    );

    expect(screen.getByText('Idea')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('dims the card when active tag filters are set and the card lacks every one', () => {
    useCanvasStore.setState({ activeTagFilters: ['Work'] });
    metadataStore['card-dim'] = { tag: 'Idea', tags: ['Personal'] };
    const { container } = render(
      <CardNode
        data={{
          color: '#ffffff',
          content: 'Body',
          title: 'Untagged for filter',
        }}
        id="card-dim"
      />
    );
    const wrapper = container.querySelector('.group\\/card');
    expect(wrapper?.className).toContain('opacity-30');
    useCanvasStore.setState({ activeTagFilters: [] });
    metadataStore['card-dim'] = undefined;
  });

  it('does not dim when the card carries an active tag (case-insensitive)', () => {
    useCanvasStore.setState({ activeTagFilters: ['work'] });
    metadataStore['card-match'] = { tags: ['Work'] };
    const { container } = render(
      <CardNode
        data={{
          color: '#ffffff',
          content: 'Body',
          title: 'Matches filter',
        }}
        id="card-match"
      />
    );
    const wrapper = container.querySelector('.group\\/card');
    expect(wrapper?.className).toContain('opacity-100');
    expect(wrapper?.className).not.toContain('opacity-30');
    useCanvasStore.setState({ activeTagFilters: [] });
    metadataStore['card-match'] = undefined;
  });

  it('does not dim when at least one of multiple active filters matches (OR)', () => {
    useCanvasStore.setState({ activeTagFilters: ['Work', 'Idea'] });
    metadataStore['card-or'] = { tag: 'Idea' };
    const { container } = render(
      <CardNode
        data={{
          color: '#ffffff',
          content: 'Body',
          title: 'Carries idea only',
        }}
        id="card-or"
      />
    );
    const wrapper = container.querySelector('.group\\/card');
    expect(wrapper?.className).toContain('opacity-100');
    expect(wrapper?.className).not.toContain('opacity-30');
    useCanvasStore.setState({ activeTagFilters: [] });
    metadataStore['card-or'] = undefined;
  });

  it('renders secondary tag chips on checklist card without a primary tag', () => {
    render(
      <CardContent
        data={{
          color: '#ffffff',
          items: [{ checked: false, text: 'Ship it' }],
          tags: ['Gamma', 'Delta'],
          title: 'Checklist',
          type: 'checklist',
        }}
        isFocused={false}
      />
    );

    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.getByText('Delta')).toBeInTheDocument();
  });

  it('renders a focused text card as a read-only preview (editing moved to BlockNote)', () => {
    // Inline contentEditable editing (the former EditableCardContent) was
    // removed: focused text cards open the BlockNote editor instead, so the
    // CardContent surface itself stays a non-editable preview.
    render(
      <CardContent
        data={{
          color: '#ffffff',
          content: 'Original body',
          previewHtml: '<p>Original body</p>',
          title: 'Original title',
        }}
        isFocused={true}
      />
    );

    expect(screen.getByText('Original title')).toBeInTheDocument();
    expect(screen.getByTestId('note-preview')).toHaveTextContent(
      '<p>Original body</p>'
    );
    expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(
      0
    );
  });
});
