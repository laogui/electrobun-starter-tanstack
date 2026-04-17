import type { Connection, Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CARD_H,
  CARD_W,
  FOLDER_H,
  FOLDER_W,
  IMAGE_H,
  IMAGE_W,
  STICKY_H,
  STICKY_W,
} from '@/lib/canvasConstants';
import { useCanvasStore } from '@/store/canvasStore';

const PASTE_ID_RE = /^paste-/;

vi.mock('../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
}));

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
function fakeRect(x = 0, y = 0, width = 100, height = 100): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    bottom: y + height,
    right: x + width,
    toJSON: () => ({}),
  } as DOMRect;
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

function createRfInstance(viewport: {
  x: number;
  y: number;
  zoom: number;
}): ReactFlowInstance<any, any> {
  return {
    getViewport: () => viewport,
  } as ReactFlowInstance<any, any>;
}

beforeEach(() => {
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
  });
});

afterEach(() => {
  resetStore();
  vi.unstubAllGlobals();
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
    expect(remaining[0]?.id).toBe('child');
    expect(remaining[0]?.parentId).toBeUndefined();
  });

  it('updateNodeData merges data into an existing node', () => {
    useCanvasStore.setState({ nodes: [makeNode('a')] });

    useCanvasStore.getState().updateNodeData('a', { title: 'Updated' });
    const node = useCanvasStore.getState().nodes[0]!;

    expect(node.data.title).toBe('Updated');
    expect(node.data.content).toBe('');
  });
});

