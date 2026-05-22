import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  canAbsorbIntoFolder,
  canBeChildOf,
  isDescendant,
  normalizeCanvasParenting,
  sortNodesByParent,
} from '@/lib/canvasUtils';

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

describe('canBeChildOf', () => {
  it('group accepts card, image, sticky, folder as children', () => {
    const group = createNode('g1') as Node;
    group.type = 'group';

    for (const type of ['card', 'image', 'sticky', 'folder']) {
      const child = createNode('c1') as Node;
      child.type = type;
      expect(canBeChildOf(group, child)).toBe(true);
    }
  });

  it('group rejects group as child', () => {
    const parent = createNode('g1') as Node;
    parent.type = 'group';
    const child = createNode('g2') as Node;
    child.type = 'group';

    expect(canBeChildOf(parent, child)).toBe(false);
  });

  it('folder does not accept any children', () => {
    const folder = createNode('f1') as Node;
    folder.type = 'folder';

    for (const type of ['card', 'image', 'sticky', 'folder', 'group']) {
      const child = createNode('c1') as Node;
      child.type = type;
      expect(canBeChildOf(folder, child)).toBe(false);
    }
  });

  it('card does not accept any children', () => {
    const card = createNode('card1') as Node;
    card.type = 'card';

    for (const type of ['card', 'image', 'sticky', 'folder', 'group']) {
      const child = createNode('c1') as Node;
      child.type = type;
      expect(canBeChildOf(card, child)).toBe(false);
    }
  });
});

describe('canAbsorbIntoFolder', () => {
  it('returns true for card, image', () => {
    for (const type of ['card', 'image']) {
      const node = createNode('n1') as Node;
      node.type = type;
      expect(canAbsorbIntoFolder(node)).toBe(true);
    }
  });

  it('returns false for sticky, folder, group', () => {
    for (const type of ['sticky', 'folder', 'group']) {
      const node = createNode('n1') as Node;
      node.type = type;
      expect(canAbsorbIntoFolder(node)).toBe(false);
    }
  });
});

describe('normalizeCanvasParenting', () => {
  it('strips parentId/extent from group nodes (group-in-group cleanup)', () => {
    const nodes: Node[] = [
      { ...createNode('g1'), type: 'group' },
      { ...createNode('g2', 'g1'), type: 'group', extent: 'parent' as const },
    ];

    const result = normalizeCanvasParenting(nodes);
    const g2 = result.find((n) => n.id === 'g2')!;

    expect(g2.parentId).toBeUndefined();
    expect((g2 as any).extent).toBeUndefined();
  });

  it('preserves valid card-in-group parenting', () => {
    const nodes: Node[] = [
      { ...createNode('g1'), type: 'group' },
      { ...createNode('c1', 'g1'), type: 'card' },
    ];

    const result = normalizeCanvasParenting(nodes);
    const c1 = result.find((n) => n.id === 'c1')!;

    expect(c1.parentId).toBe('g1');
  });

  it('strips parentId from card parented to folder', () => {
    const nodes: Node[] = [
      { ...createNode('f1'), type: 'folder' },
      { ...createNode('c1', 'f1'), type: 'card' },
    ];

    const result = normalizeCanvasParenting(nodes);
    const c1 = result.find((n) => n.id === 'c1')!;

    expect(c1.parentId).toBeUndefined();
  });

  it('preserves folder-in-group parenting', () => {
    const nodes: Node[] = [
      { ...createNode('g1'), type: 'group' },
      { ...createNode('f1', 'g1'), type: 'folder' },
    ];

    const result = normalizeCanvasParenting(nodes);
    const f1 = result.find((n) => n.id === 'f1')!;

    expect(f1.parentId).toBe('g1');
  });
});
