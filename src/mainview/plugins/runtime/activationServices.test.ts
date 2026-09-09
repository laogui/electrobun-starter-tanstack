// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PluginContext,
  PluginDefinition,
} from '../../../../packages/plugin-sdk';
import type { PluginRuntimeSnapshot } from '../../../shared/plugins/runtime';
import { PluginRuntime } from './PluginRuntime';

const runtimes: PluginRuntime[] = [];
const snapshot = (
  generation = '1',
  workspaceId = 'a'
): PluginRuntimeSnapshot => ({
  workspaceId,
  diagnostics: [],
  plugins: [
    {
      pluginId: 'example.test',
      name: 'Test',
      version: '1.0.0',
      development: true,
      generation,
      entryUrl: `http://localhost/${generation}.js`,
    },
  ],
});
function runtimeFor(setup: PluginDefinition['setup']) {
  const runtime = new PluginRuntime({
    importer: async () => ({ default: { setup } }),
  });
  runtimes.push(runtime);
  return runtime;
}
const content = {
  workspaceId: 'a',
  kind: 'note',
  operation: 'upsert',
  ids: ['note-a'],
} as const;
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
  vi.useRealTimers();
});

describe('A4 lifecycle-owned services', () => {
  it('publishes events only to the active workspace and cleans subscriptions on abort', async () => {
    let app!: PluginContext;
    const changed = vi.fn();
    const activated = vi.fn();
    const caller = new AbortController();
    const runtime = runtimeFor((context) => {
      app = context;
      app.events.on('content.changed', changed, { signal: caller.signal });
      app.events.on('workspace.activated', activated);
    });
    await runtime.sync(snapshot());
    expect(activated).toHaveBeenCalledWith({ workspaceId: 'a' });
    runtime.emitHostEvent('content.changed', { ...content, workspaceId: 'b' });
    expect(changed).not.toHaveBeenCalled();
    runtime.emitHostEvent('content.changed', content);
    expect(changed).toHaveBeenCalledOnce();
    caller.abort();
    runtime.emitHostEvent('content.changed', content);
    expect(changed).toHaveBeenCalledOnce();
    await runtime.dispose();
    expect(app.signal.aborted).toBe(true);
    expect(() => app.events.on('content.changed', changed)).toThrow();
  });

  it('isolates payloads, duplicate callback registrations and listener failures', async () => {
    const seen = vi.fn();
    const runtime = runtimeFor((app) => {
      app.events.on('content.changed', (event) => {
        (event.ids as string[]).push('mutated');
      });
      app.events.on('content.changed', () => {
        throw new Error('bad listener');
      });
      app.events.on('content.changed', async () => {
        throw new Error('async listener');
      });
      const release = app.events.on('content.changed', seen);
      app.events.on('content.changed', seen);
      release();
    });
    await runtime.sync(snapshot());
    runtime.emitHostEvent('content.changed', content);
    await Promise.resolve();
    expect(seen).toHaveBeenCalledExactlyOnceWith(content);
    expect(runtime.getSnapshot().diagnostics).toHaveLength(2);
  });

  it('does not publish candidate events or tasks and retains the old ones on failure', async () => {
    vi.useFakeTimers();
    let fail!: (error: Error) => void;
    const ready = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    const events = [vi.fn(), vi.fn(), vi.fn()];
    const tasks = [vi.fn(), vi.fn(), vi.fn()];
    let attempt = 0;
    const apps: PluginContext[] = [];
    const runtime = runtimeFor(async (app) => {
      const index = attempt++;
      apps.push(app);
      app.events.on('content.changed', events[index]!);
      app.tasks.schedule('tick', { every: 100 }, tasks[index]!);
      if (index === 1) {
        await ready;
      }
    });
    await runtime.sync(snapshot());
    const reloading = runtime.sync(snapshot('2'));
    await vi.advanceTimersByTimeAsync(150);
    runtime.emitHostEvent('content.changed', content);
    expect(tasks[0]).toHaveBeenCalledOnce();
    expect(tasks[1]).not.toHaveBeenCalled();
    expect(events[0]).toHaveBeenCalledOnce();
    expect(events[1]).not.toHaveBeenCalled();
    fail(new Error('candidate failed'));
    await reloading;
    expect(apps[0]?.signal.aborted).toBe(false);
    expect(apps[1]?.signal.aborted).toBe(true);
    await runtime.sync(snapshot('3'));
    expect(apps[0]?.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    runtime.emitHostEvent('content.changed', content);
    expect(tasks[0]).toHaveBeenCalledOnce();
    expect(tasks[2]).toHaveBeenCalledOnce();
    expect(events[2]).toHaveBeenCalledOnce();
    await runtime.sync({ ...snapshot(), workspaceId: 'b', plugins: [] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(tasks[2]).toHaveBeenCalledOnce();
  });

  it('skips overlapping ticks, supports early disposal, and records callback errors', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const run = vi.fn(() => pending);
    let stop!: () => void | Promise<void>;
    const runtime = runtimeFor((app) => {
      stop = app.tasks.schedule('slow', { every: 100 }, run);
      app.tasks.schedule(
        'fails',
        { at: new Date(Date.now() + 100) },
        async () => {
          throw new Error('task failed');
        }
      );
    });
    await runtime.sync(snapshot());
    await vi.advanceTimersByTimeAsync(350);
    expect(run).toHaveBeenCalledOnce();
    finish();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);
    await stop();
    await stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot().diagnostics[0]?.phase).toBe('task:fails');
  });

  it('skips past dates, waits through long timer ranges and rejects malformed schedules', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const past = vi.fn();
    const future = vi.fn();
    const runtime = runtimeFor((app) => {
      app.tasks.schedule('past', { at: new Date(now - 1) }, past);
      app.tasks.schedule(
        'future',
        { at: new Date(now + 2_147_483_647 + 100) },
        future
      );
      expect(() => app.tasks.schedule('future', { every: 1 }, future)).toThrow(
        'Duplicate'
      );
      for (const every of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() =>
          app.tasks.schedule('invalid', { every }, future)
        ).toThrow();
      }
      expect(() =>
        app.tasks.schedule('invalid', { at: new Date('invalid') }, future)
      ).toThrow();
    });
    await runtime.sync(snapshot());
    await vi.advanceTimersByTimeAsync(2_147_483_647);
    expect(past).not.toHaveBeenCalled();
    expect(future).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(future).toHaveBeenCalledOnce();
  });
});
