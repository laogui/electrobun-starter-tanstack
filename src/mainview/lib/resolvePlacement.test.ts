import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { CARD_H, CARD_W } from './canvasNodeRegistry';
import { resolveNodePlacement } from './resolvePlacement';

const SIZE = { width: CARD_W, height: CARD_H };

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

describe('resolveNodePlacement — empty canvas', () => {
  it('keeps the anchor when nothing is in the way', () => {
    const result = resolveNodePlacement({
      anchor: { x: 100, y: 100 },
      nodes: [],
      newType: 'card',
      size: SIZE,
    });
    expect(result.canPlace).toBe(true);
    expect(result.parentId).toBeNull();
    expect(result.placement).toEqual({ x: 100, y: 100 });
  });
});

describe('resolveNodePlacement — group adoption', () => {
  it('adopts the node into a group when the anchor center is inside it', () => {
    const groupW = 1200;
    const groupH = 800;
    const nodes: Node[] = [group('g', 0, 0, groupW, groupH)];
    const anchor = { x: 100, y: 100 };
    const result = resolveNodePlacement({
      anchor,
      nodes,
      newType: 'card',
      size: SIZE,
    });
    expect(result.canPlace).toBe(true);
    expect(result.parentId).toBe('g');
    expect(result.placement).toEqual(anchor);
  });

  it('adopts folders into groups but not groups into groups', () => {
    const nodes: Node[] = [group('g', 0, 0, 1200, 800)];
    // Folder can now be a child of a group
    const folderResult = resolveNodePlacement({
      anchor: { x: 100, y: 100 },
      nodes,
      newType: 'folder',
      size: SIZE,
    });
    expect(folderResult.parentId).toBe('g');
    expect(folderResult.canPlace).toBe(true);

    // Group still cannot be a child of a group
    const groupResult = resolveNodePlacement({
      anchor: { x: 100, y: 100 },
      nodes,
      newType: 'group',
      size: SIZE,
    });
    expect(groupResult.parentId).toBeNull();
    expect(groupResult.canPlace).toBe(true);
  });
});

describe('resolveNodePlacement — avoidance around groups', () => {
  it('scans around the group when anchor is inside but the node is non-adoptable', () => {
    const nodes: Node[] = [group('g', 0, 0, 1000, 600)];
    const result = resolveNodePlacement({
      anchor: { x: 100, y: 100 },
      nodes,
      newType: 'group',
      size: { width: 500, height: 300 },
    });
    expect(result.canPlace).toBe(true);
    expect(result.parentId).toBeNull();
    // Landed outside the group padding zone (right/below/left/above).
    const outside =
      result.placement.x >= 1020 ||
      result.placement.y >= 620 ||
      result.placement.x + 500 <= -20 ||
      result.placement.y + 300 <= -20;
    expect(outside).toBe(true);
  });
});

describe('resolveNodePlacement — sibling avoidance', () => {
  it('shifts away from overlapping sibling cards on an empty canvas', () => {
    const nodes: Node[] = [card('c1', 0, 0)];
    const result = resolveNodePlacement({
      anchor: { x: 0, y: 0 },
      nodes,
      newType: 'card',
      size: SIZE,
    });
    expect(result.canPlace).toBe(true);
    expect(result.parentId).toBeNull();
    expect(result.placement).not.toEqual({ x: 0, y: 0 });
  });

  it('falls back to placing outside a fully packed group', () => {
    const packedChildren: Node[] = [];
    for (let y = 0; y < 800; y += CARD_H) {
      for (let x = 0; x < 1200; x += CARD_W) {
        packedChildren.push(card(`c-${x}-${y}`, x, y, 'g'));
      }
    }
    const nodes: Node[] = [group('g', 0, 0, 1200, 800), ...packedChildren];
    const result = resolveNodePlacement({
      anchor: { x: 100, y: 100 },
      nodes,
      newType: 'card',
      size: SIZE,
    });
    expect(result.canPlace).toBe(true);
    // Either placed outside the group (no parent) or into a different slot.
    if (result.parentId === null) {
      expect(
        result.placement.x >= 1220 ||
          result.placement.y >= 820 ||
          result.placement.x + CARD_W <= -20 ||
          result.placement.y + CARD_H <= -20
      ).toBe(true);
    }
  });
});
