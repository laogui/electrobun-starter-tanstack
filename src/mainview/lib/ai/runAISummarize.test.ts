import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIRunTaskResponse } from '../../../shared/ai/types';
import { useAIPanelStore } from '../../store/aiPanelStore';
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
  rpcRunAITask: rpcRunAITaskMock,
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
  canvasState.activeViewId = 'view-a';
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
});
