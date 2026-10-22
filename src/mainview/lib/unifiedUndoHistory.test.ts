import { describe, expect, it, vi } from 'vitest';
import {
  type PluginNoteHistoryEntry,
  UnifiedUndoHistory,
} from '@/lib/unifiedUndoHistory';

const pluginEvent = (
  action: 'record' | 'redo' | 'undo',
  operationId = `${action}-operation`
) => ({
  action,
  batchId: 'batch-a',
  label: 'Rename notes',
  operationId,
  pluginId: 'example.notes',
});

describe('UnifiedUndoHistory', () => {
  it('orders canvas and committed plugin events and replays them symmetrically', async () => {
    const history = new UnifiedUndoHistory();
    const calls: string[] = [];
    history.setContext('workspace-a', 'view-a');
    history.recordCanvas('view-a');
    history.observePluginTransition('workspace-a', pluginEvent('record'));
    history.recordCanvas('view-a');
    const handlers = {
      canvas: (action: 'redo' | 'undo') => {
        calls.push(`${action}:canvas`);
        return true;
      },
      plugin: async (
        entry: PluginNoteHistoryEntry,
        action: 'redo' | 'undo'
      ) => {
        calls.push(`${action}:${entry.batchId}`);
      },
    };

    await history.perform('undo', handlers);
    await history.perform('undo', handlers);
    await history.perform('undo', handlers);
    await history.perform('redo', handlers);
    await history.perform('redo', handlers);
    await history.perform('redo', handlers);

    expect(calls).toEqual([
      'undo:canvas',
      'undo:batch-a',
      'undo:canvas',
      'redo:canvas',
      'redo:batch-a',
      'redo:canvas',
    ]);
    expect(history.getSnapshot()).toMatchObject({
      past: [{ kind: 'canvas' }, { kind: 'plugin-note' }, { kind: 'canvas' }],
      future: [],
      pending: false,
    });
  });

  it('keeps the cursor fixed on failure and consumes concurrent requests', async () => {
    const history = new UnifiedUndoHistory();
    history.setContext('workspace-a', 'view-a');
    history.observePluginTransition('workspace-a', pluginEvent('record'));
    let reject!: (error: Error) => void;
    const plugin = vi.fn(
      () =>
        new Promise<void>((_resolve, rejectPromise) => {
          reject = rejectPromise;
        })
    );
    const handlers = { canvas: () => true, plugin };
    const first = history.perform('undo', handlers);

    await expect(history.perform('undo', handlers)).resolves.toBe('pending');
    reject(new Error('revision conflict'));
    await expect(first).rejects.toThrow('revision conflict');
    expect(history.getSnapshot()).toMatchObject({
      past: [{ kind: 'plugin-note' }],
      future: [],
      pending: false,
    });
  });

  it('deduplicates response/event confirmation in either order', async () => {
    const history = new UnifiedUndoHistory();
    history.setContext('workspace-a', 'view-a');
    history.observePluginTransition('workspace-a', pluginEvent('record'));
    const plugin = vi.fn(
      async (
        _entry: PluginNoteHistoryEntry,
        action: 'redo' | 'undo',
        operationId: string
      ) => {
        history.observePluginTransition(
          'workspace-a',
          pluginEvent(action, operationId)
        );
      }
    );

    await history.perform('undo', { canvas: () => true, plugin });
    expect(history.getSnapshot()).toMatchObject({
      past: [],
      future: [{ kind: 'plugin-note' }],
    });
  });

  it('clears the mixed cursor for a non-linear explicit plugin transition', () => {
    const history = new UnifiedUndoHistory();
    history.setContext('workspace-a', 'view-a');
    history.observePluginTransition('workspace-a', pluginEvent('record'));
    history.recordCanvas('view-a');

    history.observePluginTransition('workspace-a', pluginEvent('undo'));

    expect(history.getSnapshot()).toMatchObject({ past: [], future: [] });
  });

  it('clears redo on a new branch and resets on workspace or view changes', async () => {
    const history = new UnifiedUndoHistory();
    history.setContext('workspace-a', 'view-a');
    history.recordCanvas('view-a');
    await history.perform('undo', {
      canvas: () => true,
      plugin: async () => undefined,
    });
    history.observePluginTransition('workspace-a', pluginEvent('record'));
    expect(history.getSnapshot().future).toEqual([]);

    history.setContext('workspace-a', 'view-b');
    expect(history.getSnapshot()).toMatchObject({ past: [], future: [] });
    history.recordCanvas('view-b');
    history.setContext('workspace-b', 'view-b');
    expect(history.getSnapshot()).toMatchObject({ past: [], future: [] });
  });
});

