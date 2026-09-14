/**
 * Topic tree model: derive hierarchy from the canvas graph, validate it, and
 * traverse it.
 *
 * Tree edges are the only source of truth for parentage — nothing is cached on
 * the node — so every read rebuilds the index from `nodes` + `edges`. All
 * traversal here is iterative with a visited set: a corrupted file can contain
 * a cycle, and recursion would take the renderer down with it.
 *
 * This module is pure. Transactions return a complete next graph for the store
 * to commit in a single update, so a structural change is one undo step.
 */

import type { Edge, Node } from '@xyflow/react';

import {
  isTopicNodeType,
  isTopicTreeEdge,
  parseTopicChildEdgeData,
  parseTopicData,
  TOPIC_CHILD_EDGE_KIND,
} from '../../shared/topic';

export interface TopicRelation {
  childId: string;
  edgeId: string;
  order: number;
  parentId: string;
}

export type TopicProblemKind =
  /** A tree edge touches a node that is not a Topic (or does not exist). */
  | 'endpoint-not-topic'
  /** A tree edge points a Topic at itself. */
  | 'self-loop'
  /** A Topic is claimed as a child by more than one parent. */
  | 'multiple-parents'
  /** Following parents leads back to an already-visited Topic. */
  | 'cycle'
  /** Parent and child sit in different Group containers. */
  | 'cross-container'
  /** `data.kind` says tree edge but the payload is malformed. */
  | 'invalid-relation'
  /** A `relationVersion` this build does not understand. */
  | 'unsupported-relation-version'
  /** A `topicVersion` this build does not understand. */
  | 'unsupported-topic-version'
  /** Topic node data that cannot be interpreted at all. */
  | 'invalid-topic-data';

export interface TopicProblem {
  edgeId?: string;
  kind: TopicProblemKind;
  message: string;
  nodeId?: string;
}

export interface TopicIndex {
  /** Children per parent, sorted by `order` then id for a stable tie-break. */
  childrenByParent: ReadonlyMap<string, TopicRelation[]>;
  /** The relation naming each child's parent. */
  parentByChild: ReadonlyMap<string, TopicRelation>;
  problems: TopicProblem[];
  /** Topics with no parent relation, in node order. */
  rootIds: string[];
  /** Every Topic node id in the graph, valid data or not. */
  topicIds: ReadonlySet<string>;
  /** Ids of edges recognized as tree relations, including broken ones. */
  treeEdgeIds: ReadonlySet<string>;
}

/**
 * Topics whose structure must not be edited because their relations are
 * damaged. Editing around a broken tree could rewrite the file in a way that
 * discards the very records the user needs to repair it.
 */
export function getStructurallyFrozenTopics(index: TopicIndex): Set<string> {
  const frozen = new Set<string>();
  for (const problem of index.problems) {
    if (problem.nodeId) {
      frozen.add(problem.nodeId);
    }
  }
  return frozen;
}

function relationSortKey(a: TopicRelation, b: TopicRelation): number {
  return a.order === b.order
    ? a.childId.localeCompare(b.childId)
    : a.order - b.order;
}

/**
 * Topics that sit on a parent cycle. A cycle leaves every member with a
 * parent, so none of them ever shows up as a root and the corruption would
 * otherwise be invisible.
 *
 * Each Topic is settled exactly once: walk up from an unsettled Topic marking
 * the path as pending, and stop at the first Topic that is already settled or
 * already pending. Re-walking to the root from every Topic would be quadratic,
 * which a deep imported outline makes painful.
 */
