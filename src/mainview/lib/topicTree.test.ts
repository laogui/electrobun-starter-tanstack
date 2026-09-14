import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { TOPIC_CHILD_EDGE_KIND, TOPIC_NODE_TYPE } from '../../shared/topic';
import {
  buildTopicChildEdge,
  buildTopicIndex,
  buildTopicOutline,
  collectTopicBranch,
  collectTopicDescendants,
  collectTopicsBlockedByLock,
  findTopicRoot,
  getStructurallyFrozenTopics,
  getTopicChildren,
  getTopicDepth,
  isTopicInBranch,
  renumberSiblingEdges,
  topicCanvasWritePaused,
  topicOutlineExportProblems,
  topicRecordsNeedWritePause,
} from './topicTree';

function topic(id: string, options?: { parentId?: string; title?: string }) {
  return {
    data: { color: 'neutral', title: options?.title ?? id, topicVersion: 1 },
    id,
    position: { x: 0, y: 0 },
    type: TOPIC_NODE_TYPE,
    ...(options?.parentId ? { parentId: options.parentId } : {}),
  } satisfies Node;
}

function treeEdge(parentId: string, childId: string, order: number): Edge {
  return buildTopicChildEdge(
    `e-${parentId}-${childId}`,
    parentId,
    childId,
    order
  );
}

function plainEdge(source: string, target: string): Edge {
  return {
    data: { label: 'relates to', pathType: 'bezier' },
    id: `plain-${source}-${target}`,
    source,
    target,
    type: 'labeledEdge',
  };
}

