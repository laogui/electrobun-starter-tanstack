import type { Edge, Node } from '@xyflow/react';
import { toast } from 'sonner';
import { create } from 'zustand';
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
import * as m from '../../paraglide/messages.js';
import type { SearchResultTarget } from '../../shared/searchTypes';
import {
  isTopicTitleWithinLimit,
  normalizeTopicTitle,
} from '../../shared/topic';
import {
  cleanEdgeForClipboard,
  cleanNodeForClipboard,
} from './canvas/clipboardGraph';
import { uniqueDetachedNodeId, uniqueEdgeId } from './canvas/folderChildren';
import {
  type ClipboardSlice,
  createClipboardSlice,
} from './slices/clipboardSlice';
import { createEdgesSlice, type EdgesSlice } from './slices/edgesSlice';
import { createFolderSlice, type FolderSlice } from './slices/folderSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
import {
  createNodeCreationSlice,
  type NodeCreationSlice,
} from './slices/nodeCreationSlice';
import { createNodesSlice, type NodesSlice } from './slices/nodesSlice';
import {
  createSelectionSlice,
  type SelectionSlice,
} from './slices/selectionSlice';
import { createTopicsSlice, type TopicsSlice } from './slices/topicsSlice';
import { createUiSlice, type UiSlice } from './slices/uiSlice';
import {
  createViewportSlice,
  type ViewportSlice,
} from './slices/viewportSlice';

export { previewTopicDraft, previewTopicEdits } from './canvas/topicGraph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface FocusedItem {
  data: Record<string, unknown>;
  /** Owning folder id when this item is an embedded folder child. */
  folderId?: string;
  id: string;
  rect: DOMRect;
  type?: string;
}

export interface PendingSearchTarget {
  edgeId?: string;
  nodeId?: string;
  target?: SearchResultTarget;
  viewId: string;
}

export interface CreateNodeOptions {
  /** Top-left anchor in flow coords. Takes precedence over `anchorCenter`. */
  anchor?: { x: number; y: number };
  /** Desired center of the new node in flow coords. */
  anchorCenter?: { x: number; y: number };
  /** Override the node kind's group-adoption rule for this placement. */
  canEnterGroup?: boolean;
  /** Additional data to merge over the node kind's registry defaults. */
  data?: Record<string, unknown>;
  /** When false, skip the post-create viewport pan (batch imports). Default true. */
  focusViewport?: boolean;
  /**
   * Override the node kind's default size. Used by image imports to size the
   * card to the dropped image's aspect ratio instead of the fixed default.
   */
  size?: { height: number; width: number };
}

export interface AddConnectionOptions {
  reverseVisualDirection?: boolean;
}

/**
 * A new Topic the user is typing but has not committed.
 *
 * A draft is deliberately *not* a graph node: it holds no id in `nodes`, writes
 * no edge, produces no history entry, and is never persisted. The first
 * non-empty commit turns the title, node, and layout into a single transaction,
 * so creating a Topic costs exactly one undo step and abandoning one costs
 * nothing.
 */
export interface TopicDraft {
  /** Top-left in flow coordinates, relative to `parentId` when set. */
  anchor: { x: number; y: number };
  /** Render-only id for the temporary node. Never persisted. */
  id: string;
  /** Group container the committed Topic will join. */
  parentId?: string;
  /**
   * Tree position this draft will take. Absent for a standalone root.
   * Re-validated after the async quota check — the anchor Topic may have been
   * deleted or locked while the check was in flight.
   */
  relation?: {
    kind: 'child' | 'sibling';
    /** Parent for `child`, preceding sibling for `sibling`. */
    topicId: string;
  };
  /** Current editor text, mirrored here so the node can resize while typing. */
  text: string;
  /** View the draft belongs to. A commit that resolves after a view switch is
   *  discarded rather than written into whatever canvas is now open. */
  viewId: string;
}

/**
 * Full canvas store shape: the intersection of every slice. Each slice owns
 * its state keys and actions; cross-slice calls go through `get()`.
 */
