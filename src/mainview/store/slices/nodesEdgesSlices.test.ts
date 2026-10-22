// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast };
});
vi.mock('@/lib/rpc-license', () => ({
  getCachedLicense: vi.fn(() => ({ activated: false })),
  refreshLicense: vi.fn(async () => ({ activated: false })),
}));
vi.mock('@/lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rpc')>()),
  rpcDeleteNote: vi.fn(async () => ({ success: true })),
  rpcDeleteWidget: vi.fn(async () => ({ success: true })),
}));

const { rpcDeleteWidget } = await import('@/lib/rpc');
const { FREE_NODE_LIMIT } = await import('@/lib/nodeQuota');
const { useCanvasStore } = await import('@/store/canvasStore');
const { STICKY_COLORS } = await import('@/lib/colorUtils');
const { createTopicChildEdgeData, TOPIC_NODE_TYPE } = await import(
  '../../../shared/topic'
);

const state = () => useCanvasStore.getState();
const byId = (id: string) => state().nodes.find((node) => node.id === id);

const node = (id: string, extra: Partial<Node> = {}): Node => ({
  id,
  type: 'card',
  position: { x: 0, y: 0 },
  data: { title: id },
  ...extra,
});

describe('nodesSlice', () => {
  beforeEach(() => {
    state().reset();
  });

  describe('createNode', () => {
    it('adds a node at the anchor with registry defaults as one undo step', async () => {
      const id = await state().createNode('card', null, {
        anchor: { x: 100, y: 200 },
        data: { title: 'Hello' },
        focusViewport: false,
      });

      expect(id).toBeTypeOf('string');
      const created = byId(id!);
      expect(created).toMatchObject({
        type: 'card',
        position: { x: 100, y: 200 },
        data: { title: 'Hello' },
      });
      expect(state().canUndo()).toBe(true);

      state().undo();
      expect(state().nodes).toEqual([]);
    });

    it('applies a size override to the node style', async () => {
      const id = await state().createNode('image', null, {
        anchor: { x: 0, y: 0 },
        focusViewport: false,
        size: { height: 90, width: 160 },
      });
      expect(byId(id!)?.style).toMatchObject({ height: 90, width: 160 });
    });

    it('places a node dropped inside a group relative to the group', async () => {
      useCanvasStore.setState({
        nodes: [
          node('g', {
            type: 'group',
            position: { x: 1000, y: 1000 },
            style: { height: 800, width: 800 },
            data: { label: 'Group' },
          }),
        ],
      });
      const id = await state().createNode('sticky', null, {
        anchor: { x: 1100, y: 1150 },
        focusViewport: false,
      });
      expect(byId(id!)).toMatchObject({
        parentId: 'g',
        extent: 'parent',
        position: { x: 100, y: 150 },
      });
    });

    it('refuses a counted node over the free quota without touching history', async () => {
      const full = Array.from({ length: FREE_NODE_LIMIT }, (_, i) =>
        node(`n${i}`, { position: { x: i * 400, y: 0 } })
      );
      useCanvasStore.setState({ nodes: full });

      const id = await state().createNode('card', null, {
        anchor: { x: 0, y: 5000 },
        focusViewport: false,
      });

      expect(id).toBeUndefined();
      expect(state().nodes).toHaveLength(FREE_NODE_LIMIT);
      expect(state().canUndo()).toBe(false);
    });
  });

  describe('data updates', () => {
    beforeEach(() => {
      useCanvasStore.setState({ nodes: [node('a'), node('b')] });
    });

    it('updateNodeData merges without a snapshot and keeps the focused view in sync', () => {
      state().setFocusedNode({
        data: { title: 'a' },
        id: 'a',
        rect: new DOMRect(),
        type: 'card',
      });
      state().updateNodeData('a', { title: 'A2' });
      expect(byId('a')?.data).toEqual({ title: 'A2' });
      expect(state().focusedNode?.data).toEqual({ title: 'A2' });
      expect(state().canUndo()).toBe(false);
    });

    it('commitNodeData snapshots so undo/redo round-trip the edit', () => {
      state().commitNodeData('b', { title: 'B2' });
      state().undo();
      expect(byId('b')?.data.title).toBe('b');
      state().redo();
      expect(byId('b')?.data.title).toBe('B2');
    });

    it('applyNoteTitles projects titles and snapshots unless told not to', () => {
      useCanvasStore.setState({
        nodes: [node('a', { data: { noteId: 'note-a', title: 'old' } })],
      });
      state().applyNoteTitles({ 'note-a': 'new' }, { snapshot: false });
      expect(byId('a')?.data.title).toBe('new');
      expect(state().canUndo()).toBe(false);

      state().applyNoteTitles({ 'note-a': 'newer' });
      expect(byId('a')?.data.title).toBe('newer');
      expect(state().canUndo()).toBe(true);
    });
  });

  describe('locks, z-order and colour', () => {
    beforeEach(() => {
      useCanvasStore.setState({
        nodes: [
          node('a', { data: { locked: true } }),
          node('b'),
          node('c', { zIndex: 4 }),
        ],
      });
    });

    it('locks a mixed selection and unlocks only a fully locked one', () => {
      state().toggleNodesLocked(['a', 'b']);
      expect(byId('a')?.data.locked).toBe(true);
      expect(byId('b')?.data.locked).toBe(true);

      state().toggleNodesLocked(['a', 'b']);
      expect(byId('a')?.data.locked).toBe(false);
      expect(byId('b')?.data.locked).toBe(false);
    });

    it('locked nodes are skipped by deleteNodes', () => {
      expect(state().deleteNodes(['a', 'b'])).toBe(1);
      expect(state().nodes.map((n) => n.id)).toEqual(['a', 'c']);
    });

    it('brings nodes to the front and sends them to the back', () => {
      state().bringNodesToFront(['a']);
      expect(byId('a')?.zIndex).toBe(5);
      state().sendNodesToBack(['c']);
      expect(byId('c')?.zIndex).toBe(-1);
      state().bringNodesForward(['b']);
      expect(byId('b')?.zIndex).toBe(1);
      state().sendNodesBackward(['b', 'missing']);
      expect(byId('b')?.zIndex).toBe(0);
    });

    it('cycles a sticky through the sticky palette', () => {
      useCanvasStore.setState({
        nodes: [
          node('s', { type: 'sticky', data: { color: STICKY_COLORS[0] } }),
        ],
      });
      state().changeNodeColor('s');
      expect(byId('s')?.data.color).toBe(STICKY_COLORS[1]);
    });
  });

  describe('deleteNodes', () => {
    it('detaches folder children and frees group children as one undo step', () => {
      useCanvasStore.setState({
        nodes: [
          node('folder', {
            type: 'folder',
            data: {
              children: [
                {
                  id: 'child',
                  noteId: 'note-child',
                  type: 'card',
                  data: { title: 'Inside' },
                },
              ],
            },
          }),
          node('g', { type: 'group', position: { x: 500, y: 500 } }),
          node('inner', { parentId: 'g', position: { x: 10, y: 10 } }),
        ],
      });

      expect(state().deleteNodes(['folder', 'g'])).toBe(2);

      expect(byId('child')).toMatchObject({
        data: { detached: true, noteId: 'note-child', title: 'Inside' },
      });
      expect(byId('inner')?.parentId).toBeUndefined();

      state().undo();
      expect(
        state()
          .nodes.map((n) => n.id)
          .sort()
      ).toEqual(['folder', 'g', 'inner']);
    });

    it('deletes the backing file of a removed top-level widget', () => {
      useCanvasStore.setState({
        nodes: [node('w', { type: 'widget', data: { widgetId: 'widget_1' } })],
      });
      state().deleteNodes(['w']);
      expect(rpcDeleteWidget).toHaveBeenCalledWith('widget_1');
    });
  });

  describe('drag and position updates', () => {
    beforeEach(() => {
      useCanvasStore.setState({
        nodes: [node('a'), node('b', { position: { x: 400, y: 0 } })],
      });
    });

    it('applies React Flow position changes without recording history', () => {
      state().applyNodesChange([
        {
          dragging: true,
          id: 'a',
          position: { x: 50, y: 60 },
          type: 'position',
        },
      ]);
      expect(byId('a')?.position).toEqual({ x: 50, y: 60 });
      state().applyNodesChange([
        {
          dragging: false,
          id: 'a',
          position: { x: 70, y: 80 },
          type: 'position',
        },
      ]);
      expect(byId('a')?.position).toEqual({ x: 70, y: 80 });
      expect(state().canUndo()).toBe(false);
    });

    it('keeps the node array identity when nothing changed', () => {
      const before = state().nodes;
      state().applyNodesChange([]);
      expect(state().nodes).toBe(before);
    });

    it('a pinned sticky ignores position writes through setNodes', () => {
      useCanvasStore.setState({
        nodes: [
          node('s', {
            type: 'sticky',
            position: { x: 5, y: 5 },
            data: { pinned: true },
          }),
        ],
      });
      state().setNodes((nodes) =>
        nodes.map((n) => ({ ...n, position: { x: 99, y: 99 } }))
      );
      expect(byId('s')?.position).toEqual({ x: 5, y: 5 });
    });
  });
});

