import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  TOPIC_LEVEL_GAP,
  TOPIC_NODE_TYPE,
  TOPIC_SIBLING_GAP,
} from '../../shared/topic';
import type { Size } from './collision';
import {
  collectTopicLayoutObstacles,
  diffTopicPositions,
  layoutTopicTree,
  layoutTopicTreeAvoiding,
  TOPIC_AVOIDANCE_STEP,
  translateTopicBranch,
} from './topicLayout';
import { buildTopicChildEdge, buildTopicIndex } from './topicTree';

const NODE_W = 100;
const NODE_H = 40;

function topic(id: string): Node {
  return {
    data: { color: 'neutral', title: id, topicVersion: 1 },
    id,
    position: { x: 0, y: 0 },
    type: TOPIC_NODE_TYPE,
  };
}

function treeEdge(parentId: string, childId: string, order: number): Edge {
  return buildTopicChildEdge(
    `e-${parentId}-${childId}`,
    parentId,
    childId,
    order
  );
}

function uniformSizes(ids: string[]): Map<string, Size> {
  return new Map(ids.map((id) => [id, { height: NODE_H, width: NODE_W }]));
}

describe('layoutTopicTree', () => {
  it('keeps a lone root exactly at its anchor', () => {
    const index = buildTopicIndex([topic('r')], []);
    const result = layoutTopicTree(index, 'r', {
      rootAnchor: { x: 30, y: 70 },
      sizes: uniformSizes(['r']),
    });
    expect(result.positions.get('r')).toEqual({ x: 30, y: 70 });
  });

  it('places children to the right, one level gap away', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('c')],
      [treeEdge('r', 'c', 0)]
    );
    const result = layoutTopicTree(index, 'r', {
      rootAnchor: { x: 0, y: 0 },
      sizes: uniformSizes(['r', 'c']),
    });
    expect(result.positions.get('c')?.x).toBe(NODE_W + TOPIC_LEVEL_GAP);
  });

  it('stacks siblings downward in order with the sibling gap between them', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('a'), topic('b')],
      [treeEdge('r', 'a', 0), treeEdge('r', 'b', 1)]
    );
    const result = layoutTopicTree(index, 'r', {
      rootAnchor: { x: 0, y: 0 },
      sizes: uniformSizes(['r', 'a', 'b']),
    });
    const a = result.positions.get('a');
    const b = result.positions.get('b');
    expect(a?.y).toBe(-(NODE_H + TOPIC_SIBLING_GAP) / 2);
    expect(b?.y).toBe((NODE_H + TOPIC_SIBLING_GAP) / 2);
    expect(a?.x).toBe(b?.x);
  });

  it('centres a parent on the band its children occupy', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('a'), topic('b')],
      [treeEdge('r', 'a', 0), treeEdge('r', 'b', 1)]
    );
    const result = layoutTopicTree(index, 'r', {
      rootAnchor: { x: 0, y: 0 },
      sizes: uniformSizes(['r', 'a', 'b']),
    });
    const childrenHeight = NODE_H * 2 + TOPIC_SIBLING_GAP;
    expect(result.positions.get('r')).toEqual({ x: 0, y: 0 });
    expect(result.positions.get('a')?.y).toBe(-(childrenHeight - NODE_H) / 2);
    expect(result.bounds.y).toBe(-(childrenHeight - NODE_H) / 2);
  });

  it('does not drift when relayout uses the previous root position', () => {
    const ids = ['r', 'a', 'b', 'a1', 'a2'];
    const index = buildTopicIndex(ids.map(topic), [
      treeEdge('r', 'a', 0),
      treeEdge('r', 'b', 1),
      treeEdge('a', 'a1', 0),
      treeEdge('a', 'a2', 1),
    ]);
    const sizes = uniformSizes(ids);
    const anchor = { x: 120, y: 300 };
    const first = layoutTopicTree(index, 'r', { rootAnchor: anchor, sizes });
    let previous = first;
    for (let i = 0; i < 5; i += 1) {
      previous = layoutTopicTree(index, 'r', {
        rootAnchor: previous.positions.get('r')!,
        sizes,
      });
      expect(previous.positions.get('r')).toEqual(anchor);
      expect([...previous.positions]).toEqual([...first.positions]);
    }
  });

  it('never overlaps nodes within one tree', () => {
    //        r
    //     /  |  \
    //    a   b   c
    //   / \
    //  a1  a2
    const ids = ['r', 'a', 'b', 'c', 'a1', 'a2'];
    const index = buildTopicIndex(ids.map(topic), [
      treeEdge('r', 'a', 0),
      treeEdge('r', 'b', 1),
      treeEdge('r', 'c', 2),
      treeEdge('a', 'a1', 0),
      treeEdge('a', 'a2', 1),
    ]);
    const result = layoutTopicTree(index, 'r', {
      rootAnchor: { x: 0, y: 0 },
      sizes: uniformSizes(ids),
    });
    const rects = [...result.positions].map(([id, p]) => ({
      bottom: p.y + NODE_H,
      id,
      left: p.x,
      right: p.x + NODE_W,
      top: p.y,
    }));
    for (const a of rects) {
      for (const b of rects) {
        if (a.id >= b.id) {
          continue;
        }
        const overlaps =
          a.left < b.right &&
          b.left < a.right &&
          a.top < b.bottom &&
          b.top < a.bottom;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('is deterministic: the same tree lays out identically every time', () => {
    const ids = ['r', 'a', 'b', 'a1'];
    const index = buildTopicIndex(ids.map(topic), [
      treeEdge('r', 'a', 0),
      treeEdge('r', 'b', 1),
      treeEdge('a', 'a1', 0),
    ]);
    const options = {
      rootAnchor: { x: 12, y: 34 },
      sizes: uniformSizes(ids),
    };
    const first = layoutTopicTree(index, 'r', options);
    const second = layoutTopicTree(index, 'r', options);
    expect([...second.positions]).toEqual([...first.positions]);
  });

  it('accounts for varying node sizes when spacing levels', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('c')],
      [treeEdge('r', 'c', 0)]
    );
    const sizes = new Map<string, Size>([
      ['r', { height: NODE_H, width: 320 }],
      ['c', { height: NODE_H, width: NODE_W }],
    ]);
    const result = layoutTopicTree(index, 'r', {
      rootAnchor: { x: 0, y: 0 },
      sizes,
    });
    expect(result.positions.get('c')?.x).toBe(320 + TOPIC_LEVEL_GAP);
  });

  it('reports a bounding box covering the whole tree', () => {
    const ids = ['r', 'a', 'b'];
    const index = buildTopicIndex(ids.map(topic), [
      treeEdge('r', 'a', 0),
      treeEdge('r', 'b', 1),
    ]);
    const result = layoutTopicTree(index, 'r', {
      rootAnchor: { x: 5, y: 5 },
      sizes: uniformSizes(ids),
    });
    expect(result.bounds.width).toBe(NODE_W * 2 + TOPIC_LEVEL_GAP);
    expect(result.bounds.height).toBe(NODE_H * 2 + TOPIC_SIBLING_GAP);
    expect(result.bounds.x).toBe(5);
  });

  it('terminates on a cyclic graph instead of looping forever', () => {
    const index = buildTopicIndex(
      [topic('x'), topic('y')],
      [treeEdge('x', 'y', 0), treeEdge('y', 'x', 0)]
    );
    expect(() =>
      layoutTopicTree(index, 'x', {
        rootAnchor: { x: 0, y: 0 },
        sizes: uniformSizes(['x', 'y']),
      })
    ).not.toThrow();
  });

  it('lays out a deep chain without recursing', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    for (let i = 0; i < 3000; i += 1) {
      nodes.push(topic(`n${i}`));
      if (i > 0) {
        edges.push(treeEdge(`n${i - 1}`, `n${i}`, 0));
      }
    }
    const index = buildTopicIndex(nodes, edges);
    const result = layoutTopicTree(index, 'n0', {
      rootAnchor: { x: 0, y: 0 },
      sizes: uniformSizes(nodes.map((n) => n.id)),
    });
    expect(result.positions.size).toBe(3000);
    expect(result.positions.get('n2999')?.x).toBe(
      2999 * (NODE_W + TOPIC_LEVEL_GAP)
    );
  });
});

