import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIRunTaskResponse } from '../../../shared/ai/types';
import { EXTENSION_INSTANCE_SCHEMA } from '../../../shared/extensions/instance';
import { useAIPanelStore } from '../../store/aiPanelStore';
import { useExtensionInstanceStore } from '../../store/extensionInstanceStore';
import { runAISummarize } from './runAISummarize';

const { canvasState, rpcRunAITaskMock, toastInfoMock } = vi.hoisted(() => ({
  canvasState: {
    activeViewId: 'view-a',
    nodes: [
      {
        id: 'node-a',
        type: 'card',
        position: { x: 0, y: 0 },
        selected: true,
        data: { title: 'Seed', content: 'Seed content' },
      },
    ] as any[],
  },
  rpcRunAITaskMock: vi.fn(),
  toastInfoMock: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpcCloneExtensionInstance: vi.fn(),
  rpcCreateExtensionInstance: vi.fn(),
  rpcRunAITask: rpcRunAITaskMock,
  rpcUpdateExtensionInstance: vi.fn(),
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: {
    getState: () => canvasState,
  },
}));

vi.mock('sonner', () => ({
  toast: { info: toastInfoMock },
}));

function success(answer: string): AIRunTaskResponse {
  return {
    success: true,
    result: {
      task: 'summarize_selection',
      answer,
      actions: [
        {
          type: 'create_node',
          tempId: 'summary-card',
          nodeKind: 'card',
          position: { x: 430, y: 0 },
          data: { title: answer, content: answer },
        },
      ],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  useAIPanelStore.getState().close();
  useExtensionInstanceStore.setState({ records: {}, history: {} });
  canvasState.activeViewId = 'view-a';
  canvasState.nodes = [
    {
      id: 'node-a',
      type: 'card',
      position: { x: 0, y: 0 },
      selected: true,
      data: { title: 'Seed', content: 'Seed content' },
    },
  ];
  rpcRunAITaskMock.mockReset();
  toastInfoMock.mockReset();
});

describe('runAISummarize', () => {
  it('ignores a result from an older concurrent request', async () => {
    const first = deferred<AIRunTaskResponse>();
    const second = deferred<AIRunTaskResponse>();
    rpcRunAITaskMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstRun = runAISummarize();
    const secondRun = runAISummarize();

    first.resolve(success('old result'));
    await firstRun;
    expect(useAIPanelStore.getState().status).toBe('loading');

    second.resolve(success('new result'));
    await secondRun;

    expect(useAIPanelStore.getState().result?.answer).toBe('new result');
  });

  it('discards a result when the source view changes while waiting', async () => {
    const pending = deferred<AIRunTaskResponse>();
    rpcRunAITaskMock.mockReturnValue(pending.promise);

    const run = runAISummarize();
    canvasState.activeViewId = 'view-b';
    pending.resolve(success('stale result'));
    await run;

    expect(useAIPanelStore.getState().status).toBe('closed');
  });

  it('sends extension presentation in the summarize context', async () => {
    useExtensionInstanceStore.getState().hydrate({
      extinst_link1: {
        schema: EXTENSION_INSTANCE_SCHEMA,
        id: 'extinst_link1',
        canvasTypeId: 'ghostboard.web/link',
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:01:00.000Z',
        state: { url: 'https://secret.example', title: 'Secret' },
        presentation: {
          title: 'Example',
          plainText: 'Example\nhttps://example.com',
        },
      },
    });
    canvasState.nodes = [
      {
        id: 'ext-link-1',
        type: 'extension',
        position: { x: 0, y: 0 },
        selected: true,
        data: {
          canvasTypeId: 'ghostboard.web/link',
          instanceId: 'extinst_link1',
        },
      },
    ];
    rpcRunAITaskMock.mockResolvedValue(success('ok'));

    await runAISummarize();

    expect(rpcRunAITaskMock).toHaveBeenCalledWith({
      task: 'summarize_selection',
      context: {
        viewId: 'view-a',
        nodes: [
          expect.objectContaining({
            id: 'ext-link-1',
            nodeType: 'extension',
            title: 'Example',
            content: 'Example\nhttps://example.com',
          }),
        ],
      },
    });
    expect(
      rpcRunAITaskMock.mock.calls[0]?.[0].context.nodes[0]
    ).not.toMatchObject({ content: expect.stringContaining('secret.example') });
  });
});
