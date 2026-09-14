import type { Connection, Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NODE_ID_REGEX = /^node-/;
const NOTE_ID_REGEX = /^note_/;

import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
import {
  CANVAS_NODE_SPECS,
  CARD_H,
  CARD_W,
  FOLDER_H,
  FOLDER_W,
  IMAGE_H,
  IMAGE_W,
  STICKY_H,
  STICKY_W,
} from '@/lib/canvasNodeRegistry';
import { buildTopicChildEdge } from '@/lib/topicTree';
import { unifiedUndoHistory } from '@/lib/unifiedUndoHistory';
import {
  resetViewportPersistSuppression,
  suppressViewportPersist,
} from '@/lib/viewportPersist';
import { canvasImporterPlacementHost } from '@/plugins/runtime/importPlacement';
import { useCanvasStore } from '@/store/canvasStore';
import {
  LINK_CANVAS_TYPE_ID,
  RECORDING_CANVAS_TYPE_ID,
} from '../../shared/extensions/builtinIds';
import { createTopicData } from '../../shared/topic';

const PASTE_ID_RE = /^paste-/;
const PASTE_EDGE_ID_RE = /^paste-edge-/;

const {
  loadCanvasMock,
  rpcDeleteNoteMock,
  rpcDeleteWidgetMock,
  rpcSaveManifestMock,
  rpcSetActiveViewMock,
  isRpcAvailableMock,
  rpcCheckLicenseMock,
  getCachedLicenseMock,
  cloneWidgetMock,
  createWidgetMock,
} = vi.hoisted(() => ({
  loadCanvasMock: vi.fn(),
  rpcDeleteNoteMock: vi.fn(() => Promise.resolve({ success: true })),
  rpcDeleteWidgetMock: vi.fn(() => Promise.resolve({ success: true })),
  rpcSaveManifestMock: vi.fn(() => Promise.resolve({ success: true })),
  rpcSetActiveViewMock: vi.fn(() => Promise.resolve({ success: true })),
  isRpcAvailableMock: vi.fn(() => Promise.resolve(true)),
  rpcCheckLicenseMock: vi.fn<
    () => Promise<{ activated: boolean; email?: string } | null>
  >(() => Promise.resolve({ activated: true, email: 'test@example.com' })),
  getCachedLicenseMock: vi.fn<
    () => { activated: boolean; email?: string } | null
  >(() => null),
  cloneWidgetMock: vi.fn(),
  createWidgetMock: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  loadCanvas: loadCanvasMock,
  rpcDeleteNote: rpcDeleteNoteMock,
  rpcDeleteWidget: rpcDeleteWidgetMock,
  rpcSaveManifest: rpcSaveManifestMock,
  rpcSetActiveView: rpcSetActiveViewMock,
  isRpcAvailable: isRpcAvailableMock,
}));

vi.mock('@/lib/rpc-license', () => ({
  getCachedLicense: getCachedLicenseMock,
  refreshLicense: rpcCheckLicenseMock,
  rpcCheckLicense: rpcCheckLicenseMock,
}));

vi.mock('@/store/widgetStore', () => ({
  useWidgetStore: {
    getState: () => ({
      cloneWidget: cloneWidgetMock,
      createWidget: createWidgetMock,
    }),
  },
}));

vi.mock('../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
  toast_topic_branch_locked: () => 'Branch locked',
  toast_topic_container_gone: () => 'Container gone',
  toast_topic_container_locked: () => 'Container locked',
  toast_topic_layout_group_full: () => 'Group full',
  toast_topic_layout_locked: () => 'Layout locked',
  toast_topic_layout_overlap: () => 'Layout overlap',
  toast_topic_relation_unavailable: () => 'Relation unavailable',
  toast_topic_tree_frozen: () => 'Tree frozen',
}));

function resetStore() {
  // Use the store's reset() to clear undo/redo too, then set remaining fields
  useCanvasStore.getState().reset();
  useCanvasStore.setState({
    clipboard: [],
    clipboardEdges: [],
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

function makeWidgetNode(id: string, widgetId: string): Node {
  return makeNode(id, {
    type: 'widget',
    data: { widgetId, kind: 'checklist' },
    style: { height: 180, width: 260 },
  });
}

function makeWidgetRecord(id: string) {
  return {
    schema: 'ghostboard-widget/v1' as const,
    id,
    kind: 'checklist' as const,
    title: 'List clone',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    data: { items: [] },
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

describe('canvas importer placement', () => {
  beforeEach(() => {
    resetStore();
    rpcSaveManifestMock.mockClear();
    rpcSaveManifestMock.mockResolvedValue({ success: true });
    useCanvasStore.setState({
      _hydrated: true,
      activeViewId: 'research',
      views: [{ id: 'research', name: 'Research' }],
    });
  });

  afterEach(() => {
    resetStore();
    useCanvasStore.setState({
      activeViewId: 'default',
      views: [{ id: 'default', name: 'Default Canvas' }],
    });
    unifiedUndoHistory.reset();
  });

  it('places deterministic grid cards and safely reuses them on retry', async () => {
    const request = {
      items: Array.from({ length: 5 }, (_, index) => ({
        color: index === 0 ? 'blue' : '',
        id: `note-${index + 1}`,
        revision: 1,
        title: `Note ${index + 1}`,
      })),
      operationId: 'plgimport_1234',
      strategy: 'grid' as const,
      viewId: 'research',
    };

    const first = await canvasImporterPlacementHost.place(request);
    const nodes = useCanvasStore.getState().nodes;
    expect(first.nodeIds).toEqual([
      'node-plgimport_1234-1',
      'node-plgimport_1234-2',
      'node-plgimport_1234-3',
      'node-plgimport_1234-4',
      'node-plgimport_1234-5',
    ]);
    expect(nodes).toHaveLength(5);
    expect(nodes[0]).toMatchObject({
      data: {
        blocknoteRevision: 1,
        color: 'blue',
        noteId: 'note-1',
        title: 'Note 1',
      },
      position: { x: 0, y: 0 },
      type: 'card',
    });
    expect(nodes[1]?.data.color).toBe('');
    expect(nodes[4]?.position).toEqual({ x: 0, y: CARD_H + 40 });

    await canvasImporterPlacementHost.place(request);
    expect(useCanvasStore.getState().nodes).toHaveLength(5);
    expect(rpcSaveManifestMock).toHaveBeenCalledTimes(2);

    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node, index) =>
        index === 0
          ? { ...node, data: { ...node.data, noteId: 'different-note' } }
          : node
      ),
    }));
    await expect(canvasImporterPlacementHost.place(request)).rejects.toThrow(
      'no longer matches'
    );
    expect(rpcSaveManifestMock).toHaveBeenCalledTimes(2);
  });

  it('refuses placement before the exact target canvas is hydrated', async () => {
    useCanvasStore.setState({ _hydrated: false });
    await expect(
      canvasImporterPlacementHost.place({
        items: [{ color: '', id: 'note-1', revision: 1, title: 'One' }],
        operationId: 'plgimport_1234',
        strategy: 'vertical',
        viewId: 'research',
      })
    ).rejects.toThrow('wait for it to load');
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });
});

