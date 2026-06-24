import { mkdirSync } from 'node:fs';

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
const openPathMock = vi.fn();
const bunSpawnMock = vi.fn();

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
    openPath: openPathMock,
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
  listFilesRecursive: vi.fn(),
  loadNote: vi.fn(),
  noteToCardData: vi.fn(),
  saveNote: vi.fn(),
};

const previewMocks = {
  buildNotePreviewFromBlocks: vi.fn(),
  writeNoteWithPreview: vi.fn(),
};

const noteStoreMocks = {
  buildNoteIndex: vi.fn(),
  listNoteRecords: vi.fn(),
  loadNoteRecord: vi.fn(),
  mergeNoteMeta: vi.fn(),
  noteRecordToCardData: vi.fn(),
};

const workspaceMocks = {
  addView: vi.fn(),
  addViewFromTemplate: vi.fn(),
  atomicWrite: vi.fn(),
  clearAllTrash: vi.fn(),
  getDefaultWorkspacePath: vi.fn(() => '/tmp/workspace-default'),
  initWorkspace: vi.fn(() => '/tmp/workspace'),
  listTrash: vi.fn(async () => []),
  loadWorkspaceConfig: vi.fn(),
  purgeTrash: vi.fn(async () => ({ success: true })),
  removeView: vi.fn(),
  renameView: vi.fn(),
  restoreView: vi.fn(),
  seedFirstRunIfNeeded: vi.fn(async () => undefined),
  setActiveViewId: vi.fn(async () => true),
};

const userPrefsMocks = {
  loadUserPrefs: vi.fn(async () => ({})),
  saveUserPrefs: vi.fn(async () => undefined),
};

vi.mock('./manifest', () => ({
  loadManifest: (...args: Parameters<typeof manifestMocks.loadManifest>) =>
    manifestMocks.loadManifest(...args),
  saveManifest: (...args: Parameters<typeof manifestMocks.saveManifest>) =>
    manifestMocks.saveManifest(...args),
}));

vi.mock('./notes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./notes')>();
  return {
    ...actual,
    buildNoteIndex: (...args: Parameters<typeof noteMocks.buildNoteIndex>) =>
      noteMocks.buildNoteIndex(...args),
    cardDataToNote: (...args: Parameters<typeof noteMocks.cardDataToNote>) =>
      noteMocks.cardDataToNote(...args),
    createNote: (...args: Parameters<typeof noteMocks.createNote>) =>
      noteMocks.createNote(...args),
    deleteNoteFile: (...args: Parameters<typeof noteMocks.deleteNoteFile>) =>
      noteMocks.deleteNoteFile(...args),
    listFilesRecursive: (
      ...args: Parameters<typeof noteMocks.listFilesRecursive>
    ) => noteMocks.listFilesRecursive(...args),
    loadNote: (...args: Parameters<typeof noteMocks.loadNote>) =>
      noteMocks.loadNote(...args),
    noteToCardData: (...args: Parameters<typeof noteMocks.noteToCardData>) =>
      noteMocks.noteToCardData(...args),
    saveNote: (...args: Parameters<typeof noteMocks.saveNote>) =>
      noteMocks.saveNote(...args),
  };
});

vi.mock('./preview', () => ({
  buildNotePreviewFromBlocks: (
    ...args: Parameters<typeof previewMocks.buildNotePreviewFromBlocks>
  ) => previewMocks.buildNotePreviewFromBlocks(...args),
  writeNoteWithPreview: (
    ...args: Parameters<typeof previewMocks.writeNoteWithPreview>
  ) => previewMocks.writeNoteWithPreview(...args),
}));

vi.mock('./noteStore', () => ({
  buildNoteIndex: (...args: Parameters<typeof noteStoreMocks.buildNoteIndex>) =>
    noteStoreMocks.buildNoteIndex(...args),
  listNoteRecords: (
    ...args: Parameters<typeof noteStoreMocks.listNoteRecords>
  ) => noteStoreMocks.listNoteRecords(...args),
  loadNoteRecord: (...args: Parameters<typeof noteStoreMocks.loadNoteRecord>) =>
    noteStoreMocks.loadNoteRecord(...args),
  mergeNoteMeta: (...args: Parameters<typeof noteStoreMocks.mergeNoteMeta>) =>
    noteStoreMocks.mergeNoteMeta(...args),
  noteRecordToCardData: (
    ...args: Parameters<typeof noteStoreMocks.noteRecordToCardData>
  ) => noteStoreMocks.noteRecordToCardData(...args),
}));

