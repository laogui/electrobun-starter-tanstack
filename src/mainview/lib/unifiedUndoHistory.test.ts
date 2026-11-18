import { describe, expect, it, vi } from 'vitest';
import { UnifiedUndoHistory } from './unifiedUndoHistory';

describe('UnifiedUndoHistory', () => {
  it('clears redo on a new branch and resets on view changes', () => {
    const history = new UnifiedUndoHistory();
    history.setNativeView('view-a');
    history.recordCanvas('view-a');
    history.perform('undo', { canvas: () => true });
    expect(history.getSnapshot().future).toHaveLength(1);
    history.recordCanvas('view-a');
    expect(history.getSnapshot().future).toEqual([]);

    history.setNativeView('view-b');
    expect(history.getSnapshot()).toMatchObject({ past: [], future: [] });
  });
});

describe('UnifiedUndoHistory stack sources (extension / canvas)', () => {
  const setup = () => {
    const history = new UnifiedUndoHistory();
    history.setNativeView('view-a');
    const calls: string[] = [];
    const handlers = {
      canvas: vi.fn((action: 'redo' | 'undo') => {
        calls.push(`${action}:canvas`);
        history.observeCanvasTransition(action, 'view-a');
        return true;
      }),
      extensionInstance: vi.fn(
        (instanceId: string, action: 'redo' | 'undo') => {
          calls.push(`${action}:instance:${instanceId}`);
          history.observeExtensionInstanceTransition(instanceId, action);
          return true;
        }
      ),
    };
    const kinds = () => ({
      past: history.getSnapshot().past.map((entry) => entry.kind),
      future: history.getSnapshot().future.map((entry) => entry.kind),
    });
    return { calls, handlers, history, kinds };
  };

  it('undoes the most recent action regardless of origin and redoes in order', () => {
    const { calls, handlers, history } = setup();
    history.recordCanvas('view-a');
    history.recordExtensionInstance('w-1');
    history.recordExtensionInstance('inst-1');

    for (let i = 0; i < 3; i++) {
      history.perform('undo', handlers);
    }
    for (let i = 0; i < 3; i++) {
      history.perform('redo', handlers);
    }

    expect(calls).toEqual([
      'undo:instance:inst-1',
      'undo:instance:w-1',
      'undo:canvas',
      'redo:canvas',
      'redo:instance:w-1',
      'redo:instance:inst-1',
    ]);
    expect(history.getSnapshot().future).toEqual([]);
    expect(history.getSnapshot().past).toHaveLength(3);
  });

  it('moves the matching entry when a focused source undoes on its own', () => {
    const { calls, handlers, history, kinds } = setup();
    history.recordExtensionInstance('w-1');
    history.recordCanvas('view-a');
    history.recordExtensionInstance('w-1');

    // Focused instance Cmd+Z goes straight to its own stack.
    history.observeExtensionInstanceTransition('w-1', 'undo');
    expect(kinds()).toEqual({
      past: ['extension-instance', 'canvas'],
      future: ['extension-instance'],
    });

    // The next global undo reverts the canvas edit, not the instance again.
    history.perform('undo', handlers);
    expect(calls).toEqual(['undo:canvas']);

    // Redo replays the most recently undone entry first.
    history.perform('redo', handlers);
    history.perform('redo', handlers);
    expect(calls).toEqual(['undo:canvas', 'redo:canvas', 'redo:instance:w-1']);
  });

  it('drops entries a source can no longer reach after an unmatched local move', () => {
    const { history, kinds } = setup();
    history.recordExtensionInstance('w-1');
    history.observeExtensionInstanceTransition('w-1', 'undo');
    history.recordCanvas('view-a');
    // w-1 has nothing left in the timeline's past, so another local undo
    // reaches an entry the timeline never saw: its redo entries are stale.
    history.observeExtensionInstanceTransition('w-1', 'undo');
    expect(kinds()).toEqual({ past: ['canvas'], future: [] });

    history.recordExtensionInstance('inst-1');
    history.observeExtensionInstanceTransition('inst-1', 'redo');
    expect(kinds()).toEqual({ past: ['canvas'], future: [] });
  });

  it('skips stale entries whose source has nothing left to undo', () => {
    const { calls, handlers, history } = setup();
    history.recordCanvas('view-a');
    history.recordExtensionInstance('w-1');
    history.recordExtensionInstance('w-1');
    handlers.extensionInstance.mockImplementation((instanceId, action) => {
      calls.push(`${action}:instance:${instanceId}:empty`);
      return false;
    });

    expect(history.perform('undo', handlers)).toBe('applied');

    expect(calls).toEqual(['undo:instance:w-1:empty', 'undo:canvas']);
    expect(history.getSnapshot()).toMatchObject({
      past: [],
      future: [{ kind: 'canvas' }],
      pending: false,
    });
  });

  it('treats a missing source handler as stale instead of wedging', () => {
    const history = new UnifiedUndoHistory();
    history.setNativeView('view-a');
    history.recordExtensionInstance('w-1');
    const canvas = vi.fn(() => true);
    expect(history.perform('undo', { canvas })).toBe('empty');
    expect(canvas).not.toHaveBeenCalled();
    expect(history.getSnapshot().past).toEqual([]);
  });

  it('reconciles an out-of-band canvas undo instead of clearing the timeline', () => {
    const { history, kinds } = setup();
    history.recordCanvas('view-a');
    history.recordExtensionInstance('w-1');

    history.observeCanvasTransition('undo', 'view-a');

    expect(kinds()).toEqual({
      past: ['extension-instance'],
      future: ['canvas'],
    });
  });

  it('forgets a source whose stack was discarded', () => {
    const { history, kinds } = setup();
    history.recordExtensionInstance('w-1');
    history.recordExtensionInstance('inst-1');
    history.recordExtensionInstance('w-2');
    history.observeExtensionInstanceTransition('w-2', 'undo');

    history.forgetExtensionInstance('w-1');
    history.forgetExtensionInstance('w-2');
    expect(kinds()).toEqual({ past: ['extension-instance'], future: [] });
    history.forgetExtensionInstance('inst-1');
    expect(kinds()).toEqual({ past: [], future: [] });
  });

  it('ignores stack records without an active context and falls back to canvas', () => {
    const history = new UnifiedUndoHistory();
    history.recordExtensionInstance('w-1');
    history.recordExtensionInstance('inst-1');
    history.recordCanvas('view-a');
    expect(history.getSnapshot().past).toEqual([]);

    const canvas = vi.fn(() => true);
    expect(history.perform('undo', { canvas })).toBe('applied');
    expect(canvas).toHaveBeenCalledWith('undo');
  });

  it('a new record of any origin abandons the redo branch', () => {
    const { handlers, history, kinds } = setup();
    history.recordCanvas('view-a');
    history.recordExtensionInstance('inst-1');
    history.perform('undo', handlers);
    expect(kinds().future).toEqual(['extension-instance']);

    history.recordExtensionInstance('w-9');
    expect(kinds()).toEqual({
      past: ['canvas', 'extension-instance'],
      future: [],
    });
  });
});
