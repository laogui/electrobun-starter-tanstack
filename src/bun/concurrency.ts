/** Default fan-out for filesystem-heavy loops (keeps well under EMFILE). */
export const FS_CONCURRENCY = 16;

/**
 * `Promise.all(items.map(fn))` with at most `limit` calls in flight. Results
 * keep input order; the first rejection rejects the whole call (remaining
 * workers stop picking up new items).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next;
      next += 1;
      try {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        results[index] = await fn(items[index] as T, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    worker
  );
  await Promise.all(workers);
  return results;
}
