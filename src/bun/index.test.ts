import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOTE_ID_RE = /^note_/;

interface RpcHandlerMap {
  [key: string]: (payload: never) => Promise<unknown> | unknown;
}
const localInfoChannelMock = vi.fn();
const settingsUpdatedMock = vi.fn();
const defineRpcMock = vi.fn<
  (config: {
    handlers: {
      requests: RpcHandlerMap;
      messages?: RpcHandlerMap;
    };
    maxRequestTime?: number;
  }) => { send: { settingsUpdated: typeof settingsUpdatedMock } }
>(() => ({
  send: { settingsUpdated: settingsUpdatedMock },
}));
const browserWindowFocusMock = vi.fn();
const browserWindowOnMock = vi.fn();
const browserWindowMock = vi.fn();
const setApplicationMenuMock = vi.fn();
const openFileDialogMock = vi.fn();

interface BrowserWindowOptions {
  frame?: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
}

function BrowserWindowMock(...args: unknown[]) {
  browserWindowMock(...args);
  const options = args[0] as BrowserWindowOptions | undefined;
  return {
    on: browserWindowOnMock,
    focus: browserWindowFocusMock,
    getFrame: vi.fn(
      () => options?.frame ?? { x: 0, y: 0, width: 0, height: 0 }
    ),
  };
}

vi.mock('electrobun/bun', () => ({
  ApplicationMenu: {
    setApplicationMenu: setApplicationMenuMock,
    on: vi.fn(),
  },
  BrowserView: {
    defineRPC: (...args: Parameters<typeof defineRpcMock>) =>
      defineRpcMock(...args),
  },
  BrowserWindow: BrowserWindowMock,
  Updater: {
    localInfo: {
      channel: localInfoChannelMock,
    },
  },
  Utils: {
    openFileDialog: openFileDialogMock,
  },
}));

const manifestMocks = {
  loadManifest: vi.fn(),
  saveManifest: vi.fn(),
};

const noteMocks = {
  buildNoteIndex: vi.fn(),
  cardDataToNote: vi.fn(),
  createNote: vi.fn(),
  deleteNoteFile: vi.fn(),
  loadNote: vi.fn(),
  noteToCardData: vi.fn(),
  saveNote: vi.fn(),
};

const previewMocks = {
  writeNoteWithPreview: vi.fn(),
};

const workspaceMocks = {
  addView: vi.fn(),
  atomicWrite: vi.fn(),
  initWorkspace: vi.fn(() => '/tmp/workspace'),
  loadWorkspaceConfig: vi.fn(),
  removeView: vi.fn(),
  renameView: vi.fn(),
  restoreView: vi.fn(),
  seedFirstRunIfNeeded: vi.fn(async () => undefined),
};

vi.mock('./manifest', () => ({
  loadManifest: (...args: Parameters<typeof manifestMocks.loadManifest>) =>
    manifestMocks.loadManifest(...args),
  saveManifest: (...args: Parameters<typeof manifestMocks.saveManifest>) =>
    manifestMocks.saveManifest(...args),
}));

vi.mock('./notes', () => ({
  buildNoteIndex: (...args: Parameters<typeof noteMocks.buildNoteIndex>) =>
    noteMocks.buildNoteIndex(...args),
  cardDataToNote: (...args: Parameters<typeof noteMocks.cardDataToNote>) =>
    noteMocks.cardDataToNote(...args),
  createNote: (...args: Parameters<typeof noteMocks.createNote>) =>
    noteMocks.createNote(...args),
  deleteNoteFile: (...args: Parameters<typeof noteMocks.deleteNoteFile>) =>
    noteMocks.deleteNoteFile(...args),
  loadNote: (...args: Parameters<typeof noteMocks.loadNote>) =>
    noteMocks.loadNote(...args),
  noteToCardData: (...args: Parameters<typeof noteMocks.noteToCardData>) =>
    noteMocks.noteToCardData(...args),
  saveNote: (...args: Parameters<typeof noteMocks.saveNote>) =>
    noteMocks.saveNote(...args),
}));

vi.mock('./preview', () => ({
  writeNoteWithPreview: (
    ...args: Parameters<typeof previewMocks.writeNoteWithPreview>
  ) => previewMocks.writeNoteWithPreview(...args),
}));

