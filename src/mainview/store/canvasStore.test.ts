import type { Connection, Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NODE_ID_REGEX = /^node-/;
const NOTE_ID_REGEX = /^note_/;

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
import { CANVAS_NODE_SPECS } from '@/lib/canvasNodeRegistry';
import { useCanvasStore } from '@/store/canvasStore';

const PASTE_ID_RE = /^paste-/;

const { rpcDeleteNoteMock } = vi.hoisted(() => ({
  rpcDeleteNoteMock: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/lib/rpc', () => ({
  rpcDeleteNote: rpcDeleteNoteMock,
}));

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
  rpcDeleteNoteMock.mockClear();
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

  it('hydrate sets nodes and marks store as hydrated', () => {
    useCanvasStore
      .getState()
      .hydrate(
        [makeNode('new-101'), makeNode('new-250'), makeNode('other-5')],
        []
      );

    expect(useCanvasStore.getState()._hydrated).toBe(true);
    expect(useCanvasStore.getState().nodes).toHaveLength(3);
  });

  it('nextNodeId returns a unique nanoid-based id each call', () => {
    const id1 = useCanvasStore.getState().nextNodeId();
    const id2 = useCanvasStore.getState().nextNodeId();

    expect(id1).toMatch(NODE_ID_REGEX);
    expect(id2).toMatch(NODE_ID_REGEX);
    expect(id1).not.toBe(id2);
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
    expect(edge.data).toMatchObject({
      pathType: 'bezier',
      reverseVisualDirection: false,
    });
  });

  it('addConnection stores reversed visual direction when requested', () => {
    useCanvasStore
      .getState()
      .addConnection({ source: 'b', target: 'a' } as Connection, {
        reverseVisualDirection: true,
      });

    const edge = useCanvasStore.getState().edges[0]!;

    expect(edge.data).toMatchObject({
      pathType: 'bezier',
      reverseVisualDirection: true,
    });
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

  it('nextNodeId returns unique node- prefixed ids', () => {
    const id1 = useCanvasStore.getState().nextNodeId();
    const id2 = useCanvasStore.getState().nextNodeId();

    expect(id1).toMatch(NODE_ID_REGEX);
    expect(id2).toMatch(NODE_ID_REGEX);
    expect(id1).not.toBe(id2);
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
      viewport: { x: 10, y: 20, zoom: 1.5 },
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
    expect(state.viewport).toBeNull();
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
    expect(state.viewport).toBeNull();
  });

  it('hydrate stores the viewport when one is provided', () => {
    const viewport = { x: 100, y: 200, zoom: 1.25 };

    useCanvasStore.getState().hydrate([], [], viewport);

    expect(useCanvasStore.getState().viewport).toEqual(viewport);
  });

  it('hydrate clears any previously hydrated viewport when none is provided', () => {
    useCanvasStore.setState({
      viewport: { x: 1, y: 2, zoom: 3 },
    });

    useCanvasStore.getState().hydrate([], []);

    expect(useCanvasStore.getState().viewport).toBeNull();
  });

  it('hydrate normalizes invalid parent relationships', () => {
    // A group-in-group should have its parentId stripped
    const groupChild = makeNode('g2', {
      type: 'group',
      parentId: 'g1',
      data: { label: 'Child Group', color: 'blue' },
    });
    const groupParent = makeNode('g1', {
      type: 'group',
      data: { label: 'Parent Group', color: 'green' },
    });

    useCanvasStore.getState().hydrate([groupParent, groupChild], []);
    const state = useCanvasStore.getState();

    expect(state._hydrated).toBe(true);
    const g2 = state.nodes.find((n) => n.id === 'g2');
    expect(g2?.parentId).toBeUndefined();
  });

  it('reset clears all state', () => {
    useCanvasStore.setState({
      nodes: [makeNode('a')],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
      _hydrated: true,
      focusedNode: { id: 'a', data: {}, rect: fakeRect() },
      viewport: { x: 5, y: 6, zoom: 2 },
    });

    useCanvasStore.getState().reset();
    const state = useCanvasStore.getState();

    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state._hydrated).toBe(false);
    expect(state.focusedNode).toBeNull();
    expect(state.viewport).toBeNull();
  });
});

