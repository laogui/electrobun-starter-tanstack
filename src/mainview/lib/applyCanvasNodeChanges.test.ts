import type { Node, NodeChange } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { applyCanvasNodeChanges } from '@/lib/applyCanvasNodeChanges';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';

function createNode(overrides?: Partial<Node>): Node {
  return {
    id: 'note-1',
    type: 'card',
    position: { x: 0, y: 0 },
    data: {},
    style: { width: 350, height: 450 },
    ...overrides,
  };
}

describe('applyCanvasNodeChanges', () => {
  it('copies resized dimensions into node style for persistence', () => {
    const nodes = [createNode()];
    const changes: NodeChange[] = [
      {
        id: 'note-1',
        type: 'dimensions',
        dimensions: { width: 520, height: 610 },
        resizing: true,
        setAttributes: true,
      },
    ];

    const updatedNodes = applyCanvasNodeChanges(changes, nodes);

    expect(updatedNodes[0]?.style).toMatchObject({
      width: 520,
      height: 610,
    });
    expect(updatedNodes[0]?.width).toBe(520);
    expect(updatedNodes[0]?.height).toBe(610);
  });

  it('keeps the latest size after runtime fields are sanitized away', () => {
    const nodes = [createNode()];
    const changes: NodeChange[] = [
      {
        id: 'note-1',
        type: 'dimensions',
        dimensions: { width: 480, height: 540 },
        resizing: false,
      },
    ];

    const updatedNodes = applyCanvasNodeChanges(changes, nodes);
    const sanitized = sanitizeForPersistence(updatedNodes, []);

    expect(sanitized.nodes[0]).not.toHaveProperty('width');
    expect(sanitized.nodes[0]).not.toHaveProperty('height');
    expect(sanitized.nodes[0]).toMatchObject({
      style: {
        width: 480,
        height: 540,
      },
    });
  });
});
