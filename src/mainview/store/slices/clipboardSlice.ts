// Canvas store slice: Copy / cut / paste / duplicate of canvas selections.
import type { Edge, Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import { sortNodesByParent } from '@/lib/canvasUtils';
import { markNodesEntering } from '@/lib/motion';
import { countCountedNodes, hasNodeQuota } from '@/lib/nodeQuota';
import {
  buildPastedClipboard,
  cleanNodeForClipboard,
  getInternalEdgesForNodes,
} from '../canvas/clipboardGraph';
import {
  cloneExtensionReferences,
  cloneWidgetReferences,
  graphContainsExtensionReference,
  graphContainsWidgetReference,
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
});
