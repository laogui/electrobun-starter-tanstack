import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  ReactFlowInstance,
} from '@xyflow/react';
import { addEdge, applyEdgeChanges } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { create } from 'zustand';
import { applyCanvasNodeChanges } from '@/lib/applyCanvasNodeChanges';
import {
  isFolderChildNode,
  isGroupChildNode,
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
import { buildAbsoluteRects, getNodeSize } from '@/lib/collision';
import { CARD_COLORS, GROUP_COLORS, STICKY_COLORS } from '@/lib/colorUtils';
import type { CreatableCanvasNodeKind } from '@/lib/contentTypes';
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
import { getCachedLicense, refreshLicense } from '@/lib/rpc-license';
import type { UndoRedoState } from '@/lib/undoRedo';
import {
  createUndoRedoState,
  pushSnapshot,
  redo as redoSnapshot,
  undo as undoSnapshot,
} from '@/lib/undoRedo';
import {
  shouldPersistViewport,
  suppressViewportPersist,
} from '@/lib/viewportPersist';
import type { WidgetKind } from '@/lib/widgetTypes';

import * as m from '../../paraglide/messages.js';

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
  viewId: string;
}

export interface CreateNodeOptions {
  /** Top-left anchor in flow coords. Takes precedence over `anchorCenter`. */
  anchor?: { x: number; y: number };
  /** Desired center of the new node in flow coords. */
  anchorCenter?: { x: number; y: number };
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

interface FolderChildEntry {
  data: Record<string, unknown>;
  id: string;
  noteId?: string;
  type?: string;
}

const GROUP_SELECTION_PADDING = 24;
const DUPLICATE_OFFSET = 30;

function cleanNodeForClipboard(node: Node): Node {
  const { isHidden, isDropTarget, ...cleanData } = node.data as any;
  return { ...node, data: cleanData };
}

function cleanEdgeForClipboard(edge: Edge): Edge {
  const { selected: _selected, ...clean } = edge as Edge & {
    selected?: boolean;
  };
  return clean as Edge;
}

function getInternalEdgesForNodes(edges: Edge[], nodeIds: Set<string>): Edge[] {
  const internalEdges: Edge[] = [];
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      internalEdges.push(cleanEdgeForClipboard(edge));
    }
  }
  return internalEdges;
}

function nodeZIndex(node: Node): number {
  return typeof node.zIndex === 'number' ? node.zIndex : 0;
}

function buildPastedClipboard(
  clipboard: Node[],
  clipboardEdges: Edge[],
  currentNodes: Node[],
  offset: number
): { edges: Edge[]; nodes: Node[] } {
  const existingIds = new Set(currentNodes.map((n) => n.id));
  const clipboardIds = new Set(clipboard.map((n) => n.id));

  const idMap = new Map<string, string>(
    clipboard.map((n) => [n.id, `paste-${nanoid(8)}`])
  );

  const nodes = clipboard.map((n) => {
    const newId = idMap.get(n.id)!;
    const { parentId, extent, ...rest } = n as any;
    const remappedParentId =
      parentId != null
        ? clipboardIds.has(parentId)
          ? idMap.get(parentId)
          : existingIds.has(parentId)
            ? parentId
            : null
        : null;

    return {
      ...rest,
      ...(remappedParentId != null
        ? { parentId: remappedParentId, extent }
        : {}),
      id: newId,
      position: { x: n.position.x + offset, y: n.position.y + offset },
      selected: true,
    } as Node;
  });

  const edges = clipboardEdges.flatMap((edge) => {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!(source && target)) {
      return [];
    }
    const rest = cleanEdgeForClipboard(edge);
    return [
      {
        ...rest,
        id: `paste-edge-${nanoid(8)}`,
        source,
        target,
      } as Edge,
    ];
  });

  return { edges, nodes };
}

/**
 * Detect whether any node in the graph references a widget - either as a
 * top-level widget node or as a widget child nested inside a folder's
 * `data.children`. Used to gate cloning so folder-only-widget paste/duplicate
 * is not silently skipped.
 */
