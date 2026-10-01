import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  aiDocumentFormats,
  injectDocumentStateMessages,
} from '@blocknote/xl-ai/server';
import {
  convertToModelMessages,
  jsonSchema,
  type LanguageModel,
  streamText,
  tool,
  validateUIMessages,
} from 'ai';
import { z } from 'zod';
import {
  type AITestResult,
  classifyAIError,
} from '../shared/ai/providerConfig';

export type AIProvider = 'anthropic' | 'custom' | 'ollama' | 'openai';

export interface AIServerConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  provider: AIProvider;
}

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

export function validateAIConfig(config: AIServerConfig): boolean {
  if (!config.model.trim()) {
    return false;
  }
  if (
    (config.provider === 'openai' || config.provider === 'anthropic') &&
    !config.apiKey?.trim()
  ) {
    return false;
  }
  if (config.provider === 'custom' && !config.baseUrl?.trim()) {
    return false;
  }
  if (config.baseUrl) {
    try {
      const url = new URL(config.baseUrl);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

export function resolveModel(config: AIServerConfig): LanguageModel {
  switch (config.provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return anthropic(config.model);
    }
    case 'ollama':
    case 'custom': {
      const compat = createOpenAICompatible({
        name: config.provider,
        baseURL:
          config.baseUrl ||
          (config.provider === 'ollama' ? DEFAULT_OLLAMA_BASE_URL : ''),
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
  const parsed = aiChatBodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response('Invalid AI chat request', { status: 400, headers });
  }
  if (!validateAIConfig(config)) {
    return new Response('ghostboard-ai:configuration', {
      status: 400,
      headers,
    });
  }
  const { toolDefinitions, context } = parsed.data;
  let messages: Awaited<ReturnType<typeof validateUIMessages>>;
  try {
    messages = await validateUIMessages({ messages: parsed.data.messages });
  } catch {
    return new Response('Invalid AI chat messages', { status: 400, headers });
  }

  const result = streamText({
    model: resolveModel(config),
    system:
      aiDocumentFormats.html.systemPrompt +
      (context?.title
        ? `\nDocument title (context only): ${JSON.stringify(context.title)}`
        : ''),
    messages: await convertToModelMessages(
      injectDocumentStateMessages(messages)
    ),
    // Build tools with the host SDK instance: xl-ai can depend on a separate
    // SDK version with incompatible nominal schema types.
    tools: Object.fromEntries(
      Object.entries(toolDefinitions).map(([name, definition]) => [
        name,
        tool({
          description: definition.description,
          inputSchema: jsonSchema(definition.inputSchema),
          outputSchema: jsonSchema(definition.outputSchema),
        }),
      ])
    ),
    toolChoice: 'required',
    abortSignal: AbortSignal.any([req.signal, AbortSignal.timeout(120_000)]),
  });

  return result.toUIMessageStreamResponse({
    headers,
    onError: (error) => `ghostboard-ai:${classifyAIError(error)}`,
  });
}

const jsonObjectSchema = z.record(z.string(), z.unknown());
const aiChatBodySchema = z.object({
  messages: z.array(z.unknown()).min(1).max(200),
  toolDefinitions: z
    .record(
      z.string(),
      z.object({
        description: z.string().optional(),
        inputSchema: jsonObjectSchema,
        outputSchema: jsonObjectSchema,
      })
    )
    .refine(
      (tools) =>
        Object.keys(tools).length > 0 && Object.keys(tools).length <= 32
    ),
  context: z.object({ title: z.string().max(120) }).optional(),
});

/** Exercise the same streaming + required-tool capability used by the editor. */
export async function testAIConnection(
  config: AIServerConfig
): Promise<AITestResult> {
  if (!validateAIConfig(config)) {
    return { success: false, error: 'configuration' };
  }
  try {
    const result = streamText({
      model: resolveModel(config),
      prompt: 'Call the connectionCheck tool with ok set to true.',
      tools: {
        connectionCheck: tool({
          description: 'Verify tool calling is supported.',
          inputSchema: jsonSchema<{ ok: boolean }>({
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
            additionalProperties: false,
          }),
        }),
      },
      toolChoice: 'required',
      abortSignal: AbortSignal.timeout(30_000),
      maxRetries: 0,
      maxOutputTokens: 128,
    });
    // Reading fullStream also exposes streaming provider errors (not only HTTP errors).
    for await (const part of result.fullStream) {
      if (part.type === 'error') {
        throw part.error;
      }
    }
    const calls = await result.toolCalls;
    return calls.some(
      (call) =>
        call.toolName === 'connectionCheck' &&
        z.object({ ok: z.literal(true) }).safeParse(call.input).success
    )
      ? { success: true }
      : { success: false, error: 'unsupported-tools' };
  } catch (error) {
    return { success: false, error: classifyAIError(error) };
  }
}
