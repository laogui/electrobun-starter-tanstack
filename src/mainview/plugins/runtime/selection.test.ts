import { describe, expect, it, vi } from 'vitest';
import type {
  NoteContentSnapshot,
  PlacementSelectionSnapshot,
  PluginContent,
} from '../../../../packages/plugin-sdk';
import {
  EMPTY_PLACEMENTS,
  PluginSelectionStore,
  SelectionSource,
} from './selection';

const note = (id: string, revision = 1): NoteContentSnapshot => ({
  id,
  kind: 'note',
  title: id,
  color: '',
  text: 'Persisted body',
  revision,
  source: 'sidecar',
});
const placements = (...ids: string[]): PlacementSelectionSnapshot => ({
  viewId: 'view',
  items: ids.map((id, index) => ({
    id: `p${index}`,
    content: { kind: 'note', id },
  })),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}
function fixture() {
  const source = new SelectionSource();
  const controller = new AbortController();
  const getMany = vi
    .fn<PluginContent['getMany']>()
    .mockImplementation(async (ids) => ids.map((id) => note(id)));
  const report = vi.fn();
  const selection = new PluginSelectionStore({
    source,
    signal: controller.signal,
    content: { getMany },
    report,
  });
  return { source, controller, getMany, report, selection };
}

describe('activation-owned selection snapshots', () => {
  it('captures, deduplicates and freezes canonical note reads rather than placement drafts', async () => {
    const f = fixture();
    const input = placements('b', 'a', 'a');
    f.source.set(input);
    const pending = deferred<(NoteContentSnapshot | null)[]>();
    f.getMany.mockReturnValueOnce(pending.promise);
    const reading = f.selection.get();
    f.source.set(placements('later'));
    const a = note('a');
    pending.resolve([a, note('b')]);
    const result = await reading;
    expect(f.getMany).toHaveBeenCalledWith(['a', 'b'], undefined);
    expect(result.map((item) => item.id)).toEqual(['a', 'b']);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    a.title = 'Changed elsewhere';
    expect(result[0]!.title).toBe('a');
    expect(f.selection.getPlacements().items[0]!.content!.id).toBe('later');
    expect(Object.isFrozen(f.selection.getPlacements().items[0]!.content)).toBe(
      true
    );
  });

  it('does not expand non-note placements or invent snapshots for missing notes', async () => {
    const f = fixture();
    f.source.set({
      viewId: 'view',
      items: [
        { id: 'widget', content: { kind: 'widget', id: 'w' } },
        { id: 'folder', content: null },
        { id: 'note', content: { kind: 'note', id: 'missing' } },
      ],
    });
    f.getMany.mockResolvedValueOnce([null]);
    expect(await f.selection.get()).toEqual([]);
    expect(f.getMany).toHaveBeenCalledWith(['missing'], undefined);
    expect(f.selection.getPlacements().items).toHaveLength(3);
  });

  it('stages subscriptions until publish and preserves stable snapshot identities', async () => {
    const f = fixture();
    const listener = vi.fn();
    const unsubscribe = f.selection.subscribe(listener);
    const before = f.selection.getSnapshot();
    f.source.set(placements('a'));
    expect(f.selection.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(f.getMany).not.toHaveBeenCalled();
    f.selection.publish();
    expect(f.selection.getSnapshot()).toMatchObject({
      status: 'loading',
      items: [],
    });
    await settle();
    const ready = f.selection.getSnapshot();
    expect(ready).toMatchObject({ status: 'ready', items: [{ id: 'a' }] });
    f.source.set(placements('a'));
    expect(f.selection.getSnapshot()).toBe(ready);
    expect(f.getMany).toHaveBeenCalledTimes(1);
    unsubscribe();
    listener.mockClear();
    f.source.set(EMPTY_PLACEMENTS);
    expect(listener).not.toHaveBeenCalled();
  });

  it('rejects obsolete async results and refreshes selected content without selection changes', async () => {
    const f = fixture();
    const old = deferred<(NoteContentSnapshot | null)[]>();
    f.getMany.mockReturnValueOnce(old.promise);
    f.source.set(placements('a'));
    f.selection.publish();
    await settle();
    const signal = f.getMany.mock.calls[0]![1]!.signal!;
    f.source.set(placements('b'));
    await settle();
    expect(signal.aborted).toBe(true);
    old.resolve([note('a')]);
    await settle();
    expect(f.selection.getSnapshot().items[0]!.id).toBe('b');
    const ready = f.selection.getSnapshot();
    f.selection.invalidate(['unselected']);
    expect(f.selection.getSnapshot()).toBe(ready);
    f.getMany.mockResolvedValueOnce([note('b', 2)]);
    f.selection.invalidate(['b']);
    expect(f.selection.getSnapshot().items).toEqual([]);
    await settle();
    expect(f.selection.getSnapshot().items[0]!.revision).toBe(2);
  });

  it('exposes errors without stale items and recovers on the next invalidation', async () => {
    const f = fixture();
    f.source.set(placements('a'));
    f.getMany.mockRejectedValueOnce(
      Object.assign(new Error('Corrupt note'), { code: 'corrupt-content' })
    );
    f.selection.publish();
    await settle();
    expect(f.selection.getSnapshot()).toMatchObject({
      status: 'error',
      items: [],
      error: { code: 'corrupt-content', message: 'Corrupt note' },
    });
    f.selection.invalidate(['a']);
    await settle();
    expect(f.selection.getSnapshot()).toMatchObject({
      status: 'ready',
      error: null,
      items: [{ id: 'a' }],
    });
  });

  it('stops observers on retirement and rejects late imperative results', async () => {
    const f = fixture();
    f.source.set(placements('a'));
    f.selection.publish();
    await settle();
    const pending = deferred<(NoteContentSnapshot | null)[]>();
    f.getMany.mockReturnValueOnce(pending.promise);
    const read = f.selection.get();
    const assertion = expect(read).rejects.toMatchObject({
      name: 'AbortError',
    });
    const listener = vi.fn();
    f.selection.subscribe(listener);
    f.controller.abort();
    f.source.set(placements('b'));
    pending.resolve([note('a')]);
    await assertion;
    expect(listener).not.toHaveBeenCalled();
    expect(f.selection.getSnapshot()).toMatchObject({
      status: 'error',
      items: [],
      placements: EMPTY_PLACEMENTS,
    });
    expect(() => f.selection.getPlacements()).toThrow();
    expect(() => f.selection.subscribe(listener)).toThrow();
  });

  it('honors caller cancellation even for an empty selection', async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      f.selection.get({ signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.getMany).not.toHaveBeenCalled();
  });

  it('owns duplicate subscriptions independently and respects unsubscribe during delivery', () => {
    const f = fixture();
    const listener = vi.fn();
    const first = f.selection.subscribe(listener);
    f.selection.subscribe(listener);
    first();
    f.selection.publish();
    expect(listener).toHaveBeenCalledTimes(1);
    const later = vi.fn();
    let stop = () => {};
    f.selection.subscribe(() => stop());
    stop = f.selection.subscribe(later);
    f.source.set({ viewId: 'another-view', items: [] });
    expect(later).not.toHaveBeenCalled();
  });

  it('isolates listener errors and reentrant retirement cannot start a late read', async () => {
    const f = fixture();
    f.source.set(placements('a'));
    f.selection.subscribe(() => {
      throw new Error('Listener failed');
    });
    f.selection.subscribe(() => f.controller.abort());
    const afterRetirement = vi.fn();
    f.selection.subscribe(afterRetirement);
    f.selection.publish();
    await settle();
    expect(afterRetirement).not.toHaveBeenCalled();
    expect(f.report).toHaveBeenCalledTimes(1);
    expect(f.getMany).not.toHaveBeenCalled();
  });
});
