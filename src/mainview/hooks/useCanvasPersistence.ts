import type { Edge, Node } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { registerCanvasFlusher } from '@/lib/canvasFlushRegistry';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import { confirmCanvasRecovery } from '@/lib/confirmCanvasRecovery';
import {
  archivePendingFlushBackup,
  clearPendingFlushBackup,
  readPendingFlushBackup,
  writePendingFlushBackup,
} from '@/lib/pendingFlushBackup';
import {
  isRpcAvailable,
  rpcGetWorkspaceInfo,
  rpcSaveManifest,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import * as m from '../../paraglide/messages.js';

const LAYOUT_DEBOUNCE_MS = 2500;

async function saveManifestNow(viewId: string): Promise<boolean> {
  const { activeViewId, edges, nodes, topicWritePaused, _hydrated } =
    useCanvasStore.getState();
  // Never write a canvas that is not the one in the store, was never loaded,
  // or is write-paused: any of those would overwrite the file with the wrong
  // (or empty) graph.
  if (topicWritePaused || !_hydrated || activeViewId !== viewId) {
    return false;
  }
  const sanitized = sanitizeForPersistence(nodes, edges);
  try {
    const result = await rpcSaveManifest(
      viewId,
      sanitized.nodes,
      sanitized.edges
    );
    if (result?.success) {
      const current = useCanvasStore.getState();
      if (
        current.activeViewId === viewId &&
        current.nodes === nodes &&
        current.edges === edges
      ) {
        clearPendingFlushBackup(viewId);
      }
      toast.dismiss(`canvas-save-${viewId}`);
      return true;
    }
    toast.error(
      result?.error === 'revision-conflict'
        ? m.toast_canvas_save_conflict()
        : m.toast_canvas_save_failed(),
      { id: `canvas-save-${viewId}`, duration: Number.POSITIVE_INFINITY }
    );
    return false;
  } catch (error) {
    console.error('[persistence] Failed to flush manifest:', error);
    toast.error(m.toast_canvas_save_failed(), {
      id: `canvas-save-${viewId}`,
      duration: Number.POSITIVE_INFINITY,
    });
    return false;
  }
}

/**
 * Debounced manifest persistence for the active canvas.
 *
 * Dirty tracking uses a monotonically increasing change version instead of a
 * boolean: a flush only marks the canvas clean up to the version it started
 * with, so edits made while the save RPC is in flight stay dirty and get
 * their own flush.
 */
export function useCanvasPersistence() {
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAvailable = useRef<boolean | null>(null);
  const changeVersion = useRef(0);
  const savedVersion = useRef(0);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const viewIdRef = useRef(activeViewId);

  // Keep ref in sync on view change.
  // Do NOT flush here — the store has already been cleared to [] by setActiveView,
  // so flushing would overwrite the old canvas with empty data.
  // switchView flushes BEFORE calling setActiveView.
  useEffect(() => {
    if (viewIdRef.current !== activeViewId) {
      // Cancel any pending debounce for the old view (data is already stale)
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      changeVersion.current = 0;
      savedVersion.current = 0;
      viewIdRef.current = activeViewId;
    }
  }, [activeViewId]);

  useEffect(() => {
    let rpcReady = false;
    let workspacePath = '';
    let baseGraph: string | undefined;
    const graphOf = (nodes: Node[], edges: Edge[]) =>
      JSON.stringify(sanitizeForPersistence(nodes, edges));
    const workspaceReady = rpcGetWorkspaceInfo()
      .then((info) => {
        workspacePath = info.path;
      })
      .catch(() => undefined);
    let earlyDirty = false;
    let disposed = false;
    let scheduledTimer: ReturnType<typeof setTimeout> | null = null;
    let scheduledViewId: string | null = null;
    const isDirty = () => changeVersion.current !== savedVersion.current;

    const clearScheduled = () => {
      if (scheduledTimer) {
        clearTimeout(scheduledTimer);
      }
      scheduledTimer = null;
      scheduledViewId = null;
      pendingTimer.current = null;
    };

    const flushAndMarkClean = async (): Promise<boolean> => {
      clearScheduled();
      const viewId = viewIdRef.current;
      const startVersion = changeVersion.current;
      const success = await saveManifestNow(viewId);
      // Only versions that were part of this save become clean; anything
      // edited during the RPC keeps the canvas dirty.
      if (
        success &&
        viewIdRef.current === viewId &&
        savedVersion.current < startVersion
      ) {
        savedVersion.current = startVersion;
      }
      return success;
    };

    const scheduleFlush = () => {
      if (scheduledTimer) {
        clearTimeout(scheduledTimer);
      }
      scheduledTimer = setTimeout(() => {
        scheduledTimer = null;
        scheduledViewId = null;
        pendingTimer.current = null;
        flushAndMarkClean().catch(() => undefined);
      }, LAYOUT_DEBOUNCE_MS);
      scheduledViewId = viewIdRef.current;
      pendingTimer.current = scheduledTimer;
    };

    const markChanged = () => {
      changeVersion.current += 1;
      if (!rpcReady) {
        earlyDirty = true;
        return;
      }
      scheduleFlush();
    };

    /**
     * Apply a crash/quit backup for `viewId` on top of the freshly hydrated
     * manifest. Runs strictly after hydrate (a restore before it would be
     * overwritten by the load) and only while the same view is still loaded.
     * A backup may belong to an older or different session. Preserve it and
     * compare its source/base before asking to replace the disk graph.
     */
    const restorePendingBackup = async (viewId: string) => {
      await workspaceReady;
      const state = useCanvasStore.getState();
      if (
        disposed ||
        !state._hydrated ||
        state.activeViewId !== viewId ||
        state.topicWritePaused ||
        state.canvasLoadError
      ) {
        return;
      }
      const backup = readPendingFlushBackup(viewId);
      if (!backup) {
        return;
      }
      try {
        archivePendingFlushBackup(viewId, backup);
      } catch {
        toast.error(m.toast_canvas_save_failed());
        return;
      }
      if (backup.workspacePath && backup.workspacePath !== workspacePath) {
        return;
      }
      const diskGraph = graphOf(state.nodes, state.edges);
      if (
        !(await confirmCanvasRecovery(
          m.canvas_pending_recovery_confirm({
            source: backup.workspacePath || m.canvas_recovery_unknown_source(),
            time: new Date(backup.savedAt).toLocaleString(),
            status:
              backup.baseGraph === diskGraph
                ? m.canvas_recovery_base_matches()
                : m.canvas_recovery_base_unknown(),
          })
        ))
      ) {
        return;
      }
      const latest = useCanvasStore.getState();
      if (
        disposed ||
        latest.topicWritePaused ||
        latest._canvasGeneration !== state._canvasGeneration ||
        latest.nodes !== state.nodes ||
        latest.edges !== state.edges
      ) {
        return;
      }
      baseGraph = diskGraph;
      // Nodes/edges only — viewport is session-memory and not disk-backed.
      // The resulting store change is picked up by the subscriber, which
      // marks the canvas dirty and schedules a save of the restored graph.
      latest.saveSnapshot();
      useCanvasStore.setState({
        focusedNode: null,
        focusedFolder: null,
        topicDraft: null,
        editingTopicId: null,
        topicCommandContextId: null,
        topicEditPreviews: {},
      });
      latest.hydrate(backup.nodes, backup.edges);
    };

    if (useCanvasStore.getState()._hydrated) {
      const current = useCanvasStore.getState();
      baseGraph = graphOf(current.nodes, current.edges);
    }
    isRpcAvailable().then((available) => {
      if (disposed) {
        return;
      }
      isAvailable.current = available;
      rpcReady = available;

      if (available && earlyDirty) {
        scheduleFlush();
      }
    });

    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (!state._hydrated) {
        // Not loaded (or failed to load): nothing here may be persisted.
        return;
      }
      if (!prevState?._hydrated) {
        // This change IS the hydration: it mirrors disk and is not dirty.
        // Restore a pending crash backup afterwards (outside this listener
        // so other subscribers observe the hydrate first).
        baseGraph = graphOf(state.nodes, state.edges);
        const viewId = state.activeViewId;
        queueMicrotask(() => {
          isRpcAvailable()
            .then((available) => {
              if (available) {
                return restorePendingBackup(viewId);
              }
            })
            .catch(() => undefined);
        });
        return;
      }

      const layoutChanged =
        state.nodes !== prevState.nodes || state.edges !== prevState.edges;
      if (!layoutChanged) {
        return;
      }

      markChanged();
    });

    const handleFlush = () => {
      if (!(isAvailable.current && isDirty())) {
        return;
      }
      flushAndMarkClean().catch(() => undefined);
    };

    const writeBackupIfDirty = () => {
      const { nodes, edges, _hydrated, activeViewId } =
        useCanvasStore.getState();
      if (isDirty() && _hydrated && activeViewId === viewIdRef.current) {
        writePendingFlushBackup(viewIdRef.current, {
          nodes,
          edges,
          baseGraph,
          workspacePath,
        });
      }
    };

    const handleBeforeUnload = () => {
      writeBackupIfDirty();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleFlush();
      }
    };

    // Quit-time flush requested by the main process. Stamp the synchronous
    // backup first so a timeout or failed save still leaves a restorable copy.
    const unregisterFlusher = registerCanvasFlusher(async () => {
      if (!(isAvailable.current ?? (await isRpcAvailable()))) {
        return true;
      }
      if (!isDirty()) {
        return true;
      }
      writeBackupIfDirty();
      return await flushAndMarkClean();
    });

    window.addEventListener('blur', handleFlush);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      unsub();
      unregisterFlusher();
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
