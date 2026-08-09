import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { getSelectedNodesFlowBounds } from './selectionBounds';

const node = (
  id: string,
  opts: {
    selected?: boolean;
    x: number;
    y: number;
    width?: number;
    height?: number;
    parentId?: string;
  }
): Node =>
  ({
    id,
    type: 'card',
    position: { x: opts.x, y: opts.y },
    selected: opts.selected ?? false,
    parentId: opts.parentId,
    style: {
      width: opts.width ?? 100,
      height: opts.height ?? 80,
    },
    data: {},
  }) as Node;

describe('getSelectedNodesFlowBounds', () => {
  it('returns null when nothing is selected', () => {
    expect(
      getSelectedNodesFlowBounds([
        node('a', { x: 0, y: 0 }),
        node('b', { x: 200, y: 0 }),
      ])
    ).toBeNull();
  });

  it('returns the absolute AABB of the selected nodes', () => {
    const bounds = getSelectedNodesFlowBounds([
      node('a', { x: 10, y: 20, width: 100, height: 80, selected: true }),
      node('b', { x: 200, y: 40, width: 50, height: 50, selected: true }),
      node('c', { x: 0, y: 0, width: 999, height: 999 }),
    ]);

    expect(bounds).toEqual({
      left: 10,
      top: 20,
      right: 250,
      bottom: 100,
    });
  });

  it('accounts for parent offsets on nested selected nodes', () => {
    const bounds = getSelectedNodesFlowBounds([
      node('group', { x: 100, y: 50, width: 400, height: 300 }),
      node('child', {
        x: 20,
        y: 30,
        width: 100,
        height: 80,
        parentId: 'group',
        selected: true,
      }),
    ]);

    expect(bounds).toEqual({
      left: 120,
      top: 80,
      right: 220,
      bottom: 160,
    });
  });
});
