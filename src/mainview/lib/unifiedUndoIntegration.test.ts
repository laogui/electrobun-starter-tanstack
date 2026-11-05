// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetRecord } from '@/lib/widgetTypes';
import type { ExtensionInstanceRecord } from '../../shared/extensions/instance';

// Debounced store saves must never reach a real host.
vi.mock('@/lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rpc')>()),
  rpcUpdateExtensionInstance: vi.fn(async () => ({ success: true })),
  rpcSaveWidget: vi.fn(async () => ({ success: true })),
}));

const { routeUndoRedo } = await import('@/lib/routeUndoRedo');
const { unifiedUndoHistory } = await import('@/lib/unifiedUndoHistory');
const { useCanvasStore } = await import('@/store/canvasStore');
const { useExtensionInstanceStore } = await import(
  '@/store/extensionInstanceStore'
);
const { useWidgetStore } = await import('@/store/widgetStore');

const card = (id: string, title: string): Node => ({
  id,
  type: 'card',
  position: { x: 0, y: 0 },
  data: { title },
});

const checklist = (title: string): WidgetRecord => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  data: { items: [] },
  id: 'w-1',
  kind: 'checklist',
  schema: 'ghostboard-widget/v1',
  title,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const instance = (state: unknown): ExtensionInstanceRecord => ({
  appVersion: '1.0.0',
  canvasTypeId: 'test.counter',
  createdAt: '2026-01-01T00:00:00.000Z',
  dataVersion: 1,
  id: 'inst-1',
  presentation: { title: 'Counter' },
  revision: 1,
  schema: 'ghostboard-extension-instance/v1',
  state,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const cardTitle = () => useCanvasStore.getState().nodes[0]?.data.title;
const widgetTitle = () => {
  const record = useWidgetStore.getState().records['w-1'];
  return record && 'title' in record ? record.title : undefined;
};
const instanceState = () => {
  const record = useExtensionInstanceStore.getState().records['inst-1'];
  return record && 'state' in record ? record.state : undefined;
};
const renameWidget = (title: string) =>
  useWidgetStore.getState().updateWidget('w-1', (current) => ({
    ...current,
    title,
  }));
const settle = () =>
  vi.waitFor(() => {
    if (unifiedUndoHistory.getSnapshot().pending) {
      throw new Error('history transition still pending');
    }
  });

describe('unified undo across canvas, widget and extension stores', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    unifiedUndoHistory.reset();
    unifiedUndoHistory.setNativeView('view-1');
    useCanvasStore.setState({
      activeViewId: 'view-1',
      nodes: [card('a', 'c0')],
    });
    useWidgetStore.setState({
      history: {},
      records: { 'w-1': checklist('w0') },
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
    renameWidget('w1');
    await useExtensionInstanceStore
      .getState()
      .updateState('inst-1', { history: 'record', state: { count: 1 } });
    useCanvasStore.getState().commitNodeData('a', { title: 'c2' });
    expect(
      unifiedUndoHistory.getSnapshot().past.map((entry) => entry.kind)
    ).toEqual(['canvas', 'widget', 'extension-instance', 'canvas']);

    routeUndoRedo('undo');
    await settle();
    expect(cardTitle()).toBe('c1');

    routeUndoRedo('undo');
    await settle();
    expect(instanceState()).toEqual({ count: 0 });
    expect(widgetTitle()).toBe('w1');

    routeUndoRedo('undo');
    await settle();
    expect(widgetTitle()).toBe('w0');
    expect(cardTitle()).toBe('c1');

    routeUndoRedo('undo');
    await settle();
    expect(cardTitle()).toBe('c0');

    for (let i = 0; i < 4; i++) {
      routeUndoRedo('redo');
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await settle();
    }
    expect(cardTitle()).toBe('c2');
    expect(widgetTitle()).toBe('w1');
    expect(instanceState()).toEqual({ count: 1 });
    expect(unifiedUndoHistory.getSnapshot().future).toEqual([]);
  });

  it('a focused widget keeps local ownership and the timeline follows it', async () => {
    renameWidget('w1');
    useCanvasStore.getState().commitNodeData('a', { title: 'c1' });
    renameWidget('w2');

    useCanvasStore.setState({
      focusedNode: {
        data: { kind: 'checklist', widgetId: 'w-1' },
        id: 'widget-node',
        rect: new DOMRect(),
        type: 'widget',
      },
    });
    expect(routeUndoRedo('undo')).toBe(true);
    expect(widgetTitle()).toBe('w1');
    expect(cardTitle()).toBe('c1');

    // Leaving the widget: the next undo reverts the canvas edit, not w1.
    useCanvasStore.setState({ focusedNode: null });
    routeUndoRedo('undo');
    await settle();
    expect(cardTitle()).toBe('c0');
    expect(widgetTitle()).toBe('w1');

    routeUndoRedo('undo');
    await settle();
    expect(widgetTitle()).toBe('w0');
  });

  it('a canvas edit discards widget and extension redo branches', async () => {
    renameWidget('w1');
    useWidgetStore.getState().undoWidget('w-1');
    await useExtensionInstanceStore
      .getState()
      .updateState('inst-1', { history: 'record', state: { count: 1 } });
    useExtensionInstanceStore.getState().undoInstance('inst-1');
    useCanvasStore.getState().commitNodeData('a', { title: 'branch' });
    expect(useWidgetStore.getState().redoWidget('w-1')).toBe(false);
    expect(useExtensionInstanceStore.getState().redoInstance('inst-1')).toBe(
      false
    );
    expect(
      unifiedUndoHistory.getSnapshot().past.map((entry) => entry.kind)
    ).toEqual(['canvas']);
  });

  it('a widget edit discards the canvas redo branch', () => {
    useCanvasStore.getState().commitNodeData('a', { title: 'c1' });
    useCanvasStore.getState().undo();
    renameWidget('branch');
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

  it('re-hydrating a widget drops its unreachable entries', async () => {
    useCanvasStore.getState().commitNodeData('a', { title: 'c1' });
    renameWidget('w1');

    useWidgetStore.getState().hydrate({ 'w-1': checklist('from-disk') });
    expect(
      unifiedUndoHistory.getSnapshot().past.map((entry) => entry.kind)
    ).toEqual(['canvas']);

    routeUndoRedo('undo');
    await settle();
    expect(cardTitle()).toBe('c0');
    expect(widgetTitle()).toBe('from-disk');
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