describe('edgesSlice', () => {
  const treeEdge: Edge = {
    data: { ...createTopicChildEdgeData(0) },
    id: 'tree',
    source: 'a',
    target: 'b',
  };

  beforeEach(() => {
    state().reset();
    useCanvasStore.setState({ nodes: [node('a'), node('b')] });
  });

  it('connects two nodes with a labelled bezier edge and ignores self loops', () => {
    state().addConnection({
      source: 'a',
      sourceHandle: null,
      target: 'a',
      targetHandle: null,
    });
    expect(state().edges).toEqual([]);

    state().addConnection(
      { source: 'a', sourceHandle: null, target: 'b', targetHandle: null },
      { reverseVisualDirection: true }
    );
    expect(state().edges[0]).toMatchObject({
      data: { pathType: 'bezier', reverseVisualDirection: true },
      source: 'a',
      target: 'b',
      type: 'labeledEdge',
    });
    expect(state().canUndo()).toBe(true);
  });

  it('commits edge labels with a snapshot and deletes edges', () => {
    useCanvasStore.setState({
      edges: [{ id: 'e', source: 'a', target: 'b', data: {} }],
    });
    state().commitEdgeData('e', { label: 'depends on' });
    expect(state().edges[0]?.data).toMatchObject({ label: 'depends on' });

    state().deleteEdge('e');
    expect(state().edges).toEqual([]);
    state().undo();
    expect(state().edges[0]?.data).toMatchObject({ label: 'depends on' });
  });

  it('refuses generic edits and deletes of Topic tree edges', () => {
    useCanvasStore.setState({
      nodes: [
        node('a', { type: TOPIC_NODE_TYPE, data: { title: 'A' } }),
        node('b', { type: TOPIC_NODE_TYPE, data: { title: 'B' } }),
      ],
      edges: [treeEdge],
    });
    state().updateEdgeData('tree', { label: 'nope' });
    state().deleteEdge('tree');
    state().setEditingEdgeId('tree');
    expect(state().edges).toEqual([treeEdge]);
    expect(state().editingEdgeId).toBeNull();
  });
});
