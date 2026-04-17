import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { isDescendant, sortNodesByParent } from '@/lib/canvasUtils';

function createNode(id: string, parentId?: string): Node {
  return {
    id,
    data: {},
    position: { x: 0, y: 0 },
    type: 'card',
    ...(parentId === undefined ? {} : { parentId }),
  };
}

describe('sortNodesByParent', () => {
  it('preserves top-level node order so repeated sorting does not flip z-order', () => {
    const nodes = [
      createNode('note-1'),
      createNode('group-1'),
      createNode('note-2'),
    ];

    const once = sortNodesByParent(nodes);
    const twice = sortNodesByParent(once);

    expect(once.map((node) => node.id)).toEqual([
      'note-1',
      'group-1',
      'note-2',
    ]);
    expect(twice.map((node) => node.id)).toEqual([
      'note-1',
      'group-1',
      'note-2',
    ]);
  });

  it('places parent nodes before their descendants', () => {
    const nodes = [
      createNode('child', 'parent'),
      createNode('grandchild', 'child'),
      createNode('parent'),
    ];

    expect(sortNodesByParent(nodes).map((node) => node.id)).toEqual([
      'parent',
      'child',
      'grandchild',
    ]);
  });

  it('keeps orphaned nodes after nodes with valid parents', () => {
    const nodes = [
      createNode('orphan', 'missing'),
      createNode('child', 'parent'),
      createNode('parent'),
    ];

    expect(sortNodesByParent(nodes).map((node) => node.id)).toEqual([
      'parent',
      'child',
      'orphan',
    ]);
  });
});

describe('isDescendant', () => {
  it('returns true when the node is inside the ancestor chain', () => {
    const nodes = [
      createNode('parent'),
      createNode('child', 'parent'),
      createNode('grandchild', 'child'),
    ];

    expect(isDescendant(nodes, 'parent', 'grandchild')).toBe(true);
  });

  it('returns false for unrelated nodes and cyclic graphs', () => {
    const unrelated = [
      createNode('parent'),
      createNode('other'),
      createNode('child', 'other'),
    ];
    const cyclic = [createNode('a', 'b'), createNode('b', 'a')];

    expect(isDescendant(unrelated, 'parent', 'child')).toBe(false);
    expect(isDescendant(cyclic, 'missing', 'a')).toBe(false);
  });
});
