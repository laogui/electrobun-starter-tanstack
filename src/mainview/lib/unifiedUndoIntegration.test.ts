// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionInstanceRecord } from '../../shared/extensions/instance';

// Debounced store saves must never reach a real host.
vi.mock('@/lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rpc')>()),
  rpcUpdateExtensionInstance: vi.fn(async () => ({ success: true })),
}));

const { routeUndoRedo } = await import('@/lib/routeUndoRedo');
const { unifiedUndoHistory } = await import('@/lib/unifiedUndoHistory');
const { useCanvasStore } = await import('@/store/canvasStore');
const { useExtensionInstanceStore } = await import(
  '@/store/extensionInstanceStore'
);

const card = (id: string, title: string): Node => ({
  id,
  type: 'card',
  position: { x: 0, y: 0 },
  data: { title },
});

const instance = (state: unknown): ExtensionInstanceRecord => ({
  appVersion: '1.0.0',
  canvasTypeId: 'test.counter',
  createdAt: 'Thu 2026-01-01 8:00 AM (UTC+08:00)',
  dataVersion: 1,
  id: 'inst-1',
  presentation: { title: 'Counter' },
  revision: 1,
  schema: 'ghostboard-extension-instance/v1',
  state,
  updatedAt: 'Thu 2026-01-01 8:00 AM (UTC+08:00)',
});

const cardTitle = () => useCanvasStore.getState().nodes[0]?.data.title;
const instanceState = () => {
  const record = useExtensionInstanceStore.getState().records['inst-1'];
  return record && 'state' in record ? record.state : undefined;
};
const setCount = (count: number) =>
  useExtensionInstanceStore
    .getState()
    .updateState('inst-1', { history: 'record', state: { count } });
const settle = () =>
  vi.waitFor(() => {
    if (unifiedUndoHistory.getSnapshot().pending) {
      throw new Error('history transition still pending');
    }
  });

