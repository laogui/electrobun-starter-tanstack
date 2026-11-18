// Canvas store slice: Topic drafts, Topic tree commands and the Topic command context.
import type { Node, ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import type { StateCreator } from 'zustand';
import { sortNodesByParent } from '@/lib/canvasUtils';
import { buildAbsoluteRects, getNodeSize, type Size } from '@/lib/collision';
import { resolveNodePlacement } from '@/lib/resolvePlacement';
import { measureTopicSize } from '@/lib/topicMeasure';
import {
  buildTopicIndex,
  collectTopicBranch,
  findTopicRoot,
  getStructurallyFrozenTopics,
  getTopicChildren,
  renumberSiblingEdges,
} from '@/lib/topicTree';
import * as m from '../../../paraglide/messages.js';
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
} from '../../../shared/topic';
import {
  cleanNodeForClipboard,
  getInternalEdgesForNodes,
} from '../canvas/clipboardGraph';
import {
  attachDraftToTree,
  relayoutTopicTree,
  toastTopicHardFailure,
  toastTopicSoftOverlap,
} from '../canvas/topicGraph';
import { getViewportCenter } from '../canvas/viewportCenter';
import type { CanvasState, TopicDraft } from '../canvasStore';

export interface TopicsSlice {
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
  /** Discard the render-only size override without changing the saved graph. */
  resetTopicEditPreview: (nodeId: string) => void;
  setEditingTopicId: (id: string | null) => void;
  setTopicDraftText: (text: string) => void;
  /** Live-resize an existing Topic to the title currently being typed, so the
   *  box fits the text while editing. Ephemeral: no relayout and no history
   *  snapshot — the commit writes the final size and layout;
   *  `resetTopicEditPreview` restores the stored title's size. */
  setTopicEditPreview: (nodeId: string, title: string) => void;
  /** Re-run layout for the branch rooted at `topicId`. */
  tidyTopicBranch: (topicId: string) => void;

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
}

export const createTopicsSlice: StateCreator<
  CanvasState,
  [],
  [],
  TopicsSlice
> = (set, get) => ({
  editingTopicId: null,
  topicCommandContextId: null,
  topicDraft: null,
  topicEditPreviews: {},
  topicWritePaused: false,

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
});