function graphContainsWidgetReference(nodes: Node[]): boolean {
  for (const node of nodes) {
    if (node.type === 'widget') {
      return true;
    }
    if (node.type === 'folder') {
      const children = (node.data as any)?.children as
        | Array<{ type?: string }>
        | undefined;
      if (
        Array.isArray(children) &&
        children.some((c) => c?.type === 'widget')
      ) {
        return true;
      }
    }
  }
  return false;
}

async function cloneWidgetReferences(nodes: Node[]): Promise<Node[]> {
  const { useWidgetStore } = await import('@/store/widgetStore');
  const { cloneWidget, createWidget } = useWidgetStore.getState();

  async function cloneWidgetId(
    widgetId: unknown,
    fallbackKind: unknown
  ): Promise<string | null> {
    if (typeof widgetId !== 'string' || !widgetId) {
      return null;
    }
    const record = await cloneWidget(widgetId);
    if (record) {
      return record.id;
    }
    // Cloning the backing record failed. Rather than reuse the source id (which
    // would silently couple the original and the copy to the same JSON file),
    // create an independent empty widget of the same kind so the copy stands
    // alone. If that also fails, signal the caller to drop the node.
    const kind =
      typeof fallbackKind === 'string'
        ? (fallbackKind as WidgetKind)
        : 'checklist';
    const fallback = await createWidget(kind);
    if (!fallback) {
      toast.error('Failed to clone a widget; the copy was skipped.');
      return null;
    }
    return fallback.id;
  }

  const results = await Promise.all(
    nodes.map(async (node) => {
      if (node.type === 'widget') {
        const data = node.data as Record<string, unknown>;
        const clonedId = await cloneWidgetId(data.widgetId, data.kind);
        if (!clonedId) {
          return null;
        }
        return {
          ...node,
          data: {
            ...data,
            widgetId: clonedId,
          },
        };
      }

      if (node.type === 'folder') {
        const data = node.data as Record<string, unknown>;
        const children = data?.children;
        if (!Array.isArray(children)) {
          return node;
        }
        const nextChildren = await Promise.all(
          children.map(async (child: any) => {
            if (!child || child.type !== 'widget') {
              return child;
            }
            const childData = child.data as Record<string, unknown> | undefined;
            const clonedId = await cloneWidgetId(
              childData?.widgetId,
              childData?.kind
            );
            if (!clonedId) {
              return null;
            }
            return {
              ...child,
              data: { ...(childData ?? {}), widgetId: clonedId },
            };
          })
        );
        // Drop any folder children whose widget could not be materialized.
        const filteredChildren = nextChildren.filter((c) => c !== null);
        return {
          ...node,
          data: { ...data, children: filteredChildren },
        };
      }

      return node;
    })
  );
  return results.filter((node): node is Node => node !== null);
}

function uniqueDetachedNodeId(
  candidateId: string,
  usedNodeIds: Set<string>
): string {
  let id = candidateId;
  while (usedNodeIds.has(id)) {
    id = `node-${nanoid(8)}`;
  }
  usedNodeIds.add(id);
  return id;
}

function uniqueEdgeId(candidateId: string, usedEdgeIds: Set<string>): string {
  let id = candidateId;
  while (usedEdgeIds.has(id)) {
    id = `edge-${nanoid(8)}`;
  }
  usedEdgeIds.add(id);
  return id;
}

function resolveFolderChildSpec(childType: string | undefined) {
  if (!childType) {
    return buildNewNodeSpec('card');
  }
  const spec = findSpecByNodeType(childType);
  if (!(spec && isFolderChildNode(spec.nodeType))) {
    return buildNewNodeSpec('card');
  }
  return buildNewNodeSpec(spec.kind);
}

function folderChildToDetachedNode(
  child: FolderChildEntry,
  usedNodeIds: Set<string>
): Node {
  const spec = resolveFolderChildSpec(child.type);
  const {
    isDropTarget: _isDropTarget,
    isHidden: _isHidden,
    ...data
  } = child.data;
  return {
    id: uniqueDetachedNodeId(child.id, usedNodeIds),
    type: spec.base.type,
    position: { x: 0, y: 0 },
    style: spec.base.style,
    data: {
      ...data,
      ...(child.noteId && spec.base.type === 'card'
        ? { noteId: child.noteId }
        : {}),
      detached: true,
    },
  };
}

