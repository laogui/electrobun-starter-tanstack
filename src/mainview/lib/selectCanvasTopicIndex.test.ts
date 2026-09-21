import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { createTopicData } from '../../shared/topic';
import { createCanvasTopicIndexSelector } from './selectCanvasTopicIndex';
import { buildTopicChildEdge } from './topicTree';

function graph() {
  const nodes: Node[] = ['parent', 'child'].map((id) => ({
    data: { ...createTopicData(id) },
    id,
    position: { x: 0, y: 0 },
    type: 'topic',
  }));
  return { nodes, edges: [buildTopicChildEdge('edge', 'parent', 'child', 0)] };
}

describe('shared Topic index', () => {
  it('retains one index through drag, resize, and selection frames', () => {
    const select = createCanvasTopicIndexSelector();
    let state = graph();
    const index = select(state);
    for (let frame = 0; frame < 60; frame += 1) {
      state = {
        ...state,
        nodes: state.nodes.map((node) => ({
          ...node,
          position: { x: frame, y: frame },
          selected: true,
          measured: { width: 200 + frame, height: 100 },
        })),
      };
      expect(select(state)).toBe(index);
      expect(select(state)).toBe(index);
    }
    expect(index.parentByChild.has('child')).toBe(true);
  });

  it('invalidates for reparenting, data edits, removal, and edge changes', () => {
    const select = createCanvasTopicIndexSelector();
    const state = graph();
    const initial = select(state);
    const grouped = select({
      ...state,
      nodes: state.nodes.map((node) =>
        node.id === 'child' ? { ...node, parentId: 'group' } : node
      ),
    });
    expect(grouped).not.toBe(initial);
    expect(grouped.problems.some((p) => p.kind === 'cross-container')).toBe(
      true
    );
    const malformed = select({
      ...state,
      nodes: state.nodes.map((node) => ({ ...node, data: {} })),
    });
    expect(malformed.problems.length).toBeGreaterThan(0);
    expect(
      select({ ...state, nodes: state.nodes.slice(0, 1) }).topicIds.size
    ).toBe(1);
    expect(select({ ...state, edges: [] }).parentByChild.size).toBe(0);
    expect(select(state).parentByChild.has('child')).toBe(true);
  });
});