describe('buildTopicIndex', () => {
  it('reports a single root with no relations', () => {
    const index = buildTopicIndex([topic('a')], []);
    expect(index.rootIds).toEqual(['a']);
    expect(index.problems).toEqual([]);
    expect(getTopicChildren(index, 'a')).toEqual([]);
  });

  it('handles multiple independent roots', () => {
    const index = buildTopicIndex(
      [topic('a'), topic('b'), topic('a1')],
      [treeEdge('a', 'a1', 0)]
    );
    expect(index.rootIds).toEqual(['a', 'b']);
  });

  it('orders siblings by order, not by array position', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('c1'), topic('c2'), topic('c3')],
      [treeEdge('r', 'c3', 2), treeEdge('r', 'c1', 0), treeEdge('r', 'c2', 1)]
    );
    expect(getTopicChildren(index, 'r').map((c) => c.childId)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('breaks duplicate orders by id instead of rewriting them', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('b'), topic('a')],
      [treeEdge('r', 'b', 0), treeEdge('r', 'a', 0)]
    );
    expect(getTopicChildren(index, 'r').map((c) => c.childId)).toEqual([
      'a',
      'b',
    ]);
    // Tolerated for display; nothing is flagged as broken.
    expect(index.problems).toEqual([]);
  });

  it('never derives hierarchy from a plain association line', () => {
    const index = buildTopicIndex(
      [topic('a'), topic('b')],
      [plainEdge('a', 'b')]
    );
    expect(index.rootIds).toEqual(['a', 'b']);
    expect(index.treeEdgeIds.size).toBe(0);
    expect(index.problems).toEqual([]);
  });

  it('flags a second parent and keeps the first relation', () => {
    const index = buildTopicIndex(
      [topic('p1'), topic('p2'), topic('c')],
      [treeEdge('p1', 'c', 0), treeEdge('p2', 'c', 0)]
    );
    expect(index.problems.map((p) => p.kind)).toContain('multiple-parents');
    expect(index.parentByChild.get('c')?.parentId).toBe('p1');
  });

  it('flags a self-loop', () => {
    const index = buildTopicIndex([topic('a')], [treeEdge('a', 'a', 0)]);
    expect(index.problems.map((p) => p.kind)).toEqual(['self-loop']);
  });

  it('flags a cycle without hanging', () => {
    const index = buildTopicIndex(
      [topic('a'), topic('b'), topic('c')],
      [treeEdge('a', 'b', 0), treeEdge('b', 'c', 0), treeEdge('c', 'a', 0)]
    );
    expect(index.problems.map((p) => p.kind)).toEqual([
      'cycle',
      'cycle',
      'cycle',
    ]);
    // Every node has a parent, so a cycle contributes no roots.
    expect(index.rootIds).toEqual([]);
  });

  it('flags a relation whose endpoint is not a topic', () => {
    const sticky: Node = {
      data: {},
      id: 's',
      position: { x: 0, y: 0 },
      type: 'sticky',
    };
    const index = buildTopicIndex(
      [topic('a'), sticky],
      [treeEdge('a', 's', 0)]
    );
    expect(index.problems.map((p) => p.kind)).toEqual(['endpoint-not-topic']);
  });

  it('flags a relation that crosses a group boundary', () => {
    const index = buildTopicIndex(
      [topic('a'), topic('b', { parentId: 'group-1' })],
      [treeEdge('a', 'b', 0)]
    );
    expect(index.problems.map((p) => p.kind)).toEqual(['cross-container']);
  });

  it('accepts a relation inside the same group', () => {
    const index = buildTopicIndex(
      [topic('a', { parentId: 'g' }), topic('b', { parentId: 'g' })],
      [treeEdge('a', 'b', 0)]
    );
    expect(index.problems).toEqual([]);
    expect(index.parentByChild.get('b')?.parentId).toBe('a');
  });

  it('flags a malformed relation payload', () => {
    const bad: Edge = {
      data: { kind: TOPIC_CHILD_EDGE_KIND, order: -1, relationVersion: 1 },
      id: 'bad',
      source: 'a',
      target: 'b',
    };
    const index = buildTopicIndex([topic('a'), topic('b')], [bad]);
    expect(index.problems.map((p) => p.kind)).toEqual(['invalid-relation']);
  });

  it('flags an unsupported relation version separately from a malformed one', () => {
    const future: Edge = {
      data: { kind: TOPIC_CHILD_EDGE_KIND, order: 0, relationVersion: 99 },
      id: 'future',
      source: 'a',
      target: 'b',
    };
    const index = buildTopicIndex([topic('a'), topic('b')], [future]);
    expect(index.problems.map((p) => p.kind)).toEqual([
      'unsupported-relation-version',
    ]);
  });

  it('flags an unsupported topic version but still counts it as a topic', () => {
    const future: Node = {
      data: { title: 'from the future', topicVersion: 42 },
      id: 'f',
      position: { x: 0, y: 0 },
      type: TOPIC_NODE_TYPE,
    };
    const index = buildTopicIndex([future], []);
    expect(index.problems.map((p) => p.kind)).toEqual([
      'unsupported-topic-version',
    ]);
    expect(index.topicIds.has('f')).toBe(true);
    expect(index.rootIds).toEqual(['f']);
  });

  it('freezes structural edits only for the affected topics', () => {
    const index = buildTopicIndex(
      [topic('ok'), topic('p1'), topic('p2'), topic('c')],
      [treeEdge('p1', 'c', 0), treeEdge('p2', 'c', 0)]
    );
    const frozen = getStructurallyFrozenTopics(index);
    expect(frozen.has('c')).toBe(true);
    expect(frozen.has('ok')).toBe(false);
  });

  it('pauses writes for unsupported or invalid records, not retainable structure damage', () => {
    const cyclic = buildTopicIndex(
      [topic('x'), topic('y')],
      [treeEdge('x', 'y', 0), treeEdge('y', 'x', 0)]
    );
    expect(topicRecordsNeedWritePause(cyclic)).toBe(false);

    const unsupported = buildTopicIndex(
      [
        {
          data: { title: 'Future', topicVersion: 99 },
          id: 'f',
          position: { x: 0, y: 0 },
          type: TOPIC_NODE_TYPE,
        },
      ],
      []
    );
    expect(topicRecordsNeedWritePause(unsupported)).toBe(true);
    expect(topicCanvasWritePaused([topic('ok')], [])).toBe(false);
    expect(
      topicCanvasWritePaused(
        [
          {
            data: { title: 'Broken' },
            id: 'bad',
            position: { x: 0, y: 0 },
            type: TOPIC_NODE_TYPE,
          },
        ],
        []
      )
    ).toBe(true);
  });
});

