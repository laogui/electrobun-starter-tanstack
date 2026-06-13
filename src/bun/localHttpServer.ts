import { randomUUID } from 'node:crypto';

import { type AIServerConfig, handleAIChat } from './ai';
import { unfurlLink } from './linkPreview';

export interface LocalHttpServerHandle {
  baseUrl: string;
  stop: () => void;
  token: string;
}

// The renderer webview (http://localhost:5173 in dev, views:// in prod) calls
// this 127.0.0.1 endpoint cross-origin with an Authorization header, which
// triggers a CORS preflight. Auth is enforced by the per-launch bearer token,
// so a wildcard origin is safe; without these headers the webview blocks the
// request before it ever reaches the local route handler.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
} as const;

/**
 * Start a localhost-only HTTP endpoint for renderer calls that do not fit
 * Electrobun RPC well: streamed AI chat responses and request-scoped link
 * unfurls. The random port is bound to 127.0.0.1 and every route is gated by a
 * per-launch bearer token passed to the renderer through RPC.
 */
export function startLocalHttpServer(
  getAIConfig: () => AIServerConfig | null
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
      if (req.headers.get('authorization') !== `Bearer ${token}`) {
        return new Response('Unauthorized', {
          status: 401,
          headers: CORS_HEADERS,
        });
      }
      if (url.pathname === '/ai/chat' && req.method === 'POST') {
        const config = getAIConfig();
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
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    token,
    stop: () => server.stop(true),
  };
}
