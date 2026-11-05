import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleAIChat } from './ai';
import { startLocalHttpServer } from './localHttpServer';

vi.mock('./ai', () => ({
  handleAIChat: vi.fn(async () => new Response('streamed')),
}));
vi.mock('./attachments', () => ({
  assertWorkspaceAttachmentPath: vi.fn(),
  saveAttachmentStream: vi.fn(),
}));
vi.mock('./linkPreview', () => ({ unfurlLink: vi.fn() }));
vi.mock('./thumbnail', () => ({ generateFileMetadata: vi.fn() }));
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

const AI_CONFIG = {} as never;

function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

describe('local HTTP credential scoping', () => {
  it('rejects unknown bearer tokens before any route runs', async () => {
    const server = startLocalHttpServer({
      getAIConfig: () => AI_CONFIG,
      getWorkspacePath: () => '/workspace',
    });
    const response = await fetchRequest(
      new Request(`${server.baseUrl}/ai/chat`, {
        method: 'POST',
        headers: bearer('not-a-token'),
      })
    );
    expect(response.status).toBe(401);
    expect(handleAIChat).not.toHaveBeenCalled();
    const allowed = await fetchRequest(
      new Request(`${server.baseUrl}/ai/chat`, {
        method: 'POST',
        headers: bearer(server.token),
      })
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
    const server = startLocalHttpServer({
      getAIConfig: () => AI_CONFIG,
      getWorkspacePath: () => '/workspace',
    });
    const media = server.mediaToken;
    const attachment = await fetchRequest(
      new Request(`${server.baseUrl}/attachment?path=a.png&token=${media}`)
    );
    // Past authentication (the mocked path helper yields no file).
    expect([401, 403]).not.toContain(attachment.status);
    const unfurl = await fetchRequest(
      new Request(`${server.baseUrl}/unfurl?url=https://a.test&token=${media}`)
    );
    expect(unfurl.status).toBe(403);
    server.stop();
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
