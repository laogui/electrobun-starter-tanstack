import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { sortNodesByParent } from '@/lib/canvasUtils';
import { buildAbsoluteRects, getNodeSize, type Size } from '@/lib/collision';
import {
  collectTopicLayoutObstacles,
  diffTopicPositions,
  layoutTopicTreeAvoiding,
  type TopicLayoutHardReason,
} from '@/lib/topicLayout';
import { measureTopicSize } from '@/lib/topicMeasure';
import {
  buildTopicChildEdge,
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
  TOPIC_NODE_TYPE,
} from '../../../shared/topic';
import type { TopicDraft } from '../canvasStore';
// Topic tree graph transforms: relayout, delete repair, draft attachment, previews.

/** Rendered size of each Topic, preferring the persisted style and falling
 *  back to a fresh measurement for nodes that have never been sized. */
export function collectTopicSizes(
  nodes: Node[],
  ids: Iterable<string>
): Map<string, Size> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sizes = new Map<string, Size>();
  for (const id of ids) {
    const node = byId.get(id);
    if (!node) {
      continue;
    }
    const style = node.style as Record<string, unknown> | undefined;
    const width = typeof style?.width === 'number' ? style.width : undefined;
    const height = typeof style?.height === 'number' ? style.height : undefined;
    sizes.set(
      id,
      width && height
        ? { height, width }
        : measureTopicSize(
            typeof (node.data as { title?: unknown })?.title === 'string'
              ? (node.data as { title: string }).title
              : ''
          )
    );
  }
  return sizes;
}

export type TopicRelayoutResult =
  | { nodes: Node[]; ok: true; softOverlap: boolean }
  | { ok: false; reason: TopicLayoutHardReason };

export function toastTopicHardFailure(reason: TopicLayoutHardReason): void {
  toast.error(
    reason === 'group-bounds'
      ? m.toast_topic_layout_group_full()
      : m.toast_topic_layout_locked()
  );
}

export function toastTopicSoftOverlap(): void {
  toast(m.toast_topic_layout_overlap());
}

/**
 * Re-run the rightward layout for the tree containing `rootId`, then the §5
 * avoidance pass (soft obstacles, Group hard bounds, locked nodes).
 *
 * Hard failure refuses the whole operation. Soft overlap still returns a
 * graph so the caller can commit and warn.
 */
export function relayoutTopicTree(
  nodes: Node[],
  edges: Edge[],
  rootId: string
): TopicRelayoutResult {
  const index = buildTopicIndex(nodes, edges);
  const branch = collectTopicBranch(index, rootId);
  const root = nodes.find((node) => node.id === rootId);
  if (!root) {
    return { nodes, ok: true, softOverlap: false };
  }

  const branchSet = new Set(branch);
  const current = new Map<string, { x: number; y: number }>();
  const lockedIds = new Set<string>();
  for (const node of nodes) {
    if (!branchSet.has(node.id)) {
      continue;
    }
    current.set(node.id, node.position);
    if ((node.data as { locked?: unknown } | undefined)?.locked) {
      lockedIds.add(node.id);
    }
  }

  const containerId = root.parentId;
  const absolute = containerId ? buildAbsoluteRects(nodes) : undefined;
  const origin = containerId
    ? {
        x: absolute?.get(containerId)?.left ?? 0,
        y: absolute?.get(containerId)?.top ?? 0,
      }
    : { x: 0, y: 0 };
  const excludeIds = new Set(branchSet);
  if (containerId) {
    excludeIds.add(containerId);
  }

  let hardBounds:
    | { bottom: number; left: number; right: number; top: number }
    | undefined;
  if (containerId) {
    const container = nodes.find((node) => node.id === containerId);
    if (container) {
      const size = getNodeSize(container);
      hardBounds = {
        bottom: size.height,
        left: 0,
        right: size.width,
        top: 0,
      };
    }
  }

  const laidOut = layoutTopicTreeAvoiding(index, rootId, {
    currentPositions: current,
    hardBounds,
    lockedIds,
    obstacles: collectTopicLayoutObstacles(nodes, excludeIds, origin),
    rootAnchor: root.position,
    sizes: collectTopicSizes(nodes, branch),
  });
  if (laidOut.hardFailure) {
    return { ok: false, reason: laidOut.hardFailure };
  }

  const moved = diffTopicPositions(current, laidOut.positions);
  if (moved.size === 0) {
    return { nodes, ok: true, softOverlap: laidOut.softOverlap };
  }
  return {
    nodes: nodes.map((node) => {
      const position = moved.get(node.id);
      return position ? { ...node, position } : node;
    }),
    ok: true,
    softOverlap: laidOut.softOverlap,
  };
}

/**
 * Repair the Topic trees left behind by a generic node delete.
 *
 * The generic path already drops every edge incident to a removed node, so the
 * deleted Topic's children are detached and keep their positions as new roots —
 * which is the documented behaviour for deleting a single Topic. What it cannot
 * do is close the `order` gap left among the deleted Topic's siblings, or
 * re-pack the parent's remaining subtree. Unlike the explicit branch commands,
 * a lock that blocks relayout only skips the repositioning here: the delete
 * itself was already asked for and must not be silently half-refused.
 */