describe('UnifiedUndoHistory stack sources (widget / extension / canvas)', () => {
  const setup = () => {
    const history = new UnifiedUndoHistory();
    history.setContext('workspace-a', 'view-a');
    const calls: string[] = [];
    const handlers = {
      canvas: vi.fn((action: 'redo' | 'undo') => {
        calls.push(`${action}:canvas`);
        history.observeCanvasTransition(action, 'view-a');
        return true;
      }),
      widget: vi.fn((widgetId: string, action: 'redo' | 'undo') => {
        calls.push(`${action}:widget:${widgetId}`);
        history.observeWidgetTransition(widgetId, action);
        return true;
      }),
      extensionInstance: vi.fn(
        (instanceId: string, action: 'redo' | 'undo') => {
          calls.push(`${action}:instance:${instanceId}`);
          history.observeExtensionInstanceTransition(instanceId, action);
          return true;
        }
      ),
      plugin: vi.fn(
        async (entry: PluginNoteHistoryEntry, action: 'redo' | 'undo') => {
          calls.push(`${action}:${entry.batchId}`);
        }
      ),
    };
    const kinds = () => ({
      past: history.getSnapshot().past.map((entry) => entry.kind),
      future: history.getSnapshot().future.map((entry) => entry.kind),
    });
    return { calls, handlers, history, kinds };
  };

  it('undoes the most recent action regardless of origin and redoes in order', async () => {
    const { calls, handlers, history } = setup();
    history.recordCanvas('view-a');
    history.recordWidget('w-1');
    history.observePluginTransition('workspace-a', pluginEvent('record'));
    history.recordExtensionInstance('inst-1');

    for (let i = 0; i < 4; i++) {
      await history.perform('undo', handlers);
    }
    for (let i = 0; i < 4; i++) {
      await history.perform('redo', handlers);
    }

    expect(calls).toEqual([
      'undo:instance:inst-1',
      'undo:batch-a',
      'undo:widget:w-1',
      'undo:canvas',
      'redo:canvas',
      'redo:widget:w-1',
      'redo:batch-a',
      'redo:instance:inst-1',
    ]);
    expect(history.getSnapshot().future).toEqual([]);
    expect(history.getSnapshot().past).toHaveLength(4);
  });

  it('moves the matching entry when a focused source undoes on its own', async () => {
    const { calls, handlers, history, kinds } = setup();
    history.recordWidget('w-1');
    history.recordCanvas('view-a');
    history.recordWidget('w-1');

    // Focused widget Cmd+Z goes straight to the widget stack.
    history.observeWidgetTransition('w-1', 'undo');
    expect(kinds()).toEqual({
      past: ['widget', 'canvas'],
      future: ['widget'],
    });

    // The next global undo reverts the canvas edit, not the widget again.
    await history.perform('undo', handlers);
    expect(calls).toEqual(['undo:canvas']);

    // Redo replays the most recently undone entry first.
    await history.perform('redo', handlers);
    await history.perform('redo', handlers);
    expect(calls).toEqual(['undo:canvas', 'redo:canvas', 'redo:widget:w-1']);
  });

  it('drops entries a source can no longer reach after an unmatched local move', () => {
    const { history, kinds } = setup();
    history.recordWidget('w-1');
    history.observeWidgetTransition('w-1', 'undo');
    history.recordCanvas('view-a');
    // w-1 has nothing left in the timeline's past, so another local undo
    // reaches an entry the timeline never saw: its redo entries are stale.
    history.observeWidgetTransition('w-1', 'undo');
    expect(kinds()).toEqual({ past: ['canvas'], future: [] });

    history.recordExtensionInstance('inst-1');
    history.observeExtensionInstanceTransition('inst-1', 'redo');
    expect(kinds()).toEqual({ past: ['canvas'], future: [] });
  });

  it('skips stale entries whose source has nothing left to undo', async () => {
    const { calls, handlers, history } = setup();
    history.recordCanvas('view-a');
    history.recordWidget('w-1');
    history.recordWidget('w-1');
    handlers.widget.mockImplementation((widgetId, action) => {
      calls.push(`${action}:widget:${widgetId}:empty`);
      return false;
    });

    await expect(history.perform('undo', handlers)).resolves.toBe('applied');

    expect(calls).toEqual(['undo:widget:w-1:empty', 'undo:canvas']);
    expect(history.getSnapshot()).toMatchObject({
      past: [],
      future: [{ kind: 'canvas' }],
      pending: false,
    });
  });

  it('treats a missing source handler as stale instead of wedging', async () => {
    const history = new UnifiedUndoHistory();
    history.setContext('workspace-a', 'view-a');
    history.recordWidget('w-1');
    const canvas = vi.fn(() => true);
    await expect(
      history.perform('undo', { canvas, plugin: async () => undefined })
    ).resolves.toBe('empty');
    expect(canvas).not.toHaveBeenCalled();
    expect(history.getSnapshot().past).toEqual([]);
  });

  it('reconciles an out-of-band canvas undo instead of clearing the timeline', () => {
    const { history, kinds } = setup();
    history.recordCanvas('view-a');
    history.recordWidget('w-1');

    history.observeCanvasTransition('undo', 'view-a');

    expect(kinds()).toEqual({ past: ['widget'], future: ['canvas'] });
  });

  it('forgets a source whose stack was discarded', () => {
    const { history, kinds } = setup();
    history.recordWidget('w-1');
    history.recordExtensionInstance('inst-1');
    history.recordWidget('w-2');
    history.observeWidgetTransition('w-2', 'undo');

    history.forgetWidget('w-1');
    history.forgetWidget('w-2');
    expect(kinds()).toEqual({ past: ['extension-instance'], future: [] });
    history.forgetExtensionInstance('inst-1');
    expect(kinds()).toEqual({ past: [], future: [] });
  });

  it('ignores stack records without an active context and falls back to canvas', async () => {
    const history = new UnifiedUndoHistory();
    history.recordWidget('w-1');
    history.recordExtensionInstance('inst-1');
    history.recordCanvas('view-a');
    expect(history.getSnapshot().past).toEqual([]);

    const canvas = vi.fn(() => true);
    await expect(
      history.perform('undo', { canvas, plugin: async () => undefined })
    ).resolves.toBe('applied');
    expect(canvas).toHaveBeenCalledWith('undo');
  });

  it('a new record of any origin abandons the redo branch', async () => {
    const { handlers, history, kinds } = setup();
    history.recordCanvas('view-a');
    history.recordExtensionInstance('inst-1');
    await history.perform('undo', handlers);
    expect(kinds().future).toEqual(['extension-instance']);

    history.recordWidget('w-9');
    expect(kinds()).toEqual({ past: ['canvas', 'widget'], future: [] });
  });
});
