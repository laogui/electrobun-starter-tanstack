// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { connectPluginHostEvents } from './hostEvents';
import type { PluginRuntime } from './PluginRuntime';

const { state, listeners } = vi.hoisted(() => ({
  state: {
    _hydrated: true,
    activeViewId: 'view-a',
    nodes: [{ id: 'placement-a', selected: true }],
  },
  listeners: new Set<() => void>(),
}));
vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  },
}));
afterEach(() => listeners.clear());

it('forwards valid pushed content events, emits selection membership changes, and disconnects', () => {
  const emitHostEvent = vi.fn();
  let runtimeChanged!: () => void;
  const unsubscribe = vi.fn();
  const runtime = {
    getSnapshot: () => ({ workspaceId: 'workspace-a' }),
    subscribe: (listener: () => void) => {
      runtimeChanged = listener;
      return unsubscribe;
    },
    emitHostEvent,
  } as unknown as PluginRuntime;
  const disconnect = connectPluginHostEvents(runtime);
  const payload = {
    workspaceId: 'workspace-a',
    kind: 'note',
    ids: ['note-a'],
    operation: 'upsert',
  };
  window.dispatchEvent(
    new CustomEvent('plugin-content-changed', { detail: payload })
  );
  expect(emitHostEvent).toHaveBeenCalledWith('content.changed', payload);
  window.dispatchEvent(
    new CustomEvent('plugin-content-changed', { detail: { ids: [null] } })
  );
  expect(emitHostEvent).toHaveBeenCalledOnce();
  runtimeChanged();
  runtimeChanged();
  expect(emitHostEvent).toHaveBeenCalledTimes(2);
  expect(emitHostEvent).toHaveBeenLastCalledWith('selection.changed', {
    workspaceId: 'workspace-a',
    viewId: 'view-a',
    placementIds: ['placement-a'],
  });
  state.nodes[0]!.selected = false;
  for (const listener of listeners) {
    listener();
  }
  expect(emitHostEvent).toHaveBeenLastCalledWith('selection.changed', {
    workspaceId: 'workspace-a',
    viewId: 'view-a',
    placementIds: [],
  });
  disconnect();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(listeners.size).toBe(0);
  window.dispatchEvent(
    new CustomEvent('plugin-content-changed', { detail: payload })
  );
  expect(emitHostEvent).toHaveBeenCalledTimes(3);
});
