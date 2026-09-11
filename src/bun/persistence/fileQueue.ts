import { resolve } from 'node:path';

const queues = new Map<string, Promise<unknown>>();

/**
 * Serializes read-modify-write cycles against one file so concurrent callers
 * cannot overwrite each other with a stale snapshot.
 *
 * This is deliberately thinner than `withNoteWorkspace`: no reentrancy and no
 * crash recovery, because the callers are single-file JSON stores rather than
 * multi-file note transactions. Do not nest calls for the same path.
 */
export function withFileQueue<T>(
  path: string,
  work: () => Promise<T>
): Promise<T> {
  const key = resolve(path);
  const pending = (queues.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(work);
  queues.set(key, pending);
  return pending.finally(() => {
    if (queues.get(key) === pending) {
      queues.delete(key);
    }
  });
}
