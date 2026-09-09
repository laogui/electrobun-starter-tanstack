// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const editor = {
    blocksToMarkdownLossy: vi.fn(async () => 'Body'),
    document: [{ content: [], children: [], type: 'paragraph' }],
    replaceBlocks: vi.fn(),
    tryParseMarkdownToBlocks: vi.fn(async () => []),
  };

  return {
    editor,
    flushNow: vi.fn(),
    rpcGetLocalHttpEndpoint: vi.fn(),
    rpcLoadBlockNote: vi.fn(),
    saveDebounced: vi.fn(),
    setInitialRevision: vi.fn(),
    updateNodeData: vi.fn(),
    setState: vi.fn(),
  };
});

vi.mock('@blocknote/core', () => ({}));

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({
    children,
    onBlur,
  }: {
    children?: ReactNode;
    onBlur?: () => void;
  }) => (
    <div data-testid="blocknote-view" onBlur={onBlur}>
      {children}
    </div>
  ),
}));

vi.mock('@blocknote/react', () => ({
  FormattingToolbar: () => null,
  FormattingToolbarController: () => null,
  SuggestionMenuController: () => null,
  AIMenuController: () => null,
  filterSuggestionItems: vi.fn(() => []),
  getDefaultReactSlashMenuItems: vi.fn(() => []),
  getFormattingToolbarItems: vi.fn(() => []),
  useCreateBlockNote: () => mocks.editor,
}));

vi.mock('@blocknote/xl-ai', () => ({
  AIExtension: vi.fn(() => ({})),
  AIMenuController: () => null,
  AIToolbarButton: () => null,
  getAISlashMenuItems: vi.fn(() => []),
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {},
}));

vi.mock('overlayscrollbars-react', () => ({
  OverlayScrollbarsComponent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('react-textarea-autosize', () => ({
  default: ({
    maxRows: _maxRows,
    minRows: _minRows,
    ...props
  }: TextareaHTMLAttributes<HTMLTextAreaElement> & {
    maxRows?: number;
    minRows?: number;
  }) => <textarea {...props} />,
}));

vi.mock('@/lib/rpc', () => ({
  rpcGetLocalHttpEndpoint: mocks.rpcGetLocalHttpEndpoint,
  rpcLoadBlockNote: mocks.rpcLoadBlockNote,
}));

vi.mock('@/store/appSettingsStore', () => ({
  useAppSettingsStore: (
    selector: (state: { autoSaveInterval: number }) => unknown
  ) => selector({ autoSaveInterval: 800 }),
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: Object.assign(
    (
      selector: (state: {
        updateNodeData: typeof mocks.updateNodeData;
      }) => unknown
    ) => selector({ updateNodeData: mocks.updateNodeData }),
    { setState: mocks.setState }
  ),
}));

vi.mock('./blocknoteAttachments', () => ({
  resolveBlockNoteFileUrl: vi.fn(),
  uploadBlockNoteFile: vi.fn(),
}));

vi.mock('./useBlockNoteSaver', () => ({
  useBlockNoteSaver: () => ({
    flushNow: mocks.flushNow,
    saveDebounced: mocks.saveDebounced,
    setInitialRevision: mocks.setInitialRevision,
  }),
}));

import BlockNoteEditor from './BlockNoteEditor';

describe('BlockNoteEditor', () => {
  beforeEach(() => {
    mocks.rpcGetLocalHttpEndpoint.mockResolvedValue({
      aiEnabled: false,
      baseUrl: '',
      token: '',
    });
    mocks.rpcLoadBlockNote.mockResolvedValue({
      blocks: mocks.editor.document,
      markdown: 'Body',
      revision: 1,
      success: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('pairs canonical metadata with the loaded revision when opening a stale placement', async () => {
    const metadata = { title: 'Canonical title', color: 'blue' };
    mocks.rpcLoadBlockNote.mockResolvedValueOnce({
      success: true,
      revision: 5,
      blocks: mocks.editor.document,
      frontmatter: metadata,
    });
    render(
      <BlockNoteEditor
        color="red"
        data={{
          noteId: 'note-1',
          title: 'Stale title',
          color: 'red',
          blocknoteRevision: 1,
        }}
        markdown="Old body"
        nodeId="node-1"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Stale title"
      />
    );
    expect(await screen.findByLabelText('Note title')).toHaveValue(
      'Canonical title'
    );
    expect(mocks.setInitialRevision).toHaveBeenCalledWith(5, metadata);
    const project = mocks.setState.mock.calls[0]![0];
    const projected = project({
      nodes: [
        {
          data: {
            noteId: 'note-1',
            title: 'Stale title',
            color: 'red',
            blocknoteRevision: 1,
            content: 'Local body retained',
          },
        },
      ],
      focusedNode: null,
      focusedFolder: null,
    });
    expect(projected.nodes[0].data).toMatchObject({
      title: 'Canonical title',
      color: 'blue',
      blocknoteRevision: 5,
      content: 'Local body retained',
    });
  });

  it('persists a title-only edit when the title field loses focus', async () => {
    render(
      <BlockNoteEditor
        color="#FFFFFF"
        data={{ color: '#FFFFFF' }}
        markdown="Body"
        nodeId="node-1"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Original title"
      />
    );

    const title = await screen.findByLabelText('Note title');
    fireEvent.change(title, { target: { value: 'Renamed title' } });
    fireEvent.blur(title);

    await waitFor(() => {
      expect(mocks.saveDebounced).toHaveBeenCalledWith({
        blocks: mocks.editor.document,
        markdown: 'Body',
      });
    });
    expect(mocks.flushNow).toHaveBeenCalled();
  });

  it('syncs an external title update into the focused editor', async () => {
    const view = render(
      <BlockNoteEditor
        color="#FFFFFF"
        data={{ color: '#FFFFFF' }}
        markdown="Body"
        nodeId="node-1"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Original title"
      />
    );

    await screen.findByLabelText('Note title');
    view.rerender(
      <BlockNoteEditor
        color="#FFFFFF"
        data={{ color: '#FFFFFF' }}
        markdown="Body"
        nodeId="node-1"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Updated by plugin"
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Note title')).toHaveValue(
        'Updated by plugin'
      );
    });
  });
});
