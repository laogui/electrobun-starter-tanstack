import { randomUUID } from 'node:crypto';

import { type AIServerConfig, handleAIChat } from './ai';
import {
  assertWorkspaceAttachmentPath,
  saveAttachmentStream,
} from './attachments';
import { unfurlLink } from './linkPreview';
import { generateFileMetadata } from './thumbnail';

export interface LocalHttpServerHandle {
  baseUrl: string;
  stop: () => void;
  token: string;
}

export interface LocalHttpServerOptions {
  getAIConfig: () => AIServerConfig | null;
  getWorkspacePath: () => string;
}

// The renderer webview (http://localhost:5173 in dev, views:// in prod) calls
// this 127.0.0.1 endpoint cross-origin with an Authorization header, which
// triggers a CORS preflight. Auth is enforced by the per-launch bearer token,
// so a wildcard origin is safe; without these headers the webview blocks the
// request before it ever reaches the local route handler.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
  'Access-Control-Expose-Headers':
    'Content-Length, Content-Range, Accept-Ranges',
} as const;

const BYTE_RANGE_RE = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/i;
const ATTACHMENT_KINDS = new Set(['audio', 'file', 'image', 'video']);
type AttachmentKind = 'audio' | 'file' | 'image' | 'video';

interface ByteRange {
  end: number;
  start: number;
}

function parseByteRange(value: string, size: number): ByteRange | null {
  if (!(Number.isSafeInteger(size) && size > 0)) {
    return null;
  }
  const match = BYTE_RANGE_RE.exec(value);
  if (!match) {
    return null;
  }

  if (match[3] !== undefined) {
    const suffixLength = Number(match[3]);
    if (!(Number.isSafeInteger(suffixLength) && suffixLength > 0)) {
      return null;
    }
    return {
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    };
  }

  const start = Number(match[1]);
  if (!(Number.isSafeInteger(start) && start >= 0 && start < size)) {
    return null;
  }
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!(Number.isSafeInteger(requestedEnd) && requestedEnd >= start)) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function readRequestToken(
  req: Request,
  url: URL,
  expectedToken: string
): boolean {
  const header = req.headers.get('authorization');
  if (header === `Bearer ${expectedToken}`) {
    return true;
  }
  const queryToken = url.searchParams.get('token');
  return queryToken === expectedToken;
}

async function serveWorkspaceAttachment(
  req: Request,
  wsPath: string,
  relativePath: string
): Promise<Response> {
  const { fullPath } = assertWorkspaceAttachmentPath(wsPath, relativePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  }

  const size = file.size;
  const mimeType = file.type || 'application/octet-stream';
  const baseHeaders = {
    ...CORS_HEADERS,
    'Content-Type': mimeType,
    'Accept-Ranges': 'bytes',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, size);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes */${size}`,
        },
      });
    }
    const chunk = file.slice(range.start, range.end + 1);
    const body = req.method === 'HEAD' ? null : chunk;
    return new Response(body, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }

  if (req.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(size),
      },
    });
  }

  return new Response(file, {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(size),
    },
  });
}

/**
 * Start a localhost-only HTTP endpoint for renderer calls that do not fit
 * Electrobun RPC well: streamed AI chat responses, request-scoped link
 * unfurls, and workspace attachment streaming for media playback. The random
 * port is bound to 127.0.0.1 and every route is gated by a per-launch bearer
 * token passed to the renderer through RPC.
 */
export function startLocalHttpServer(
  options: LocalHttpServerOptions
): LocalHttpServerHandle {
  const token = randomUUID();

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (req) => {
      const url = new URL(req.url);
      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (!readRequestToken(req, url, token)) {
        return new Response('Unauthorized', {
          status: 401,
          headers: CORS_HEADERS,
        });
      }
      if (url.pathname === '/ai/chat' && req.method === 'POST') {
        const config = options.getAIConfig();
        if (!config) {
          return new Response('AI not configured', {
            status: 503,
            headers: CORS_HEADERS,
          });
        }
        try {
          return await handleAIChat(req, config, CORS_HEADERS);
        } catch (err) {
          console.error('[ai] chat request failed:', err);
          return new Response('AI request failed', {
            status: 500,
            headers: CORS_HEADERS,
          });
        }
      }
      if (url.pathname === '/unfurl' && req.method === 'GET') {
        const target = url.searchParams.get('url');
        if (!target) {
          return new Response('Missing url', {
            status: 400,
            headers: CORS_HEADERS,
          });
        }
        try {
          const result = await unfurlLink(target);
          return Response.json(result, { headers: CORS_HEADERS });
        } catch (err) {
          console.error('[unfurl] request failed:', err);
          return new Response('Unfurl failed', {
            status: 500,
            headers: CORS_HEADERS,
          });
        }
      }
      if (url.pathname === '/attachment/upload' && req.method === 'POST') {
        const fileName = url.searchParams.get('fileName');
        const mimeType =
          url.searchParams.get('mimeType') ?? 'application/octet-stream';
        const kind = url.searchParams.get('kind') ?? 'file';
        if (!(fileName && req.body)) {
          return new Response('Missing fileName or body', {
            status: 400,
            headers: CORS_HEADERS,
          });
        }
        if (!ATTACHMENT_KINDS.has(kind)) {
          return new Response('Invalid attachment kind', {
            status: 400,
            headers: CORS_HEADERS,
          });
        }
        try {
          const wsPath = options.getWorkspacePath();
          const saved = await saveAttachmentStream(wsPath, {
            body: req.body,
            kind: kind as AttachmentKind,
            mimeType,
            suggestedName: fileName,
          });
          const { fullPath } = assertWorkspaceAttachmentPath(
            wsPath,
            saved.filePath
          );
          const metadata = await generateFileMetadata(fullPath, mimeType);
          return Response.json(
            { ...saved, ...metadata },
            { headers: CORS_HEADERS }
          );
        } catch (err) {
          console.error('[attachment] upload failed:', err);
          return new Response('Attachment upload failed', {
            status: 500,
            headers: CORS_HEADERS,
          });
        }
      }
      if (url.pathname === '/attachment') {
        const relativePath = url.searchParams.get('path');
        if (!relativePath) {
          return new Response('Missing path', {
            status: 400,
            headers: CORS_HEADERS,
          });
        }
        try {
          return await serveWorkspaceAttachment(
            req,
            options.getWorkspacePath(),
            relativePath
          );
        } catch (err) {
          console.error('[attachment] stream failed:', err);
          return new Response('Attachment unavailable', {
            status: 400,
            headers: CORS_HEADERS,
          });
        }
      }
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    token,
    stop: () => server.stop(true),
  };
}
