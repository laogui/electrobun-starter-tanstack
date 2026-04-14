import type { Node } from '@xyflow/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';

function resetStore() {
  // Use the store's reset() to clear undo/redo too, then set remaining fields
  useCanvasStore.getState().reset();
  useCanvasStore.setState({
    clipboard: [],
    createMenuOpen: false,
    nodeIdCounter: 100,
    editingEdgeId: null,
  });
}

/** Minimal rect-like object for tests (DOMRect is not available in Node). */
function fakeRect(
  x = 0,
  y = 0,
  width = 100,
  height = 100
): DOMRect {
  return { x, y, width, height, top: y, left: x, bottom: y + height, right: x + width, toJSON: () => ({}) } as DOMRect;
}

function makeNode(id: string, overrides?: Partial<Node>): Node {
  return {
    id,
    type: 'card',
    position: { x: 0, y: 0 },
    data: { title: 'Test', content: '', color: '#FFFFFF' },
    ...overrides,
  };
}

afterEach(() => {
  resetStore();
});

describe('canvasStore — node operations', () => {
  it('setNodes replaces the node array', () => {
    const { setNodes } = useCanvasStore.getState();
    const nodes = [makeNode('a'), makeNode('b')];

    setNodes(nodes);

    expect(useCanvasStore.getState().nodes).toHaveLength(2);
  });

  it('setNodes accepts an updater function', () => {
    useCanvasStore.setState({ nodes: [makeNode('a')] });
    const { setNodes } = useCanvasStore.getState();

    setNodes((prev) => [...prev, makeNode('b')]);

    expect(useCanvasStore.getState().nodes).toHaveLength(2);
  });

  it('deleteNodes removes nodes and their connected edges', () => {
    useCanvasStore.setState({
      nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
    });

    useCanvasStore.getState().deleteNodes(['b']);
    const state = useCanvasStore.getState();

    expect(state.nodes).toHaveLength(2);
    expect(state.nodes.map((n) => n.id)).toEqual(['a', 'c']);
    // Both edges involving 'b' should be removed
    expect(state.edges).toHaveLength(0);
  });

  it('deleteNodes orphans children of the deleted parent', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('group', { type: 'group' }),
        makeNode('child', { parentId: 'group', extent: 'parent' as const }),
      ],
      edges: [],
    });

    useCanvasStore.getState().deleteNodes(['group']);
    const remaining = useCanvasStore.getState().nodes;

    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('child');
    expect(remaining[0]!.parentId).toBeUndefined();
  });

  it('updateNodeData merges data into an existing node', () => {
    useCanvasStore.setState({ nodes: [makeNode('a')] });

    useCanvasStore.getState().updateNodeData('a', { title: 'Updated' });
    const node = useCanvasStore.getState().nodes[0]!;

    expect((node.data as Record<string, unknown>).title).toBe('Updated');
    expect((node.data as Record<string, unknown>).content).toBe('');
  });
});

describe('canvasStore — edge operations', () => {
  it('setEdges replaces the edge array', () => {
    useCanvasStore.getState().setEdges([
      { id: 'e1', source: 'a', target: 'b' },
    ]);

    expect(useCanvasStore.getState().edges).toHaveLength(1);
  });

  it('deleteEdge removes a specific edge', () => {
    useCanvasStore.setState({
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
    });

    useCanvasStore.getState().deleteEdge('e1');

    expect(useCanvasStore.getState().edges).toHaveLength(1);
    expect(useCanvasStore.getState().edges[0]!.id).toBe('e2');
  });

  it('updateEdgeData merges data into an existing edge', () => {
    useCanvasStore.setState({
      edges: [{ id: 'e1', source: 'a', target: 'b', data: { label: 'old' } }],
    });

    useCanvasStore.getState().updateEdgeData('e1', { label: 'new' });
    const edge = useCanvasStore.getState().edges[0]!;

    expect((edge.data as Record<string, unknown>).label).toBe('new');
  });
});

describe('canvasStore — clipboard', () => {
  it('copySelected copies selected nodes to clipboard', () => {
    useCanvasStore.setState({
      nodes: [
        { ...makeNode('a'), selected: true } as Node,
        { ...makeNode('b'), selected: false } as Node,
      ],
    });

    useCanvasStore.getState().copySelected();

    expect(useCanvasStore.getState().clipboard).toHaveLength(1);
    expect(useCanvasStore.getState().clipboard[0]!.id).toBe('a');
  });

  it('copySelected does nothing when no nodes are selected', () => {
    useCanvasStore.setState({
      nodes: [makeNode('a'), makeNode('b')],
    });

    useCanvasStore.getState().copySelected();

    expect(useCanvasStore.getState().clipboard).toHaveLength(0);
  });

  it('pasteClipboard creates new nodes with unique ids and offset', () => {
    useCanvasStore.setState({
      nodes: [makeNode('a')],
      clipboard: [makeNode('copied', { position: { x: 10, y: 20 } })],
    });

    useCanvasStore.getState().pasteClipboard();
    const state = useCanvasStore.getState();

    expect(state.nodes).toHaveLength(2);
    const pasted = state.nodes[1]!;
    expect(pasted.id).not.toBe('copied');
    expect(pasted.id).toMatch(/^paste-/);
    expect(pasted.position.x).toBe(40); // 10 + 30 offset
    expect(pasted.position.y).toBe(50); // 20 + 30 offset
    expect(pasted.selected).toBe(true);
  });

  it('pasteClipboard does nothing with empty clipboard', () => {
    useCanvasStore.setState({ nodes: [makeNode('a')], clipboard: [] });

    useCanvasStore.getState().pasteClipboard();

    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });
});

