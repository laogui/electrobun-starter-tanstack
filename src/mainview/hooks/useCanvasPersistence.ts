import { useEffect, useRef } from 'react';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import {
  clearPendingFlushBackup,
  readPendingFlushBackup,
  writePendingFlushBackup,
} from '@/lib/pendingFlushBackup';
import { isRpcAvailable, rpcSaveManifest } from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';

const LAYOUT_DEBOUNCE_MS = 2500;

/**
 * Flush current canvas state to disk immediately.
 * Cancels any pending debounce timer. Returns success boolean.
 */
async function flushNow(
  pendingTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  viewId: string
): Promise<boolean> {
  if (pendingTimer.current) {
    clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
  }
  const { nodes, edges, viewport } = useCanvasStore.getState();
  const sanitized = sanitizeForPersistence(nodes, edges);
  try {
    await rpcSaveManifest(
      viewId,
      sanitized.nodes,
      sanitized.edges,
      viewport ?? undefined
    );
    clearPendingFlushBackup(viewId);
    return true;
  } catch (error) {
    console.error('[persistence] Failed to flush manifest:', error);
    return false;
  }
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

      // Restore from backup if present (only after hydration)
      if (available && skipHydrate.current) {
        const backup = readPendingFlushBackup(viewIdRef.current);
        if (backup) {
          console.log(
            '[persistence] Restoring from pending flush backup:',
            viewIdRef.current
          );
          useCanvasStore.setState({
            nodes: backup.nodes,
            edges: backup.edges,
            viewport: backup.viewport ?? undefined,
          });
          dirty.current = true;
        }
      }

      if (available && earlyDirty) {
        dirty.current = true;
        pendingTimer.current = setTimeout(() => {
          flushNow(pendingTimer, viewIdRef.current);
          dirty.current = false;
        }, LAYOUT_DEBOUNCE_MS);
      }
    });

    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (
        state.nodes === prevState?.nodes &&
        state.edges === prevState.edges &&
        state.viewport === prevState?.viewport
      ) {
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
      flushNow(pendingTimer, viewIdRef.current).catch(() => {});
      dirty.current = false;
    };

    const handleBeforeUnload = () => {
      if (dirty.current) {
        const { nodes, edges, viewport } = useCanvasStore.getState();
        writePendingFlushBackup(viewIdRef.current, { nodes, edges, viewport });
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleFlush();
      }
    };

    window.addEventListener('blur', handleFlush);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsub();
      window.removeEventListener('blur', handleFlush);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (pendingTimer.current && isAvailable.current && dirty.current) {
        flushNow(pendingTimer, viewIdRef.current).catch(() => {});
      } else if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
      }
    };
  }, []);
}
