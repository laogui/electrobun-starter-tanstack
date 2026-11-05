// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeUndoRedo } from '@/lib/routeUndoRedo';
import { unifiedUndoHistory } from '@/lib/unifiedUndoHistory';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';

const card = (id: string, title: string): Node => ({
  id,
  type: 'card',
  position: { x: 0, y: 0 },
  data: { title },
});

const focus = (type: string, data: Record<string, unknown>) =>
  useCanvasStore.setState({
    focusedNode: { id: 'focused', type, data, rect: new DOMRect() },
  });

describe('routeUndoRedo (undo stack routing)', () => {
  type IdHandler = (id: string) => boolean;
  let undoInstance: ReturnType<typeof vi.fn<IdHandler>>;
  let redoInstance: ReturnType<typeof vi.fn<IdHandler>>;

  beforeEach(() => {
    useCanvasStore.getState().reset();
    unifiedUndoHistory.reset();
    undoInstance = vi.fn<IdHandler>(() => true);
    redoInstance = vi.fn<IdHandler>(() => true);
    useExtensionInstanceStore.setState({ undoInstance, redoInstance });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sends undo inside an extension host to that instance stack', () => {
    document.body.innerHTML =
      '<div data-extension-instance="inst-1"><button id="b">x</button></div>';
    const target = document.querySelector('#b');
    expect(routeUndoRedo('undo', { eventTarget: target })).toBe(true);
    expect(undoInstance).toHaveBeenCalledWith('inst-1');
  });

  it('sends redo to the focused extension instance', () => {
    focus('extension', { instanceId: 'inst-2' });
    expect(routeUndoRedo('redo')).toBe(true);
    expect(redoInstance).toHaveBeenCalledWith('inst-2');
  });

  it('leaves keyboard undo to the browser while a text field is focused', () => {
    document.body.innerHTML = '<input id="i" />';
    (document.querySelector('#i') as HTMLInputElement).focus();
    const canvasUndo = vi.spyOn(useCanvasStore.getState(), 'undo');
    expect(routeUndoRedo('undo', { fromKeyboard: true })).toBe(false);
    expect(canvasUndo).not.toHaveBeenCalled();
  });

  it('falls through to the canvas snapshot stack and restores the graph', async () => {
    useCanvasStore.setState({ nodes: [card('a', 'before')] });
    useCanvasStore.getState().commitNodeData('a', { title: 'after' });
    expect(useCanvasStore.getState().nodes[0]?.data.title).toBe('after');

    expect(routeUndoRedo('undo')).toBe(true);
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().nodes[0]?.data.title).toBe('before')
    );

    routeUndoRedo('redo');
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().nodes[0]?.data.title).toBe('after')
    );
  });

  it('replays canvas entries through the unified timeline when active', async () => {
    unifiedUndoHistory.setNativeView('view-1');
    useCanvasStore.setState({
      activeViewId: 'view-1',
      nodes: [card('a', 'v0')],
    });
    useCanvasStore.getState().commitNodeData('a', { title: 'v1' });
    useCanvasStore.getState().commitNodeData('a', { title: 'v2' });
    expect(unifiedUndoHistory.getSnapshot().past).toHaveLength(2);

    routeUndoRedo('undo');
    await vi.waitFor(() =>
      expect(useCanvasStore.getState().nodes[0]?.data.title).toBe('v1')
    );
    expect(unifiedUndoHistory.getSnapshot().future).toHaveLength(1);
  });
});