afterEach(() => {
  resetStore();
  unifiedUndoHistory.reset();
  resetViewportPersistSuppression();
  vi.unstubAllGlobals();
  rpcDeleteNoteMock.mockClear();
  rpcDeleteWidgetMock.mockClear();
  rpcCheckLicenseMock.mockReset();
  rpcCheckLicenseMock.mockResolvedValue({
    activated: true,
    email: 'test@example.com',
  });
  getCachedLicenseMock.mockReset();
  getCachedLicenseMock.mockReturnValue(null);
  loadCanvasMock.mockReset();
  rpcSaveManifestMock.mockReset();
  rpcSaveManifestMock.mockResolvedValue({ success: true });
  rpcSetActiveViewMock.mockReset();
  rpcSetActiveViewMock.mockResolvedValue({ success: true });
  isRpcAvailableMock.mockReset();
  isRpcAvailableMock.mockResolvedValue(true);
  cloneWidgetMock.mockReset();
  cloneWidgetMock.mockResolvedValue(null);
  createWidgetMock.mockReset();
  createWidgetMock.mockResolvedValue(null);
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

  it('applyNoteTitles updates selected note occurrences and restores on undo', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('a', {
          selected: true,
          data: { noteId: 'note_a', title: '  Hello   world ' },
        }),
        makeNode('b', {
          selected: false,
          data: { noteId: 'note_a', title: '  Hello   world ' },
        }),
        makeNode('folder', {
          type: 'folder',
          selected: true,
          data: {
            children: [
              {
                id: 'child',
                noteId: 'note_b',
                data: { noteId: 'note_b', title: 'Child' },
              },
            ],
          },
        }),
      ],
    });

    expect(useCanvasStore.getState().collectSelectedNoteIds()).toEqual([
      'note_a',
      'note_b',
    ]);
    useCanvasStore.getState().applyNoteTitles({
      note_a: 'Hello world',
      note_b: 'Child',
    });
    const nodes = useCanvasStore.getState().nodes;
    expect(nodes[0]?.data.title).toBe('Hello world');
    expect(nodes[1]?.data.title).toBe('Hello world');
    const children = nodes[2]?.data.children as Array<{
      data: { title: string };
    }>;
    expect(children[0]?.data.title).toBe('Child');

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes[0]?.data.title).toBe(
      '  Hello   world '
    );
  });

  it('updateNodeData merges data into an existing node', () => {
    useCanvasStore.setState({ nodes: [makeNode('a')] });

    useCanvasStore.getState().updateNodeData('a', { title: 'Updated' });
    const node = useCanvasStore.getState().nodes[0]!;

    expect(node.data.title).toBe('Updated');
    expect(node.data.content).toBe('');
  });

  it('updateNodeData syncs focusedNode.data when the focused node is updated', () => {
    // Regression guard: the focused view reads from focusedNode.data, a snapshot
    // taken when the view opened. Without syncing, checklist edits (delete /
    // toggle / rename) made inside the focused view never re-render.
    useCanvasStore.setState({
      nodes: [
        makeNode('a', {
          type: 'card',
          data: { title: 'List', type: 'checklist', items: [{ text: 'One' }] },
        }),
      ],
      focusedNode: {
        id: 'a',
        type: 'card',
        data: { title: 'List', type: 'checklist', items: [{ text: 'One' }] },
        rect: fakeRect(),
      },
    });

    // Simulate deleting an item from the focused checklist.
    useCanvasStore.getState().updateNodeData('a', { items: [] });

    const state = useCanvasStore.getState();
    expect(state.nodes[0]?.data.items).toEqual([]);
    expect(state.focusedNode?.data.items).toEqual([]);
  });

  it('updateNodeData leaves focusedNode untouched for a different node', () => {
    useCanvasStore.setState({
      nodes: [makeNode('a'), makeNode('b')],
      focusedNode: {
        id: 'b',
        type: 'card',
        data: { title: 'Focused', content: '', color: '#FFFFFF' },
        rect: fakeRect(),
      },
    });

    useCanvasStore.getState().updateNodeData('a', { title: 'Updated A' });

    // focusedNode still points at 'b' with its original data.
    expect(useCanvasStore.getState().focusedNode?.data.title).toBe('Focused');
  });

  it('toggleNodeLocked flips locked state through a semantic action', () => {
    useCanvasStore.setState({ nodes: [makeNode('a', { data: {} })] });

    useCanvasStore.getState().toggleNodeLocked('a');
    expect(useCanvasStore.getState().nodes[0]?.data.locked).toBe(true);

    useCanvasStore.getState().toggleNodeLocked('a');
    expect(useCanvasStore.getState().nodes[0]?.data.locked).toBe(false);
  });

  it('z-order actions update node zIndex values', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('back', { zIndex: 0 }),
        makeNode('middle', { selected: true, zIndex: 1 }),
        makeNode('front', { zIndex: 2 }),
      ],
    });

    useCanvasStore.getState().bringNodesToFront(['middle']);
    expect(
      useCanvasStore.getState().nodes.find((n) => n.id === 'middle')
    ).toMatchObject({ zIndex: 3 });

    useCanvasStore.getState().sendNodesToBack(['middle']);
    expect(
      useCanvasStore.getState().nodes.find((n) => n.id === 'middle')
    ).toMatchObject({ zIndex: -1 });

    useCanvasStore.getState().bringNodesForward(['middle']);
    expect(
      useCanvasStore.getState().nodes.find((n) => n.id === 'middle')
    ).toMatchObject({ zIndex: 0 });

    useCanvasStore.getState().sendNodesBackward(['middle']);
    expect(
      useCanvasStore.getState().nodes.find((n) => n.id === 'middle')
    ).toMatchObject({ zIndex: -1 });
  });

  it('groupSelected creates a group parent around selected nodes', () => {
    useCanvasStore.setState({
      nodes: [
        {
          ...makeNode('a', {
            position: { x: 100, y: 120 },
            style: { width: 100, height: 80 },
          }),
          selected: true,
        },
        {
          ...makeNode('b', {
            position: { x: 260, y: 200 },
            style: { width: 120, height: 100 },
          }),
          selected: true,
        },
        makeNode('c', { position: { x: 500, y: 500 } }),
      ],
    });

    useCanvasStore.getState().groupSelected();
    const state = useCanvasStore.getState();
    const group = state.nodes.find((node) => node.type === 'group');

    expect(group).toBeDefined();
    expect(group?.selected).toBe(true);
    expect(group?.position).toEqual({ x: 76, y: 96 });
    expect(group?.style).toMatchObject({ width: 328, height: 228 });
    expect(state.nodes.find((node) => node.id === 'a')).toMatchObject({
      parentId: group?.id,
      position: { x: 24, y: 24 },
      selected: false,
    });
    expect(state.nodes.find((node) => node.id === 'b')).toMatchObject({
      parentId: group?.id,
      position: { x: 184, y: 104 },
      selected: false,
    });
  });

  it('ungroupSelected removes selected groups and restores absolute child positions', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('group-1', {
          type: 'group',
          position: { x: 50, y: 60 },
          selected: true,
          style: { width: 300, height: 200 },
        }),
        makeNode('child-1', {
          parentId: 'group-1',
          extent: 'parent' as const,
          position: { x: 20, y: 30 },
        }),
      ],
    });

    useCanvasStore.getState().ungroupSelected();
    const state = useCanvasStore.getState();

    expect(state.nodes.some((node) => node.id === 'group-1')).toBe(false);
    expect(state.nodes[0]).toMatchObject({
      id: 'child-1',
      position: { x: 70, y: 90 },
      selected: true,
    });
    expect(state.nodes[0]?.parentId).toBeUndefined();
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

  it('copySelected copies edges whose endpoints are both selected', () => {
    useCanvasStore.setState({
      nodes: [
        { ...makeNode('a'), selected: true } as Node,
        { ...makeNode('b'), selected: true } as Node,
        { ...makeNode('c'), selected: false } as Node,
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c' },
      ],
    });

    useCanvasStore.getState().copySelected();

    expect(useCanvasStore.getState().clipboardEdges).toEqual([
      { id: 'e1', source: 'a', target: 'b' },
    ]);
  });

  it('copySelected does nothing when no nodes are selected', () => {
    useCanvasStore.setState({
      nodes: [makeNode('a'), makeNode('b')],
    });

    useCanvasStore.getState().copySelected();

    expect(useCanvasStore.getState().clipboard).toHaveLength(0);
  });

  it('pasteClipboard creates new nodes with unique ids and offset', async () => {
    useCanvasStore.setState({
      nodes: [makeNode('a')],
      clipboard: [makeNode('copied', { position: { x: 10, y: 20 } })],
    });

    await useCanvasStore.getState().pasteClipboard();
    const state = useCanvasStore.getState();

    expect(state.nodes).toHaveLength(2);
    const pasted = state.nodes[1]!;
    expect(pasted.id).not.toBe('copied');
    expect(pasted.id).toMatch(PASTE_ID_RE);
    expect(pasted.position.x).toBe(40); // 10 + 30 offset
    expect(pasted.position.y).toBe(50); // 20 + 30 offset
    expect(pasted.selected).toBe(true);
  });

  it('pasteClipboard remaps copied internal edges', async () => {
    useCanvasStore.setState({
      nodes: [],
      clipboard: [
        makeNode('a', { position: { x: 10, y: 20 } }),
        makeNode('b', { position: { x: 100, y: 120 } }),
      ],
      clipboardEdges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          type: 'labeledEdge',
          data: { label: 'depends on' },
        } as Edge,
      ],
    });

    await useCanvasStore.getState().pasteClipboard();
    const state = useCanvasStore.getState();
    const pastedIds = state.nodes.map((node) => node.id);

    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]?.id).toMatch(PASTE_EDGE_ID_RE);
    expect(state.edges[0]?.source).toBe(pastedIds[0]);
    expect(state.edges[0]?.target).toBe(pastedIds[1]);
    expect(state.edges[0]?.data).toEqual({ label: 'depends on' });
  });

  it('duplicateSelected duplicates selected nodes and their internal edges', async () => {
    useCanvasStore.setState({
      nodes: [
        { ...makeNode('a', { position: { x: 0, y: 0 } }), selected: true },
        { ...makeNode('b', { position: { x: 100, y: 100 } }), selected: true },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    });

    await useCanvasStore.getState().duplicateSelected();
    const state = useCanvasStore.getState();

    expect(state.nodes).toHaveLength(4);
    expect(state.edges).toHaveLength(2);
    expect(state.nodes.filter((node) => node.selected)).toHaveLength(2);
    expect(state.edges[1]?.source).not.toBe('a');
    expect(state.edges[1]?.target).not.toBe('b');
  });

  it('duplicateSelected clones widget backing records', async () => {
    cloneWidgetMock.mockResolvedValueOnce(
      makeWidgetRecord('widget_source_clone')
    );
    useCanvasStore.setState({
      nodes: [
        {
          ...makeWidgetNode('widget-node', 'widget_source'),
          selected: true,
        },
      ],
    });

    await useCanvasStore.getState().duplicateSelected();

    expect(cloneWidgetMock).toHaveBeenCalledWith('widget_source');
    const widgetIds = useCanvasStore
      .getState()
      .nodes.filter((node) => node.type === 'widget')
      .map((node) => (node.data as Record<string, unknown>).widgetId);
    expect(widgetIds).toEqual(['widget_source', 'widget_source_clone']);
  });

  it('pasteClipboard clones widget backing records', async () => {
    cloneWidgetMock.mockResolvedValueOnce(
      makeWidgetRecord('widget_source_clone')
    );
    useCanvasStore.setState({
      nodes: [],
      clipboard: [makeWidgetNode('widget-node', 'widget_source')],
      clipboardEdges: [],
    });

    await useCanvasStore.getState().pasteClipboard();

    expect(cloneWidgetMock).toHaveBeenCalledWith('widget_source');
    const pasted = useCanvasStore
      .getState()
      .nodes.find((node) => node.type === 'widget');
    expect(pasted?.id).not.toBe('widget-node');
    expect(pasted?.data).toMatchObject({
      widgetId: 'widget_source_clone',
      kind: 'checklist',
    });
  });

  it('duplicateSelected creates an independent widget when clone fails', async () => {
    // cloneWidget fails; createWidget must produce an independent empty widget
    // instead of the copy sharing the source widgetId.
    cloneWidgetMock.mockResolvedValueOnce(null);
    createWidgetMock.mockResolvedValueOnce(makeWidgetRecord('widget_fallback'));
    useCanvasStore.setState({
      nodes: [
        {
          ...makeWidgetNode('widget-node', 'widget_source'),
          selected: true,
        },
      ],
    });

    await useCanvasStore.getState().duplicateSelected();

    expect(cloneWidgetMock).toHaveBeenCalledWith('widget_source');
    expect(createWidgetMock).toHaveBeenCalledWith('checklist');
    const widgetIds = useCanvasStore
      .getState()
      .nodes.filter((node) => node.type === 'widget')
      .map((node) => (node.data as Record<string, unknown>).widgetId);
    // The copy must NOT reuse the source id.
    expect(widgetIds).toEqual(['widget_source', 'widget_fallback']);
  });

  it('duplicateSelected drops the widget node when both clone and create fail', async () => {
    cloneWidgetMock.mockResolvedValueOnce(null);
    createWidgetMock.mockResolvedValueOnce(null);
    useCanvasStore.setState({
      nodes: [
        {
          ...makeWidgetNode('widget-node', 'widget_source'),
          selected: true,
        },
      ],
    });

    await useCanvasStore.getState().duplicateSelected();

    // The copy is dropped entirely rather than sharing the source id.
    const widgetIds = useCanvasStore
      .getState()
      .nodes.filter((node) => node.type === 'widget')
      .map((node) => (node.data as Record<string, unknown>).widgetId);
    expect(widgetIds).toEqual(['widget_source']);
  });

  it('duplicateSelected clones widget backing records inside folder children', async () => {
    cloneWidgetMock
      .mockResolvedValueOnce(makeWidgetRecord('widget_child1_clone'))
      .mockResolvedValueOnce(makeWidgetRecord('widget_child2_clone'));
    useCanvasStore.setState({
      nodes: [
        makeNode('folder-node', {
          type: 'folder',
          selected: true,
          data: {
            title: 'Folder',
            subtitle: '',
            children: [
              {
                id: 'child-1',
                type: 'widget',
                data: { widgetId: 'widget_child1', kind: 'checklist' },
              },
              {
                id: 'child-2',
                type: 'widget',
                data: { widgetId: 'widget_child2', kind: 'checklist' },
              },
            ],
          },
        }),
      ],
    });

    await useCanvasStore.getState().duplicateSelected();

    expect(cloneWidgetMock).toHaveBeenCalledWith('widget_child1');
    expect(cloneWidgetMock).toHaveBeenCalledWith('widget_child2');
    const folders = useCanvasStore
      .getState()
      .nodes.filter((node) => node.type === 'folder');
    expect(folders).toHaveLength(2);
    const cloneFolder = folders.find((n) => n.id !== 'folder-node')!;
    const cloneChildren = cloneFolder.data.children as Array<{
      type: string;
      data: { widgetId: string };
    }>;
    const cloneWidgetIds = cloneChildren
      .filter((c) => c.type === 'widget')
      .map((c) => c.data.widgetId)
      .sort();
    expect(cloneWidgetIds).toEqual([
      'widget_child1_clone',
      'widget_child2_clone',
    ]);
  });

  it('pasteClipboard clones widget backing records inside folder children', async () => {
    cloneWidgetMock
      .mockResolvedValueOnce(makeWidgetRecord('widget_child1_clone'))
      .mockResolvedValueOnce(makeWidgetRecord('widget_child2_clone'));
    useCanvasStore.setState({
      nodes: [],
      clipboard: [
        makeNode('folder-node', {
          type: 'folder',
          data: {
            title: 'Folder',
            subtitle: '',
            children: [
              {
                id: 'child-1',
                type: 'widget',
                data: { widgetId: 'widget_child1', kind: 'checklist' },
              },
              {
                id: 'child-2',
                type: 'widget',
                data: { widgetId: 'widget_child2', kind: 'checklist' },
              },
            ],
          },
        }),
      ],
      clipboardEdges: [],
    });

    await useCanvasStore.getState().pasteClipboard();

    expect(cloneWidgetMock).toHaveBeenCalledWith('widget_child1');
    expect(cloneWidgetMock).toHaveBeenCalledWith('widget_child2');
    const pastedFolder = useCanvasStore
      .getState()
      .nodes.find((node) => node.type === 'folder');
    const pastedChildren = pastedFolder?.data.children as Array<{
      type: string;
      data: { widgetId: string };
    }>;
    const pastedWidgetIds = pastedChildren
      .filter((c) => c.type === 'widget')
      .map((c) => c.data.widgetId)
      .sort();
    expect(pastedWidgetIds).toEqual([
      'widget_child1_clone',
      'widget_child2_clone',
    ]);
  });

  it('cutSelected copies selected nodes then deletes them from the canvas', () => {
    useCanvasStore.setState({
      nodes: [
        { ...makeNode('a'), selected: true },
        { ...makeNode('b'), selected: false },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    });

    useCanvasStore.getState().cutSelected();
    const state = useCanvasStore.getState();

    expect(state.clipboard).toHaveLength(1);
    expect(state.clipboard[0]?.id).toBe('a');
    expect(state.nodes.map((node) => node.id)).toEqual(['b']);
    expect(state.edges).toHaveLength(0);
  });

  it('pasteClipboard does nothing with empty clipboard', async () => {
    useCanvasStore.setState({ nodes: [makeNode('a')], clipboard: [] });

    await useCanvasStore.getState().pasteClipboard();

    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });
});