describe('canvasStore — viewport', () => {
  it('setViewport stores the viewport', () => {
    useCanvasStore.getState().setViewport({ x: 10, y: 20, zoom: 1.5 });

    expect(useCanvasStore.getState().viewport).toEqual({
      x: 10,
      y: 20,
      zoom: 1.5,
    });
  });

  it('setViewport short-circuits when the value is unchanged', () => {
    const initial = { x: 1, y: 2, zoom: 3 };
    useCanvasStore.setState({ viewport: initial });

    useCanvasStore.getState().setViewport({ x: 1, y: 2, zoom: 3 });

    // Reference identity preserved — no redundant set call.
    expect(useCanvasStore.getState().viewport).toBe(initial);
  });

  it('setViewport accepts null to clear the stored viewport', () => {
    useCanvasStore.setState({ viewport: { x: 1, y: 2, zoom: 3 } });

    useCanvasStore.getState().setViewport(null);

    expect(useCanvasStore.getState().viewport).toBeNull();
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

    expect(node.id).toMatch(NODE_ID_REGEX);
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

  it('creates a checklist card node using the card dimensions', () => {
    vi.stubGlobal('window', {
      innerWidth: 1200,
      innerHeight: 900,
    });

    useCanvasStore
      .getState()
      .createNode('checklist', createRfInstance({ x: 100, y: 50, zoom: 2 }));
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(node.id).toMatch(NODE_ID_REGEX);
    expect(node.type).toBe('card');
    expect(node.position).toEqual({
      x: (600 - 100) / 2 - CARD_W / 2,
      y: (450 - 50) / 2 - CARD_H / 2,
    });
    expect(node.style).toEqual({ width: CARD_W, height: CARD_H });
    expect(node.data).toEqual({
      type: 'checklist',
      title: '',
      items: [],
      color: '#FFFFFF',
    });
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

  it('creates a link node with provided URL metadata', () => {
    vi.stubGlobal('window', {
      innerWidth: 900,
      innerHeight: 700,
    });
    const linkSize = CANVAS_NODE_SPECS.link.size;

    useCanvasStore
      .getState()
      .createNode('link', createRfInstance({ x: 0, y: 0, zoom: 1 }), {
        data: {
          url: 'https://example.com/',
          title: 'Example',
        },
      });
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(node.type).toBe('link');
    expect(node.position).toEqual({
      x: 450 - linkSize.width / 2,
      y: 350 - linkSize.height / 2,
    });
    expect(node.style).toEqual(linkSize);
    expect(node.data).toMatchObject({
      url: 'https://example.com/',
      title: 'Example',
      color: '#FFFFFF',
    });
  });

  it('creates an asset node with provided attachment metadata', () => {
    vi.stubGlobal('window', {
      innerWidth: 900,
      innerHeight: 700,
    });
    const assetSize = CANVAS_NODE_SPECS.asset.size;

    useCanvasStore
      .getState()
      .createNode('asset', createRfInstance({ x: 0, y: 0, zoom: 1 }), {
        data: {
          attachmentFile: 'attachments/file_abc.pdf',
          fileName: 'report.pdf',
          kind: 'file',
          mimeType: 'application/pdf',
          size: 2048,
          title: 'report.pdf',
        },
      });
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(node.type).toBe('asset');
    expect(node.position).toEqual({
      x: 450 - assetSize.width / 2,
      y: 350 - assetSize.height / 2,
    });
    expect(node.style).toEqual(assetSize);
    expect(node.data).toMatchObject({
      attachmentFile: 'attachments/file_abc.pdf',
      fileName: 'report.pdf',
      kind: 'file',
      mimeType: 'application/pdf',
      size: 2048,
      title: 'report.pdf',
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

  it('animates the viewport to the new node via setCenter', () => {
    vi.stubGlobal('window', {
      innerWidth: 1200,
      innerHeight: 900,
    });
    const setCenter = vi.fn();
    const rf = {
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setCenter,
    } as unknown as ReactFlowInstance<any, any>;

    useCanvasStore.getState().createNode('card', rf);
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(setCenter).toHaveBeenCalledWith(
      node.position.x + CARD_W / 2,
      node.position.y + CARD_H / 2,
      { duration: 240, zoom: 1 }
    );
  });
});

describe('canvasStore — addFolderChild', () => {
  it('adds a child card to the folder data with a noteId on both the entry and data', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          data: { title: 'Research', subtitle: '', children: [] },
        }),
      ],
    });

    useCanvasStore.getState().addFolderChild('folder');
    const { data } = useCanvasStore.getState().nodes[0]!;
    const children = data.children as Array<{
      data: { noteId?: string };
      id: string;
      noteId?: string;
    }>;

    expect(children).toHaveLength(1);
    expect(data.title).toBe('Research');
    expect(children[0]!.noteId).toMatch(NOTE_ID_REGEX);
    expect(children[0]!.data.noteId).toBe(children[0]!.noteId);
  });
});

describe('canvasStore — updateFolderChildData', () => {
  it('updates both the stored folder node and the open folder snapshot', () => {
    const children = [
      {
        id: 'child-1',
        noteId: 'note_child',
        type: 'card',
        data: {
          type: 'text',
          title: 'Before',
          content: 'Body',
          color: '#FFFFFF',
          noteId: 'note_child',
        },
      },
    ];
    useCanvasStore.setState({
      focusedFolder: {
        id: 'folder',
        data: { title: '1 items', subtitle: '', children },
        rect: fakeRect(),
      },
      nodes: [
        makeNode('folder', {
          type: 'folder',
          data: { title: '1 items', subtitle: '', children },
        }),
      ],
    });

    useCanvasStore
      .getState()
      .updateFolderChildData('folder', 'child-1', { title: 'After' });

    const state = useCanvasStore.getState();
    const folder = state.nodes.find((node) => node.id === 'folder');

    expect(folder?.data.children).toEqual([
      expect.objectContaining({
        id: 'child-1',
        data: expect.objectContaining({ title: 'After' }),
      }),
    ]);
    expect(state.focusedFolder?.data.children).toEqual([
      expect.objectContaining({
        id: 'child-1',
        data: expect.objectContaining({ title: 'After' }),
      }),
    ]);
  });
});

describe('canvasStore — absorbCardIntoFolder', () => {
  it('preserves an existing card noteId on the folder child entry', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('card-1', {
          type: 'card',
          data: {
            type: 'text',
            title: 'Hi',
            content: 'body',
            color: '#FFFFFF',
            noteId: 'note_existing',
          },
        }),
        makeNode('folder', {
          type: 'folder',
          data: { title: '0 items', subtitle: '', children: [] },
        }),
      ],
    });

    useCanvasStore.getState().absorbCardIntoFolder('card-1', 'folder');
    const folder = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'folder')!;
    const children = folder.data.children as Array<{
      data: { noteId?: string };
      id: string;
      noteId?: string;
    }>;

    expect(children).toHaveLength(1);
    expect(children[0]!.noteId).toBe('note_existing');
    expect(children[0]!.data.noteId).toBe('note_existing');
  });

  it('synthesizes a noteId when the absorbed card has none', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('card-1', {
          type: 'card',
          data: {
            type: 'text',
            title: 'Fresh',
            content: '',
            color: '#FFFFFF',
          },
        }),
        makeNode('folder', {
          type: 'folder',
          data: { title: '0 items', subtitle: '', children: [] },
        }),
      ],
    });

    useCanvasStore.getState().absorbCardIntoFolder('card-1', 'folder');
    const folder = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'folder')!;
    const children = folder.data.children as Array<{
      data: { noteId?: string };
      id: string;
      noteId?: string;
    }>;

    expect(children[0]!.noteId).toMatch(NOTE_ID_REGEX);
    expect(children[0]!.data.noteId).toBe(children[0]!.noteId);
  });

  it('does not attach a noteId when absorbing an image card', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('img-1', {
          type: 'image',
          data: {
            title: 'Pic',
            imageUrl: '',
            color: '#FFFFFF',
          },
        }),
        makeNode('folder', {
          type: 'folder',
          data: { title: '0 items', subtitle: '', children: [] },
        }),
      ],
    });

    useCanvasStore.getState().absorbCardIntoFolder('img-1', 'folder');
    const folder = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'folder')!;
    const children = folder.data.children as Array<{
      data: { noteId?: string };
      id: string;
      noteId?: string;
      type?: string;
    }>;

    expect(children[0]!.noteId).toBeUndefined();
    expect(children[0]!.data.noteId).toBeUndefined();
    expect(children[0]!.type).toBe('image');
  });

  it('preserves asset metadata when absorbing an asset into a folder', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('asset-1', {
          type: 'asset',
          data: {
            attachmentFile: 'attachments/file_abc.pdf',
            fileName: 'report.pdf',
            kind: 'file',
            mimeType: 'application/pdf',
            size: 2048,
            title: 'report.pdf',
          },
        }),
        makeNode('folder', {
          type: 'folder',
          data: { title: '0 items', subtitle: '', children: [] },
        }),
      ],
    });

    useCanvasStore.getState().absorbCardIntoFolder('asset-1', 'folder');
    const folder = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'folder')!;
    const children = folder.data.children as Array<{
      data: { attachmentFile?: string; noteId?: string };
      id: string;
      noteId?: string;
      type?: string;
    }>;

    expect(children[0]!.type).toBe('asset');
    expect(children[0]!.noteId).toBeUndefined();
    expect(children[0]!.data.noteId).toBeUndefined();
    expect(children[0]!.data.attachmentFile).toBe('attachments/file_abc.pdf');
  });
});

