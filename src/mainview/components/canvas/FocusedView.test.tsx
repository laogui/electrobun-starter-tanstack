// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FocusedView } from '@/components/canvas/FocusedView';

const commitFolderChildDataMock = vi.fn();
const commitNodeDataMock = vi.fn();
const setFocusedNodeMock = vi.fn();
let nodesMock: Array<{
  data: Record<string, unknown>;
  id: string;
  position: { x: number; y: number };
  type?: string;
}> = [];
const updateFolderChildDataMock = vi.fn();
const updateNodeDataMock = vi.fn();

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      commitFolderChildData: typeof commitFolderChildDataMock;
      commitNodeData: typeof commitNodeDataMock;
      nodes: typeof nodesMock;
      setFocusedNode: typeof setFocusedNodeMock;
      updateFolderChildData: typeof updateFolderChildDataMock;
      updateNodeData: typeof updateNodeDataMock;
    }) => unknown
  ) =>
    selector({
      commitFolderChildData: commitFolderChildDataMock,
      commitNodeData: commitNodeDataMock,
      nodes: nodesMock,
      setFocusedNode: setFocusedNodeMock,
      updateFolderChildData: updateFolderChildDataMock,
      updateNodeData: updateNodeDataMock,
    }),
}));

vi.mock('@/components/canvas/nodes/ImageNode', () => ({
  ImageContent: ({ data }: { data: { title?: string; imageUrl?: string } }) => (
    <div>
      image:{data.title ?? 'untitled'}:{data.imageUrl ?? 'none'}
    </div>
  ),
}));

vi.mock('@/components/canvas/nodes/AssetNode', () => ({
  AssetContent: ({
    data,
    isFocused,
  }: {
    data: { fileName?: string; title?: string };
    isFocused?: boolean;
  }) => (
    <div>
      {`asset:${isFocused ? 'focused' : 'card'}:${data.title ?? data.fileName ?? 'untitled'}`}
    </div>
  ),
}));

vi.mock('@/components/canvas/nodes/LinkNode', () => ({
  LinkContent: ({
    data,
    isFocused,
    onUrlChange,
  }: {
    data: { title?: string; url?: string };
    isFocused?: boolean;
    onUrlChange?: (url: string) => void;
  }) => (
    <div>
      {`link:${isFocused ? 'focused' : 'card'}:${data.title ?? 'untitled'}:${data.url ?? 'none'}`}
      <button
        onClick={() => {
          onUrlChange?.('https://new.example/');
        }}
        type="button"
      >
        mutate url
      </button>
    </div>
  ),
}));

interface EditorMockProps {
  markdown?: string;
  onMarkdownChange: (value: string) => void;
  onPreviewUpdate?: (value: Record<string, unknown>) => void;
  onTitleChange: (value: string) => void;
  title?: string;
}

const EditorMockComponent = ({
  markdown,
  onMarkdownChange,
  onPreviewUpdate,
  onTitleChange,
  title,
}: EditorMockProps) => (
  <div>
    <div>
      editor:{title ?? 'untitled'}:{markdown ?? ''}
    </div>
    <button
      onClick={() => {
        onTitleChange('Updated Title');
      }}
      type="button"
    >
      mutate title
    </button>
    <button
      onClick={() => {
        onMarkdownChange('Updated body');
      }}
      type="button"
    >
      mutate body
    </button>
    <button
      onClick={() => {
        onPreviewUpdate?.({ previewHtml: '<p>Updated</p>' });
      }}
      type="button"
    >
      mutate preview
    </button>
  </div>
);

vi.mock('@/components/editor/BlockNoteEditor', () => ({
  default: EditorMockComponent,
}));

vi.mock('@/components/canvas/nodes/CardNode', () => ({
  CardContent: ({
    data,
    onChange,
  }: {
    data: { title?: string; content?: string };
    onChange?: (value: Record<string, unknown>) => void;
  }) => (
    <div>
      <div>
        card:{data.title ?? 'untitled'}:{data.content ?? ''}
      </div>
      <button
        onClick={() => {
          onChange?.({ title: 'Updated Title' });
        }}
        type="button"
      >
        mutate card
      </button>
    </div>
  ),
}));

const rect = {
  x: 10,
  y: 20,
  width: 120,
  height: 140,
  top: 20,
  left: 10,
  right: 130,
  bottom: 160,
  toJSON: () => ({}),
} as DOMRect;

