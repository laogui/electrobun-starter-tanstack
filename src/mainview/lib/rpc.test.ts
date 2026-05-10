import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = {
  loadCanvas: vi.fn(),
  saveManifest: vi.fn(),
  saveNote: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  saveAttachment: vi.fn(),
  loadAttachment: vi.fn(),
  getSettings: vi.fn(),
  openSettings: vi.fn(),
  listViews: vi.fn(),
  createView: vi.fn(),
  deleteView: vi.fn(),
  renameView: vi.fn(),
  searchCanvas: vi.fn(),
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  createViewFromTemplate: vi.fn(),
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
    await expect(rpc.rpcGetSettings()).resolves.toBeNull();
    await expect(rpc.rpcOpenSettings()).resolves.toEqual({ success: false });
    await expect(rpc.rpcListViews()).resolves.toBeNull();
    await expect(rpc.rpcCreateView('Inbox')).resolves.toBeNull();
    await expect(rpc.rpcDeleteView('view-1')).resolves.toBeNull();
    await expect(rpc.rpcRenameView('view-1', 'Inbox')).resolves.toBeNull();
    await expect(rpc.rpcSearchCanvas('hello')).resolves.toBeNull();
    await expect(rpc.rpcListTemplates()).resolves.toBeNull();
    await expect(rpc.rpcGetTemplate('kanban')).resolves.toBeNull();
    await expect(
      rpc.rpcCreateViewFromTemplate('My Board', 'kanban')
    ).resolves.toBeNull();
    await expect(rpc.isRpcAvailable()).resolves.toBe(false);
  });

  it('reuses the same Electrobun instance across calls', async () => {
    vi.stubGlobal('__electrobunWebviewId', 'webview-1');
    const rpc = await loadModule();
    request.getSettings.mockResolvedValue({ theme: 'dark', locale: 'zh' });
    request.listViews.mockResolvedValue([
      { id: 'default', name: 'Default Canvas' },
    ]);

    await rpc.rpcGetSettings();
    await rpc.rpcListViews();

    expect(defineRPC).toHaveBeenCalledTimes(1);
    expect(ElectroviewCtor).toHaveBeenCalledTimes(1);
    expect(request.getSettings).toHaveBeenCalledWith({});
    expect(request.listViews).toHaveBeenCalledWith({});
  });

  it('forwards all RPC calls with the expected payloads', async () => {
    vi.stubGlobal('__electrobunWebviewId', 'webview-1');
    const rpc = await loadModule();

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
    await rpc.rpcLoadAttachment('images/a.png');
    await rpc.rpcOpenSettings();
    await rpc.rpcCreateView('Inbox');
    await rpc.rpcDeleteView('view-1');
    await rpc.rpcRenameView('view-1', 'Renamed');
    await rpc.rpcSearchCanvas('foo', { viewId: 'v1', limit: 20 });
    await rpc.rpcListTemplates();
    await rpc.rpcGetTemplate('kanban');
    await rpc.rpcCreateViewFromTemplate('My Kanban', 'kanban');

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
    expect(request.loadAttachment).toHaveBeenCalledWith({
      filePath: 'images/a.png',
    });
    expect(request.openSettings).toHaveBeenCalledWith({});
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
  });

  it('reports RPC availability based on initialization success', async () => {
    vi.stubGlobal('__electrobunWebviewId', 'webview-1');
    defineRPC.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const rpc = await loadModule();

    await expect(rpc.isRpcAvailable()).resolves.toBe(false);
  });
});
