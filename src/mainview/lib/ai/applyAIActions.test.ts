import type { Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';

import { applyAIActions } from './applyAIActions';

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

vi.mock('../../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
}));

function makeNode(id: string, overrides?: Partial<Node>): Node {
  return {
    id,
    type: 'card',
    position: { x: 0, y: 0 },
    data: { title: 'Seed', content: 'seed body', color: '#FFFFFF' },
    ...overrides,
  };
}

function createRfInstance(): ReactFlowInstance<any, any> {
  return {
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  } as ReactFlowInstance<any, any>;
}

function seedNodes(nodes: Node[]): void {
  useCanvasStore.setState({ nodes, edges: [] });
}

beforeEach(() => {
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 });
});

afterEach(() => {
  useCanvasStore.getState().reset();
  vi.unstubAllGlobals();
});

describe('applyAIActions — validation', () => {
  it('rejects malformed actions without touching the store', async () => {
    seedNodes([makeNode('node-a')]);
    const result = await applyAIActions(createRfInstance(), [
      { type: 'create_node' }, // missing tempId/nodeKind/position/data
      42,
      null,
    ]);
    expect(result.applied).toBe(0);
    expect(result.createdNodeIds).toEqual([]);
    expect(result.warnings.length).toBe(3);
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });

  it('returns zero applied for an empty action list', async () => {
    seedNodes([makeNode('node-a')]);
    const result = await applyAIActions(createRfInstance(), []);
    expect(result).toEqual({ applied: 0, createdNodeIds: [], warnings: [] });
  });
});

describe('applyAIActions — fast path', () => {
  it('delegates a single create_node to the store create flow', async () => {
    seedNodes([makeNode('node-a', { position: { x: 0, y: 0 } })]);
    const result = await applyAIActions(createRfInstance(), [
      {
        type: 'create_node',
        tempId: 'summary-card',
        nodeKind: 'card',
        position: { x: 800, y: 0 },
        data: {
          type: 'text',
          title: 'AI Summary',
          content: '**theme**\n\n- point one',
        },
      },
    ]);

    expect(result.applied).toBe(1);
    expect(result.createdNodeIds).toHaveLength(1);
    const { nodes } = useCanvasStore.getState();
    expect(nodes).toHaveLength(2);
    const created = nodes.find((n) => n.id === result.createdNodeIds[0]);
    expect(created?.type).toBe('card');
    expect((created?.data as Record<string, unknown>).title).toBe('AI Summary');
    // Registry defaults survive under the AI-provided data.
    expect((created?.data as Record<string, unknown>).color).toBe('#FFFFFF');
  });
});

describe('applyAIActions — batch path', () => {
  it('applies mixed actions and takes exactly one undo snapshot', async () => {
    seedNodes([
      makeNode('node-a', { position: { x: 0, y: 0 } }),
      makeNode('node-b', { position: { x: 0, y: 600 } }),
    ]);

    const result = await applyAIActions(null, [
      {
        type: 'create_node',
        tempId: 'new-sticky',
        nodeKind: 'sticky',
        position: { x: 800, y: 0 },
        data: { content: 'New idea' },
      },
      {
        type: 'update_node',
        nodeId: 'node-a',
        updates: { title: 'Renamed by AI' },
      },
      {
        type: 'move_node',
        nodeId: 'node-b',
        position: { x: 40, y: 640 },
      },
      {
        type: 'create_edge',
        source: 'node-a',
        target: 'new-sticky',
        label: 'leads to',
      },
    ]);

    expect(result.applied).toBe(4);
    expect(result.createdNodeIds).toHaveLength(1);
    expect(result.warnings).toEqual([]);

    const { nodes, edges } = useCanvasStore.getState();
    expect(nodes).toHaveLength(3);
    const updated = nodes.find((n) => n.id === 'node-a');
    expect((updated?.data as Record<string, unknown>).title).toBe(
      'Renamed by AI'
    );
    // Original fields survive a partial update.
    expect((updated?.data as Record<string, unknown>).content).toBe(
      'seed body'
    );
    const moved = nodes.find((n) => n.id === 'node-b');
    expect(moved?.position).toEqual({ x: 40, y: 640 });
    const sticky = nodes.find((n) => n.id === result.createdNodeIds[0]);
    expect(sticky?.type).toBe('sticky');
    expect(edges).toHaveLength(1);
    const edge = edges[0];
    expect(edge?.source).toBe('node-a');
    expect(edge?.target).toBe(result.createdNodeIds[0]);
    expect((edge?.data as Record<string, unknown>).label).toBe('leads to');
    expect(edge?.type).toBe('labeledEdge');

    // One batch = one undo step restores the exact previous board.
    useCanvasStore.getState().undo();
    const restored = useCanvasStore.getState();
    expect(restored.nodes).toHaveLength(2);
    expect(restored.edges).toHaveLength(0);
    expect(restored.nodes.find((n) => n.id === 'node-a')?.position).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('creates a group around existing children and reparents them', async () => {
    seedNodes([
      makeNode('node-a', { position: { x: 100, y: 100 } }),
      makeNode('node-b', { position: { x: 500, y: 400 } }),
    ]);

    const result = await applyAIActions(null, [
      {
        type: 'create_group',
        tempId: 'grp',
        label: 'Launch cluster',
        childIds: ['node-a', 'node-b'],
      },
    ]);

    expect(result.applied).toBe(1);
    const { nodes } = useCanvasStore.getState();
    const group = nodes.find((n) => n.type === 'group');
    expect(group).toBeDefined();
    expect((group?.data as Record<string, unknown>).label).toBe(
      'Launch cluster'
    );
    for (const childId of ['node-a', 'node-b']) {
      const child = nodes.find((n) => n.id === childId);
      expect(child?.parentId).toBe(group?.id);
      expect(child?.extent).toBe('parent');
    }
  });

  it('skips unresolvable actions with warnings and applies the rest', async () => {
    seedNodes([
      makeNode('node-a', { position: { x: 0, y: 0 } }),
      makeNode('node-child', { parentId: 'node-a', extent: 'parent' }),
    ]);

    const result = await applyAIActions(null, [
      { type: 'update_node', nodeId: 'ghost-node', updates: { title: 'X' } },
      { type: 'move_node', nodeId: 'node-child', position: { x: 5, y: 5 } },
      { type: 'create_edge', source: 'node-a', target: 'node-a' },
      {
        type: 'update_node',
        nodeId: 'node-a',
        updates: { title: 'Still applied' },
      },
    ]);

    expect(result.applied).toBe(1);
    expect(result.warnings).toHaveLength(3);
    const { nodes } = useCanvasStore.getState();
    expect(
      (nodes.find((n) => n.id === 'node-a')?.data as Record<string, unknown>)
        .title
    ).toBe('Still applied');
  });

  it('resolves tempIds across create_node and create_group in one batch', async () => {
    seedNodes([makeNode('node-a', { position: { x: 0, y: 0 } })]);

    const result = await applyAIActions(null, [
      {
        type: 'create_node',
        tempId: 'fresh',
        nodeKind: 'card',
        position: { x: 900, y: 0 },
        data: { title: 'Fresh card' },
      },
      {
        type: 'create_group',
        tempId: 'grp',
        label: 'Bundle',
        childIds: ['fresh', 'node-a'],
      },
    ]);

    expect(result.applied).toBe(2);
    const { nodes } = useCanvasStore.getState();
    const group = nodes.find((n) => n.type === 'group');
    const fresh = nodes.find(
      (n) => (n.data as Record<string, unknown>).title === 'Fresh card'
    );
    expect(fresh?.parentId).toBe(group?.id);
  });
});
