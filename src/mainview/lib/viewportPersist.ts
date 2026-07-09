let suppressedUntil = 0;

/**
 * Suppress writing the next viewport updates to the in-memory session cache.
 * Used around programmatic camera moves (search jump, focus, export fit) so
 * they do not become the view's "last intentional" pan/zoom for the session.
 */
export function suppressViewportPersist(ms: number): void {
  suppressedUntil = Date.now() + ms;
}

/** Whether the next viewport update should update the session camera cache. */
export function shouldPersistViewport(): boolean {
  return Date.now() >= suppressedUntil;
}

/** Test helper — reset suppression state between cases. */
export function resetViewportPersistSuppression(): void {
  suppressedUntil = 0;
}
