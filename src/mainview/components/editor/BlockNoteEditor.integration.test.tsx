// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
    conflict: null as unknown,
    conflictDraftReady: true,
    editor,
    flushNow: vi.fn(),
    keepLocalVersion: vi.fn(async () => undefined),
    markDirty: vi.fn(),
    canApplyExternal: vi.fn(() => true),
    retryConflictLoad: vi.fn(),
    rpcGetLocalHttpEndpoint: vi.fn(),
    rpcLoadBlockNote: vi.fn(),
    saveDebounced: vi.fn(),
    setInitialRevision: vi.fn(),
    updateNodeData: vi.fn(),
    setState: vi.fn(),
    acceptSavedVersion: vi.fn(),
  };
});

vi.mock('@blocknote/core', () => ({}));

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({
    children,
    onBlur,
    onChange,
  }: {
    children?: ReactNode;
    onBlur?: () => void;
    onChange?: () => void;
  }) => (
    <div data-testid="blocknote-view" onBlur={onBlur} onInput={onChange}>
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
    acceptSavedVersion: mocks.acceptSavedVersion,
    conflict: mocks.conflict,
    conflictDraftReady: mocks.conflictDraftReady,
    flushNow: mocks.flushNow,
    keepLocalVersion: mocks.keepLocalVersion,
    markDirty: mocks.markDirty,
    canApplyExternal: mocks.canApplyExternal,
    retryConflictLoad: mocks.retryConflictLoad,
    saveDebounced: mocks.saveDebounced,
    setInitialRevision: mocks.setInitialRevision,
  }),
}));

import { createNoteBodySync } from '@/lib/noteBodySync';
import BlockNoteEditor from './BlockNoteEditor';