describe('diffTopicPositions', () => {
  it('returns only the positions that moved', () => {
    const current = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 10, y: 10 }],
    ]);
    const next = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 10, y: 20 }],
    ]);
    expect([...diffTopicPositions(current, next).keys()]).toEqual(['b']);
  });

  it('treats a newly placed node as changed', () => {
    const changed = diffTopicPositions(
      new Map(),
      new Map([['n', { x: 1, y: 2 }]])
    );
    expect(changed.get('n')).toEqual({ x: 1, y: 2 });
  });
});

describe('translateTopicBranch', () => {
  it('moves the topic and all of its descendants by the same delta', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('a'), topic('a1'), topic('b')],
      [treeEdge('r', 'a', 0), treeEdge('r', 'b', 1), treeEdge('a', 'a1', 0)]
    );
    const current = new Map([
      ['r', { x: 0, y: 0 }],
      ['a', { x: 100, y: 0 }],
      ['a1', { x: 200, y: 0 }],
      ['b', { x: 100, y: 60 }],
    ]);
    const moved = translateTopicBranch(index, 'a', current, { x: 5, y: -5 });
    expect(moved.get('a')).toEqual({ x: 105, y: -5 });
    expect(moved.get('a1')).toEqual({ x: 205, y: -5 });
    // A sibling outside the branch stays put.
    expect(moved.has('b')).toBe(false);
    expect(moved.has('r')).toBe(false);
  });
});

