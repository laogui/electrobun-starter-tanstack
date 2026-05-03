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
  CARD_COLORS,
  CARD_H,
  CARD_W,
  FOLDER_H,
  FOLDER_W,
  GROUP_COLORS,
  IMAGE_H,
  IMAGE_W,
  STICKY_COLORS,
  STICKY_H,
  STICKY_W,
} from '@/lib/canvasConstants';
import { normalizeCanvasParenting, sortNodesByParent } from '@/lib/canvasUtils';
import { buildAbsoluteRects, type Size } from '@/lib/collision';
import { resolveNodePlacement } from '@/lib/resolvePlacement';
import type { UndoRedoState } from '@/lib/undoRedo';
import {
  createUndoRedoState,
  pushSnapshot,
  redo as redoSnapshot,
  undo as undoSnapshot,
} from '@/lib/undoRedo';

import * as m from '../../paraglide/messages.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FocusedItem {
  data: Record<string, unknown>;
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
}

export interface AddConnectionOptions {
  reverseVisualDirection?: boolean;
}

interface NodeSpec {
  base: Omit<Node, 'id' | 'position'>;
  size: Size;
}

interface FolderChildEntry {
  data: Record<string, unknown>;
  id: string;
  type?: string;
}

function buildNewNodeSpec(
  type: 'card' | 'checklist' | 'image' | 'folder' | 'group' | 'sticky'
): NodeSpec {
  switch (type) {
    case 'group': {
      const color =
        GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
      return {
        size: { width: 500, height: 300 },
        base: {
          type: 'group',
          style: { width: 500, height: 300 },
          data: { label: m.default_new_group_label(), color },
        },
      };
    }
    case 'sticky': {
      const color =
        STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
      return {
        size: { width: STICKY_W, height: STICKY_H },
        base: {
          type: 'sticky',
          style: { width: STICKY_W, height: STICKY_H },
          data: { content: '', color },
        },
      };
    }
    case 'folder': {
      return {
        size: { width: FOLDER_W, height: FOLDER_H },
        base: {
          type: 'folder',
          data: {
            title: m.default_folder_title(),
            subtitle: '',
            children: [],
          },
        },
      };
    }
    case 'image': {
      return {
        size: { width: IMAGE_W, height: IMAGE_H },
        base: {
          type: 'image',
          style: { width: IMAGE_W, height: IMAGE_H },
          data: { imageUrl: '', title: '', color: '#FFFFFF' },
        },
      };
    }
    case 'checklist': {
      return {
        size: { width: CARD_W, height: CARD_H },
        base: {
          type: 'card',
          style: { width: CARD_W, height: CARD_H },
          data: { type: 'checklist', title: '', items: [], color: '#FFFFFF' },
        },
      };
    }
    default: {
      return {
        size: { width: CARD_W, height: CARD_H },
        base: {
          type: 'card',
          style: { width: CARD_W, height: CARD_H },
          data: { type: 'text', title: '', content: '', color: '#FFFFFF' },
        },
      };
    }
  }
}

export type LayoutMode = 'canvas' | 'document';

/**
 * Sidebar section in document mode.
 * - "all": every card / image (top-level + inside folders)
 * - "inbox": only cards / images at the canvas root
 * - "archive": currently empty placeholder
 * - "folder:<id>": filter to a single folder's children
 */
export type DocumentSection = 'all' | 'inbox' | 'archive' | `folder:${string}`;

export interface CanvasState {
  // Hydration
  _hydrated: boolean;

  // Undo / Redo
  _undoRedo: UndoRedoState;

  // Folder-child mutations exposed for document mode
  absorbCardIntoFolder: (cardId: string, folderId: string) => void;