describe('canvasStore — undo/redo', () => {
  it('registers applied snapshots and reconciles direct source undo', () => {
    unifiedUndoHistory.setContext('workspace-a', 'default');
    useCanvasStore.setState({ nodes: [makeNode('a')], edges: [] });
    useCanvasStore.getState().saveSnapshot();
    useCanvasStore.getState().setNodes([makeNode('a'), makeNode('b')]);

    expect(unifiedUndoHistory.getSnapshot().past).toMatchObject([
      { kind: 'canvas', viewId: 'default' },
    ]);
    expect(useCanvasStore.getState().undo()).toBe(true);
    expect(unifiedUndoHistory.getSnapshot()).toMatchObject({
      past: [],
      future: [{ kind: 'canvas' }],
    });
  });

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

  it('undo and redo leave the current viewport untouched', () => {
    // The React Flow camera only reads the stored viewport on mount, so
    // undo/redo restoring a stale viewport would not move the camera — it
    // would only corrupt the persisted value and cause a jump on relaunch.
    useCanvasStore.setState({
      nodes: [makeNode('a')],
      edges: [],
      viewport: { x: 10, y: 20, zoom: 1 },
    });
    useCanvasStore.getState().saveSnapshot();
    useCanvasStore.getState().setNodes([makeNode('a'), makeNode('b')]);
    useCanvasStore.getState().setViewport({ x: 100, y: 200, zoom: 2 });

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().viewport).toEqual({
      x: 100,
      y: 200,
      zoom: 2,
    });

    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().nodes).toHaveLength(2);
    expect(useCanvasStore.getState().viewport).toEqual({
      x: 100,
      y: 200,
      zoom: 2,
    });
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
    expect(state.sessionViewport).toBeNull();
    expect(state._undoRedo.past).toEqual([]);
    expect(state._undoRedo.future).toEqual([]);
  });

  it('setActiveView restores the session viewport when re-entering a view', async () => {
    useCanvasStore.setState({
      activeViewId: 'default',
      _hydrated: true,
      sessionViewport: { x: 10, y: 20, zoom: 1.5 },
      _sessionViewports: {},
    });

    await useCanvasStore.getState().setActiveView('focus');
    expect(useCanvasStore.getState().sessionViewport).toBeNull();
    expect(useCanvasStore.getState()._sessionViewports.default).toEqual({
      x: 10,
      y: 20,
      zoom: 1.5,
    });

    await useCanvasStore.getState().setActiveView('default');
    expect(useCanvasStore.getState().sessionViewport).toEqual({
      x: 10,
      y: 20,
      zoom: 1.5,
    });
    expect(useCanvasStore.getState().viewport).toEqual({
      x: 10,
      y: 20,
      zoom: 1.5,
    });
  });

  it('switchView does not clear local state when persisting active view fails', async () => {
    rpcSetActiveViewMock.mockResolvedValueOnce({ success: false });
    useCanvasStore.setState({
      activeViewId: 'default',
      _hydrated: true,
      nodes: [makeNode('a')],
      edges: [],
      viewport: { x: 1, y: 2, zoom: 1 },
      sessionViewport: { x: 1, y: 2, zoom: 1 },
    });

    await expect(useCanvasStore.getState().switchView('focus')).resolves.toBe(
      false
    );

    const state = useCanvasStore.getState();
    expect(rpcSaveManifestMock).toHaveBeenCalledWith(
      'default',
      [expect.objectContaining({ id: 'a' })],
      []
    );
    expect(rpcSetActiveViewMock).toHaveBeenCalledWith('focus');
    expect(state.activeViewId).toBe('default');
    expect(state.nodes).toHaveLength(1);
  });

  it('moves selected nodes and their internal edges to another view', async () => {
    loadCanvasMock.mockResolvedValueOnce({
      nodes: [makeNode('existing', { position: { x: 500, y: 500 } })],
      edges: [],
    });
    useCanvasStore.setState({
      activeViewId: 'default',
      viewport: { x: 1, y: 2, zoom: 0.75 },
      sessionViewport: { x: 1, y: 2, zoom: 0.75 },
      nodes: [
        makeNode('a', { selected: true, position: { x: 10, y: 20 } }),
        makeNode('b', { selected: true, position: { x: 140, y: 20 } }),
        makeNode('c', { position: { x: 280, y: 20 } }),
      ],
      edges: [
        { id: 'edge-ab', source: 'a', target: 'b', selected: true },
        { id: 'edge-bc', source: 'b', target: 'c' },
      ],
    });

    await expect(
      useCanvasStore.getState().moveSelectedToView('archive')
    ).resolves.toBe(true);

    expect(loadCanvasMock).toHaveBeenCalledWith('archive');
    expect(rpcSaveManifestMock).toHaveBeenNthCalledWith(
      1,
      'archive',
      expect.arrayContaining([
        expect.objectContaining({ id: 'existing' }),
        expect.objectContaining({ id: 'a' }),
        expect.objectContaining({ id: 'b' }),
      ]),
      [expect.objectContaining({ id: 'edge-ab', source: 'a', target: 'b' })]
    );
    const firstSaveCall = rpcSaveManifestMock.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>[],
      Record<string, unknown>[],
    ];
    expect(firstSaveCall[1].find((node) => node.id === 'a')).not.toHaveProperty(
      'selected'
    );
    expect(rpcSaveManifestMock).toHaveBeenNthCalledWith(
      2,
      'default',
      [expect.objectContaining({ id: 'c' })],
      []
    );
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual([
      'c',
    ]);
    expect(useCanvasStore.getState().edges).toEqual([]);
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
    expect(state.sessionViewport).toBeNull();
  });

  it('hydrate restores the session viewport for the active view', () => {
    const viewport = { x: 100, y: 200, zoom: 1.25 };
    useCanvasStore.setState({
      activeViewId: 'default',
      sessionViewport: null,
      _sessionViewports: { default: viewport },
    });

    useCanvasStore.getState().hydrate([], []);

    expect(useCanvasStore.getState().viewport).toEqual(viewport);
    expect(useCanvasStore.getState().sessionViewport).toEqual(viewport);
  });

  it('hydrate keeps an already-restored session viewport', () => {
    const viewport = { x: 1, y: 2, zoom: 3 };
    useCanvasStore.setState({
      viewport,
      sessionViewport: viewport,
      _sessionViewports: { default: viewport },
    });

    useCanvasStore.getState().hydrate([], []);

    expect(useCanvasStore.getState().viewport).toEqual(viewport);
    expect(useCanvasStore.getState().sessionViewport).toEqual(viewport);
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
    expect(state.sessionViewport).toBeNull();
    expect(state._sessionViewports).toEqual({});
  });
});

