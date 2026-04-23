import type { Connection } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  type ConnectionStartState,
  shouldReverseEdgeDirection,
} from './shouldReverseEdgeDirection';

const createConnection = (overrides?: Partial<Connection>): Connection => ({
  source: 'node-a',
  sourceHandle: 'right',
  target: 'node-b',
  targetHandle: 'left',
  ...overrides,
});

const createConnectionStart = (
  overrides?: Partial<ConnectionStartState>
): ConnectionStartState => ({
  handleId: 'right',
  nodeId: 'node-a',
  ...overrides,
});

describe('shouldReverseEdgeDirection', () => {
  it('keeps the default direction when the drag started from the final source handle', () => {
    expect(
      shouldReverseEdgeDirection(createConnectionStart(), createConnection())
    ).toBe(false);
  });

  it('reverses direction when the final source node differs from the drag start node', () => {
    expect(
      shouldReverseEdgeDirection(
        createConnectionStart({
          handleId: 'left',
          nodeId: 'node-b',
        }),
        createConnection()
      )
    ).toBe(true);
  });

  it('reverses direction when the final source handle differs from the drag start handle', () => {
    expect(
      shouldReverseEdgeDirection(
        createConnectionStart({
          handleId: 'left',
        }),
        createConnection()
      )
    ).toBe(true);
  });

  it('does not reverse direction when the drag start handle id is unavailable', () => {
    expect(
      shouldReverseEdgeDirection(
        createConnectionStart({
          handleId: null,
        }),
        createConnection()
      )
    ).toBe(false);
  });

  it('does not reverse direction when no drag start state was recorded', () => {
    expect(
      shouldReverseEdgeDirection(
        {
          handleId: null,
          nodeId: null,
        },
        createConnection()
      )
    ).toBe(false);
  });
});
