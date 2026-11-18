// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const { closeFocusedView, openFocusedItem } = await import('./focusedItem');
const { registerFocusedClose } = await import('./focusedCloseRequest');
const { useCanvasStore } = await import('@/store/canvasStore');
const { openFocusedById } = await import('./canvasFocus');
const { revealShift, sidePanelLeft } = await import('./sidePanelGeometry');

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
});

it('routes external close requests through editor conflict handling', () => {
  useCanvasStore
    .getState()
    .setFocusedNode({ id: 'a', data: node.data, rect: new DOMRect() });
  const guardedClose = vi.fn();
  const unregister = registerFocusedClose('a', guardedClose);
  closeFocusedView();
  expect(guardedClose).toHaveBeenCalledOnce();
  expect(useCanvasStore.getState().focusedNode?.id).toBe('a');
  closeFocusedView(true);
  expect(useCanvasStore.getState().focusedNode).toBeNull();
  unregister();
});

it('opens with live data and refuses a deleted item', () => {
  useCanvasStore.getState().updateNodeData('a', { title: 'Current' });
  const opened = openFocusedItem({
    id: 'a',
    data: node.data,
    rect: new DOMRect(),
  });
  expect(opened).toBe(true);
  expect(useCanvasStore.getState().focusedNode?.data.title).toBe('Current');
  useCanvasStore.getState().setFocusedNode(null);
  useCanvasStore.setState({ nodes: [] });
  expect(
    openFocusedItem({ id: 'a', data: node.data, rect: new DOMRect() })
  ).toBe(false);
  expect(useCanvasStore.getState().focusedNode).toBeNull();
});

it('opening another card replaces the open one and consults the departure guard', () => {
  useCanvasStore
    .getState()
    .hydrate([node, { ...node, id: 'b', data: { title: 'B' } }], []);
  openFocusedItem({ id: 'a', data: {}, rect: new DOMRect() });
  let deferredLeave: (() => void) | undefined;
  const unregister = registerFocusedClose('a', (leave) => {
    deferredLeave = leave;
  });
  expect(openFocusedItem({ id: 'b', data: {}, rect: new DOMRect() })).toBe(
    false
  );
  expect(useCanvasStore.getState().focusedNode?.id).toBe('a');
  deferredLeave?.();
  expect(useCanvasStore.getState().focusedNode?.id).toBe('b');
  unregister();
});

it('closing resets full-screen writing and pin state; switching exits lightbox', () => {
  useCanvasStore.getState().hydrate(
    [
      { ...node, id: 'img', type: 'image', data: {} },
      { ...node, id: 'b', type: 'card', data: { title: 'B' } },
    ],
    []
  );
  openFocusedItem({ id: 'img', type: 'image', data: {}, rect: new DOMRect() });
  useCanvasStore.getState().setFocusedMode('lightbox');
  useCanvasStore.getState().setPanelPinned(true);
  openFocusedItem({ id: 'b', type: 'card', data: {}, rect: new DOMRect() });
  expect(useCanvasStore.getState().focusedMode).toBe('panel');
  expect(useCanvasStore.getState().panelPinned).toBe(true);
  useCanvasStore.getState().setFocusedMode('fullscreen');
  closeFocusedView(true);
  expect(useCanvasStore.getState().focusedMode).toBe('panel');
  expect(useCanvasStore.getState().panelPinned).toBe(false);
});

it('opens folder children from the folder, not the canvas', () => {
  const folder = {
    ...node,
    id: 'f',
    type: 'folder',
    data: { children: [{ id: 'c', type: 'card', data: { title: 'Child' } }] },
  };
  useCanvasStore.getState().hydrate([folder], []);
  expect(
    openFocusedItem({ id: 'c', folderId: 'f', data: {}, rect: new DOMRect() })
  ).toBe(true);
  expect(useCanvasStore.getState().focusedNode?.data.title).toBe('Child');
});

it('opens a card from the library at once', async () => {
  await openFocusedById({ nodeId: 'a', rfInstance: null });
  expect(useCanvasStore.getState().focusedNode?.id).toBe('a');
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

it('reveals a card the panel covers, and leaves a visible one alone', () => {
  const viewport = { width: 1440, height: 900 };
  const panelLeft = sidePanelLeft(viewport.width);
  expect(
    revealShift({ left: 100, top: 100, right: 400, bottom: 300 }, viewport)
  ).toBeNull();
  const shift = revealShift(
    { left: panelLeft - 100, top: 100, right: panelLeft + 200, bottom: 300 },
    viewport
  );
  expect(shift?.dy).toBe(0);
  expect((shift?.dx ?? 0) < 0).toBe(true);
  expect(panelLeft - 100 + (shift?.dx ?? 0) + 300).toBeLessThanOrEqual(
    panelLeft - 32
  );
});
