// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FocusedView } from '@/components/canvas/FocusedView';
import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import {
  CHECKLIST_CANVAS_TYPE_ID,
  FILE_CANVAS_TYPE_ID,
  IMAGE_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
} from '../../../shared/extensions/builtinIds';
import { EXTENSION_INSTANCE_SCHEMA } from '../../../shared/extensions/instance';

registerBuiltinCanvasTypes();

const CHECKLIST_ITEM_ID_RE = /^item_/;

vi.mock('@/lib/rpc', () => ({
  rpcCloneExtensionInstance: vi.fn(),
  rpcCreateExtensionInstance: vi.fn(),
  rpcUpdateExtensionInstance: vi.fn(async () => ({ success: true })),
  rpcSetExtensionEnabled: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/components/canvas/nodes/_shared/NodeHandles', () => ({
  NodeHandles: () => <div data-testid="handles" />,
}));

vi.mock('@/components/canvas/nodes/_shared/ResizeHandle', () => ({
  ResizeHandle: () => <div data-testid="resize" />,
}));

vi.mock('@/components/card/useNodeTagEditing', () => ({
  useNodeTagEditing: () => ({
    dimmedByFilter: false,
    openTagEditor: vi.fn(),
    tag: undefined,
    tagColor: undefined,
    tagColors: undefined,
    tagEditor: null,
    tags: undefined,
  }),
}));

const commitFolderChildDataMock = vi.fn();
const commitNodeDataMock = vi.fn();
const setFocusedNodeMock = vi.fn();
const updateWidgetMock = vi.fn();
let nodesMock: Array<{
  data: Record<string, unknown>;
  id: string;
  measured?: { width?: number; height?: number };
  position: { x: number; y: number };
  type?: string;
  width?: number;
  height?: number;
}> = [];
const updateFolderChildDataMock = vi.fn();
const updateNodeDataMock = vi.fn();
let widgetRecordsMock: Record<string, Record<string, unknown>> = {};
let viewsMock: Array<{ id: string; name: string }> = [];
let activeViewIdMock = 'default';

const setCenterMock = vi.fn();
const getViewportMock = vi.fn(() => ({ x: 0, y: 0, zoom: 1 }));
const getNodesMock = vi.fn(() => nodesMock);

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    getNodes: getNodesMock,
    getViewport: getViewportMock,
    setCenter: setCenterMock,
  }),
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => true,
  };
});

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      activeViewId: string;
      commitFolderChildData: typeof commitFolderChildDataMock;
      commitNodeData: typeof commitNodeDataMock;
      nodes: typeof nodesMock;
      setFocusedNode: typeof setFocusedNodeMock;
      updateFolderChildData: typeof updateFolderChildDataMock;
      updateNodeData: typeof updateNodeDataMock;
      views: typeof viewsMock;
    }) => unknown
  ) =>
    selector({
      activeViewId: activeViewIdMock,
      commitFolderChildData: commitFolderChildDataMock,
      commitNodeData: commitNodeDataMock,
      nodes: nodesMock,
      setFocusedNode: setFocusedNodeMock,
      updateFolderChildData: updateFolderChildDataMock,
      updateNodeData: updateNodeDataMock,
      views: viewsMock,
    }),
}));

