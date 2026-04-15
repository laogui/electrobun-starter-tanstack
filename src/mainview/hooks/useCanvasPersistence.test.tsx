// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { useCanvasPersistence } from '@/hooks/useCanvasPersistence';
import { useCanvasStore } from '@/store/canvasStore';

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
    nodeIdCounter: 100,
    editingEdgeId: null,
  });
};

describe('useCanvasPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
    rpcMocks.isRpcAvailable.mockReset();
    rpcMocks.rpcSaveManifest.mockReset();
    rpcMocks.isRpcAvailable.mockResolvedValue(true);
    rpcMocks.rpcSaveManifest.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('skips the first hydration-like state change', async () => {
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
      []
    );
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
      window.dispatchEvent(new Event('blur'));
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
      []
    );
  });

  it('flushes the previous view before switching activeViewId', async () => {
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
      useCanvasStore.setState({ activeViewId: 'focus' });
    });

    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpcSaveManifest.mock.calls[0]?.[0]).toBe('default');
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