export function settleTopicsAfterDelete(
  previousNodes: Node[],
  previousEdges: Edge[],
  nextNodes: Node[],
  nextEdges: Edge[],
  removedIds: ReadonlySet<string>
): { edges: Edge[]; nodes: Node[] } {
  const index = buildTopicIndex(previousNodes, previousEdges);
  const survivingParents = new Set<string>();
  for (const id of removedIds) {
    const parentId = index.parentByChild.get(id)?.parentId;
    if (parentId && !removedIds.has(parentId)) {
      survivingParents.add(parentId);
    }
  }
  if (survivingParents.size === 0) {
    return { edges: nextEdges, nodes: nextNodes };
  }

  let edges = nextEdges;
  let nodes = nextNodes;
  for (const parentId of survivingParents) {
    edges = renumberSiblingEdges(
      edges,
      parentId,
      getTopicChildren(index, parentId)
        .map((relation) => relation.childId)
        .filter((childId) => !removedIds.has(childId))
    );
  }
  const roots = new Set(
    [...survivingParents].map((parentId) => findTopicRoot(index, parentId))
  );
  for (const rootId of roots) {
    if (removedIds.has(rootId)) {
      continue;
    }
    const relaid = relayoutTopicTree(nodes, edges, rootId);
    if (relaid.ok) {
      nodes = relaid.nodes;
    }
  }
  return { edges, nodes };
}

/**
 * Insert a freshly created Topic into the tree, returning the next edge set and
 * the root whose layout must be recomputed.
 *
 * Returns `null` when the insertion must be refused: a missing or locked anchor,
 * a container mismatch, or a tree whose relations are already damaged. Refusing
 * here (before any snapshot is taken) is what keeps a rejected commit from
 * leaving a half-built branch or a stray history entry behind.
 */
export function attachDraftToTree(
  nodes: Node[],
  edges: Edge[],
  newTopicId: string,
  relation: { kind: 'child' | 'sibling'; topicId: string },
  edgeId = `edge-${nanoid(8)}`
): { edges: Edge[]; rootId: string } | null {
  const anchor = nodes.find((node) => node.id === relation.topicId);
  const created = nodes.find((node) => node.id === newTopicId);
  if (!(anchor && created && isTopicNodeType(anchor.type))) {
    return null;
  }
  if ((anchor.data as { locked?: unknown }).locked) {
    return null;
  }
  // A tree edge may not cross a Group boundary.
  if ((anchor.parentId ?? '') !== (created.parentId ?? '')) {
    return null;
  }

  const index = buildTopicIndex(nodes, edges);
  if (getStructurallyFrozenTopics(index).has(anchor.id)) {
    return null;
  }

  const parentId =
    relation.kind === 'child'
      ? anchor.id
      : index.parentByChild.get(anchor.id)?.parentId;
  if (!parentId) {
    // A root has no sibling slot to insert into; the caller should have offered
    // "edit the root" instead.
    return null;
  }
  const parent = nodes.find((node) => node.id === parentId);
  if (!parent || (parent.data as { locked?: unknown }).locked) {
    return null;
  }

  const siblings = getTopicChildren(index, parentId).map((r) => r.childId);
  const insertAt =
    relation.kind === 'child'
      ? siblings.length
      : siblings.indexOf(anchor.id) + 1;
  const ordered = [
    ...siblings.slice(0, insertAt),
    newTopicId,
    ...siblings.slice(insertAt),
  ];

  const nextEdges = renumberSiblingEdges(
    [
      ...edges,
      buildTopicChildEdge(
        edgeId,
        parentId,
        newTopicId,
        ordered.indexOf(newTopicId)
      ),
    ],
    parentId,
    ordered
  );
  return { edges: nextEdges, rootId: findTopicRoot(index, parentId) };
}

/** Overlay title edit sizes only on the graph passed to React Flow. */
export function previewTopicEdits(
  nodes: Node[],
  previews: Record<string, Size>
): Node[] {
  if (Object.keys(previews).length === 0) {
    return nodes;
  }
  return nodes.map((node) => {
    const size = previews[node.id];
    return size && isTopicNodeType(node.type)
      ? { ...node, measured: size, style: { ...node.style, ...size } }
      : node;
  });
}

/** Preview the same insertion/layout as commit without mutating the saved graph. */
export function previewTopicDraft(
  nodes: Node[],
  edges: Edge[],
  draft: TopicDraft | null,
  activeViewId: string
): { edges: Edge[]; nodes: Node[] } {
  if (!draft || draft.viewId !== activeViewId) {
    return { edges, nodes };
  }
  // Measure the raw text, not its normalized form: the textarea shows literal
  // newlines while typing (Shift+Enter, paste), and the box must fit what is
  // on screen. The commit collapses them and re-measures.
  const size = measureTopicSize(draft.text);
  const node: Node = {
    data: { ...createTopicData(draft.text), isDraft: true },
    deletable: false,
    draggable: false,
    // Render-only drafts do not receive the persisted graph's measurement
    // updates. Supply dimensions so replacing the preview cannot hide it.
    measured: size,
    id: draft.id,
    position: draft.anchor,
    selectable: false,
    style: { width: size.width, height: size.height },
    type: TOPIC_NODE_TYPE,
    ...(draft.parentId
      ? { extent: 'parent' as const, parentId: draft.parentId }
      : {}),
  };
  const nextNodes = sortNodesByParent([...nodes, node]);
  if (!draft.relation) {
    return { edges, nodes: nextNodes };
  }
  const attached = attachDraftToTree(
    nextNodes,
    edges,
    draft.id,
    draft.relation,
    `${draft.id}-edge`
  );
  if (!attached) {
    return { edges, nodes: nextNodes };
  }
  const layout = relayoutTopicTree(nextNodes, attached.edges, attached.rootId);
  return {
    edges: attached.edges.map((edge) =>
      edge.id === `${draft.id}-edge`
        ? { ...edge, selectable: false, deletable: false, focusable: false }
        : edge
    ),
    nodes: layout.ok ? layout.nodes : nextNodes,
  };
}
