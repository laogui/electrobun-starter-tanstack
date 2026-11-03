import { expect, it, vi } from 'vitest';
import {
  RpcTimeoutError,
  rpcRequestTimeoutMs,
  withRpcErrorFeedback,
  withRpcRequestTimeouts,
} from '../../mainview/lib/rpcErrorFeedback';
import { withRpcWriteValidation } from './writeParamSchemas';

it('rejects invalid writes as structured failures, reports once and never runs the handler', async () => {
  const handler = vi.fn(async (_params: unknown) => ({ success: true }));
  const report = vi.fn();
  const wrapped = withRpcErrorFeedback(
    withRpcWriteValidation({ saveManifest: handler }),
    report
  );
  const result = await wrapped.saveManifest({
    viewId: 'v',
    nodes: [{ id: 'bad', data: null }],
    edges: [],
  });
  expect(result).toMatchObject({
    success: false,
    error: 'invalid-params',
    method: 'saveManifest',
  });
  expect(handler).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalledOnce();
});
it('allows editor writes without the unused Markdown mirror', async () => {
  const handler = vi.fn(async (_params: unknown) => ({ success: true }));
  await withRpcWriteValidation({ saveBlockNote: handler }).saveBlockNote({
    noteId: 'n',
    frontmatter: {},
    blocks: [],
    revision: 1,
  });
  expect(handler).toHaveBeenCalledOnce();
});
it('a timed-out save never becomes a successful caller result or retries the host write', async () => {
  vi.useFakeTimers();
  try {
    let complete: (value: { success: boolean }) => void = () => undefined;
    const write = vi.fn(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          complete = resolve;
        })
    );
    const report = vi.fn();
    const saved = vi.fn();
    const rpc = withRpcRequestTimeouts(
      { saveManifest: write },
      report,
      () => 10
    );
    const result = rpc.saveManifest().then(saved, (error) => error);
    await vi.advanceTimersByTimeAsync(11);
    expect(await result).toBeInstanceOf(RpcTimeoutError);
    complete({ success: true });
    await Promise.resolve();
    expect(saved).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledOnce();
    expect(rpcRequestTimeoutMs('importMarkdownFiles')).toBeGreaterThan(
      rpcRequestTimeoutMs('saveManifest')
    );
  } finally {
    vi.useRealTimers();
  }
});
it('rejects malformed folder children before writing while preserving extension-owned children', async () => {
  const handler = vi.fn(async (_params: unknown) => ({ success: true }));
  const rpc = withRpcWriteValidation({ saveManifest: handler });
  const params = {
    viewId: 'v',
    edges: [],
    nodes: [
      {
        id: 'folder',
        type: 'folder',
        position: { x: 0, y: 0 },
        data: { children: [null] },
      },
    ],
  };
  expect(await rpc.saveManifest(params)).toMatchObject({ success: false });
  expect(handler).not.toHaveBeenCalled();
  await rpc.saveManifest({
    ...params,
    nodes: [{ ...params.nodes[0], type: 'extension' }],
  });
  expect(handler).toHaveBeenCalledOnce();
});
