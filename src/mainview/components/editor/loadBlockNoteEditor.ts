/**
 * Single entry point for the (large) BlockNote editor chunk so the lazy()
 * boundary and the idle preload share one dynamic import.
 */
type BlockNoteEditorModule = typeof import('./BlockNoteEditor');

let modulePromise: Promise<BlockNoteEditorModule> | null = null;

export function loadBlockNoteEditor(): Promise<BlockNoteEditorModule> {
  if (!modulePromise) {
    modulePromise = import('./BlockNoteEditor').catch((error: unknown) => {
      // Let a later open retry instead of caching the failure forever.
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

const IDLE_TIMEOUT_MS = 2000;
const FALLBACK_DELAY_MS = 1200;

/**
 * Warm the editor chunk once the app is idle so the first note open does not
 * pay for the download / parse during its animation. Returns a cancel fn.
 */
export function preloadBlockNoteEditorOnIdle(): () => void {
  const run = () => {
    loadBlockNoteEditor().catch(() => undefined);
  };
  if (typeof globalThis.requestIdleCallback === 'function') {
    const handle = globalThis.requestIdleCallback(run, {
      timeout: IDLE_TIMEOUT_MS,
    });
    return () => globalThis.cancelIdleCallback(handle);
  }
  const timer = setTimeout(run, FALLBACK_DELAY_MS);
  return () => clearTimeout(timer);
}