function findCycleMembers(
  parentByChild: ReadonlyMap<string, TopicRelation>
): Set<string> {
  const cycleMembers = new Set<string>();
  const settled = new Set<string>();

  for (const startId of parentByChild.keys()) {
    if (settled.has(startId)) {
      continue;
    }
    const path: string[] = [];
    const pending = new Set<string>();
    let cursor: string | undefined = startId;
    while (cursor && !(settled.has(cursor) || pending.has(cursor))) {
      path.push(cursor);
      pending.add(cursor);
      cursor = parentByChild.get(cursor)?.parentId;
    }
    if (cursor !== undefined && pending.has(cursor)) {
      // The walk met itself: everything from that meeting point onward is on
      // the cycle, while the nodes before it merely lead into one.
      for (let i = path.indexOf(cursor); i < path.length; i += 1) {
        cycleMembers.add(path[i] as string);
      }
    }
    for (const id of path) {
      settled.add(id);
    }
  }
  return cycleMembers;
}

export function buildTopicIndex(nodes: Node[], edges: Edge[]): TopicIndex {
  const problems: TopicProblem[] = [];
  const topicIds = new Set<string>();
  const containerByTopic = new Map<string, string>();

  for (const node of nodes) {
    if (!isTopicNodeType(node.type)) {
      continue;
    }
    topicIds.add(node.id);
    containerByTopic.set(node.id, node.parentId ?? '');
    const parsed = parseTopicData(node.data);
    if (parsed.status === 'unsupported-version') {
      problems.push({
        kind: 'unsupported-topic-version',
        message: `Topic ${node.id} uses topicVersion ${parsed.version}, which this version cannot edit.`,
        nodeId: node.id,
      });
    } else if (parsed.status === 'invalid') {
      problems.push({
        kind: 'invalid-topic-data',
        message: `Topic ${node.id} has unreadable data: ${parsed.reason}`,
        nodeId: node.id,
      });
    }
  }

  const childrenByParent = new Map<string, TopicRelation[]>();
  const parentByChild = new Map<string, TopicRelation>();
  const treeEdgeIds = new Set<string>();

  for (const edge of edges) {
    if (!isTopicTreeEdge(edge)) {
      continue;
    }
    treeEdgeIds.add(edge.id);
    const parsed = parseTopicChildEdgeData(edge.data);
    if (parsed.status === 'unsupported-version') {
      problems.push({
        edgeId: edge.id,
        kind: 'unsupported-relation-version',
        message: `Relation ${edge.id} uses relationVersion ${parsed.version}, which this version cannot edit.`,
        nodeId: edge.target,
      });
      continue;
    }
    if (parsed.status !== 'valid' || !parsed.data) {
      problems.push({
        edgeId: edge.id,
        kind: 'invalid-relation',
        message: `Relation ${edge.id} is malformed: ${parsed.reason ?? 'unknown reason'}`,
        nodeId: edge.target,
      });
      continue;
    }
    if (edge.source === edge.target) {
      problems.push({
        edgeId: edge.id,
        kind: 'self-loop',
        message: `Relation ${edge.id} points ${edge.source} at itself.`,
        nodeId: edge.source,
      });
      continue;
    }
    if (!(topicIds.has(edge.source) && topicIds.has(edge.target))) {
      problems.push({
        edgeId: edge.id,
        kind: 'endpoint-not-topic',
        message: `Relation ${edge.id} connects a node that is not a topic.`,
        nodeId: topicIds.has(edge.source) ? edge.source : edge.target,
      });
      continue;
    }
    if (
      containerByTopic.get(edge.source) !== containerByTopic.get(edge.target)
    ) {
      problems.push({
        edgeId: edge.id,
        kind: 'cross-container',
        message: `Relation ${edge.id} crosses a group boundary.`,
        nodeId: edge.target,
      });
      continue;
    }
    const existing = parentByChild.get(edge.target);
    if (existing) {
      problems.push({
        edgeId: edge.id,
        kind: 'multiple-parents',
        message: `Topic ${edge.target} is claimed by both ${existing.parentId} and ${edge.source}.`,
        nodeId: edge.target,
      });
      continue;
    }
    const relation: TopicRelation = {
      childId: edge.target,
      edgeId: edge.id,
      order: parsed.data.order,
      parentId: edge.source,
    };
    parentByChild.set(edge.target, relation);
    const siblings = childrenByParent.get(edge.source);
    if (siblings) {
      siblings.push(relation);
    } else {
      childrenByParent.set(edge.source, [relation]);
    }
  }

  for (const siblings of childrenByParent.values()) {
    // Duplicate orders are tolerated for display (tie-broken by id) rather than
    // rewritten on load; renumbering happens only on an explicit edit.
    siblings.sort(relationSortKey);
  }

  const cycleMembers = findCycleMembers(parentByChild);
  for (const nodeId of cycleMembers) {
    problems.push({
      kind: 'cycle',
      message: `Topic ${nodeId} is part of a parent cycle.`,
      nodeId,
    });
  }

  const rootIds: string[] = [];
  for (const node of nodes) {
    if (
      topicIds.has(node.id) &&
      !(parentByChild.has(node.id) || cycleMembers.has(node.id))
    ) {
      rootIds.push(node.id);
    }
  }

  return {
    childrenByParent,
    parentByChild,
    problems,
    rootIds,
    topicIds,
    treeEdgeIds,
  };
}