describe('canvasStore — edge operations', () => {
  it('addConnection ignores self connections', () => {
    const saveSnapshot = vi.spyOn(useCanvasStore.getState(), 'saveSnapshot');

    useCanvasStore
      .getState()
      .addConnection({ source: 'a', target: 'a' } as Connection);

    expect(useCanvasStore.getState().edges).toHaveLength(0);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it('addConnection adds a labeled edge and saves a snapshot', () => {
    const saveSnapshot = vi.spyOn(useCanvasStore.getState(), 'saveSnapshot');

    useCanvasStore
      .getState()
      .addConnection({ source: 'a', target: 'b' } as Connection);

    const edge = useCanvasStore.getState().edges[0]!;
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    expect(edge.source).toBe('a');
    expect(edge.target).toBe('b');
    expect(edge.type).toBe('labeledEdge');
  });

  it('setEdges replaces the edge array', () => {
    useCanvasStore
      .getState()
      .setEdges([{ id: 'e1', source: 'a', target: 'b' }]);

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
    expect(useCanvasStore.getState().edges[0]?.id).toBe('e2');
  });

  it('updateEdgeData merges data into an existing edge', () => {
    useCanvasStore.setState({
      edges: [{ id: 'e1', source: 'a', target: 'b', data: { label: 'old' } }],
    });

    useCanvasStore.getState().updateEdgeData('e1', { label: 'new' });
    const edge = useCanvasStore.getState().edges[0]!;

    expect(edge.data?.label).toBe('new');
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
    expect(useCanvasStore.getState().clipboard[0]?.id).toBe('a');
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
    expect(pasted.id).toMatch(PASTE_ID_RE);
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
  it('setFocusedFolder updates focused folder', () => {
    const item = {
      id: 'folder-1',
      data: {},
      rect: fakeRect(0, 0, 200, 200),
    };

    useCanvasStore.getState().setFocusedFolder(item);

    expect(useCanvasStore.getState().focusedFolder).toBe(item);
  });

  it('setViews replaces the available views', () => {
    const views = [
      { id: 'default', name: 'Default Canvas' },
      { id: 'focus', name: 'Focus Mode' },
    ];

    useCanvasStore.getState().setViews(views);

    expect(useCanvasStore.getState().views).toEqual(views);
  });

  it('setActiveViewId updates the active view id directly', () => {
    useCanvasStore.getState().setActiveViewId('focus');

    expect(useCanvasStore.getState().activeViewId).toBe('focus');
  });

  it('setEditingEdgeId updates the editing edge id', () => {
    useCanvasStore.getState().setEditingEdgeId('edge-1');

    expect(useCanvasStore.getState().editingEdgeId).toBe('edge-1');
  });

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

describe('canvasStore — multi-view', () => {
  it('setActiveView does nothing when switching to the current view', async () => {
    const originalUndoRedo = useCanvasStore.getState()._undoRedo;
    useCanvasStore.setState({
      activeViewId: 'default',
      focusedNode: { id: 'node-1', data: {}, rect: fakeRect() },
      focusedFolder: { id: 'folder-1', data: {}, rect: fakeRect() },
      _hydrated: true,
    });

    await useCanvasStore.getState().setActiveView('default');
    const state = useCanvasStore.getState();

    expect(state.activeViewId).toBe('default');
    expect(state.focusedNode?.id).toBe('node-1');
    expect(state.focusedFolder?.id).toBe('folder-1');
    expect(state._undoRedo).toBe(originalUndoRedo);
    expect(state._hydrated).toBe(true);
  });

  it('setActiveView resets view-specific UI state when switching', async () => {
    useCanvasStore.setState({
      activeViewId: 'default',
      focusedNode: { id: 'node-1', data: {}, rect: fakeRect() },
      focusedFolder: { id: 'folder-1', data: {}, rect: fakeRect() },
      _hydrated: true,
      _undoRedo: {
        past: [{ nodes: [makeNode('a')], edges: [] }],
        future: [{ nodes: [makeNode('b')], edges: [] }],
      },
    });

    await useCanvasStore.getState().setActiveView('focus');
    const state = useCanvasStore.getState();

    expect(state.activeViewId).toBe('focus');
    expect(state.focusedNode).toBeNull();
    expect(state.focusedFolder).toBeNull();
    expect(state._hydrated).toBe(false);
    expect(state._undoRedo.past).toEqual([]);
    expect(state._undoRedo.future).toEqual([]);
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
    const { data } = useCanvasStore.getState().nodes[0]!;

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
    const { data } = useCanvasStore.getState().nodes[0]!;

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
    const { data } = useCanvasStore.getState().nodes[0]!;

    // 'blue' is first GROUP_COLOR, next is 'green'
    expect(data.color).toBe('green');
  });
});

describe('canvasStore — createNode', () => {
  it('creates a card node using the viewport center', () => {
    vi.stubGlobal('window', {
      innerWidth: 1200,
      innerHeight: 900,
    });

    useCanvasStore
      .getState()
      .createNode('card', createRfInstance({ x: 100, y: 50, zoom: 2 }));
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(node.id).toBe('new-101');
    expect(node.type).toBe('card');
    expect(node.position).toEqual({
      x: (600 - 100) / 2 - CARD_W / 2,
      y: (450 - 50) / 2 - CARD_H / 2,
    });
    expect(node.style).toEqual({ width: CARD_W, height: CARD_H });
  });

  it('creates a folder node with localized default data', () => {
    vi.stubGlobal('window', {
      innerWidth: 1000,
      innerHeight: 800,
    });

    useCanvasStore
      .getState()
      .createNode('folder', createRfInstance({ x: 0, y: 0, zoom: 1 }));
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(node.type).toBe('folder');
    expect(node.position).toEqual({
      x: 500 - FOLDER_W / 2,
      y: 400 - FOLDER_H / 2,
    });
    expect(node.data).toMatchObject({ subtitle: '', children: [] });
  });

  it('creates an image node with fixed initial color', () => {
    vi.stubGlobal('window', {
      innerWidth: 900,
      innerHeight: 700,
    });

    useCanvasStore
      .getState()
      .createNode('image', createRfInstance({ x: 0, y: 0, zoom: 1 }));
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(node.type).toBe('image');
    expect(node.position).toEqual({
      x: 450 - IMAGE_W / 2,
      y: 350 - IMAGE_H / 2,
    });
    expect(node.style).toEqual({ width: IMAGE_W, height: IMAGE_H });
    expect(node.data).toMatchObject({
      imageUrl: '',
      title: '',
      color: '#FFFFFF',
    });
  });

  it('creates a sticky node with a random palette color', () => {
    vi.stubGlobal('window', {
      innerWidth: 800,
      innerHeight: 600,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    useCanvasStore
      .getState()
      .createNode('sticky', createRfInstance({ x: 0, y: 0, zoom: 1 }));
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(node.type).toBe('sticky');
    expect(node.position).toEqual({
      x: 400 - STICKY_W / 2,
      y: 300 - STICKY_H / 2,
    });
    expect(node.style).toEqual({ width: STICKY_W, height: STICKY_H });
    expect(node.data).toMatchObject({ content: '', color: '#FEF08A' });
  });

  it('creates a group node with a random color and localized label', () => {
    vi.stubGlobal('window', {
      innerWidth: 1400,
      innerHeight: 1000,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    useCanvasStore
      .getState()
      .createNode('group', createRfInstance({ x: 50, y: 100, zoom: 2 }));
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(node.type).toBe('group');
    expect(node.position).toEqual({
      x: (700 - 50) / 2 - 250,
      y: (500 - 100) / 2 - 150,
    });
    expect(node.style).toEqual({ width: 500, height: 300 });
    expect(node.data).toMatchObject({ color: 'blue' });
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
    const { data } = useCanvasStore.getState().nodes[0]!;
    const children = data.children as unknown[];

    expect(children).toHaveLength(1);
    expect(data.title).toBe('1 items');
  });
});
