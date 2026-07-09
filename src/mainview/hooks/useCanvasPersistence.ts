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

async function saveManifestNow(viewId: string): Promise<boolean> {
  const { nodes, edges } = useCanvasStore.getState();
  const sanitized = sanitizeForPersistence(nodes, edges);
  try {
    const result = await rpcSaveManifest(
      viewId,
      sanitized.nodes,
      sanitized.edges
    );
    if (result?.success) {
      clearPendingFlushBackup(viewId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[persistence] Failed to flush manifest:', error);
    return false;
  }
}

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
  return saveManifestNow(viewId);
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
    let scheduledTimer: ReturnType<typeof setTimeout> | null = null;
    let scheduledViewId: string | null = null;
    const flushAndMarkClean = () => {
      flushNow(pendingTimer, viewIdRef.current).then((success) => {
        if (success) {
          dirty.current = false;
        }
      });
    };
    const scheduleFlush = () => {
      if (scheduledTimer) {
        clearTimeout(scheduledTimer);
      }
      scheduledTimer = setTimeout(() => {
        scheduledTimer = null;
        scheduledViewId = null;
        flushAndMarkClean();
      }, LAYOUT_DEBOUNCE_MS);
      scheduledViewId = viewIdRef.current;
      pendingTimer.current = scheduledTimer;
    };

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
          // Nodes/edges only — viewport is session-memory and not disk-backed.
          useCanvasStore.setState({
            nodes: backup.nodes,
            edges: backup.edges,
          });
          dirty.current = true;
        }
      }

      if (available && earlyDirty) {
        dirty.current = true;
        scheduleFlush();
      }
    });

    const unsub = useCanvasStore.subscribe((state, prevState) => {
      const layoutChanged =
        state.nodes !== prevState?.nodes || state.edges !== prevState.edges;

      if (!layoutChanged) {
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

      scheduleFlush();
    });

    const handleFlush = () => {
      if (!(isAvailable.current && dirty.current)) {
        return;
      }
      flushAndMarkClean();
    };

    const handleBeforeUnload = () => {
      if (dirty.current) {
        const { nodes, edges } = useCanvasStore.getState();
        writePendingFlushBackup(viewIdRef.current, {
          nodes,
          edges,
        });
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
      if (scheduledTimer) {
        const viewId = scheduledViewId;
        clearTimeout(scheduledTimer);
        if (viewId) {
          saveManifestNow(viewId).catch(() => undefined);
        }
      }
      scheduledTimer = null;
      scheduledViewId = null;
    };
  }, []);
}