describe('canvasStore — viewport', () => {
  it('setViewport stores the live and session viewport by default', () => {
    useCanvasStore.getState().setViewport({ x: 10, y: 20, zoom: 1.5 });

    expect(useCanvasStore.getState().viewport).toEqual({
      x: 10,
      y: 20,
      zoom: 1.5,
    });
    expect(useCanvasStore.getState().sessionViewport).toEqual({
      x: 10,
      y: 20,
      zoom: 1.5,
    });
    expect(useCanvasStore.getState()._sessionViewports.default).toEqual({
      x: 10,
      y: 20,
      zoom: 1.5,
    });
  });

  it('setViewport short-circuits when the value is unchanged', () => {
    const initial = { x: 1, y: 2, zoom: 3 };
    useCanvasStore.setState({
      viewport: initial,
      sessionViewport: initial,
    });

    useCanvasStore.getState().setViewport({ x: 1, y: 2, zoom: 3 });

    // Reference identity preserved — no redundant set call.
    expect(useCanvasStore.getState().viewport).toBe(initial);
    expect(useCanvasStore.getState().sessionViewport).toBe(initial);
  });

  it('setViewport accepts null to clear the stored viewport', () => {
    useCanvasStore.setState({
      viewport: { x: 1, y: 2, zoom: 3 },
      sessionViewport: { x: 1, y: 2, zoom: 3 },
      _sessionViewports: { default: { x: 1, y: 2, zoom: 3 } },
    });

    useCanvasStore.getState().setViewport(null);

    expect(useCanvasStore.getState().viewport).toBeNull();
    expect(useCanvasStore.getState().sessionViewport).toBeNull();
    expect(useCanvasStore.getState()._sessionViewports).toEqual({});
  });

  it('setViewport skips sessionViewport while suppression is active', () => {
    useCanvasStore.setState({
      sessionViewport: { x: 0, y: 0, zoom: 1 },
      _sessionViewports: { default: { x: 0, y: 0, zoom: 1 } },
    });

    suppressViewportPersist(300);
    useCanvasStore.getState().setViewport({ x: 500, y: 600, zoom: 0.5 });

    expect(useCanvasStore.getState().viewport).toEqual({
      x: 500,
      y: 600,
      zoom: 0.5,
    });
    expect(useCanvasStore.getState().sessionViewport).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
  });

  it('setViewport can force session cache update while suppression is active', () => {
    suppressViewportPersist(300);
    useCanvasStore
      .getState()
      .setViewport({ x: 12, y: 34, zoom: 2 }, { persist: true });

    expect(useCanvasStore.getState().sessionViewport).toEqual({
      x: 12,
      y: 34,
      zoom: 2,
    });
    expect(useCanvasStore.getState()._sessionViewports.default).toEqual({
      x: 12,
      y: 34,
      zoom: 2,
    });
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

  it('skips extension nodes so color stays in instance state', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('ext-1', {
          type: 'extension',
          data: {
            canvasTypeId: 'ghostboard.web/link',
            instanceId: 'extinst_link1',
          },
        }),
      ],
    });

    useCanvasStore.getState().changeNodeColor('ext-1');
    const { data } = useCanvasStore.getState().nodes[0]!;

    expect(data).toEqual({
      canvasTypeId: 'ghostboard.web/link',
      instanceId: 'extinst_link1',
    });
  });
});

