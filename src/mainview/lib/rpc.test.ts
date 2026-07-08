import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = {
  loadCanvas: vi.fn(),
  saveManifest: vi.fn(),
  saveNote: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  saveAttachment: vi.fn(),
  loadAttachment: vi.fn(),
  openAttachment: vi.fn(),
  getSettings: vi.fn(),
  getLocalHttpEndpoint: vi.fn(),
  saveSettings: vi.fn(),
  listTrash: vi.fn(),
  restoreTrash: vi.fn(),
  purgeTrash: vi.fn(),
  clearAllTrash: vi.fn(),
  scanUnlinkedNotes: vi.fn(),
  deleteUnlinkedNotes: vi.fn(),
  getWorkspaceInfo: vi.fn(),
  openWorkspaceFolder: vi.fn(),
  switchWorkspace: vi.fn(),
  exportWorkspaceArchive: vi.fn(),
  getAppInfo: vi.fn(),
  checkForUpdate: vi.fn(),
  getAICredentialStatus: vi.fn(),
  setAIApiKey: vi.fn(),
  listViews: vi.fn(),
  createView: vi.fn(),
  createWidget: vi.fn(),
  deleteView: vi.fn(),
  deleteWidget: vi.fn(),
  renameView: vi.fn(),
  cloneWidget: vi.fn(),
  saveWidget: vi.fn(),
  searchCanvas: vi.fn(),
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  createViewFromTemplate: vi.fn(),
  checkLicense: vi.fn(),
  activateLicense: vi.fn(),
};

const defineRPC = vi.fn(() => ({ request }));
const ElectroviewCtor = vi.fn();

class MockElectroview {
  rpc: { request: typeof request };

  constructor({ rpc }: { rpc: { request: typeof request } }) {
    ElectroviewCtor({ rpc });
    this.rpc = rpc;
  }
}

const electrobunViewModule = {
  default: { Electroview: MockElectroview },
  Electroview: { defineRPC },
};

vi.mock('electrobun/view', () => electrobunViewModule);

const loadModule = async () => await import('@/lib/rpc');

beforeEach(() => {
  for (const fn of Object.values(request)) {
    fn.mockReset();
  }
  defineRPC.mockClear();
  ElectroviewCtor.mockClear();
  vi.resetModules();
  vi.unstubAllGlobals();
  // The rpc module persists its init promise + Electrobun-detection flag on
  // `globalThis` to survive Vite HMR re-evaluation. That same persistence
  // would leak state across tests, so explicitly clear it here.
  (globalThis as Record<string, unknown>).__ghostboardInitPromise = undefined;
  (globalThis as Record<string, unknown>).__ghostboardNotElectrobun = undefined;
});

