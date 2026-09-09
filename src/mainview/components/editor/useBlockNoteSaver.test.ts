// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishNoteMetadataChanges } from '@/lib/noteMetadataProjection';
import { useBlockNoteSaver } from './useBlockNoteSaver';

const mocks = vi.hoisted(() => ({ save: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/rpc', () => ({ rpcSaveBlockNote: mocks.save }));
vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: { updateNodeData: typeof mocks.update }) => unknown
  ) => selector({ updateNodeData: mocks.update }),
}));
const change = {
  id: 'note-a',
  before: { title: 'Before', color: 'white', revision: 4 },
  after: { title: 'Plugin', color: 'blue', revision: 5 },
  metadataOnly: true,
};
const payload = (markdown: string) => ({
  blocks: [{ text: markdown }],
  markdown,
});
const setup = (title = 'Before') => {
  const status = vi.fn();
  const hook = renderHook(() =>
    useBlockNoteSaver({
      nodeId: 'placement',
      noteId: 'note-a',
      frontmatter: { title, color: 'white', custom: 'retained' },
      onSaveStatusChange: status,
    })
  );
  act(() => hook.result.current.setInitialRevision(4));
  return { ...hook, status };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.save.mockResolvedValue({ success: true, revision: 6 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('metadata-aware BlockNote saver', () => {
  it('saves initial canonical metadata rather than stale placement props with the loaded revision', async () => {
    const { result, rerender } = setup('Stale title');
    act(() =>
      result.current.setInitialRevision(5, {
        title: 'Canonical title',
        color: 'blue',
      })
    );
    rerender();
    act(() => {
      result.current.saveDebounced(payload('Body draft'));
      result.current.flushNow();
    });
    expect(mocks.save).toHaveBeenCalledWith(
      'note-a',
      expect.objectContaining({ title: 'Canonical title', color: 'blue' }),
      [{ text: 'Body draft' }],
      'Body draft',
      5
    );
    await act(async () => {
      await Promise.resolve();
    });
  });
  it('rebases title and color synchronously while retaining the latest dirty body', async () => {
    const { result } = setup();
    const latest = payload('latest dirty body');
    act(() => {
      result.current.saveDebounced(payload('older body'));
      result.current.saveDebounced(latest);
      publishNoteMetadataChanges([change]);
      result.current.flushNow();
    });
    expect(mocks.save).toHaveBeenCalledWith(
      'note-a',
      { title: 'Plugin', color: 'blue', custom: 'retained' },
      latest.blocks,
      latest.markdown,
      5
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.update).toHaveBeenCalledWith(
      'placement',
      expect.objectContaining({
        content: latest.markdown,
        blocknoteRevision: 6,
      })
    );
  });

  it('does not let a stale React render overwrite rebased frontmatter before a pending flush', async () => {
    const { result, rerender } = setup();
    act(() => {
      result.current.saveDebounced(payload('dirty'));
      publishNoteMetadataChanges([change]);
    });
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(mocks.save.mock.calls[0]?.[1]).toMatchObject({
      title: 'Plugin',
      color: 'blue',
    });
    expect(mocks.save.mock.calls[0]?.[4]).toBe(5);
  });

  it.each([
    { ...change, metadataOnly: false },
    {
      ...change,
      before: { ...change.before, revision: 2 },
      after: { ...change.after, revision: 3 },
    },
    {
      ...change,
      before: { ...change.before, revision: 5 },
      after: { ...change.after, revision: 6 },
    },
  ])('does not rebase a body, stale, or noncontiguous notification: %j', async (notification) => {
    const { result } = setup();
    act(() => {
      result.current.saveDebounced(payload('dirty'));
      publishNoteMetadataChanges([notification]);
      result.current.flushNow();
    });
    expect(mocks.save.mock.calls[0]?.[4]).toBe(4);
    expect(mocks.save.mock.calls[0]?.[1]).toMatchObject({
      title: 'Before',
      color: 'white',
    });
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('serializes writes and consumes an acknowledgement even after newer edits and another flush', async () => {
    let acknowledge!: (value: { success: boolean; revision: number }) => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        })
    );
    const { result, status } = setup();
    act(() => {
      result.current.saveDebounced(payload('first'));
      result.current.flushNow();
      result.current.saveDebounced(payload('second'));
      result.current.flushNow();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => {
      acknowledge({ success: true, revision: 5 });
    });
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1]?.slice(2)).toEqual([
      payload('second').blocks,
      'second',
      5,
    ]);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0]?.[1]).toMatchObject({
      content: 'second',
      blocknoteRevision: 6,
    });
    expect(status).toHaveBeenLastCalledWith('saved');
  });

  it('vetoes props projection for an editor-local title conflict and preserves dirty data after rejection', async () => {
    mocks.save.mockResolvedValue({ success: false });
    const { result, status } = setup('Local title draft');
    act(() => {
      result.current.saveDebounced(payload('unsaved body'));
      expect(publishNoteMetadataChanges([change])).toEqual([]);
      result.current.flushNow();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.save.mock.calls[0]?.[1]).toMatchObject({
      title: 'Local title draft',
      color: 'white',
    });
    expect(mocks.save.mock.calls[0]?.[4]).toBe(4);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith('error');
    await act(async () => {
      result.current.flushNow();
    });
    expect(mocks.save.mock.calls[1]?.slice(2)).toEqual([
      payload('unsaved body').blocks,
      'unsaved body',
      4,
    ]);
  });

  it('retains the latest draft when an in-flight write fails', async () => {
    let reject!: (value: { success: boolean }) => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          reject = resolve;
        })
    );
    const { result, status } = setup();
    act(() => {
      result.current.saveDebounced(payload('first'));
      result.current.flushNow();
      result.current.saveDebounced(payload('latest'));
    });
    await act(async () => {
      reject({ success: false });
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith('error');
    await act(async () => {
      result.current.flushNow();
    });
    expect(mocks.save.mock.calls[1]?.[3]).toBe('latest');
    expect(mocks.save.mock.calls[1]?.[4]).toBe(4);
  });
});