  // Multi-view
  activeViewId: string;
  addConnection: (
    connection: Connection,
    options?: AddConnectionOptions
  ) => void;
  addFolderChild: (folderId: string) => void;
  applyEdgesChange: (changes: EdgeChange[]) => void;
  applyNodesChange: (changes: NodeChange[]) => void;
  canRedo: () => boolean;
  canUndo: () => boolean;
  changeNodeColor: (nodeId: string) => void;
  clipboard: Node[];
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

  // Detached notes (document-mode notes not placed on canvas)
  createDetachedNote: () => string;
  createMenuOpen: boolean;

  // Actions – node CRUD
  createNode: (
    type: 'card' | 'checklist' | 'image' | 'folder' | 'group' | 'sticky',
    rfInstance: ReactFlowInstance<any, any> | null,
    options?: CreateNodeOptions
  ) => void;
  deleteEdge: (edgeId: string) => void;
  deleteFolderChild: (folderId: string, childId: string) => void;
  deleteNodes: (ids: string[]) => void;
  detachNoteFromCanvas: (nodeId: string) => void;
  documentSection: DocumentSection;
  edges: Edge[];

  // Actions – edge
  editingEdgeId: string | null;
  focusedFolder: FocusedItem | null;

  // UI state
  focusedNode: FocusedItem | null;
  hydrate: (nodes: Node[], edges: Edge[]) => void;

  // Layout mode (canvas vs document)
  layoutMode: LayoutMode;
  moveFolderChildToCanvas: (
    folderId: string,
    childId: string,
    options?: CreateNodeOptions
  ) => void;

  // Helpers
  nextNodeId: () => string;
  // Core data
  nodes: Node[];
  pasteClipboard: (offset?: number) => void;
  pendingSearchTarget: PendingSearchTarget | null;
  pinNoteToCanvas: (nodeId: string, position: { x: number; y: number }) => void;
  redo: () => void;
  reset: () => void;
  saveSnapshot: () => void;

  // Search
  searchOpen: boolean;
  selectedDocumentId: string | null;

  // Actions – multi-view
  setActiveView: (viewId: string) => void;
  setActiveViewId: (viewId: string) => void;
  setCreateMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setDocumentSection: (section: DocumentSection) => void;
  setEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setEditingEdgeId: (id: string | null) => void;
  setFocusedFolder: (v: FocusedItem | null) => void;

  // Actions – UI
  setFocusedNode: (v: FocusedItem | null) => void;
  setLayoutMode: (mode: LayoutMode) => void;

  // Actions – core
  setNodes: (updater: Node[] | ((prev: Node[]) => Node[])) => void;
  setPendingSearchTarget: (target: PendingSearchTarget | null) => void;
  setSearchOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSelectedDocumentId: (id: string | null) => void;
  setViews: (views: Array<{ id: string; name: string }>) => void;

