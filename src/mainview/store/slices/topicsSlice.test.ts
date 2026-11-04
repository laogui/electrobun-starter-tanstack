// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast };
});
// These suites exercise the free-tier gate, which the slim release turns off.
vi.mock('@/lib/productScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/productScope')>()),
  LICENSE_QUOTA_ENABLED: true,
}));
vi.mock('@/lib/rpc-license', () => ({
  getCachedLicense: vi.fn(() => ({ activated: false })),
  refreshLicense: vi.fn(async () => ({ activated: false })),
}));

const { FREE_NODE_LIMIT } = await import('@/lib/nodeQuota');
const { useCanvasStore } = await import('@/store/canvasStore');
const { isTopicTreeEdge, TOPIC_NODE_TYPE } = await import(
  '../../../shared/topic'
);

const state = () => useCanvasStore.getState();
const topics = () => state().nodes.filter((n) => n.type === TOPIC_NODE_TYPE);
const treeEdges = () => state().edges.filter((edge) => isTopicTreeEdge(edge));
const titleOf = (id: string) =>
  state().nodes.find((n) => n.id === id)?.data.title;

async function createRoot(title: string): Promise<string> {
  state().beginTopicDraft(null, { anchor: { x: 0, y: 0 } });
  const id = await state().commitTopicDraft(title);
  if (!id) {
    throw new Error(`root ${title} was not committed`);
  }
  return id;
}

async function createRelative(
  kind: 'child' | 'sibling',
  anchorId: string,
  title: string
): Promise<string> {
  if (!state().beginTopicRelativeDraft(kind, anchorId)) {
    throw new Error(`${kind} draft refused for ${anchorId}`);
  }
  const id = await state().commitTopicDraft(title);
  if (!id) {
    throw new Error(`${kind} ${title} was not committed`);
  }
  return id;
}

describe('topicsSlice', () => {
  beforeEach(() => {
    state().reset();
  });

  it('a draft renders without entering the graph or history', () => {
    state().beginTopicDraft(null, { anchor: { x: 10, y: 20 } });
    expect(state().topicDraft).toMatchObject({
      anchor: { x: 10, y: 20 },
      text: '',
      viewId: 'default',
    });
    state().setTopicDraftText('typing');
    expect(state().topicDraft?.text).toBe('typing');
    expect(state().nodes).toEqual([]);
    expect(state().canUndo()).toBe(false);

    state().cancelTopicDraft();
    expect(state().topicDraft).toBeNull();
  });

  it('commits a non-empty title as one Topic and one undo step', async () => {
    state().beginTopicDraft(null, { anchor: { x: 0, y: 0 } });
    expect(await state().commitTopicDraft('   ')).toBeUndefined();
    expect(state().topicDraft).not.toBeNull();

    const id = await state().commitTopicDraft('  Plan  ');
    expect(id).toBeDefined();
    expect(topics()).toHaveLength(1);
    expect(titleOf(id!)).toBe('Plan');
    expect(state().topicDraft).toBeNull();
    expect(state().topicCommandContextId).toBe(id);

    state().undo();
    expect(topics()).toHaveLength(0);
  });

  it('builds ordered tree relations for children and siblings', async () => {
    const root = await createRoot('Root');
    const first = await createRelative('child', root, 'First');
    const second = await createRelative('sibling', first, 'Second');
    const between = await createRelative('sibling', first, 'Between');

    const children = treeEdges()
      .filter((edge) => edge.source === root)
      .sort((a, b) => Number(a.data?.order ?? 0) - Number(b.data?.order ?? 0))
      .map((edge) => edge.target);
    expect(children).toEqual([first, between, second]);
  });

  it('refuses a sibling for a root and a relative draft for a locked Topic', async () => {
    const root = await createRoot('Root');
    expect(state().beginTopicRelativeDraft('sibling', root)).toBe(false);

    state().toggleNodeLocked(root);
    expect(state().beginTopicRelativeDraft('child', root)).toBe(false);
    expect(state().topicDraft).toBeNull();
  });

  it('deletes a whole branch as one transaction', async () => {
    const root = await createRoot('Root');
    const child = await createRelative('child', root, 'Child');
    await createRelative('child', child, 'Grandchild');
    await createRelative('sibling', child, 'Sibling');
    expect(topics()).toHaveLength(4);

    state().deleteTopicBranch(child);
    expect(
      topics()
        .map((n) => n.data.title)
        .sort()
    ).toEqual(['Root', 'Sibling']);
    expect(treeEdges()).toHaveLength(1);

    state().undo();
    expect(topics()).toHaveLength(4);
  });

  it('detaching a branch cuts only its parent relation', async () => {
    const root = await createRoot('Root');
    const child = await createRelative('child', root, 'Child');
    const grandchild = await createRelative('child', child, 'Grandchild');

    state().detachTopicBranch(child);

    expect(treeEdges().map((edge) => [edge.source, edge.target])).toEqual([
      [child, grandchild],
    ]);
    expect(topics()).toHaveLength(3);
  });

  it('renames through commitTopicTitle and ignores an empty title', async () => {
    const root = await createRoot('Root');
    state().commitTopicTitle(root, 'Renamed');
    expect(titleOf(root)).toBe('Renamed');
    state().commitTopicTitle(root, '   ');
    expect(titleOf(root)).toBe('Renamed');
  });

  it('keeps the draft when the free quota refuses the commit', async () => {
    const full: Node[] = Array.from({ length: FREE_NODE_LIMIT }, (_, i) => ({
      data: { title: `n${i}` },
      id: `n${i}`,
      position: { x: i * 400, y: 0 },
      type: 'card',
    }));
    useCanvasStore.setState({ nodes: full });

    state().beginTopicDraft(null, { anchor: { x: 0, y: 5000 } });
    expect(await state().commitTopicDraft('Over quota')).toBeUndefined();
    expect(state().topicDraft).not.toBeNull();
    expect(topics()).toHaveLength(0);
  });

  it('discards a commit that resolves after a view switch', async () => {
    state().beginTopicDraft(null, { anchor: { x: 0, y: 0 } });
    const pending = state().commitTopicDraft('Late');
    state().setActiveView('other');
    expect(await pending).toBeUndefined();
    expect(state().nodes).toEqual([]);
  });

  it('follows explicit selection changes for the Topic command context', async () => {
    const root = await createRoot('Root');
    state().exitTopicCommandContext();
    expect(state().topicCommandContextId).toBeNull();

    state().setNodes((nodes) => nodes.map((n) => ({ ...n, selected: false })));
    state().setNodes((nodes) =>
      nodes.map((n) => (n.id === root ? { ...n, selected: true } : n))
    );
    expect(state().topicCommandContextId).toBe(root);

    state().deselectAll();
    expect(state().topicCommandContextId).toBeNull();
  });

  it('live-resizes a Topic while editing without touching history', async () => {
    const root = await createRoot('Root');
    const before = state().canUndo();
    state().setTopicEditPreview(root, 'A much longer title being typed');
    expect(state().topicEditPreviews[root]).toBeDefined();
    expect(state().canUndo()).toBe(before);

    state().resetTopicEditPreview(root);
    expect(state().topicEditPreviews[root]).toBeUndefined();
  });
});
