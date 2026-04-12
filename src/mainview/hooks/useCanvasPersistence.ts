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
  pendingTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
) {
  if (pendingTimer.current) {
    clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
  }
  const { nodes, edges } = useCanvasStore.getState();
  const sanitized = sanitizeForPersistence(nodes, edges);
  rpcSaveManifest('default', sanitized.nodes, sanitized.edges).catch(
    (error) => {
      console.error('[persistence] Failed to flush manifest:', error);
    }
  );
}

export function useCanvasPersistence() {
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAvailable = useRef<boolean | null>(null);
  // Track whether we have changes since last save to avoid redundant writes
  const dirty = useRef(false);
  // Skip the first subscription fire caused by hydrate()
  const skipHydrate = useRef(true);

  useEffect(() => {
    let rpcReady = false;
    // Accumulated dirty flag for changes that arrive before RPC is ready
    let earlyDirty = false;

    isRpcAvailable().then((available) => {
      isAvailable.current = available;
      rpcReady = available;
      // If state changed before RPC was ready, schedule a save now
      if (available && earlyDirty) {
        dirty.current = true;
        pendingTimer.current = setTimeout(() => {
          flushNow(pendingTimer);
          dirty.current = false;
        }, LAYOUT_DEBOUNCE_MS);
      }
    });

    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (
        prevState &&
        state.nodes === prevState.nodes &&
        state.edges === prevState.edges
      )
        return;

      // Skip the write triggered by hydrate() loading data from disk
      if (skipHydrate.current) {
        skipHydrate.current = false;
        return;
      }

      dirty.current = true;

      // If RPC is not ready yet, remember that we have pending changes
      if (!rpcReady) {
        earlyDirty = true;
        return;
      }

      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
      }
      pendingTimer.current = setTimeout(() => {
        flushNow(pendingTimer);
        dirty.current = false;
      }, LAYOUT_DEBOUNCE_MS);
    });

    // Flush immediately when the window loses focus
    const handleFlush = () => {
      if (!isAvailable.current || !dirty.current) return;
      flushNow(pendingTimer);
      dirty.current = false;
    };

    // Flush on visibility change (e.g. switching tabs / hiding window)
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
      // Flush pending save on cleanup (e.g. HMR unmount) instead of dropping it
      if (pendingTimer.current && isAvailable.current && dirty.current) {
        flushNow(pendingTimer);
      } else if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
      }
    };
  }, []);
}