describe('traversal', () => {
  //      r
  //     / \
  //    a   b
  //   /
  //  a1
  const nodes = [topic('r'), topic('a'), topic('b'), topic('a1')];
  const edges = [
    treeEdge('r', 'a', 0),
    treeEdge('r', 'b', 1),
    treeEdge('a', 'a1', 0),
  ];
  const index = buildTopicIndex(nodes, edges);

  it('collects descendants in depth-first sibling order', () => {
    expect(collectTopicDescendants(index, 'r')).toEqual(['a', 'a1', 'b']);
    expect(collectTopicDescendants(index, 'a')).toEqual(['a1']);
    expect(collectTopicDescendants(index, 'a1')).toEqual([]);
  });

  it('includes the topic itself in a branch', () => {
    expect(collectTopicBranch(index, 'a')).toEqual(['a', 'a1']);
  });

  it('walks to the root', () => {
    expect(findTopicRoot(index, 'a1')).toBe('r');
    expect(findTopicRoot(index, 'r')).toBe('r');
  });

  it('reports depth from the root', () => {
    expect(getTopicDepth(index, 'r')).toBe(0);
    expect(getTopicDepth(index, 'a')).toBe(1);
    expect(getTopicDepth(index, 'a1')).toBe(2);
  });

  it('detects whether a candidate sits inside a branch', () => {
    expect(isTopicInBranch(index, 'a', 'a1')).toBe(true);
    expect(isTopicInBranch(index, 'a', 'a')).toBe(true);
    expect(isTopicInBranch(index, 'a', 'b')).toBe(false);
  });

  it('terminates on a cyclic graph', () => {
    const cyclic = buildTopicIndex(
      [topic('x'), topic('y')],
      [treeEdge('x', 'y', 0), treeEdge('y', 'x', 0)]
    );
    expect(() => collectTopicDescendants(cyclic, 'x')).not.toThrow();
    expect(() => findTopicRoot(cyclic, 'x')).not.toThrow();
    expect(() => getTopicDepth(cyclic, 'x')).not.toThrow();
  });

  it('handles a deep chain without recursing', () => {
    const deepNodes: Node[] = [];
    const deepEdges: Edge[] = [];
    for (let i = 0; i < 5000; i += 1) {
      deepNodes.push(topic(`n${i}`));
      if (i > 0) {
        deepEdges.push(treeEdge(`n${i - 1}`, `n${i}`, 0));
      }
    }
    const deep = buildTopicIndex(deepNodes, deepEdges);
    expect(collectTopicDescendants(deep, 'n0')).toHaveLength(4999);
    expect(getTopicDepth(deep, 'n4999')).toBe(4999);
  });
});

