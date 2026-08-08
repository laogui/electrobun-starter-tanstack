import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from '@blocknote/xl-ai/server';
import { convertToModelMessages, type LanguageModel, streamText } from 'ai';

export type AIProvider = 'anthropic' | 'custom' | 'ollama' | 'openai';

export interface AIServerConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  provider: AIProvider;
}

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

export function resolveModel(config: AIServerConfig): LanguageModel {
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
export async function handleAIChat(
  req: Request,
  config: AIServerConfig,
  headers?: HeadersInit
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid AI chat request', { status: 400, headers });
  }
  if (!(body && typeof body === 'object')) {
    return new Response('Invalid AI chat request', { status: 400, headers });
  }
  const { messages, toolDefinitions } = body as {
    messages?: unknown;
    toolDefinitions?: unknown;
  };
  if (!(Array.isArray(messages) && Array.isArray(toolDefinitions))) {
    return new Response('Invalid AI chat request', { status: 400, headers });
  }

  const result = streamText({
    model: resolveModel(config),
    system: aiDocumentFormats.html.systemPrompt,
    messages: await convertToModelMessages(
      injectDocumentStateMessages(messages as never)
    ),
    tools: toolDefinitionsToToolSet(toolDefinitions as never) as never,
    toolChoice: 'required',
  });

  return result.toUIMessageStreamResponse({ headers });
}
