import type { Node, NodePositionChange } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { getHelperLines } from '@/lib/getHelperLines';

function makeNode(
  id: string,
  x: number,
  y: number,
  type = 'card',
  style?: Record<string, number>
): Node {
  return {
    id,
    type,
    data: {},
    position: { x, y },
    ...(style ? { style } : {}),
  };
}

function makeChange(id: string, x: number, y: number): NodePositionChange {
  return { id, type: 'position', position: { x, y }, dragging: true };
}

describe('getHelperLines', () => {
  it('returns no snap when there are no other nodes', () => {
    const nodes = [makeNode('a', 100, 100)];
    const change = makeChange('a', 110, 120);

    const result = getHelperLines(change, nodes);

    expect(result.horizontal).toBeUndefined();
    expect(result.vertical).toBeUndefined();
    expect(result.snapPosition).toEqual({});
  });

  it('snaps left edge to left edge of another node within threshold', () => {
    const nodes = [makeNode('a', 100, 100), makeNode('b', 300, 200)];
    // Drag node 'a' near left edge of node 'b'
    const change = makeChange('a', 302, 100);

    const result = getHelperLines(change, nodes);

    expect(result.vertical).toBe(300);
    expect(result.snapPosition.x).toBe(300);
  });

  it('snaps top edge to top edge of another node within threshold', () => {
    const nodes = [makeNode('a', 100, 100), makeNode('b', 300, 200)];
    // Drag node 'a' near top edge of node 'b'
    const change = makeChange('a', 100, 203);

    const result = getHelperLines(change, nodes);

    expect(result.horizontal).toBe(200);
    expect(result.snapPosition.y).toBe(200);
  });

  it('does not snap when outside the threshold', () => {
    const nodes = [makeNode('a', 100, 100), makeNode('b', 300, 200)];
    // Move node 'a' far from any alignment
    const change = makeChange('a', 150, 150);

    const result = getHelperLines(change, nodes);

    // Should not snap to b — distances are all > 5
    expect(result.snapPosition.x).toBeUndefined();
    expect(result.snapPosition.y).toBeUndefined();
  });

  it('returns no snap for a non-existent node id', () => {
    const nodes = [makeNode('a', 100, 100)];
    const change = makeChange('nonexistent', 100, 100);

    const result = getHelperLines(change, nodes);

    expect(result.horizontal).toBeUndefined();
    expect(result.vertical).toBeUndefined();
    expect(result.snapPosition).toEqual({});
  });

  it('returns no snap when change has no position', () => {
    const nodes = [makeNode('a', 100, 100), makeNode('b', 100, 300)];
    const change: NodePositionChange = {
      id: 'a',
      type: 'position',
      dragging: true,
    };

    const result = getHelperLines(change, nodes);

    expect(result.horizontal).toBeUndefined();
    expect(result.vertical).toBeUndefined();
  });

  it('uses style dimensions when measured is absent', () => {
    const nodeWidth = 200;
    const nodes = [
      makeNode('a', 0, 0, 'card', { width: nodeWidth, height: 200 }),
      makeNode('b', 200, 0, 'card', { width: nodeWidth, height: 200 }),
    ];
    // Drag 'a' to x=1. Its right edge (1 + 200 = 201) is 1px from 'b' left (200).
    const change = makeChange('a', 1, 0);

    const result = getHelperLines(change, nodes);

    // Snap aligns right-of-a with left-of-b: snapX = bLeft - nodeWidth = 0
    expect(result.vertical).toBe(200);
    expect(result.snapPosition.x).toBe(0);
  });

  it('picks the closest alignment among multiple candidates', () => {
    const nodes = [
      makeNode('a', 100, 100),
      makeNode('b', 101, 200),
      makeNode('c', 103, 300),
    ];
    // Move 'a' to x=102: distance to b.left=101 is 1, to c.left=103 is 1
    // Both within threshold; the first encountered that is smallest wins
    const change = makeChange('a', 102, 100);

    const result = getHelperLines(change, nodes);

    // Should snap to the closest (distance 1 from both, b is first)
    expect(result.vertical).toBeDefined();
    expect(result.snapPosition.x).toBeDefined();
  });
});