describe('focusedView', () => {
  afterEach(() => {
    commitFolderChildDataMock.mockReset();
    commitNodeDataMock.mockReset();
    setFocusedNodeMock.mockReset();
    nodesMock = [];
    updateFolderChildDataMock.mockReset();
    updateNodeDataMock.mockReset();
    document.body.style.overflow = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders text cards with the block editor and propagates edits to store', async () => {
    const onClose = vi.fn();

    render(
      <FocusedView
        node={{
          id: 'card-1',
          type: 'card',
          data: {
            title: 'Alpha',
            content: 'Body',
            noteId: 'note-1',
            file: 'a.md',
          },
          rect,
        }}
        onClose={onClose}
      />
    );

    expect(await screen.findByText('editor:Alpha:Body')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'mutate title' }));

    expect(updateNodeDataMock).toHaveBeenCalledWith('card-1', {
      title: 'Updated Title',
    });

    fireEvent.click(screen.getByRole('button', { name: 'mutate body' }));

    expect(updateNodeDataMock).toHaveBeenCalledWith('card-1', {
      content: 'Updated body',
      previewBlocks: undefined,
      previewExcerpt: undefined,
      previewHtml: undefined,
      previewVersion: undefined,
    });
  });

  it('routes folder-child text edits back into the owning folder data', async () => {
    render(
      <FocusedView
        node={{
          id: 'child-1',
          folderId: 'folder-1',
          type: 'card',
          data: {
            title: 'Child',
            content: 'Body',
            noteId: 'note-child',
          },
          rect,
        }}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText('editor:Child:Body')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'mutate title' }));

    expect(updateFolderChildDataMock).toHaveBeenCalledWith(
      'folder-1',
      'child-1',
      { title: 'Updated Title' }
    );

    fireEvent.click(screen.getByRole('button', { name: 'mutate body' }));

    expect(updateFolderChildDataMock).toHaveBeenCalledWith(
      'folder-1',
      'child-1',
      {
        content: 'Updated body',
        previewBlocks: undefined,
        previewExcerpt: undefined,
        previewHtml: undefined,
        previewVersion: undefined,
      }
    );

    fireEvent.click(screen.getByRole('button', { name: 'mutate preview' }));

    expect(updateFolderChildDataMock).toHaveBeenCalledWith(
      'folder-1',
      'child-1',
      { previewHtml: '<p>Updated</p>' }
    );
    expect(updateNodeDataMock).not.toHaveBeenCalled();
  });

  it('renders image nodes and closes from overlay/back button', () => {
    const onClose = vi.fn();

    render(
      <FocusedView
        node={{
          id: 'image-1',
          type: 'image',
          data: {
            title: 'Cover',
            imageUrl: 'https://example.com/img.png',
            color: '#fff',
          },
          rect,
        }}
        onClose={onClose}
      />
    );

    expect(
      screen.getByText('image:Cover:https://example.com/img.png')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(
      screen.getByText('image:Cover:https://example.com/img.png').closest('div')
        ?.parentElement?.parentElement!
    );

    expect(onClose).toHaveBeenCalled();
  });

  it('renders asset nodes through the asset focused content', () => {
    render(
      <FocusedView
        node={{
          id: 'asset-1',
          type: 'asset',
          data: {
            attachmentFile: 'attachments/file_abc.pdf',
            fileName: 'report.pdf',
            kind: 'file',
            mimeType: 'application/pdf',
            title: 'Report',
          },
          rect,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('asset:focused:Report')).toBeInTheDocument();
  });

  it('renders link nodes through the link focused view', () => {
    render(
      <FocusedView
        node={{
          id: 'link-1',
          type: 'link',
          data: {
            title: 'Example',
            url: 'https://example.com/',
            color: '#ffffff',
          },
          rect,
        }}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText('link:focused:Example:https://example.com/')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'mutate url' }));

    expect(commitNodeDataMock).toHaveBeenCalledWith('link-1', {
      description: undefined,
      faviconUrl: undefined,
      imageUrl: undefined,
      siteName: undefined,
      title: 'new.example',
      unfurlError: undefined,
      unfurlStatus: 'idle',
      url: 'https://new.example/',
    });
  });

  it('navigates to adjacent focused items on the same canvas', () => {
    nodesMock = [
      {
        id: 'card-1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'First', content: '', color: '#FFFFFF' },
      },
      {
        id: 'link-1',
        type: 'link',
        position: { x: 200, y: 0 },
        data: {
          title: 'Example',
          url: 'https://example.com/',
          color: '#ffffff',
        },
      },
    ];

    render(
      <FocusedView
        node={{
          id: 'card-1',
          type: 'card',
          data: {
            title: 'First',
            content: '',
            color: '#FFFFFF',
          },
          rect,
        }}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next item' }));

    expect(setFocusedNodeMock).toHaveBeenCalledWith({
      id: 'link-1',
      type: 'link',
      data: {
        title: 'Example',
        url: 'https://example.com/',
        color: '#ffffff',
      },
      rect: expect.any(DOMRect),
    });
  });

  it('uses the registered node size when navigating to an unmounted canvas item', () => {
    nodesMock = [
      {
        id: 'link-1',
        type: 'link',
        position: { x: 0, y: 0 },
        data: {
          title: 'Example',
          url: 'https://example.com/',
          color: '#ffffff',
        },
      },
      {
        id: 'card-1',
        type: 'card',
        position: { x: 240, y: 0 },
        data: { title: 'Card', content: '', color: '#FFFFFF' },
      },
    ];

    render(
      <FocusedView
        node={{
          id: 'link-1',
          type: 'link',
          data: {
            title: 'Example',
            url: 'https://example.com/',
            color: '#ffffff',
          },
          rect,
        }}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next item' }));

    const focusedItem = setFocusedNodeMock.mock.calls.at(-1)?.[0];
    expect(focusedItem).toMatchObject({ id: 'card-1' });
    expect(focusedItem?.rect).toBeInstanceOf(DOMRect);
    expect(focusedItem?.rect.width).toBe(350);
    expect(focusedItem?.rect.height).toBe(450);
  });
});