// `buildNewNodeSpec` (and its result shape) now lives in
// `@/lib/canvasNodeRegistry` so all node defaults (size, data, type) come from
// a single registry.

export interface CanvasState {
  // Hydration
  _hydrated: boolean;

  // Undo / Redo
  _undoRedo: UndoRedoState;

  // Folder-child mutations shared by canvas context menu / FocusedView / Sidebar
  absorbCardIntoFolder: (cardId: string, folderId: string) => void;

  /**
   * Active tag filters (OR semantics, case-insensitive). When non-empty,
   * cards that do not carry at least one of these tags are dimmed on the
   * canvas. Closing the tag sidebar clears this list — see
   * {@link setTagSidebarOpen}.
   */
  activeTagFilters: string[];

  // Multi-view
  activeViewId: string;
  addConnection: (
    connection: Connection,
    options?: AddConnectionOptions
  ) => void;
  addFolderChild: (folderId: string) => void;
  applyEdgesChange: (changes: EdgeChange[]) => void;
  applyNodesChange: (changes: NodeChange[]) => void;
  bringNodesForward: (ids: string[]) => void;
  bringNodesToFront: (ids: string[]) => void;
  canRedo: () => boolean;
  canUndo: () => boolean;
  changeNodeColor: (nodeId: string) => void;
  /** Drop every active tag filter. */
  clearTagFilters: () => void;
  clipboard: Node[];
  clipboardEdges: Edge[];
  /** Snapshots history then updates edge data — for discrete user edits (label commit, etc.). */
  commitEdgeData: (edgeId: string, updates: Record<string, unknown>) => void;
  commitFolderChildData: (
    folderId: string,
    childId: string,
    updates: Record<string, unknown>
  ) => void;
  /** Snapshots history then updates node data — for discrete user edits (blur commits, image upload, checklist toggles, etc.). */
  commitNodeData: (nodeId: string, updates: Record<string, unknown>) => void;

  // Actions – clipboard
  copySelected: () => void;

  createMenuOpen: boolean;

  // Actions – node CRUD
  createNode: (
    type: CreatableCanvasNodeKind,
    rfInstance: ReactFlowInstance<any, any> | null,
    options?: CreateNodeOptions
  ) => Promise<string | undefined>;
  cutSelected: () => void;
  deleteEdge: (edgeId: string) => void;
  deleteFolderChild: (folderId: string, childId: string) => void;
  deleteNodes: (ids: string[]) => void;
  deselectAll: () => void;
  detachNoteFromCanvas: (nodeId: string) => void;
  duplicateSelected: (offset?: number) => Promise<void>;
  edges: Edge[];

  // Actions – edge
  editingEdgeId: string | null;
  /** Folder id whose info (name + description) dialog is open. */
  editingFolderId: string | null;
  /** Sticky id that should enter inline text editing (driven by Enter key). */
  editingStickyId: string | null;
  /** Card id whose TagEditor should auto-open (driven by context-menu action). */
  editingTagNodeId: string | null;
  focusedFolder: FocusedItem | null;

  // UI state
  focusedNode: FocusedItem | null;
  groupSelected: () => void;
  hydrate: (nodes: Node[], edges: Edge[]) => void;

  // Library popup (browse notes on the current canvas)
  libraryOpen: boolean;
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

  // Search
  pendingSearchQuery: string | null;
  pendingSearchTarget: PendingSearchTarget | null;
  pinNoteToCanvas: (nodeId: string, position: { x: number; y: number }) => void;
  redo: () => void;
  /** Asset/image card id whose displayName is in inline-rename mode. */
  renamingNodeId: string | null;
  reset: () => void;
  saveSnapshot: () => void;
  searchOpen: boolean;
  selectNodeInDirection: (
    direction: 'down' | 'left' | 'right' | 'up',
    options?: { extend?: boolean }
  ) => Node | null;
  sendNodesBackward: (ids: string[]) => void;
  sendNodesToBack: (ids: string[]) => void;