/** Direct children of `topicId`, in sibling order. */
export function getTopicChildren(
  index: TopicIndex,
  topicId: string
): TopicRelation[] {
  return index.childrenByParent.get(topicId) ?? [];
}

/**
 * Every descendant of `topicId` (excluding itself), in depth-first sibling
 * order. Iterative with a visited set so a cyclic file cannot hang the caller.
 */
export function collectTopicDescendants(
  index: TopicIndex,
  topicId: string
): string[] {
  const out: string[] = [];
  const visited = new Set<string>([topicId]);
  const stack = [...getTopicChildren(index, topicId)].reverse();
  while (stack.length > 0) {
    const relation = stack.pop();
    if (!relation || visited.has(relation.childId)) {
      continue;
    }
    visited.add(relation.childId);
    out.push(relation.childId);
    const children = getTopicChildren(index, relation.childId);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i] as TopicRelation);
    }
  }
  return out;
}

/** `topicId` plus all of its descendants — the branch a move or delete acts on. */
export function collectTopicBranch(
  index: TopicIndex,
  topicId: string
): string[] {
  return [topicId, ...collectTopicDescendants(index, topicId)];
}

/** Walk to the root of `topicId`'s tree. Returns `topicId` when it is a root. */
export function findTopicRoot(index: TopicIndex, topicId: string): string {
  const visited = new Set<string>([topicId]);
  let cursor = topicId;
  for (;;) {
    const parent = index.parentByChild.get(cursor)?.parentId;
    if (!parent || visited.has(parent)) {
      return cursor;
    }
    visited.add(parent);
    cursor = parent;
  }
}

/** Depth of `topicId`, with 0 for a root. Used for outline export and a11y. */
export function getTopicDepth(index: TopicIndex, topicId: string): number {
  const visited = new Set<string>([topicId]);
  let depth = 0;
  let cursor = topicId;
  for (;;) {
    const parent = index.parentByChild.get(cursor)?.parentId;
    if (!parent || visited.has(parent)) {
      return depth;
    }
    visited.add(parent);
    cursor = parent;
    depth += 1;
  }
}

/**
 * True when `candidateParentId` sits inside the branch rooted at `topicId`.
 * Guards re-parenting against creating a cycle.
 */
export function isTopicInBranch(
  index: TopicIndex,
  topicId: string,
  candidateId: string
): boolean {
  if (topicId === candidateId) {
    return true;
  }
  return findTopicRootPathContains(index, candidateId, topicId);
}

function findTopicRootPathContains(
  index: TopicIndex,
  fromId: string,
  ancestorId: string
): boolean {
  const visited = new Set<string>([fromId]);
  let cursor = fromId;
  for (;;) {
    const parent = index.parentByChild.get(cursor)?.parentId;
    if (!parent || visited.has(parent)) {
      return false;
    }
    if (parent === ancestorId) {
      return true;
    }
    visited.add(parent);
    cursor = parent;
  }
}

export interface TopicOutlineNode {
  children: TopicOutlineNode[];
  id: string;
  title: string;
}

