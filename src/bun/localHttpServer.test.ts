import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startLocalHttpServer } from './localHttpServer';
import type { PluginFileStore } from './plugins/files';
import type { PluginHostController } from './plugins/hostController';
import type { PluginStorageHost } from './plugins/storage';

vi.mock('./ai', () => ({ handleAIChat: vi.fn() }));
vi.mock('./attachments', () => ({
  assertWorkspaceAttachmentPath: vi.fn(),
  saveAttachmentStream: vi.fn(),
}));
vi.mock('./linkPreview', () => ({ unfurlLink: vi.fn() }));
vi.mock('./thumbnail', () => ({ generateFileMetadata: vi.fn() }));
const { serveAsset, t0Handle } = vi.hoisted(() => ({
  serveAsset: vi.fn().mockResolvedValue(null),
  t0Handle: vi.fn().mockResolvedValue(null),
}));
vi.mock('./pluginAssets', () => ({ servePluginAsset: serveAsset }));
vi.mock('./plugins/t0Host', () => ({
  createT0Host: () => ({
    mounts: [{ id: 't0' }],
    handle: t0Handle,
    diagnose: vi.fn(),
  }),
}));
let fetchRequest: (request: Request) => Promise<Response>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Bun', {
    serve: (options: { fetch: typeof fetchRequest }) => {
      fetchRequest = options.fetch;
      return { port: 12_345, stop: vi.fn() };
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('local HTTP plugin host integration', () => {
  it('authenticates file data requests before dispatch', async () => {
    const handle = vi.fn(async () => new Response('bytes', { status: 206 }));
    const server = startLocalHttpServer({
      getAIConfig: () => null,
      getWorkspacePath: () => '/workspace',
      pluginFiles: { handle } as unknown as PluginFileStore,
    });
    const url = `${server.baseUrl}/plugins/files/read`;
    expect((await fetchRequest(new Request(url))).status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
    const response = await fetchRequest(
      new Request(url, {
        headers: { Authorization: `Bearer ${server.token}` },
      })
    );
    expect(response.status).toBe(206);
    expect(handle).toHaveBeenCalledOnce();
    server.stop();
  });

  it('authenticates persistent storage requests before dispatch', async () => {
    const handle = vi.fn(async () => Response.json({ success: true }));
    const server = startLocalHttpServer({
      getAIConfig: () => null,
      getWorkspacePath: () => '/workspace',
      pluginStorage: { handle } as unknown as PluginStorageHost,
    });
    const url = `${server.baseUrl}/plugins/storage`;
    expect(
      (await fetchRequest(new Request(url, { method: 'POST' }))).status
    ).toBe(401);
    expect(handle).not.toHaveBeenCalled();
    const response = await fetchRequest(
      new Request(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${server.token}` },
      })
    );
    expect(response.status).toBe(200);
    expect(handle).toHaveBeenCalledOnce();
    server.stop();
  });
  it('dispatches runtime and reload only after bearer authentication and combines active mounts with compatibility mounts', async () => {
    const handle = vi.fn(async () => Response.json({ plugins: [] }));
    const dispose = vi.fn();
    const runtime = {
      getMounts: () => [
        { directory: '/runtime', id: 'runtime', version: '1', generation: 'g' },
      ],
      handle,
      dispose,
    } as unknown as PluginHostController;
    const server = startLocalHttpServer({
      getAIConfig: () => null,
      getWorkspacePath: () => '/workspace',
      getPluginMounts: () => [
        { directory: '/compat', id: 'compat', version: '1' },
      ],
      pluginRuntime: runtime,
    });
    expect(
      (await fetchRequest(new Request(`${server.baseUrl}/plugins/runtime`)))
        .status
    ).toBe(401);
    expect(handle).not.toHaveBeenCalled();
    for (const [path, method] of [
      ['runtime', 'GET'],
      ['reload', 'POST'],
    ]) {
      const response = await fetchRequest(
        new Request(`${server.baseUrl}/plugins/${path}`, {
          method,
          headers: { Authorization: `Bearer ${server.token}` },
        })
      );
      expect(response.status).toBe(200);
    }
    expect(handle).toHaveBeenCalledTimes(2);
    expect(t0Handle).not.toHaveBeenCalled();
    expect(serveAsset.mock.calls[0]?.[2]).toEqual([
      { directory: '/runtime', id: 'runtime', version: '1', generation: 'g' },
      { directory: '/compat', id: 'compat', version: '1' },
      { id: 't0' },
    ]);
    server.stop();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
