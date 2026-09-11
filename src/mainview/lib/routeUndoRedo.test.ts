// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routeUndoRedo } from '@/lib/routeUndoRedo';
import { unifiedUndoHistory } from '@/lib/unifiedUndoHistory';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { useWidgetStore } from '@/store/widgetStore';

const { pluginRedo, pluginUndo } = vi.hoisted(() => ({
  pluginRedo: vi.fn(() => Promise.resolve()),
  pluginUndo: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/plugins/runtime/content', () => ({
  createPluginContent: () => ({ redo: pluginRedo, undo: pluginUndo }),
}));

vi.mock('../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
}));

const NATIVE_UNDO_ID = /^native_undo_/;
const NATIVE_REDO_ID = /^native_redo_/;

/**
 * `routeUndoRedo` hands the plugin call to `perform()` without awaiting it, so
 * the mock is invoked synchronously while the history is still `pending`. A
 * second `routeUndoRedo` in that window is rejected outright, so wait for the
 * operation to settle rather than for the mock to have been called.
 */
function settleHistory(): Promise<boolean> {
  return vi.waitUntil(() => !unifiedUndoHistory.getSnapshot().pending);
}

describe('routeUndoRedo', () => {
  beforeEach(() => {
    unifiedUndoHistory.reset();
    useCanvasStore.getState().reset();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('undoes and redoes the canvas when nothing is focused', () => {
    const undo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const redo = vi.spyOn(useCanvasStore.getState(), 'redo');

    expect(routeUndoRedo('undo')).toBe(true);
    expect(routeUndoRedo('redo')).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('routes a committed plugin batch through native undo and redo', async () => {
    unifiedUndoHistory.setContext('workspace-a', 'default');
    unifiedUndoHistory.observePluginTransition('workspace-a', {
      action: 'record',
      batchId: 'batch-a',
      label: 'Rename notes',
      operationId: 'batch-a',
      pluginId: 'example.notes',
    });

    expect(routeUndoRedo('undo')).toBe(true);
    await settleHistory();
    expect(pluginUndo).toHaveBeenCalledOnce();
    expect(pluginUndo).toHaveBeenCalledWith(
      'batch-a',
      expect.objectContaining({
        operationId: expect.stringMatching(NATIVE_UNDO_ID),
      })
    );
    expect(routeUndoRedo('redo')).toBe(true);
    await settleHistory();
    expect(pluginRedo).toHaveBeenCalledOnce();
    expect(pluginRedo).toHaveBeenCalledWith(
      'batch-a',
      expect.objectContaining({
        operationId: expect.stringMatching(NATIVE_REDO_ID),
      })
    );
  });

  it('routes to the focused widget', () => {
    const canvasUndo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const undoWidget = vi
      .spyOn(useWidgetStore.getState(), 'undoWidget')
      .mockImplementation(() => undefined);
    useCanvasStore.setState({
      focusedNode: {
        id: 'widget-node-1',
        type: 'widget',
        data: { widgetId: 'widget_1', kind: 'checklist' },
        rect: new DOMRect(0, 0, 100, 100),
      },
    });

    expect(routeUndoRedo('undo')).toBe(true);
    expect(undoWidget).toHaveBeenCalledWith('widget_1');
    expect(canvasUndo).not.toHaveBeenCalled();
  });

  it('routes to the focused extension instance', () => {
    const canvasUndo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const undoInstance = vi
      .spyOn(useExtensionInstanceStore.getState(), 'undoInstance')
      .mockImplementation(() => undefined);
    useCanvasStore.setState({
      focusedNode: {
        id: 'extension-node-1',
        type: 'extension',
        data: { instanceId: 'extinst_focused' },
        rect: new DOMRect(0, 0, 100, 100),
      },
    });

    expect(routeUndoRedo('undo')).toBe(true);
    expect(undoInstance).toHaveBeenCalledWith('extinst_focused');
    expect(canvasUndo).not.toHaveBeenCalled();
  });

  it('lets keyboard undo through while typing', () => {
    const undo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    expect(routeUndoRedo('undo', { fromKeyboard: true })).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it('runs execCommand when the application menu undoes inside an editor', () => {
    const undo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: exec,
    });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    expect(routeUndoRedo('undo')).toBe(true);
    expect(exec).toHaveBeenCalledWith('undo');
    expect(undo).not.toHaveBeenCalled();
  });
});