export interface CanvasState
  extends UiSlice,
    ViewportSlice,
    HistorySlice,
    EdgesSlice,
    NodesSlice,
    TopicsSlice,
    SelectionSlice,
    ClipboardSlice,
    NodeCreationSlice,
    FolderSlice {
  // Hydration
  _hydrated: boolean;

  // Multi-view
  activeViewId: string;
  hydrate: (nodes: Node[], edges: Edge[]) => void;
  moveSelectedToView: (targetViewId: string) => Promise<boolean>;
  reset: () => void;

  // Actions – multi-view
  /**
   * Low-level view swap: clears canvas state without persisting anything.
   * User-initiated switches should go through `switchView` instead.
   */
  setActiveView: (viewId: string) => void;
  setActiveViewId: (viewId: string) => void;
  setViews: (views: Array<{ id: string; name: string }>) => void;
  /**
   * Flush the current canvas to disk, then switch to `viewId`. Resolves to
   * `false` (and leaves the current view active) when the flush fails, so
   * callers can surface an error instead of silently dropping edits.
   */
  switchView: (viewId: string) => Promise<boolean>;
  views: Array<{ id: string; name: string }>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCanvasStore = create<CanvasState>()((set, get, api) => ({
  ...createUiSlice(set, get, api),
  ...createViewportSlice(set, get, api),
  ...createHistorySlice(set, get, api),
  ...createEdgesSlice(set, get, api),
  ...createNodesSlice(set, get, api),
  ...createTopicsSlice(set, get, api),
  ...createSelectionSlice(set, get, api),
  ...createClipboardSlice(set, get, api),
  ...createNodeCreationSlice(set, get, api),
  ...createFolderSlice(set, get, api),
  _hydrated: false,
  activeViewId: 'default',
  views: [{ id: 'default', name: 'Default Canvas' }],

  // -- hydration ------------------------------------------------------------
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
      _hydrated: true,
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
      _hydrated: false,
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

  // -- multi-view actions ---------------------------------------------------
  setViews: (views) => {
    set({ views });
  },
  setActiveViewId: (viewId) => {
    set({ activeViewId: viewId });
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
      _hydrated: false,
      editingTopicId: null,
      topicCommandContextId: null,
      topicDraft: null,
      topicEditPreviews: {},
      topicWritePaused: false,
    });
  },

  switchView: async (viewId) => {
    const { activeViewId, topicDraft } = get();
    if (viewId === activeViewId) {
      return true;
    }

    // Leave-canvas contract: commit a non-empty draft into the outgoing graph
    // so the subsequent manifest flush includes it. Empty drafts are discarded.
    // A failed commit keeps the draft and aborts the switch.
    if (topicDraft && topicDraft.viewId === activeViewId) {
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

    const { edges, nodes, _hydrated, topicWritePaused } = get();
    const rpcAvailable = await isRpcAvailable();

    // Flush the outgoing canvas first; abort the switch when the save fails so
    // clearing the store can never drop unsaved edits. Skip the flush when the
    // canvas was never hydrated — saving an empty store would wipe the manifest.
    // Viewport is session-only and is never written to the manifest.
    // A write-paused canvas must not be flushed: leaving is allowed, but the
    // original file stays untouched and this is never presented as a save.
    if (topicWritePaused) {
      toast.error(m.toast_topic_write_paused());
    } else if (_hydrated && rpcAvailable) {
      const sanitized = sanitizeForPersistence(nodes, edges);
      const saved = await rpcSaveManifest(
        activeViewId,
        sanitized.nodes,
        sanitized.edges
      ).catch((error) => {
        console.error('[canvasStore] Failed to flush before switch:', error);
        return { success: false };
      });
      if (!saved?.success) {
        return false;
      }
      // Clear any pending flush backup on successful save
      clearPendingFlushBackup(activeViewId);
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
    const targetManifest = await loadCanvas(targetViewId).catch((error) => {
      console.error('[canvasStore] Failed to load target canvas:', error);
      return null;
    });
    const targetNodes = Array.isArray(targetManifest?.nodes)
      ? (targetManifest.nodes as Node[])
      : [];
    const targetEdges = Array.isArray(targetManifest?.edges)
      ? (targetManifest.edges as Edge[])
      : [];
    if (topicCanvasWritePaused(targetNodes, targetEdges)) {
      toast.error(m.toast_topic_write_paused());
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

    const sourceNodes = sortNodesByParent(
      nodes.flatMap((node) => {
        if (selectedIds.has(node.id)) {
          return [];
        }
        if (node.parentId && selectedIds.has(node.parentId)) {
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
    const sourceEdges = edges.filter(
      (edge) => !(selectedIds.has(edge.source) || selectedIds.has(edge.target))
    );

    const sanitizedTarget = sanitizeForPersistence(
      sortNodesByParent([...targetNodes, ...movedNodes]),
      [...targetEdges, ...movedEdges]
    );
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

    const sanitizedSource = sanitizeForPersistence(sourceNodes, sourceEdges);
    const sourceSave = await rpcSaveManifest(
      activeViewId,
      sanitizedSource.nodes,
      sanitizedSource.edges
    ).catch((error) => {
      console.error('[canvasStore] Failed to save source canvas:', error);
      return { success: false };
    });
    if (!sourceSave?.success) {
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
      return false;
    }

    get().saveSnapshot();
    set((state) => ({
      edges: sourceEdges,
      focusedFolder:
        state.focusedFolder && selectedIds.has(state.focusedFolder.id)
          ? null
          : state.focusedFolder,
      focusedNode:
        state.focusedNode && selectedIds.has(state.focusedNode.id)
          ? null
          : state.focusedNode,
      nodes: sourceNodes,
    }));
    return true;
  },
}));