describe('BlockNoteEditor', () => {
  beforeEach(() => {
    mocks.conflict = null;
    mocks.conflictDraftReady = true;
    mocks.rpcGetLocalHttpEndpoint.mockResolvedValue({
      aiEnabled: false,
      baseUrl: '',
      token: '',
    });
    mocks.rpcLoadBlockNote.mockResolvedValue({
      blocks: mocks.editor.document,
      markdown: 'Body',
      revision: 1,
      workspaceId: 'workspace',
      success: true,
    });
    mocks.acceptSavedVersion.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('marks body input dirty synchronously and discards older serialization results', async () => {
    render(
      <BlockNoteEditor
        color="red"
        data={{}}
        nodeId="placement"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Original"
      />
    );
    await screen.findByLabelText('Note title');
    let first!: (text: string) => void;
    let second!: (text: string) => void;
    mocks.editor.blocksToMarkdownLossy
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            first = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            second = resolve;
          })
      );
    fireEvent.input(screen.getByTestId('blocknote-view'));
    fireEvent.input(screen.getByTestId('blocknote-view'));
    expect(mocks.markDirty).toHaveBeenCalledTimes(2);
    expect(mocks.saveDebounced).not.toHaveBeenCalled();
    await act(async () => {
      second('Latest body');
    });
    await act(async () => {
      first('Old body');
    });
    expect(mocks.saveDebounced).toHaveBeenCalledOnce();
    expect(mocks.saveDebounced).toHaveBeenCalledWith({
      blocks: mocks.editor.document,
      markdown: 'Latest body',
    });
  });

  it.each([
    false,
    true,
  ])('refreshes the open body only without a local title draft (dirty=%s)', async (dirty) => {
    mocks.canApplyExternal.mockReturnValue(true);
    const view = render(
      <BlockNoteEditor
        color="red"
        data={{
          noteId: 'note-1',
          title: 'Original',
          color: 'red',
          blocknoteRevision: 1,
        }}
        nodeId="placement"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Original"
      />
    );
    const title = await screen.findByLabelText('Note title');
    if (dirty) {
      fireEvent.change(title, { target: { value: 'Local draft' } });
    }
    const blocks = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Plugin body', styles: {} }],
        children: [],
      },
    ];
    mocks.rpcLoadBlockNote.mockResolvedValueOnce({
      success: true,
      workspaceId: 'workspace',
      revision: 2,
      blocks,
      text: 'Plugin body',
      preview: {
        html: '<p>Plugin body</p>',
        excerpt: 'Plugin body',
        blocks: 1,
        version: 1,
      },
    });
    const project = vi.fn();
    const sync = createNoteBodySync(project);
    await act(async () => {
      sync.refresh('workspace', {
        id: 'note-1',
        before: { title: 'Original', color: 'red', revision: 1 },
        after: { title: 'Plugin title', color: 'red', revision: 2 },
        metadataOnly: false,
      });
      await Promise.resolve();
    });
    if (dirty) {
      expect(title).toHaveValue('Local draft');
      expect(mocks.editor.replaceBlocks).not.toHaveBeenCalled();
      expect(project).not.toHaveBeenCalled();
      expect(mocks.markDirty).toHaveBeenCalled();
    } else {
      await waitFor(() =>
        expect(mocks.editor.replaceBlocks).toHaveBeenCalledWith(
          mocks.editor.document,
          blocks
        )
      );
      expect(mocks.setInitialRevision).toHaveBeenLastCalledWith(2, {
        title: 'Plugin title',
        color: 'red',
      });
      expect(title).toHaveValue('Plugin title');
      expect(mocks.saveDebounced).not.toHaveBeenCalled();
      expect(project).toHaveBeenCalledOnce();
    }
    sync.reset();
    view.unmount();
  });

  it('shows both conflict versions and applies the saved version to the editor and every projection', async () => {
    const saved = {
      blocks: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Saved body', styles: {} }],
          children: [],
        },
      ],
      color: 'blue',
      noteId: 'note-1',
      preview: {
        blocks: 1,
        excerpt: 'Saved body',
        html: '<p>Saved body</p>',
        version: 1,
      },
      revision: 2,
      text: 'Saved body',
      title: 'Saved title',
      workspaceId: 'workspace',
    };
    mocks.conflict = { snapshot: saved, status: 'ready' };
    mocks.acceptSavedVersion.mockImplementation(
      (apply: (snapshot: typeof saved) => void) => apply(saved)
    );
    render(
      <BlockNoteEditor
        color="red"
        data={{
          noteId: 'note-1',
          title: 'Original',
          color: 'red',
          blocknoteRevision: 1,
        }}
        markdown="Local draft body"
        nodeId="placement"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Local draft title"
      />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This note changed elsewhere'
    );
    expect(screen.getAllByText('Local draft title')).toHaveLength(2);
    expect(screen.getByText('Saved title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use saved version' }));

    expect(mocks.editor.replaceBlocks).toHaveBeenCalledWith(
      mocks.editor.document,
      saved.blocks
    );
    expect(screen.getByLabelText('Note title')).toHaveValue('Saved title');
    const project = mocks.setState.mock.calls.at(-1)?.[0];
    const state = {
      focusedFolder: null,
      focusedNode: null,
      nodes: [
        {
          data: {
            blocknoteRevision: 1,
            color: 'red',
            content: 'Local draft body',
            noteId: 'note-1',
            title: 'Local draft title',
          },
        },
      ],
    };
    expect(project(state).nodes[0].data).toMatchObject({
      blocknoteRevision: 2,
      color: 'blue',
      content: 'Saved body',
      previewHtml: '<p>Saved body</p>',
      title: 'Saved title',
    });
  });

  it('keeps the conflict banner actionable when choosing the local version', async () => {
    mocks.conflict = {
      snapshot: {
        blocks: [],
        color: 'blue',
        noteId: 'note-1',
        preview: { blocks: 0, excerpt: '', html: '', version: 1 },
        revision: 2,
        text: '',
        title: 'Saved title',
        workspaceId: 'workspace',
      },
      status: 'ready',
    };
    render(
      <BlockNoteEditor
        color="red"
        data={{}}
        markdown="Local draft"
        nodeId="placement"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Local title"
      />
    );

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Keep my version' }));
    expect(mocks.keepLocalVersion).toHaveBeenCalledOnce();
  });

  it('disables keep-local until the latest conflict draft is serialized', async () => {
    mocks.conflictDraftReady = false;
    mocks.conflict = {
      snapshot: {
        blocks: [],
        color: 'blue',
        noteId: 'note-1',
        preview: { blocks: 0, excerpt: '', html: '', version: 1 },
        revision: 2,
        text: 'Saved body',
        title: 'Saved title',
        workspaceId: 'workspace',
      },
      status: 'ready',
    };
    render(
      <BlockNoteEditor
        color="red"
        data={{ noteId: 'note-1' }}
        nodeId="placement"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Local title"
      />
    );

    const keepButton = await screen.findByRole('button', {
      name: 'Keep my version',
    });
    expect(keepButton).toBeDisabled();
    fireEvent.click(keepButton);
    expect(mocks.keepLocalVersion).not.toHaveBeenCalled();
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
    expect(mocks.setInitialRevision).toHaveBeenCalledWith(
      5,
      metadata,
      undefined
    );
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
