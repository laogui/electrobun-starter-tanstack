// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasPersistence } from '@/hooks/useCanvasPersistence';
import {
  resetViewportPersistSuppression,
  suppressViewportPersist,
} from '@/lib/viewportPersist';
import { useCanvasStore } from '@/store/canvasStore';

const rpcMocks = vi.hoisted(() => ({
  isRpcAvailable: vi.fn(),
  rpcSaveManifest: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  isRpcAvailable: rpcMocks.isRpcAvailable,
  rpcSaveManifest: rpcMocks.rpcSaveManifest,
}));

vi.mock('../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
}));

const TestComponent = () => {
  useCanvasPersistence();
  return <div>persistence</div>;
};

const resetStore = () => {
  useCanvasStore.getState().reset();
  useCanvasStore.setState({
    activeViewId: 'default',
    clipboard: [],
    createMenuOpen: false,
    editingEdgeId: null,
    _hydrated: true,
  });
};

describe('useCanvasPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetViewportPersistSuppression();
    resetStore();
    rpcMocks.isRpcAvailable.mockReset();
    rpcMocks.rpcSaveManifest.mockReset();
    rpcMocks.isRpcAvailable.mockResolvedValue(true);
    rpcMocks.rpcSaveManifest.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetViewportPersistSuppression();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('skips changes while canvas is not hydrated', async () => {
    useCanvasStore.setState({ _hydrated: false });
    render(<TestComponent />);
    await vi.runAllTicks();

    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 0, y: 0 }, data: {} },
      ]);
    vi.advanceTimersByTime(2600);

    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();
  });

  it('debounces manifest persistence after subsequent node changes', async () => {
    render(<TestComponent />);
    await vi.runAllTicks();

    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 0, y: 0 }, data: {} },
      ]);
    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 10, y: 10 }, data: {} },
      ]);

    vi.advanceTimersByTime(2499);
    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledWith(
      'default',
      [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 10, y: 10 },
          data: {},
        },
      ],
      [],
      undefined
    );
  });

  it('debounces and persists viewport changes', async () => {
    render(<TestComponent />);
    await vi.runAllTicks();

    // First change is consumed by the post-hydrate guard.
    useCanvasStore.getState().setViewport({ x: 50, y: 60, zoom: 1 });
    useCanvasStore.getState().setViewport({ x: 100, y: 200, zoom: 1.5 });

    vi.advanceTimersByTime(499);
    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledWith('default', [], [], {
      x: 100,
      y: 200,
      zoom: 1.5,
    });
  });

  it('does not schedule persistence when only the runtime viewport changes', async () => {
    render(<TestComponent />);
    await vi.runAllTicks();

    useCanvasStore.setState({
      persistedViewport: { x: 0, y: 0, zoom: 1 },
    });
    suppressViewportPersist(300);
    useCanvasStore.getState().setViewport({ x: 900, y: 900, zoom: 0.25 });

    vi.advanceTimersByTime(600);

    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();
  });

  it('flushes pending changes when the window blurs', async () => {
    render(<TestComponent />);
    await vi.runAllTicks();

    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 20, y: 20 }, data: {} },
      ]);
    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 40, y: 40 }, data: {} },
      ]);

    act(() => {
      globalThis.dispatchEvent(new Event('blur'));
    });

    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledWith(
      'default',
      [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 40, y: 40 },
          data: {},
        },
      ],
      [],
      undefined
    );
  });

  it('includes the latest persisted viewport when flushing on blur', async () => {
    render(<TestComponent />);
    await vi.runAllTicks();

    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 0, y: 0 }, data: {} },
      ]);
    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 10, y: 10 }, data: {} },
      ]);
    useCanvasStore.getState().setViewport({ x: 50, y: 60, zoom: 0.75 });

    act(() => {
      globalThis.dispatchEvent(new Event('blur'));
    });

    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
    const lastCall = rpcMocks.rpcSaveManifest.mock.calls.at(-1);
    expect(lastCall?.[3]).toEqual({ x: 50, y: 60, zoom: 0.75 });
  });

  it('cancels pending timer and does not flush when activeViewId changes', async () => {
    render(<TestComponent />);
    await vi.runAllTicks();

    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 5, y: 5 }, data: {} },
      ]);
    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 15, y: 15 }, data: {} },
      ]);

    await act(async () => {
      useCanvasStore.setState({ activeViewId: 'focus', _hydrated: false });
    });

    // Should NOT flush — ViewSwitcher handles that before calling setActiveView
    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();

    // Pending timer should have been cancelled too
    vi.advanceTimersByTime(3000);
    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();
  });

  it('does not persist when rpc never becomes available', async () => {
    rpcMocks.isRpcAvailable.mockResolvedValue(false);
    render(<TestComponent />);
    await vi.runAllTicks();

    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 30, y: 30 }, data: {} },
      ]);

    vi.advanceTimersByTime(3000);
    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();
  });

  it('flushes on visibilitychange and reports save failures', async () => {
    rpcMocks.rpcSaveManifest.mockRejectedValueOnce(new Error('save failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<TestComponent />);
    await vi.runAllTicks();

    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 30, y: 30 }, data: {} },
      ]);
    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 60, y: 60 }, data: {} },
      ]);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('keeps pending changes dirty when a blur flush fails and retries them later', async () => {
    rpcMocks.rpcSaveManifest
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce({ success: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<TestComponent />);
    await vi.runAllTicks();

    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 0, y: 0 }, data: {} },
      ]);
    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 80, y: 80 }, data: {} },
      ]);

    await act(async () => {
      globalThis.dispatchEvent(new Event('blur'));
      await Promise.resolve();
    });

    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);

    await act(async () => {
      globalThis.dispatchEvent(new Event('blur'));
      await Promise.resolve();
    });

    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(2);
    expect(rpcMocks.rpcSaveManifest).toHaveBeenLastCalledWith(
      'default',
      [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 80, y: 80 },
          data: {},
        },
      ],
      [],
      undefined
    );
  });

  it('flushes pending changes during unmount', async () => {
    const view = render(<TestComponent />);
    await vi.runAllTicks();

    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 30, y: 30 }, data: {} },
      ]);
    useCanvasStore
      .getState()
      .setNodes([
        { id: 'node-1', type: 'card', position: { x: 60, y: 60 }, data: {} },
      ]);

    act(() => {
      view.unmount();
    });

    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpcSaveManifest.mock.calls[0]?.[0]).toBe('default');
  });
});
