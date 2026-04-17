import { beforeEach, describe, expect, it, vi } from 'vitest';

const localInfoChannelMock = vi.fn();
const settingsUpdatedMock = vi.fn();
const defineRpcMock = vi.fn(() => ({
  send: { settingsUpdated: settingsUpdatedMock },
}));
const browserWindowFocusMock = vi.fn();
const browserWindowOnMock = vi.fn();
const browserWindowMock = vi.fn(() => ({
  on: browserWindowOnMock,
  focus: browserWindowFocusMock,
}));

vi.mock('electrobun/bun', () => ({
  BrowserView: {
    defineRPC: (...args: Parameters<typeof defineRpcMock>) =>
      defineRpcMock(...args),
  },
  BrowserWindow(...args: unknown[]) {
    return browserWindowMock(...args);
  },
  Updater: {
    localInfo: {
      channel: localInfoChannelMock,
    },
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

const workspaceMocks = {
  addView: vi.fn(),
  atomicWrite: vi.fn(),
  initWorkspace: vi.fn(() => '/tmp/workspace'),
  loadWorkspaceConfig: vi.fn(),
  removeView: vi.fn(),
  renameView: vi.fn(),
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

const getCanvasHandlers = () =>
  defineRpcMock.mock.calls.at(-1)?.[0].handlers.requests;

const getSettingsHandlers = () =>
  defineRpcMock.mock.calls.at(-1)?.[0].handlers.requests;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localInfoChannelMock.mockResolvedValue('prod');
  fetchMock.mockReset();
  bunFileMock.mockReset();
  bunWriteMock.mockReset();
  workspaceMocks.atomicWrite.mockResolvedValue();
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
  workspaceMocks.removeView.mockResolvedValue(true);
  workspaceMocks.renameView.mockResolvedValue(true);
  manifestMocks.saveManifest.mockResolvedValue();
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

    const { getMainViewUrl } = await loadIndexModule();
    await expect(getMainViewUrl()).resolves.toBe('http://localhost:5173');

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
    await persistSettings({ theme: 'dark', locale: 'zh' });

    expect(workspaceMocks.atomicWrite).toHaveBeenCalledWith(
      '/workspace-c/.spatial/settings.json',
      JSON.stringify({ theme: 'dark', locale: 'zh' }, null, 2)
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
        schema: 'spatial-canvas/v1',
        viewId: 'view-2',
        nodes: [],
        edges: [],
      }
    );
  });

  it('deleteView returns success with activeViewId and false when removal fails', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();

    workspaceMocks.removeView.mockResolvedValueOnce(true);
    workspaceMocks.loadWorkspaceConfig.mockResolvedValueOnce({
      activeViewId: 'default',
      views: [
        { id: 'default', name: 'Default', file: 'views/default.canvas.json' },
      ],
    });
    await expect(
      canvasHandlers.deleteView({ viewId: 'view-2' })
    ).resolves.toEqual({
      success: true,
      activeViewId: 'default',
    });

    workspaceMocks.removeView.mockResolvedValueOnce(false);
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

    expect(canvasHandlers.openSettings()).toEqual({ success: true });
    expect(browserWindowFocusMock).toHaveBeenCalled();
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
    });

    await expect(
      settingsHandlers.saveSettings({ theme: 'dark', locale: 'zh' })
    ).resolves.toEqual({
      success: true,
    });
    expect(workspaceMocks.atomicWrite).toHaveBeenCalledWith(
      '/workspace-settings/.spatial/settings.json',
      JSON.stringify({ theme: 'dark', locale: 'zh' }, null, 2)
    );
    expect(settingsUpdatedMock).toHaveBeenCalledWith({
      theme: 'dark',
      locale: 'zh',
    });
  });

  it('saveAttachment maps image extensions and rejects invalid data urls', async () => {
    await loadIndexModule();
    const canvasHandlers = getCanvasHandlers();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('12345678-abcd');

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
});