describe('canvasStore — deleteFolderChild', () => {
  beforeEach(() => {
    rpcDeleteNoteMock.mockClear();
    rpcDeleteNoteMock.mockResolvedValue({ success: true });
  });

  it('removes the child and fires rpcDeleteNote with its noteId', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          data: {
            title: '1 items',
            subtitle: '',
            children: [
              {
                id: 'child-1',
                noteId: 'note_child1',
                type: 'card',
                data: {
                  type: 'text',
                  title: '',
                  content: '',
                  color: '#FFFFFF',
                  noteId: 'note_child1',
                },
              },
            ],
          },
        }),
      ],
    });

    useCanvasStore.getState().deleteFolderChild('folder', 'child-1');
    const folder = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'folder')!;

    expect(folder.data.children as unknown[]).toHaveLength(0);
    expect(rpcDeleteNoteMock).toHaveBeenCalledTimes(1);
    expect(rpcDeleteNoteMock).toHaveBeenCalledWith('note_child1');
  });

  it('does not call rpcDeleteNote for image children', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          data: {
            title: '1 items',
            subtitle: '',
            children: [
              {
                id: 'child-img',
                type: 'image',
                data: { title: '', imageUrl: '', color: '#FFFFFF' },
              },
            ],
          },
        }),
      ],
    });

    useCanvasStore.getState().deleteFolderChild('folder', 'child-img');

    expect(rpcDeleteNoteMock).not.toHaveBeenCalled();
  });

  it('does not call rpcDeleteNote for asset children', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          data: {
            title: '1 items',
            subtitle: '',
            children: [
              {
                id: 'child-asset',
                type: 'asset',
                data: {
                  attachmentFile: 'attachments/file_abc.pdf',
                  fileName: 'report.pdf',
                  kind: 'file',
                  mimeType: 'application/pdf',
                },
              },
            ],
          },
        }),
      ],
    });

    useCanvasStore.getState().deleteFolderChild('folder', 'child-asset');

    expect(rpcDeleteNoteMock).not.toHaveBeenCalled();
  });
});

