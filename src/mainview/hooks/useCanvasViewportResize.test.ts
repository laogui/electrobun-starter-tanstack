// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetViewportPersistSuppression } from '@/lib/viewportPersist';
import { useCanvasStore } from '@/store/canvasStore';
import { useCanvasViewportResize } from './useCanvasViewportResize';

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  disconnect() {
    const index = ResizeObserverMock.instances.indexOf(this);
    if (index >= 0) {
      ResizeObserverMock.instances.splice(index, 1);
    }
  }

  observe() {
    // no-op — tests drive callbacks manually
  }

  unobserve() {
    // no-op
  }

  trigger(width: number, height: number) {
    this.callback(
      [
        {
          contentRect: {
            width,
            height,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            bottom: height,
            right: width,
            toJSON: () => ({}),
          },
        } as ResizeObserverEntry,
      ],
      this
    );
  }
}

function buildRfInstance() {
  const setViewport = vi.fn();
  const fitView = vi.fn();
  const getViewport = vi.fn(() => ({ x: 100, y: 50, zoom: 2 }));
  const ref = {
    current: {
      fitView,
      getViewport,
      setViewport,
    } as unknown as ReactFlowInstance<any, any>,
  } satisfies RefObject<ReactFlowInstance<any, any> | null>;

  return { ref, fitView, getViewport, setViewport };
}

describe('useCanvasViewportResize', () => {
  beforeEach(() => {
    ResizeObserverMock.instances = [];
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    resetViewportPersistSuppression();
    useCanvasStore.setState({
      sessionViewport: { x: 0, y: 0, zoom: 1 },
      viewport: { x: 100, y: 50, zoom: 2 },
      _hydrated: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewportPersistSuppression();
  });

  it('anchors the live viewport when the pane grows', () => {
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { ref, getViewport, setViewport } = buildRfInstance();

    renderHook(() =>
      useCanvasViewportResize({
        containerRef,
        enabled: true,
        rfInstance: ref,
      })
    );

    const observer = ResizeObserverMock.instances[0]!;
    observer.trigger(800, 600);
    observer.trigger(1200, 600);

    expect(getViewport).toHaveBeenCalled();
    const expectedZoom = 2 * Math.sqrt(1.5);
    const flowX = (800 / 2 - 100) / 2;
    const flowY = (600 / 2 - 50) / 2;

    expect(setViewport).toHaveBeenCalledWith(
      {
        x: 1200 / 2 - flowX * expectedZoom,
        y: 600 / 2 - flowY * expectedZoom,
        zoom: expectedZoom,
      },
      { duration: 0 }
    );
    expect(useCanvasStore.getState().viewport?.zoom).toBeCloseTo(expectedZoom);
    expect(useCanvasStore.getState().sessionViewport).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
  });

  it('re-fits the canvas when no viewport has been persisted yet', () => {
    useCanvasStore.setState({ sessionViewport: null });
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { ref, fitView } = buildRfInstance();
    ref.current!.getViewport = vi.fn(() => ({ x: 12, y: 34, zoom: 0.8 }));

    renderHook(() =>
      useCanvasViewportResize({
        containerRef,
        enabled: true,
        rfInstance: ref,
      })
    );

    const observer = ResizeObserverMock.instances[0]!;
    observer.trigger(800, 600);
    observer.trigger(1000, 700);

    expect(fitView).toHaveBeenCalledWith({ duration: 0 });
    expect(useCanvasStore.getState().viewport).toEqual({
      x: 12,
      y: 34,
      zoom: 0.8,
    });
    expect(useCanvasStore.getState().sessionViewport).toBeNull();
  });

  it('does not observe while disabled', () => {
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { ref } = buildRfInstance();

    renderHook(() =>
      useCanvasViewportResize({
        containerRef,
        enabled: false,
        rfInstance: ref,
      })
    );

    expect(ResizeObserverMock.instances).toHaveLength(0);
  });
});
