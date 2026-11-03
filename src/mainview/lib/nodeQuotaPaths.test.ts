import type { Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast };
});
vi.mock('@/lib/rpc-license', () => ({
  getCachedLicense: vi.fn(() => ({ activated: false })),
  refreshLicense: vi.fn(async () => ({ activated: false })),
}));

const { applyAIActions, countQuotaCountedCreates } = await import(
  '@/lib/ai/applyAIActions'
);
const { handleMarkdownImportResult } = await import(
  '@/lib/importMarkdownCards'
);
const { FREE_NODE_LIMIT } = await import('@/lib/nodeQuota');
const { useCanvasStore } = await import('@/store/canvasStore');
const { TOPIC_NODE_TYPE } = await import('../../shared/topic');

const makeNodes = (count: number, type = 'card'): Node[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${type}-${i}`,
    type,
    position: { x: i * 400, y: 0 },
    data: {},
  }));

const createCard = (tempId: string, x: number) => ({
  type: 'create_node' as const,
  tempId,
  nodeKind: 'card' as const,
  position: { x, y: 5000 },
  data: { title: tempId },
});

describe('free-tier quota is enforced on every bulk create path', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    useCanvasStore.getState().hydrate([], []);
  });

  it('markdown import refuses a batch that would exceed the limit', async () => {
    const placeNotes = vi.fn();
    const notes = [
      { noteId: 'n1', title: 'A' },
      { noteId: 'n2', title: 'B' },
    ];
    const placed = await handleMarkdownImportResult({ notes }, placeNotes, {
      getNodes: () => makeNodes(FREE_NODE_LIMIT - 1),
    });
    expect(placed).toBe(false);
    expect(placeNotes).not.toHaveBeenCalled();
  });

  it('markdown import counts existing topics toward the limit', async () => {
    const placeNotes = vi.fn();
    const nodes = [
      ...makeNodes(FREE_NODE_LIMIT - 1),
      ...makeNodes(1, TOPIC_NODE_TYPE),
    ];
    const placed = await handleMarkdownImportResult(
      { notes: [{ noteId: 'n1', title: 'A' }] },
      placeNotes,
      { getNodes: () => nodes }
    );
    expect(placed).toBe(false);
    expect(placeNotes).not.toHaveBeenCalled();
  });

  it('markdown import places the batch when it fits', async () => {
    const placeNotes = vi.fn();
    const notes = [{ noteId: 'n1', title: 'A' }];
    const placed = await handleMarkdownImportResult({ notes }, placeNotes, {
      getNodes: () => makeNodes(FREE_NODE_LIMIT - 1),
    });
    expect(placed).toBe(true);
    expect(placeNotes).toHaveBeenCalledWith(notes);
  });

  it('counts AI creates using the shared counted node types', () => {
    expect(
      countQuotaCountedCreates([
        createCard('a', 0),
        { ...createCard('b', 0), nodeKind: 'sticky' },
        { ...createCard('c', 0), nodeKind: 'group' },
      ])
    ).toBe(2);
  });

  it('AI batch apply counts topics and refuses over-limit batches', async () => {
    useCanvasStore.setState({
      nodes: [
        ...makeNodes(FREE_NODE_LIMIT - 2),
        ...makeNodes(1, TOPIC_NODE_TYPE),
      ],
    });
    const before = useCanvasStore.getState().nodes;
    const result = await applyAIActions(null, [
      createCard('a', 0),
      createCard('b', 400),
    ]);
    expect(result.applied).toBe(0);
    expect(result.warnings.join(' ')).toContain(String(FREE_NODE_LIMIT));
    expect(useCanvasStore.getState().nodes).toBe(before);
  });

  it('AI batch apply proceeds under the limit', async () => {
    useCanvasStore.setState({ nodes: makeNodes(3) });
    const result = await applyAIActions(null, [
      createCard('a', 0),
      createCard('b', 400),
    ]);
    expect(result.applied).toBe(2);
    expect(useCanvasStore.getState().nodes).toHaveLength(5);
  });
});
