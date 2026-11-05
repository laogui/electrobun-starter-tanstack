import { type AIServerConfig, handleAIChat } from './ai';
import {
  assertWorkspaceAttachmentPath,
  saveAttachmentStream,
} from './attachments';
import { unfurlLink } from './linkPreview';
import { LocalHttpCredentials, type LocalHttpPrincipal } from './localHttpAuth';
import { generateFileMetadata } from './thumbnail';
import { serveYouTubePlayer } from './youtubePlayer';

export interface LocalHttpServerHandle {
  baseUrl: string;
  /**
   * Read-only token that may travel in a URL query (`<video src>`, iframe
   * `src`). Only accepted for GET/HEAD on `/attachment` and `/youtube`.
   */
  mediaToken: string;
  stop: () => void;
  /** Main renderer token. Accepted only as an `Authorization` header. */
  token: string;
}

export interface LocalHttpServerOptions {
  /**
   * Origins allowed to read cross-origin responses. Defaults to the packaged
   * renderer (`views://`) and the Vite dev server on port 5173.
   */
  allowedOrigins?: readonly string[];
  getAIConfig: () => AIServerConfig | null;
  getWorkspacePath: () => string;
}

// The renderer webview (http://localhost:5173 in dev, views://mainview in
// prod) calls this 127.0.0.1 endpoint cross-origin with an Authorization
// header, which triggers a CORS preflight. Only the app's own origins are
// reflected. `null` is kept because WebKit may report an opaque origin for
// custom schemes; every route still requires a token, so CORS is a second
// line of defence rather than the authentication boundary.
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = Object.freeze([
  'views://mainview',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'null',
]);

const CORS_BASE_HEADERS = {
  'Access-Control-Allow-Methods': 'DELETE, GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
  'Access-Control-Expose-Headers':
    'Content-Length, Content-Range, Accept-Ranges',
} as const;

function corsHeadersFor(
  origin: string | null,
  allowed: ReadonlySet<string>
): Record<string, string> {
  if (origin === null || !allowed.has(origin)) {
    return { Vary: 'Origin' };
  }
  return {
    ...CORS_BASE_HEADERS,
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  };
}

function isMediaRoute(request: Request, pathname: string): boolean {
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (pathname === '/attachment' || pathname === '/youtube')
  );
}

/** Whether `principal` may call `pathname` at all (before per-route checks). */
export function isRouteAllowed(
  principal: LocalHttpPrincipal,
  request: Request,
  pathname: string
): boolean {
  switch (principal.kind) {
    case 'renderer':
      return true;
    case 'media':
      return isMediaRoute(request, pathname);
    default:
      return false;
  }
}

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

async function serveWorkspaceAttachment(
  req: Request,
  wsPath: string,
  relativePath: string,
  cors: HeadersInit
): Promise<Response> {
  const { fullPath } = assertWorkspaceAttachmentPath(wsPath, relativePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return new Response('Not found', { status: 404, headers: cors });
  }

  const size = file.size;
  const mimeType = file.type || 'application/octet-stream';
  const baseHeaders = {
    ...cors,
    'Content-Type': mimeType,
    'Accept-Ranges': 'bytes',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: cors,
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
 * port is bound to 127.0.0.1. Credentials are minted per launch (see
 * `LocalHttpCredentials`): the renderer token (header only, every route), a
 * read-only media token (query allowed, `/attachment` + `/youtube`).
 */
export function startLocalHttpServer(
  options: LocalHttpServerOptions
): LocalHttpServerHandle {
  const credentials = new LocalHttpCredentials();
  const token = credentials.rendererToken;
  const allowedOrigins = new Set(
    options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS
  );

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 120,
    fetch: async (req) => {
      const url = new URL(req.url);
      const cors = corsHeadersFor(req.headers.get('origin'), allowedOrigins);
      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors });
      }
      const principal = credentials.authenticate(req, url);
      if (!principal) {
        return new Response('Unauthorized', { status: 401, headers: cors });
      }
      if (!isRouteAllowed(principal, req, url.pathname)) {
        return new Response('Forbidden', { status: 403, headers: cors });
      }
      if (url.pathname === '/youtube') {
        return serveYouTubePlayer(req, url);
      }
      if (url.pathname === '/ai/chat' && req.method === 'POST') {
        const config = options.getAIConfig();
        if (!config) {
          return new Response(
            'ghostboard-ai:configuration; AI not configured',
            {
              status: 503,
              headers: cors,
            }
          );
        }
        try {
          return await handleAIChat(req, config, cors);
        } catch (err) {
          console.error('[ai] chat request failed:', err);
          return new Response('ghostboard-ai:unknown', {
            status: 500,
            headers: cors,
          });
        }
      }
      if (url.pathname === '/unfurl' && req.method === 'GET') {
        const target = url.searchParams.get('url');
        if (!target) {
          return new Response('Missing url', {
            status: 400,
            headers: cors,
          });
        }
        try {
          const result = await unfurlLink(target);
          return Response.json(result, { headers: cors });
        } catch (err) {
          console.error('[unfurl] request failed:', err);
          return new Response('Unfurl failed', {
            status: 500,
            headers: cors,
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
            headers: cors,
          });
        }
        if (!ATTACHMENT_KINDS.has(kind)) {
          return new Response('Invalid attachment kind', {
            status: 400,
            headers: cors,
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
          return Response.json({ ...saved, ...metadata }, { headers: cors });
        } catch (err) {
          console.error('[attachment] upload failed:', err);
          return new Response('Attachment upload failed', {
            status: 500,
            headers: cors,
          });
        }
      }
      if (url.pathname === '/attachment') {
        const relativePath = url.searchParams.get('path');
        if (!relativePath) {
          return new Response('Missing path', {
            status: 400,
            headers: cors,
          });
        }
        try {
          return await serveWorkspaceAttachment(
            req,
            options.getWorkspacePath(),
            relativePath,
            cors
          );
        } catch (err) {
          console.error('[attachment] stream failed:', err);
          return new Response('Attachment unavailable', {
            status: 400,
            headers: cors,
          });
        }
      }
      return new Response('Not found', { status: 404, headers: cors });
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    mediaToken: credentials.mediaToken,
    token,
    stop: () => {
      server.stop(true);
    },
  };
}
