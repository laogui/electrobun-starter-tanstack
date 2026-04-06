import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import type { Node, Edge, NodeChange, EdgeChange, Connection, ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { initialNodes } from '@/data/initialNodes';
import { sortNodesByParent } from '@/lib/canvasUtils';
import {
  CARD_W, CARD_H, FOLDER_W, FOLDER_H, STICKY_W, STICKY_H,
  GROUP_COLORS, CARD_COLORS, STICKY_COLORS,
} from '@/lib/canvasConstants';
import {
  createUndoRedoState,
  pushSnapshot,
  undo as undoSnapshot,
  redo as redoSnapshot,
  type UndoRedoState,
  type CanvasSnapshot,
} from '@/lib/undoRedo';

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
  nodes: Node[];
  edges: Edge[];

  // UI state
  focusedNode: FocusedItem | null;
  focusedFolder: FocusedItem | null;
  createMenuOpen: boolean;
  clipboard: Node[];
  nodeIdCounter: number;

  // Actions – core
  setNodes: (updater: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  applyNodesChange: (changes: NodeChange[]) => void;
  applyEdgesChange: (changes: EdgeChange[]) => void;
  addConnection: (connection: Connection) => void;
  updateNodeData: (nodeId: string, updates: Record<string, unknown>) => void;

  // Actions – UI
  setFocusedNode: (v: FocusedItem | null) => void;
  setFocusedFolder: (v: FocusedItem | null) => void;
  setCreateMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Actions – clipboard
  copySelected: () => void;
  pasteClipboard: (offset?: number) => void;

  // Actions – node CRUD
  createNode: (
    type: 'card' | 'folder' | 'group' | 'sticky',
    rfInstance: ReactFlowInstance<any, any> | null,
  ) => void;
  deleteNodes: (ids: string[]) => void;
  changeNodeColor: (nodeId: string) => void;
  addFolderChild: (folderId: string) => void;

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
  focusedNode: null,
  focusedFolder: null,
  createMenuOpen: false,
  clipboard: [],
  nodeIdCounter: 100,
  _undoRedo: createUndoRedoState(),

  // -- core actions ---------------------------------------------------------
  setNodes: (updater) =>
    set((s) => ({
      nodes: typeof updater === 'function' ? updater(s.nodes) : updater,
    })),

  setEdges: (updater) =>
    set((s) => ({
      edges: typeof updater === 'function' ? updater(s.edges) : updater,
    })),

  applyNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

  applyEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  addConnection: (connection) => {
    get().saveSnapshot();
    set((s) => ({
      edges: addEdge({ ...connection, type: 'smoothstep' }, s.edges),
    }));
  },

  updateNodeData: (nodeId, updates) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n,
      ),
    })),

  // -- UI actions -----------------------------------------------------------
  setFocusedNode: (v) => set({ focusedNode: v }),
  setFocusedFolder: (v) => set({ focusedFolder: v }),
  setCreateMenuOpen: (v) =>
    set((s) => ({
      createMenuOpen: typeof v === 'function' ? v(s.createMenuOpen) : v,
    })),

  // -- clipboard ------------------------------------------------------------
  copySelected: () =>
    set((s) => {
      const selected = s.nodes.filter((n) => n.selected);
      if (selected.length === 0) return s;
      return {
        clipboard: selected.map((n) => {
          const { isHidden, isDropTarget, ...cleanData } = n.data as any;
          return { ...n, data: cleanData };
        }),
      };
    }),

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
      x: ((cx - (viewport?.x ?? 0)) / zoom) - w / 2,
      y: ((cy - (viewport?.y ?? 0)) / zoom) - h / 2,
    });

    let newNode: Node;

    switch (type) {
      case 'group': {
        const pos = toFlow(500, 300);
        const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
        newNode = { id, type: 'group', position: pos, style: { width: 500, height: 300 }, data: { label: 'New Group', color } };
        break;
      }
      case 'sticky': {
        const pos = toFlow(STICKY_W, STICKY_H);
        const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
        newNode = { id, type: 'sticky', position: pos, style: { width: STICKY_W, height: STICKY_H }, data: { content: '', color } };
        break;
      }
      case 'folder': {
        const pos = toFlow(FOLDER_W, FOLDER_H);
        newNode = { id, type: 'folder', position: pos, data: { title: '0 items', subtitle: '', children: [] } };
        break;
      }
      default: {
        const pos = toFlow(CARD_W, CARD_H);
        newNode = { id, type: 'card', position: pos, style: { width: CARD_W, height: CARD_H }, data: { type: 'text', title: '', content: '', color: 'bg-white' } };
        break;
      }
    }

    set((s) => ({ nodes: [...s.nodes, newNode] }));
  },

  deleteNodes: (ids) => {
    get().saveSnapshot();
    const idSet = new Set(ids);
    set((s) => ({
      edges: s.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
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
          return { ...n, data: { ...n.data, color: GROUP_COLORS[(idx + 1) % GROUP_COLORS.length] } };
        }
        if (n.type === 'sticky') {
          const idx = STICKY_COLORS.indexOf((n.data as any).color ?? STICKY_COLORS[0]);
          return { ...n, data: { ...n.data, color: STICKY_COLORS[(idx + 1) % STICKY_COLORS.length] } };
        }
        const idx = CARD_COLORS.indexOf((n.data as any).color ?? 'bg-white');
        return { ...n, data: { ...n.data, color: CARD_COLORS[(idx + 1) % CARD_COLORS.length] } };
      }),
    }));
  },

  addFolderChild: (folderId) => {
    get().saveSnapshot();
    const childId = `child-${nanoid(8)}`;
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== folderId) return n;
        const children = [...((n.data as any).children || []), {
          id: childId,
          type: 'card' as const,
          data: { type: 'text' as const, title: '', content: '', color: 'bg-white' },
        }];
        return { ...n, data: { ...n.data, children, title: `${children.length} items` } };
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
