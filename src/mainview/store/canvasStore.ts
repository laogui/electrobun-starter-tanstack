import { addEdge, applyEdgeChanges } from '@xyflow/react';
import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  ReactFlowInstance,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import { create } from 'zustand';

import { initialNodes } from '@/data/initialNodes';
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
import {
  createUndoRedoState,
  pushSnapshot,
  redo as redoSnapshot,
  undo as undoSnapshot,
} from '@/lib/undoRedo';
import type { UndoRedoState } from '@/lib/undoRedo';

import * as m from '../../paraglide/messages.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FocusedItem {
  id: string;
  type?: string;
  data: Record<string, unknown>;
  rect: DOMRect;
}

export interface CanvasState {
  // Core data
  nodes: Array<Node>;
  edges: Array<Edge>;

  // UI state
  focusedNode: FocusedItem | null;
  focusedFolder: FocusedItem | null;
  createMenuOpen: boolean;
  clipboard: Array<Node>;
  nodeIdCounter: number;

  // Multi-view
  activeViewId: string;
  views: Array<{ id: string; name: string }>;

  // Actions – core
  setNodes: (
    updater: Array<Node> | ((prev: Array<Node>) => Array<Node>)
  ) => void;
  setEdges: (
    updater: Array<Edge> | ((prev: Array<Edge>) => Array<Edge>)
  ) => void;
  applyNodesChange: (changes: Array<NodeChange<Node>>) => void;
  applyEdgesChange: (changes: Array<EdgeChange>) => void;
  addConnection: (connection: Connection) => void;
  updateNodeData: (nodeId: string, updates: Record<string, unknown>) => void;

  // Actions – UI
  setFocusedNode: (v: FocusedItem | null) => void;
  setFocusedFolder: (v: FocusedItem | null) => void;
  setCreateMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Actions – multi-view
  setActiveView: (viewId: string) => Promise<void>;
  setViews: (views: Array<{ id: string; name: string }>) => void;
  setActiveViewId: (viewId: string) => void;

  // Actions – clipboard
  copySelected: () => void;
  pasteClipboard: (offset?: number) => void;

  // Actions – edge
  editingEdgeId: string | null;
  setEditingEdgeId: (id: string | null) => void;
  updateEdgeData: (edgeId: string, updates: Record<string, unknown>) => void;
  deleteEdge: (edgeId: string) => void;

  // Actions – node CRUD
  createNode: (
    type: 'card' | 'image' | 'folder' | 'group' | 'sticky',
    rfInstance: ReactFlowInstance<any, any> | null
  ) => void;
  deleteNodes: (ids: Array<string>) => void;
  changeNodeColor: (nodeId: string) => void;
  addFolderChild: (folderId: string) => void;

  // Hydration
  _hydrated: boolean;
  hydrate: (nodes: Array<Node>, edges: Array<Edge>) => void;
  reset: () => void;

