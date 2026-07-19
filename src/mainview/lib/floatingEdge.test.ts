import type { InternalNode, Node } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  FOLDER_TOP_EDGE_INSET_RATIO,
  getFloatingEdgeParams,
  getFloatingSourceParams,
} from './floatingEdge';

const node = (
  x: number,
  y: number,
  width: number | undefined,
  height: number | undefined,
  options: {
    handleBounds?: InternalNode<Node>['internals']['handleBounds'];
    type?: string;
  } = {}
): InternalNode<Node> =>
  ({
    type: options.type ?? 'card',
    internals: {
      positionAbsolute: { x, y },
      handleBounds: options.handleBounds,
    },
    measured: { width, height },
  }) as unknown as InternalNode<Node>;

const sideHandles = (size: {
  width: number;
  height: number;
  topInset?: number;
}) => {
  const { width, height, topInset = 0 } = size;
  const hw = 10;
  const hh = 10;
  return {
    source: [
      {
        id: 'top',
        nodeId: 'n',
        // Stored as string the way getBoundingClientRect measurement does.
        position: 'top' as Position,
        type: 'source' as const,
        x: width / 2 - hw / 2,
        y: topInset - hh / 2,
        width: hw,
        height: hh,
      },
      {
        id: 'right',
        nodeId: 'n',
        position: 'right' as Position,
        type: 'source' as const,
        x: width - hw / 2,
        y: height / 2 - hh / 2,
        width: hw,
        height: hh,
      },
      {
        id: 'bottom',
        nodeId: 'n',
        position: 'bottom' as Position,
        type: 'source' as const,
        x: width / 2 - hw / 2,
        y: height - hh / 2,
        width: hw,
        height: hh,
      },
      {
        id: 'left',
        nodeId: 'n',
        position: 'left' as Position,
        type: 'source' as const,
        x: -hw / 2,
        y: height / 2 - hh / 2,
        width: hw,
        height: hh,
      },
    ],
    target: null,
  };
};

describe('getFloatingEdgeParams', () => {
  it('anchors to the right/left side midpoints when nodes sit side by side', () => {
    const source = node(0, 0, 100, 100);
    const target = node(300, 0, 100, 100);

    expect(getFloatingEdgeParams(source, target)).toEqual({
      sourceX: 100,
      sourceY: 50,
      sourcePosition: Position.Right,
      targetX: 300,
      targetY: 50,
      targetPosition: Position.Left,
    });
  });

  it('anchors to the bottom/top side midpoints when nodes are stacked', () => {
    const source = node(0, 0, 100, 100);
    const target = node(0, 300, 100, 100);

    expect(getFloatingEdgeParams(source, target)).toEqual({
      sourceX: 50,
      sourceY: 100,
      sourcePosition: Position.Bottom,
      targetX: 50,
      targetY: 300,
      targetPosition: Position.Top,
    });
  });

  it('insets folder top anchors to the shell lip when handleBounds are missing', () => {
    const source = node(0, 0, 100, 100);
    const folder = node(0, 300, 280, 280, { type: 'folder' });

    // Box fallback: handle center at shell top, outer rim is 5px outward.
    expect(getFloatingEdgeParams(source, folder)).toEqual({
      sourceX: 50,
      sourceY: 100,
      sourcePosition: Position.Bottom,
      targetX: 140,
      targetY: 300 + 280 * FOLDER_TOP_EDGE_INSET_RATIO - 5,
      targetPosition: Position.Top,
    });
  });

  it('uses measured handle outer rims so endpoints match other node types', () => {
    const source = node(0, 0, 100, 100, {
      handleBounds: sideHandles({ width: 100, height: 100 }),
    });
    const folderTopInset = 280 * FOLDER_TOP_EDGE_INSET_RATIO;
    const folder = node(0, 300, 280, 280, {
      type: 'folder',
      handleBounds: sideHandles({
        width: 280,
        height: 280,
        topInset: folderTopInset,
      }),
    });

    // RF outer-edge: bottom of source handle, top of folder handle.
    expect(getFloatingEdgeParams(source, folder)).toEqual({
      sourceX: 50,
      sourceY: 105,
      sourcePosition: Position.Bottom,
      targetX: 140,
      targetY: 300 + folderTopInset - 5,
      targetPosition: Position.Top,
    });
  });

  it('uses the aspect ratio so a very wide card prefers its vertical side', () => {
    // Raw |dx| (180) > |dy| (60), but normalized by half-size the vertical
    // side is closer, so a wide card should anchor on bottom, not right.
    const source = node(0, 0, 400, 40);
    const target = node(360, 60, 40, 40);

    const params = getFloatingEdgeParams(source, target);

    expect(params?.sourcePosition).toBe(Position.Bottom);
    expect(params?.sourceX).toBe(200);
    expect(params?.sourceY).toBe(40);
  });

  it('still returns a valid side when the nodes overlap (same center)', () => {
    const source = node(0, 0, 100, 100);
    const target = node(0, 0, 100, 100);

    const params = getFloatingEdgeParams(source, target);

    expect(params?.sourcePosition).toBe(Position.Right);
    expect(Number.isNaN(params?.sourceX)).toBe(false);
    expect(Number.isNaN(params?.sourceY)).toBe(false);
  });

  it('returns null until both nodes are measured', () => {
    const measured = node(0, 0, 100, 100);
    const unmeasured = node(300, 0, undefined, undefined);

    expect(getFloatingEdgeParams(measured, unmeasured)).toBeNull();
    expect(getFloatingEdgeParams(unmeasured, measured)).toBeNull();
    expect(getFloatingEdgeParams(null, measured)).toBeNull();
  });
});

describe('getFloatingSourceParams', () => {
  it('snaps the source endpoint to the side facing the pointer', () => {
    const source = node(0, 0, 100, 100);

    expect(getFloatingSourceParams(source, { x: 400, y: 50 })).toEqual({
      sx: 100,
      sy: 50,
      sourcePos: Position.Right,
    });
    expect(getFloatingSourceParams(source, { x: 50, y: 400 })).toEqual({
      sx: 50,
      sy: 100,
      sourcePos: Position.Bottom,
    });
  });

  it('snaps folder top connections onto the shell lip, not the transparent band', () => {
    const folder = node(0, 0, 280, 280, { type: 'folder' });

    expect(getFloatingSourceParams(folder, { x: 140, y: -40 })).toEqual({
      sx: 140,
      sy: 280 * FOLDER_TOP_EDGE_INSET_RATIO - 5,
      sourcePos: Position.Top,
    });
  });

  it('returns null when the node is missing or not measured', () => {
    expect(getFloatingSourceParams(null, { x: 0, y: 0 })).toBeNull();
    expect(
      getFloatingSourceParams(node(0, 0, undefined, undefined), { x: 0, y: 0 })
    ).toBeNull();
  });
});
