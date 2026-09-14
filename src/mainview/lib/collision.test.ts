import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { CARD_H, CARD_W } from './canvasNodeRegistry';
import {
  buildAbsoluteRects,
  findNearestFreePosition,
  findNearestFreePositionAroundBounds,
  findNearestFreePositionWithinBounds,
  GRID_STEP,
  inflateRect,
  isPointInside,
  isPositionAvailable,
  rectInside,
  rectsIntersect,
} from './collision';

const card = (id: string, x: number, y: number, parentId?: string): Node =>
  ({
    id,
    type: 'card',
    position: { x, y },
    style: { width: CARD_W, height: CARD_H },
    ...(parentId ? { parentId } : {}),
  }) as Node;

const group = (id: string, x: number, y: number, w: number, h: number): Node =>
  ({
    id,
    type: 'group',
    position: { x, y },
    style: { width: w, height: h },
  }) as Node;

const SIZE = { width: CARD_W, height: CARD_H };

describe('collision — rect helpers', () => {
  it('detects intersecting and disjoint rects', () => {
    expect(
      rectsIntersect(
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 5, top: 5, right: 15, bottom: 15 }
      )
    ).toBe(true);
    expect(
      rectsIntersect(
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 10, top: 10, right: 20, bottom: 20 }
      )
    ).toBe(false);
  });

  it('inflateRect expands in every direction', () => {
    const r = inflateRect({ left: 0, top: 0, right: 10, bottom: 10 }, 5);
    expect(r).toEqual({ left: -5, top: -5, right: 15, bottom: 15 });
  });

  it('isPointInside respects boundaries', () => {
    const r = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(isPointInside({ x: 5, y: 5 }, r)).toBe(true);
    expect(isPointInside({ x: 11, y: 5 }, r)).toBe(false);
  });

  it('rectInside includes the shared edge and rejects overflow', () => {
    const outer = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(rectInside({ left: 0, top: 0, right: 10, bottom: 10 }, outer)).toBe(
      true
    );
    expect(rectInside({ left: 1, top: 1, right: 11, bottom: 9 }, outer)).toBe(
      false
    );
  });
});

describe('collision — buildAbsoluteRects', () => {
  it('resolves nested parent offsets into absolute coordinates', () => {
    const nodes: Node[] = [
      group('g', 100, 200, 800, 600),
      card('c', 20, 30, 'g'),
    ];
    const rects = buildAbsoluteRects(nodes);
    expect(rects.get('c')).toMatchObject({
      left: 120,
      top: 230,
      right: 120 + CARD_W,
      bottom: 230 + CARD_H,
    });
  });
});

describe('collision — isPositionAvailable', () => {
  it('rejects positions that overlap existing rects or obstacles', () => {
    const nodeRect = { left: 0, top: 0, right: CARD_W, bottom: CARD_H };
    expect(isPositionAvailable({ x: 10, y: 10 }, SIZE, [nodeRect])).toBe(false);
    expect(
      isPositionAvailable({ x: CARD_W + 40, y: 0 }, SIZE, [nodeRect])
    ).toBe(true);
    const obstacle = { left: 1000, top: 0, right: 1400, bottom: 400 };
    expect(isPositionAvailable({ x: 1100, y: 10 }, SIZE, [], [obstacle])).toBe(
      false
    );
  });
});

describe('collision — findNearestFreePosition', () => {
  it('returns the desired position when free', () => {
    expect(findNearestFreePosition({ x: 0, y: 0 }, SIZE, [])).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('finds a nearby slot when the desired position is blocked', () => {
    const blocker = { left: 0, top: 0, right: CARD_W, bottom: CARD_H };
    const result = findNearestFreePosition({ x: 0, y: 0 }, SIZE, [blocker]);
    expect(result).not.toBeNull();
    // Must not overlap the blocker:
    const okLeft = (result as { x: number; y: number }).x + CARD_W <= 0;
    const okRight = (result as { x: number; y: number }).x >= CARD_W;
    const okTop = (result as { x: number; y: number }).y + CARD_H <= 0;
    const okBottom = (result as { x: number; y: number }).y >= CARD_H;
    expect(okLeft || okRight || okTop || okBottom).toBe(true);
  });
});

describe('collision — findNearestFreePositionWithinBounds', () => {
  it('only returns positions that fit inside the provided bounds', () => {
    const bounds = { left: 0, top: 0, right: 2000, bottom: 2000 };
    const blocker = { left: 0, top: 0, right: CARD_W, bottom: CARD_H };
    const result = findNearestFreePositionWithinBounds(
      { x: 0, y: 0 },
      SIZE,
      bounds,
      [blocker]
    );
    expect(result).not.toBeNull();
    const { x, y } = result as { x: number; y: number };
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + CARD_W).toBeLessThanOrEqual(2000);
    expect(y + CARD_H).toBeLessThanOrEqual(2000);
  });
});

describe('collision — findNearestFreePositionAroundBounds', () => {
  it('prefers the first passable direction around the bounds', () => {
    const bounds = { left: 0, top: 0, right: 500, bottom: 300 };
    const result = findNearestFreePositionAroundBounds({
      bounds,
      desired: { x: 100, y: 100 },
      directions: ['right', 'down'],
      gap: 20,
      nodeRects: [],
      size: SIZE,
    });
    expect(result).not.toBeNull();
    const { x } = result as { x: number; y: number };
    expect(x).toBeGreaterThanOrEqual(520);
    expect(GRID_STEP).toBeGreaterThan(0);
  });
});

// Repulsion behavior now lives in `repulsion.ts` (see repulsion.test.ts).