  // Undo / Redo
  _undoRedo: UndoRedoState;
  saveSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Helpers
  nextNodeId: () => string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCanvasStore = create<CanvasState>((set, get) => ({
  // -- initial state --------------------------------------------------------
  nodes: initialNodes,
  edges: [],
  _hydrated: false,
  focusedNode: null,
  focusedFolder: null,
  createMenuOpen: false,
  clipboard: [],
  nodeIdCounter: 100,
  activeViewId: 'default',
  views: [{ id: 'default', name: 'Default Canvas' }],
  editingEdgeId: null,
  _undoRedo: createUndoRedoState(),

  // -- hydration ------------------------------------------------------------
  hydrate: (nodes, edges) => {
    set({ nodes, edges, _hydrated: true });
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

  addConnection: (connection) => {
    if (connection.source === connection.target) return;
    get().saveSnapshot();
    set((s) => ({
      edges: addEdge({ ...connection, type: 'labeledEdge' }, s.edges),
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

  // -- multi-view actions ---------------------------------------------------
  setViews: (views) => {
    set({ views });
  },
  setActiveViewId: (viewId) => {
    set({ activeViewId: viewId });
  },

  setActiveView: async (viewId) => {
    const current = get().activeViewId;
    if (viewId === current) return;

    // Clear UI state for view switch (keep clipboard for cross-view paste)
    set({
      activeViewId: viewId,
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
      if (selected.length === 0) return s;
      return {
        clipboard: selected.map((n) => {
          const { isHidden, isDropTarget, ...cleanData } = n.data as any;
          return { ...n, data: cleanData };
        }),
      };
    });
  },

  pasteClipboard: (offset = 30) => {
    const { clipboard } = get();
    if (clipboard.length === 0) return;
    get().saveSnapshot();
    const newNodes = clipboard.map((n) => ({
      ...n,
      id: `paste-${nanoid(8)}`,
      position: { x: n.position.x + offset, y: n.position.y + offset },
      selected: true,
    }));
    set((s) => ({
      nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
    }));
  },

  // -- node CRUD ------------------------------------------------------------
  nextNodeId: () => {
    const counter = get().nodeIdCounter + 1;
    set({ nodeIdCounter: counter });
    return `new-${counter}`;
  },

  createNode: (type, rfInstance) => {
    get().saveSnapshot();
    const id = get().nextNodeId();
    const viewport = rfInstance?.getViewport();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const zoom = viewport?.zoom ?? 1;

    const toFlow = (w: number, h: number) => ({
      x: (cx - (viewport?.x ?? 0)) / zoom - w / 2,
      y: (cy - (viewport?.y ?? 0)) / zoom - h / 2,
    });

    let newNode: Node;

    switch (type) {
      case 'group': {
        const pos = toFlow(500, 300);
        const color =
          GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
        newNode = {
          id,
          type: 'group',
          position: pos,
          style: { width: 500, height: 300 },
          data: { label: m.default_new_group_label(), color },
        };
        break;
      }
      case 'sticky': {
        const pos = toFlow(STICKY_W, STICKY_H);
        const color =
          STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
        newNode = {
          id,
          type: 'sticky',
          position: pos,
          style: { width: STICKY_W, height: STICKY_H },
          data: { content: '', color },
        };
        break;
      }
      case 'folder': {
        const pos = toFlow(FOLDER_W, FOLDER_H);
        newNode = {
          id,
          type: 'folder',
          position: pos,
          data: { title: m.default_folder_title(), subtitle: '', children: [] },
        };
        break;
      }
      case 'image': {
        const pos = toFlow(IMAGE_W, IMAGE_H);
        newNode = {
          id,
          type: 'image',
          position: pos,
          style: { width: IMAGE_W, height: IMAGE_H },
          data: { imageUrl: '', title: '', color: '#FFFFFF' },
        };
        break;
      }
      default: {
        const pos = toFlow(CARD_W, CARD_H);
        newNode = {
          id,
          type: 'card',
          position: pos,
          style: { width: CARD_W, height: CARD_H },
          data: { type: 'text', title: '', content: '', color: '#FFFFFF' },
        };
        break;
      }
    }

    set((s) => ({ nodes: [...s.nodes, newNode] }));
  },

  deleteNodes: (ids) => {
    get().saveSnapshot();
    const idSet = new Set(ids);
    set((s) => ({
      edges: s.edges.filter(
        (e) => !idSet.has(e.source) && !idSet.has(e.target)
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
        if (n.id !== nodeId) return n;
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
        if (n.id !== folderId) return n;
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

  // -- undo / redo ----------------------------------------------------------
  saveSnapshot: () => {
    const { nodes, edges, _undoRedo } = get();
    set({ _undoRedo: pushSnapshot(_undoRedo, { nodes, edges }) });
  },

  undo: () => {
    const { nodes, edges, _undoRedo } = get();
    const result = undoSnapshot(_undoRedo, { nodes, edges });
    if (!result) return;
    set({
      nodes: result.snapshot.nodes,
      edges: result.snapshot.edges,
      _undoRedo: result.state,
    });
  },

  redo: () => {
    const { nodes, edges, _undoRedo } = get();
    const result = redoSnapshot(_undoRedo, { nodes, edges });
    if (!result) return;
    set({
      nodes: result.snapshot.nodes,
      edges: result.snapshot.edges,
      _undoRedo: result.state,
    });
  },

  canUndo: () => get()._undoRedo.past.length > 0,
  canRedo: () => get()._undoRedo.future.length > 0,
}));
