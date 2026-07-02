import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { CARD_H, CARD_W } from './canvasNodeRegistry';
import type { Point } from './collision';
import {
  applyDragRepulsion,
  captureRepulsionOrigins,
  REPULSION_GAP,
  REPULSION_MARGIN,
} from './repulsion';

const card = (
  id: string,
  x: number,
  y: number,
  extra: Partial<Node> = {}
): Node =>
  ({
    id,
    type: 'card',
    position: { x, y },
    data: {},
    style: { width: CARD_W, height: CARD_H },
    ...extra,
  }) as Node;

const group = (id: string, x: number, y: number, w: number, h: number): Node =>
  ({
    id,
    type: 'group',
    position: { x, y },
    data: {},
    style: { width: w, height: h },
  }) as Node;

const folder = (id: string, x: number, y: number): Node =>
  ({
    id,
    type: 'folder',
    position: { x, y },
    data: { children: [] },
    style: { width: 280, height: 280 },
  }) as Node;

const originsOf = (nodes: Node[]): Map<string, Point> =>
  captureRepulsionOrigins(nodes);

const positionOf = (nodes: Node[], id: string): Point => {
  const node = nodes.find((n) => n.id === id);
  if (!node) {
    throw new Error(`missing node ${id}`);
  }
  return node.position;
};

describe('captureRepulsionOrigins', () => {
  it('captures top-level positions and skips parented children', () => {
    const nodes = [
      card('a', 5, 6),
      group('g', 100, 100, 500, 300),
      card('child', 10, 10, { parentId: 'g' }),
    ];
    const origins = captureRepulsionOrigins(nodes);
    expect(origins.get('a')).toEqual({ x: 5, y: 6 });
    expect(origins.get('g')).toEqual({ x: 100, y: 100 });
    expect(origins.has('child')).toBe(false);
  });
});

describe('applyDragRepulsion — basic pushing', () => {
  it('pushes an overlapping card out along the smallest axis, keeping the gap', () => {
    const nodes = [card('a', 0, 0), card('b', 10, 10)];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });

    // Horizontal penetration is smallest: b ends exactly gap px to the right.
    expect(positionOf(result, 'b')).toEqual({
      x: CARD_W + REPULSION_GAP,
      y: 10,
    });
    // The active node itself is never moved.
    expect(positionOf(result, 'a')).toEqual({ x: 0, y: 0 });
  });

  it('moves pushed nodes continuously (small penetration → small displacement)', () => {
    // b's origin sits just 4px inside the gap halo of a.
    const bx = CARD_W + REPULSION_GAP - 4;
    const nodes = [card('a', 0, 0), card('b', bx, 0)];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });
    expect(positionOf(result, 'b').x).toBeCloseTo(CARD_W + REPULSION_GAP, 5);
  });

  it('does not move nodes outside the gap halo', () => {
    const nodes = [card('a', 0, 0), card('b', 2000, 2000)];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });
    expect(result.find((n) => n.id === 'b')).toBe(nodes[1]);
  });

  it('propagates pushes along chains with margin spacing', () => {
    const nodes = [card('a', 0, 0), card('b', 300, 0), card('c', 700, 0)];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });

    const b = positionOf(result, 'b');
    const c = positionOf(result, 'c');
    // b cleared the active gap, c cleared b by at least the margin.
    expect(b.x).toBeGreaterThanOrEqual(CARD_W + REPULSION_GAP - 0.6);
    expect(c.x - (b.x + CARD_W)).toBeGreaterThanOrEqual(REPULSION_MARGIN - 0.6);
    expect(b.y).toBe(0);
    expect(c.y).toBe(0);
  });

  it('supports multiple active nodes pushing simultaneously', () => {
    const nodes = [
      card('a1', 0, 0),
      card('a2', 0, 1000),
      card('b', 10, 10),
      card('c', 10, 1010),
    ];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a1', 'a2']),
      origins: originsOf(nodes),
    });
    expect(positionOf(result, 'b')).not.toEqual({ x: 10, y: 10 });
    expect(positionOf(result, 'c')).not.toEqual({ x: 10, y: 1010 });
  });
});