describe('layoutTopicTreeAvoiding', () => {
  it('matches tidy-tree when nothing is in the way', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('c')],
      [treeEdge('r', 'c', 0)]
    );
    const options = {
      rootAnchor: { x: 0, y: 0 },
      sizes: uniformSizes(['r', 'c']),
    };
    const tidy = layoutTopicTree(index, 'r', options);
    const avoided = layoutTopicTreeAvoiding(index, 'r', options);
    expect(avoided.softOverlap).toBe(false);
    expect(avoided.hardFailure).toBeUndefined();
    expect([...avoided.positions]).toEqual([...tidy.positions]);
  });

  it('shifts the tree down past a nearby image and still commits cleanly', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('c')],
      [treeEdge('r', 'c', 0)]
    );
    const sizes = uniformSizes(['r', 'c']);
    const tidy = layoutTopicTree(index, 'r', {
      rootAnchor: { x: 0, y: 0 },
      sizes,
    });
    const child = tidy.positions.get('c');
    if (!child) {
      throw new Error('expected child position');
    }
    const result = layoutTopicTreeAvoiding(index, 'r', {
      obstacles: [
        {
          bottom: child.y + NODE_H,
          left: child.x,
          right: child.x + NODE_W,
          top: child.y,
        },
      ],
      rootAnchor: { x: 0, y: 0 },
      sizes,
    });
    expect(result.hardFailure).toBeUndefined();
    expect(result.softOverlap).toBe(false);
    expect(result.positions.get('r')?.y).toBe(TOPIC_AVOIDANCE_STEP * 3);
    expect(result.positions.get('c')?.y).toBe(
      (child.y ?? 0) + TOPIC_AVOIDANCE_STEP * 3
    );
  });

  it('allows overlap and reports softOverlap when the bounded search cannot clear an image', () => {
    const index = buildTopicIndex([topic('r')], []);
    const result = layoutTopicTreeAvoiding(index, 'r', {
      obstacles: [{ bottom: 4000, left: -2000, right: 4000, top: -2000 }],
      rootAnchor: { x: 0, y: 0 },
      sizes: uniformSizes(['r']),
    });
    expect(result.hardFailure).toBeUndefined();
    expect(result.softOverlap).toBe(true);
    expect(result.positions.get('r')).toEqual({ x: 0, y: 0 });
  });

  it('rejects a tree that cannot fit inside the Group hard bounds', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('c')],
      [treeEdge('r', 'c', 0)]
    );
    const result = layoutTopicTreeAvoiding(index, 'r', {
      hardBounds: { bottom: 50, left: 0, right: 50, top: 0 },
      rootAnchor: { x: 0, y: 0 },
      sizes: uniformSizes(['r', 'c']),
    });
    expect(result.hardFailure).toBe('group-bounds');
    expect(result.positions.size).toBeGreaterThan(0);
  });

  it('rejects a layout that would move a locked Topic in this tree', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('a'), topic('b')],
      [treeEdge('r', 'a', 0), treeEdge('r', 'b', 1)]
    );
    const sizes = uniformSizes(['r', 'a', 'b']);
    const result = layoutTopicTreeAvoiding(index, 'r', {
      currentPositions: new Map([
        ['r', { x: 0, y: 0 }],
        ['a', { x: 0, y: 0 }],
        ['b', { x: 0, y: 0 }],
      ]),
      lockedIds: new Set(['a']),
      rootAnchor: { x: 0, y: 0 },
      sizes,
    });
    expect(result.hardFailure).toBe('locked-node');
  });

  it('keeps a locked root put and accepts soft overlap with a foreign locked card', () => {
    const index = buildTopicIndex([topic('r')], []);
    const result = layoutTopicTreeAvoiding(index, 'r', {
      currentPositions: new Map([['r', { x: 0, y: 0 }]]),
      lockedIds: new Set(['r']),
      obstacles: [{ bottom: 40, left: 0, right: 100, top: 0 }],
      rootAnchor: { x: 0, y: 0 },
      sizes: uniformSizes(['r']),
    });
    expect(result.hardFailure).toBeUndefined();
    expect(result.softOverlap).toBe(true);
    expect(result.positions.get('r')).toEqual({ x: 0, y: 0 });
  });

  it('picks the same fallback slot every time', () => {
    const index = buildTopicIndex(
      [topic('r'), topic('c')],
      [treeEdge('r', 'c', 0)]
    );
    const options = {
      obstacles: [{ bottom: 40, left: 164, right: 264, top: 0 }],
      rootAnchor: { x: 0, y: 0 },
      sizes: uniformSizes(['r', 'c']),
    };
    const first = layoutTopicTreeAvoiding(index, 'r', options);
    const second = layoutTopicTreeAvoiding(index, 'r', options);
    expect([...second.positions]).toEqual([...first.positions]);
  });
});

describe('collectTopicLayoutObstacles', () => {
  it('excludes the tree and its Group, and reports siblings in local space', () => {
    const group: Node = {
      data: {},
      id: 'g',
      position: { x: 100, y: 50 },
      style: { height: 400, width: 600 },
      type: 'group',
    };
    const root: Node = {
      data: { color: 'neutral', title: 'r', topicVersion: 1 },
      id: 'r',
      parentId: 'g',
      position: { x: 10, y: 10 },
      type: TOPIC_NODE_TYPE,
    };
    const image: Node = {
      data: {},
      id: 'img',
      parentId: 'g',
      position: { x: 200, y: 20 },
      style: { height: 80, width: 80 },
      type: 'image',
    };
    const obstacles = collectTopicLayoutObstacles(
      [group, root, image],
      new Set(['g', 'r']),
      { x: 100, y: 50 }
    );
    expect(obstacles).toEqual([
      { bottom: 100, left: 200, right: 280, top: 20 },
    ]);
  });
});
