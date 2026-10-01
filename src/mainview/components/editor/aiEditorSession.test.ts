// @vitest-environment jsdom

import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { BlockNoteEditor } from '@blocknote/core';
import { AIExtension, aiDocumentFormats } from '@blocknote/xl-ai';
import { DefaultChatTransport } from 'ai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AIServerConfig,
  handleAIChat,
  testAIConnection,
} from '../../../bun/ai';
import {
  abortAIEditorRequest,
  getAIRequestSignal,
  hasPendingAIChanges,
  observeAIEditorSession,
} from './aiEditorSession';

let server: Server;
let config: AIServerConfig;
let mode: 'success' | 'plain' | 'auth' | 'wait';
let received: Record<string, unknown>;
let upstreamClosed: boolean;
const sockets = new Set<Socket>();
const editors: BlockNoteEditor[] = [];

beforeEach(async () => {
  mode = 'success';
  upstreamClosed = false;
  received = {};
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    received = JSON.parse(body) as Record<string, unknown>;
    if (mode === 'auth') {
      res.writeHead(401);
      res.end('{"error":{"message":"invalid key"}}');
      return;
    }
    if (mode === 'wait') {
      res.on('close', () => {
        upstreamClosed = true;
      });
      return;
    }
    const testing = JSON.stringify(received.tools).includes('connectionCheck');
    const input = testing
      ? { ok: true }
      : {
          operations: [
            { type: 'update', id: 'p1$', block: '<p>Rewritten by AI</p>' },
          ],
        };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const toolName = testing ? 'connectionCheck' : 'applyDocumentOperations';
    const event = (type: string, data: object) =>
      res.write(
        `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
      );
    if (req.url?.endsWith('/responses')) {
      const item = {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call-1',
        name: toolName,
        arguments: JSON.stringify(input),
        status: 'completed',
      };
      const response = {
        id: 'resp_1',
        object: 'response',
        created_at: 1,
        model: 'local-test',
        status: 'in_progress',
        output: [],
      };
      event('response.created', { response });
      event('response.output_item.added', {
        output_index: 0,
        item: { ...item, arguments: '', status: 'in_progress' },
      });
      event('response.function_call_arguments.delta', {
        item_id: 'fc_1',
        output_index: 0,
        delta: JSON.stringify(input),
      });
      event('response.output_item.done', { output_index: 0, item });
      event('response.completed', {
        response: {
          ...response,
          status: 'completed',
          output: [item],
          usage: { input_tokens: 2, output_tokens: 10 },
        },
      });
      res.end();
      return;
    }
    if (req.url?.endsWith('/messages')) {
      event('message_start', {
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'local-test',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 2, output_tokens: 0 },
        },
      });
      event('content_block_start', {
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'call-1',
          name: toolName,
          input: {},
        },
      });
      event('content_block_delta', {
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify(input),
        },
      });
      event('content_block_stop', { index: 0 });
      event('message_delta', {
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { output_tokens: 10 },
      });
      event('message_stop', {});
      res.end();
      return;
    }
    const send = (delta: unknown, finish_reason: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
      );
    send(
      mode === 'plain'
        ? { content: 'Hello' }
        : {
            tool_calls: [
              {
                index: 0,
                id: 'call-1',
                type: 'function',
                function: {
                  name: testing ? 'connectionCheck' : 'applyDocumentOperations',
                  arguments: JSON.stringify(input),
                },
              },
            ],
          }
    );
    send({}, mode === 'plain' ? 'stop' : 'tool_calls');
    res.end('data: [DONE]\n\n');
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('missing address');
  }
  config = {
    provider: 'custom',
    model: 'local-test',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
  };
});
afterEach(async () => {
  for (const editor of editors.splice(0)) {
    editor.unmount();
  }
  for (const socket of sockets) {
    socket.destroy();
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function makeEditor(
  initialContent?: BlockNoteEditor['document']
): BlockNoteEditor {
  const editor: BlockNoteEditor = BlockNoteEditor.create({
    initialContent: initialContent ?? [
      { id: 'p1', type: 'paragraph', content: 'Original' },
    ],
    extensions: [
      AIExtension({
        transport: new DefaultChatTransport({
          api: 'http://local/ai/chat',
          fetch: Object.assign(
            (input: RequestInfo | URL, init?: RequestInit) =>
              handleAIChat(
                new Request(String(input), {
                  ...init,
                  signal: AbortSignal.any([
                    getAIRequestSignal(editor),
                    ...(init?.signal ? [init.signal] : []),
                  ]),
                }),
                config
              ),
            { preconnect: fetch.preconnect }
          ),
        }),
      }),
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  editor.mount(host);
  editors.push(editor);
  return editor;
}
async function rewrite(editor: BlockNoteEditor) {
  const ai = editor.getExtension(AIExtension)!;
  ai.openAIMenuAtBlock('p1');
  await ai.invokeAI({
    userPrompt: 'Rewrite',
    useSelection: false,
    streamToolsProvider: aiDocumentFormats.html.getStreamToolsProvider({
      withDelays: false,
    }),
  });
  return ai;
}
function recordCommitted(editor: BlockNoteEditor) {
  const saved: string[] = [];
  const save = () => saved.push(JSON.stringify(editor.document));
  const dispose = observeAIEditorSession(editor, save, () => undefined);
  const off = editor.onChange(() => {
    if (!hasPendingAIChanges(editor)) {
      save();
    }
  });
  return {
    saved,
    dispose: () => {
      off();
      dispose();
    },
  };
}

describe('real BlockNote / production AI handler / local provider', () => {
  it('accepts actual object tool definitions and only commits accepted content', async () => {
    const editor = makeEditor();
    const { saved, dispose } = recordCommitted(editor);
    const ai = await rewrite(editor);
    expect(ai.store.state.aiMenuState).toMatchObject({
      status: 'user-reviewing',
    });
    expect(received.tool_choice).toBe('required');
    expect(JSON.stringify(editor.document)).toContain(
      'OriginalRewritten by AI'
    );
    expect(saved.join('')).not.toContain('Rewritten by AI');
    ai.acceptChanges();
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.at(-1)).toContain('Rewritten by AI');
    expect(saved.at(-1)).not.toContain('Original');
    const reopened = makeEditor(
      JSON.parse(saved.at(-1)!) as BlockNoteEditor['document']
    );
    expect(JSON.stringify(reopened.document)).toContain('Rewritten by AI');
    dispose();
  });
  it('rejects suggestions and closes without ever committing draft JSON', async () => {
    const editor = makeEditor();
    const { saved, dispose } = recordCommitted(editor);
    const ai = await rewrite(editor);
    ai.rejectChanges();
    expect(saved.at(-1)).toContain('Original');
    expect(saved.join('')).not.toContain('Rewritten by AI');
    await rewrite(editor);
    dispose();
    expect(JSON.stringify(editor.document)).not.toContain('Rewritten by AI');
    expect(saved.join('')).not.toContain('Rewritten by AI');
  });
  it('tests streaming tools and rejects plain text success', async () => {
    expect(await testAIConnection(config)).toEqual({ success: true });
    mode = 'plain';
    expect(await testAIConnection(config)).toEqual({
      success: false,
      error: 'unsupported-tools',
    });
  });
  it.each([
    'openai',
    'anthropic',
    'ollama',
    'custom',
  ] as const)('tests %s using its real SDK protocol and configured base URL', async (provider) => {
    expect(
      await testAIConnection({ ...config, provider, apiKey: 'local-test-key' })
    ).toEqual({ success: true });
    expect(received.model).toBe('local-test');
  });
  it('stops even before the first fetch and never sends the queued request', async () => {
    const editor = makeEditor();
    const { dispose } = recordCommitted(editor);
    const ai = editor.getExtension(AIExtension)!;
    ai.openAIMenuAtBlock('p1');
    const running = ai.invokeAI({ userPrompt: 'Rewrite' });
    await abortAIEditorRequest(editor);
    await running;
    expect(received).toEqual({});
    dispose();
  });
  it('returns a safe authentication diagnostic', async () => {
    mode = 'auth';
    expect(await testAIConnection(config)).toEqual({
      success: false,
      error: 'authentication',
    });
  });
  it('propagates editor cancellation to the upstream request', async () => {
    mode = 'wait';
    const editor = makeEditor();
    const { dispose, saved } = recordCommitted(editor);
    const ai = editor.getExtension(AIExtension)!;
    ai.openAIMenuAtBlock('p1');
    const running = ai.invokeAI({ userPrompt: 'Rewrite' });
    await expect.poll(() => received?.model).toBe('local-test');
    await abortAIEditorRequest(editor);
    await running;
    await expect.poll(() => upstreamClosed).toBe(true);
    ai.rejectChanges();
    dispose();
    expect(saved.join('')).not.toContain('Rewritten by AI');
  });
});
