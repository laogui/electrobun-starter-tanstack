// Canvas store slice: Copy / cut / paste / duplicate of canvas selections.
import type { Edge, Node } from '@xyflow/react';
import { toast } from 'sonner';
import type { StateCreator } from 'zustand';
import { sortNodesByParent } from '@/lib/canvasUtils';
import { markNodesEntering } from '@/lib/motion';
import * as m from '../../../paraglide/messages.js';
import {
  buildPastedClipboard,
  cleanNodeForClipboard,
  getInternalEdgesForNodes,
} from '../canvas/clipboardGraph';
import {
  cloneExtensionReferences,
  finishCreatedClones,
  graphContainsExtensionReference,
} from '../canvas/cloneReferences';
import type { CanvasState } from '../canvasStore';

const DUPLICATE_OFFSET = 30;

export interface ClipboardSlice {
  clipboard: Node[];
  clipboardEdges: Edge[];

  copySelected: () => void;
  cutSelected: () => void;
  duplicateSelected: (offset?: number) => Promise<void>;
  pasteClipboard: (offset?: number) => Promise<void>;
}

export const createClipboardSlice: StateCreator<
  CanvasState,
  [],
  [],
  ClipboardSlice
> = (set, get) => ({
  clipboard: [],
  clipboardEdges: [],

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
    const { clipboard, clipboardEdges, activeViewId, _canvasGeneration } =
      get();
    const isCurrent = () =>
      get()._hydrated &&
      get().activeViewId === activeViewId &&
      get()._canvasGeneration === _canvasGeneration;
    if (!isCurrent() || clipboard.length === 0) {
      return;
    }
    const latest = get();
    const pasted = buildPastedClipboard(
      clipboard,
      clipboardEdges,
      latest.nodes,
      offset
    );
    const createdIds = new Set<string>();
    try {
      let pastedNodes = pasted.nodes;
      if (graphContainsExtensionReference(pastedNodes)) {
        pastedNodes = await cloneExtensionReferences(pastedNodes, (id) => {
          createdIds.add(id);
          if (!isCurrent()) {
            throw new DOMException('Canvas changed', 'AbortError');
          }
        });
      }
      if (!isCurrent() || pastedNodes.length === 0) {
        return;
      }
      get().saveSnapshot();
      const pastedIds = new Set(pastedNodes.map((node) => node.id));
      const pastedEdges = pasted.edges.filter(
        (edge) => pastedIds.has(edge.source) && pastedIds.has(edge.target)
      );
      markNodesEntering(pastedNodes.map((n) => n.id));
      set((s) => ({
        edges: [...s.edges, ...pastedEdges],
        nodes: sortNodesByParent([
          ...s.nodes.map((n) => ({ ...n, selected: false })),
          ...pastedNodes,
        ]),
      }));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error(m.toast_clone_canvas_type_failed());
      }
    } finally {
      await finishCreatedClones([...createdIds], get());
    }
  },

  duplicateSelected: async (offset = DUPLICATE_OFFSET) => {
    const { nodes, edges, activeViewId, _canvasGeneration } = get();
    const isCurrent = () =>
      get()._hydrated &&
      get().activeViewId === activeViewId &&
      get()._canvasGeneration === _canvasGeneration;
    const selected = nodes.filter((node) => node.selected);
    if (!isCurrent() || selected.length === 0) {
      return;
    }
    const latest = get();
    const selectedIds = new Set(selected.map((node) => node.id));
    const pasted = buildPastedClipboard(
      selected.map(cleanNodeForClipboard),
      getInternalEdgesForNodes(edges, selectedIds),
      latest.nodes,
      offset
    );
    const createdIds = new Set<string>();
    try {
      let pastedNodes = pasted.nodes;
      if (graphContainsExtensionReference(pastedNodes)) {
        pastedNodes = await cloneExtensionReferences(pastedNodes, (id) => {
          createdIds.add(id);
          if (!isCurrent()) {
            throw new DOMException('Canvas changed', 'AbortError');
          }
        });
      }
      if (!isCurrent() || pastedNodes.length === 0) {
        return;
      }
      get().saveSnapshot();
      const pastedIds = new Set(pastedNodes.map((node) => node.id));
      const pastedEdges = pasted.edges.filter(
        (edge) => pastedIds.has(edge.source) && pastedIds.has(edge.target)
      );
      markNodesEntering(pastedNodes.map((node) => node.id));
      set((s) => ({
        edges: [...s.edges, ...pastedEdges],
        nodes: sortNodesByParent([
          ...s.nodes.map((node) => ({ ...node, selected: false })),
          ...pastedNodes,
        ]),
      }));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error(m.toast_clone_canvas_type_failed());
      }
    } finally {
      await finishCreatedClones([...createdIds], get());
    }
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
});