vi.mock('./workspace', () => ({
  addView: (...args: Parameters<typeof workspaceMocks.addView>) =>
    workspaceMocks.addView(...args),
  atomicWrite: (...args: Parameters<typeof workspaceMocks.atomicWrite>) =>
    workspaceMocks.atomicWrite(...args),
  initWorkspace: (...args: Parameters<typeof workspaceMocks.initWorkspace>) =>
    workspaceMocks.initWorkspace(...args),
  loadWorkspaceConfig: (
    ...args: Parameters<typeof workspaceMocks.loadWorkspaceConfig>
  ) => workspaceMocks.loadWorkspaceConfig(...args),
  removeView: (...args: Parameters<typeof workspaceMocks.removeView>) =>
    workspaceMocks.removeView(...args),
  renameView: (...args: Parameters<typeof workspaceMocks.renameView>) =>
    workspaceMocks.renameView(...args),
  restoreView: (...args: Parameters<typeof workspaceMocks.restoreView>) =>
    workspaceMocks.restoreView(...args),
  seedFirstRunIfNeeded: (
    ...args: Parameters<typeof workspaceMocks.seedFirstRunIfNeeded>
  ) => workspaceMocks.seedFirstRunIfNeeded(...args),
}));

const bunFileMock = vi.fn();
const bunWriteMock = vi.fn();
vi.stubGlobal('Bun', {
  file: bunFileMock,
  write: bunWriteMock,
});

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const loadIndexModule = async () => {
  const mod = await import('./index');
  await Promise.resolve();
  await Promise.resolve();
  return mod;
};

// Loose handler signature: tests invoke handlers dynamically with varied
// payloads. Explicit keys (no index signature) avoid `noUncheckedIndexedAccess`.
type AnyHandler = (payload?: unknown) => unknown | Promise<unknown>;
interface CanvasHandlers {
  createNote: AnyHandler;
  createView: AnyHandler;
  deleteNote: AnyHandler;
  deleteView: AnyHandler;
  exportPng: AnyHandler;
  getSettings: AnyHandler;
  listViews: AnyHandler;
  loadAttachment: AnyHandler;
  loadCanvas: AnyHandler;
  openSettings: AnyHandler;
  renameView: AnyHandler;
  saveAttachment: AnyHandler;
  saveManifest: AnyHandler;
  saveNote: AnyHandler;
}
interface SettingsHandlers {
  getSettings: AnyHandler;
  saveSettings: AnyHandler;
}

const getCanvasHandlers = (): CanvasHandlers => {
  const call = defineRpcMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('defineRPC was not called');
  }
  return call[0].handlers.requests as unknown as CanvasHandlers;
};

const getSettingsHandlers = (): SettingsHandlers => {
  const call = defineRpcMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('defineRPC was not called');
  }
  return call[0].handlers.requests as unknown as SettingsHandlers;
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localInfoChannelMock.mockResolvedValue('prod');
  openFileDialogMock.mockResolvedValue(['/tmp/exports']);
  fetchMock.mockReset();
  bunFileMock.mockReset();
  bunWriteMock.mockReset();
  workspaceMocks.atomicWrite.mockResolvedValue(undefined);
  workspaceMocks.loadWorkspaceConfig.mockResolvedValue({
    activeViewId: 'default',
    views: [
      { id: 'default', name: 'Default', file: 'views/default.canvas.json' },
    ],
  });
  workspaceMocks.addView.mockResolvedValue({
    id: 'view-new',
    name: 'Inbox',
    file: 'views/view-new.canvas.json',
  });
  workspaceMocks.removeView.mockResolvedValue({
    success: true,
    activeViewId: 'default',
    trashId: 'trash_default',
  });
  workspaceMocks.renameView.mockResolvedValue(true);
  workspaceMocks.restoreView.mockResolvedValue({ success: false });
  manifestMocks.saveManifest.mockResolvedValue(undefined);
  previewMocks.writeNoteWithPreview.mockResolvedValue({
    html: '<p>Body</p>',
    excerpt: 'Body',
    blocks: 1,
    version: 1,
  });
  bunFileMock.mockReturnValue({
    exists: vi.fn().mockResolvedValue(false),
    json: vi.fn(),
  });
});