/**
 * Project the Topic forest into an ordered tree for outline export.
 *
 * Roots are ordered by id and children by their relation `order`, never by
 * screen position: an export must not change because someone nudged a node.
 * Topics on a cycle are skipped — they have no well-defined place in an
 * outline, and emitting them would either loop or invent a parent.
 */
export function buildTopicOutline(
  index: TopicIndex,
  nodes: Node[]
): TopicOutlineNode[] {
  const titleById = new Map<string, string>();
  for (const node of nodes) {
    if (index.topicIds.has(node.id)) {
      const parsed = parseTopicData(node.data);
      titleById.set(node.id, parsed.data?.title ?? '');
    }
  }

  const visited = new Set<string>();
  const makeNode = (topicId: string): TopicOutlineNode => ({
    children: [],
    id: topicId,
    title: titleById.get(topicId) ?? '',
  });
  // Children are appended in relation order as the stack unwinds, so the
  // result is ordered even though the walk itself is not depth-first.
  const build = (rootId: string): TopicOutlineNode => {
    const root = makeNode(rootId);
    visited.add(rootId);
    const stack: TopicOutlineNode[] = [root];
    while (stack.length > 0) {
      const current = stack.pop() as TopicOutlineNode;
      for (const relation of getTopicChildren(index, current.id)) {
        if (visited.has(relation.childId)) {
          continue;
        }
        visited.add(relation.childId);
        const child = makeNode(relation.childId);
        current.children.push(child);
        stack.push(child);
      }
    }
    return root;
  };

  return [...index.rootIds]
    .sort((a, b) => a.localeCompare(b))
    .map((rootId) => build(rootId));
}

/**
 * Topics that cannot be moved because a locked Topic sits somewhere below
 * them. Moving a Topic takes its whole branch along, and an operation that
 * would have to move a locked node is refused as a whole rather than applied
 * to the unlocked part, which would tear the branch apart on screen.
 */
export function collectTopicsBlockedByLock(
  index: TopicIndex,
  isLocked: (topicId: string) => boolean
): Set<string> {
  const blocked = new Set<string>();
  for (const topicId of index.topicIds) {
    if (!isLocked(topicId)) {
      continue;
    }
    let cursor = index.parentByChild.get(topicId)?.parentId;
    // Stop at the first ancestor already known to be blocked: everything above
    // it was walked when that ancestor was marked.
    while (cursor && !blocked.has(cursor)) {
      blocked.add(cursor);
      cursor = index.parentByChild.get(cursor)?.parentId;
    }
  }
  return blocked;
}

/**
 * Renumber a parent's children to contiguous `0..n-1`, returning only the edges
 * whose `order` actually changed. Emitting untouched edges would churn object
 * identity and defeat the structural sharing that keeps undo snapshots cheap.
 */
export function renumberSiblingEdges(
  edges: Edge[],
  parentId: string,
  orderedChildIds: string[]
): Edge[] {
  const targetOrder = new Map(
    orderedChildIds.map((childId, position) => [childId, position])
  );
  return edges.map((edge) => {
    if (edge.source !== parentId || !isTopicTreeEdge(edge)) {
      return edge;
    }
    const next = targetOrder.get(edge.target);
    if (next === undefined) {
      return edge;
    }
    const current = (edge.data as { order?: unknown } | undefined)?.order;
    if (current === next) {
      return edge;
    }
    return { ...edge, data: { ...edge.data, order: next } };
  });
}

/** Build a tree edge record. Ids come from the caller so a transaction can
 *  allocate everything up front and commit one graph. */
export function buildTopicChildEdge(
  edgeId: string,
  parentId: string,
  childId: string,
  order: number
): Edge {
  return {
    data: {
      kind: TOPIC_CHILD_EDGE_KIND,
      order,
      relationVersion: 1,
    },
    id: edgeId,
    markerEnd: 'compact-arrow',
    source: parentId,
    target: childId,
    type: 'labeledEdge',
  };
}