  /** Replace the entire active-tag-filters list. */
  setActiveTagFilters: (tags: string[]) => void;

  // Actions – multi-view
  /**
   * Low-level view swap: clears canvas state without persisting anything.
   * User-initiated switches should go through `switchView` instead.
   */
  setActiveView: (viewId: string) => void;
  setActiveViewId: (viewId: string) => void;
  setCreateMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setEditingEdgeId: (id: string | null) => void;
  setEditingFolderId: (id: string | null) => void;
  setEditingStickyId: (id: string | null) => void;
  setEditingTagNodeId: (id: string | null) => void;
  setFocusedFolder: (v: FocusedItem | null) => void;

  // Actions – UI
  setFocusedNode: (v: FocusedItem | null) => void;
  setLibraryOpen: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Actions – core
  setNodes: (updater: Node[] | ((prev: Node[]) => Node[])) => void;
  setPendingSearchQuery: (query: string | null) => void;
  setPendingSearchTarget: (target: PendingSearchTarget | null) => void;
  setRenamingNodeId: (id: string | null) => void;
  setSearchOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSettingsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setTagSidebarOpen: (v: boolean | ((prev: boolean) => boolean)) => void;

  // In-window settings dialog
  settingsOpen: boolean;
  /**
   * User-confirmed camera for the active view. Session-only (in-memory):
   * restored when re-entering a view in the same app session; cold start fits
   * the canvas to the window instead. Never written to disk.
   */
  sessionViewport: CanvasViewport | null;
  setViewport: (
    viewport: CanvasViewport | null,
    options?: { persist?: boolean }
  ) => void;
  setViews: (views: Array<{ id: string; name: string }>) => void;
  /**
   * Flush the current canvas to disk, then switch to `viewId`. Resolves to
   * `false` (and leaves the current view active) when the flush fails, so
   * callers can surface an error instead of silently dropping edits.
   */
  switchView: (viewId: string) => Promise<boolean>;

  // Tag filter sidebar (workspace-wide tag list)
  tagSidebarOpen: boolean;
  toggleLibrary: () => void;
  toggleNodeLocked: (nodeId: string) => void;
  /** Lock every node in `ids` unless all are already locked, then unlock. */
  toggleNodesLocked: (ids: string[]) => void;
  /** Toggle a single tag in/out of the active filters (case-insensitive). */
  toggleTagFilter: (tag: string) => void;
  toggleTagSidebar: () => void;
  undo: () => void;

  ungroupSelected: () => void;
  updateEdgeData: (edgeId: string, updates: Record<string, unknown>) => void;
  updateFolderChildData: (
    folderId: string,
    childId: string,
    updates: Record<string, unknown>
  ) => void;
  updateNodeData: (nodeId: string, updates: Record<string, unknown>) => void;