describe('src/bun/index helpers', () => {
  it('getMainViewUrl returns dev server url when dev server is reachable', async () => {
    localInfoChannelMock.mockResolvedValue('dev');
    fetchMock.mockResolvedValue({ ok: true });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getMainViewUrl, getSettingsViewUrl } = await loadIndexModule();
    await expect(getMainViewUrl()).resolves.toBe('http://localhost:5173');
    expect(getSettingsViewUrl('http://localhost:5173')).toBe(
      'http://localhost:5173/settings.html'
    );
    expect(getSettingsViewUrl('views://mainview/index.html')).toBe(
      'views://settingsview/index.html'
    );

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5173', {
      method: 'HEAD',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      'HMR enabled: Using Vite dev server at http://localhost:5173'
    );
  });

  it('waitForDevServer returns false after retry failures', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('offline'));
    const { waitForDevServer } = await loadIndexModule();

    const resultPromise = waitForDevServer();
    await vi.advanceTimersByTimeAsync(20 * 250);
    await expect(resultPromise).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(20);
    vi.useRealTimers();
  });

  it('loadSettings merges stored settings with defaults and resets invalid JSON', async () => {
    const { loadSettings, DEFAULT_SETTINGS } = await loadIndexModule();

    bunFileMock.mockReturnValueOnce({
      exists: vi.fn().mockResolvedValue(true),
      json: vi.fn().mockResolvedValue({ locale: 'zh' }),
    });
    await expect(loadSettings('/workspace-a')).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      locale: 'zh',
    });

    bunFileMock.mockReturnValueOnce({
      exists: vi.fn().mockResolvedValue(true),
      json: vi.fn().mockRejectedValue(new Error('bad json')),
    });
    await expect(loadSettings('/workspace-b')).resolves.toEqual(
      DEFAULT_SETTINGS
    );
  });

  it('persistSettings writes through atomicWrite after settings file is known', async () => {
    const { loadSettings, persistSettings } = await loadIndexModule();

    bunFileMock.mockReturnValueOnce({
      exists: vi.fn().mockResolvedValue(false),
      json: vi.fn(),
    });
    await loadSettings('/workspace-c');
    await persistSettings({
      theme: 'dark',
      locale: 'zh',
      defaultLayoutMode: 'document',
    });

    expect(workspaceMocks.atomicWrite).toHaveBeenCalledWith(
      '/workspace-c/.ghostboard/settings.json',
      JSON.stringify(
        { theme: 'dark', locale: 'zh', defaultLayoutMode: 'document' },
        null,
        2
      )
    );
  });

  it('listViews returns workspace config from canvas RPC handlers', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    workspaceMocks.loadWorkspaceConfig.mockResolvedValueOnce({
      activeViewId: 'focus',
      views: [{ id: 'focus', name: 'Focus', file: 'views/focus.canvas.json' }],
    });

    await expect(canvasHandlers.listViews()).resolves.toEqual({
      activeViewId: 'focus',
      views: [{ id: 'focus', name: 'Focus', file: 'views/focus.canvas.json' }],
    });
  });

  it('createView writes an empty manifest and returns the created entry', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    workspaceMocks.addView.mockResolvedValueOnce({
      id: 'view-2',
      name: 'Roadmap',
      file: 'views/view-2.canvas.json',
    });

    await expect(
      canvasHandlers.createView({ name: 'Roadmap' })
    ).resolves.toEqual({
      id: 'view-2',
      name: 'Roadmap',
      file: 'views/view-2.canvas.json',
    });
    expect(manifestMocks.saveManifest).toHaveBeenCalledWith(
      '/tmp/workspace',
      'views/view-2.canvas.json',
      {
        schema: 'ghostboard-canvas/v1',
        viewId: 'view-2',
        nodes: [],
        edges: [],
      }
    );
  });

  it('deleteView returns success with activeViewId and trashId, and false when removal fails', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    workspaceMocks.removeView.mockResolvedValueOnce({
      success: true,
      activeViewId: 'default',
      trashId: 'trash_123',
    });
    await expect(
      canvasHandlers.deleteView({ viewId: 'view-2' })
    ).resolves.toEqual({
      success: true,
      activeViewId: 'default',
      trashId: 'trash_123',
    });

    workspaceMocks.removeView.mockResolvedValueOnce({ success: false });
    await expect(
      canvasHandlers.deleteView({ viewId: 'missing' })
    ).resolves.toEqual({
      success: false,
    });
  });

  it('renameView forwards success and failure from workspace layer', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    workspaceMocks.renameView.mockResolvedValueOnce(true);
    await expect(
      canvasHandlers.renameView({ viewId: 'view-2', name: 'Renamed' })
    ).resolves.toEqual({ success: true });

    workspaceMocks.renameView.mockResolvedValueOnce(false);
    await expect(
      canvasHandlers.renameView({ viewId: 'missing', name: 'Nope' })
    ).resolves.toEqual({
      success: false,
    });
  });

  it('openSettings focuses an existing window and otherwise creates a new settings window', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    expect(canvasHandlers.openSettings()).toEqual({ success: true });
    expect(browserWindowMock).toHaveBeenCalledTimes(2);
    expect(browserWindowMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Settings',
        frame: {
          width: 400,
          height: 380,
          x: 450,
          y: 360,
        },
      })
    );

    expect(canvasHandlers.openSettings()).toEqual({ success: true });
    expect(browserWindowFocusMock).toHaveBeenCalled();
    expect(browserWindowMock).toHaveBeenCalledTimes(2);
  });

  it('settings RPC returns cached settings and saveSettings pushes updates', async () => {
    const { loadSettings } = await loadIndexModule();
    bunFileMock.mockReturnValueOnce({
      exists: vi.fn().mockResolvedValue(false),
      json: vi.fn(),
    });
    await loadSettings('/workspace-settings');

    const canvasHandlers = getCanvasHandlers();
    expect(canvasHandlers.openSettings()).toEqual({ success: true });

    const settingsHandlers = getSettingsHandlers();
    expect(settingsHandlers.getSettings()).toEqual({
      theme: 'system',
      locale: 'en',
      defaultLayoutMode: 'canvas',
    });

    await expect(
      settingsHandlers.saveSettings({
        theme: 'dark',
        locale: 'zh',
        defaultLayoutMode: 'document',
      })
    ).resolves.toEqual({
      success: true,
    });
    expect(workspaceMocks.atomicWrite).toHaveBeenCalledWith(
      '/workspace-settings/.ghostboard/settings.json',
      JSON.stringify(
        { theme: 'dark', locale: 'zh', defaultLayoutMode: 'document' },
        null,
        2
      )
    );
    expect(settingsUpdatedMock).toHaveBeenCalledWith({
      theme: 'dark',
      locale: 'zh',
    });
  });

  it('saveManifest writes card notes through preview generation', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    noteMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([['note-1', 'content/note-1.md']])
    );
    noteMocks.loadNote.mockResolvedValueOnce({
      file: 'content/note-1.md',
      frontmatter: {
        id: 'note-1',
        previewHtml: '<p>Old</p>',
      },
      body: 'Old',
    });
    noteMocks.cardDataToNote.mockReturnValueOnce({
      frontmatter: {
        id: 'note-1',
        displayHint: 'note',
        title: 'Note',
      },
      body: '# Note',
    });

    await expect(
      canvasHandlers.saveManifest({
        viewId: 'default',
        nodes: [
          {
            id: 'card-1',
            type: 'card',
            position: { x: 10, y: 20 },
            data: {
              noteId: 'note-1',
              title: 'Note',
              type: 'text',
              content: '# Note',
              previewHtml: '<p>Stale</p>',
            },
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      })
    ).resolves.toEqual({ success: true });

    expect(previewMocks.writeNoteWithPreview).toHaveBeenCalledWith(
      '/tmp/workspace',
      'content/note-1.md',
      {
        id: 'note-1',
        displayHint: 'note',
        title: 'Note',
      },
      '# Note'
    );
    expect(manifestMocks.saveManifest).toHaveBeenCalledWith(
      '/tmp/workspace',
      'views/default.canvas.json',
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            data: {
              file: 'content/note-1.md',
              noteId: 'note-1',
              type: 'text',
            },
          }),
        ],
      })
    );
  });

  it('saveNote returns generated preview metadata', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    const preview = {
      html: '<p>Updated</p>',
      excerpt: 'Updated',
      blocks: 1,
      version: 1,
    };
    noteMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([['note-1', 'content/note-1.md']])
    );
    previewMocks.writeNoteWithPreview.mockResolvedValueOnce(preview);

    await expect(
      canvasHandlers.saveNote({
        noteId: 'note-1',
        frontmatter: { id: 'note-1', title: 'Note' },
        body: 'Updated',
      })
    ).resolves.toEqual({ success: true, preview });

    expect(previewMocks.writeNoteWithPreview).toHaveBeenCalledWith(
      '/tmp/workspace',
      'content/note-1.md',
      expect.objectContaining({
        id: 'note-1',
        title: 'Note',
        updatedAt: expect.any(String),
      }),
      'Updated'
    );
  });

  it('saveAttachment maps image extensions and rejects invalid data urls', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '12345678-abcd-0000-0000-000000000000'
    );

    await expect(
      canvasHandlers.saveAttachment({
        dataUrl: 'data:image/jpeg;base64,Zm9v',
      })
    ).resolves.toEqual({ filePath: 'attachments/img_12345678.jpg' });
    expect(bunWriteMock).toHaveBeenCalledWith(
      '/tmp/workspace/attachments/img_12345678.jpg',
      expect.any(Uint8Array)
    );

    await expect(
      canvasHandlers.saveAttachment({ dataUrl: 'not-a-data-url' })
    ).rejects.toThrow('Invalid data URL');
  });

  it('exportPng opens a folder picker and writes the selected PNG path', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    await expect(
      canvasHandlers.exportPng({
        dataUrl: 'data:image/png;base64,AQID',
        fileName: 'My Canvas.png',
      })
    ).resolves.toEqual({
      filePath: '/tmp/exports/My Canvas.png',
      success: true,
    });

    expect(openFileDialogMock).toHaveBeenCalledWith({
      allowedFileTypes: 'png',
      allowsMultipleSelection: false,
      canChooseDirectory: true,
      canChooseFiles: false,
      startingFolder: '~/Desktop',
    });
    expect(bunWriteMock).toHaveBeenCalledWith(
      '/tmp/exports/My Canvas.png',
      expect.any(Uint8Array)
    );
  });

  it('exportPng handles cancel and rejects invalid data urls', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    openFileDialogMock.mockResolvedValueOnce([]);
    await expect(
      canvasHandlers.exportPng({
        dataUrl: 'data:image/png;base64,AQID',
        fileName: 'Canceled',
      })
    ).resolves.toEqual({ canceled: true, success: false });

    await expect(
      canvasHandlers.exportPng({
        dataUrl: 'data:image/jpeg;base64,AQID',
        fileName: 'Wrong type',
      })
    ).rejects.toThrow('Invalid PNG data URL');
  });

  it('loadAttachment returns null for missing file and data url for existing file', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    bunFileMock.mockReturnValueOnce({
      exists: vi.fn().mockResolvedValue(false),
    });
    await expect(
      canvasHandlers.loadAttachment({ filePath: 'attachments/missing.png' })
    ).resolves.toBeNull();

    bunFileMock.mockReturnValueOnce({
      exists: vi.fn().mockResolvedValue(true),
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      type: 'image/png',
    });
    await expect(
      canvasHandlers.loadAttachment({ filePath: 'attachments/existing.png' })
    ).resolves.toEqual({ dataUrl: 'data:image/png;base64,AQID' });
  });

  it('saveManifest writes folder card-children as independent notes and reduces them to references', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    noteMocks.buildNoteIndex.mockResolvedValueOnce(new Map());
    noteMocks.createNote.mockResolvedValueOnce('content/folder-child.md');
    noteMocks.loadNote.mockResolvedValueOnce(null);
    noteMocks.cardDataToNote.mockReturnValueOnce({
      frontmatter: { id: 'whatever', title: 'Child', displayHint: 'note' },
      body: 'Body',
    });

    await expect(
      canvasHandlers.saveManifest({
        viewId: 'default',
        nodes: [
          {
            id: 'folder-1',
            type: 'folder',
            position: { x: 0, y: 0 },
            data: {
              title: '1 items',
              children: [
                {
                  id: 'child-1',
                  type: 'card',
                  data: {
                    type: 'text',
                    title: 'Child',
                    content: 'Body',
                    color: '#FFFFFF',
                  },
                },
              ],
            },
          },
        ],
        edges: [],
      })
    ).resolves.toEqual({ success: true });

    expect(noteMocks.createNote).toHaveBeenCalledTimes(1);
    expect(previewMocks.writeNoteWithPreview).toHaveBeenCalledWith(
      '/tmp/workspace',
      'content/folder-child.md',
      expect.objectContaining({ title: 'Child' }),
      'Body'
    );

    const manifestCall = manifestMocks.saveManifest.mock.calls.at(-1);
    expect(manifestCall).toBeDefined();
    const savedManifest = manifestCall?.[2];
    const savedFolder = savedManifest.nodes[0];
    expect(savedFolder.type).toBe('folder');
    const savedChildren = savedFolder.data.children;
    expect(savedChildren).toHaveLength(1);
    expect(savedChildren[0]).toMatchObject({
      id: 'child-1',
      type: 'card',
      noteId: expect.stringMatching(NOTE_ID_RE),
      data: {
        file: 'content/folder-child.md',
        noteId: expect.stringMatching(NOTE_ID_RE),
        type: 'text',
      },
    });
  });

  it('saveManifest reuses an existing note file for folder children with a noteId', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    noteMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([['note_existing', 'content/existing.md']])
    );
    noteMocks.loadNote.mockResolvedValueOnce({
      file: 'content/existing.md',
      frontmatter: { id: 'note_existing', createdAt: '2024-01-01' },
      body: 'Old',
    });
    noteMocks.cardDataToNote.mockReturnValueOnce({
      frontmatter: { id: 'note_existing', title: 'Child' },
      body: 'Body',
    });

    await canvasHandlers.saveManifest({
      viewId: 'default',
      nodes: [
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 0, y: 0 },
          data: {
            title: '1 items',
            children: [
              {
                id: 'child-1',
                noteId: 'note_existing',
                type: 'card',
                data: {
                  type: 'text',
                  title: 'Child',
                  content: 'Body',
                  color: '#FFFFFF',
                  noteId: 'note_existing',
                },
              },
            ],
          },
        },
      ],
      edges: [],
    });

    // No new file should be created when the noteId already has a file.
    expect(noteMocks.createNote).not.toHaveBeenCalled();
    expect(previewMocks.writeNoteWithPreview).toHaveBeenCalledWith(
      '/tmp/workspace',
      'content/existing.md',
      expect.objectContaining({ id: 'note_existing' }),
      'Body'
    );
  });

  it('loadCanvas stamps a noteId onto legacy folder children that lack one', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    manifestMocks.loadManifest.mockResolvedValueOnce({
      schema: 'ghostboard-canvas/v1',
      viewId: 'default',
      nodes: [
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 0, y: 0 },
          data: {
            title: '1 items',
            children: [
              {
                id: 'child-legacy',
                type: 'card',
                data: {
                  type: 'text',
                  title: 'Legacy',
                  content: 'inline body',
                },
              },
            ],
          },
        },
      ],
      edges: [],
    });
    noteMocks.buildNoteIndex.mockResolvedValueOnce(new Map());

    const result = await canvasHandlers.loadCanvas({ viewId: 'default' });
    const folder = (result as { nodes: Record<string, any>[] }).nodes[0];
    expect(folder).toBeDefined();
    const child = folder?.data.children[0];
    expect(child.noteId).toMatch(NOTE_ID_RE);
    expect(child.data.noteId).toBe(child.noteId);
    expect(child.data.content).toBe('inline body');
  });

  it('loadCanvas hydrates folder card children from their note files', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    manifestMocks.loadManifest.mockResolvedValueOnce({
      schema: 'ghostboard-canvas/v1',
      viewId: 'default',
      nodes: [
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 0, y: 0 },
          data: {
            title: '1 items',
            children: [
              {
                id: 'child-1',
                noteId: 'note_abc',
                type: 'card',
                data: {
                  noteId: 'note_abc',
                  file: 'content/note_abc.md',
                  type: 'text',
                },
              },
            ],
          },
        },
      ],
      edges: [],
    });
    noteMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([['note_abc', 'content/note_abc.md']])
    );
    noteMocks.loadNote.mockResolvedValueOnce({
      file: 'content/note_abc.md',
      frontmatter: { id: 'note_abc', title: 'Hydrated' },
      body: 'hydrated body',
    });
    noteMocks.noteToCardData.mockReturnValueOnce({
      type: 'text',
      title: 'Hydrated',
      content: 'hydrated body',
      file: 'content/note_abc.md',
    });

    const result = await canvasHandlers.loadCanvas({ viewId: 'default' });
    const folder = (result as { nodes: Record<string, any>[] }).nodes[0];
    expect(folder).toBeDefined();
    const child = folder?.data.children[0];
    expect(noteMocks.noteToCardData).toHaveBeenCalled();
    expect(child.data.title).toBe('Hydrated');
    expect(child.data.content).toBe('hydrated body');
    expect(child.data.noteId).toBe('note_abc');
  });
});