describe('applyDragRepulsion — containers and exemptions', () => {
  it('never pushes groups or folders', () => {
    const nodes = [
      card('a', 0, 0),
      group('g', 10, 10, 500, 300),
      folder('f', 20, 20),
    ];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });
    expect(positionOf(result, 'g')).toEqual({ x: 10, y: 10 });
    expect(positionOf(result, 'f')).toEqual({ x: 20, y: 20 });
  });

  it('never pushes group children', () => {
    const nodes = [
      card('a', 100, 0),
      group('g', 400, 0, 500, 300),
      card('child', 10, 10, { parentId: 'g', extent: 'parent' }),
    ];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });
    expect(positionOf(result, 'child')).toEqual({ x: 10, y: 10 });
  });

  it('never pushes locked nodes', () => {
    const nodes = [
      card('a', 0, 0),
      card('locked', 10, 10, { data: { locked: true } }),
    ];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });
    expect(positionOf(result, 'locked')).toEqual({ x: 10, y: 10 });
  });

  it('slides pushed nodes around immovable obstacles', () => {
    // b gets pushed right into the folder's bottom edge and must slip below it.
    const nodes = [
      card('a', 0, 20),
      card('b', 300, 20),
      folder('f', 600, -260),
    ];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });

    const b = positionOf(result, 'b');
    expect(b.x).toBeGreaterThanOrEqual(CARD_W + REPULSION_GAP - 0.6);
    // No longer intersecting the folder (folder bottom edge is at y=20).
    expect(b.y).toBeGreaterThanOrEqual(20 + REPULSION_MARGIN - 0.6);
  });

  it('leaves untouched pre-existing overlaps alone', () => {
    const nodes = [
      card('a', 0, 0),
      card('b', 1000, 1000),
      card('c', 1010, 1010),
    ];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });
    expect(result.find((n) => n.id === 'b')).toBe(nodes[1]);
    expect(result.find((n) => n.id === 'c')).toBe(nodes[2]);
  });

  it('treats unknown top-level node types as immovable obstacles', () => {
    const nodes = [
      card('a', 0, 0),
      { ...card('w', 10, 10), type: 'mystery' } as Node,
    ];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });
    expect(positionOf(result, 'w')).toEqual({ x: 10, y: 10 });
  });
});

describe('applyDragRepulsion — origins and restore', () => {
  it('restores previously pushed nodes once the active node moves away', () => {
    const initial = [card('a', 0, 0), card('b', 10, 10)];
    const origins = originsOf(initial);
    const pushed = applyDragRepulsion({
      nodes: initial,
      activeIds: new Set(['a']),
      origins,
    });
    expect(positionOf(pushed, 'b')).not.toEqual({ x: 10, y: 10 });

    // Active moved far away; b flows back to its origin.
    const moved = pushed.map((n) =>
      n.id === 'a' ? { ...n, position: { x: 5000, y: 5000 } } : n
    );
    const result = applyDragRepulsion({
      nodes: moved,
      activeIds: new Set(['a']),
      origins,
    });
    expect(positionOf(result, 'b')).toEqual({ x: 10, y: 10 });
  });

  it('restores everything when paused (hovering a drop target)', () => {
    const initial = [card('a', 0, 0), card('b', 10, 10)];
    const origins = originsOf(initial);
    const pushed = applyDragRepulsion({
      nodes: initial,
      activeIds: new Set(['a']),
      origins,
    });
    expect(positionOf(pushed, 'b')).not.toEqual({ x: 10, y: 10 });

    const result = applyDragRepulsion({
      nodes: pushed,
      activeIds: new Set(['a']),
      origins,
      paused: true,
    });
    expect(positionOf(result, 'b')).toEqual({ x: 10, y: 10 });
    // Active stays wherever the user holds it, even while paused.
    expect(positionOf(result, 'a')).toEqual({ x: 0, y: 0 });
  });

  it('keeps object identity for nodes whose solved position is unchanged', () => {
    const nodes = [card('a', 0, 0), card('b', 2000, 0), folder('f', 0, 2000)];
    const result = applyDragRepulsion({
      nodes,
      activeIds: new Set(['a']),
      origins: originsOf(nodes),
    });
    expect(result.find((n) => n.id === 'b')).toBe(nodes[1]);
    expect(result.find((n) => n.id === 'f')).toBe(nodes[2]);
  });
});
