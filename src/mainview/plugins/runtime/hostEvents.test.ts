// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { subscribeNoteMetadataChanges } from '@/lib/noteMetadataProjection';
import { connectPluginHostEvents } from './hostEvents';
import type { PluginRuntime } from './PluginRuntime';

const { state, listeners } = vi.hoisted(() => ({
  state: {
    _hydrated: true,
    activeViewId: 'view-a',
    nodes: [
      {
        id: 'placement-a',
        selected: true,
        data: {
          noteId: 'note-a',
          title: 'Before',
          color: 'white',
          blocknoteRevision: 4,
        },
      },
    ],
    focusedNode: null,
    focusedFolder: null,
  },
  listeners: new Set<() => void>(),
}));
vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: {
    getState: () => state,
    setState: (updater: (current: typeof state) => typeof state) => {
      Object.assign(state, updater(state));
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  },
}));
beforeEach(() => {
  state._hydrated = true;
  state.activeViewId = 'view-a';
  state.nodes = [
    {
      id: 'placement-a',
      selected: true,
      data: {
        noteId: 'note-a',
        title: 'Before',
        color: 'white',
        blocknoteRevision: 4,
      },
    },
  ];
});
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
    updateSelection: vi.fn(),
    emitHostEvent,
  } as unknown as PluginRuntime;
  const disconnect = connectPluginHostEvents(runtime);
  expect(emitHostEvent).toHaveBeenLastCalledWith('selection.changed', {
    workspaceId: 'workspace-a',
    viewId: 'view-a',
    placementIds: ['placement-a'],
  });
  expect(runtime.updateSelection).toHaveBeenCalledWith('workspace-a', {
    viewId: 'view-a',
    items: [{ id: 'placement-a', content: { kind: 'note', id: 'note-a' } }],
  });
  emitHostEvent.mockClear();
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
  expect(emitHostEvent).toHaveBeenCalledTimes(1);
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
  expect(emitHostEvent).toHaveBeenCalledTimes(2);
});

it('filters workspaces, ignores stale revisions, clears cache on transitions, and stops reconciliation after disposal', () => {
  let workspaceId = 'workspace-a';
  let runtimeChanged!: () => void;
  const runtime = {
    getSnapshot: () => ({ workspaceId }),
    subscribe: (listener: () => void) => {
      runtimeChanged = listener;
      return () => {};
    },
    updateSelection: vi.fn(),
    emitHostEvent: vi.fn(),
  } as unknown as PluginRuntime;
  const disconnect = connectPluginHostEvents(runtime);
  const observed = vi.fn();
  const unsubscribe = subscribeNoteMetadataChanges(observed);
  const change = {
    id: 'note-a',
    before: { title: 'Before', color: 'white', revision: 4 },
    after: { title: 'Plugin', color: 'blue', revision: 5 },
    metadataOnly: true,
  };
  const dispatch = (workspace = workspaceId, noteChange = change) =>
    window.dispatchEvent(
      new CustomEvent('plugin-content-changed', {
        detail: {
          workspaceId: workspace,
          kind: 'note',
          operation: 'upsert',
          ids: ['note-a'],
          noteChanges: [noteChange],
        },
      })
    );
  dispatch('other-workspace');
  expect(observed).not.toHaveBeenCalled();
  dispatch();
  expect(state.nodes[0]?.data).toMatchObject({
    title: 'Plugin',
    color: 'blue',
    blocknoteRevision: 5,
  });
  const projected = state.nodes;
  dispatch();
  dispatch(workspaceId, {
    ...change,
    before: { ...change.before, revision: 2 },
    after: { ...change.after, revision: 3 },
  });
  expect(observed).toHaveBeenCalledOnce();
  expect(state.nodes).toBe(projected);
  workspaceId = 'workspace-b';
  runtimeChanged();
  expect(runtime.updateSelection).toHaveBeenLastCalledWith('workspace-b', {
    viewId: null,
    items: [],
  });
  state._hydrated = false;
  for (const listener of listeners) {
    listener();
  }
  state._hydrated = true;
  state.activeViewId = 'view-b';
  for (const listener of listeners) {
    listener();
  }
  expect(runtime.updateSelection).toHaveBeenLastCalledWith(
    'workspace-b',
    expect.objectContaining({ viewId: 'view-b' })
  );
  state.nodes[0]!.data = {
    noteId: 'note-a',
    title: 'Before',
    color: 'white',
    blocknoteRevision: 4,
  };
  dispatch('workspace-a');
  expect(state.nodes[0]?.data.title).toBe('Before');
  dispatch();
  expect(observed).toHaveBeenCalledTimes(2);
  expect(state.nodes[0]?.data.title).toBe('Plugin');
  disconnect();
  dispatch();
  expect(observed).toHaveBeenCalledTimes(2);
  unsubscribe();
});

it('rejects malformed metadata rather than trusting a pushed DOM payload', () => {
  const runtime = {
    getSnapshot: () => ({ workspaceId: 'a' }),
    subscribe: () => () => {},
    updateSelection: vi.fn(),
    emitHostEvent: vi.fn(),
  } as unknown as PluginRuntime;
  const disconnect = connectPluginHostEvents(runtime);
  window.dispatchEvent(
    new CustomEvent('plugin-content-changed', {
      detail: {
        workspaceId: 'a',
        kind: 'note',
        operation: 'upsert',
        ids: ['note-a'],
        noteChanges: [{ id: 'note-a', before: null }],
      },
    })
  );
  expect(runtime.emitHostEvent).not.toHaveBeenCalledWith(
    'content.changed',
    expect.anything()
  );
  disconnect();
});