vi.mock('@/store/widgetStore', () => ({
  useWidgetStore: (
    selector: (state: {
      records: typeof widgetRecordsMock;
      updateWidget: typeof updateWidgetMock;
    }) => unknown
  ) =>
    selector({
      records: widgetRecordsMock,
      updateWidget: updateWidgetMock,
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
  onSaveStatusChange?: (status: 'conflict', savedAt: Date | null) => void;
  onTitleChange: (value: string) => void;
  title?: string;
}

const EditorMockComponent = ({
  markdown,
  onMarkdownChange,
  onPreviewUpdate,
  onSaveStatusChange,
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
    <button
      onClick={() => {
        onSaveStatusChange?.('conflict', null);
      }}
      type="button"
    >
      signal conflict
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

vi.mock('@/components/canvas/ImageZoomPan', () => ({
  ImageZoomPan: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const CLOSE_BUTTON = /close/i;
const CANVAS_TYPE_ID_RE = /_CANVAS_TYPE_ID/;

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
    setCenterMock.mockReset();
    getViewportMock.mockReset();
    getViewportMock.mockReturnValue({ x: 0, y: 0, zoom: 1 });
    nodesMock = [];
    viewsMock = [];
    activeViewIdMock = 'default';
    updateFolderChildDataMock.mockReset();
    updateNodeDataMock.mockReset();
    updateWidgetMock.mockReset();
    widgetRecordsMock = {};
    document.body.style.overflow = '';
    useExtensionInstanceStore.setState({ records: {}, history: {} });
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

  it('requires explicit confirmation before closing an unresolved draft conflict', async () => {
    const onClose = vi.fn();
    const warning = vi.spyOn(toast, 'warning').mockImplementation(() => 'id');
    render(
      <FocusedView
        node={{
          id: 'card-conflict',
          type: 'card',
          data: {
            title: 'Draft',
            content: 'Local body',
            noteId: 'note-conflict',
          },
          rect,
        }}
        onClose={onClose}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'signal conflict' })
    );
    fireEvent.click(screen.getByRole('button', { name: CLOSE_BUTTON }));

    expect(warning).toHaveBeenCalledWith(
      'Your unresolved draft will be lost if you close this note. Close anyway?',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Close and discard' }),
      })
    );
    expect(onClose).not.toHaveBeenCalled();

    const action = warning.mock.calls[0]?.[1]?.action as
      | { onClick?: () => void }
      | undefined;
    if (!action) {
      throw new Error('Expected close action');
    }
    action.onClick?.();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('preserves an existing body scroll lock when it unmounts', () => {
    const onClose = vi.fn();
    document.body.style.overflow = 'hidden';

    const view = render(
      <FocusedView
        node={{
          id: 'card-1',
          type: 'card',
          data: { title: 'Alpha', content: 'Body', noteId: 'note-1' },
          rect,
        }}
        onClose={onClose}
      />
    );

    view.unmount();

    expect(document.body.style.overflow).toBe('hidden');
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

  it('renders image nodes and closes from close button', () => {
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

    fireEvent.click(screen.getByRole('button', { name: CLOSE_BUTTON }));

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

  it('renders checklist widgets from widgetStore and commits edits there only', () => {
    const record = {
      schema: 'ghostboard-widget/v1',
      id: 'widget_1',
      kind: 'checklist',
      title: 'Widget List',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
      data: {
        items: [
          {
            id: 'item_1',
            text: 'First task',
            checked: false,
            createdAt: '2026-07-08T00:00:00.000Z',
          },
        ],
      },
    };
    widgetRecordsMock = { widget_1: record };

    render(
      <FocusedView
        node={{
          id: 'widget-node-1',
          type: 'widget',
          data: { widgetId: 'widget_1', kind: 'checklist' },
          rect,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('Widget List')).toBeInTheDocument();
    expect(screen.getByDisplayValue('First task')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));

    expect(updateWidgetMock).toHaveBeenCalledWith(
      'widget_1',
      expect.any(Function)
    );
    const updater = updateWidgetMock.mock.calls.at(-1)?.[1] as
      | ((current: typeof record) => typeof record)
      | undefined;
    expect(updater?.(record)).toMatchObject({
      id: 'widget_1',
      title: 'Widget List',
      data: {
        items: [
          {
            id: 'item_1',
            text: 'First task',
            checked: true,
          },
        ],
      },
    });
    expect(commitNodeDataMock).not.toHaveBeenCalled();
    expect(commitFolderChildDataMock).not.toHaveBeenCalled();
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

    fireEvent.keyDown(document, { key: 'ArrowRight', metaKey: true });

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

    fireEvent.keyDown(document, { key: 'ArrowRight', metaKey: true });

    const focusedItem = setFocusedNodeMock.mock.calls.at(-1)?.[0];
    expect(focusedItem).toMatchObject({ id: 'card-1' });
    expect(focusedItem?.rect).toBeInstanceOf(DOMRect);
    expect(focusedItem?.rect.width).toBe(350);
    expect(focusedItem?.rect.height).toBe(450);
  });

  it('closes on ESC keydown via capture-phase handler', async () => {
    const onClose = vi.fn();
    render(
      <FocusedView
        node={{
          id: 'card-1',
          type: 'card',
          data: { title: 'Alpha', content: 'Body' },
          rect,
        }}
        onClose={onClose}
      />
    );

    expect(await screen.findByText('editor:Alpha:Body')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls setCenter when closing and node is off-screen', () => {
    nodesMock = [
      {
        id: 'card-1',
        type: 'card',
        position: { x: 5000, y: 5000 },
        data: { title: 'Far', content: '' },
        measured: { width: 320, height: 180 },
      },
    ];
    getViewportMock.mockReturnValue({ x: 0, y: 0, zoom: 1 });

    const onClose = vi.fn();
    render(
      <FocusedView
        node={{
          id: 'card-1',
          type: 'card',
          data: { title: 'Far', content: '' },
          rect,
        }}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: CLOSE_BUTTON }));

    expect(setCenterMock).toHaveBeenCalledWith(5160, 5090, {
      zoom: 1,
      duration: 0,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call setCenter when closing and node is visible', () => {
    nodesMock = [
      {
        id: 'card-1',
        type: 'card',
        position: { x: 100, y: 100 },
        data: { title: 'Near', content: '' },
        measured: { width: 320, height: 180 },
      },
    ];
    getViewportMock.mockReturnValue({ x: 0, y: 0, zoom: 1 });

    const onClose = vi.fn();
    render(
      <FocusedView
        node={{
          id: 'card-1',
          type: 'card',
          data: { title: 'Near', content: '' },
          rect,
        }}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: CLOSE_BUTTON }));

    expect(setCenterMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does not branch on built-in canvas type ids', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'FocusedView.tsx'),
      'utf8'
    );
    expect(src).not.toMatch(CANVAS_TYPE_ID_RE);
  });

  it('renders a migrated image extension through DetailSurface as a lightbox', () => {
    useExtensionInstanceStore.getState().hydrate({
      extinst_image1: {
        schema: EXTENSION_INSTANCE_SCHEMA,
        id: 'extinst_image1',
        canvasTypeId: IMAGE_CANVAS_TYPE_ID,
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:01:00.000Z',
        state: {
          color: '#FFFFFF',
          imageFile: 'attachments/pic.png',
          title: 'Cover',
        },
        presentation: { title: 'Cover' },
      },
    });

    const { container } = render(
      <FocusedView
        node={{
          id: 'ext-image-1',
          type: 'extension',
          data: {
            canvasTypeId: IMAGE_CANVAS_TYPE_ID,
            instanceId: 'extinst_image1',
          },
          rect,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('image:Cover:none')).toBeInTheDocument();
    expect(screen.getByText('Cover')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-zinc-950');
    expect(screen.queryByTestId('handles')).toBeNull();
  });

  it('renders a migrated file extension through DetailSurface in the wide panel', () => {
    useExtensionInstanceStore.getState().hydrate({
      extinst_file1: {
        schema: EXTENSION_INSTANCE_SCHEMA,
        id: 'extinst_file1',
        canvasTypeId: FILE_CANVAS_TYPE_ID,
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:01:00.000Z',
        state: {
          color: '#FFFFFF',
          fileName: 'report.pdf',
          kind: 'file',
          mimeType: 'application/pdf',
          title: 'Report',
        },
        presentation: { title: 'Report' },
      },
    });

    render(
      <FocusedView
        node={{
          id: 'ext-file-1',
          type: 'extension',
          data: {
            canvasTypeId: FILE_CANVAS_TYPE_ID,
            instanceId: 'extinst_file1',
          },
          rect,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('asset:focused:Report')).toBeInTheDocument();
  });

  it('renders a migrated link extension through DetailSurface', () => {
    useExtensionInstanceStore.getState().hydrate({
      extinst_link1: {
        schema: EXTENSION_INSTANCE_SCHEMA,
        id: 'extinst_link1',
        canvasTypeId: LINK_CANVAS_TYPE_ID,
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:01:00.000Z',
        state: {
          color: '#FFFFFF',
          title: 'Example',
          url: 'https://example.com/',
          unfurlStatus: 'ready',
        },
        presentation: { title: 'Example' },
      },
    });

    render(
      <FocusedView
        node={{
          id: 'ext-link-1',
          type: 'extension',
          data: {
            canvasTypeId: LINK_CANVAS_TYPE_ID,
            instanceId: 'extinst_link1',
          },
          rect,
        }}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText('link:focused:Example:https://example.com/')
    ).toBeInTheDocument();
  });

  it('renders a migrated checklist extension through DetailSurface and records edits', () => {
    useExtensionInstanceStore.getState().hydrate({
      extinst_checklist1: {
        schema: EXTENSION_INSTANCE_SCHEMA,
        id: 'extinst_checklist1',
        canvasTypeId: CHECKLIST_CANVAS_TYPE_ID,
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:01:00.000Z',
        state: {
          title: 'Launch checklist',
          items: [
            {
              id: 'item_1',
              text: 'Verify detail editing',
              checked: false,
              createdAt: '2026-08-19T00:00:00.000Z',
            },
          ],
        },
        presentation: {
          title: 'Launch checklist',
          subtitle: '1 open',
          plainText: '[ ] Verify detail editing',
        },
      },
    });

    render(
      <FocusedView
        node={{
          id: 'ext-checklist-1',
          type: 'extension',
          data: {
            canvasTypeId: CHECKLIST_CANVAS_TYPE_ID,
            instanceId: 'extinst_checklist1',
          },
          rect,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('Launch checklist')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('Verify detail editing')
    ).toBeInTheDocument();

    const titleInput = screen.getByLabelText('Checklist title');
    fireEvent.change(titleInput, { target: { value: 'Release checklist' } });
    fireEvent.blur(titleInput);

    const newItemInput = screen.getByLabelText('New checklist item');
    fireEvent.change(newItemInput, { target: { value: 'Ship the build' } });
    fireEvent.keyDown(newItemInput, { key: 'Enter' });

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Mark as done' })[0]!
    );

    const state = useExtensionInstanceStore.getState();
    expect(state.records.extinst_checklist1).toMatchObject({
      state: {
        title: 'Release checklist',
        items: [
          {
            id: 'item_1',
            text: 'Verify detail editing',
            checked: true,
            createdAt: '2026-08-19T00:00:00.000Z',
          },
          {
            id: expect.stringMatching(CHECKLIST_ITEM_ID_RE),
            text: 'Ship the build',
            checked: false,
          },
        ],
      },
      presentation: {
        title: 'Release checklist',
        subtitle: '1 open',
      },
    });
    expect(state.history.extinst_checklist1?.past).toHaveLength(3);
  });
});
