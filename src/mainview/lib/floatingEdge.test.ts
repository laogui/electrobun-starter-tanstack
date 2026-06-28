import type { InternalNode, Node } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { getFloatingEdgeParams, getFloatingSourceParams } from './floatingEdge';

const node = (
  x: number,
  y: number,
  width: number | undefined,
  height: number | undefined
): InternalNode<Node> =>
  ({
    internals: { positionAbsolute: { x, y } },
    measured: { width, height },
  }) as unknown as InternalNode<Node>;

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

  it('returns null when the node is missing or not measured', () => {
    expect(getFloatingSourceParams(null, { x: 0, y: 0 })).toBeNull();
    expect(
      getFloatingSourceParams(node(0, 0, undefined, undefined), { x: 0, y: 0 })
    ).toBeNull();
  });
});
