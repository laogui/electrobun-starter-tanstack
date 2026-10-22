import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleAIChat } from './ai';
import type { PluginHostCredentials } from './localHttpAuth';
import { startLocalHttpServer } from './localHttpServer';
import { PluginStorageHost } from './plugins/storage';

vi.mock('./ai', () => ({
  handleAIChat: vi.fn(async () => new Response('streamed')),
}));
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
      pluginFiles: { handle },
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
      pluginStorage: { handle },
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
      bindCredentials: vi.fn(),
    };
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

const AI_CONFIG = {} as never;

function bindingRuntime() {
  let credentials: PluginHostCredentials | undefined;
  const runtime = {
    getMounts: () => [],
    handle: vi.fn(async (request: Request) =>
      new URL(request.url).pathname.startsWith('/plugins/')
        ? Response.json({ plugins: [] })
        : null
    ),
    dispose: vi.fn(),
    bindCredentials: (value: PluginHostCredentials) => {
      credentials = value;
    },
  };
  return {
    runtime,
    credentials: () => {
      if (!credentials) {
        throw new Error('credentials were not bound');
      }
      return credentials;
    },
  };
}

function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

describe('local HTTP credential scoping', () => {
  it('never accepts the plugin asset token for AI chat or other services', async () => {
    const { runtime, credentials } = bindingRuntime();
    const server = startLocalHttpServer({
      getAIConfig: () => AI_CONFIG,
      getWorkspacePath: () => '/workspace',
      pluginRuntime: runtime,
    });
    const { assetToken } = credentials();
    expect(assetToken).not.toBe(server.token);
    expect(assetToken).not.toBe(server.mediaToken);
    const chat = `${server.baseUrl}/ai/chat`;
    for (const request of [
      new Request(chat, { method: 'POST', headers: bearer(assetToken) }),
      new Request(`${chat}?token=${assetToken}`, { method: 'POST' }),
      new Request(`${server.baseUrl}/plugins/runtime`, {
        headers: bearer(assetToken),
      }),
      new Request(`${server.baseUrl}/attachment?path=a&token=${assetToken}`),
    ]) {
      expect((await fetchRequest(request)).status).toBe(401);
    }
    expect(handleAIChat).not.toHaveBeenCalled();
    const allowed = await fetchRequest(
      new Request(chat, { method: 'POST', headers: bearer(server.token) })
    );
    expect(allowed.status).toBe(200);
    expect(handleAIChat).toHaveBeenCalledOnce();
    server.stop();
  });

  it('rejects query-string tokens for AI chat and uploads, including the renderer token', async () => {
    const server = startLocalHttpServer({
      getAIConfig: () => AI_CONFIG,
      getWorkspacePath: () => '/workspace',
    });
    for (const token of [server.token, server.mediaToken]) {
      const chat = await fetchRequest(
        new Request(`${server.baseUrl}/ai/chat?token=${token}`, {
          method: 'POST',
        })
      );
      expect(chat.status).toBe(401);
      const upload = await fetchRequest(
        new Request(
          `${server.baseUrl}/attachment/upload?fileName=a.txt&token=${token}`,
          { method: 'POST', body: 'x' }
        )
      );
      expect(upload.status).toBe(401);
    }
    // The media token is read-only even when sent as a header.
    const mediaHeader = await fetchRequest(
      new Request(`${server.baseUrl}/ai/chat`, {
        method: 'POST',
        headers: bearer(server.mediaToken),
      })
    );
    expect(mediaHeader.status).toBe(401);
    expect(handleAIChat).not.toHaveBeenCalled();
    server.stop();
  });

  it('limits the query media token to attachment and YouTube reads', async () => {
    const storage = vi.fn(async (request: Request) =>
      new URL(request.url).pathname === '/plugins/storage'
        ? Response.json({ success: true })
        : null
    );
    const server = startLocalHttpServer({
      getAIConfig: () => AI_CONFIG,
      getWorkspacePath: () => '/workspace',
      pluginStorage: { handle: storage },
    });
    const media = server.mediaToken;
    const attachment = await fetchRequest(
      new Request(`${server.baseUrl}/attachment?path=a.png&token=${media}`)
    );
    // Past authentication (the mocked path helper yields no file).
    expect([401, 403]).not.toContain(attachment.status);
    const storageResponse = await fetchRequest(
      new Request(`${server.baseUrl}/plugins/storage?token=${media}`)
    );
    expect(storageResponse.status).toBe(403);
    const unfurl = await fetchRequest(
      new Request(`${server.baseUrl}/unfurl?url=https://a.test&token=${media}`)
    );
    expect(unfurl.status).toBe(403);
    expect(
      storage.mock.calls.some(
        ([request]) => new URL(request.url).pathname === '/plugins/storage'
      )
    ).toBe(false);
    server.stop();
  });

  it('keeps plugin host tokens off renderer-only routes', async () => {
    const { runtime, credentials } = bindingRuntime();
    const server = startLocalHttpServer({
      getAIConfig: () => AI_CONFIG,
      getWorkspacePath: () => '/workspace',
      pluginRuntime: runtime,
    });
    const token = credentials().pluginToken('community.alpha.tools');
    for (const request of [
      new Request(`${server.baseUrl}/ai/chat`, {
        method: 'POST',
        headers: bearer(token),
      }),
      new Request(`${server.baseUrl}/attachment?path=a.png`, {
        headers: bearer(token),
      }),
      new Request(`${server.baseUrl}/attachment/upload?fileName=a`, {
        method: 'POST',
        headers: bearer(token),
        body: 'x',
      }),
      new Request(`${server.baseUrl}/plugins/runtime`, {
        headers: bearer(token),
      }),
      new Request(`${server.baseUrl}/plugins/reload`, {
        method: 'POST',
        headers: bearer(token),
      }),
    ]) {
      expect((await fetchRequest(request)).status).toBe(403);
    }
    expect(handleAIChat).not.toHaveBeenCalled();
    expect(runtime.handle).not.toHaveBeenCalled();
    server.stop();
  });

  it("does not let plugin A's token read plugin B's storage or files", async () => {
    const root = await mkdtemp(join(tmpdir(), 'ghostboard-scope-'));
    try {
      const appDataRoot = join(root, 'app');
      const workspacePath = join(root, 'workspace');
      const pluginA = 'community.alpha.tools';
      const pluginB = 'community.bravo.tools';
      await mkdir(join(appDataRoot, 'plugin-data', pluginB), {
        recursive: true,
      });
      await writeFile(
        join(appDataRoot, 'plugin-data', pluginB, 'kv.json'),
        JSON.stringify({
          schema: 'ghostboard-plugin-kv/v1',
          entries: [['secret', 'bravo-only']],
        })
      );
      const files = vi.fn(async () => new Response('bytes', { status: 206 }));
      const { runtime, credentials } = bindingRuntime();
      const server = startLocalHttpServer({
        getAIConfig: () => null,
        getWorkspacePath: () => workspacePath,
        pluginFiles: { handle: files },
        pluginRuntime: runtime,
        pluginStorage: new PluginStorageHost({
          appDataRoot,
          workspacePath,
          workspaceId: 'ws-1',
        }),
      });
      const tokenA = credentials().pluginToken(pluginA);
      const tokenB = credentials().pluginToken(pluginB);
      expect(tokenA).not.toBe(tokenB);
      expect(credentials().pluginToken(pluginA)).toBe(tokenA);
      const readSecret = (token: string) =>
        fetchRequest(
          new Request(`${server.baseUrl}/plugins/storage`, {
            method: 'POST',
            headers: { ...bearer(token), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operation: 'get',
              key: 'secret',
              pluginId: pluginB,
              scope: 'app',
              workspaceId: 'ws-1',
            }),
          })
        );
      const denied = await readSecret(tokenA);
      expect(denied.status).toBe(403);
      expect(JSON.stringify(await denied.json())).not.toContain('bravo-only');
      const owner = await readSecret(tokenB);
      expect(owner.status).toBe(200);
      expect(await owner.json()).toEqual({ found: true, value: 'bravo-only' });

      const fileUrl = (pluginId: string) =>
        `${server.baseUrl}/plugins/files/read?pluginId=${pluginId}&workspaceId=ws-1&activationId=x&handleId=h`;
      expect(
        (
          await fetchRequest(
            new Request(fileUrl(pluginB), { headers: bearer(tokenA) })
          )
        ).status
      ).toBe(403);
      expect(files).not.toHaveBeenCalled();
      expect(
        (
          await fetchRequest(
            new Request(fileUrl(pluginA), { headers: bearer(tokenA) })
          )
        ).status
      ).toBe(206);

      credentials().revokePlugin(pluginB);
      expect((await readSecret(tokenB)).status).toBe(401);
      server.stop();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reflects only allowed origins in CORS headers', async () => {
    const server = startLocalHttpServer({
      getAIConfig: () => null,
      getWorkspacePath: () => '/workspace',
    });
    const preflight = (origin: string) =>
      fetchRequest(
        new Request(`${server.baseUrl}/ai/chat`, {
          method: 'OPTIONS',
          headers: { Origin: origin },
        })
      );
    const allowed = await preflight('views://mainview');
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'views://mainview'
    );
    const dev = await preflight('http://localhost:5173');
    expect(dev.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173'
    );
    const hostile = await preflight('https://evil.example');
    expect(hostile.headers.get('access-control-allow-origin')).toBeNull();
    expect(hostile.headers.get('access-control-allow-headers')).toBeNull();
    server.stop();
  });
});
