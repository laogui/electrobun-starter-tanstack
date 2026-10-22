import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { create } from 'zustand';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import { normalizeCanvasParenting, sortNodesByParent } from '@/lib/canvasUtils';
import { buildAbsoluteRects, getNodeSize, type Size } from '@/lib/collision';
import { hasNodeQuota } from '@/lib/nodeQuota';
import { clearPendingFlushBackup } from '@/lib/pendingFlushBackup';
import { resolveNodePlacement } from '@/lib/resolvePlacement';
import {
  isRpcAvailable,
  loadCanvas,
  rpcSaveManifest,
  rpcSetActiveView,
} from '@/lib/rpc';
import { measureTopicSize } from '@/lib/topicMeasure';
import {
  buildTopicIndex,
  collectTopicBranch,
  findTopicRoot,
  getStructurallyFrozenTopics,
  getTopicChildren,
  renumberSiblingEdges,
  topicCanvasWritePaused,
} from '@/lib/topicTree';
import { createUndoRedoState } from '@/lib/undoRedo';
import { unifiedUndoHistory } from '@/lib/unifiedUndoHistory';
import * as m from '../../paraglide/messages.js';
import type { SearchResultTarget } from '../../shared/searchTypes';
import {
  createTopicData,
  isTopicNodeType,
  isTopicTitleWithinLimit,
  normalizeTopicTitle,
  parseTopicData,
  TOPIC_LEVEL_GAP,
  TOPIC_MIN_HEIGHT,
  TOPIC_MIN_WIDTH,
  TOPIC_NODE_TYPE,
  TOPIC_SIBLING_GAP,
} from '../../shared/topic';
import {
  cleanEdgeForClipboard,
  cleanNodeForClipboard,
  getInternalEdgesForNodes,
} from './canvas/clipboardGraph';
import { uniqueDetachedNodeId, uniqueEdgeId } from './canvas/folderChildren';
import {
  attachDraftToTree,
  relayoutTopicTree,
  toastTopicHardFailure,
  toastTopicSoftOverlap,
} from './canvas/topicGraph';
import { getViewportCenter } from './canvas/viewportCenter';
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
    SelectionSlice,
    ClipboardSlice,
    NodeCreationSlice,
    FolderSlice {
  // Hydration
  _hydrated: boolean;

  // Multi-view
  activeViewId: string;
  /** Start a new Topic. It renders and accepts typing immediately but does not
   *  enter the graph until the first non-empty commit. */
  beginTopicDraft: (
    rfInstance: ReactFlowInstance<any, any> | null,
    options?: {
      anchor?: { x: number; y: number };
      anchorCenter?: { x: number; y: number };
    }
  ) => void;
  /** Promote the draft into a real Topic node. Resolves to the new node id, or
   *  `undefined` when the commit was rejected or superseded. */
  /** Start a draft positioned as a child or next sibling of an existing Topic.
   *  Returns false when the anchor cannot take one (missing, locked, frozen
   *  tree, or a root asked for a sibling). */
  beginTopicRelativeDraft: (
    kind: 'child' | 'sibling',
    anchorTopicId: string
  ) => boolean;
  cancelTopicDraft: () => void;
  commitTopicDraft: (title: string) => Promise<string | undefined>;
  commitTopicTitle: (nodeId: string, title: string) => void;
  /** Copy a Topic and its descendants (internal tree edges only). */
  copyTopicBranch: (topicId: string) => void;
  /** Remove a Topic and every descendant as one transaction. */
  deleteTopicBranch: (topicId: string) => void;
  /** Cut a Topic's parent relation, promoting its branch to a separate tree. */
  detachTopicBranch: (topicId: string) => void;
  /** Topic id that should enter inline title editing (F2 / keyboard entry). */
  editingTopicId: string | null;
  /** Enter the explicit Topic single-select command context (Tab/Enter). */
  enterTopicCommandContext: (topicId: string) => void;
  /** Leave Topic command context; selection may remain. */
  exitTopicCommandContext: () => void;
  hydrate: (nodes: Node[], edges: Edge[]) => void;
  moveSelectedToView: (targetViewId: string) => Promise<boolean>;
  reset: () => void;
  /** Discard the render-only size override without changing the saved graph. */
  resetTopicEditPreview: (nodeId: string) => void;

  // Actions – multi-view
  /**
   * Low-level view swap: clears canvas state without persisting anything.
   * User-initiated switches should go through `switchView` instead.
   */
  setActiveView: (viewId: string) => void;
  setActiveViewId: (viewId: string) => void;
  setEditingTopicId: (id: string | null) => void;
  setTopicDraftText: (text: string) => void;
  /** Live-resize an existing Topic to the title currently being typed, so the
   *  box fits the text while editing. Ephemeral: no relayout and no history
   *  snapshot — the commit writes the final size and layout;
   *  `resetTopicEditPreview` restores the stored title's size. */
  setTopicEditPreview: (nodeId: string, title: string) => void;
  setViews: (views: Array<{ id: string; name: string }>) => void;
  /**
   * Flush the current canvas to disk, then switch to `viewId`. Resolves to
   * `false` (and leaves the current view active) when the flush fails, so
   * callers can surface an error instead of silently dropping edits.
   */
  switchView: (viewId: string) => Promise<boolean>;
  /** Re-run layout for the branch rooted at `topicId`. */
  tidyTopicBranch: (topicId: string) => void;

  // Actions – topic
  /**
   * Explicit Topic command context. Tab/Enter create child/sibling only while
   * this is set; Esc clears it without requiring the node to be deselected.
   */
  topicCommandContextId: string | null;
  /** In-flight new Topic: rendered and editable, but not yet in the graph. */
  topicDraft: TopicDraft | null;
  /** Render-only dimensions, excluded from persistence and undo snapshots. */
  topicEditPreviews: Record<string, Size>;
  /**
   * Whole-canvas write protection after a lossy or unconfirmable Topic
   * decode. Distinct from structure freeze: other content may still be
   * edited in memory, but auto-save must not overwrite the original file.
   */
  topicWritePaused: boolean;
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
  ...createSelectionSlice(set, get, api),
  ...createClipboardSlice(set, get, api),
  ...createNodeCreationSlice(set, get, api),
  ...createFolderSlice(set, get, api),
  _hydrated: false,
  activeViewId: 'default',
  views: [{ id: 'default', name: 'Default Canvas' }],
  editingTopicId: null,
  topicCommandContextId: null,
  topicDraft: null,
  topicEditPreviews: {},
  topicWritePaused: false,

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

  // -- topic actions --------------------------------------------------------
  setEditingTopicId: (id) => {
    set({
      editingTopicId: id,
      ...(id ? { topicCommandContextId: id } : {}),
    });
  },

  enterTopicCommandContext: (topicId) => {
    set({ topicCommandContextId: topicId });
  },

  exitTopicCommandContext: () => {
    set({ topicCommandContextId: null });
  },

  beginTopicDraft: (rfInstance, options) => {
    const size = { height: TOPIC_MIN_HEIGHT, width: TOPIC_MIN_WIDTH * 2 };
    const center = options?.anchorCenter ?? getViewportCenter(rfInstance);
    const anchor = options?.anchor ?? {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
    };
    const { nodes } = get();
    const { canPlace, parentId, placement } = resolveNodePlacement({
      anchor,
      nodes,
      newType: TOPIC_NODE_TYPE,
      size,
    });
    if (!canPlace) {
      toast.error(m.toast_no_placement_slot());
      return;
    }
    let position = placement;
    if (parentId) {
      const parentRect = buildAbsoluteRects(nodes).get(parentId);
      if (parentRect) {
        position = {
          x: placement.x - parentRect.left,
          y: placement.y - parentRect.top,
        };
      }
    }
    // Replacing an untouched draft is silent by design: it never entered the
    // graph, so there is nothing to discard or undo.
    set((s) => ({
      topicCommandContextId: null,
      topicDraft: {
        anchor: position,
        id: `topic-draft-${nanoid(8)}`,
        text: '',
        viewId: s.activeViewId,
        ...(parentId ? { parentId } : {}),
      },
    }));
  },

  beginTopicRelativeDraft: (kind, anchorTopicId) => {
    const { edges, nodes } = get();
    const anchor = nodes.find((n) => n.id === anchorTopicId);
    if (!(anchor && isTopicNodeType(anchor.type))) {
      return false;
    }
    if ((anchor.data as { locked?: unknown }).locked) {
      return false;
    }
    const index = buildTopicIndex(nodes, edges);
    if (getStructurallyFrozenTopics(index).has(anchorTopicId)) {
      toast.error(m.toast_topic_tree_frozen());
      return false;
    }
    if (kind === 'sibling' && !index.parentByChild.has(anchorTopicId)) {
      // Roots have no siblings; Enter on a root means "edit the root".
      return false;
    }

    // Fallback anchor for a draft whose tree cannot be laid out. The renderer
    // previews the commit layout without changing persisted positions.
    const size = getNodeSize(anchor);
    const provisional =
      kind === 'child'
        ? {
            x: anchor.position.x + size.width + TOPIC_LEVEL_GAP,
            y: anchor.position.y,
          }
        : {
            x: anchor.position.x,
            y: anchor.position.y + size.height + TOPIC_SIBLING_GAP,
          };

    set((s) => ({
      topicCommandContextId: anchorTopicId,
      topicDraft: {
        anchor: provisional,
        id: `topic-draft-${nanoid(8)}`,
        relation: { kind, topicId: anchorTopicId },
        text: '',
        viewId: s.activeViewId,
        ...(anchor.parentId ? { parentId: anchor.parentId } : {}),
      },
    }));
    return true;
  },

  setTopicDraftText: (text) => {
    set((s) => (s.topicDraft ? { topicDraft: { ...s.topicDraft, text } } : {}));
  },

  setTopicEditPreview: (nodeId, title) => {
    const { nodes, topicEditPreviews } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (
      !(node && isTopicNodeType(node.type)) ||
      node.data.locked ||
      parseTopicData(node.data).status !== 'valid'
    ) {
      return;
    }
    const size = measureTopicSize(title);
    const previous = topicEditPreviews[nodeId];
    if (previous?.width === size.width && previous?.height === size.height) {
      return;
    }
    set({ topicEditPreviews: { ...topicEditPreviews, [nodeId]: size } });
  },

  resetTopicEditPreview: (nodeId) => {
    const { topicEditPreviews } = get();
    if (!topicEditPreviews[nodeId]) {
      return;
    }
    const next = { ...topicEditPreviews };
    delete next[nodeId];
    set({ topicEditPreviews: next });
  },

  detachTopicBranch: (topicId) => {
    // The validated split that `deleteEdge` refuses to perform: cutting the
    // parent relation promotes the branch to its own tree, keeping every
    // position and internal relation intact.
    const { edges, nodes } = get();
    const index = buildTopicIndex(nodes, edges);
    const relation = index.parentByChild.get(topicId);
    if (!relation) {
      return;
    }
    const affected = [
      topicId,
      relation.parentId,
      ...collectTopicBranch(index, topicId),
    ];
    if (
      affected.some((id) =>
        Boolean(
          (nodes.find((n) => n.id === id)?.data as { locked?: unknown })?.locked
        )
      )
    ) {
      toast.error(m.toast_topic_layout_locked());
      return;
    }

    const remainingSiblings = getTopicChildren(index, relation.parentId)
      .map((r) => r.childId)
      .filter((id) => id !== topicId);
    const nextEdges = renumberSiblingEdges(
      edges.filter((e) => e.id !== relation.edgeId),
      relation.parentId,
      remainingSiblings
    );
    const oldRoot = findTopicRoot(index, relation.parentId);
    const relaidOut = relayoutTopicTree(nodes, nextEdges, oldRoot);
    if (!relaidOut.ok) {
      toastTopicHardFailure(relaidOut.reason);
      return;
    }
    if (relaidOut.softOverlap) {
      toastTopicSoftOverlap();
    }

    get().saveSnapshot();
    set({ edges: nextEdges, nodes: relaidOut.nodes });
  },

  deleteTopicBranch: (topicId) => {
    const { edges, nodes } = get();
    const index = buildTopicIndex(nodes, edges);
    if (!index.topicIds.has(topicId)) {
      return;
    }
    const branch = collectTopicBranch(index, topicId);
    const branchSet = new Set(branch);
    if (
      nodes.some(
        (n) => branchSet.has(n.id) && (n.data as { locked?: unknown }).locked
      )
    ) {
      // Refuse the whole delete rather than removing the unlocked part and
      // leaving a disconnected remnant.
      toast.error(m.toast_topic_branch_locked());
      return;
    }

    const parentRelation = index.parentByChild.get(topicId);
    let nextEdges = edges.filter(
      (e) => !(branchSet.has(e.source) || branchSet.has(e.target))
    );
    let nextNodes = nodes.filter((n) => !branchSet.has(n.id));
    if (parentRelation) {
      nextEdges = renumberSiblingEdges(
        nextEdges,
        parentRelation.parentId,
        getTopicChildren(index, parentRelation.parentId)
          .map((r) => r.childId)
          .filter((id) => id !== topicId)
      );
      const relaidOut = relayoutTopicTree(
        nextNodes,
        nextEdges,
        findTopicRoot(index, parentRelation.parentId)
      );
      if (!relaidOut.ok) {
        toastTopicHardFailure(relaidOut.reason);
        return;
      }
      if (relaidOut.softOverlap) {
        toastTopicSoftOverlap();
      }
      nextNodes = relaidOut.nodes;
    }

    get().saveSnapshot();
    set({ edges: nextEdges, nodes: nextNodes });
  },

  tidyTopicBranch: (topicId) => {
    const { edges, nodes } = get();
    const index = buildTopicIndex(nodes, edges);
    if (!index.topicIds.has(topicId)) {
      return;
    }
    const laidOut = relayoutTopicTree(nodes, edges, topicId);
    if (!laidOut.ok) {
      toastTopicHardFailure(laidOut.reason);
      return;
    }
    if (laidOut.softOverlap) {
      toastTopicSoftOverlap();
    }
    if (laidOut.nodes === nodes) {
      return;
    }
    get().saveSnapshot();
    set({ nodes: laidOut.nodes });
  },

  cancelTopicDraft: () => {
    set({ topicCommandContextId: null, topicDraft: null });
  },

  commitTopicDraft: async (title) => {
    const draft = get().topicDraft;
    const normalized = normalizeTopicTitle(title);
    if (!(draft && normalized && isTopicTitleWithinLimit(normalized))) {
      return;
    }

    if (!(await hasNodeQuota(get().nodes))) {
      // The draft survives a rejected quota check so the user's typing is not
      // thrown away behind an error toast.
      return;
    }

    // Re-read after the await: the license check can span a view switch, a
    // container deletion, or another commit. Everything below runs
    // synchronously off this fresh state so the graph the transaction is built
    // from is the graph it is written to.
    const state = get();
    if (state.topicDraft?.id !== draft.id) {
      return;
    }
    if (state.activeViewId !== draft.viewId) {
      // A late result must not land in whatever canvas is now open.
      set((s) => (s.topicDraft?.id === draft.id ? { topicDraft: null } : {}));
      return;
    }
    if (draft.parentId) {
      const container = state.nodes.find((n) => n.id === draft.parentId);
      if (!container) {
        set({ topicDraft: null });
        toast.error(m.toast_topic_container_gone());
        return;
      }
      if ((container.data as { locked?: unknown }).locked) {
        toast.error(m.toast_topic_container_locked());
        return;
      }
    }

    const id = state.nextNodeId();
    const size = measureTopicSize(normalized);
    const node: Node = {
      data: { ...createTopicData(normalized) },
      id,
      position: draft.anchor,
      style: { width: size.width, height: size.height },
      type: TOPIC_NODE_TYPE,
      ...(draft.parentId
        ? { extent: 'parent' as const, parentId: draft.parentId }
        : {}),
    };

    let nextNodes = sortNodesByParent([...state.nodes, node]);
    let nextEdges = state.edges;

    if (draft.relation) {
      const attached = attachDraftToTree(
        nextNodes,
        nextEdges,
        id,
        draft.relation
      );
      if (!attached) {
        // The anchor Topic changed under the in-flight check (deleted, locked,
        // or its tree is structurally frozen). Keep the draft so the typed
        // title is not lost.
        toast.error(m.toast_topic_relation_unavailable());
        return;
      }
      nextEdges = attached.edges;
      const laidOut = relayoutTopicTree(nextNodes, nextEdges, attached.rootId);
      if (!laidOut.ok) {
        toastTopicHardFailure(laidOut.reason);
        return;
      }
      if (laidOut.softOverlap) {
        toastTopicSoftOverlap();
      }
      nextNodes = laidOut.nodes;
    }

    // One snapshot, then one graph update: title, node, tree edge, and layout
    // land together as a single undo step. A separate "first title edit" record
    // would make undoing a brand-new Topic take two presses.
    state.saveSnapshot();
    set({
      edges: nextEdges,
      nodes: nextNodes,
      topicCommandContextId: id,
      topicDraft: null,
    });
    return id;
  },

  commitTopicTitle: (nodeId, title) => {
    const normalized = normalizeTopicTitle(title);
    if (!(normalized && isTopicTitleWithinLimit(normalized))) {
      return;
    }
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!(node && isTopicNodeType(node.type))) {
      return;
    }
    if ((node.data as { locked?: unknown }).locked) {
      return;
    }
    if (parseTopicData(node.data).status !== 'valid') {
      // Rewriting a record this build cannot interpret would destroy data
      // written by a newer version.
      return;
    }

    // Title, the size it implies, and the affected-tree relayout are one edit.
    const size = measureTopicSize(normalized);
    const { edges, nodes } = get();
    const nextNodes = nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            data: { ...n.data, title: normalized },
            style: { ...n.style, width: size.width, height: size.height },
          }
        : n
    );
    const laidOut = relayoutTopicTree(
      nextNodes,
      edges,
      findTopicRoot(buildTopicIndex(nextNodes, edges), nodeId)
    );
    if (!laidOut.ok) {
      toastTopicHardFailure(laidOut.reason);
      return;
    }
    if (laidOut.softOverlap) {
      toastTopicSoftOverlap();
    }
    get().saveSnapshot();
    set({ nodes: laidOut.nodes });
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

  copyTopicBranch: (topicId) => {
    const { edges, nodes } = get();
    const index = buildTopicIndex(nodes, edges);
    if (!index.topicIds.has(topicId)) {
      return;
    }
    const branchSet = new Set(collectTopicBranch(index, topicId));
    set({
      clipboard: nodes
        .filter((node) => branchSet.has(node.id))
        .map(cleanNodeForClipboard),
      clipboardEdges: getInternalEdgesForNodes(edges, branchSet),
    });
  },
}));
