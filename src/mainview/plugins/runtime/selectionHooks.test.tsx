// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  Disposer,
  PluginSelection,
  SelectionSnapshot,
} from '../../../../packages/plugin-sdk';
import {
  SelectionProvider,
  useSelectedPlacements,
  useSelection,
  useSelectionState,
} from '../../../../packages/plugin-sdk/react.js';
import { renderPanel } from './panels';
import { initializeSharedPluginRuntime } from './sharedRuntime';

const disposers: Disposer[] = [];
const originalRuntime = globalThis.__ghostboardPluginRuntime;
afterEach(async () => {
  await act(async () => {
    for (const dispose of disposers.splice(0)) {
      await dispose();
    }
  });
  cleanup();
  document.body.replaceChildren();
  globalThis.__ghostboardPluginRuntime = originalRuntime;
  vi.restoreAllMocks();
});

function ready(id: string): SelectionSnapshot {
  return Object.freeze({
    status: 'ready',
    items: Object.freeze([
      {
        id,
        kind: 'note' as const,
        title: id,
        text: `Text for ${id}`,
        color: 'blue',
        revision: 1,
        source: 'sidecar' as const,
      },
    ]),
    placements: Object.freeze({
      viewId: `view-${id}`,
      items: Object.freeze([
        { id: `placement-${id}`, content: { kind: 'note' as const, id } },
      ]),
    }),
    error: null,
  });
}

function store(initial: SelectionSnapshot) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn();
  const selection: PluginSelection = {
    get: vi.fn(async () => snapshot.items),
    getPlacements: () => snapshot.placements,
    getSnapshot: vi.fn(() => snapshot),
    subscribe: vi.fn((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    }),
  };
  return {
    selection,
    listeners,
    unsubscribe,
    publish(next: SelectionSnapshot) {
      snapshot = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function useAllSelection() {
  return {
    items: useSelection(),
    state: useSelectionState(),
    placements: useSelectedPlacements(),
  };
}

it('reads the cached snapshot and follows ready, loading, error and recovery', () => {
  const first = ready('first');
  const source = store(first);
  const { result } = renderHook(useAllSelection, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SelectionProvider selection={source.selection}>
        {children}
      </SelectionProvider>
    ),
  });
  expect(result.current.items).toBe(first.items);
  expect(result.current.state).toBe(first);
  expect(result.current.placements).toBe(first.placements);

  const next = ready('next');
  const loading: SelectionSnapshot = {
    status: 'loading',
    items: [],
    placements: next.placements,
    error: null,
  };
  act(() => source.publish(loading));
  expect(result.current.state).toBe(loading);
  expect(result.current.items).toBe(loading.items);
  expect(result.current.items).toEqual([]);
  expect(result.current.placements).toBe(next.placements);

  const failed: SelectionSnapshot = {
    ...loading,
    status: 'error',
    error: { code: 'READ_FAILED', message: 'Selection could not be read' },
  };
  act(() => source.publish(failed));
  expect(result.current.state).toBe(failed);
  expect(result.current.items).toEqual([]);
  expect(result.current.state.error).toBe(failed.error);

  act(() => source.publish(next));
  expect(result.current.state).toBe(next);
  expect(result.current.items).toBe(next.items);
  expect(source.selection.get).not.toHaveBeenCalled();
});

it('does not rerender or resubscribe for unchanged snapshots and unsubscribes on unmount', () => {
  const snapshot = ready('stable');
  const source = store(snapshot);
  const renderSpy = vi.fn();
  const { unmount } = renderHook(
    () => {
      renderSpy();
      return useAllSelection();
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SelectionProvider selection={source.selection}>
          {children}
        </SelectionProvider>
      ),
    }
  );
  expect(renderSpy).toHaveBeenCalledOnce();
  expect(source.listeners.size).toBe(3);
  act(() => {
    for (let index = 0; index < 10; index += 1) {
      source.publish(snapshot);
    }
  });
  expect(renderSpy).toHaveBeenCalledOnce();
  expect(source.selection.subscribe).toHaveBeenCalledTimes(3);
  unmount();
  expect(source.listeners.size).toBe(0);
  expect(source.unsubscribe).toHaveBeenCalledTimes(3);
  act(() => source.publish(ready('after-unmount')));
  expect(renderSpy).toHaveBeenCalledOnce();
});

