import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { getConnectionPreviewTargetPosition } from './getConnectionPreviewTargetPosition';

describe('getConnectionPreviewTargetPosition', () => {
  it('uses the left side when dragging primarily to the right', () => {
    expect(
      getConnectionPreviewTargetPosition({
        fromX: 20,
        fromY: 20,
        toX: 140,
        toY: 50,
      })
    ).toBe(Position.Left);
  });

  it('uses the right side when dragging primarily to the left', () => {
    expect(
      getConnectionPreviewTargetPosition({
        fromX: 140,
        fromY: 20,
        toX: 20,
        toY: 10,
      })
    ).toBe(Position.Right);
  });

  it('uses the top side when dragging primarily downward', () => {
    expect(
      getConnectionPreviewTargetPosition({
        fromX: 20,
        fromY: 20,
        toX: 60,
        toY: 180,
      })
    ).toBe(Position.Top);
  });

  it('uses the bottom side when dragging primarily upward', () => {
    expect(
      getConnectionPreviewTargetPosition({
        fromX: 20,
        fromY: 180,
        toX: 60,
        toY: 20,
      })
    ).toBe(Position.Bottom);
  });

  it('breaks equal deltas toward the horizontal axis', () => {
    expect(
      getConnectionPreviewTargetPosition({
        fromX: 20,
        fromY: 20,
        toX: 80,
        toY: 80,
      })
    ).toBe(Position.Left);
  });
});