vi.mock('./workspace', () => ({
  addView: (...args: Parameters<typeof workspaceMocks.addView>) =>
    workspaceMocks.addView(...args),
  addViewFromTemplate: (
    ...args: Parameters<typeof workspaceMocks.addViewFromTemplate>
  ) => workspaceMocks.addViewFromTemplate(...args),
  atomicWrite: (...args: Parameters<typeof workspaceMocks.atomicWrite>) =>
    workspaceMocks.atomicWrite(...args),
  clearAllTrash: (...args: Parameters<typeof workspaceMocks.clearAllTrash>) =>
    workspaceMocks.clearAllTrash(...args),
  getDefaultWorkspacePath: (
    ...args: Parameters<typeof workspaceMocks.getDefaultWorkspacePath>
  ) => workspaceMocks.getDefaultWorkspacePath(...args),
  initWorkspace: (...args: Parameters<typeof workspaceMocks.initWorkspace>) =>
    workspaceMocks.initWorkspace(...args),
  listTrash: (...args: Parameters<typeof workspaceMocks.listTrash>) =>
    workspaceMocks.listTrash(...args),
  loadWorkspaceConfig: (
    ...args: Parameters<typeof workspaceMocks.loadWorkspaceConfig>
  ) => workspaceMocks.loadWorkspaceConfig(...args),
  purgeTrash: (...args: Parameters<typeof workspaceMocks.purgeTrash>) =>
    workspaceMocks.purgeTrash(...args),
  removeView: (...args: Parameters<typeof workspaceMocks.removeView>) =>
    workspaceMocks.removeView(...args),
  renameView: (...args: Parameters<typeof workspaceMocks.renameView>) =>
    workspaceMocks.renameView(...args),
  restoreView: (...args: Parameters<typeof workspaceMocks.restoreView>) =>
    workspaceMocks.restoreView(...args),
  seedFirstRunIfNeeded: (
    ...args: Parameters<typeof workspaceMocks.seedFirstRunIfNeeded>
  ) => workspaceMocks.seedFirstRunIfNeeded(...args),
  setActiveViewId: (
    ...args: Parameters<typeof workspaceMocks.setActiveViewId>
  ) => workspaceMocks.setActiveViewId(...args),
}));

vi.mock('./userprefs', () => ({
  loadUserPrefs: (...args: Parameters<typeof userPrefsMocks.loadUserPrefs>) =>
    userPrefsMocks.loadUserPrefs(...args),
  saveUserPrefs: (...args: Parameters<typeof userPrefsMocks.saveUserPrefs>) =>
    userPrefsMocks.saveUserPrefs(...args),
}));

const aiCredentialsMocks = {
  loadAICredentials: vi.fn(async () => ({}) as { apiKey?: string }),
  saveAIApiKey: vi.fn(async () => undefined),
};

vi.mock('./aicredentials', () => ({
  loadAICredentials: (
    ...args: Parameters<typeof aiCredentialsMocks.loadAICredentials>
  ) => aiCredentialsMocks.loadAICredentials(...args),
  saveAIApiKey: (...args: Parameters<typeof aiCredentialsMocks.saveAIApiKey>) =>
    aiCredentialsMocks.saveAIApiKey(...args),
}));