describe('buildTopicOutline', () => {
  it('orders roots by id and children by relation order', () => {
    const nodes = [
      topic('z-root', { title: 'Z' }),
      topic('a-root', { title: 'A' }),
      topic('c2', { title: 'Second' }),
      topic('c1', { title: 'First' }),
    ];
    const edges = [treeEdge('a-root', 'c2', 1), treeEdge('a-root', 'c1', 0)];
    const outline = buildTopicOutline(buildTopicIndex(nodes, edges), nodes);

    // Node order in the array and screen position are both irrelevant, so the
    // same canvas always exports the same file.
    expect(outline.map((entry) => entry.title)).toEqual(['A', 'Z']);
    expect(outline[0]?.children.map((entry) => entry.title)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('ignores ordinary connections between Topics', () => {
    const nodes = [
      topic('r', { title: 'Root' }),
      topic('x', { title: 'Other' }),
    ];
    const outline = buildTopicOutline(
      buildTopicIndex(nodes, [plainEdge('r', 'x')]),
      nodes
    );

    // A hand-drawn link is an association, not parentage.
    expect(outline).toHaveLength(2);
    expect(outline[0]?.children).toEqual([]);
  });

  it('blocks outline export when the index has problems', () => {
    const cyclic = buildTopicIndex(
      [topic('x'), topic('y')],
      [treeEdge('x', 'y', 0), treeEdge('y', 'x', 0)]
    );
    expect(
      topicOutlineExportProblems(cyclic).some((p) => p.kind === 'cycle')
    ).toBe(true);

    const unsupported = buildTopicIndex(
      [
        {
          data: { title: 'Future', topicVersion: 99 },
          id: 'r',
          position: { x: 0, y: 0 },
          type: TOPIC_NODE_TYPE,
        },
      ],
      []
    );
    expect(
      topicOutlineExportProblems(unsupported).some(
        (p) => p.kind === 'unsupported-topic-version'
      )
    ).toBe(true);

    const healthy = buildTopicIndex([topic('r')], []);
    expect(topicOutlineExportProblems(healthy)).toEqual([]);
  });

  it('omits Topics stuck on a cycle', () => {
    const nodes = [topic('r', { title: 'Root' }), topic('x'), topic('y')];
    const edges = [treeEdge('x', 'y', 0), treeEdge('y', 'x', 0)];
    const outline = buildTopicOutline(buildTopicIndex(nodes, edges), nodes);

    // A cycle has no place in an outline; the healthy root still exports.
    expect(outline.map((entry) => entry.title)).toEqual(['Root']);
    expect(outline[0]?.children).toEqual([]);
  });
});

describe('collectTopicsBlockedByLock', () => {
  const nodes = [
    topic('r'),
    topic('a'),
    topic('a1'),
    topic('b'),
    topic('other'),
  ];
  const edges = [
    treeEdge('r', 'a', 0),
    treeEdge('a', 'a1', 0),
    treeEdge('r', 'b', 1),
  ];
  const index = buildTopicIndex(nodes, edges);

  it('blocks every ancestor of a locked Topic', () => {
    const blocked = collectTopicsBlockedByLock(index, (id) => id === 'a1');
    // Dragging `r` or `a` would have to move `a1`, so both are refused; `b`
    // and an unrelated root stay free.
    expect([...blocked].sort()).toEqual(['a', 'r']);
  });

  it('does not block a locked Topic from being read as a leaf', () => {
    const blocked = collectTopicsBlockedByLock(index, (id) => id === 'b');
    expect(blocked.has('b')).toBe(false);
    expect(blocked.has('r')).toBe(true);
  });

  it('returns an empty set when nothing is locked', () => {
    expect(collectTopicsBlockedByLock(index, () => false).size).toBe(0);
  });
});

describe('renumberSiblingEdges', () => {
  const edges = [
    treeEdge('r', 'a', 0),
    treeEdge('r', 'b', 1),
    treeEdge('r', 'c', 2),
    plainEdge('r', 'z'),
  ];

  it('renumbers to contiguous positions', () => {
    const next = renumberSiblingEdges(edges, 'r', ['c', 'a', 'b']);
    const orders = Object.fromEntries(
      next
        .filter((e) => e.id.startsWith('e-r-'))
        .map((e) => [e.target, (e.data as { order: number }).order])
    );
    expect(orders).toEqual({ a: 1, b: 2, c: 0 });
  });

  it('preserves object identity for edges whose order did not change', () => {
    const next = renumberSiblingEdges(edges, 'r', ['a', 'b', 'c']);
    expect(next[0]).toBe(edges[0]);
    expect(next[1]).toBe(edges[1]);
    expect(next[2]).toBe(edges[2]);
  });

  it('leaves plain association lines untouched', () => {
    const next = renumberSiblingEdges(edges, 'r', ['c', 'a', 'b']);
    expect(next[3]).toBe(edges[3]);
  });
});
