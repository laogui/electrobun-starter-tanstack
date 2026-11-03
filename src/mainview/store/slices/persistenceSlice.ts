// Canvas store slice: Hydration, reset and multi-view switching / persistence.
import type { Edge, Node } from '@xyflow/react';
import { toast } from 'sonner';
import type { StateCreator } from 'zustand';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import { normalizeCanvasParenting, sortNodesByParent } from '@/lib/canvasUtils';
import { buildAbsoluteRects } from '@/lib/collision';
import { clearPendingFlushBackup } from '@/lib/pendingFlushBackup';
import {
  isRpcAvailable,
  loadCanvas,
  rpcSaveManifest,
  rpcSetActiveView,
} from '@/lib/rpc';
import { topicCanvasWritePaused } from '@/lib/topicTree';
import { createUndoRedoState } from '@/lib/undoRedo';
import { unifiedUndoHistory } from '@/lib/unifiedUndoHistory';
import * as m from '../../../paraglide/messages.js';
import {
  isTopicTitleWithinLimit,
  normalizeTopicTitle,
} from '../../../shared/topic';
import {
  cleanEdgeForClipboard,
  cleanNodeForClipboard,
} from '../canvas/clipboardGraph';
import { uniqueDetachedNodeId, uniqueEdgeId } from '../canvas/folderChildren';
import type { CanvasState } from '../canvasStore';

export type CanvasLoadErrorKind = 'corrupt' | 'missing' | 'failed';

export interface CanvasLoadError {
  kind: CanvasLoadErrorKind;
  message?: string;
  viewId: string;
}

export interface SwitchViewOptions {
  /**
   * Do not flush the outgoing canvas. Only for when the outgoing view no
   * longer exists (e.g. it was just deleted after an explicit flush).
   */
  skipFlush?: boolean;
}

/** Re-flush at most this many times when edits land during a switch flush. */
const MAX_SWITCH_FLUSH_PASSES = 3;

export interface PersistenceSlice {
  /** Invalidates asynchronous work even when a view is left and reopened. */
  _canvasGeneration: number;
  _hydrated: boolean;

  // Multi-view
  activeViewId: string;
  /**
   * Set when the active canvas could not be loaded. While set the canvas is
   * not hydrated, so nothing is persisted; the UI must show an error instead
   * of an editable canvas.
   */
  canvasLoadError: CanvasLoadError | null;
  /**
   * Save the active canvas now (sanitized). Resolves `true` when there was
   * nothing to save (not hydrated / no RPC); `false` when the save failed or
   * the canvas is write-paused.
   */
  flushActiveView: () => Promise<boolean>;
  hydrate: (nodes: Node[], edges: Edge[]) => void;
  moveSelectedToView: (targetViewId: string) => Promise<boolean>;
  reset: () => void;

  /**
   * Low-level view swap: clears canvas state without persisting anything.
   * User-initiated switches should go through `switchView` instead.
   */
  setActiveView: (viewId: string) => void;
  setActiveViewId: (viewId: string) => void;
  setCanvasLoadError: (error: CanvasLoadError | null) => void;
  setViews: (views: Array<{ id: string; name: string }>) => void;
  /**
   * Flush the current canvas to disk, then switch to `viewId`. Resolves to
   * `false` (and leaves the current view active) when the flush fails, so
   * callers can surface an error instead of silently dropping edits.
   */
  switchView: (viewId: string, options?: SwitchViewOptions) => Promise<boolean>;
  views: Array<{ id: string; name: string }>;
}

/**
 * Remove `movedIds` from a graph: drop the nodes and every edge touching
 * them, and re-home children of moved parents at their absolute position.
 */
function detachMovedNodes(
  nodes: Node[],
  edges: Edge[],
  movedIds: ReadonlySet<string>
): { edges: Edge[]; nodes: Node[] } {
  const absoluteRects = buildAbsoluteRects(nodes);
  const nextNodes = sortNodesByParent(
    nodes.flatMap((node) => {
      if (movedIds.has(node.id)) {
        return [];
      }
      if (node.parentId && movedIds.has(node.parentId)) {
        const rect = absoluteRects.get(node.id);
        const {
          extent: _extent,
          parentId: _parentId,
          ...rest
        } = node as Node & { extent?: unknown; parentId?: string };
        return [
          {
            ...rest,
            position: {
              x: rect?.left ?? node.position.x,
              y: rect?.top ?? node.position.y,
            },
          } as Node,
        ];
      }
      return [node];
    })
  );
  const nextEdges = edges.filter(
    (edge) => !(movedIds.has(edge.source) || movedIds.has(edge.target))
  );
  return { edges: nextEdges, nodes: nextNodes };
}

