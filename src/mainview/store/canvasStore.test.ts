// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from '@/store/canvasStore';

const node = (id: string, type = 'card', extra: Partial<Node> = {}): Node => ({
  id,
  type,
  position: { x: Number(id.replace(/\D/g, '') || 0) * 500, y: 0 },
  data: { title: id },
  ...extra,
});

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
});

const state = () => useCanvasStore.getState();
const ids = () => state().nodes.map((n) => n.id);

describe('canvasStore actions + undo restore (smoke)', () => {
  beforeEach(() => {
    state().reset();
    useCanvasStore.setState({
      nodes: [node('n1'), node('n2'), node('n3')],
      edges: [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3')],
    });
  });

  it('deleteNodes removes nodes and their edges; undo restores both', () => {
    expect(state().deleteNodes(['n2'])).toBe(1);
    expect(ids()).toEqual(['n1', 'n3']);
    expect(state().edges).toHaveLength(0);

    expect(state().undo()).toBe(true);
    expect(ids().sort()).toEqual(['n1', 'n2', 'n3']);
    expect(
      state()
        .edges.map((e) => e.id)
        .sort()
    ).toEqual(['e1', 'e2']);

    expect(state().redo()).toBe(true);
    expect(ids()).toEqual(['n1', 'n3']);
  });

  it('locked nodes survive deleteNodes', () => {
    state().toggleNodeLocked('n1');
    expect(state().deleteNodes(['n1'])).toBe(0);
    expect(ids()).toContain('n1');
  });

  it('commitNodeData snapshots so undo restores the previous data', () => {
    state().commitNodeData('n1', { title: 'renamed' });
    expect(state().nodes[0]?.data.title).toBe('renamed');
    expect(state().canUndo()).toBe(true);
    state().undo();
    expect(state().nodes[0]?.data.title).toBe('n1');
    expect(state().canRedo()).toBe(true);
  });

  it('updateNodeData keeps the focused-view snapshot in sync', () => {
    state().setFocusedNode({
      id: 'n1',
      type: 'card',
      data: { title: 'n1' },
      rect: {} as DOMRect,
    });
    state().updateNodeData('n1', { title: 'edited' });
    expect(state().focusedNode?.data.title).toBe('edited');
  });

  it('toggleStickyPinned flips pinned and is undoable', () => {
    useCanvasStore.setState({ nodes: [node('s1', 'sticky')] });
    state().toggleStickyPinned('s1');
    expect(state().nodes[0]?.data.pinned).toBe(true);
    state().undo();
    expect(state().nodes[0]?.data.pinned).toBeFalsy();
  });

  it('deleteEdge removes only that edge', () => {
    state().deleteEdge('e1');
    expect(state().edges.map((e) => e.id)).toEqual(['e2']);
  });

  it('groupSelected wraps selected cards in a group; undo ungroups', () => {
    useCanvasStore.setState({
      nodes: [
        node('n1', 'card', { selected: true }),
        node('n2', 'card', { selected: true }),
        node('n3'),
      ],
    });
    state().groupSelected();
    const group = state().nodes.find((n) => n.type === 'group');
    expect(group).toBeDefined();
    const children = state().nodes.filter((n) => n.parentId === group?.id);
    expect(children.map((n) => n.id).sort()).toEqual(['n1', 'n2']);

    state().undo();
    expect(state().nodes.some((n) => n.type === 'group')).toBe(false);
    expect(state().nodes.every((n) => !n.parentId)).toBe(true);
  });

  it('createNode adds a counted card and undo removes it', async () => {
    const id = await state().createNode('card', null, {
      anchor: { x: 5000, y: 5000 },
    });
    expect(id).toBeTruthy();
    expect(ids()).toContain(id);
    state().undo();
    expect(ids()).not.toContain(id);
  });

  it('caps the canvas undo stack', () => {
    for (let i = 0; i < 80; i += 1) {
      state().commitNodeData('n1', { title: `t${i}` });
    }
    let undone = 0;
    while (state().undo()) {
      undone += 1;
    }
    expect(undone).toBeLessThanOrEqual(50);
    expect(undone).toBeGreaterThan(0);
  });
});