describe('rpc', () => {
  it('returns null-like fallbacks when not running inside Electrobun', async () => {
    vi.stubGlobal('__electrobunWebviewId', undefined);
    const rpc = await loadModule();

    await expect(rpc.loadCanvas('default')).resolves.toBeNull();
    await expect(rpc.rpcSaveManifest('default', [], [])).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcSaveNote('note-1', {}, 'body')).resolves.toEqual({
      success: false,
    });
    await expect(
      rpc.rpcCreateNote('note-1', 'Title', 'text')
    ).resolves.toBeNull();
    await expect(rpc.rpcDeleteNote('note-1')).resolves.toEqual({
      success: false,
    });
    await expect(
      rpc.rpcSaveAttachment('data:image/png;base64,abc')
    ).resolves.toBeNull();
    await expect(rpc.rpcLoadAttachment('/tmp/a.png')).resolves.toBeNull();
    await expect(rpc.rpcOpenAttachment('/tmp/a.png')).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcGetSettings()).resolves.toBeNull();
    await expect(rpc.rpcSaveSettings({} as never)).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcListTrash()).resolves.toEqual([]);
    await expect(rpc.rpcRestoreTrash('trash-1')).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcPurgeTrash('trash-1')).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcClearAllTrash()).resolves.toEqual({
      purged: 0,
      success: false,
    });
    await expect(rpc.rpcScanUnlinkedNotes()).resolves.toEqual([]);
    await expect(rpc.rpcDeleteUnlinkedNotes(['content/a.md'])).resolves.toEqual(
      {
        deleted: [],
        skipped: ['content/a.md'],
      }
    );
    await expect(rpc.rpcGetWorkspaceInfo()).resolves.toEqual({
      path: '',
      isDefault: true,
    });
    await expect(rpc.rpcOpenWorkspaceFolder()).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcSwitchWorkspace()).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcExportWorkspaceArchive()).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcGetAppInfo()).resolves.toEqual({
      channel: 'dev',
      hash: '',
      identifier: 'dev.ghostboard',
      name: 'GhostBoard',
      version: '0.0.0',
    });
    await expect(rpc.rpcCheckForUpdate()).resolves.toEqual({
      currentHash: '',
      error: 'RPC unavailable',
      hash: '',
      updateAvailable: false,
      version: '',
    });
    await expect(rpc.rpcGetAICredentialStatus()).resolves.toEqual({
      hasApiKey: false,
    });
    await expect(rpc.rpcSetAIApiKey('sk-test')).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcCheckLicense()).resolves.toBeNull();
    await expect(rpc.rpcActivateLicense('GHOST-TEST')).resolves.toBeNull();
    await expect(rpc.rpcListViews()).resolves.toBeNull();
    await expect(rpc.rpcCreateView('Inbox')).resolves.toBeNull();
    await expect(rpc.rpcDeleteView('view-1')).resolves.toBeNull();
    await expect(rpc.rpcRenameView('view-1', 'Inbox')).resolves.toBeNull();
    await expect(rpc.rpcSetActiveView('view-1')).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcSearchCanvas('hello')).resolves.toBeNull();
    await expect(rpc.rpcListTemplates()).resolves.toBeNull();
    await expect(rpc.rpcGetTemplate('kanban')).resolves.toBeNull();
    await expect(
      rpc.rpcCreateViewFromTemplate('My Board', 'kanban')
    ).resolves.toBeNull();
    await expect(rpc.rpcCreateWidget('checklist')).resolves.toEqual({
      success: false,
    });
    await expect(rpc.rpcCloneWidget('widget_1')).resolves.toEqual({
      success: false,
    });
    await expect(
      rpc.rpcSaveWidget({
        schema: 'ghostboard-widget/v1',
        id: 'widget_1',
        kind: 'checklist',
        title: 'List',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
        data: { items: [] },
      })
    ).resolves.toEqual({ success: false });
    await expect(rpc.rpcDeleteWidget('widget_1')).resolves.toEqual({
      success: false,
    });
    await expect(rpc.isRpcAvailable()).resolves.toBe(false);
  });

  it('reuses the same Electrobun instance across calls', async () => {
    vi.stubGlobal('__electrobunWebviewId', 'webview-1');
    const rpc = await loadModule();
    request.getSettings.mockResolvedValue({ theme: 'dark', locale: 'zh' });
    request.listViews.mockResolvedValue([
      { id: 'default', name: 'Default Canvas' },
    ]);
    request.checkLicense.mockResolvedValue({ activated: false });

    await rpc.rpcGetSettings();
    await rpc.rpcListViews();
    await rpc.rpcCheckLicense();

    expect(defineRPC).toHaveBeenCalledTimes(1);
    expect(ElectroviewCtor).toHaveBeenCalledTimes(1);
    expect(request.getSettings).toHaveBeenCalledWith({});
    expect(request.listViews).toHaveBeenCalledWith({});
    expect(request.checkLicense).toHaveBeenCalledWith({});
  });

  it('uses an unbounded renderer-side RPC request timeout for native settings operations', async () => {
    vi.stubGlobal('__electrobunWebviewId', 'webview-1');
    const rpc = await loadModule();

    await rpc.isRpcAvailable();

    expect(defineRPC).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRequestTime: Number.POSITIVE_INFINITY,
      })
    );
  });

  it('forwards all RPC calls with the expected payloads', async () => {
    vi.stubGlobal('__electrobunWebviewId', 'webview-1');
    const rpc = await loadModule();
    request.scanUnlinkedNotes.mockResolvedValue({ entries: [] });

    await rpc.loadCanvas('focus');
    await rpc.rpcSaveManifest('focus', [{ id: 'n1' }], [{ id: 'e1' }], {
      x: 1,
      y: 2,
      zoom: 3,
    });
    await rpc.rpcSaveNote('note-1', { title: 'Title' }, 'Body');
    await rpc.rpcCreateNote('note-2', 'New', 'text');
    await rpc.rpcDeleteNote('note-2');
    await rpc.rpcSaveAttachment('data:image/png;base64,abc', 'images/a.png');
    await rpc.rpcSaveAttachment('data:application/pdf;base64,abc', undefined, {
      kind: 'file',
      mimeType: 'application/pdf',
      suggestedName: 'report.pdf',
    });
    await rpc.rpcLoadAttachment('images/a.png');
    await rpc.rpcOpenAttachment('attachments/file_abc.pdf');
    await rpc.rpcSaveSettings({
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
    await rpc.rpcListTrash();
    await rpc.rpcRestoreTrash('trash-1');
    await rpc.rpcPurgeTrash('trash-1');
    await rpc.rpcClearAllTrash();
    await rpc.rpcScanUnlinkedNotes();
    await rpc.rpcDeleteUnlinkedNotes(['content/orphan.md']);
    await rpc.rpcGetWorkspaceInfo();
    await rpc.rpcOpenWorkspaceFolder();
    await rpc.rpcSwitchWorkspace();
    await rpc.rpcExportWorkspaceArchive();
    await rpc.rpcGetAppInfo();
    await rpc.rpcCheckForUpdate();
    await rpc.rpcGetAICredentialStatus();
    await rpc.rpcSetAIApiKey('sk-test');
    await rpc.rpcCheckLicense();
    await rpc.rpcActivateLicense('GHOST-ABCD-EFGH-IJKL-1234');
    await rpc.rpcCreateView('Inbox');
    await rpc.rpcDeleteView('view-1');
    await rpc.rpcRenameView('view-1', 'Renamed');
    await rpc.rpcSearchCanvas('foo', { viewId: 'v1', limit: 20 });
    await rpc.rpcListTemplates();
    await rpc.rpcGetTemplate('kanban');
    await rpc.rpcCreateViewFromTemplate('My Kanban', 'kanban');
    const widgetRecord = {
      schema: 'ghostboard-widget/v1' as const,
      id: 'widget_1',
      kind: 'checklist' as const,
      title: 'List',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
      data: { items: [] },
    };
    await rpc.rpcCreateWidget('checklist');
    await rpc.rpcCloneWidget('widget_1');
    await rpc.rpcSaveWidget(widgetRecord);
    await rpc.rpcDeleteWidget('widget_1');

    expect(request.loadCanvas).toHaveBeenCalledWith({ viewId: 'focus' });
    expect(request.saveManifest).toHaveBeenCalledWith({
      viewId: 'focus',
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'e1' }],
      viewport: { x: 1, y: 2, zoom: 3 },
    });
    expect(request.saveNote).toHaveBeenCalledWith({
      noteId: 'note-1',
      frontmatter: { title: 'Title' },
      body: 'Body',
    });
    expect(request.createNote).toHaveBeenCalledWith({
      id: 'note-2',
      title: 'New',
      displayHint: 'text',
    });
    expect(request.deleteNote).toHaveBeenCalledWith({ noteId: 'note-2' });
    expect(request.saveAttachment).toHaveBeenCalledWith({
      dataUrl: 'data:image/png;base64,abc',
      existingFile: 'images/a.png',
    });
    expect(request.saveAttachment).toHaveBeenCalledWith({
      dataUrl: 'data:application/pdf;base64,abc',
      existingFile: undefined,
      kind: 'file',
      mimeType: 'application/pdf',
      suggestedName: 'report.pdf',
    });
    expect(request.loadAttachment).toHaveBeenCalledWith({
      filePath: 'images/a.png',
    });
    expect(request.openAttachment).toHaveBeenCalledWith({
      filePath: 'attachments/file_abc.pdf',
    });
    expect(request.saveSettings).toHaveBeenCalledWith({
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
    expect(request.listTrash).toHaveBeenCalledWith({});
    expect(request.restoreTrash).toHaveBeenCalledWith({ trashId: 'trash-1' });
    expect(request.purgeTrash).toHaveBeenCalledWith({ trashId: 'trash-1' });
    expect(request.clearAllTrash).toHaveBeenCalledWith({});
    expect(request.scanUnlinkedNotes).toHaveBeenCalledWith({});
    expect(request.deleteUnlinkedNotes).toHaveBeenCalledWith({
      files: ['content/orphan.md'],
    });
    expect(request.getWorkspaceInfo).toHaveBeenCalledWith({});
    expect(request.openWorkspaceFolder).toHaveBeenCalledWith({});
    expect(request.switchWorkspace).toHaveBeenCalledWith({});
    expect(request.exportWorkspaceArchive).toHaveBeenCalledWith({});
    expect(request.getAppInfo).toHaveBeenCalledWith({});
    expect(request.checkForUpdate).toHaveBeenCalledWith({});
    expect(request.getAICredentialStatus).toHaveBeenCalledWith({});
    expect(request.setAIApiKey).toHaveBeenCalledWith({ apiKey: 'sk-test' });
    expect(request.checkLicense).toHaveBeenCalledWith({});
    expect(request.activateLicense).toHaveBeenCalledWith({
      key: 'GHOST-ABCD-EFGH-IJKL-1234',
    });
    expect(request.createView).toHaveBeenCalledWith({ name: 'Inbox' });
    expect(request.deleteView).toHaveBeenCalledWith({ viewId: 'view-1' });
    expect(request.renameView).toHaveBeenCalledWith({
      viewId: 'view-1',
      name: 'Renamed',
    });
    expect(request.searchCanvas).toHaveBeenCalledWith({
      query: 'foo',
      viewId: 'v1',
      limit: 20,
    });
    expect(request.listTemplates).toHaveBeenCalledWith({});
    expect(request.getTemplate).toHaveBeenCalledWith({ id: 'kanban' });
    expect(request.createViewFromTemplate).toHaveBeenCalledWith({
      name: 'My Kanban',
      templateId: 'kanban',
    });
    expect(request.createWidget).toHaveBeenCalledWith({
      kind: 'checklist',
      title: undefined,
    });
    expect(request.cloneWidget).toHaveBeenCalledWith({
      widgetId: 'widget_1',
    });
    expect(request.saveWidget).toHaveBeenCalledWith({ widget: widgetRecord });
    expect(request.deleteWidget).toHaveBeenCalledWith({
      widgetId: 'widget_1',
    });
  });

  it('reports RPC availability based on initialization success', async () => {
    vi.stubGlobal('__electrobunWebviewId', 'webview-1');
    defineRPC.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const rpc = await loadModule();

    await expect(rpc.isRpcAvailable()).resolves.toBe(false);
  });

  describe('rpcUnfurlLink', () => {
    const endpoint = {
      aiEnabled: true,
      baseUrl: 'http://127.0.0.1:4242',
      token: 'tok',
    };

    it('rejects invalid URLs before hitting the network', async () => {
      vi.stubGlobal('__electrobunWebviewId', 'webview-1');
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      request.getLocalHttpEndpoint.mockResolvedValue(endpoint);
      const rpc = await loadModule();

      await expect(rpc.rpcUnfurlLink('')).resolves.toBeNull();
      await expect(rpc.rpcUnfurlLink('not a url')).resolves.toBeNull();
      await expect(
        rpc.rpcUnfurlLink('javascript:alert(1)')
      ).resolves.toBeNull();
      await expect(rpc.rpcUnfurlLink('file:///etc/passwd')).resolves.toBeNull();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns parsed metadata on a successful response', async () => {
      vi.stubGlobal('__electrobunWebviewId', 'webview-1');
      const payload = {
        url: 'https://example.com/',
        status: 'ready' as const,
        title: 'Example',
      };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
      });
      vi.stubGlobal('fetch', fetchMock);
      request.getLocalHttpEndpoint.mockResolvedValue(endpoint);
      const rpc = await loadModule();

      await expect(rpc.rpcUnfurlLink('https://example.com/')).resolves.toEqual(
        payload
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toBe(
        'http://127.0.0.1:4242/unfurl?url=https%3A%2F%2Fexample.com%2F'
      );
      expect((init.headers as Record<string, string>).authorization).toBe(
        'Bearer tok'
      );
    });

    it('retries once on network failure and then succeeds', async () => {
      vi.stubGlobal('__electrobunWebviewId', 'webview-1');
      const payload = {
        url: 'https://example.com/',
        status: 'ready' as const,
        title: 'Example',
      };
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('network down'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(payload),
        });
      vi.stubGlobal('fetch', fetchMock);
      request.getLocalHttpEndpoint.mockResolvedValue(endpoint);
      const rpc = await loadModule();

      await expect(rpc.rpcUnfurlLink('https://example.com/')).resolves.toEqual(
        payload
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 4xx responses', async () => {
      vi.stubGlobal('__electrobunWebviewId', 'webview-1');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', fetchMock);
      request.getLocalHttpEndpoint.mockResolvedValue(endpoint);
      const rpc = await loadModule();

      await expect(
        rpc.rpcUnfurlLink('https://example.com/')
      ).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries on 5xx and gives up after exhausting attempts', async () => {
      vi.stubGlobal('__electrobunWebviewId', 'webview-1');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', fetchMock);
      request.getLocalHttpEndpoint.mockResolvedValue(endpoint);
      const rpc = await loadModule();

      await expect(
        rpc.rpcUnfurlLink('https://example.com/')
      ).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('returns null when the local endpoint is unavailable', async () => {
      vi.stubGlobal('__electrobunWebviewId', 'webview-1');
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      request.getLocalHttpEndpoint.mockResolvedValue({
        aiEnabled: false,
        baseUrl: '',
        token: '',
      });
      const rpc = await loadModule();

      await expect(
        rpc.rpcUnfurlLink('https://example.com/')
      ).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
