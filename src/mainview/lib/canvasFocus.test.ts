// @vitest-environment jsdom

import type { Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';

import { openFocusedById } from './canvasFocus';

function makeRfInstance(): ReactFlowInstance<any, any> {
  return {
    setCenter: vi.fn(),
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  } as unknown as ReactFlowInstance<any, any>;
}

describe('openFocusedById', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('no-ops when the node id cannot be found', async () => {
    const rf = makeRfInstance();
    await openFocusedById({
      nodeId: 'missing',
      rfInstance: rf,
      centerDurationMs: 0,
    });
    expect(rf.setCenter).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().focusedNode).toBeNull();
    expect(useCanvasStore.getState().focusedFolder).toBeNull();
  });

  it('centers on a card node and opens FocusedView with a rect', async () => {
    const nodes: Node[] = [
      {
        id: 'card-1',
        type: 'card',
        position: { x: 100, y: 200 },
        data: { title: 'Hello' },
      } as unknown as Node,
    ];
    useCanvasStore.setState({ nodes, _hydrated: true });

    const rf = makeRfInstance();
    await openFocusedById({
      nodeId: 'card-1',
      rfInstance: rf,
      centerDurationMs: 0,
    });

    // setCenter receives node center coordinates with default width 320, height 160.
    expect(rf.setCenter).toHaveBeenCalledWith(
      260, // 100 + 320/2
      280, // 200 + 160/2
      expect.objectContaining({ zoom: 1 })
    );

    const focused = useCanvasStore.getState().focusedNode;
    expect(focused).not.toBeNull();
    expect(focused?.id).toBe('card-1');
    expect(focused?.type).toBe('card');
    expect(focused?.rect).toBeInstanceOf(DOMRect);
  });

  it('opens FolderView for folder nodes', async () => {
    const nodes: Node[] = [
      {
        id: 'folder-1',
        type: 'folder',
        position: { x: 0, y: 0 },
        data: { title: 'Project', children: [] },
      } as unknown as Node,
    ];
    useCanvasStore.setState({ nodes, _hydrated: true });

    await openFocusedById({
      nodeId: 'folder-1',
      rfInstance: makeRfInstance(),
      centerDurationMs: 0,
    });

    expect(useCanvasStore.getState().focusedFolder?.id).toBe('folder-1');
    expect(useCanvasStore.getState().focusedNode).toBeNull();
  });

  it('does nothing for non-focusable kinds (e.g. sticky)', async () => {
    const nodes: Node[] = [
      {
        id: 'sticky-1',
        type: 'sticky',
        position: { x: 0, y: 0 },
        data: { content: 'note' },
      } as unknown as Node,
    ];
    useCanvasStore.setState({ nodes, _hydrated: true });

    await openFocusedById({
      nodeId: 'sticky-1',
      rfInstance: makeRfInstance(),
      centerDurationMs: 0,
    });

    expect(useCanvasStore.getState().focusedNode).toBeNull();
    expect(useCanvasStore.getState().focusedFolder).toBeNull();
  });

  it('does not open FocusedView for widget nodes', async () => {
    const nodes: Node[] = [
      {
        id: 'widget-1',
        type: 'widget',
        position: { x: 0, y: 0 },
        data: { widgetId: 'w1', kind: 'checklist' },
      } as unknown as Node,
    ];
    useCanvasStore.setState({ nodes, _hydrated: true });

    await openFocusedById({
      nodeId: 'widget-1',
      rfInstance: makeRfInstance(),
      centerDurationMs: 0,
    });

    expect(useCanvasStore.getState().focusedNode).toBeNull();
    expect(useCanvasStore.getState().focusedFolder).toBeNull();
  });
});
