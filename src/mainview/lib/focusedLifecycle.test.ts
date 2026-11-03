// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const callbacks = vi.hoisted(() => ({
  open: [] as Array<() => void>,
  close: [] as Array<() => void>,
}));
vi.mock(
  '@/components/canvas/focusTransition/viewTransitionController',
  async (original) => ({
    ...(await original<
      typeof import('@/components/canvas/focusTransition/viewTransitionController')
    >()),
    openWithViewTransition: (update: () => void) => callbacks.open.push(update),
    closeWithViewTransition: (update: () => void) =>
      callbacks.close.push(update),
  })
);
const { runFocusTransition, closeFocusedViewWithTransition } = await import(
  '@/components/canvas/focusTransition/runFocusTransition'
);
const { registerFocusedClose } = await import('./focusedCloseRequest');
const { useCanvasStore } = await import('@/store/canvasStore');
const { openFocusedById } = await import('./canvasFocus');
const node = {
  id: 'a',
  type: 'card',
  position: { x: 0, y: 0 },
  data: { title: 'Original' },
};
beforeEach(() => {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  useCanvasStore.getState().reset();
  useCanvasStore.getState().hydrate([node], []);
  callbacks.open = [];
  callbacks.close = [];
});
it('routes external close requests through editor conflict handling', () => {
  useCanvasStore
    .getState()
    .setFocusedNode({ id: 'a', data: node.data, rect: new DOMRect() });
  const guardedClose = vi.fn();
  const unregister = registerFocusedClose('a', guardedClose);
  closeFocusedViewWithTransition();
  expect(guardedClose).toHaveBeenCalledOnce();
  expect(callbacks.close).toHaveLength(0);
  expect(useCanvasStore.getState().focusedNode?.id).toBe('a');
  unregister();
});
it('a delayed open cannot resurrect an item in another canvas', () => {
  runFocusTransition(
    () =>
      useCanvasStore
        .getState()
        .setFocusedNode({ id: 'a', data: node.data, rect: new DOMRect() }),
    { direction: 'open', source: null }
  );
  useCanvasStore.getState().setActiveView('other');
  useCanvasStore.getState().hydrate([node], []);
  callbacks.open[0]!();
  expect(useCanvasStore.getState().focusedNode).toBeNull();
});
it('a delayed open refreshes live data and refuses a deleted item', () => {
  const update = () =>
    useCanvasStore
      .getState()
      .setFocusedNode({ id: 'a', data: node.data, rect: new DOMRect() });
  runFocusTransition(update, { direction: 'open', source: null });
  useCanvasStore.getState().updateNodeData('a', { title: 'Current' });
  callbacks.open[0]!();
  expect(useCanvasStore.getState().focusedNode?.data.title).toBe('Current');
  runFocusTransition(update, { direction: 'open', source: null });
  useCanvasStore.setState({ nodes: [] });
  callbacks.open[1]!();
  expect(useCanvasStore.getState().focusedNode).toBeNull();
});
it('a delayed close does not close a different item', () => {
  useCanvasStore
    .getState()
    .setFocusedNode({ id: 'a', data: {}, rect: new DOMRect() });
  closeFocusedViewWithTransition(true);
  useCanvasStore
    .getState()
    .setFocusedNode({ id: 'b', data: {}, rect: new DOMRect() });
  callbacks.close[0]!();
  expect(useCanvasStore.getState().focusedNode?.id).toBe('b');
});
it('a delayed close cannot close a newly reopened session of the same item', () => {
  const item = { id: 'a', data: {}, rect: new DOMRect() };
  useCanvasStore.getState().setFocusedNode(item);
  closeFocusedViewWithTransition(true);
  useCanvasStore.getState().setFocusedNode(null);
  useCanvasStore.getState().setFocusedNode(item);
  callbacks.close[0]!();
  expect(useCanvasStore.getState().focusedNode).toBe(item);
});
it('only the latest pending folder navigation can open', async () => {
  vi.useFakeTimers();
  const folder = { ...node, type: 'folder', data: { children: [] } };
  useCanvasStore.getState().hydrate([folder, { ...folder, id: 'b' }], []);
  const older = openFocusedById({
    nodeId: 'a',
    rfInstance: null,
    centerDurationMs: 1000,
  });
  const newer = openFocusedById({
    nodeId: 'b',
    rfInstance: null,
    centerDurationMs: 0,
  });
  await vi.runAllTimersAsync();
  await Promise.all([older, newer]);
  expect(useCanvasStore.getState().focusedFolder?.id).toBe('b');
  vi.useRealTimers();
});
it('a pending folder pan cannot reopen a folder after a view switch', async () => {
  vi.useFakeTimers();
  useCanvasStore
    .getState()
    .hydrate([{ ...node, type: 'folder', data: { children: [] } }], []);
  const pending = openFocusedById({
    nodeId: 'a',
    rfInstance: null,
    centerDurationMs: 0,
  });
  useCanvasStore.getState().setActiveView('elsewhere');
  await vi.runAllTimersAsync();
  await pending;
  expect(useCanvasStore.getState().focusedFolder).toBeNull();
  vi.useRealTimers();
});