describe('unified undo across canvas and extension stores', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    unifiedUndoHistory.reset();
    unifiedUndoHistory.setNativeView('view-1');
    useCanvasStore.setState({
      activeViewId: 'view-1',
      nodes: [card('a', 'c0')],
    });
    useExtensionInstanceStore.setState({
      history: {},
      records: { 'inst-1': instance({ count: 0 }) },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Cmd+Z on the canvas undoes the most recent edit whatever its store', async () => {
    useCanvasStore.getState().commitNodeData('a', { title: 'c1' });
    await setCount(1);
    useCanvasStore.getState().commitNodeData('a', { title: 'c2' });
    expect(
      unifiedUndoHistory.getSnapshot().past.map((entry) => entry.kind)
    ).toEqual(['canvas', 'extension-instance', 'canvas']);

    routeUndoRedo('undo');
    await settle();
    expect(cardTitle()).toBe('c1');

    routeUndoRedo('undo');
    await settle();
    expect(instanceState()).toEqual({ count: 0 });
    expect(cardTitle()).toBe('c1');

    routeUndoRedo('undo');
    await settle();
    expect(cardTitle()).toBe('c0');

    for (let i = 0; i < 3; i++) {
      routeUndoRedo('redo');
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await settle();
    }
    expect(cardTitle()).toBe('c2');
    expect(instanceState()).toEqual({ count: 1 });
    expect(unifiedUndoHistory.getSnapshot().future).toEqual([]);
  });

  it('a focused instance keeps local ownership and the timeline follows it', async () => {
    await setCount(1);
    useCanvasStore.getState().commitNodeData('a', { title: 'c1' });
    await setCount(2);

    useCanvasStore.setState({
      focusedNode: {
        data: { canvasTypeId: 'test.counter', instanceId: 'inst-1' },
        id: 'extension-node',
        rect: new DOMRect(),
        type: 'extension',
      },
    });
    expect(routeUndoRedo('undo')).toBe(true);
    expect(instanceState()).toEqual({ count: 1 });
    expect(cardTitle()).toBe('c1');

    // Leaving the instance: the next undo reverts the canvas edit.
    useCanvasStore.setState({ focusedNode: null });
    routeUndoRedo('undo');
    await settle();
    expect(cardTitle()).toBe('c0');
    expect(instanceState()).toEqual({ count: 1 });

    routeUndoRedo('undo');
    await settle();
    expect(instanceState()).toEqual({ count: 0 });
  });

  it('a canvas edit discards the extension redo branch', async () => {
    await setCount(1);
    useExtensionInstanceStore.getState().undoInstance('inst-1');
    useCanvasStore.getState().commitNodeData('a', { title: 'branch' });
    expect(useExtensionInstanceStore.getState().redoInstance('inst-1')).toBe(
      false
    );
    expect(
      unifiedUndoHistory.getSnapshot().past.map((entry) => entry.kind)
    ).toEqual(['canvas']);
  });

  it('an instance edit discards the canvas redo branch', async () => {
    useCanvasStore.getState().commitNodeData('a', { title: 'c1' });
    useCanvasStore.getState().undo();
    await setCount(5);
    expect(useCanvasStore.getState().redo()).toBe(false);
    expect(cardTitle()).toBe('c0');
  });

  it('undo refreshes focused data and clears focus when its node disappears', () => {
    useCanvasStore.setState({
      focusedNode: {
        id: 'a',
        type: 'card',
        data: { title: 'c0' },
        rect: new DOMRect(),
      },
    });
    useCanvasStore.getState().commitNodeData('a', { title: 'c1' });
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().focusedNode?.data.title).toBe('c0');
    useCanvasStore.getState().saveSnapshot();
    useCanvasStore.setState({
      nodes: [card('new', 'new')],
      focusedNode: {
        id: 'new',
        type: 'card',
        data: { title: 'new' },
        rect: new DOMRect(),
      },
    });
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().focusedNode).toBeNull();
  });

  it('leaves keyboard undo to a focused text editor', () => {
    useCanvasStore.getState().commitNodeData('a', { title: 'c1' });
    document.body.innerHTML = '<div contenteditable="true" id="editor"></div>';
    const editor = document.querySelector<HTMLElement>('#editor');
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(editor, 'isContentEditable', { value: true });
    editor?.setAttribute('tabindex', '0');
    editor?.focus();
    expect(document.activeElement).toBe(editor);

    expect(routeUndoRedo('undo', { fromKeyboard: true })).toBe(false);
    expect(cardTitle()).toBe('c1');
    expect(unifiedUndoHistory.getSnapshot().past).toHaveLength(1);
  });

  it('re-hydrating an instance drops its unreachable entries', async () => {
    useCanvasStore.getState().commitNodeData('a', { title: 'c1' });
    await setCount(1);

    useExtensionInstanceStore
      .getState()
      .hydrate({ 'inst-1': instance({ count: 9 }) });
    expect(
      unifiedUndoHistory.getSnapshot().past.map((entry) => entry.kind)
    ).toEqual(['canvas']);

    routeUndoRedo('undo');
    await settle();
    expect(cardTitle()).toBe('c0');
    expect(instanceState()).toEqual({ count: 9 });
  });
});

it('canvas undo preserves current shared note body and revision outside snapshots', () => {
  useCanvasStore.getState().reset();
  useCanvasStore.getState().hydrate([card('a', 'Initial')], []);
  useCanvasStore.setState({
    nodes: [
      {
        ...card('a', 'Initial'),
        data: {
          noteId: 'shared',
          title: 'Initial',
          content: 'Original',
          blocknoteRevision: 1,
        },
      },
    ],
  });
  useCanvasStore.getState().saveSnapshot();
  useCanvasStore.setState({
    nodes: [
      {
        ...card('a', 'Current'),
        position: { x: 100, y: 100 },
        data: {
          noteId: 'shared',
          title: 'Current',
          content: 'New body',
          blocknoteRevision: 2,
        },
      },
    ],
  });
  expect(
    useCanvasStore.getState()._undoRedo.past[0]?.nodes[0]?.data
  ).not.toHaveProperty('content');
  useCanvasStore.getState().undo();
  expect(useCanvasStore.getState().nodes[0]?.position).toEqual({ x: 0, y: 0 });
  expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
    title: 'Current',
    content: 'New body',
    blocknoteRevision: 2,
  });
  useCanvasStore.getState().redo();
  expect(useCanvasStore.getState().nodes[0]?.data.content).toBe('New body');
});