describe('canvasStore — createNode', () => {
  const fillFreeCardLimit = () => {
    useCanvasStore.setState({
      nodes: Array.from({ length: 100 }, (_, index) =>
        makeNode(`existing-card-${index}`, {
          position: { x: 10_000 + index * 1000, y: 10_000 },
        })
      ),
    });
  };

  it('does not check the license when creating below the free card limit', async () => {
    await useCanvasStore
      .getState()
      .createNode('card', createRfInstance({ x: 0, y: 0, zoom: 1 }));

    expect(rpcCheckLicenseMock).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });

  it('does not check the license for an unlimited node kind at the card limit', async () => {
    fillFreeCardLimit();

    await useCanvasStore
      .getState()
      .createNode('folder', createRfInstance({ x: 0, y: 0, zoom: 1 }));

    expect(rpcCheckLicenseMock).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes).toHaveLength(101);
  });

  it.each([
    'card',
    'sticky',
  ] as const)('blocks an unlicensed user from creating %s beyond the free card limit', async (kind) => {
    fillFreeCardLimit();
    rpcCheckLicenseMock.mockResolvedValue({ activated: false });

    const result = await useCanvasStore
      .getState()
      .createNode(kind, createRfInstance({ x: 0, y: 0, zoom: 1 }));

    expect(result).toBeUndefined();
    expect(rpcCheckLicenseMock).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().nodes).toHaveLength(100);
  });

  it.each([
    'checklist',
    'pomodoro',
    'reminder',
  ] as const)('does not check the license for widget kind %s at the card limit', async (kind) => {
    fillFreeCardLimit();
    rpcCheckLicenseMock.mockResolvedValue({ activated: false });

    const result = await useCanvasStore
      .getState()
      .createNode(kind, createRfInstance({ x: 0, y: 0, zoom: 1 }));

    expect(result).toMatch(NODE_ID_REGEX);
    expect(rpcCheckLicenseMock).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes).toHaveLength(101);
  });

  it('allows a licensed user to create beyond the free card limit', async () => {
    fillFreeCardLimit();
    rpcCheckLicenseMock.mockResolvedValue({ activated: true });

    const result = await useCanvasStore
      .getState()
      .createNode('card', createRfInstance({ x: 0, y: 0, zoom: 1 }));

    expect(result).toMatch(NODE_ID_REGEX);
    expect(rpcCheckLicenseMock).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().nodes).toHaveLength(101);
  });

  it('uses a cached active license without refreshing at the free card limit', async () => {
    fillFreeCardLimit();
    getCachedLicenseMock.mockReturnValue({ activated: true });

    const result = await useCanvasStore
      .getState()
      .createNode('card', createRfInstance({ x: 0, y: 0, zoom: 1 }));

    expect(result).toMatch(NODE_ID_REGEX);
    expect(rpcCheckLicenseMock).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes).toHaveLength(101);
  });

  it('rechecks a cached inactive license so cross-window activation is observed', async () => {
    fillFreeCardLimit();
    getCachedLicenseMock.mockReturnValue({ activated: false });
    rpcCheckLicenseMock.mockResolvedValue({ activated: true });

    const result = await useCanvasStore
      .getState()
      .createNode('sticky', createRfInstance({ x: 0, y: 0, zoom: 1 }));

    expect(result).toMatch(NODE_ID_REGEX);
    expect(rpcCheckLicenseMock).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().nodes).toHaveLength(101);
  });

  it('allows creation when the boundary license check fails', async () => {
    fillFreeCardLimit();
    rpcCheckLicenseMock.mockRejectedValue(new Error('RPC unavailable'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await useCanvasStore
      .getState()
      .createNode('card', createRfInstance({ x: 0, y: 0, zoom: 1 }));

    expect(result).toMatch(NODE_ID_REGEX);
    expect(useCanvasStore.getState().nodes).toHaveLength(101);
    expect(consoleError).toHaveBeenCalledWith(
      '[License] Check failed:',
      expect.any(Error)
    );
  });

  it('creates a card node using the viewport center', async () => {
    vi.stubGlobal('window', {
      innerWidth: 1200,
      innerHeight: 900,
    });

    await useCanvasStore
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

  it('creates a folder node with localized default data', async () => {
    vi.stubGlobal('window', {
      innerWidth: 1000,
      innerHeight: 800,
    });

    await useCanvasStore
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

  it('creates a checklist widget node using the shared widget dimensions', async () => {
    vi.stubGlobal('window', {
      innerWidth: 1200,
      innerHeight: 900,
    });

    await useCanvasStore
      .getState()
      .createNode('checklist', createRfInstance({ x: 100, y: 50, zoom: 2 }));
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(node.id).toMatch(NODE_ID_REGEX);
    expect(node.type).toBe('widget');
    expect(node.position).toEqual({
      x: (600 - 100) / 2 - CANVAS_NODE_SPECS.checklist.size.width / 2,
      y: (450 - 50) / 2 - CANVAS_NODE_SPECS.checklist.size.height / 2,
    });
    expect(node.style).toEqual({
      width: CANVAS_NODE_SPECS.checklist.size.width,
      height: CANVAS_NODE_SPECS.checklist.size.height,
    });
    expect(node.data).toEqual({
      widgetId: '',
      kind: 'checklist',
    });
  });

  it('creates an image node with fixed initial color', async () => {
    vi.stubGlobal('window', {
      innerWidth: 900,
      innerHeight: 700,
    });

    await useCanvasStore
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

  it('creates a link node with provided URL metadata', async () => {
    vi.stubGlobal('window', {
      innerWidth: 900,
      innerHeight: 700,
    });
    const linkSize = CANVAS_NODE_SPECS.link.size;

    await useCanvasStore
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

  it('creates an asset node with provided attachment metadata', async () => {
    vi.stubGlobal('window', {
      innerWidth: 900,
      innerHeight: 700,
    });
    const assetSize = CANVAS_NODE_SPECS.asset.size;

    await useCanvasStore
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

  it('creates a sticky node with a random palette color', async () => {
    vi.stubGlobal('window', {
      innerWidth: 800,
      innerHeight: 600,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    await useCanvasStore
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

  it('creates a group node with a random color and localized label', async () => {
    vi.stubGlobal('window', {
      innerWidth: 1400,
      innerHeight: 1000,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    await useCanvasStore
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

  it('animates the viewport to the new node via setCenter', async () => {
    vi.stubGlobal('window', {
      innerWidth: 1200,
      innerHeight: 900,
    });
    const setCenter = vi.fn();
    const rf = {
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setCenter,
    } as unknown as ReactFlowInstance<any, any>;

    await useCanvasStore.getState().createNode('card', rf);
    const node = useCanvasStore.getState().nodes.at(-1)!;

    expect(setCenter).toHaveBeenCalledWith(
      node.position.x + CARD_W / 2,
      node.position.y + CARD_H / 2,
      { duration: 240, zoom: 1 }
    );
  });

  it('can force an explicitly recovered card to stay at the canvas root', async () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('group-1', {
          type: 'group',
          position: { x: 0, y: 0 },
          style: { height: 800, width: 1200 },
          data: { label: 'Existing group' },
        }),
      ],
    });

    const id = await useCanvasStore
      .getState()
      .createNode('card', createRfInstance({ x: 0, y: 0, zoom: 1 }), {
        canEnterGroup: false,
        data: { noteId: 'note-recovered', title: 'Recovered note' },
        focusViewport: false,
      });

    const node = useCanvasStore
      .getState()
      .nodes.find((candidate) => candidate.id === id);
    expect(node).toBeDefined();
    expect(node).not.toHaveProperty('parentId');
    expect(node?.data).toMatchObject({
      noteId: 'note-recovered',
      title: 'Recovered note',
    });
    expect(
      (node?.position.x ?? 0) >= 1220 ||
        (node?.position.y ?? 0) >= 820 ||
        (node ? node.position.x + CARD_W <= -20 : false) ||
        (node ? node.position.y + CARD_H <= -20 : false)
    ).toBe(true);
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
  it('preserves the canvas card dimensions for natural-size folder shelves', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('image-wide', {
          type: 'image',
          style: { width: 640, height: 360 },
          data: { title: 'Wide image', imageUrl: '', color: '#FFFFFF' },
        }),
        makeNode('folder', {
          type: 'folder',
          data: { title: '0 items', subtitle: '', children: [] },
        }),
      ],
    });

    useCanvasStore.getState().absorbCardIntoFolder('image-wide', 'folder');
    const folder = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === 'folder')!;

    expect(folder.data.children).toEqual([
      expect.objectContaining({
        id: 'image-wide',
        size: { width: 640, height: 360 },
      }),
    ]);
  });

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

  it('deletes the widget file for widget children', () => {
    rpcDeleteWidgetMock.mockClear();
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          data: {
            title: '1 items',
            subtitle: '',
            children: [
              {
                id: 'child-widget',
                type: 'widget',
                data: { widgetId: 'widget_folderchild', kind: 'checklist' },
              },
            ],
          },
        }),
      ],
    });

    useCanvasStore.getState().deleteFolderChild('folder', 'child-widget');

    const folder = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'folder')!;
    expect(folder.data.children as unknown[]).toHaveLength(0);
    expect(rpcDeleteWidgetMock).toHaveBeenCalledTimes(1);
    expect(rpcDeleteWidgetMock).toHaveBeenCalledWith('widget_folderchild');
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

  it('deletes the widget file for removed top-level widget nodes', () => {
    rpcDeleteWidgetMock.mockClear();
    useCanvasStore.setState({
      nodes: [
        makeWidgetNode('widget-node', 'widget_toplevel'),
        makeNode('card-keep'),
      ],
    });

    useCanvasStore.getState().deleteNodes(['widget-node']);

    const state = useCanvasStore.getState();
    expect(state.nodes.find((n) => n.id === 'widget-node')).toBeUndefined();
    expect(state.nodes.find((n) => n.id === 'card-keep')).toBeDefined();
    expect(rpcDeleteWidgetMock).toHaveBeenCalledTimes(1);
    expect(rpcDeleteWidgetMock).toHaveBeenCalledWith('widget_toplevel');
  });

  it('does not delete widget files when a folder with widget children is removed (children are detached)', () => {
    rpcDeleteWidgetMock.mockClear();
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          data: {
            title: '1 items',
            subtitle: '',
            children: [
              {
                id: 'child-widget',
                type: 'widget',
                data: { widgetId: 'widget_detached', kind: 'checklist' },
              },
            ],
          },
        }),
      ],
    });

    useCanvasStore.getState().deleteNodes(['folder']);

    // The widget child is detached onto the canvas, so its file must survive.
    const detached = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'child-widget');
    expect(detached).toMatchObject({
      type: 'widget',
      data: {
        widgetId: 'widget_detached',
        kind: 'checklist',
        detached: true,
      },
    });
    expect(rpcDeleteWidgetMock).not.toHaveBeenCalled();
  });
});

describe('canvasStore — moveFolderChildToCanvas', () => {
  it('restores a folder child with its preserved canvas dimensions', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          position: { x: 100, y: 120 },
          data: {
            title: 'Images',
            subtitle: '',
            children: [
              {
                id: 'child-wide',
                type: 'image',
                size: { width: 640, height: 360 },
                data: { title: 'Wide image', imageUrl: '', color: '#FFFFFF' },
              },
            ],
          },
        }),
      ],
    });

    useCanvasStore.getState().moveFolderChildToCanvas('folder', 'child-wide', {
      anchorCenter: { x: 600, y: 400 },
    });
    const restored = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === 'child-wide');

    expect(restored).toMatchObject({
      position: { x: 280, y: 220 },
      style: { width: 640, height: 360 },
    });
  });

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

  it('restores a legacy widget child to the canvas without deleting its backing record', () => {
    rpcDeleteWidgetMock.mockClear();
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          position: { x: 100, y: 120 },
          data: {
            title: 'Legacy productivity',
            subtitle: '',
            children: [
              {
                id: 'child-widget',
                type: 'widget',
                data: {
                  widgetId: 'widget_legacy_checklist',
                  kind: 'checklist',
                },
              },
            ],
          },
        }),
      ],
    });

    useCanvasStore
      .getState()
      .moveFolderChildToCanvas('folder', 'child-widget', {
        anchorCenter: { x: 500, y: 400 },
      });

    const state = useCanvasStore.getState();
    expect(
      state.nodes.find((node) => node.id === 'child-widget')
    ).toMatchObject({
      id: 'child-widget',
      type: 'widget',
      data: {
        widgetId: 'widget_legacy_checklist',
        kind: 'checklist',
      },
      selected: true,
    });
    expect(
      state.nodes.find((node) => node.id === 'folder')?.data
    ).toMatchObject({ children: [] });
    expect(rpcDeleteWidgetMock).not.toHaveBeenCalled();
  });

  it('restores an extension child without coercing it to a card', () => {
    useCanvasStore.setState({
      nodes: [
        makeNode('folder', {
          type: 'folder',
          position: { x: 100, y: 120 },
          data: {
            title: 'Extension content',
            subtitle: '',
            children: [
              {
                id: 'child-extension',
                type: 'extension',
                size: { width: 380, height: 360 },
                data: {
                  canvasTypeId: LINK_CANVAS_TYPE_ID,
                  instanceId: 'extinst_folder_link',
                },
              },
            ],
          },
        }),
      ],
    });

    useCanvasStore
      .getState()
      .moveFolderChildToCanvas('folder', 'child-extension', {
        anchorCenter: { x: 500, y: 400 },
      });

    const restored = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === 'child-extension');
    expect(restored).toMatchObject({
      id: 'child-extension',
      type: 'extension',
      data: {
        canvasTypeId: LINK_CANVAS_TYPE_ID,
        instanceId: 'extinst_folder_link',
      },
      position: { x: 310, y: 220 },
      style: { width: 380, height: 360 },
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

  it('pins a detached extension node back onto the canvas', () => {
    const nodes: Node[] = [
      {
        id: 'ext-1',
        type: 'extension',
        position: { x: 0, y: 0 },
        data: {
          canvasTypeId: LINK_CANVAS_TYPE_ID,
          instanceId: 'extinst_1',
          detached: true,
        },
      },
    ];
    useCanvasStore.setState({ nodes, _hydrated: true });

    useCanvasStore.getState().pinNoteToCanvas('ext-1', { x: 120, y: 80 });

    const node = useCanvasStore.getState().nodes.find((n) => n.id === 'ext-1')!;
    expect(node.position).toEqual({ x: 120, y: 80 });
    expect((node.data as any).detached).toBeUndefined();
    expect((node.data as any).canvasTypeId).toBe(LINK_CANVAS_TYPE_ID);
    expect((node.data as any).instanceId).toBe('extinst_1');
  });
});

describe('canvasStore — detachNoteFromCanvas', () => {
  beforeEach(() => {
    resetStore();
    registerBuiltinCanvasTypes();
  });

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

  it('detaches extension nodes whose type declares canDetach', () => {
    const nodes: Node[] = [
      {
        id: 'ext-1',
        type: 'extension',
        position: { x: 80, y: 40 },
        data: {
          canvasTypeId: LINK_CANVAS_TYPE_ID,
          instanceId: 'extinst_1',
        },
      },
    ];
    useCanvasStore.setState({
      nodes,
      edges: [{ id: 'e1', source: 'ext-1', target: 'card-2' }],
      _hydrated: true,
    });

    useCanvasStore.getState().detachNoteFromCanvas('ext-1');

    const node = useCanvasStore.getState().nodes.find((n) => n.id === 'ext-1')!;
    expect((node.data as any).detached).toBe(true);
    expect((node.data as any).canvasTypeId).toBe(LINK_CANVAS_TYPE_ID);
    expect((node.data as any).instanceId).toBe('extinst_1');
    expect(node.position).toEqual({ x: 0, y: 0 });
    expect(useCanvasStore.getState().edges).toHaveLength(0);
  });

  it('no-ops for recording extensions that do not declare canDetach', () => {
    const nodes: Node[] = [
      {
        id: 'ext-rec',
        type: 'extension',
        position: { x: 40, y: 40 },
        data: {
          canvasTypeId: RECORDING_CANVAS_TYPE_ID,
          instanceId: 'extinst_rec',
        },
      },
    ];
    useCanvasStore.setState({ nodes, _hydrated: true });

    useCanvasStore.getState().detachNoteFromCanvas('ext-rec');

    const node = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'ext-rec')!;
    expect((node.data as any).detached).toBeUndefined();
    expect(node.position).toEqual({ x: 40, y: 40 });
  });
});

