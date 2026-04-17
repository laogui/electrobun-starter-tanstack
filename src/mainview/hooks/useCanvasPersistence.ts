import { useEffect, useRef } from 'react';

import { isRpcAvailable, rpcSaveManifest } from '@/lib/rpc';
import { sanitizeForPersistence } from '@/lib/sanitize';
import { useCanvasStore } from '@/store/canvasStore';

const LAYOUT_DEBOUNCE_MS = 2500;

/**
 * Flush current canvas state to disk immediately.
 * Cancels any pending debounce timer. Fire-and-forget: errors are logged.
 */
function flushNow(
  pendingTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  viewId: string
) {
  if (pendingTimer.current) {
    clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
  }
  const { nodes, edges } = useCanvasStore.getState();
  const sanitized = sanitizeForPersistence(nodes, edges);
  rpcSaveManifest(viewId, sanitized.nodes, sanitized.edges).catch((error) => {
    console.error('[persistence] Failed to flush manifest:', error);
  });
}

export function useCanvasPersistence() {
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAvailable = useRef<boolean | null>(null);
  const dirty = useRef(false);
  const skipHydrate = useRef(true);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const viewIdRef = useRef(activeViewId);

  // Keep ref in sync on view change.
  // Do NOT flush here — the store has already been cleared to [] by setActiveView,
  // so flushing would overwrite the old canvas with empty data.
  // ViewSwitcher.handleSwitchView flushes BEFORE calling setActiveView.
  useEffect(() => {
    if (viewIdRef.current !== activeViewId) {
      // Cancel any pending debounce for the old view (data is already stale)
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      dirty.current = false;
      viewIdRef.current = activeViewId;
      skipHydrate.current = true;
    }
  }, [activeViewId]);

  useEffect(() => {
    let rpcReady = false;
    let earlyDirty = false;

    isRpcAvailable().then((available) => {
      isAvailable.current = available;
      rpcReady = available;
      if (available && earlyDirty) {
        dirty.current = true;
        pendingTimer.current = setTimeout(() => {
          flushNow(pendingTimer, viewIdRef.current);
          dirty.current = false;
        }, LAYOUT_DEBOUNCE_MS);
      }
    });

    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (state.nodes === prevState?.nodes && state.edges === prevState.edges) {
        return;
      }

      // Only persist once the canvas has been properly loaded
      if (!state._hydrated) {
        return;
      }

      if (skipHydrate.current) {
        skipHydrate.current = false;
        return;
      }

      dirty.current = true;

      if (!rpcReady) {
        earlyDirty = true;
        return;
      }

      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
      }
      pendingTimer.current = setTimeout(() => {
        flushNow(pendingTimer, viewIdRef.current);
        dirty.current = false;
      }, LAYOUT_DEBOUNCE_MS);
    });

    const handleFlush = () => {
      if (!(isAvailable.current && dirty.current)) {
        return;
      }
      flushNow(pendingTimer, viewIdRef.current);
      dirty.current = false;
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleFlush();
      }
    };

    window.addEventListener('blur', handleFlush);
    window.addEventListener('beforeunload', handleFlush);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsub();
      window.removeEventListener('blur', handleFlush);
      window.removeEventListener('beforeunload', handleFlush);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (pendingTimer.current && isAvailable.current && dirty.current) {
        flushNow(pendingTimer, viewIdRef.current);
      } else if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
      }
    };
  }, []);
}
