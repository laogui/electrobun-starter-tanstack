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
