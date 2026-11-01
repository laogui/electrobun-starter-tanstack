/**
 * Bridge between the main process' quit-time `flushCanvas` request and the
 * persistence hook that owns the debounced manifest flush. The hook registers
 * its flusher on mount; the RPC handler awaits it before the app quits.
 */
type CanvasFlusher = () => Promise<boolean>;

let activeFlusher: CanvasFlusher | null = null;

export function registerCanvasFlusher(flusher: CanvasFlusher): () => void {
  activeFlusher = flusher;
  return () => {
    if (activeFlusher === flusher) {
      activeFlusher = null;
    }
  };
}

/** Flush pending canvas edits. Resolves `true` when nothing was left unsaved. */
export async function flushRegisteredCanvas(): Promise<boolean> {
  if (!activeFlusher) {
    return true;
  }
  try {
    return await activeFlusher();
  } catch (error) {
    console.error('[persistence] Quit flush failed:', error);
    return false;
  }
}
