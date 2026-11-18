import type { Node } from '@xyflow/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
const { applyAIActions } = await import('./applyAIActions');
const { useCanvasStore } = await import('@/store/canvasStore');
const card: Node = {
  id: 'a',
  type: 'card',
  position: { x: 0, y: 0 },
  data: { title: 'Original', noteId: 'note-original', blocknoteRevision: 3 },
};
beforeEach(() => {
  useCanvasStore.getState().reset();
  useCanvasStore.getState().hydrate([card], []);
});
it('never applies identity, revision, container or lock fields from model output', async () => {
  const result = await applyAIActions(null, [
    {
      type: 'update_node',
      nodeId: 'a',
      updates: {
        title: 'Allowed',
        noteId: 'foreign',
        blocknoteRevision: 100,
        children: [],
        locked: true,
      },
    },
  ]);
  expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
    noteId: 'note-original',
    blocknoteRevision: 3,
  });
  expect(useCanvasStore.getState().nodes[0]?.data).not.toHaveProperty('locked');
  expect(result.warnings.length).toBeGreaterThan(0);
});
it('does not create an undo step for an empty or unchanged batch', async () => {
  expect(
    (
      await applyAIActions(null, [
        { type: 'update_node', nodeId: 'missing', updates: { title: 'x' } },
        { type: 'move_node', nodeId: 'a', position: { x: 0, y: 0 } },
      ])
    ).applied
  ).toBe(0);
  expect(useCanvasStore.getState().canUndo()).toBe(false);
});
it('rejects all actions when Topic writes are paused', async () => {
  useCanvasStore.setState({ topicWritePaused: true });
  expect(
    (
      await applyAIActions(null, [
        { type: 'move_node', nodeId: 'a', position: { x: 500, y: 0 } },
      ])
    ).applied
  ).toBe(0);
  expect(useCanvasStore.getState().nodes[0]?.position.x).toBe(0);
});
it('protects locked nodes and creates only one history step for a valid batch', async () => {
  useCanvasStore.setState({
    nodes: [
      card,
      { ...card, id: 'locked', data: { locked: true, title: 'Locked' } },
    ],
  });
  const result = await applyAIActions(null, [
    { type: 'update_node', nodeId: 'locked', updates: { title: 'Changed' } },
    { type: 'move_node', nodeId: 'a', position: { x: 400, y: 0 } },
  ]);
  expect(result.applied).toBe(1);
  expect(useCanvasStore.getState().nodes[1]?.data.title).toBe('Locked');
  expect(useCanvasStore.getState()._undoRedo.past).toHaveLength(1);
  useCanvasStore.getState().undo();
  expect(useCanvasStore.getState().nodes[0]?.position.x).toBe(0);
});