describe('canvasStore — Topic tree transactions', () => {
  function makeTopic(id: string, title: string, x: number, y: number): Node {
    return {
      data: { ...createTopicData(title) },
      id,
      position: { x, y },
      style: { height: 40, width: 160 },
      type: 'topic',
    };
  }

  function makeTreeEdge(
    parentId: string,
    childId: string,
    order: number
  ): Edge {
    return buildTopicChildEdge(
      `topic-edge-${parentId}-${childId}`,
      parentId,
      childId,
      order
    );
  }

  /** Root with two children; the second child has one grandchild. */
  function seedTree() {
    useCanvasStore.setState({
      _hydrated: true,
      topicDraft: null,
      edges: [
        makeTreeEdge('root', 'kid-a', 0),
        makeTreeEdge('root', 'kid-b', 1),
        makeTreeEdge('kid-b', 'grandkid', 0),
      ],
      nodes: [
        makeTopic('root', 'Root', 0, 0),
        makeTopic('kid-a', 'A', 220, -40),
        makeTopic('kid-b', 'B', 220, 40),
        makeTopic('grandkid', 'B1', 440, 40),
      ],
    });
  }

  function treeEdgesOf(parentId: string) {
    return useCanvasStore
      .getState()
      .edges.filter(
        (e) => e.source === parentId && (e.data as any)?.kind === 'topic-child'
      )
      .map((e) => ({ order: (e.data as any).order, target: e.target }))
      .sort((a, b) => a.order - b.order);
  }

  beforeEach(() => {
    resetStore();
    unifiedUndoHistory.reset();
    unifiedUndoHistory.setContext('workspace-topic', 'default');
    getCachedLicenseMock.mockReturnValue({ activated: true });
  });

  afterEach(() => {
    resetStore();
    unifiedUndoHistory.reset();
  });

  it('commits a child draft as one undo step carrying node, edge, and layout', async () => {
    seedTree();
    const edgesBefore = useCanvasStore.getState().edges.length;

    expect(
      useCanvasStore.getState().beginTopicRelativeDraft('child', 'root')
    ).toBe(true);
    const id = await useCanvasStore.getState().commitTopicDraft('Third');
    expect(id).toBeDefined();

    const created = useCanvasStore.getState().nodes.find((n) => n.id === id)!;
    expect(created.data.title).toBe('Third');
    expect(useCanvasStore.getState().edges).toHaveLength(edgesBefore + 1);
    expect(treeEdgesOf('root').map((e) => e.target)).toEqual([
      'kid-a',
      'kid-b',
      id,
    ]);
    // The layout owns placement: the new child sits a level to the right of
    // its parent rather than at the provisional draft anchor.
    expect(created.position.x).toBeGreaterThan(0);
    expect(useCanvasStore.getState().topicDraft).toBeNull();

    // One press of undo must take the whole thing back, not just the edge.
    expect(useCanvasStore.getState().undo()).toBe(true);
    expect(useCanvasStore.getState().nodes.some((n) => n.id === id)).toBe(
      false
    );
    expect(useCanvasStore.getState().edges).toHaveLength(edgesBefore);
  });

  it('keeps order stable across a fast run of sibling commits', async () => {
    seedTree();

    const first = await (() => {
      useCanvasStore.getState().beginTopicRelativeDraft('sibling', 'kid-a');
      return useCanvasStore.getState().commitTopicDraft('One');
    })();
    useCanvasStore.getState().beginTopicRelativeDraft('sibling', first!);
    const second = await useCanvasStore.getState().commitTopicDraft('Two');
    useCanvasStore.getState().beginTopicRelativeDraft('sibling', second!);
    const third = await useCanvasStore.getState().commitTopicDraft('Three');

    // Each Enter lands immediately after its anchor, so the run reads in the
    // order it was typed and the pre-existing sibling is pushed down.
    expect(treeEdgesOf('root')).toEqual([
      { order: 0, target: 'kid-a' },
      { order: 1, target: first },
      { order: 2, target: second },
      { order: 3, target: third },
      { order: 4, target: 'kid-b' },
    ]);
    // Contiguous orders, and no sibling shares a vertical slot.
    const ys = ['kid-a', first, second, third, 'kid-b'].map(
      (id) =>
        useCanvasStore.getState().nodes.find((n) => n.id === id)!.position.y
    );
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(new Set(ys).size).toBe(ys.length);
  });

  it('commits a child when a nearby card occupies the tidy slot', async () => {
    seedTree();
    useCanvasStore.setState({
      nodes: [
        ...useCanvasStore.getState().nodes,
        {
          data: {},
          id: 'photo',
          position: { x: 224, y: 0 },
          style: { height: 400, width: 400 },
          type: 'card',
        },
      ],
    });

    expect(
      useCanvasStore.getState().beginTopicRelativeDraft('child', 'root')
    ).toBe(true);
    const id = await useCanvasStore.getState().commitTopicDraft('Beside photo');
    expect(id).toBeDefined();
    expect(useCanvasStore.getState().nodes.some((n) => n.id === id)).toBe(true);
    expect(useCanvasStore.getState().topicDraft).toBeNull();
  });

  it('keeps a child draft when the Group cannot hold the laid-out tree', async () => {
    useCanvasStore.setState({
      _hydrated: true,
      edges: [],
      nodes: [
        {
          data: {},
          id: 'g',
          position: { x: 0, y: 0 },
          style: { height: 80, width: 180 },
          type: 'group',
        },
        {
          ...makeTopic('root', 'Root', 4, 4),
          extent: 'parent',
          parentId: 'g',
        },
      ],
    });

    expect(
      useCanvasStore.getState().beginTopicRelativeDraft('child', 'root')
    ).toBe(true);
    const id = await useCanvasStore.getState().commitTopicDraft('Too wide');
    expect(id).toBeUndefined();
    expect(useCanvasStore.getState().topicDraft).not.toBeNull();
    expect(
      useCanvasStore.getState().nodes.filter((n) => n.type === 'topic')
    ).toHaveLength(1);
  });

  it('keeps a child draft when relayout would move a locked sibling', async () => {
    seedTree();
    useCanvasStore.setState({
      nodes: useCanvasStore
        .getState()
        .nodes.map((n) =>
          n.id === 'kid-a' ? { ...n, data: { ...n.data, locked: true } } : n
        ),
    });

    expect(
      useCanvasStore.getState().beginTopicRelativeDraft('child', 'root')
    ).toBe(true);
    const id = await useCanvasStore.getState().commitTopicDraft('Blocked');
    expect(id).toBeUndefined();
    expect(useCanvasStore.getState().topicDraft).not.toBeNull();
    expect(useCanvasStore.getState().nodes).toHaveLength(4);
  });

  it('refuses a sibling for a root and a child for a locked Topic', () => {
    seedTree();
    expect(
      useCanvasStore.getState().beginTopicRelativeDraft('sibling', 'root')
    ).toBe(false);
    expect(useCanvasStore.getState().topicDraft).toBeNull();

    useCanvasStore.setState({
      nodes: useCanvasStore
        .getState()
        .nodes.map((n) =>
          n.id === 'kid-b' ? { ...n, data: { ...n.data, locked: true } } : n
        ),
    });
    expect(
      useCanvasStore.getState().beginTopicRelativeDraft('child', 'kid-b')
    ).toBe(false);
    expect(useCanvasStore.getState().topicDraft).toBeNull();
  });

  it('deleting one Topic keeps its children where they are as new roots', () => {
    seedTree();
    const grandkidBefore = useCanvasStore
      .getState()
      .nodes.find((n) => n.id === 'grandkid')!.position;

    useCanvasStore.getState().deleteNodes(['kid-b']);

    const state = useCanvasStore.getState();
    expect(state.nodes.map((n) => n.id)).toEqual(['root', 'kid-a', 'grandkid']);
    expect(state.nodes.find((n) => n.id === 'grandkid')!.position).toEqual(
      grandkidBefore
    );
    // No dangling relation, and the surviving sibling's order closes the gap.
    expect(
      state.edges.some((e) => e.source === 'kid-b' || e.target === 'kid-b')
    ).toBe(false);
    expect(treeEdgesOf('root')).toEqual([{ order: 0, target: 'kid-a' }]);
  });

  it('deleteTopicBranch removes only the named subtree', () => {
    seedTree();

    useCanvasStore.getState().deleteTopicBranch('kid-b');

    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual([
      'root',
      'kid-a',
    ]);
    expect(treeEdgesOf('root')).toEqual([{ order: 0, target: 'kid-a' }]);

    expect(useCanvasStore.getState().undo()).toBe(true);
    expect(useCanvasStore.getState().nodes).toHaveLength(4);
    expect(useCanvasStore.getState().edges).toHaveLength(3);
  });

  it('detachTopicBranch cuts the parent relation but keeps the branch intact', () => {
    seedTree();
    const before = new Map(
      useCanvasStore.getState().nodes.map((n) => [n.id, n.position])
    );

    useCanvasStore.getState().detachTopicBranch('kid-b');

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(4);
    expect(treeEdgesOf('root')).toEqual([{ order: 0, target: 'kid-a' }]);
    // The branch keeps its own internal relation and its absolute position.
    expect(treeEdgesOf('kid-b')).toEqual([{ order: 0, target: 'grandkid' }]);
    for (const id of ['kid-b', 'grandkid']) {
      expect(state.nodes.find((n) => n.id === id)!.position).toEqual(
        before.get(id)
      );
    }
  });

  it('refuses a branch delete that would remove a locked Topic', () => {
    seedTree();
    useCanvasStore.setState({
      nodes: useCanvasStore
        .getState()
        .nodes.map((n) =>
          n.id === 'grandkid' ? { ...n, data: { ...n.data, locked: true } } : n
        ),
    });

    useCanvasStore.getState().deleteTopicBranch('kid-b');

    // Whole refusal: no partial removal that would strand the locked Topic.
    expect(useCanvasStore.getState().nodes).toHaveLength(4);
    expect(useCanvasStore.getState().edges).toHaveLength(3);
  });

  it('copies a partial branch without chaining it back to the original', async () => {
    seedTree();
    useCanvasStore.setState({
      nodes: useCanvasStore.getState().nodes.map((n) => ({
        ...n,
        selected: n.id === 'kid-b' || n.id === 'grandkid',
      })),
    });

    useCanvasStore.getState().copySelected();
    await useCanvasStore.getState().pasteClipboard();

    const state = useCanvasStore.getState();
    const pasted = state.nodes.filter((n) => PASTE_ID_RE.test(n.id));
    expect(pasted).toHaveLength(2);
    const pastedIds = new Set(pasted.map((n) => n.id));
    const pastedTreeEdges = state.edges.filter(
      (e) =>
        PASTE_EDGE_ID_RE.test(e.id) && (e.data as any)?.kind === 'topic-child'
    );
    // The copy keeps the relation that sits wholly inside the selection and
    // drops the parent edge that reached outside it, so the copy is its own
    // tree rather than a second branch of the original.
    expect(pastedTreeEdges).toHaveLength(1);
    const copied = pastedTreeEdges[0]!;
    expect(pastedIds.has(copied.source)).toBe(true);
    expect(pastedIds.has(copied.target)).toBe(true);
    expect(treeEdgesOf('root')).toEqual([
      { order: 0, target: 'kid-a' },
      { order: 1, target: 'kid-b' },
    ]);
  });

  it('treats tree edges as host-owned against generic edge commands', () => {
    seedTree();
    const edgeId = 'topic-edge-root-kid-a';

    useCanvasStore.getState().updateEdgeData(edgeId, { label: 'mine' });
    useCanvasStore.getState().setEditingEdgeId(edgeId);
    useCanvasStore.getState().deleteEdge(edgeId);

    const edge = useCanvasStore.getState().edges.find((e) => e.id === edgeId);
    expect(edge).toBeDefined();
    expect((edge?.data as any).label).toBeUndefined();
    expect(useCanvasStore.getState().editingEdgeId).toBeNull();
  });
});