export const createPersistenceSlice: StateCreator<
  CanvasState,
  [],
  [],
  PersistenceSlice
> = (set, get) => ({
  _hydrated: false,
  _canvasGeneration: 0,
  activeViewId: 'default',
  canvasLoadError: null,
  views: [{ id: 'default', name: 'Default Canvas' }],

  hydrate: (nodes, edges) => {
    // Viewport is session-only: restore from the in-memory cache for this view
    // (set by setActiveView / setViewport). Disk manifests are never consulted.
    const { activeViewId, _sessionViewports, sessionViewport } = get();
    const restored = sessionViewport ?? _sessionViewports[activeViewId] ?? null;
    const nextNodes = sortNodesByParent(normalizeCanvasParenting(nodes));
    const topicWritePaused = topicCanvasWritePaused(nextNodes, edges);
    set({
      nodes: nextNodes,
      edges,
      viewport: restored,
      sessionViewport: restored,
      _canvasGeneration: get()._canvasGeneration + 1,
      _hydrated: true,
      canvasLoadError: null,
      topicWritePaused,
    });
    if (topicWritePaused) {
      toast.error(m.toast_topic_write_paused());
    }
  },

  reset: () => {
    unifiedUndoHistory.clear();
    set({
      nodes: [],
      edges: [],
      viewport: null,
      sessionViewport: null,
      _sessionViewports: {},
      _canvasGeneration: get()._canvasGeneration + 1,
      _hydrated: false,
      canvasLoadError: null,
      focusedNode: null,
      focusedFolder: null,
      clipboard: [],
      clipboardEdges: [],
      libraryOpen: false,
      tagSidebarOpen: false,
      activeTagFilters: [],
      _undoRedo: createUndoRedoState(),
      editingTopicId: null,
      topicCommandContextId: null,
      topicDraft: null,
      topicEditPreviews: {},
      topicWritePaused: false,
    });
  },

  setViews: (views) => {
    set({ views });
  },

  setActiveViewId: (viewId) => {
    set({
      activeViewId: viewId,
      _canvasGeneration: get()._canvasGeneration + 1,
    });
  },

  setCanvasLoadError: (error) => {
    set({ canvasLoadError: error });
  },

  flushActiveView: async () => {
    const { activeViewId, edges, nodes, _hydrated, topicWritePaused } = get();
    if (!_hydrated) {
      return true;
    }
    if (topicWritePaused) {
      return false;
    }
    if (!(await isRpcAvailable())) {
      return true;
    }
    const sanitized = sanitizeForPersistence(nodes, edges);
    const saved = await rpcSaveManifest(
      activeViewId,
      sanitized.nodes,
      sanitized.edges
    ).catch((error) => {
      console.error('[canvasStore] Failed to flush canvas:', error);
      return { success: false };
    });
    if (!saved?.success) {
      return false;
    }
    clearPendingFlushBackup(activeViewId);
    return true;
  },

  setActiveView: (viewId) => {
    const current = get().activeViewId;
    if (viewId === current) {
      return;
    }

    const { sessionViewport, _sessionViewports } = get();
    // Stash the outgoing view's confirmed camera so re-entering this session
    // restores pan/zoom without reading disk.
    const nextSessionMap = { ..._sessionViewports };
    if (sessionViewport) {
      nextSessionMap[current] = sessionViewport;
    }
    const restored = nextSessionMap[viewId] ?? null;

    // Clear canvas data AND UI state for view switch (keep clipboard for cross-view paste)
    set({
      activeViewId: viewId,
      nodes: [],
      edges: [],
      viewport: restored,
      sessionViewport: restored,
      _sessionViewports: nextSessionMap,
      focusedNode: null,
      focusedFolder: null,
      _undoRedo: createUndoRedoState(),
      _canvasGeneration: get()._canvasGeneration + 1,
      _hydrated: false,
      canvasLoadError: null,
      editingTopicId: null,
      topicCommandContextId: null,
      topicDraft: null,
      topicEditPreviews: {},
      topicWritePaused: false,
    });
  },

  switchView: async (viewId, options) => {
    const { activeViewId, topicDraft } = get();
    if (viewId === activeViewId) {
      return true;
    }
    const skipFlush = options?.skipFlush === true;

    // Leave-canvas contract: commit a non-empty draft into the outgoing graph
    // so the subsequent manifest flush includes it. Empty drafts are discarded.
    // A failed commit keeps the draft and aborts the switch.
    if (!skipFlush && topicDraft && topicDraft.viewId === activeViewId) {
      const title = normalizeTopicTitle(topicDraft.text);
      if (title && !isTopicTitleWithinLimit(title)) {
        return false;
      }
      if (title) {
        const committed = await get().commitTopicDraft(title);
        if (!committed) {
          return false;
        }
      } else {
        get().cancelTopicDraft();
      }
    }

    const { _hydrated, topicWritePaused } = get();
    const rpcAvailable = await isRpcAvailable();
    if (get().activeViewId !== activeViewId) {
      // Another switch won the race; do not stack a second one on top.
      return false;
    }

    // Flush the outgoing canvas first; abort the switch when the save fails so
    // clearing the store can never drop unsaved edits. Skip the flush when the
    // canvas was never hydrated — saving an empty store would wipe the manifest.
    // Viewport is session-only and is never written to the manifest.
    // A write-paused canvas must not be flushed: leaving is allowed, but the
    // original file stays untouched and this is never presented as a save.
    const shouldFlush = !skipFlush && _hydrated && rpcAvailable;
    if (!skipFlush && topicWritePaused) {
      toast.error(m.toast_topic_write_paused());
    }
    let flushedNodes: Node[] | null = null;
    let flushedEdges: Edge[] | null = null;
    // Edits made while a save RPC is in flight are not in that save, and
    // setActiveView clears the store. Keep flushing until the graph we saved
    // is the graph in the store, so nothing typed during the switch is lost.
    const flushUntilStable = async (): Promise<boolean> => {
      for (let pass = 0; pass < MAX_SWITCH_FLUSH_PASSES; pass += 1) {
        const current = get();
        if (current.activeViewId !== activeViewId) {
          return false;
        }
        if (current.topicWritePaused) {
          return true;
        }
        if (current.nodes === flushedNodes && current.edges === flushedEdges) {
          return true;
        }
        flushedNodes = current.nodes;
        flushedEdges = current.edges;
        const saved = await get().flushActiveView();
        if (!saved) {
          return false;
        }
      }
      const latest = get();
      return latest.nodes === flushedNodes && latest.edges === flushedEdges;
    };

    if (shouldFlush && !(await flushUntilStable())) {
      return false;
    }

    // Persist the active view selection so it survives restarts.
    if (rpcAvailable) {
      const activeViewSaved = await rpcSetActiveView(viewId).catch((error) => {
        console.error('[canvasStore] Failed to persist active view:', error);
        return { success: false };
      });
      if (!activeViewSaved?.success) {
        return false;
      }
    }
    // Catch edits made during the active-view RPC as well.
    if (shouldFlush && !(await flushUntilStable())) {
      return false;
    }
    if (get().activeViewId !== activeViewId) {
      return false;
    }
    get().setActiveView(viewId);
    return true;
  },

  moveSelectedToView: async (targetViewId) => {
    const { activeViewId, edges, nodes } = get();
    if (targetViewId === activeViewId) {
      return false;
    }

    const selectedNodes = nodes.filter((node) => node.selected);
    if (selectedNodes.length === 0) {
      return false;
    }

    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    if (get().topicWritePaused || topicCanvasWritePaused(nodes, edges)) {
      toast.error(m.toast_topic_write_paused());
      return false;
    }
    // A target that cannot be read (corrupt with no backup, missing, or a
    // malformed payload) must abort the move: treating it as empty would
    // overwrite the target canvas with only the moved nodes.
    let targetManifest: Awaited<ReturnType<typeof loadCanvas>>;
    try {
      targetManifest = await loadCanvas(targetViewId);
    } catch (error) {
      console.error('[canvasStore] Failed to load target canvas:', error);
      toast.error(m.toast_move_target_load_failed());
      return false;
    }
    if (
      !(
        targetManifest &&
        Array.isArray(targetManifest.nodes) &&
        Array.isArray(targetManifest.edges)
      )
    ) {
      console.error('[canvasStore] Target canvas unavailable:', targetViewId);
      toast.error(m.toast_move_target_load_failed());
      return false;
    }
    const targetNodes = targetManifest.nodes as Node[];
    const targetEdges = targetManifest.edges as Edge[];
    if (topicCanvasWritePaused(targetNodes, targetEdges)) {
      toast.error(m.toast_topic_write_paused());
      return false;
    }
    // The selection snapshot is only valid while the canvas still holds it
    // unchanged (same view, same node objects for everything being moved).
    const selectionIntact = (): boolean => {
      const current = get();
      if (
        current.activeViewId !== activeViewId ||
        !current._hydrated ||
        current.topicWritePaused
      ) {
        return false;
      }
      const currentById = new Map(current.nodes.map((node) => [node.id, node]));
      return selectedNodes.every((node) => currentById.get(node.id) === node);
    };
    if (!selectionIntact()) {
      toast.error(m.toast_move_canvas_changed());
      return false;
    }

    const absoluteRects = buildAbsoluteRects(nodes);
    const usedTargetNodeIds = new Set(targetNodes.map((node) => node.id));
    const nodeIdMap = new Map<string, string>();
    for (const node of selectedNodes) {
      nodeIdMap.set(node.id, uniqueDetachedNodeId(node.id, usedTargetNodeIds));
    }

    const movedNodes = selectedNodes.map((node) => {
      const {
        extent: _extent,
        parentId: sourceParentId,
        selected: _selected,
        ...rest
      } = cleanNodeForClipboard(node) as Node & {
        extent?: unknown;
        parentId?: string;
        selected?: boolean;
      };
      const parentIsMoving =
        typeof sourceParentId === 'string' && selectedIds.has(sourceParentId);
      const rect = absoluteRects.get(node.id);
      const nextNode: Node = {
        ...rest,
        id: nodeIdMap.get(node.id)!,
        position:
          sourceParentId && !parentIsMoving
            ? {
                x: rect?.left ?? node.position.x,
                y: rect?.top ?? node.position.y,
              }
            : node.position,
        selected: false,
      };
      if (parentIsMoving) {
        nextNode.parentId = nodeIdMap.get(sourceParentId);
        nextNode.extent = node.extent;
      }
      return nextNode;
    });

    const usedTargetEdgeIds = new Set(targetEdges.map((edge) => edge.id));
    const movedEdges: Edge[] = [];
    for (const edge of edges) {
      if (!(selectedIds.has(edge.source) && selectedIds.has(edge.target))) {
        continue;
      }
      movedEdges.push({
        ...cleanEdgeForClipboard(edge),
        id: uniqueEdgeId(edge.id, usedTargetEdgeIds),
        source: nodeIdMap.get(edge.source)!,
        target: nodeIdMap.get(edge.target)!,
        selected: false,
      } as Edge);
    }

    const sanitizedTarget = sanitizeForPersistence(
      sortNodesByParent([...targetNodes, ...movedNodes]),
      [...targetEdges, ...movedEdges]
    );
    const rollbackTarget = async () => {
      const sanitizedOriginalTarget = sanitizeForPersistence(
        targetNodes,
        targetEdges
      );
      await rpcSaveManifest(
        targetViewId,
        sanitizedOriginalTarget.nodes,
        sanitizedOriginalTarget.edges
      ).catch((error) => {
        console.error(
          '[canvasStore] Failed to roll back target canvas:',
          error
        );
      });
    };
    // Persist both manifests BEFORE touching local state, and roll the target
    // back if the source save fails — otherwise a partial failure would leave
    // the moved nodes existing in both views (or vanishing from the UI while
    // still on disk). Target is written first so a crash between the two
    // saves duplicates nodes instead of losing them.
    const targetSave = await rpcSaveManifest(
      targetViewId,
      sanitizedTarget.nodes,
      sanitizedTarget.edges
    ).catch((error) => {
      console.error('[canvasStore] Failed to save target canvas:', error);
      return { success: false };
    });
    if (!targetSave?.success) {
      return false;
    }

    // Re-read the store: edits made while the target was saving must survive
    // in the source manifest, so derive it from the latest graph rather than
    // the entry snapshot.
    if (!selectionIntact()) {
      await rollbackTarget();
      toast.error(m.toast_move_canvas_changed());
      return false;
    }
    const beforeSource = get();
    const source = detachMovedNodes(
      beforeSource.nodes,
      beforeSource.edges,
      selectedIds
    );
    const sanitizedSource = sanitizeForPersistence(source.nodes, source.edges);
    const sourceSave = await rpcSaveManifest(
      activeViewId,
      sanitizedSource.nodes,
      sanitizedSource.edges
    ).catch((error) => {
      console.error('[canvasStore] Failed to save source canvas:', error);
      return { success: false };
    });
    if (!sourceSave?.success) {
      await rollbackTarget();
      return false;
    }
    clearPendingFlushBackup(activeViewId);

    if (get().activeViewId !== activeViewId) {
      // The view was switched away mid-move; both manifests are on disk.
      return true;
    }
    get().saveSnapshot();
    set((state) => {
      // Apply the removal to the latest graph so edits made during the
      // source save are kept (the debounced flush persists them).
      const latest =
        state.nodes === beforeSource.nodes && state.edges === beforeSource.edges
          ? source
          : detachMovedNodes(state.nodes, state.edges, selectedIds);
      return {
        edges: latest.edges,
        focusedFolder:
          state.focusedFolder && selectedIds.has(state.focusedFolder.id)
            ? null
            : state.focusedFolder,
        focusedNode:
          state.focusedNode && selectedIds.has(state.focusedNode.id)
            ? null
            : state.focusedNode,
        nodes: latest.nodes,
      };
    });
    return true;
  },
});