const bunFileMock = vi.fn();
const bunWriteMock = vi.fn();
const bunServeMock = vi.fn(() => ({
  port: 0,
  stop: vi.fn(),
}));
vi.stubGlobal('Bun', {
  file: bunFileMock,
  serve: bunServeMock,
  spawn: bunSpawnMock,
  write: bunWriteMock,
});

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const loadIndexModule = async () => {
  const mod = await import('./index');
  // main() chains many awaits before reaching defineRPC; flush enough
  // microtasks so the RPC handlers are registered before tests query them.
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
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
  exportJson: AnyHandler;
  exportNoteMarkdown: AnyHandler;
  exportNotesMarkdown: AnyHandler;
  exportPng: AnyHandler;
  getSettings: AnyHandler;
  importMarkdownFiles: AnyHandler;
  listViews: AnyHandler;
  loadAttachment: AnyHandler;
  loadBlockNote: AnyHandler;
  loadCanvas: AnyHandler;
  openAttachment: AnyHandler;
  openSettings: AnyHandler;
  renameView: AnyHandler;
  saveAttachment: AnyHandler;
  saveBlockNote: AnyHandler;
  saveManifest: AnyHandler;
  saveNote: AnyHandler;
}
interface SettingsHandlers {
  exportWorkspaceArchive: AnyHandler;
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
  openPathMock.mockReset();
  openPathMock.mockReturnValue(true);
  fetchMock.mockReset();
  bunFileMock.mockReset();
  bunSpawnMock.mockReset();
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
  previewMocks.buildNotePreviewFromBlocks.mockReturnValue({
    html: '<p>Blocks</p>',
    excerpt: 'Blocks',
    blocks: 1,
    version: 1,
  });
  // Note store defaults: empty workspace, no-op meta merge.
  noteStoreMocks.buildNoteIndex.mockResolvedValue(new Map());
  noteStoreMocks.listNoteRecords.mockResolvedValue([]);
  noteStoreMocks.loadNoteRecord.mockResolvedValue(null);
  noteStoreMocks.mergeNoteMeta.mockResolvedValue(false);
  noteStoreMocks.noteRecordToCardData.mockReturnValue({});
  noteMocks.listFilesRecursive.mockReturnValue([]);
  bunFileMock.mockReturnValue({
    exists: vi.fn().mockResolvedValue(false),
    json: vi.fn(),
    size: 123,
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

  it('uses a finite main-window RPC request timeout', async () => {
    await loadIndexModule();

    const canvasRpcCall = defineRpcMock.mock.calls.find(
      ([config]) => 'loadCanvas' in config.handlers.requests
    );

    expect(canvasRpcCall?.[0].maxRequestTime).toBe(10_000);
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
      fontFamily: 'system',
      canvasBackground: 'default',
      canvasSnapToGrid: true,
      autoSaveInterval: 800,
      aiEnabled: false,
      aiProvider: 'openai',
      aiModel: 'gpt-4.1-mini',
      aiBaseUrl: '',
    });

    expect(workspaceMocks.atomicWrite).toHaveBeenCalledWith(
      '/workspace-c/.ghostboard/settings.json',
      JSON.stringify(
        {
          theme: 'dark',
          locale: 'zh',
          fontFamily: 'system',
          canvasBackground: 'default',
          canvasSnapToGrid: true,
          autoSaveInterval: 800,
          aiEnabled: false,
          aiProvider: 'openai',
          aiModel: 'gpt-4.1-mini',
          aiBaseUrl: '',
        },
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
        url: expect.stringContaining('settingsview'),
        rpc: expect.objectContaining({
          send: expect.objectContaining({
            settingsUpdated: expect.any(Function),
          }),
        }),
        frame: {
          width: 720,
          height: 560,
          x: 290,
          y: 270,
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

    const { DEFAULT_SETTINGS } = await loadIndexModule();
    const settingsHandlers = getSettingsHandlers();
    expect(settingsHandlers.getSettings()).toEqual(DEFAULT_SETTINGS);

    await expect(
      settingsHandlers.saveSettings({
        theme: 'dark',
        locale: 'zh',
      })
    ).resolves.toEqual({
      success: true,
    });
    expect(workspaceMocks.atomicWrite).toHaveBeenCalledWith(
      '/workspace-settings/.ghostboard/settings.json',
      JSON.stringify(
        { ...DEFAULT_SETTINGS, theme: 'dark', locale: 'zh' },
        null,
        2
      )
    );
    expect(settingsUpdatedMock).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      locale: 'zh',
    });
  });

  it('exportWorkspaceArchive refuses to write archives inside the workspace', async () => {
    const workspacePath = '/private/tmp/ghostboard-index-workspace';
    mkdirSync(`${workspacePath}/archives`, { recursive: true });
    workspaceMocks.initWorkspace.mockReturnValueOnce(workspacePath);
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    expect(canvasHandlers.openSettings()).toEqual({ success: true });
    const settingsHandlers = getSettingsHandlers();
    openFileDialogMock.mockResolvedValueOnce([`${workspacePath}/archives`]);
    bunSpawnMock.mockReturnValueOnce({
      exited: Promise.resolve(0),
      stderr: new Blob([]),
    });
    bunFileMock.mockReturnValueOnce({
      exists: vi.fn().mockResolvedValue(true),
      json: vi.fn(),
      size: 123,
    });

    await expect(settingsHandlers.exportWorkspaceArchive()).resolves.toEqual({
      success: false,
    });
    expect(bunSpawnMock).not.toHaveBeenCalled();
  });

  it('saveManifest writes card notes through preview generation', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    noteStoreMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([
        [
          'note-1',
          {
            noteId: 'note-1',
            hasSidecar: false,
            markdownFile: 'content/note-1.md',
          },
        ],
      ])
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

  it('saveManifest merges metadata into sidecar-backed notes without touching the body', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    // The note already has a BlockNote sidecar → JSON is the SoT, so
    // saveManifest must only merge metadata (never write Markdown).
    noteStoreMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([
        [
          'note-1',
          {
            noteId: 'note-1',
            hasSidecar: true,
            markdownFile: 'content/note-1.md',
          },
        ],
      ])
    );

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
              title: 'Old title',
              type: 'text',
              color: '#fca5a5', // changed on canvas
              content: 'stale lossy markdown projection',
            },
          },
        ],
        edges: [],
      })
    ).resolves.toEqual({ success: true });

    // No markdown body write at all.
    expect(previewMocks.writeNoteWithPreview).not.toHaveBeenCalled();
    expect(noteMocks.cardDataToNote).not.toHaveBeenCalled();

    // Metadata merged into the sidecar.
    expect(noteStoreMocks.mergeNoteMeta).toHaveBeenCalledWith(
      '/tmp/workspace',
      'note-1',
      { title: 'Old title', color: '#fca5a5' }
    );
  });

  it('saveManifest omits the file reference for sidecar-only notes', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    // Sidecar exists, no legacy `.md` → the manifest reference carries no file.
    noteStoreMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([['note-1', { noteId: 'note-1', hasSidecar: true }]])
    );

    await canvasHandlers.saveManifest({
      viewId: 'default',
      nodes: [
        {
          id: 'card-1',
          type: 'card',
          position: { x: 99, y: 99 },
          data: {
            noteId: 'note-1',
            title: 'Same',
            color: '#FFFFFF',
            type: 'text',
          },
        },
      ],
      edges: [],
    });

    expect(previewMocks.writeNoteWithPreview).not.toHaveBeenCalled();
    expect(noteStoreMocks.mergeNoteMeta).toHaveBeenCalled();
    const manifest = manifestMocks.saveManifest.mock.calls.at(-1)?.[2] as {
      nodes: Array<{ data: Record<string, unknown> }>;
    };
    expect(manifest.nodes[0]?.data).toEqual({ noteId: 'note-1', type: 'text' });
    expect(manifest.nodes[0]?.data).not.toHaveProperty('file');
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
    noteStoreMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([
        [
          'note-1',
          {
            noteId: 'note-1',
            hasSidecar: false,
            markdownFile: 'content/note-1.md',
          },
        ],
      ])
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

  it('saveBlockNote writes only the JSON sidecar (no markdown) with metadata + preview', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    const blocks = [
      {
        type: 'paragraph',
        props: {},
        content: [{ type: 'text', text: 'hi', styles: {} }],
        children: [],
      },
    ];

    const result = await canvasHandlers.saveBlockNote({
      noteId: 'note_x',
      frontmatter: {
        id: 'note_x',
        title: 'My Note',
        color: '#abc',
        displayHint: 'note',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      blocks,
      markdown: 'hi',
      revision: 4,
    });

    expect(result).toMatchObject({ success: true, revision: 5 });
    // No markdown file is written.
    expect(previewMocks.writeNoteWithPreview).not.toHaveBeenCalled();

    // The note record is persisted as a JSON sidecar via atomicWrite.
    const sidecarCall = workspaceMocks.atomicWrite.mock.calls.find((call) =>
      String(call[0]).endsWith('/content/.ghostboard/blocknote/note_x.json')
    );
    expect(sidecarCall).toBeDefined();
    const sidecar = JSON.parse(String(sidecarCall?.[1])) as {
      blocks: unknown[];
      preview: unknown;
    } & Record<string, unknown>;
    expect(sidecar).toMatchObject({
      schema: 'ghostboard-blocknote/v1',
      noteId: 'note_x',
      revision: 5,
      title: 'My Note',
      color: '#abc',
      displayHint: 'note',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(sidecar.blocks).toHaveLength(1);
    expect(sidecar.preview).toBeDefined();
  });

  it('saveBlockNote retires a lingering markdown mirror for a pre-v0.2 sidecar', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    // Mirror-era sidecar: exists, but has no `preview` field (pre-v0.2).
    bunFileMock.mockImplementation((p: string) => ({
      exists: vi
        .fn()
        .mockResolvedValue(
          p.endsWith('/content/.ghostboard/blocknote/note_mig.json')
        ),
      json: vi.fn().mockResolvedValue({
        schema: 'ghostboard-blocknote/v1',
        noteId: 'note_mig',
        revision: 2,
        blocks: [{ type: 'paragraph' }],
      }),
      text: vi.fn(),
    }));
    noteStoreMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([
        [
          'note_mig',
          {
            noteId: 'note_mig',
            hasSidecar: true,
            markdownFile: 'content/old-mirror.md',
          },
        ],
      ])
    );

    const result = await canvasHandlers.saveBlockNote({
      noteId: 'note_mig',
      frontmatter: { id: 'note_mig', title: 'Migrated' },
      blocks: [
        {
          type: 'paragraph',
          props: {},
          content: [{ type: 'text', text: 'x', styles: {} }],
          children: [],
        },
      ],
      markdown: 'x',
      revision: 2,
    });

    expect(result).toMatchObject({ success: true, revision: 3 });
    // The stale `.md` mirror is retired.
    expect(noteMocks.deleteNoteFile).toHaveBeenCalledWith(
      '/tmp/workspace',
      'content/old-mirror.md'
    );
  });

  it('saveBlockNote skips the mirror scan once the sidecar has a preview', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    // v0.2 sidecar already migrated: has a `preview` field.
    bunFileMock.mockImplementation((p: string) => ({
      exists: vi
        .fn()
        .mockResolvedValue(
          p.endsWith('/content/.ghostboard/blocknote/note_v2.json')
        ),
      json: vi.fn().mockResolvedValue({
        schema: 'ghostboard-blocknote/v1',
        noteId: 'note_v2',
        revision: 4,
        blocks: [{ type: 'paragraph' }],
        preview: { html: '', excerpt: '', blocks: 0, version: 1 },
      }),
      text: vi.fn(),
    }));

    await canvasHandlers.saveBlockNote({
      noteId: 'note_v2',
      frontmatter: { id: 'note_v2', title: 'Already migrated' },
      blocks: [],
      markdown: '',
      revision: 4,
    });

    // No index scan, no mirror deletion on a steady-state save.
    expect(noteStoreMocks.buildNoteIndex).not.toHaveBeenCalled();
    expect(noteMocks.deleteNoteFile).not.toHaveBeenCalled();
  });

  it('loadBlockNote returns sidecar blocks without any markdown reconcile', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    bunFileMock.mockImplementation((p: string) => ({
      exists: vi
        .fn()
        .mockResolvedValue(
          p.endsWith('/content/.ghostboard/blocknote/note_y.json')
        ),
      json: vi.fn().mockResolvedValue({
        schema: 'ghostboard-blocknote/v1',
        noteId: 'note_y',
        revision: 9,
        blocks: [{ type: 'paragraph' }],
      }),
      text: vi.fn(),
    }));

    const result = (await canvasHandlers.loadBlockNote({
      noteId: 'note_y',
    })) as {
      success: boolean;
      blocks?: unknown[];
      revision?: number;
      recoveredFromMarkdown?: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.revision).toBe(9);
    expect(result.blocks).toHaveLength(1);
    expect(result.recoveredFromMarkdown).toBeUndefined();
    // No conflict backup / markdown reconcile ever runs.
    expect(previewMocks.writeNoteWithPreview).not.toHaveBeenCalled();
  });

  it('loadBlockNote offers a one-time markdown import when no sidecar exists', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    // Default Bun.file → sidecar does not exist. Legacy markdown is indexed.
    noteStoreMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([
        [
          'note_z',
          { noteId: 'note_z', hasSidecar: false, markdownFile: 'content/z.md' },
        ],
      ])
    );
    noteMocks.loadNote.mockResolvedValueOnce({
      file: 'content/z.md',
      frontmatter: { id: 'note_z' },
      body: 'legacy body',
    });

    const result = (await canvasHandlers.loadBlockNote({
      noteId: 'note_z',
    })) as {
      success: boolean;
      blocks?: unknown[];
      markdown?: string;
      recoveredFromMarkdown?: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.recoveredFromMarkdown).toBe(true);
    expect(result.markdown).toBe('legacy body');
    expect(result.blocks).toBeUndefined();
  });

  it('importMarkdownFiles imports readable files, strips derived headings, and reports failures', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    const importedPath = '/tmp/imported-note.md';
    const missingPath = '/tmp/missing-note.md';

    openFileDialogMock.mockResolvedValueOnce([importedPath, missingPath]);
    bunFileMock.mockImplementation((p: string) => ({
      exists: vi.fn().mockResolvedValue(p === importedPath),
      text: vi.fn().mockResolvedValue('# Hello\n\nBody copy'),
      json: vi.fn(),
    }));
    noteMocks.createNote.mockResolvedValue('content/hello-12345678.md');
    noteMocks.saveNote.mockResolvedValue(undefined);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '12345678-abcd-0000-0000-000000000000'
    );

    const result = (await canvasHandlers.importMarkdownFiles()) as {
      canceled?: boolean;
      failedCount?: number;
      notes: Array<{ content?: string; noteId: string; title: string }>;
    };

    expect(result.canceled).toBeUndefined();
    expect(result.failedCount).toBe(1);
    expect(result.notes).toEqual([
      {
        content: 'Body copy',
        noteId: 'note_12345678',
        title: 'Hello',
      },
    ]);
    expect(noteMocks.saveNote).toHaveBeenCalledWith(
      '/tmp/workspace',
      'content/hello-12345678.md',
      expect.objectContaining({
        createdAt: expect.any(String),
        displayHint: 'text',
        id: 'note_12345678',
        title: 'Hello',
        updatedAt: expect.any(String),
      }),
      'Body copy'
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

  it('saveAttachment stores non-image files with stable attachment paths', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'abcdef12-abcd-0000-0000-000000000000'
    );

    await expect(
      canvasHandlers.saveAttachment({
        dataUrl: 'data:application/pdf;base64,Zm9v',
        kind: 'file',
        mimeType: 'application/pdf',
        suggestedName: 'report.pdf',
      })
    ).resolves.toEqual({ filePath: 'attachments/file_abcdef12.pdf' });
    expect(bunWriteMock).toHaveBeenCalledWith(
      '/tmp/workspace/attachments/file_abcdef12.pdf',
      expect.any(Uint8Array)
    );
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

  it('export handlers keep sanitized filenames inside the selected folder', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    await expect(
      canvasHandlers.exportPng({
        dataUrl: 'data:image/png;base64,AQID',
        fileName: '../Unsafe Canvas.png',
      })
    ).resolves.toEqual({
      filePath: '/tmp/exports/Unsafe Canvas.png',
      success: true,
    });
    expect(bunWriteMock).toHaveBeenCalledWith(
      '/tmp/exports/Unsafe Canvas.png',
      expect.any(Uint8Array)
    );

    await expect(
      canvasHandlers.exportJson({
        json: '{"ok":true}',
        fileName: '../../Unsafe Canvas.json',
      })
    ).resolves.toEqual({
      filePath: '/tmp/exports/Unsafe Canvas.json',
      success: true,
    });
    expect(bunWriteMock).toHaveBeenLastCalledWith(
      '/tmp/exports/Unsafe Canvas.json',
      '{"ok":true}'
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

  it('exportNoteMarkdown writes a single .md from the note record', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    openFileDialogMock.mockResolvedValueOnce(['/tmp/exports']);
    noteStoreMocks.loadNoteRecord.mockResolvedValueOnce({
      noteId: 'note_md1',
      source: 'sidecar',
      title: 'Trip Plan',
      displayHint: 'note',
      color: '',
      revision: 2,
      blocks: [
        {
          type: 'paragraph',
          props: {},
          content: [{ type: 'text', text: 'pack bags', styles: {} }],
          children: [],
        },
      ],
      preview: null,
      corrupted: false,
    });

    const result = (await canvasHandlers.exportNoteMarkdown({
      noteId: 'note_md1',
    })) as { success: boolean; filePath?: string };

    expect(result.success).toBe(true);
    expect(result.filePath).toBe('/tmp/exports/trip-plan-note_md1.md');
    const writeCall = bunWriteMock.mock.calls.find((call: unknown[]) =>
      String(call[0]).endsWith('/trip-plan-note_md1.md')
    );
    expect(writeCall).toBeDefined();
    expect(String(writeCall?.[1])).toContain('pack bags');
    expect(String(writeCall?.[1])).toContain('id: note_md1');
  });

  it('exportNoteMarkdown reports cancel and missing notes', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    // Missing note record → not found.
    noteStoreMocks.loadNoteRecord.mockResolvedValueOnce(null);
    await expect(
      canvasHandlers.exportNoteMarkdown({ noteId: 'gone' })
    ).resolves.toEqual({ success: false });

    // User cancels the folder picker.
    noteStoreMocks.loadNoteRecord.mockResolvedValueOnce({
      noteId: 'note_md2',
      source: 'sidecar',
      title: 'X',
      displayHint: 'note',
      color: '',
      revision: 1,
      blocks: [],
      preview: null,
      corrupted: false,
    });
    openFileDialogMock.mockResolvedValueOnce([]);
    await expect(
      canvasHandlers.exportNoteMarkdown({ noteId: 'note_md2' })
    ).resolves.toEqual({ canceled: true, success: false });
  });

  it('exportNotesMarkdown (all) writes a bundle with notes and index.md', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    openFileDialogMock.mockResolvedValueOnce(['/tmp/exports']);
    noteStoreMocks.listNoteRecords.mockResolvedValueOnce([
      { noteId: 'note_a1' },
      { noteId: 'note_b2' },
    ]);
    noteStoreMocks.loadNoteRecord.mockImplementation(
      (_ws: string, noteId: string) =>
        Promise.resolve({
          noteId,
          source: 'sidecar',
          title: noteId === 'note_a1' ? 'Alpha' : 'Beta',
          displayHint: 'note',
          color: '',
          revision: 1,
          blocks: [
            {
              type: 'paragraph',
              props: {},
              content: [{ type: 'text', text: noteId, styles: {} }],
              children: [],
            },
          ],
          preview: null,
          corrupted: false,
        })
    );

    const result = (await canvasHandlers.exportNotesMarkdown({
      scope: 'all',
    })) as { success: boolean; exported?: number; filePath?: string };

    expect(result.success).toBe(true);
    expect(result.exported).toBe(2);
    expect(result.filePath).toBe('/tmp/exports/GhostBoard Markdown Export');

    const writtenPaths = bunWriteMock.mock.calls.map((call: unknown[]) =>
      String(call[0])
    );
    expect(
      writtenPaths.some((p: string) => p.endsWith('/notes/alpha-note_a1.md'))
    ).toBe(true);
    expect(
      writtenPaths.some((p: string) => p.endsWith('/notes/beta-note_b2.md'))
    ).toBe(true);
    const indexCall = bunWriteMock.mock.calls.find((call: unknown[]) =>
      String(call[0]).endsWith('/index.md')
    );
    expect(indexCall).toBeDefined();
    expect(String(indexCall?.[1])).toContain('# GhostBoard Markdown Export');
    expect(String(indexCall?.[1])).toContain('Documents: 2');
  });

  it('exportNoteMarkdown refuses a corrupted sidecar instead of writing an empty file', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    noteStoreMocks.loadNoteRecord.mockResolvedValueOnce({
      noteId: 'note_corrupt',
      source: 'sidecar',
      title: '',
      displayHint: 'note',
      color: '',
      revision: 3,
      blocks: [],
      preview: null,
      corrupted: true,
    });

    const result = (await canvasHandlers.exportNoteMarkdown({
      noteId: 'note_corrupt',
    })) as { success: boolean };

    expect(result).toEqual({ success: false });
    // No folder picker, no file written.
    expect(openFileDialogMock).not.toHaveBeenCalled();
    const wroteMd = bunWriteMock.mock.calls.some((call: unknown[]) =>
      String(call[0]).endsWith('.md')
    );
    expect(wroteMd).toBe(false);
  });

  it('exportNotesMarkdown counts corrupted notes as failures, not exports', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    openFileDialogMock.mockResolvedValueOnce(['/tmp/exports']);
    noteStoreMocks.loadNoteRecord.mockResolvedValueOnce({
      noteId: 'note_bad',
      source: 'sidecar',
      title: '',
      displayHint: 'note',
      color: '',
      revision: 1,
      blocks: [],
      preview: null,
      corrupted: true,
    });

    const result = (await canvasHandlers.exportNotesMarkdown({
      scope: 'selected',
      noteIds: ['note_bad'],
    })) as { success: boolean; exported?: number; failed?: number };

    expect(result.success).toBe(true);
    expect(result.exported).toBe(0);
    expect(result.failed).toBe(1);
    // No per-note file written for the corrupted note.
    const wroteNote = bunWriteMock.mock.calls.some((call: unknown[]) =>
      String(call[0]).includes('/notes/')
    );
    expect(wroteNote).toBe(false);
    // index.md still records the failure.
    const indexCall = bunWriteMock.mock.calls.find((call: unknown[]) =>
      String(call[0]).endsWith('/index.md')
    );
    expect(String(indexCall?.[1])).toContain('corrupted sidecar');
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

  it('loadAttachment and openAttachment reject unsafe attachment paths', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    await expect(
      canvasHandlers.loadAttachment({ filePath: '../secret.txt' })
    ).rejects.toThrow('Attachment path must stay inside attachments/.');
    await expect(
      canvasHandlers.openAttachment({ filePath: '/tmp/secret.txt' })
    ).rejects.toThrow('Attachment path must be relative.');
  });

  it('openAttachment opens an existing workspace attachment with the default app', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    bunFileMock.mockReturnValueOnce({
      exists: vi.fn().mockResolvedValue(true),
    });

    await expect(
      canvasHandlers.openAttachment({ filePath: 'attachments/report.pdf' })
    ).resolves.toEqual({ success: true });
    expect(openPathMock).toHaveBeenCalledWith(
      '/tmp/workspace/attachments/report.pdf'
    );
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

  it('saveManifest strips runtime asset fields from top-level nodes and folder children', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    noteMocks.buildNoteIndex.mockResolvedValueOnce(new Map());

    await expect(
      canvasHandlers.saveManifest({
        viewId: 'default',
        nodes: [
          {
            id: 'asset-1',
            type: 'asset',
            position: { x: 10, y: 20 },
            data: {
              attachmentFile: 'attachments/file_abc.pdf',
              fileName: 'report.pdf',
              kind: 'file',
              mimeType: 'application/pdf',
              missing: true,
              previewUrl: 'blob:asset',
              thumbnailUrl: 'blob:thumb',
              title: 'report.pdf',
            },
          },
          {
            id: 'recording-1',
            type: 'recording',
            position: { x: 20, y: 30 },
            data: {
              attachmentFile: 'attachments/recording_abc.m4a',
              color: '#FFFFFF',
              fileName: 'recording-1.m4a',
              mimeType: 'audio/mp4',
              missing: true,
              previewUrl: 'blob:recording',
              recordingNumber: 1,
              title: '',
            },
          },
          {
            id: 'folder-1',
            type: 'folder',
            position: { x: 0, y: 0 },
            data: {
              title: '1 items',
              children: [
                {
                  id: 'asset-child',
                  type: 'asset',
                  data: {
                    attachmentFile: 'attachments/file_child.pdf',
                    fileName: 'child.pdf',
                    kind: 'file',
                    mimeType: 'application/pdf',
                    missing: true,
                    previewUrl: 'blob:child',
                  },
                },
                {
                  id: 'recording-child',
                  type: 'recording',
                  data: {
                    attachmentFile: 'attachments/recording_child.m4a',
                    color: '#FFFFFF',
                    fileName: 'child.m4a',
                    mimeType: 'audio/mp4',
                    missing: true,
                    previewUrl: 'blob:child-recording',
                    recordingNumber: 2,
                    title: '',
                  },
                },
              ],
            },
          },
        ],
        edges: [],
      })
    ).resolves.toEqual({ success: true });

    const manifest = manifestMocks.saveManifest.mock.calls.at(-1)?.[2] as {
      nodes: Array<{ data: Record<string, unknown> }>;
    };
    const assetData = manifest.nodes[0]?.data;
    const recordingData = manifest.nodes[1]?.data;
    const folderChildren = manifest.nodes[2]?.data.children as Array<{
      data: Record<string, unknown>;
    }>;

    expect(assetData).not.toHaveProperty('missing');
    expect(assetData).not.toHaveProperty('previewUrl');
    expect(assetData).not.toHaveProperty('thumbnailUrl');
    expect(recordingData).not.toHaveProperty('missing');
    expect(recordingData).not.toHaveProperty('previewUrl');
    expect(recordingData?.attachmentFile).toBe('attachments/recording_abc.m4a');
    expect(folderChildren[0]?.data).not.toHaveProperty('missing');
    expect(folderChildren[0]?.data).not.toHaveProperty('previewUrl');
    expect(folderChildren[0]?.data.attachmentFile).toBe(
      'attachments/file_child.pdf'
    );
    expect(folderChildren[1]?.data).not.toHaveProperty('missing');
    expect(folderChildren[1]?.data).not.toHaveProperty('previewUrl');
    expect(folderChildren[1]?.data.attachmentFile).toBe(
      'attachments/recording_child.m4a'
    );
  });

  it('saveManifest persists transient image data urls before stripping runtime imageUrl', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'feedface-abcd-0000-0000-000000000000'
    );

    await expect(
      canvasHandlers.saveManifest({
        viewId: 'default',
        nodes: [
          {
            id: 'image-1',
            type: 'image',
            position: { x: 10, y: 20 },
            data: {
              color: '#fff',
              imageUrl: 'data:image/png;base64,AQID',
              title: 'Unsaved upload',
            },
          },
        ],
        edges: [],
      })
    ).resolves.toEqual({ success: true });

    const manifest = manifestMocks.saveManifest.mock.calls.at(-1)?.[2] as {
      nodes: Array<{ data: Record<string, unknown> }>;
    };
    const imageData = manifest.nodes[0]?.data;

    expect(bunWriteMock).toHaveBeenCalledWith(
      '/tmp/workspace/attachments/img_feedface.png',
      expect.any(Uint8Array)
    );
    expect(imageData).not.toHaveProperty('imageUrl');
    expect(imageData?.imageFile).toBe('attachments/img_feedface.png');
  });

  it('saveManifest reuses an existing note file for folder children with a noteId', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    noteStoreMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([
        [
          'note_existing',
          {
            noteId: 'note_existing',
            hasSidecar: false,
            markdownFile: 'content/existing.md',
          },
        ],
      ])
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
              {
                id: 'child-recording',
                type: 'recording',
                data: {
                  attachmentFile: 'attachments/child-recording.m4a',
                  color: '#FFFFFF',
                  fileName: 'child-recording.m4a',
                  mimeType: 'audio/mp4',
                  recordingNumber: 2,
                  title: '',
                },
              },
            ],
          },
        },
        {
          id: 'recording-1',
          type: 'recording',
          position: { x: 10, y: 10 },
          data: {
            attachmentFile: 'attachments/missing-recording.m4a',
            color: '#FFFFFF',
            fileName: 'missing-recording.m4a',
            mimeType: 'audio/mp4',
            recordingNumber: 1,
            title: '',
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
    noteStoreMocks.buildNoteIndex.mockResolvedValueOnce(
      new Map([
        [
          'note_abc',
          {
            noteId: 'note_abc',
            hasSidecar: false,
            markdownFile: 'content/note_abc.md',
          },
        ],
      ])
    );
    noteStoreMocks.loadNoteRecord.mockResolvedValueOnce({
      noteId: 'note_abc',
      source: 'markdown',
      title: 'Hydrated',
      displayHint: 'note',
      color: '',
      revision: 0,
      blocks: null,
      preview: null,
      corrupted: false,
    });
    noteStoreMocks.noteRecordToCardData.mockReturnValueOnce({
      type: 'text',
      title: 'Hydrated',
      content: 'hydrated body',
      file: 'content/note_abc.md',
    });

    const result = await canvasHandlers.loadCanvas({ viewId: 'default' });
    const folder = (result as { nodes: Record<string, any>[] }).nodes[0];
    expect(folder).toBeDefined();
    const child = folder?.data.children[0];
    expect(noteStoreMocks.noteRecordToCardData).toHaveBeenCalled();
    expect(child.data.title).toBe('Hydrated');
    expect(child.data.content).toBe('hydrated body');
    expect(child.data.noteId).toBe('note_abc');
  });

  it('loadCanvas marks asset nodes and folder children missing without reading full attachments', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    manifestMocks.loadManifest.mockResolvedValueOnce({
      schema: 'ghostboard-canvas/v1',
      viewId: 'default',
      nodes: [
        {
          id: 'asset-1',
          type: 'asset',
          position: { x: 0, y: 0 },
          data: {
            attachmentFile: 'attachments/missing.pdf',
            fileName: 'missing.pdf',
            kind: 'file',
            mimeType: 'application/pdf',
            title: 'missing.pdf',
          },
        },
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 0, y: 0 },
          data: {
            title: '1 items',
            children: [
              {
                id: 'child-asset',
                type: 'asset',
                data: {
                  attachmentFile: 'attachments/child.pdf',
                  fileName: 'child.pdf',
                  kind: 'file',
                  mimeType: 'application/pdf',
                },
              },
              {
                id: 'child-recording',
                type: 'recording',
                data: {
                  attachmentFile: 'attachments/child-recording.m4a',
                  color: '#FFFFFF',
                  fileName: 'child-recording.m4a',
                  mimeType: 'audio/mp4',
                  recordingNumber: 2,
                  title: '',
                },
              },
            ],
          },
        },
        {
          id: 'recording-1',
          type: 'recording',
          position: { x: 10, y: 10 },
          data: {
            attachmentFile: 'attachments/missing-recording.m4a',
            color: '#FFFFFF',
            fileName: 'missing-recording.m4a',
            mimeType: 'audio/mp4',
            recordingNumber: 1,
            title: '',
          },
        },
      ],
      edges: [],
    });
    noteMocks.buildNoteIndex.mockResolvedValueOnce(new Map());
    const topLevelFile = {
      exists: vi.fn().mockResolvedValue(false),
      arrayBuffer: vi.fn(),
    };
    const childFile = {
      exists: vi.fn().mockResolvedValue(false),
      arrayBuffer: vi.fn(),
    };
    const childRecordingFile = {
      exists: vi.fn().mockResolvedValue(false),
      arrayBuffer: vi.fn(),
    };
    const topLevelRecordingFile = {
      exists: vi.fn().mockResolvedValue(false),
      arrayBuffer: vi.fn(),
    };
    bunFileMock
      .mockReturnValueOnce(topLevelFile)
      .mockReturnValueOnce(childFile)
      .mockReturnValueOnce(childRecordingFile)
      .mockReturnValueOnce(topLevelRecordingFile);

    const result = (await canvasHandlers.loadCanvas({
      viewId: 'default',
    })) as { nodes: Array<{ data: Record<string, any> }> };

    expect(result.nodes[0]?.data.missing).toBe(true);
    expect(result.nodes[1]?.data.children[0].data.missing).toBe(true);
    expect(result.nodes[1]?.data.children[1].data.missing).toBe(true);
    expect(result.nodes[2]?.data.missing).toBe(true);
    expect(topLevelFile.arrayBuffer).not.toHaveBeenCalled();
    expect(childFile.arrayBuffer).not.toHaveBeenCalled();
    expect(childRecordingFile.arrayBuffer).not.toHaveBeenCalled();
    expect(topLevelRecordingFile.arrayBuffer).not.toHaveBeenCalled();
  });

  it('loadCanvas hydrates image thumbnails for top-level nodes and folder children with original fallback', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    manifestMocks.loadManifest.mockResolvedValueOnce({
      schema: 'ghostboard-canvas/v1',
      viewId: 'default',
      nodes: [
        {
          id: 'image-1',
          type: 'image',
          position: { x: 0, y: 0 },
          data: {
            color: '#fff',
            imageFile: 'attachments/full.png',
            thumbnailFile: 'attachments/missing-thumb.jpg',
          },
        },
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 10, y: 10 },
          data: {
            title: '1 item',
            children: [
              {
                id: 'child-image',
                type: 'image',
                data: {
                  color: '#fff',
                  imageFile: 'attachments/child-full.png',
                  thumbnailFile: 'attachments/child-thumb.jpg',
                },
              },
            ],
          },
        },
      ],
      edges: [],
    });
    noteMocks.buildNoteIndex.mockResolvedValueOnce(new Map());

    const missingThumbnail = {
      exists: vi.fn().mockResolvedValue(false),
    };
    const originalFile = {
      exists: vi.fn().mockResolvedValue(true),
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      type: 'image/png',
    };
    const childThumbnail = {
      exists: vi.fn().mockResolvedValue(true),
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6]).buffer),
      type: 'image/jpeg',
    };
    bunFileMock.mockImplementation((path: string) => {
      if (path.endsWith('/attachments/missing-thumb.jpg')) {
        return missingThumbnail;
      }
      if (path.endsWith('/attachments/full.png')) {
        return originalFile;
      }
      if (path.endsWith('/attachments/child-thumb.jpg')) {
        return childThumbnail;
      }
      return { exists: vi.fn().mockResolvedValue(false) };
    });

    const result = (await canvasHandlers.loadCanvas({
      viewId: 'default',
    })) as { nodes: Array<{ data: Record<string, any> }> };

    expect(result.nodes[0]?.data.imageUrl).toBe('data:image/png;base64,AQID');
    expect(result.nodes[0]?.data.thumbnailUrl).toBeUndefined();
    expect(result.nodes[1]?.data.children[0].data.thumbnailUrl).toBe(
      'data:image/jpeg;base64,BAUG'
    );
    expect(originalFile.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(childThumbnail.arrayBuffer).toHaveBeenCalledTimes(1);
  });
});