  undo: () => void;
  updateEdgeData: (edgeId: string, updates: Record<string, unknown>) => void;
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

export const useCanvasStore = create<CanvasState>((set, get) => ({
  // -- initial state --------------------------------------------------------
  nodes: [],
  edges: [],
  _hydrated: false,
  focusedNode: null,
  focusedFolder: null,
  createMenuOpen: false,
  clipboard: [],
  activeViewId: 'default',
  views: [{ id: 'default', name: 'Default Canvas' }],
  editingEdgeId: null,
  _undoRedo: createUndoRedoState(),
  searchOpen: false,
  pendingSearchTarget: null,
  layoutMode: 'canvas',
  selectedDocumentId: null,
  documentSection: 'all',

  setLayoutMode: (mode) => {
    set({ layoutMode: mode });
  },
  setSelectedDocumentId: (id) => {
    set({ selectedDocumentId: id });
  },
  setDocumentSection: (section) => {
    set({ documentSection: section });
  },

  absorbCardIntoFolder: (cardId, folderId) => {
    const { nodes } = get();
    const card = nodes.find((n) => n.id === cardId);
    const folder = nodes.find((n) => n.id === folderId);
    if (!(card && folder) || folder.type !== 'folder') {
      return;
    }
    if (card.type !== 'card' && card.type !== 'image') {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes
        .filter((n) => n.id !== cardId)
        .map((n) => {
          if (n.id !== folderId) {
            return n;
          }
          const existing = ((n.data as any).children ?? []) as Array<{
            data: Record<string, unknown>;
            id: string;
            type?: string;
          }>;
          const children = [
            ...existing,
            {
              id: card.id,
              type: card.type as 'card' | 'image',
              data: card.data as Record<string, unknown>,
            },
          ];
          return {
            ...n,
            data: {
              ...n.data,
              children,
              title: `${children.length} items`,
            },
          };
        }),
      edges: s.edges.filter((e) => e.source !== cardId && e.target !== cardId),
    }));
  },

  deleteFolderChild: (folderId, childId) => {
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
            title: `${children.length} items`,
          },
        };
      }),
    }));
  },

  updateFolderChildData: (folderId, childId, updates) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
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
        return {
          ...n,
          data: { ...n.data, children },
        };
      }),
    }));
  },

  commitFolderChildData: (folderId, childId, updates) => {
    get().saveSnapshot();
    get().updateFolderChildData(folderId, childId, updates);
  },

  // -- hydration ------------------------------------------------------------
  hydrate: (nodes, edges) => {
    set({
      nodes: sortNodesByParent(normalizeCanvasParenting(nodes)),
      edges,
      _hydrated: true,
    });
  },

  reset: () => {
    set({
      nodes: [],
      edges: [],
      _hydrated: false,
      focusedNode: null,
      focusedFolder: null,
      clipboard: [],
      _undoRedo: createUndoRedoState(),
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
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
      ),
    }));
  },

  commitNodeData: (nodeId, updates) => {
    get().saveSnapshot();
    get().updateNodeData(nodeId, updates);
  },

  commitEdgeData: (edgeId, updates) => {
    get().saveSnapshot();
    get().updateEdgeData(edgeId, updates);
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

    // Clear canvas data AND UI state for view switch (keep clipboard for cross-view paste)
    set({
      activeViewId: viewId,
      nodes: [],
      edges: [],
      focusedNode: null,
      focusedFolder: null,
      _undoRedo: createUndoRedoState(),
      _hydrated: false,
    });
  },

  // -- clipboard ------------------------------------------------------------
  copySelected: () => {
    set((s) => {
      const selected = s.nodes.filter((n) => n.selected);
      if (selected.length === 0) {
        return s;
      }
      return {
        clipboard: selected.map((n) => {
          const { isHidden, isDropTarget, ...cleanData } = n.data as any;
          return { ...n, data: cleanData };
        }),
      };
    });
  },

  pasteClipboard: (offset = 30) => {
    const { clipboard, nodes: currentNodes } = get();
    if (clipboard.length === 0) {
      return;
    }
    get().saveSnapshot();
    const existingIds = new Set(currentNodes.map((n) => n.id));
    const clipboardIds = new Set(clipboard.map((n) => n.id));

    // Build old-id → new-id mapping for all clipboard nodes upfront,
    // so children can reference the correct new parent id.
    const idMap = new Map<string, string>(
      clipboard.map((n) => [n.id, `paste-${nanoid(8)}`])
    );

    const newNodes = clipboard.map((n) => {
      const newId = idMap.get(n.id)!;
      const { parentId, extent, ...rest } = n as any;

      // Remap parentId when the parent was also copied (clipboard-internal link).
      // Fall back to keeping the original parent when it exists in the current view
      // (cross-view paste onto an already-present group).
      // Drop the relationship entirely when neither condition holds.
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
      };
    });
    set((s) => ({
      nodes: sortNodesByParent([
        ...s.nodes.map((n) => ({ ...n, selected: false })),
        ...newNodes,
      ]),
    }));
  },

  // -- node CRUD ------------------------------------------------------------
  nextNodeId: () => `node-${nanoid(8)}`,

  createNode: (type, rfInstance, options) => {
    const spec = buildNewNodeSpec(type);

    const viewport = rfInstance?.getViewport();
    const zoom = viewport?.zoom ?? 1;
    const viewportCenter = {
      x: (window.innerWidth / 2 - (viewport?.x ?? 0)) / zoom,
      y: (window.innerHeight / 2 - (viewport?.y ?? 0)) / zoom,
    };
    const center = options?.anchorCenter ?? viewportCenter;
    const anchor = options?.anchor ?? {
      x: center.x - spec.size.width / 2,
      y: center.y - spec.size.height / 2,
    };

    const { nodes } = get();
    const specType = spec.base.type ?? 'card';
    const { placement, parentId, canPlace } = resolveNodePlacement({
      anchor,
      nodes,
      newType: specType,
      size: spec.size,
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
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    };
    set((s) => ({ nodes: sortNodesByParent([...s.nodes, newNode]) }));

    if (typeof rfInstance?.setCenter === 'function') {
      rfInstance.setCenter(
        placement.x + spec.size.width / 2,
        placement.y + spec.size.height / 2,
        { duration: 240, zoom }
      );
    }
  },

  deleteNodes: (ids) => {
    get().saveSnapshot();
    const idSet = new Set(ids);
    set((s) => ({
      edges: s.edges.filter(
        (e) => !(idSet.has(e.source) || idSet.has(e.target))
      ),
      nodes: s.nodes
        .filter((n) => !idSet.has(n.id))
        .map((n) => {
          if (n.parentId && idSet.has(n.parentId)) {
            const { parentId, extent, ...rest } = n as any;
            return rest as Node;
          }
          return n;
        }),
    }));
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
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== folderId) {
          return n;
        }
        const children = [
          ...((n.data as any).children || []),
          {
            id: childId,
            type: 'card' as const,
            data: {
              type: 'text' as const,
              title: '',
              content: '',
              color: '#FFFFFF',
            },
          },
        ];
        return {
          ...n,
          data: { ...n.data, children, title: `${children.length} items` },
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

    const isImage = child.type === 'image';
    const spec = buildNewNodeSpec(isImage ? 'image' : 'card');
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
        title: `${remainingChildren.length} items`,
      };
      const existingIds = new Set(s.nodes.map((node) => node.id));
      const restoredNodeId = existingIds.has(child.id)
        ? `node-${nanoid(8)}`
        : child.id;
      const restoredNode: Node = {
        ...spec.base,
        id: restoredNodeId,
        type: isImage ? 'image' : 'card',
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
  createDetachedNote: () => {
    get().saveSnapshot();
    const id = get().nextNodeId();
    const newNode: Node = {
      id,
      type: 'card',
      position: { x: 0, y: 0 },
      style: { width: CARD_W, height: CARD_H },
      data: {
        type: 'text' as const,
        title: '',
        content: '',
        color: '#FFFFFF',
        detached: true,
      },
    };
    set((s) => ({ nodes: sortNodesByParent([...s.nodes, newNode]) }));
    return id;
  },

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
        const { detached: _, ...cleanData } = n.data as Record<string, unknown>;
        return {
          ...n,
          position,
          style: n.style ?? { width: CARD_W, height: CARD_H },
          data: cleanData,
        };
      }),
    }));
  },

  detachNoteFromCanvas: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || (node.type !== 'card' && node.type !== 'image')) {
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
    const { nodes, edges, _undoRedo } = get();
    set({
      _undoRedo: pushSnapshot(_undoRedo, { nodes, edges }),
    });
  },

  undo: () => {
    const { nodes, edges, _undoRedo } = get();
    const result = undoSnapshot(_undoRedo, { nodes, edges });
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
    const { nodes, edges, _undoRedo } = get();
    const result = redoSnapshot(_undoRedo, { nodes, edges });
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
