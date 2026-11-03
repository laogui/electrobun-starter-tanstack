import { rpcLoadBlockNote } from './rpc';

/**
 * Short-lived cache of in-flight `loadBlockNote` requests started when a note
 * open is initiated, so the focused editor (mounted after the open animation)
 * finds its body already loaded instead of issuing its own request.
 *
 * Correctness rules:
 * - Entries are single-use: `take` removes the entry, so every editor mount
 *   gets either the prefetched response or a fresh request — never a reused
 *   response from an earlier session.
 * - Entries expire after `ttlMs`; an expired entry is ignored.
 * - Saves and external body changes `invalidate` the note, so the editor
 *   never starts from a revision older than the latest save it raced with.
 * - A rejected prefetch falls back to a fresh request.
 */

export type BlockNoteLoadResult = Awaited<ReturnType<typeof rpcLoadBlockNote>>;

export const BLOCKNOTE_PREFETCH_TTL_MS = 4000;

interface Entry {
  createdAt: number;
  epoch: number;
  id: string;
  promise: Promise<BlockNoteLoadResult>;
  timer?: ReturnType<typeof setTimeout>;
  valid: boolean;
}

export interface BlockNotePrefetchCacheOptions {
  load: (noteId: string) => Promise<BlockNoteLoadResult>;
  now?: () => number;
  ttlMs?: number;
}

export interface BlockNotePrefetchCache {
  beginSave(noteId: string): () => void;
  clear(): void;
  /** True while a fresh entry exists (does not consume it). */
  has(noteId: string): boolean;
  invalidate(noteId: string): void;
  /** Consume the prefetched request if fresh, otherwise issue a new one. */
  load(noteId: string): Promise<BlockNoteLoadResult>;
  /** Start (or keep) a request for `noteId`. Idempotent while fresh. */
  prefetch(noteId: string): void;
  /** Remove and return a fresh prefetched request, or null. */
  take(noteId: string): Promise<BlockNoteLoadResult> | null;
}

export function createBlockNotePrefetchCache({
  load,
  now = Date.now,
  ttlMs = BLOCKNOTE_PREFETCH_TTL_MS,
}: BlockNotePrefetchCacheOptions): BlockNotePrefetchCache {
  const entries = new Map<string, Entry>();
  const pending = new Set<Entry>();
  let epoch = 0;
  const saves = new Map<string, Set<Promise<void>>>();
  const dispose = (entry: Entry) => {
    clearTimeout(entry.timer);
    pending.delete(entry);
    if (entries.get(entry.id) === entry) {
      entries.delete(entry.id);
    }
  };
  const request = (id: string): Entry => {
    let promise: Promise<BlockNoteLoadResult>;
    try {
      const waiting = saves.get(id);
      const started = epoch;
      promise = waiting?.size
        ? Promise.all([...waiting]).then(() => {
            if (started !== epoch) {
              throw new Error('Note load canceled after workspace change');
            }
            return load(id);
          })
        : load(id);
    } catch (error) {
      promise = Promise.reject(error);
    }
    promise.catch(() => undefined);
    const entry: Entry = { id, epoch, valid: true, createdAt: now(), promise };
    pending.add(entry);
    return entry;
  };
  const fresh = (id: string): Entry | null => {
    const entry = entries.get(id);
    if (!entry) {
      return null;
    }
    if (!entry.valid || now() - entry.createdAt > ttlMs) {
      dispose(entry);
      return null;
    }
    return entry;
  };
  const consume = async (
    initial: Entry,
    retryFailure: boolean
  ): Promise<BlockNoteLoadResult> => {
    let entry = initial;
    let canRetryFailure = retryFailure;
    // Recheck after the read, including a request already handed to the editor.
    // Never retry across workspaces: the same note ID may mean different data.
    for (;;) {
      let result: BlockNoteLoadResult | undefined;
      let failed = false;
      let failure: unknown;
      try {
        result = await entry.promise;
      } catch (error) {
        failed = true;
        failure = error;
      } finally {
        dispose(entry);
      }
      if (entry.epoch !== epoch) {
        throw new Error('Note load canceled after workspace change');
      }
      if (!entry.valid || (failed && canRetryFailure)) {
        canRetryFailure = false;
        entry = request(entry.id);
        continue;
      }
      if (failed) {
        throw failure;
      }
      return result!;
    }
  };
  const take = (id: string): Promise<BlockNoteLoadResult> | null => {
    const entry = fresh(id);
    if (!entry) {
      return null;
    }
    entries.delete(id);
    clearTimeout(entry.timer);
    return consume(entry, true);
  };
  const invalidate = (id: string) => {
    for (const entry of pending) {
      if (entry.id === id) {
        entry.valid = false;
      }
    }
    const cached = entries.get(id);
    if (cached) {
      dispose(cached);
    }
  };
  return {
    beginSave(id) {
      invalidate(id);
      const started = epoch;
      let done!: () => void;
      const barrier = new Promise<void>((resolve) => {
        done = resolve;
      });
      const group = saves.get(id) ?? new Set<Promise<void>>();
      group.add(barrier);
      saves.set(id, group);
      return () => {
        if (!group.delete(barrier)) {
          return;
        }
        if (epoch === started) {
          if (!group.size) {
            saves.delete(id);
          }
          invalidate(id);
        }
        done();
      };
    },
    clear() {
      epoch += 1;
      saves.clear();
      for (const entry of pending) {
        entry.valid = false;
        dispose(entry);
      }
      entries.clear();
    },
    has: (id) => fresh(id) !== null,
    invalidate,
    load: (id) => take(id) ?? consume(request(id), false),
    prefetch(id) {
      if (!id || fresh(id)) {
        return;
      }
      const entry = request(id);
      entries.set(id, entry);
      // Expire unconsumed entries even if that note is never opened again.
      entry.timer = setTimeout(() => dispose(entry), ttlMs);
    },
    take,
  };
}

const sharedCache = createBlockNotePrefetchCache({
  load: (noteId) => rpcLoadBlockNote(noteId),
});

export const prefetchBlockNote = (noteId: string): void =>
  sharedCache.prefetch(noteId);
export const loadBlockNoteWithPrefetch = (
  noteId: string
): Promise<BlockNoteLoadResult> => sharedCache.load(noteId);
export const invalidateBlockNotePrefetch = (noteId: string): void =>
  sharedCache.invalidate(noteId);
export const clearBlockNotePrefetch = (): void => sharedCache.clear();

/** Prefetch the body of a focusable note from its node data, if it has one. */
export function prefetchBlockNoteForData(
  data: Record<string, unknown> | undefined
): void {
  const noteId = data?.noteId;
  if (typeof noteId === 'string' && noteId) {
    prefetchBlockNote(noteId);
  }
}

/** Hold new editor reads until every write for the note has acknowledged. */
export async function withBlockNoteSave<T>(
  ids: readonly string[],
  save: () => Promise<T>
): Promise<T> {
  const finishes = [...new Set(ids)].map((id) => sharedCache.beginSave(id));
  try {
    return await save();
  } finally {
    for (const finish of finishes) {
      finish();
    }
  }
}
