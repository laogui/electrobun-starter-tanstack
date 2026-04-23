// @vitest-environment jsdom

import { render } from '@testing-library/react';
import type { ConnectionLineComponentProps } from '@xyflow/react';
import { ConnectionLineType, Position } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ConnectionPreviewLine from './ConnectionPreviewLine';

const getBezierPathMock = vi.hoisted(() => vi.fn(() => ['preview-path']));

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    getBezierPath: getBezierPathMock,
  };
});

const createProps = (): ConnectionLineComponentProps => ({
  connectionLineStyle: undefined,
  connectionLineType: ConnectionLineType.Bezier,
  connectionStatus: null,
  fromHandle: {
    height: 10,
    id: 'source',
    nodeId: 'node-1',
    position: Position.Right,
    type: 'source',
    width: 10,
    x: 0,
    y: 0,
  },
  fromNode: {} as never,
  fromPosition: Position.Right,
  fromX: 20,
  fromY: 30,
  pointer: { x: 140, y: 60 },
  toHandle: null,
  toNode: null,
  toPosition: Position.Left,
  toX: 140,
  toY: 60,
});

describe('ConnectionPreviewLine', () => {
  afterEach(() => {
    getBezierPathMock.mockClear();
  });

  it('renders a preview path with the active arrow marker', () => {
    const { container } = render(
      <svg>
        <ConnectionPreviewLine {...createProps()} />
      </svg>
    );

    const path = container.querySelector('.react-flow__connection-path');

    expect(path).not.toBeNull();
    expect(path).toHaveAttribute('d', 'preview-path');
    expect(path).toHaveAttribute('marker-end', 'url(#compact-arrow-active)');
    expect(getBezierPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      })
    );
  });

  it('uses the hovered handle position when a target handle is available', () => {
    render(
      <svg>
        <ConnectionPreviewLine
          {...createProps()}
          toHandle={
            {
              height: 10,
              id: 'target',
              nodeId: 'node-2',
              position: Position.Top,
              type: 'target',
              width: 10,
              x: 0,
              y: 0,
            } as never
          }
          toPosition={Position.Top}
          toX={80}
          toY={180}
        />
      </svg>
    );

    expect(getBezierPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePosition: Position.Right,
        targetPosition: Position.Top,
      })
    );
  });
});
