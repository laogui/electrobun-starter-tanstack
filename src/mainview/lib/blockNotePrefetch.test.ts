import { describe, expect, it, vi } from 'vitest';

vi.mock('./rpc', () => ({ rpcLoadBlockNote: vi.fn() }));

import {
  type BlockNoteLoadResult,
  createBlockNotePrefetchCache,
} from './blockNotePrefetch';

const ok = (revision: number): BlockNoteLoadResult => ({
  success: true,
  revision,
});

function setup(ttlMs = 1000) {
  let clock = 0;
  let revision = 0;
  const load = vi.fn((_noteId: string) => Promise.resolve(ok(++revision)));
  const cache = createBlockNotePrefetchCache({
    load,
    now: () => clock,
    ttlMs,
  });
  return {
    advance: (ms: number) => {
      clock += ms;
    },
    cache,
    load,
  };
}

// Data integrity: the focused editor must never start from a stale revision
// because of the open-time prefetch.
describe('blockNotePrefetch cache', () => {
  it('serves the prefetched request to the next load and only once', async () => {
    const { cache, load } = setup();
    cache.prefetch('a');
    cache.prefetch('a');
    expect(load).toHaveBeenCalledTimes(1);

    await expect(cache.load('a')).resolves.toEqual(ok(1));
    expect(load).toHaveBeenCalledTimes(1);

    // Single-use: a second mount loads fresh.
    await expect(cache.load('a')).resolves.toEqual(ok(2));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ignores expired entries', async () => {
    const { advance, cache, load } = setup(500);
    cache.prefetch('a');
    advance(501);
    expect(cache.has('a')).toBe(false);
    await expect(cache.load('a')).resolves.toEqual(ok(2));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('drops the entry when the note is saved or changed externally', async () => {
    const { cache, load } = setup();
    cache.prefetch('a');
    cache.prefetch('b');
    cache.invalidate('a');
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    await expect(cache.load('a')).resolves.toEqual(ok(3));
    expect(load).toHaveBeenCalledTimes(3);
    cache.clear();
    expect(cache.has('b')).toBe(false);
  });

  it('falls back to a fresh request when the prefetch rejects', async () => {
    const load = vi
      .fn<(noteId: string) => Promise<BlockNoteLoadResult>>()
      .mockRejectedValueOnce(new Error('rpc down'))
      .mockResolvedValueOnce(ok(7));
    const cache = createBlockNotePrefetchCache({ load });
    cache.prefetch('a');
    await expect(cache.load('a')).resolves.toEqual(ok(7));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('survives a loader that throws synchronously', async () => {
    const load = vi
      .fn<(noteId: string) => Promise<BlockNoteLoadResult>>()
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockResolvedValueOnce(ok(1));
    const cache = createBlockNotePrefetchCache({ load });
    expect(() => cache.prefetch('a')).not.toThrow();
    await expect(cache.load('a')).resolves.toEqual(ok(1));
  });

  it('ignores empty note ids', () => {
    const { cache, load } = setup();
    cache.prefetch('');
    expect(load).not.toHaveBeenCalled();
  });
});