describe('canvasStore — undo/redo', () => {
  it('undo restores the previous state', () => {
    useCanvasStore.setState({ nodes: [makeNode('a')], edges: [] });
    useCanvasStore.getState().saveSnapshot();

    useCanvasStore.getState().setNodes([makeNode('a'), makeNode('b')]);
    expect(useCanvasStore.getState().nodes).toHaveLength(2);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });

  it('redo restores the undone state', () => {
    useCanvasStore.setState({ nodes: [makeNode('a')], edges: [] });
    useCanvasStore.getState().saveSnapshot();
    useCanvasStore.getState().setNodes([makeNode('a'), makeNode('b')]);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);

    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().nodes).toHaveLength(2);
  });

  it('undo does nothing when past is empty', () => {
    useCanvasStore.setState({ nodes: [makeNode('a')], edges: [] });

    useCanvasStore.getState().undo();

    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });

  it('canUndo and canRedo reflect the undo/redo state', () => {
    useCanvasStore.setState({ nodes: [], edges: [] });

    expect(useCanvasStore.getState().canUndo()).toBe(false);
    expect(useCanvasStore.getState().canRedo()).toBe(false);

    useCanvasStore.getState().saveSnapshot();
    expect(useCanvasStore.getState().canUndo()).toBe(true);
    expect(useCanvasStore.getState().canRedo()).toBe(false);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().canRedo()).toBe(true);
  });
});

describe('canvasStore — UI state', () => {
  it('setFocusedNode updates focused node', () => {
    const item = {
      id: 'node-1',
      data: {},
      rect: fakeRect(0, 0, 100, 100),
    };

    useCanvasStore.getState().setFocusedNode(item);

    expect(useCanvasStore.getState().focusedNode).toBe(item);
  });

  it('setCreateMenuOpen toggles via function updater', () => {
    expect(useCanvasStore.getState().createMenuOpen).toBe(false);

    useCanvasStore.getState().setCreateMenuOpen((prev) => !prev);

    expect(useCanvasStore.getState().createMenuOpen).toBe(true);
  });

  it('nextNodeId returns incrementing ids', () => {
    const id1 = useCanvasStore.getState().nextNodeId();
    const id2 = useCanvasStore.getState().nextNodeId();

    expect(id1).toBe('new-101');
    expect(id2).toBe('new-102');
  });
});

describe('canvasStore — hydration', () => {
  it('hydrate sets nodes, edges, and _hydrated flag', () => {
    const nodes = [makeNode('h1')];
    const edges = [{ id: 'e1', source: 'h1', target: 'h2' }];

    useCanvasStore.getState().hydrate(nodes, edges);
    const state = useCanvasStore.getState();

    expect(state._hydrated).toBe(true);
    expect(state.nodes).toEqual(nodes);
    expect(state.edges).toEqual(edges);
  });

  it('reset clears all state', () => {
    useCanvasStore.setState({
      nodes: [makeNode('a')],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
      _hydrated: true,
      focusedNode: { id: 'a', data: {}, rect: fakeRect() },
    });

    useCanvasStore.getState().reset();
    const state = useCanvasStore.getState();

    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state._hydrated).toBe(false);
    expect(state.focusedNode).toBeNull();
  });
});

describe('canvasStore — changeNodeColor', () => {
  it('cycles card color to the next in the palette', () => {
    useCanvasStore.setState({
      nodes: [makeNode('a', { data: { color: '#FFFFFF' } })],
    });

    useCanvasStore.getState().changeNodeColor('a');
    const data = useCanvasStore.getState().nodes[0]!.data as Record<string, unknown>;

    // #FFFFFF is the first CARD_COLOR, so the next should be #FDF2F8
    expect(data.color).toBe('#FDF2F8');
  });

  it('cycles sticky color to the next in its palette', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('s', {
          type: 'sticky',
          data: { content: '', color: '#FEF08A' },
        }),
      ],
    });

    useCanvasStore.getState().changeNodeColor('s');
    const data = useCanvasStore.getState().nodes[0]!.data as Record<string, unknown>;

    // #FEF08A is first STICKY_COLOR, next is #BBF7D0
    expect(data.color).toBe('#BBF7D0');
  });

  it('cycles group color to the next in its palette', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('g', {
          type: 'group',
          data: { label: 'Group', color: 'blue' },
        }),
      ],
    });

    useCanvasStore.getState().changeNodeColor('g');
    const data = useCanvasStore.getState().nodes[0]!.data as Record<string, unknown>;

    // 'blue' is first GROUP_COLOR, next is 'green'
    expect(data.color).toBe('green');
  });
});

describe('canvasStore — addFolderChild', () => {
  it('adds a child card to the folder data', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          data: { title: '0 items', subtitle: '', children: [] },
        }),
      ],
    });

    useCanvasStore.getState().addFolderChild('folder');
    const data = useCanvasStore.getState().nodes[0]!.data as Record<string, unknown>;
    const children = data.children as Array<unknown>;

    expect(children).toHaveLength(1);
    expect(data.title).toBe('1 items');
  });
});