it('switches subscriptions when an author replaces the provider selection', () => {
  const first = store(ready('first'));
  const second = store(ready('second'));
  function View() {
    return <p>{useSelection()[0]?.title}</p>;
  }
  const { container, rerender, unmount } = render(
    <SelectionProvider selection={first.selection}>
      <View />
    </SelectionProvider>
  );
  expect(container.textContent).toBe('first');
  rerender(
    <SelectionProvider selection={second.selection}>
      <View />
    </SelectionProvider>
  );
  expect(container.textContent).toBe('second');
  expect(first.listeners.size).toBe(0);
  expect(first.unsubscribe).toHaveBeenCalledOnce();
  act(() => first.publish(ready('retired')));
  expect(container.textContent).toBe('second');
  act(() => second.publish(ready('current')));
  expect(container.textContent).toBe('current');
  unmount();
  expect(second.listeners.size).toBe(0);
});

it.each([
  useSelection,
  useSelectionState,
  useSelectedPlacements,
])('%s gives a descriptive error without a provider', (hook) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => renderHook(() => hook())).toThrow(
    '@ghostboard/sdk/react selection hooks require a SelectionProvider'
  );
});

it('mounts independent panel roots with their own provider and the shared SDK hooks', async () => {
  const first = store(ready('first'));
  const second = store(ready('second'));
  const host = store(ready('host'));
  const shared = initializeSharedPluginRuntime();
  function View() {
    const items = shared.sdkReact.useSelection();
    const state = useSelectionState();
    const placements = useSelectedPlacements();
    return <p>{`${state.status}:${items[0]?.title}:${placements.viewId}`}</p>;
  }
  const { container: hostContainer } = render(
    <SelectionProvider selection={host.selection}>
      <div data-testid="panel-containers" />
    </SelectionProvider>
  );
  const elements = [
    document.createElement('div'),
    document.createElement('div'),
  ] as const;
  hostContainer.firstElementChild?.append(...elements);
  const report = vi.fn();
  await act(async () => {
    for (const [element, source] of [
      [elements[0], first],
      [elements[1], second],
    ] as const) {
      const dispose = renderPanel(
        element,
        { id: 'selection', title: 'Selection', component: View },
        report,
        source.selection
      );
      if (dispose) {
        disposers.push(dispose);
      }
    }
  });
  expect(elements[0].textContent).toBe('ready:first:view-first');
  expect(elements[1].textContent).toBe('ready:second:view-second');
  expect(host.listeners.size).toBe(0);
  act(() => first.publish(ready('changed')));
  expect(elements[0].textContent).toBe('ready:changed:view-changed');
  expect(elements[1].textContent).toBe('ready:second:view-second');
  act(() => second.publish(ready('other')));
  expect(elements[0].textContent).toBe('ready:changed:view-changed');
  expect(elements[1].textContent).toBe('ready:other:view-other');
  await act(async () => {
    for (const dispose of disposers.splice(0)) {
      await dispose();
    }
  });
  expect(first.listeners.size).toBe(0);
  expect(second.listeners.size).toBe(0);
  expect(first.unsubscribe).toHaveBeenCalledTimes(3);
  expect(second.unsubscribe).toHaveBeenCalledTimes(3);
  expect(report).not.toHaveBeenCalled();
});

it('keeps selection hook errors inside the panel error boundary', async () => {
  function View() {
    useSelection();
    return null;
  }
  const element = document.createElement('div');
  const report = vi.fn();
  await act(async () => {
    const dispose = renderPanel(
      element,
      { id: 'missing', title: 'Missing provider', component: View },
      report
    );
    if (dispose) {
      disposers.push(dispose);
    }
  });
  expect(element.querySelector('[role="alert"]')).not.toBeNull();
  expect(report).toHaveBeenCalledWith(
    expect.stringContaining('selection hooks require a SelectionProvider')
  );
});

it('leaves DOM panel mounts and their cleanup unchanged', () => {
  const source = store(ready('unused'));
  const element = document.createElement('div');
  const dispose = vi.fn();
  const mount = vi.fn(() => dispose);
  expect(
    renderPanel(
      element,
      { id: 'dom', title: 'DOM panel', mount },
      vi.fn(),
      source.selection
    )
  ).toBe(dispose);
  expect(mount).toHaveBeenCalledExactlyOnceWith(element);
  expect(source.selection.subscribe).not.toHaveBeenCalled();
});
