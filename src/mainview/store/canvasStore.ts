import type { Edge, Node, NodeChange, ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { create } from 'zustand';
import { applyCanvasNodeChanges } from '@/lib/applyCanvasNodeChanges';
import {
  isDetachableNode,
  isFolderChildNode,
  isGroupChildNode,
  isLockedNode,
  isPinnedSticky,
} from '@/lib/canvasNodePredicates';
import {
  buildNewNodeSpec,
  CARD_H,
  CARD_W,
  FOLDER_H,
  FOLDER_W,
  findSpecByNodeType,
} from '@/lib/canvasNodeRegistry';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import { normalizeCanvasParenting, sortNodesByParent } from '@/lib/canvasUtils';
import { buildAbsoluteRects, getNodeSize, type Size } from '@/lib/collision';
import { CARD_COLORS, GROUP_COLORS, STICKY_COLORS } from '@/lib/colorUtils';
import type { CreatableCanvasNodeKind } from '@/lib/contentTypes';
import {
  markNodesEntering,
  VIEWPORT_PAN_MS,
  viewportMotion,
} from '@/lib/motion';
import {
  COUNTED_NODE_TYPES,
  countCountedNodes,
  hasNodeQuota,
} from '@/lib/nodeQuota';
import { collectNoteIdsFromCanvasNodes } from '@/lib/noteTitleProjection';
import { clearPendingFlushBackup } from '@/lib/pendingFlushBackup';
import { resolveNodePlacement } from '@/lib/resolvePlacement';
import {
  isRpcAvailable,
  loadCanvas,
  rpcDeleteNote,
  rpcDeleteWidget,
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
import { suppressViewportPersist } from '@/lib/viewportPersist';
import * as m from '../../paraglide/messages.js';
import { EXTENSION_NODE_TYPE } from '../../shared/extensions/ids';
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
  buildPastedClipboard,
  cleanEdgeForClipboard,
  cleanNodeForClipboard,
  getInternalEdgesForNodes,
} from './canvas/clipboardGraph';
import {
  cloneExtensionReferences,
  cloneWidgetReferences,
  graphContainsExtensionReference,
  graphContainsWidgetReference,
} from './canvas/cloneReferences';
import {
  type FolderChildEntry,
  folderChildToDetachedNode,
  resolveFolderChildSize,
  resolveFolderChildSpec,
  uniqueDetachedNodeId,
  uniqueEdgeId,
} from './canvas/folderChildren';
import { noteTitleMap, projectNoteTitles } from './canvas/noteTitles';
import { topicCommandContextForNodes } from './canvas/topicCommandContext';
import {
  attachDraftToTree,
  relayoutTopicTree,
  settleTopicsAfterDelete,
  toastTopicHardFailure,
  toastTopicSoftOverlap,
} from './canvas/topicGraph';
import { getViewportCenter } from './canvas/viewportCenter';
import { createEdgesSlice, type EdgesSlice } from './slices/edgesSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
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

const GROUP_SELECTION_PADDING = 24;

const DUPLICATE_OFFSET = 30;

function nodeZIndex(node: Node): number {
  return typeof node.zIndex === 'number' ? node.zIndex : 0;
}

/**
 * Full canvas store shape: the intersection of every slice. Each slice owns
 * its state keys and actions; cross-slice calls go through `get()`.
 */
export interface CanvasState
  extends UiSlice,
    ViewportSlice,
    HistorySlice,
    EdgesSlice {
  // Hydration
  _hydrated: boolean;

  // Folder-child mutations shared by canvas context menu / FocusedView / Sidebar
  absorbCardIntoFolder: (cardId: string, folderId: string) => void;

  // Multi-view
  activeViewId: string;
  addFolderChild: (folderId: string) => void;
  applyNodesChange: (changes: NodeChange[]) => void;
  applyNoteTitles: (
    titles: Record<string, string>,
    options?: { snapshot?: boolean }
  ) => void;
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
  bringNodesForward: (ids: string[]) => void;
  bringNodesToFront: (ids: string[]) => void;
  cancelTopicDraft: () => void;
  changeNodeColor: (nodeId: string) => void;
  clipboard: Node[];
  clipboardEdges: Edge[];
  collectSelectedNoteIds: () => string[];
  commitFolderChildData: (
    folderId: string,
    childId: string,
    updates: Record<string, unknown>
  ) => void;
  /** Snapshots history then updates node data — for discrete user edits (blur commits, image upload, checklist toggles, etc.). */
  commitNodeData: (nodeId: string, updates: Record<string, unknown>) => void;
  commitTopicDraft: (title: string) => Promise<string | undefined>;
  commitTopicTitle: (nodeId: string, title: string) => void;

  // Actions – clipboard
  copySelected: () => void;
  /** Copy a Topic and its descendants (internal tree edges only). */
  copyTopicBranch: (topicId: string) => void;

  // Actions – node CRUD
  createExtensionNode: (
    canvasTypeId: string,
    instanceId: string,
    rfInstance: ReactFlowInstance<any, any> | null,
    options?: CreateNodeOptions
  ) => Promise<string | undefined>;
  createNode: (
    type: CreatableCanvasNodeKind,
    rfInstance: ReactFlowInstance<any, any> | null,
    options?: CreateNodeOptions
  ) => Promise<string | undefined>;
  cutSelected: () => void;
  deleteFolderChild: (folderId: string, childId: string) => void;
  /** Deletes the unlocked nodes in `ids`; returns how many were deleted. */
  deleteNodes: (ids: string[]) => number;
  /** Remove a Topic and every descendant as one transaction. */
  deleteTopicBranch: (topicId: string) => void;
  deselectAll: () => void;
  detachNoteFromCanvas: (nodeId: string) => void;
  /** Cut a Topic's parent relation, promoting its branch to a separate tree. */
  detachTopicBranch: (topicId: string) => void;
  duplicateSelected: (offset?: number) => Promise<void>;
  /** Topic id that should enter inline title editing (F2 / keyboard entry). */
  editingTopicId: string | null;
  /** Enter the explicit Topic single-select command context (Tab/Enter). */
  enterTopicCommandContext: (topicId: string) => void;
  /** Leave Topic command context; selection may remain. */
  exitTopicCommandContext: () => void;
  groupSelected: () => void;
  hydrate: (nodes: Node[], edges: Edge[]) => void;
  moveFolderChildToCanvas: (
    folderId: string,
    childId: string,
    options?: CreateNodeOptions
  ) => void;
  moveSelectedToView: (targetViewId: string) => Promise<boolean>;

  // Helpers
  nextNodeId: () => string;
  // Core data
  nodes: Node[];
  pasteClipboard: (offset?: number) => Promise<void>;
  pinNoteToCanvas: (nodeId: string, position: { x: number; y: number }) => void;
  reset: () => void;
  /** Discard the render-only size override without changing the saved graph. */
  resetTopicEditPreview: (nodeId: string) => void;
  selectNodeInDirection: (
    direction: 'down' | 'left' | 'right' | 'up',
    options?: { extend?: boolean }
  ) => Node | null;
  sendNodesBackward: (ids: string[]) => void;
  sendNodesToBack: (ids: string[]) => void;

  // Actions – multi-view
  /**
   * Low-level view swap: clears canvas state without persisting anything.
   * User-initiated switches should go through `switchView` instead.
   */
  setActiveView: (viewId: string) => void;
  setActiveViewId: (viewId: string) => void;
  setEditingTopicId: (id: string | null) => void;

  // Actions – core
  setNodes: (updater: Node[] | ((prev: Node[]) => Node[])) => void;
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
  toggleNodeLocked: (nodeId: string) => void;
  /** Lock every node in `ids` unless all are already locked, then unlock. */
  toggleNodesLocked: (ids: string[]) => void;
  toggleStickyPinned: (nodeId: string) => void;

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

  ungroupSelected: () => void;
  updateFolderChildData: (
    folderId: string,
    childId: string,
    updates: Record<string, unknown>
  ) => void;
  updateNodeData: (nodeId: string, updates: Record<string, unknown>) => void;
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
  // -- initial state --------------------------------------------------------
  nodes: [],
  _hydrated: false,
  clipboard: [],
  clipboardEdges: [],
  activeViewId: 'default',
  views: [{ id: 'default', name: 'Default Canvas' }],
  editingTopicId: null,
  topicCommandContextId: null,
  topicDraft: null,
  topicEditPreviews: {},
  topicWritePaused: false,

  absorbCardIntoFolder: (cardId, folderId) => {
    const { nodes } = get();
    const card = nodes.find((n) => n.id === cardId);
    const folder = nodes.find((n) => n.id === folderId);
    if (!(card && folder) || folder.type !== 'folder') {
      return;
    }
    if (!isFolderChildNode(card.type, card.data as Record<string, unknown>)) {
      return;
    }
    // Preserve / synthesize noteId for card children so they map 1:1 to .md files
    // (images continue to use the imageFile attachment pattern).
    const isNoteBackedCard = card.type === 'card';
    const cardData = card.data as Record<string, unknown>;
    const existingNoteId = cardData.noteId as string | undefined;
    const childNoteId = isNoteBackedCard
      ? (existingNoteId ?? `note_${nanoid(8)}`)
      : undefined;
    const childData: Record<string, unknown> = isNoteBackedCard
      ? { ...cardData, noteId: childNoteId }
      : cardData;
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.flatMap((n) => {
        if (n.id === cardId) {
          return [];
        }
        if (n.id !== folderId) {
          return [n];
        }
        const existing = ((n.data as any).children ?? []) as Array<{
          data: Record<string, unknown>;
          id: string;
          noteId?: string;
          type?: string;
        }>;
        const children = [
          ...existing,
          {
            id: card.id,
            ...(childNoteId ? { noteId: childNoteId } : {}),
            type: card.type,
            data: childData,
            size: getNodeSize(card),
          },
        ];
        return [
          {
            ...n,
            data: {
              ...n.data,
              children,
            },
          },
        ];
      }),
      edges: s.edges.filter((e) => e.source !== cardId && e.target !== cardId),
    }));
  },

  deleteFolderChild: (folderId, childId) => {
    const folder = get().nodes.find((n) => n.id === folderId);
    const existingChildren = ((folder?.data as any)?.children ?? []) as Array<{
      data?: Record<string, unknown>;
      id: string;
      noteId?: string;
      type?: string;
    }>;
    const removed = existingChildren.find((c) => c.id === childId);
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== folderId) {
          return n;
        }
        const existing = ((n.data as any).children ?? []) as Array<{
          id: string;
        }>;
        const children = existing.filter((c) => c.id !== childId);
        return {
          ...n,
          data: {
            ...n.data,
            children,
          },
        };
      }),
    }));
    // Fire-and-forget .md cleanup. Images keep their attachment pattern, so we
    // only delete notes for card children that actually had a noteId.
    if (removed?.noteId && removed.type !== 'image') {
      rpcDeleteNote(removed.noteId).catch((error) => {
        console.error(
          '[canvasStore] Failed to delete folder child note:',
          error
        );
        toast.error(m.toast_delete_note_file_failed());
      });
    }
    // Widget children own a backing JSON file; delete it so disk does not
    // accumulate orphan widget files until the next unlinked-file sweep.
    if (removed?.type === 'widget') {
      const removedWidgetId = removed.data?.widgetId as string | undefined;
      if (removedWidgetId) {
        rpcDeleteWidget(removedWidgetId).catch((error) => {
          console.error(
            '[canvasStore] Failed to delete folder child widget:',
            error
          );
          toast.error(m.toast_delete_widget_file_failed());
        });
      }
    }
  },

  updateFolderChildData: (folderId, childId, updates) => {
    set((s) => {
      let focusedFolder = s.focusedFolder;
      const nodes = s.nodes.map((n) => {
        if (n.id !== folderId) {
          return n;
        }
        const existing = ((n.data as any).children ?? []) as Array<{
          data: Record<string, unknown>;
          id: string;
          type?: string;
        }>;
        const children = existing.map((c) =>
          c.id === childId ? { ...c, data: { ...c.data, ...updates } } : c
        );
        if (focusedFolder?.id === folderId) {
          focusedFolder = {
            ...focusedFolder,
            data: { ...focusedFolder.data, children },
          };
        }
        return {
          ...n,
          data: { ...n.data, children },
        };
      });
      return { focusedFolder, nodes };
    });
  },

  commitFolderChildData: (folderId, childId, updates) => {
    get().saveSnapshot();
    get().updateFolderChildData(folderId, childId, updates);
  },

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

  // -- core actions ---------------------------------------------------------
  setNodes: (updater) => {
    set((s) => {
      const updated =
        typeof updater === 'function' ? updater(s.nodes) : updater;
      if (updated === s.nodes) {
        return s;
      }
      const pinned = new Map(
        s.nodes.filter(isPinnedSticky).map((node) => [node.id, node])
      );
      const nodes = pinned.size
        ? updated.map((node) => {
            const previous = pinned.get(node.id);
            // Reparenting converts coordinates; moving a parent leaves its
            // children's relative positions untouched.
            if (
              !(previous && isPinnedSticky(node)) ||
              node.parentId !== previous.parentId ||
              (node.position.x === previous.position.x &&
                node.position.y === previous.position.y)
            ) {
              return node;
            }
            return { ...node, position: previous.position };
          })
        : updated;
      return {
        nodes,
        topicCommandContextId: topicCommandContextForNodes(
          s.nodes,
          nodes,
          s.topicCommandContextId
        ),
      };
    });
  },

  applyNodesChange: (changes) => {
    set((s) => {
      const nodes = applyCanvasNodeChanges(changes, s.nodes);
      if (nodes === s.nodes) {
        return s;
      }
      return {
        nodes,
        topicCommandContextId: topicCommandContextForNodes(
          s.nodes,
          nodes,
          s.topicCommandContextId
        ),
      };
    });
  },

  collectSelectedNoteIds: () =>
    collectNoteIdsFromCanvasNodes(get().nodes, { selectedOnly: true }),

  applyNoteTitles: (titles, options) => {
    const map = noteTitleMap(titles);
    if (!map) {
      return;
    }
    if (options?.snapshot !== false) {
      get().saveSnapshot();
    }
    set((s) => projectNoteTitles(s.nodes, s.focusedNode, map));
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

  updateNodeData: (nodeId, updates) => {
    set((s) => {
      // The focused view reads from `focusedNode.data`, a snapshot captured when
      // the view opened. Without syncing it here, edits made inside the focused
      // view (e.g. deleting a checklist item) write to `nodes` but the view
      // keeps rendering stale data, so the edit appears to "not work". Mirror
      // the folder-child path (see updateFolderChildData) by refreshing the
      // snapshot whenever it points at the node being updated.
      const focusedNode =
        s.focusedNode?.id === nodeId
          ? {
              ...s.focusedNode,
              data: { ...s.focusedNode.data, ...updates },
            }
          : s.focusedNode;
      return {
        focusedNode,
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
        ),
      };
    });
  },

  commitNodeData: (nodeId, updates) => {
    get().saveSnapshot();
    get().updateNodeData(nodeId, updates);
  },

  toggleStickyPinned: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (node?.type !== 'sticky') {
      return;
    }
    get().commitNodeData(nodeId, { pinned: !isPinnedSticky(node) });
  },

  toggleNodeLocked: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) {
      return;
    }
    const current = Boolean(
      (node.data as { locked?: unknown } | undefined)?.locked
    );
    get().commitNodeData(nodeId, { locked: !current });
  },

  toggleNodesLocked: (ids) => {
    const idSet = new Set(ids);
    const targets = get().nodes.filter((node) => idSet.has(node.id));
    if (targets.length === 0) {
      return;
    }
    // Mixed selections lock everything; only a fully locked selection unlocks.
    const nextLocked = targets.some(
      (node) => !(node.data as { locked?: unknown } | undefined)?.locked
    );
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((node) =>
        idSet.has(node.id)
          ? { ...node, data: { ...node.data, locked: nextLocked } }
          : node
      ),
    }));
  },

  bringNodesToFront: (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) {
      return;
    }
    const { nodes } = get();
    const targets = nodes.filter((node) => idSet.has(node.id));
    if (targets.length === 0) {
      return;
    }
    const maxZ = Math.max(0, ...nodes.map(nodeZIndex));
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((node) => {
        const index = targets.findIndex((target) => target.id === node.id);
        return index === -1 ? node : { ...node, zIndex: maxZ + index + 1 };
      }),
    }));
  },

  sendNodesToBack: (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) {
      return;
    }
    const { nodes } = get();
    const targets = nodes.filter((node) => idSet.has(node.id));
    if (targets.length === 0) {
      return;
    }
    const minZ = Math.min(0, ...nodes.map(nodeZIndex));
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((node) => {
        const index = targets.findIndex((target) => target.id === node.id);
        return index === -1
          ? node
          : { ...node, zIndex: minZ - targets.length + index };
      }),
    }));
  },

  bringNodesForward: (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((node) =>
        idSet.has(node.id) ? { ...node, zIndex: nodeZIndex(node) + 1 } : node
      ),
    }));
  },

  sendNodesBackward: (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((node) =>
        idSet.has(node.id) ? { ...node, zIndex: nodeZIndex(node) - 1 } : node
      ),
    }));
  },

  deselectAll: () => {
    set((s) => ({
      edges: s.edges.map((edge) =>
        edge.selected ? { ...edge, selected: false } : edge
      ),
      nodes: s.nodes.map((node) =>
        node.selected ? { ...node, selected: false } : node
      ),
      topicCommandContextId: null,
    }));
  },

  selectNodeInDirection: (direction, options) => {
    const { nodes } = get();
    const selectableNodes = nodes.filter(
      (node) => !(node.data as Record<string, unknown>).detached
    );
    if (selectableNodes.length === 0) {
      return null;
    }
    const absoluteRects = buildAbsoluteRects(selectableNodes);
    const centerOf = (node: Node) => {
      const rect = absoluteRects.get(node.id);
      if (rect) {
        return {
          x: (rect.left + rect.right) / 2,
          y: (rect.top + rect.bottom) / 2,
        };
      }
      const size = getNodeSize(node);
      return {
        x: node.position.x + size.width / 2,
        y: node.position.y + size.height / 2,
      };
    };

    const selectedNodes = selectableNodes.filter((node) => node.selected);
    const compareExtendAnchor = (a: Node, b: Node): number => {
      const ac = centerOf(a);
      const bc = centerOf(b);
      if (direction === 'right') {
        return bc.x - ac.x || ac.y - bc.y || a.id.localeCompare(b.id);
      }
      if (direction === 'left') {
        return ac.x - bc.x || ac.y - bc.y || a.id.localeCompare(b.id);
      }
      if (direction === 'down') {
        return bc.y - ac.y || ac.x - bc.x || a.id.localeCompare(b.id);
      }
      return ac.y - bc.y || ac.x - bc.x || a.id.localeCompare(b.id);
    };
    const pickExtendAnchor = () => {
      if (selectedNodes.length === 0) {
        return selectableNodes[0]!;
      }
      let best = selectedNodes[0]!;
      for (const node of selectedNodes.slice(1)) {
        if (compareExtendAnchor(node, best) < 0) {
          best = node;
        }
      }
      return best;
    };

    const current =
      options?.extend === true
        ? pickExtendAnchor()
        : (selectedNodes[0] ?? selectableNodes[0]!);
    const currentCenter = centerOf(current);
    const candidates: Array<{
      node: Node;
      primary: number;
      secondary: number;
    }> = [];
    for (const node of selectableNodes) {
      if (node.id === current.id) {
        continue;
      }
      const center = centerOf(node);
      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;
      const primary =
        direction === 'right'
          ? dx
          : direction === 'left'
            ? -dx
            : direction === 'down'
              ? dy
              : -dy;
      if (primary <= 0) {
        continue;
      }
      const secondary =
        direction === 'left' || direction === 'right'
          ? Math.abs(dy)
          : Math.abs(dx);
      candidates.push({ node, primary, secondary });
    }
    candidates.sort(
      (a, b) =>
        a.primary - b.primary ||
        a.secondary - b.secondary ||
        a.node.id.localeCompare(b.node.id)
    );

    const target = candidates[0]?.node ?? current;
    set((s) => {
      const nodes = s.nodes.map((node) => ({
        ...node,
        selected:
          options?.extend === true
            ? Boolean(node.selected || node.id === target.id)
            : node.id === target.id,
      }));
      return {
        nodes,
        topicCommandContextId: topicCommandContextForNodes(
          s.nodes,
          nodes,
          s.topicCommandContextId
        ),
      };
    });
    return target;
  },

  groupSelected: () => {
    const { nodes } = get();
    const selected = nodes.filter(
      (node) => node.selected && isGroupChildNode(node.type)
    );
    if (selected.length === 0) {
      return;
    }
    const absoluteRects = buildAbsoluteRects(nodes);
    const rects = selected
      .map((node) => absoluteRects.get(node.id))
      .filter((rect) => rect !== undefined);
    if (rects.length === 0) {
      return;
    }

    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const groupPosition = {
      x: left - GROUP_SELECTION_PADDING,
      y: top - GROUP_SELECTION_PADDING,
    };
    const groupWidth = right - left + GROUP_SELECTION_PADDING * 2;
    const groupHeight = bottom - top + GROUP_SELECTION_PADDING * 2;
    const groupSpec = buildNewNodeSpec('group');
    const groupId = get().nextNodeId();
    const groupNode: Node = {
      ...groupSpec.base,
      id: groupId,
      position: groupPosition,
      selected: true,
      style: {
        ...groupSpec.base.style,
        width: groupWidth,
        height: groupHeight,
      },
    };
    const selectedIds = new Set(selected.map((node) => node.id));

    get().saveSnapshot();
    markNodesEntering([groupId]);
    set((s) => ({
      nodes: sortNodesByParent([
        ...s.nodes.map((node) => {
          if (!selectedIds.has(node.id)) {
            return { ...node, selected: false };
          }
          const rect = absoluteRects.get(node.id);
          const { parentId: _parentId, extent: _extent, ...rest } = node as any;
          return {
            ...rest,
            parentId: groupId,
            extent: 'parent' as const,
            position: {
              x: (rect?.left ?? node.position.x) - groupPosition.x,
              y: (rect?.top ?? node.position.y) - groupPosition.y,
            },
            selected: false,
          } as Node;
        }),
        groupNode,
      ]),
    }));
  },

  ungroupSelected: () => {
    const { nodes } = get();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const selected = nodes.filter((node) => node.selected);
    const selectedGroupIds = new Set<string>();
    const selectedChildIds = new Set<string>();
    for (const node of selected) {
      if (node.type === 'group') {
        selectedGroupIds.add(node.id);
        continue;
      }
      const parent = node.parentId ? byId.get(node.parentId) : null;
      if (parent?.type === 'group') {
        selectedChildIds.add(node.id);
      }
    }

    if (selectedGroupIds.size === 0 && selectedChildIds.size === 0) {
      return;
    }

    const absoluteRects = buildAbsoluteRects(nodes);
    get().saveSnapshot();
    set((s) => {
      const detachIds = new Set(selectedChildIds);
      for (const node of s.nodes) {
        if (node.parentId && selectedGroupIds.has(node.parentId)) {
          detachIds.add(node.id);
        }
      }
      return {
        edges: s.edges.filter(
          (edge) =>
            !(
              selectedGroupIds.has(edge.source) ||
              selectedGroupIds.has(edge.target)
            )
        ),
        nodes: sortNodesByParent(
          s.nodes.flatMap((node) => {
            if (selectedGroupIds.has(node.id)) {
              return [];
            }
            if (!detachIds.has(node.id)) {
              return [{ ...node, selected: false }];
            }
            const rect = absoluteRects.get(node.id);
            const {
              parentId: _parentId,
              extent: _extent,
              ...rest
            } = node as any;
            return [
              {
                ...rest,
                position: {
                  x: rect?.left ?? node.position.x,
                  y: rect?.top ?? node.position.y,
                },
                selected: true,
              } as Node,
            ];
          })
        ),
      };
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

  // -- clipboard ------------------------------------------------------------
  copySelected: () => {
    set((s) => {
      const selected = s.nodes.filter((n) => n.selected);
      if (selected.length === 0) {
        return s;
      }
      const selectedIds = new Set(selected.map((n) => n.id));
      return {
        clipboard: selected.map(cleanNodeForClipboard),
        clipboardEdges: getInternalEdgesForNodes(s.edges, selectedIds),
      };
    });
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

  pasteClipboard: async (offset = 30) => {
    const { clipboard, nodes: currentNodes } = get();
    if (clipboard.length === 0) {
      return;
    }
    if (!(await hasNodeQuota(currentNodes, countCountedNodes(clipboard)))) {
      return;
    }
    const latest = get();
    if (latest.clipboard.length === 0) {
      return;
    }
    get().saveSnapshot();
    const pasted = buildPastedClipboard(
      latest.clipboard,
      latest.clipboardEdges,
      latest.nodes,
      offset
    );
    let pastedNodes = graphContainsWidgetReference(pasted.nodes)
      ? await cloneWidgetReferences(pasted.nodes)
      : pasted.nodes;
    if (graphContainsExtensionReference(pastedNodes)) {
      pastedNodes = await cloneExtensionReferences(pastedNodes);
    }
    markNodesEntering(pastedNodes.map((n) => n.id));
    set((s) => ({
      edges: [...s.edges, ...pasted.edges],
      nodes: sortNodesByParent([
        ...s.nodes.map((n) => ({ ...n, selected: false })),
        ...pastedNodes,
      ]),
    }));
  },

  duplicateSelected: async (offset = DUPLICATE_OFFSET) => {
    const { nodes } = get();
    const selected = nodes.filter((node) => node.selected);
    if (selected.length === 0) {
      return;
    }
    if (!(await hasNodeQuota(nodes, countCountedNodes(selected)))) {
      return;
    }
    const latest = get();
    const selectedLatest = latest.nodes.filter((node) => node.selected);
    if (selectedLatest.length === 0) {
      return;
    }
    const selectedIds = new Set(selectedLatest.map((node) => node.id));
    const pasted = buildPastedClipboard(
      selectedLatest.map(cleanNodeForClipboard),
      getInternalEdgesForNodes(latest.edges, selectedIds),
      latest.nodes,
      offset
    );
    get().saveSnapshot();
    let pastedNodes = graphContainsWidgetReference(pasted.nodes)
      ? await cloneWidgetReferences(pasted.nodes)
      : pasted.nodes;
    if (graphContainsExtensionReference(pastedNodes)) {
      pastedNodes = await cloneExtensionReferences(pastedNodes);
    }
    markNodesEntering(pastedNodes.map((node) => node.id));
    set((s) => ({
      edges: [...s.edges, ...pasted.edges],
      nodes: sortNodesByParent([
        ...s.nodes.map((node) => ({ ...node, selected: false })),
        ...pastedNodes,
      ]),
    }));
  },

  cutSelected: () => {
    const selectedIds: string[] = [];
    for (const node of get().nodes) {
      if (node.selected) {
        selectedIds.push(node.id);
      }
    }
    if (selectedIds.length === 0) {
      return;
    }
    get().copySelected();
    get().deleteNodes(selectedIds);
  },

  // -- node CRUD ------------------------------------------------------------
  nextNodeId: () => `node-${nanoid(8)}`,

  createNode: async (type, rfInstance, options) => {
    const spec = buildNewNodeSpec(type);
    const size = options?.size ?? spec.size;
    if (
      COUNTED_NODE_TYPES.has(spec.base.type ?? '') &&
      !(await hasNodeQuota(get().nodes))
    ) {
      return;
    }

    const center = options?.anchorCenter ?? getViewportCenter(rfInstance);
    const anchor = options?.anchor ?? {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
    };

    const { nodes } = get();
    const specType = spec.base.type ?? 'card';
    const { placement, parentId, canPlace } = resolveNodePlacement({
      anchor,
      canEnterGroup: options?.canEnterGroup,
      nodes,
      newType: specType,
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

    get().saveSnapshot();
    const id = get().nextNodeId();
    const newNode: Node = {
      ...spec.base,
      id,
      position,
      ...(options?.size
        ? {
            style: {
              ...(spec.base.style as Record<string, unknown>),
              width: size.width,
              height: size.height,
            },
          }
        : {}),
      data: {
        ...(spec.base.data as Record<string, unknown>),
        ...(options?.data ?? {}),
      },
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    };
    markNodesEntering([id]);
    set((s) => ({ nodes: sortNodesByParent([...s.nodes, newNode]) }));

    if (
      options?.focusViewport !== false &&
      typeof rfInstance?.setCenter === 'function'
    ) {
      suppressViewportPersist(300);
      rfInstance.setCenter(
        placement.x + size.width / 2,
        placement.y + size.height / 2,
        {
          ...viewportMotion(VIEWPORT_PAN_MS),
          zoom: rfInstance.getViewport().zoom,
        }
      );
    }

    return id;
  },

  createExtensionNode: async (
    canvasTypeId,
    instanceId,
    rfInstance,
    options
  ) => {
    const size = options?.size ?? { width: 240, height: 200 };
    const viewport = rfInstance?.getViewport();
    const zoom = viewport?.zoom ?? 1;
    const viewportCenter = rfInstance?.screenToFlowPosition
      ? rfInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        })
      : {
          x: (window.innerWidth / 2 - (viewport?.x ?? 0)) / zoom,
          y: (window.innerHeight / 2 - (viewport?.y ?? 0)) / zoom,
        };
    const center = options?.anchorCenter ?? viewportCenter;
    const anchor = options?.anchor ?? {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
    };
    const { nodes } = get();
    const { placement, parentId, canPlace } = resolveNodePlacement({
      anchor,
      nodes,
      newType: EXTENSION_NODE_TYPE,
      size,
      canEnterGroup: true,
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
    get().saveSnapshot();
    const id = get().nextNodeId();
    const newNode: Node = {
      id,
      type: EXTENSION_NODE_TYPE,
      position,
      style: { width: size.width, height: size.height },
      data: {
        canvasTypeId,
        instanceId,
        ...(options?.data ?? {}),
      },
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    };
    markNodesEntering([id]);
    set((s) => ({ nodes: sortNodesByParent([...s.nodes, newNode]) }));
    if (
      options?.focusViewport !== false &&
      typeof rfInstance?.setCenter === 'function'
    ) {
      suppressViewportPersist(300);
      rfInstance.setCenter(
        placement.x + size.width / 2,
        placement.y + size.height / 2,
        { ...viewportMotion(VIEWPORT_PAN_MS), zoom }
      );
    }
    return id;
  },

  deleteNodes: (ids) => {
    const lockedIds = new Set(
      get()
        .nodes.filter(isLockedNode)
        .map((node) => node.id)
    );
    const idSet = new Set(ids.filter((id) => !lockedIds.has(id)));
    if (ids.some((id) => lockedIds.has(id))) {
      toast.error(m.toast_locked_nodes_not_deleted());
    }
    if (idSet.size === 0) {
      return 0;
    }
    // Collect backing widget files for top-level widget nodes being removed.
    // Folder children are detached (not deleted) when a folder is removed, so
    // their widget files are intentionally left intact here.
    const widgetIdsToDelete: string[] = [];
    for (const node of get().nodes) {
      if (idSet.has(node.id) && node.type === 'widget') {
        const widgetId = (node.data as Record<string, unknown> | undefined)
          ?.widgetId;
        if (typeof widgetId === 'string' && widgetId) {
          widgetIdsToDelete.push(widgetId);
        }
      }
    }
    get().saveSnapshot();
    set((s) => {
      const usedNodeIds = new Set<string>();
      for (const node of s.nodes) {
        if (!idSet.has(node.id)) {
          usedNodeIds.add(node.id);
        }
      }
      const detachedFolderChildren = s.nodes.flatMap((node) => {
        if (!idSet.has(node.id) || node.type !== 'folder') {
          return [];
        }
        const children = ((node.data as any)?.children ??
          []) as FolderChildEntry[];
        return children.map((child) =>
          folderChildToDetachedNode(child, usedNodeIds)
        );
      });

      return settleTopicsAfterDelete(
        s.nodes,
        s.edges,
        sortNodesByParent([
          ...s.nodes.flatMap((n) => {
            if (idSet.has(n.id)) {
              return [];
            }
            if (n.parentId && idSet.has(n.parentId)) {
              const { parentId, extent, ...rest } = n as any;
              return [rest as Node];
            }
            return [n];
          }),
          ...detachedFolderChildren,
        ]),
        s.edges.filter((e) => !(idSet.has(e.source) || idSet.has(e.target))),
        idSet
      );
    });
    // Fire-and-forget widget file cleanup for removed top-level widget nodes.
    for (const widgetId of widgetIdsToDelete) {
      rpcDeleteWidget(widgetId).catch((error) => {
        console.error('[canvasStore] Failed to delete widget file:', error);
        toast.error(m.toast_delete_widget_file_failed());
      });
    }
    return idSet.size;
  },

  changeNodeColor: (nodeId) => {
    const node = get().nodes.find((entry) => entry.id === nodeId);
    if (!node || node.type === 'extension') {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId) {
          return n;
        }
        if (n.type === 'group') {
          const idx = GROUP_COLORS.indexOf((n.data as any).color ?? 'blue');
          return {
            ...n,
            data: {
              ...n.data,
              color: GROUP_COLORS[(idx + 1) % GROUP_COLORS.length],
            },
          };
        }
        if (n.type === 'sticky') {
          const idx = STICKY_COLORS.indexOf(
            (n.data as any).color ?? STICKY_COLORS[0]
          );
          return {
            ...n,
            data: {
              ...n.data,
              color: STICKY_COLORS[(idx + 1) % STICKY_COLORS.length],
            },
          };
        }
        if (n.type === 'image') {
          const idx = CARD_COLORS.indexOf((n.data as any).color ?? '#FFFFFF');
          return {
            ...n,
            data: {
              ...n.data,
              color: CARD_COLORS[(idx + 1) % CARD_COLORS.length],
            },
          };
        }
        const idx = CARD_COLORS.indexOf((n.data as any).color ?? '#FFFFFF');
        return {
          ...n,
          data: {
            ...n.data,
            color: CARD_COLORS[(idx + 1) % CARD_COLORS.length],
          },
        };
      }),
    }));
  },

  addFolderChild: (folderId) => {
    get().saveSnapshot();
    const childId = `child-${nanoid(8)}`;
    // Each folder card-child maps 1:1 to an independent .md file (M5). The
    // actual file is created lazily by saveManifest; the noteId is stamped
    // up-front so the renderer and saver treat it like a top-level card.
    const noteId = `note_${nanoid(8)}`;
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== folderId) {
          return n;
        }
        const children = [
          ...((n.data as any).children || []),
          {
            id: childId,
            noteId,
            type: 'card' as const,
            data: {
              type: 'text' as const,
              title: '',
              content: '',
              color: '#FFFFFF',
              noteId,
            },
          },
        ];
        return {
          ...n,
          data: { ...n.data, children },
        };
      }),
    }));
  },

  moveFolderChildToCanvas: (folderId, childId, options) => {
    const { nodes } = get();
    const folder = nodes.find((node) => node.id === folderId);
    const children = ((folder?.data as any)?.children ??
      []) as FolderChildEntry[];
    const child = children.find((item) => item.id === childId);
    if (!(folder && child)) {
      return;
    }

    const spec = resolveFolderChildSpec(child);
    const childSize = resolveFolderChildSize(child, spec.size);
    const anchor =
      options?.anchor ??
      (options?.anchorCenter
        ? {
            x: options.anchorCenter.x - childSize.width / 2,
            y: options.anchorCenter.y - childSize.height / 2,
          }
        : {
            x: folder.position.x + (FOLDER_W - childSize.width) / 2,
            y: folder.position.y + FOLDER_H + 32,
          });

    get().saveSnapshot();
    set((s) => {
      const remainingChildren = children.filter((item) => item.id !== childId);
      const nextFolderData = {
        ...folder.data,
        children: remainingChildren,
      };
      const existingIds = new Set(s.nodes.map((node) => node.id));
      const restoredNodeId = existingIds.has(child.id)
        ? `node-${nanoid(8)}`
        : child.id;
      // Preserve the child's full data (including noteId) so the restored
      // top-level card keeps pointing at the same .md file on disk.
      const restoredNode: Node = {
        ...spec.base,
        id: restoredNodeId,
        type: spec.base.type,
        data: child.data,
        position: anchor,
        style: {
          ...spec.base.style,
          width: childSize.width,
          height: childSize.height,
        },
        selected: true,
      };

      return {
        focusedFolder:
          s.focusedFolder?.id === folderId
            ? {
                ...s.focusedFolder,
                data: nextFolderData,
              }
            : s.focusedFolder,
        nodes: sortNodesByParent([
          ...s.nodes.map((node) => {
            if (node.id === folderId) {
              return { ...node, data: nextFolderData, selected: false };
            }
            return { ...node, selected: false };
          }),
          restoredNode,
        ]),
      };
    });
  },

  // -- detached notes -------------------------------------------------------
  pinNoteToCanvas: (nodeId, position) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!(node && (node.data as any).detached)) {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId) {
          return n;
        }
        const spec = n.type ? findSpecByNodeType(n.type) : null;
        const { detached: _, ...cleanData } = n.data as Record<string, unknown>;
        return {
          ...n,
          position,
          style:
            n.style ??
            (spec
              ? { width: spec.size.width, height: spec.size.height }
              : { width: CARD_W, height: CARD_H }),
          data: cleanData,
        };
      }),
    }));
  },

  detachNoteFromCanvas: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (
      !(
        node &&
        isDetachableNode(node.type, node.data as Record<string, unknown>)
      )
    ) {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId) {
          return n;
        }
        return {
          ...n,
          position: { x: 0, y: 0 },
          data: { ...n.data, detached: true },
        };
      }),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
  },
}));