describe('canvasStore — deleteNodes (folder children notes)', () => {
  beforeEach(() => {
    rpcDeleteNoteMock.mockClear();
    rpcDeleteNoteMock.mockResolvedValue({ success: true });
  });

  it('moves folder children to detached notes without deleting their note files', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          data: {
            title: '4 items',
            subtitle: '',
            children: [
              {
                id: 'child-1',
                noteId: 'note_a',
                type: 'card',
                data: { type: 'text', noteId: 'note_a' },
              },
              {
                id: 'child-2',
                type: 'image',
                data: { title: 'Picture', imageUrl: '', color: '#FFFFFF' },
              },
              {
                id: 'child-3',
                type: 'link',
                data: {
                  title: 'Example',
                  url: 'https://example.com/',
                  color: '#FFFFFF',
                },
              },
              {
                id: 'child-4',
                type: 'asset',
                data: {
                  attachmentFile: 'attachments/file_abc.pdf',
                  fileName: 'report.pdf',
                  kind: 'file',
                  mimeType: 'application/pdf',
                  title: 'report.pdf',
                },
              },
            ],
          },
        }),
        makeNode('other'),
      ],
      edges: [],
    });

    useCanvasStore.getState().deleteNodes(['folder']);
    const state = useCanvasStore.getState();
    const detachedCard = state.nodes.find((node) => node.id === 'child-1');
    const detachedImage = state.nodes.find((node) => node.id === 'child-2');
    const detachedLink = state.nodes.find((node) => node.id === 'child-3');
    const detachedAsset = state.nodes.find((node) => node.id === 'child-4');
    const linkSize = CANVAS_NODE_SPECS.link.size;
    const assetSize = CANVAS_NODE_SPECS.asset.size;

    expect(state.nodes.find((node) => node.id === 'folder')).toBeUndefined();
    expect(state.nodes.find((node) => node.id === 'other')).toBeDefined();
    expect(detachedCard).toMatchObject({
      id: 'child-1',
      type: 'card',
      position: { x: 0, y: 0 },
      style: { width: CARD_W, height: CARD_H },
      data: { type: 'text', noteId: 'note_a', detached: true },
    });
    expect(detachedImage).toMatchObject({
      id: 'child-2',
      type: 'image',
      position: { x: 0, y: 0 },
      style: { width: IMAGE_W, height: IMAGE_H },
      data: { title: 'Picture', detached: true },
    });
    expect(detachedLink).toMatchObject({
      id: 'child-3',
      type: 'link',
      position: { x: 0, y: 0 },
      style: linkSize,
      data: {
        title: 'Example',
        url: 'https://example.com/',
        detached: true,
      },
    });
    expect(detachedAsset).toMatchObject({
      id: 'child-4',
      type: 'asset',
      position: { x: 0, y: 0 },
      style: assetSize,
      data: {
        attachmentFile: 'attachments/file_abc.pdf',
        fileName: 'report.pdf',
        kind: 'file',
        detached: true,
      },
    });
    expect(rpcDeleteNoteMock).not.toHaveBeenCalled();
  });
});

