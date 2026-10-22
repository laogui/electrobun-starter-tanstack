// Canvas store slice: Edge state and edge mutations (connect, label, delete).
import type { Connection, Edge, EdgeChange } from '@xyflow/react';
import { addEdge, applyEdgeChanges } from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { StateCreator } from 'zustand';
import { buildLegacyEdgeCompatPatch } from '../../../shared/canvasEdgeFields';
import { isTopicTreeEdge } from '../../../shared/topic';
import type { AddConnectionOptions, CanvasState } from '../canvasStore';

export interface EdgesSlice {
  addConnection: (
    connection: Connection,
    options?: AddConnectionOptions
  ) => void;
  applyEdgesChange: (changes: EdgeChange[]) => void;
  /** Snapshots history then updates edge data — for discrete user edits (label commit, etc.). */
  commitEdgeData: (edgeId: string, updates: Record<string, unknown>) => void;
  deleteEdge: (edgeId: string) => void;
  edges: Edge[];

  editingEdgeId: string | null;
  setEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setEditingEdgeId: (id: string | null) => void;
  updateEdgeData: (edgeId: string, updates: Record<string, unknown>) => void;
}

export const createEdgesSlice: StateCreator<CanvasState, [], [], EdgesSlice> = (
  set,
  get
) => ({
  edges: [],
  editingEdgeId: null,

  setEdges: (updater) => {
    set((s) => {
      const edges = typeof updater === 'function' ? updater(s.edges) : updater;
      return edges === s.edges ? s : { edges };
    });
  },

  applyEdgesChange: (changes) => {
    if (changes.length === 0) {
      return;
    }
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

  setEditingEdgeId: (id) => {
    if (id !== null) {
      const edge = get().edges.find((e) => e.id === id);
      if (edge && isTopicTreeEdge(edge)) {
        // Tree relations carry no user-editable label.
        return;
      }
    }
    set({ editingEdgeId: id });
  },

  updateEdgeData: (edgeId, updates) => {
    const edge = get().edges.find((e) => e.id === edgeId);
    if (!edge) {
      return;
    }
    // Tree relations are host-owned: no label, animation, path type, colour or
    // visual reversal. Guarding here (not only in the menus) covers
    // double-click label editing, context-menu toggles, AI actions, and any
    // future caller in one place. Topic transactions rewrite tree edges through
    // their own atomic graph commit, never through this generic path.
    if (isTopicTreeEdge(edge)) {
      return;
    }
    const legacyPatch = buildLegacyEdgeCompatPatch(
      edge,
      updates
    ) as Partial<Edge> | null;
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === edgeId
          ? { ...e, ...legacyPatch, data: { ...e.data, ...updates } }
          : e
      ),
    }));
  },

  deleteEdge: (edgeId) => {
    const edge = get().edges.find((e) => e.id === edgeId);
    if (!edge || isTopicTreeEdge(edge)) {
      // Removing a tree relation re-parents a whole branch, so it runs as a
      // validated split transaction rather than a bare edge delete.
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== edgeId),
    }));
  },

  commitEdgeData: (edgeId, updates) => {
    get().saveSnapshot();
    get().updateEdgeData(edgeId, updates);
  },
});