  /**
   * Live React Flow camera — may differ from sessionViewport after
   * programmatic moves (search jump, focus, export fit).
   */
  viewport: CanvasViewport | null;
  views: Array<{ id: string; name: string }>;
  /**
   * Per-view session camera cache. Survives view switches within the process;
   * cleared on full reset / app quit (never disk-backed).
   */
  _sessionViewports: Record<string, CanvasViewport>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCanvasStore = create<CanvasState>((set, get) => ({
  // -- initial state --------------------------------------------------------
  nodes: [],
  edges: [],
  _hydrated: false,
  focusedNode: null,
  focusedFolder: null,
  createMenuOpen: false,
  clipboard: [],
  clipboardEdges: [],
  activeViewId: 'default',
  views: [{ id: 'default', name: 'Default Canvas' }],
  editingEdgeId: null,
  editingFolderId: null,
  editingStickyId: null,
  editingTagNodeId: null,
  renamingNodeId: null,
  _undoRedo: createUndoRedoState(),
  searchOpen: false,
  settingsOpen: false,
  pendingSearchQuery: null,
  pendingSearchTarget: null,
  libraryOpen: false,
  tagSidebarOpen: false,
  activeTagFilters: [],
  viewport: null,
  sessionViewport: null,
  _sessionViewports: {},

  setLibraryOpen: (v) => {
    set((s) => ({
      libraryOpen: typeof v === 'function' ? v(s.libraryOpen) : v,
    }));
  },
  toggleLibrary: () => {
    set((s) => ({ libraryOpen: !s.libraryOpen }));
  },

  // Closing the tag sidebar always clears active filters — the sidebar is
  // the *only* surface for managing them, so leaving them set while the
  // panel is hidden creates an invisible "why are my cards dimmed?" trap.
  setTagSidebarOpen: (v) => {
    set((s) => {
      const next = typeof v === 'function' ? v(s.tagSidebarOpen) : v;
      if (next === s.tagSidebarOpen) {
        return s;
      }
      return {
        tagSidebarOpen: next,
        activeTagFilters: next ? s.activeTagFilters : [],
      };
    });
  },
  toggleTagSidebar: () => {
    get().setTagSidebarOpen(!get().tagSidebarOpen);
  },
  setActiveTagFilters: (tags) => {
    set({ activeTagFilters: tags });
  },
  toggleTagFilter: (tag) => {
    const needle = tag.toLowerCase();
    set((s) => {
      const present = s.activeTagFilters.some(
        (t) => t.toLowerCase() === needle
      );
      return {
        activeTagFilters: present
          ? s.activeTagFilters.filter((t) => t.toLowerCase() !== needle)
          : [...s.activeTagFilters, tag],
      };
    });
  },
  clearTagFilters: () => {
    set({ activeTagFilters: [] });
  },

  absorbCardIntoFolder: (cardId, folderId) => {
    const { nodes } = get();
    const card = nodes.find((n) => n.id === cardId);
    const folder = nodes.find((n) => n.id === folderId);
    if (!(card && folder) || folder.type !== 'folder') {
      return;
    }
    if (!isFolderChildNode(card.type)) {
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
        toast.error('Failed to delete note file');
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
          toast.error('Failed to delete widget file');
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
    const restored =
      sessionViewport ?? _sessionViewports[activeViewId] ?? null;
    set({
      nodes: sortNodesByParent(normalizeCanvasParenting(nodes)),
      edges,
      viewport: restored,
      sessionViewport: restored,
      _hydrated: true,
    });
  },

  reset: () => {
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
    });
  },

  setViewport: (viewport, options) => {
    // `persist` means "remember in the session cache", not disk.
    const persist = options?.persist ?? shouldPersistViewport();
    const {
      activeViewId,
      viewport: current,
      sessionViewport: currentSession,
      _sessionViewports,
    } = get();
    const viewportUnchanged =
      current?.x === viewport?.x &&
      current?.y === viewport?.y &&
      current?.zoom === viewport?.zoom;
    const sessionUnchanged =
      !persist ||
      (currentSession?.x === viewport?.x &&
        currentSession?.y === viewport?.y &&
        currentSession?.zoom === viewport?.zoom);

    if (viewportUnchanged && sessionUnchanged) {
      return;
    }

    if (!persist) {
      set({ viewport });
      return;
    }

    const nextSessionMap = { ..._sessionViewports };
    if (viewport) {
      nextSessionMap[activeViewId] = viewport;
    } else {
      delete nextSessionMap[activeViewId];
    }

    set({
      viewport,
      sessionViewport: viewport,
      _sessionViewports: nextSessionMap,
    });
  },

  // -- core actions ---------------------------------------------------------
  setNodes: (updater) => {
    set((s) => ({
      nodes: typeof updater === 'function' ? updater(s.nodes) : updater,
    }));
  },

  setEdges: (updater) => {
    set((s) => ({
      edges: typeof updater === 'function' ? updater(s.edges) : updater,
    }));
  },

  applyNodesChange: (changes) => {
    set((s) => ({ nodes: applyCanvasNodeChanges(changes, s.nodes) }));
  },

  applyEdgesChange: (changes) => {
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
  },

  addConnection: (connection, options) => {
    if (connection.source === connection.target) {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      edges: addEdge(
        {
          id: `edge-${nanoid(8)}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          type: 'labeledEdge',
          data: {
            pathType: 'bezier',
            reverseVisualDirection: options?.reverseVisualDirection ?? false,
          },
          markerEnd: 'compact-arrow',
        },
        s.edges
      ),
    }));
  },

  // -- edge actions -----------------------------------------------------------
  setEditingEdgeId: (id) => {
    set({ editingEdgeId: id });
  },

  setEditingFolderId: (id) => {
    set({ editingFolderId: id });
  },

  setEditingStickyId: (id) => {
    set({ editingStickyId: id });
  },

  setEditingTagNodeId: (id) => {
    set({ editingTagNodeId: id });
  },

  setRenamingNodeId: (id) => {
    set({ renamingNodeId: id });
  },

  updateEdgeData: (edgeId, updates) => {
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === edgeId ? { ...e, data: { ...e.data, ...updates } } : e
      ),
    }));
  },

  deleteEdge: (edgeId) => {
    get().saveSnapshot();
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== edgeId),
    }));
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

  commitEdgeData: (edgeId, updates) => {
    get().saveSnapshot();
    get().updateEdgeData(edgeId, updates);
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
    set((s) => ({
      nodes: s.nodes.map((node) => ({
        ...node,
        selected:
          options?.extend === true
            ? Boolean(node.selected || node.id === target.id)
            : node.id === target.id,
      })),
    }));
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

  // -- UI actions -----------------------------------------------------------
  setFocusedNode: (v) => {
    set({ focusedNode: v });
  },
  setFocusedFolder: (v) => {
    set({ focusedFolder: v });
  },
  setCreateMenuOpen: (v) => {
    set((s) => ({
      createMenuOpen: typeof v === 'function' ? v(s.createMenuOpen) : v,
    }));
  },

  setSearchOpen: (v) => {
    set((s) => ({
      searchOpen: typeof v === 'function' ? v(s.searchOpen) : v,
    }));
  },

  setSettingsOpen: (v) => {
    set((s) => ({
      settingsOpen: typeof v === 'function' ? v(s.settingsOpen) : v,
    }));
  },

  setPendingSearchQuery: (query) => {
    set({ pendingSearchQuery: query });
  },

  setPendingSearchTarget: (target) => {
    set({ pendingSearchTarget: target });
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
    });
  },

  switchView: async (viewId) => {
    const { activeViewId, edges, nodes, _hydrated } = get();
    if (viewId === activeViewId) {
      return true;
    }
    const rpcAvailable = await isRpcAvailable();

    // Flush the outgoing canvas first; abort the switch when the save fails so
    // clearing the store can never drop unsaved edits. Skip the flush when the
    // canvas was never hydrated — saving an empty store would wipe the manifest.
    // Viewport is session-only and is never written to the manifest.
    if (_hydrated && rpcAvailable) {
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

  pasteClipboard: async (offset = 30) => {
    const { clipboard, clipboardEdges, nodes: currentNodes } = get();
    if (clipboard.length === 0) {
      return;
    }
    get().saveSnapshot();
    const pasted = buildPastedClipboard(
      clipboard,
      clipboardEdges,
      currentNodes,
      offset
    );
    const pastedNodes = graphContainsWidgetReference(pasted.nodes)
      ? await cloneWidgetReferences(pasted.nodes)
      : pasted.nodes;
    set((s) => ({
      edges: [...s.edges, ...pasted.edges],
      nodes: sortNodesByParent([
        ...s.nodes.map((n) => ({ ...n, selected: false })),
        ...pastedNodes,
      ]),
    }));
  },

  duplicateSelected: async (offset = DUPLICATE_OFFSET) => {
    const { edges, nodes } = get();
    const selected = nodes.filter((node) => node.selected);
    if (selected.length === 0) {
      return;
    }
    const selectedIds = new Set(selected.map((node) => node.id));
    const pasted = buildPastedClipboard(
      selected.map(cleanNodeForClipboard),
      getInternalEdgesForNodes(edges, selectedIds),
      nodes,
      offset
    );
    get().saveSnapshot();
    const pastedNodes = graphContainsWidgetReference(pasted.nodes)
      ? await cloneWidgetReferences(pasted.nodes)
      : pasted.nodes;
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
    const isLimitedNode =
      spec.base.type === 'card' || spec.base.type === 'sticky';
    const currentNodes = get().nodes;
    const cardCount = currentNodes.filter(
      (n) => n.type === 'card' || n.type === 'sticky'
    ).length;

    if (isLimitedNode && cardCount >= 100) {
      try {
        const cachedLicense = getCachedLicense();
        const license = cachedLicense?.activated
          ? cachedLicense
          : await refreshLicense();
        if (license && !license.activated) {
          toast.error(
            'Free version limited to 100 cards. Please activate a license to continue.',
            {
              duration: 4000,
            }
          );
          return;
        }
      } catch (error) {
        console.error('[License] Check failed:', error);
        // Continue on error to avoid blocking offline users
      }
    }

    const viewport = rfInstance?.getViewport();
    const zoom = viewport?.zoom ?? 1;

    // Use React Flow's screenToFlowPosition API instead of manual calculation
    // to avoid direct window dimension coupling
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
    const specType = spec.base.type ?? 'card';
    const { placement, parentId, canPlace } = resolveNodePlacement({
      anchor,
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
    set((s) => ({ nodes: sortNodesByParent([...s.nodes, newNode]) }));

    if (
      options?.focusViewport !== false &&
      typeof rfInstance?.setCenter === 'function'
    ) {
      suppressViewportPersist(300);
      rfInstance.setCenter(
        placement.x + size.width / 2,
        placement.y + size.height / 2,
        { duration: 240, zoom }
      );
    }

    return id;
  },

  deleteNodes: (ids) => {
    const idSet = new Set(ids);
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

      return {
        edges: s.edges.filter(
          (e) => !(idSet.has(e.source) || idSet.has(e.target))
        ),
        nodes: sortNodesByParent([
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
      };
    });
    // Fire-and-forget widget file cleanup for removed top-level widget nodes.
    for (const widgetId of widgetIdsToDelete) {
      rpcDeleteWidget(widgetId).catch((error) => {
        console.error('[canvasStore] Failed to delete widget file:', error);
        toast.error('Failed to delete widget file');
      });
    }
  },

  changeNodeColor: (nodeId) => {
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

    const spec = resolveFolderChildSpec(child.type);
    const anchor =
      options?.anchor ??
      (options?.anchorCenter
        ? {
            x: options.anchorCenter.x - spec.size.width / 2,
            y: options.anchorCenter.y - spec.size.height / 2,
          }
        : {
            x: folder.position.x + (FOLDER_W - spec.size.width) / 2,
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
        (node.type === 'card' ||
          node.type === 'image' ||
          node.type === 'link' ||
          node.type === 'asset')
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

  // -- undo / redo ----------------------------------------------------------
  saveSnapshot: () => {
    const { nodes, edges, viewport, _undoRedo } = get();
    set({
      _undoRedo: pushSnapshot(_undoRedo, { nodes, edges, viewport }),
    });
  },

  // Note: undo/redo intentionally leave `viewport` / sessionViewport untouched.
  // The React Flow camera only reads the stored viewport on mount, so writing a
  // stale snapshot value back would not move the camera — it would only corrupt
  // the session cache and cause a jump when re-entering the view.
  undo: () => {
    const { nodes, edges, viewport, _undoRedo } = get();
    const result = undoSnapshot(_undoRedo, { nodes, edges, viewport });
    if (!result) {
      return;
    }
    set({
      nodes: result.snapshot.nodes,
      edges: result.snapshot.edges,
      _undoRedo: result.state,
    });
  },

  redo: () => {
    const { nodes, edges, viewport, _undoRedo } = get();
    const result = redoSnapshot(_undoRedo, { nodes, edges, viewport });
    if (!result) {
      return;
    }
    set({
      nodes: result.snapshot.nodes,
      edges: result.snapshot.edges,
      _undoRedo: result.state,
    });
  },

  canUndo: () => get()._undoRedo.past.length > 0,
  canRedo: () => get()._undoRedo.future.length > 0,
}));
