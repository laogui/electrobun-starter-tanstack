import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startLocalHttpServer } from './localHttpServer';

type FetchHandler = (req: Request) => Promise<Response> | Response;

let capturedFetch: FetchHandler | null = null;

const serveMock = vi.fn((options: { fetch: FetchHandler }) => {
  capturedFetch = options.fetch;
  return { port: 4242, stop: vi.fn() };
});

vi.stubGlobal('Bun', { serve: serveMock });

const ORIGIN = 'http://localhost:5173';

function invoke(req: Request): Promise<Response> | Response {
  if (!capturedFetch) {
    throw new Error('Bun.serve fetch handler was not captured');
  }
  return capturedFetch(req);
}

describe('startLocalHttpServer', () => {
  beforeEach(() => {
    capturedFetch = null;
    serveMock.mockClear();
  });

  it('binds localhost and returns a bearer token', () => {
    const handle = startLocalHttpServer(() => ({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'k',
    }));
    expect(serveMock).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: '127.0.0.1', port: 0 })
    );
    expect(handle.baseUrl).toBe('http://127.0.0.1:4242');
    expect(handle.token).toBeTruthy();
  });

  it('answers the CORS preflight for /ai/chat', async () => {
    startLocalHttpServer(() => null);
    const res = await invoke(
      new Request('http://127.0.0.1:4242/ai/chat', {
        method: 'OPTIONS',
        headers: {
          Origin: ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, content-type',
        },
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(
      res.headers.get('access-control-allow-headers')?.toLowerCase()
    ).toContain('authorization');
  });

  it('rejects bad tokens with 401 and includes CORS headers', async () => {
    startLocalHttpServer(() => null);
    const res = await invoke(
      new Request('http://127.0.0.1:4242/ai/chat', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong', Origin: ORIGIN },
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('replies 503 with CORS headers when AI is not configured', async () => {
    const handle = startLocalHttpServer(() => null);
    const res = await invoke(
      new Request('http://127.0.0.1:4242/ai/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${handle.token}`,
          Origin: ORIGIN,
        },
      })
    );
    expect(res.status).toBe(503);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns 404 for unknown routes', async () => {
    const handle = startLocalHttpServer(() => null);
    const res = await invoke(
      new Request('http://127.0.0.1:4242/other', {
        method: 'POST',
        headers: { Authorization: `Bearer ${handle.token}` },
      })
    );
    expect(res.status).toBe(404);
  });

  it('rejects /unfurl without bearer token', async () => {
    startLocalHttpServer(() => null);
    const res = await invoke(
      new Request('http://127.0.0.1:4242/unfurl?url=https://example.com', {
        method: 'GET',
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when /unfurl is called without a url param', async () => {
    const handle = startLocalHttpServer(() => null);
    const res = await invoke(
      new Request('http://127.0.0.1:4242/unfurl', {
        method: 'GET',
        headers: { Authorization: `Bearer ${handle.token}` },
      })
    );
    expect(res.status).toBe(400);
  });
});