describe('canvasStore — moveFolderChildToCanvas', () => {
  it('removes a folder child and restores it as a selected canvas node, preserving noteId', () => {
    useCanvasStore.setState({
      focusedFolder: {
        id: 'folder',
        data: {
          title: 'Research',
          subtitle: '',
          children: [
            {
              id: 'child-card',
              noteId: 'note_child_card',
              type: 'card',
              data: {
                title: 'Child Card',
                content: 'Body',
                color: '#FFFFFF',
                noteId: 'note_child_card',
              },
            },
            {
              id: 'child-image',
              type: 'image',
              data: { title: 'Child Image', imageUrl: '', color: '#FFFFFF' },
            },
          ],
        },
        rect: fakeRect(),
      },
      nodes: [
        makeNode('folder', {
          type: 'folder',
          position: { x: 100, y: 120 },
          data: {
            title: 'Research',
            subtitle: '',
            children: [
              {
                id: 'child-card',
                noteId: 'note_child_card',
                type: 'card',
                data: {
                  title: 'Child Card',
                  content: 'Body',
                  color: '#FFFFFF',
                  noteId: 'note_child_card',
                },
              },
              {
                id: 'child-image',
                type: 'image',
                data: {
                  title: 'Child Image',
                  imageUrl: '',
                  color: '#FFFFFF',
                },
              },
            ],
          },
        }),
        makeNode('other', { selected: true }),
      ],
    });

    useCanvasStore.getState().moveFolderChildToCanvas('folder', 'child-card', {
      anchorCenter: { x: 500, y: 400 },
    });

    const state = useCanvasStore.getState();
    const folder = state.nodes.find((node) => node.id === 'folder');
    const restored = state.nodes.find((node) => node.id === 'child-card');

    expect(folder?.data.title).toBe('Research');
    expect(folder?.data.children).toEqual([
      expect.objectContaining({ id: 'child-image' }),
    ]);
    expect(restored).toMatchObject({
      id: 'child-card',
      type: 'card',
      data: {
        title: 'Child Card',
        content: 'Body',
        color: '#FFFFFF',
        noteId: 'note_child_card',
      },
      position: { x: 500 - CARD_W / 2, y: 400 - CARD_H / 2 },
      selected: true,
    });
    expect(state.nodes.find((node) => node.id === 'other')?.selected).toBe(
      false
    );
    expect(state.focusedFolder?.data).toMatchObject({
      title: 'Research',
      children: [expect.objectContaining({ id: 'child-image' })],
    });
    expect(state.canUndo()).toBe(true);
  });

  it('restores a link folder child as a link node', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          position: { x: 100, y: 120 },
          data: {
            title: 'Research',
            subtitle: '',
            children: [
              {
                id: 'child-link',
                type: 'link',
                data: {
                  title: 'Example',
                  url: 'https://example.com/',
                  color: '#FFFFFF',
                },
              },
            ],
          },
        }),
      ],
    });
    const linkSize = CANVAS_NODE_SPECS.link.size;

    useCanvasStore.getState().moveFolderChildToCanvas('folder', 'child-link', {
      anchorCenter: { x: 500, y: 400 },
    });

    const state = useCanvasStore.getState();
    const restored = state.nodes.find((node) => node.id === 'child-link');

    expect(restored).toMatchObject({
      id: 'child-link',
      type: 'link',
      data: {
        title: 'Example',
        url: 'https://example.com/',
        color: '#FFFFFF',
      },
      position: {
        x: 500 - linkSize.width / 2,
        y: 400 - linkSize.height / 2,
      },
      selected: true,
    });
    expect(
      state.nodes.find((node) => node.id === 'folder')?.data
    ).toMatchObject({
      title: 'Research',
      children: [],
    });
  });

  it('restores an asset folder child as an asset node', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          position: { x: 100, y: 120 },
          data: {
            title: 'Research',
            subtitle: '',
            children: [
              {
                id: 'child-asset',
                type: 'asset',
                data: {
                  attachmentFile: 'attachments/file_abc.pdf',
                  fileName: 'report.pdf',
                  kind: 'file',
                  mimeType: 'application/pdf',
                  title: 'report.pdf',
                },
              },
            ],
          },
        }),
      ],
    });
    const assetSize = CANVAS_NODE_SPECS.asset.size;

    useCanvasStore.getState().moveFolderChildToCanvas('folder', 'child-asset', {
      anchorCenter: { x: 500, y: 400 },
    });

    const state = useCanvasStore.getState();
    const restored = state.nodes.find((node) => node.id === 'child-asset');

    expect(restored).toMatchObject({
      id: 'child-asset',
      type: 'asset',
      data: {
        attachmentFile: 'attachments/file_abc.pdf',
        fileName: 'report.pdf',
        kind: 'file',
        mimeType: 'application/pdf',
        title: 'report.pdf',
      },
      position: {
        x: 500 - assetSize.width / 2,
        y: 400 - assetSize.height / 2,
      },
      selected: true,
    });
  });

  it('does nothing when the folder child is missing', () => {
    const nodes = [
      makeNode('folder', {
        type: 'folder',
        data: { title: '0 items', subtitle: '', children: [] },
      }),
    ];
    useCanvasStore.setState({ nodes });

    useCanvasStore
      .getState()
      .moveFolderChildToCanvas('folder', 'missing-child');

    expect(useCanvasStore.getState().nodes).toBe(nodes);
    expect(useCanvasStore.getState().canUndo()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Detached notes
// ---------------------------------------------------------------------------

describe('canvasStore — pinNoteToCanvas', () => {
  beforeEach(() => resetStore());

  it('removes detached flag and updates position', () => {
    const nodes: Node[] = [
      {
        id: 'detached-1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { type: 'text', title: '', detached: true },
      },
    ];
    useCanvasStore.setState({ nodes, _hydrated: true });

    useCanvasStore.getState().pinNoteToCanvas('detached-1', { x: 100, y: 200 });

    const node = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'detached-1')!;
    expect(node.position).toEqual({ x: 100, y: 200 });
    expect((node.data as any).detached).toBeUndefined();
  });

  it('no-ops if node is not detached', () => {
    const nodes: Node[] = [
      {
        id: 'card-1',
        type: 'card',
        position: { x: 50, y: 50 },
        data: { type: 'text', title: '' },
      },
    ];
    useCanvasStore.setState({ nodes, _hydrated: true });

    useCanvasStore.getState().pinNoteToCanvas('card-1', { x: 200, y: 200 });

    const node = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'card-1')!;
    expect(node.position).toEqual({ x: 50, y: 50 });
  });
});

describe('canvasStore — detachNoteFromCanvas', () => {
  beforeEach(() => resetStore());

  it('sets detached: true and clears associated edges', () => {
    const nodes: Node[] = [
      {
        id: 'card-1',
        type: 'card',
        position: { x: 100, y: 100 },
        data: { type: 'text', title: 'Hello' },
      },
      {
        id: 'card-2',
        type: 'card',
        position: { x: 300, y: 100 },
        data: { type: 'text', title: 'World' },
      },
    ];
    useCanvasStore.setState({
      nodes,
      edges: [
        { id: 'e1', source: 'card-1', target: 'card-2' },
        { id: 'e2', source: 'card-2', target: 'card-1' },
      ],
      _hydrated: true,
    });

    useCanvasStore.getState().detachNoteFromCanvas('card-1');

    const node = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'card-1')!;
    expect((node.data as any).detached).toBe(true);
    expect(node.position).toEqual({ x: 0, y: 0 });
    expect(useCanvasStore.getState().edges).toHaveLength(0);
  });

  it('no-ops for non-card/image node types', () => {
    const nodes: Node[] = [
      {
        id: 'group-1',
        type: 'group',
        position: { x: 0, y: 0 },
        data: { label: 'Group' },
      },
    ];
    useCanvasStore.setState({ nodes, _hydrated: true });

    useCanvasStore.getState().detachNoteFromCanvas('group-1');

    const node = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'group-1')!;
    expect((node.data as any).detached).toBeUndefined();
  });

  it('detaches link and asset nodes into the library', () => {
    const nodes: Node[] = [
      {
        id: 'link-1',
        type: 'link',
        position: { x: 100, y: 100 },
        data: {
          color: '#FFFFFF',
          title: 'Docs',
          url: 'https://example.com/docs',
        },
      },
      {
        id: 'asset-1',
        type: 'asset',
        position: { x: 300, y: 100 },
        data: {
          attachmentFile: 'attachments/file_abc.pdf',
          color: '#FFFFFF',
          fileName: 'report.pdf',
          kind: 'file',
          mimeType: 'application/pdf',
          title: 'Report',
        },
      },
    ];
    useCanvasStore.setState({
      nodes,
      edges: [{ id: 'e1', source: 'link-1', target: 'asset-1' }],
      _hydrated: true,
    });

    useCanvasStore.getState().detachNoteFromCanvas('link-1');
    useCanvasStore.getState().detachNoteFromCanvas('asset-1');

    const state = useCanvasStore.getState();
    expect(
      (state.nodes.find((n) => n.id === 'link-1')?.data as any).detached
    ).toBe(true);
    expect(
      (state.nodes.find((n) => n.id === 'asset-1')?.data as any).detached
    ).toBe(true);
    expect(state.edges).toHaveLength(0);
  });
});
