import { beforeEach, describe, expect, it, vi } from 'vitest';

const assertWorkspaceAttachmentPathMock = vi.hoisted(() =>
  vi.fn((wsPath: string, filePath: string) => ({
    fullPath: `${wsPath}/${filePath}`,
    relativePath: filePath,
  }))
);
const saveAttachmentStreamMock = vi.hoisted(() => vi.fn());
const generateFileMetadataMock = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock('./attachments', () => ({
  assertWorkspaceAttachmentPath: assertWorkspaceAttachmentPathMock,
  saveAttachmentStream: saveAttachmentStreamMock,
}));

vi.mock('./thumbnail', () => ({
  generateFileMetadata: generateFileMetadataMock,
}));

import { startLocalHttpServer } from './localHttpServer';

type FetchHandler = (req: Request) => Promise<Response> | Response;

let capturedFetch: FetchHandler | null = null;

const serveMock = vi.fn((options: { fetch: FetchHandler }) => {
  capturedFetch = options.fetch;
  return { port: 4242, stop: vi.fn() };
});

const bunFileMock = vi.hoisted(() => vi.fn());

vi.stubGlobal('Bun', {
  serve: serveMock,
  file: bunFileMock,
});

const ORIGIN = 'http://localhost:5173';

function invoke(req: Request): Promise<Response> | Response {
  if (!capturedFetch) {
    throw new Error('Bun.serve fetch handler was not captured');
  }
  return capturedFetch(req);
}

function createServerOptions(wsPath = '/tmp/workspace') {
  return {
    getAIConfig: () => null,
    getWorkspacePath: () => wsPath,
  };
}

describe('startLocalHttpServer', () => {
  beforeEach(() => {
    capturedFetch = null;
    serveMock.mockClear();
    assertWorkspaceAttachmentPathMock.mockClear();
    bunFileMock.mockReset();
  });

  it('binds localhost and returns a bearer token', () => {
    const handle = startLocalHttpServer({
      getAIConfig: () => ({
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'k',
      }),
      getWorkspacePath: () => '/tmp/workspace',
    });
    expect(serveMock).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: '127.0.0.1', port: 0 })
    );
    expect(handle.baseUrl).toBe('http://127.0.0.1:4242');
    expect(handle.token).toBeTruthy();
  });

  it('answers the CORS preflight for /ai/chat', async () => {
    startLocalHttpServer(createServerOptions());
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
    startLocalHttpServer(createServerOptions());
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
    const handle = startLocalHttpServer(createServerOptions());
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

  it('replies 400 when AI chat receives an invalid request body', async () => {
    const handle = startLocalHttpServer({
      getAIConfig: () => ({
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'k',
      }),
      getWorkspacePath: () => '/tmp/workspace',
    });
    const res = await invoke(
      new Request('http://127.0.0.1:4242/ai/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${handle.token}`,
          'Content-Type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({ messages: [] }),
      })
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid AI chat request');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns 404 for unknown routes', async () => {
    const handle = startLocalHttpServer(createServerOptions());
    const res = await invoke(
      new Request('http://127.0.0.1:4242/other', {
        method: 'POST',
        headers: { Authorization: `Bearer ${handle.token}` },
      })
    );
    expect(res.status).toBe(404);
  });

  it('rejects attachment uploads with an invalid kind', async () => {
    const handle = startLocalHttpServer(createServerOptions());
    const res = await invoke(
      new Request(
        'http://127.0.0.1:4242/attachment/upload?fileName=test.bin&kind=script',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${handle.token}` },
          body: new Blob(['payload']),
        }
      )
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid attachment kind');
    expect(saveAttachmentStreamMock).not.toHaveBeenCalled();
  });

  it('rejects /unfurl without bearer token', async () => {
    startLocalHttpServer(createServerOptions());
    const res = await invoke(
      new Request('http://127.0.0.1:4242/unfurl?url=https://example.com', {
        method: 'GET',
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when /unfurl is called without a url param', async () => {
    const handle = startLocalHttpServer(createServerOptions());
    const res = await invoke(
      new Request('http://127.0.0.1:4242/unfurl', {
        method: 'GET',
        headers: { Authorization: `Bearer ${handle.token}` },
      })
    );
    expect(res.status).toBe(400);
  });

  it('accepts attachment auth via query token for media elements', async () => {
    bunFileMock.mockReturnValue({
      exists: async () => false,
      size: 0,
      type: 'video/mp4',
    });
    const handle = startLocalHttpServer(createServerOptions());
    const res = await invoke(
      new Request(
        `http://127.0.0.1:4242/attachment?path=attachments%2Fmissing.mp4&token=${handle.token}`,
        { method: 'GET' }
      )
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('serves suffix byte ranges', async () => {
    const body = new Blob(['abcde'], { type: 'video/mp4' });
    bunFileMock.mockReturnValue({
      exists: async () => true,
      size: body.size,
      slice: (start: number, end: number) => body.slice(start, end),
      type: body.type,
    });
    const handle = startLocalHttpServer(createServerOptions());

    const res = await invoke(
      new Request(
        `http://127.0.0.1:4242/attachment?path=attachments%2Fvideo.mp4&token=${handle.token}`,
        { headers: { Range: 'bytes=-2' } }
      )
    );

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 3-4/5');
    expect(res.headers.get('content-length')).toBe('2');
    expect(await res.text()).toBe('de');
  });

  it('clamps a byte range end to the file size', async () => {
    const body = new Blob(['abcde'], { type: 'video/mp4' });
    bunFileMock.mockReturnValue({
      exists: async () => true,
      size: body.size,
      slice: (start: number, end: number) => body.slice(start, end),
      type: body.type,
    });
    const handle = startLocalHttpServer(createServerOptions());

    const res = await invoke(
      new Request(
        `http://127.0.0.1:4242/attachment?path=attachments%2Fvideo.mp4&token=${handle.token}`,
        { headers: { Range: 'bytes=0-99' } }
      )
    );

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-4/5');
    expect(await res.text()).toBe('abcde');
  });

  it.each([
    'bytes=9-',
    'bytes=0-1,3-4',
    'invalid',
  ])('returns 416 for an unsatisfiable range: %s', async (range) => {
    const body = new Blob(['abcde'], { type: 'video/mp4' });
    bunFileMock.mockReturnValue({
      exists: async () => true,
      size: body.size,
      slice: (start: number, end: number) => body.slice(start, end),
      type: body.type,
    });
    const handle = startLocalHttpServer(createServerOptions());

    const res = await invoke(
      new Request(
        `http://127.0.0.1:4242/attachment?path=attachments%2Fvideo.mp4&token=${handle.token}`,
        { headers: { Range: range } }
      )
    );

    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */5');
  });

  it('returns range headers without a body for HEAD', async () => {
    const body = new Blob(['abcde'], { type: 'video/mp4' });
    bunFileMock.mockReturnValue({
      exists: async () => true,
      size: body.size,
      slice: (start: number, end: number) => body.slice(start, end),
      type: body.type,
    });
    const handle = startLocalHttpServer(createServerOptions());

    const res = await invoke(
      new Request(
        `http://127.0.0.1:4242/attachment?path=attachments%2Fvideo.mp4&token=${handle.token}`,
        { headers: { Range: 'bytes=1-3' }, method: 'HEAD' }
      )
    );

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 1-3/5');
    expect(res.headers.get('content-length')).toBe('3');
    expect(await res.text()).toBe('');
  });
});
