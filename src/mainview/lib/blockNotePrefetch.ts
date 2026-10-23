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
  promise: Promise<BlockNoteLoadResult>;
}

export interface BlockNotePrefetchCacheOptions {
  load: (noteId: string) => Promise<BlockNoteLoadResult>;
  now?: () => number;
  ttlMs?: number;
}

export interface BlockNotePrefetchCache {
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

  const fresh = (noteId: string): Entry | null => {
    const entry = entries.get(noteId);
    if (!entry) {
      return null;
    }
    if (now() - entry.createdAt > ttlMs) {
      entries.delete(noteId);
      return null;
    }
    return entry;
  };

  const take = (noteId: string) => {
    const entry = fresh(noteId);
    if (!entry) {
      return null;
    }
    entries.delete(noteId);
    return entry.promise;
  };

  return {
    clear() {
      entries.clear();
    },
    has(noteId) {
      return fresh(noteId) !== null;
    },
    invalidate(noteId) {
      entries.delete(noteId);
    },
    load(noteId) {
      const prefetched = take(noteId);
      if (!prefetched) {
        return load(noteId);
      }
      return prefetched.catch(() => load(noteId));
    },
    prefetch(noteId) {
      if (!noteId || fresh(noteId)) {
        return;
      }
      let promise: Promise<BlockNoteLoadResult>;
      try {
        promise = load(noteId);
      } catch (error) {
        promise = Promise.reject(error);
      }
      // Never surface an unhandled rejection for a prefetch nobody consumed;
      // the consumer still sees the rejection and retries.
      promise.catch(() => undefined);
      const entry: Entry = { createdAt: now(), promise };
      entries.set(noteId, entry);
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
