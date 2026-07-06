let suppressedUntil = 0;

/** Suppress persisting viewport changes triggered by programmatic camera moves. */
export function suppressViewportPersist(ms: number): void {
  suppressedUntil = Date.now() + ms;
}

/** Whether the next viewport update should be written to the manifest. */
export function shouldPersistViewport(): boolean {
  return Date.now() >= suppressedUntil;
}

/** Test helper — reset suppression state between cases. */
export function resetViewportPersistSuppression(): void {
  suppressedUntil = 0;
}
