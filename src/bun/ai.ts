import { randomUUID } from 'node:crypto';

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from '@blocknote/xl-ai/server';
import { convertToModelMessages, type LanguageModel, streamText } from 'ai';

import { unfurlLink } from './linkPreview';

export type AIProvider = 'anthropic' | 'custom' | 'ollama' | 'openai';

export interface AIServerConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  provider: AIProvider;
}

export interface AIServerHandle {
  baseUrl: string;
  enabled: boolean;
  stop: () => void;
  token: string;
}

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

// The renderer webview (http://localhost:5173 in dev, views:// in prod) calls
// this 127.0.0.1 endpoint cross-origin with an Authorization header, which
// triggers a CORS preflight. Auth is enforced by the per-launch bearer token,
// so a wildcard origin is safe; without these headers the webview blocks the
// request before it ever reaches the provider.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
} as const;

function resolveModel(config: AIServerConfig): LanguageModel {
  switch (config.provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model);
    }
    case 'ollama':
    case 'custom': {
      const compat = createOpenAICompatible({
        name: config.provider,
        baseURL: config.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
        apiKey: config.apiKey,
      });
      return compat(config.model);
    }
    default: {
      const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return openai(config.model);
    }
  }
}

/**
 * Handle a single BlockNote AI chat request. Mirrors the BlockNote backend
 * reference: inject the document state, expose the client tool definitions to
 * the model, and stream the UI message response back to the editor.
 */
async function handleAIChat(
  req: Request,
  config: AIServerConfig
): Promise<Response> {
  const { messages, toolDefinitions } = (await req.json()) as {
    messages: unknown[];
    toolDefinitions: unknown[];
  };

  const result = streamText({
    model: resolveModel(config),
    system: aiDocumentFormats.html.systemPrompt,
    messages: await convertToModelMessages(
      injectDocumentStateMessages(messages as never)
    ),
    tools: toolDefinitionsToToolSet(toolDefinitions as never),
    toolChoice: 'required',
  });

  return result.toUIMessageStreamResponse({ headers: CORS_HEADERS });
}

/**
 * Start a localhost-only HTTP endpoint that bridges the renderer webview to
 * Bun-side capabilities that don't fit Electrobun RPC well (streamed LLM
 * responses; unfurls whose responses were getting dropped by the RPC layer
 * on subsequent calls). Binds a random port on 127.0.0.1 and gates every
 * route behind the same per-launch bearer token.
 */
export function startAIServer(
  getConfig: () => AIServerConfig | null
): AIServerHandle {
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
        const config = getConfig();
        if (!config) {
          return new Response('AI not configured', {
            status: 503,
            headers: CORS_HEADERS,
          });
        }
        try {
          return await handleAIChat(req, config);
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
    enabled: getConfig() !== null,
    token,
    stop: () => server.stop(true),
  };
}
