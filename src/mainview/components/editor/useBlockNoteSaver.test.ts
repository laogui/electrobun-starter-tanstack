// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishNoteMetadataChanges } from '@/lib/noteMetadataProjection';
import { useBlockNoteSaver } from './useBlockNoteSaver';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/rpc', () => ({
  rpcLoadBlockNote: mocks.load,
  rpcSaveBlockNote: mocks.save,
}));
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
  act(() => hook.result.current.setInitialRevision(4, undefined, 'workspace'));
  return { ...hook, status };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.save.mockResolvedValue({ success: true, revision: 6 });
  mocks.load.mockResolvedValue({
    blocks: [{ text: 'Saved body' }],
    frontmatter: { color: 'blue', title: 'Saved title' },
    preview: {
      blocks: 1,
      excerpt: 'Saved body',
      html: '<p>Saved body</p>',
      version: 1,
    },
    revision: 5,
    success: true,
    text: 'Saved body',
    workspaceId: 'workspace',
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('metadata-aware BlockNote saver', () => {
  it('does not accept a body refresh over unsaved metadata props', () => {
    const { result } = setup('Local title');
    expect(result.current.canApplyExternal(5, change)).toBe(false);
  });

  it('protects edits immediately before serialization and never flushes an older payload as the newer draft', async () => {
    const { result } = setup();
    expect(result.current.canApplyExternal(5)).toBe(true);
    expect(result.current.canApplyExternal(3)).toBe(false);
    act(() => {
      result.current.saveDebounced(payload('Older serialized body'));
      result.current.markDirty();
      result.current.flushNow();
    });
    expect(result.current.canApplyExternal(5)).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => {
      result.current.saveDebounced(payload('Newest body'));
      result.current.flushNow();
      await Promise.resolve();
    });
    expect(mocks.save.mock.calls[0]?.[3]).toBe('Newest body');
    expect(result.current.canApplyExternal(7)).toBe(true);
  });

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

  it('loads the canonical version and stops automatic retries after a revision conflict', async () => {
    mocks.save.mockResolvedValue({
      conflict: true,
      revision: 5,
      success: false,
    });
    const { result, status } = setup();
    const draft = payload('Unsaved rich body');
    act(() => {
      result.current.saveDebounced(draft);
      publishNoteMetadataChanges([{ ...change, metadataOnly: false }]);
      result.current.flushNow();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.save.mock.calls[0]?.slice(2)).toEqual([
      draft.blocks,
      draft.markdown,
      4,
    ]);
    expect(status).toHaveBeenLastCalledWith('conflict');
    expect(mocks.update).not.toHaveBeenCalled();
    await act(async () => {
      result.current.flushNow();
    });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.load).toHaveBeenCalledWith('note-a', 'workspace');
    expect(result.current.conflict).toEqual({
      status: 'ready',
      snapshot: expect.objectContaining({
        noteId: 'note-a',
        revision: 5,
        text: 'Saved body',
        title: 'Saved title',
      }),
    });
  });

  it('keeps the local draft through a compare-and-swap against the loaded revision', async () => {
    mocks.save
      .mockResolvedValueOnce({ success: false, conflict: true, revision: 5 })
      .mockResolvedValueOnce({ success: true, revision: 6 });
    const { result, status } = setup();
    const draft = payload('My draft');
    act(() => {
      result.current.saveDebounced(draft);
      result.current.flushNow();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.conflict?.status).toBe('ready');

    await act(async () => {
      await result.current.keepLocalVersion();
    });

    expect(mocks.save.mock.calls.map((call) => call[4])).toEqual([4, 5]);
    expect(mocks.save.mock.calls[1]?.slice(2, 4)).toEqual([
      draft.blocks,
      draft.markdown,
    ]);
    expect(result.current.conflict).toBeNull();
    expect(status).toHaveBeenLastCalledWith('saved');
  });

  it('waits for the latest conflict draft serialization before enabling keep-local', async () => {
    mocks.save.mockResolvedValueOnce({
      success: false,
      conflict: true,
      revision: 5,
    });
    const { result } = setup();
    act(() => {
      result.current.saveDebounced(payload('Initial draft'));
      result.current.flushNow();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.conflict?.status).toBe('ready');
    expect(result.current.conflictDraftReady).toBe(true);

    act(() => result.current.markDirty());
    expect(result.current.conflictDraftReady).toBe(false);
    await act(async () => {
      await result.current.keepLocalVersion();
    });
    expect(mocks.save).toHaveBeenCalledOnce();

    act(() => result.current.saveDebounced(payload('Newest draft')));
    expect(result.current.conflictDraftReady).toBe(true);
  });

  it('returns to conflict state when keeping the draft loses a second race', async () => {
    mocks.save
      .mockResolvedValueOnce({ success: false, conflict: true, revision: 5 })
      .mockResolvedValueOnce({ success: false, conflict: true, revision: 6 });
    mocks.load
      .mockResolvedValueOnce({
        blocks: [{ text: 'First saved body' }],
        frontmatter: { color: 'blue', title: 'First saved title' },
        preview: {
          blocks: 1,
          excerpt: 'First saved body',
          html: '<p>First saved body</p>',
          version: 1,
        },
        revision: 5,
        success: true,
        text: 'First saved body',
        workspaceId: 'workspace',
      })
      .mockResolvedValueOnce({
        blocks: [{ text: 'Newer saved body' }],
        frontmatter: { color: 'purple', title: 'Newer saved title' },
        preview: {
          blocks: 1,
          excerpt: 'Newer saved body',
          html: '<p>Newer saved body</p>',
          version: 1,
        },
        revision: 6,
        success: true,
        text: 'Newer saved body',
        workspaceId: 'workspace',
      });
    const { result, status } = setup();
    act(() => {
      result.current.saveDebounced(payload('My draft'));
      result.current.flushNow();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.keepLocalVersion();
    });

    expect(mocks.save.mock.calls.map((call) => call[4])).toEqual([4, 5]);
    expect(result.current.conflict).toEqual({
      status: 'ready',
      snapshot: expect.objectContaining({
        revision: 6,
        text: 'Newer saved body',
      }),
    });
    expect(status).toHaveBeenLastCalledWith('conflict');
  });

  it('discards the local draft only after applying the loaded saved version', async () => {
    mocks.save.mockResolvedValueOnce({
      success: false,
      conflict: true,
      revision: 5,
    });
    const { result, status } = setup();
    act(() => {
      result.current.saveDebounced(payload('My draft'));
      result.current.flushNow();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const apply = vi.fn();
    act(() => {
      result.current.acceptSavedVersion(apply);
      result.current.flushNow();
    });

    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 5, text: 'Saved body' })
    );
    expect(result.current.conflict).toBeNull();
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(status).toHaveBeenLastCalledWith('idle');
    expect(result.current.canApplyExternal(5)).toBe(true);
  });

  it('keeps the draft and allows retrying a failed canonical conflict read', async () => {
    mocks.save.mockResolvedValueOnce({
      success: false,
      conflict: true,
      revision: 5,
    });
    mocks.load.mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({
      blocks: [{ text: 'New saved body' }],
      frontmatter: { color: 'green', title: 'New saved title' },
      preview: {
        blocks: 1,
        excerpt: 'New saved body',
        html: '<p>New saved body</p>',
        version: 1,
      },
      revision: 6,
      success: true,
      text: 'New saved body',
      workspaceId: 'workspace',
    });
    const { result } = setup();
    act(() => {
      result.current.saveDebounced(payload('My draft'));
      result.current.flushNow();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.conflict).toEqual({
      revision: 5,
      status: 'load-error',
    });

    act(() => result.current.retryConflictLoad());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.conflict).toEqual({
      status: 'ready',
      snapshot: expect.objectContaining({
        revision: 6,
        text: 'New saved body',
      }),
    });
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
