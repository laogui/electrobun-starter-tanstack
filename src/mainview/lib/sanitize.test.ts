import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { sanitizeForPersistence } from '@/lib/sanitize';

function createNode(overrides?: Partial<Node>): Node {
  return {
    id: 'node-1',
    type: 'card',
    position: { x: 10, y: 20 },
    data: { title: 'Test', content: 'Hello' },
    ...overrides,
  };
}

function createEdge(overrides?: Partial<Edge>): Edge {
  return {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    ...overrides,
  };
}

describe('sanitizeForPersistence', () => {
  it('strips runtime node fields (selected, dragging, measured, etc.)', () => {
    const node = {
      ...createNode(),
      selected: true,
      dragging: true,
      resizing: true,
      measured: { width: 350, height: 450 },
      width: 350,
      height: 450,
    } as Node;

    const result = sanitizeForPersistence([node], []);

    expect(result.nodes[0]).not.toHaveProperty('selected');
    expect(result.nodes[0]).not.toHaveProperty('dragging');
    expect(result.nodes[0]).not.toHaveProperty('resizing');
    expect(result.nodes[0]).not.toHaveProperty('measured');
    expect(result.nodes[0]).not.toHaveProperty('width');
    expect(result.nodes[0]).not.toHaveProperty('height');
  });

  it('strips runtime data fields (isHidden, isDropTarget)', () => {
    const node = createNode({
      data: {
        title: 'Test',
        content: 'Hello',
        isHidden: true,
        isDropTarget: true,
      },
    });

    const result = sanitizeForPersistence([node], []);
    const data = result.nodes[0]!.data as Record<string, unknown>;

    expect(data).not.toHaveProperty('isHidden');
    expect(data).not.toHaveProperty('isDropTarget');
    expect(data.title).toBe('Test');
    expect(data.content).toBe('Hello');
  });

  it('preserves non-runtime node properties', () => {
    const node = createNode({
      style: { width: 350, height: 450 },
      parentId: 'group-1',
    });

    const result = sanitizeForPersistence([node], []);

    expect(result.nodes[0]).toHaveProperty('id', 'node-1');
    expect(result.nodes[0]).toHaveProperty('type', 'card');
    expect(result.nodes[0]).toHaveProperty('position');
    expect(result.nodes[0]).toHaveProperty('style');
    expect(result.nodes[0]).toHaveProperty('parentId', 'group-1');
  });

  it('strips selected from edges', () => {
    const edge = {
      ...createEdge(),
      selected: true,
    } as Edge;

    const result = sanitizeForPersistence([], [edge]);

    expect(result.edges[0]).not.toHaveProperty('selected');
    expect(result.edges[0]).toHaveProperty('id', 'edge-1');
    expect(result.edges[0]).toHaveProperty('source', 'node-1');
    expect(result.edges[0]).toHaveProperty('target', 'node-2');
  });

  it('handles empty arrays', () => {
    const result = sanitizeForPersistence([], []);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('sanitizes multiple nodes and edges', () => {
    const nodes = [
      { ...createNode({ id: 'a' }), selected: true } as Node,
      { ...createNode({ id: 'b' }), dragging: true } as Node,
    ];
    const edges = [{ ...createEdge({ id: 'e1' }), selected: true } as Edge];

    const result = sanitizeForPersistence(nodes, edges);

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    for (const n of result.nodes) {
      expect(n).not.toHaveProperty('selected');
      expect(n).not.toHaveProperty('dragging');
    }
    expect(result.edges[0]).not.toHaveProperty('selected');
  });
});
