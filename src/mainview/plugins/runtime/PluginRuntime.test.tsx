// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Disposer,
  PluginContext,
  PluginDefinition,
} from '../../../../packages/plugin-sdk';
import { definePlugin } from '../../../../packages/plugin-sdk/index.js';
import type { PluginRuntimeSnapshot } from '../../../shared/plugins/runtime';
import { PluginRuntime, redactPluginError } from './PluginRuntime';
import { PluginWorkbench } from './PluginWorkbench';

it('keeps the message when WKWebView provides only frames in Error.stack', () => {
  const error = new Error('the plugin failed');
  error.stack =
    'setup@http://127.0.0.1/plugins/secret/example.test/1.0.0/gen/app.js:3:4';
  const text = redactPluginError(error);
  expect(text).toContain('Error: the plugin failed');
  expect(text).toContain(
    '/plugins/[redacted]/example.test/1.0.0/gen/app.js:3:4'
  );
  expect(text).not.toContain('/secret/');
});

function snapshot(
  generation = '1',
  workspaceId = 'workspace-a'
): PluginRuntimeSnapshot {
  return {
    workspaceId,
    diagnostics: [],
    plugins: [
      {
        pluginId: 'example.test',
        name: 'Test plugin',
        version: '1.0.0',
        development: true,
        generation,
        entryUrl: `http://127.0.0.1/plugins/secret/example.test/1.0.0/${generation}/app.js`,
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const runtimes: PluginRuntime[] = [];
function runtimeFor(setup: PluginDefinition['setup']) {
  const runtime = new PluginRuntime({
    importer: async () => ({ default: definePlugin({ setup }) }),
    cleanupTimeoutMs: 20,
  });
  runtimes.push(runtime);
  return runtime;
}

afterEach(async () => {
  await act(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
  });
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('trusted plugin runtime', () => {
  it('exports the identity SDK without importing host state', () => {
    const definition = { setup: () => undefined };
    expect(definePlugin(definition)).toBe(definition);
  });

  it('registers commands, checks enabled at invocation and cleans once', async () => {
    let enabled = false;
    const run = vi.fn();
    const cleanup = vi.fn();
    const terminate = vi.fn();
    const runtime = runtimeFor((app) => {
      expect(Object.isFrozen(app)).toBe(true);
      expect(app.workspaceId).toBe('workspace-a');
      app.commands.register({
        id: 'run',
        title: 'Run',
        enabled: () => enabled,
        run,
      });
      app.onCleanup(cleanup);
      app.workers.track({ terminate } as unknown as Worker);
    });
    await runtime.sync(snapshot());
    expect(runtime.getSnapshot()).toBe(runtime.getSnapshot());
    await runtime.runCommand('example.test', 'run');
    expect(run).not.toHaveBeenCalled();
    enabled = true;
    await runtime.runCommand('example.test', 'run');
    expect(run).toHaveBeenCalledOnce();
    await runtime.dispose();
    await runtime.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot().commands).toEqual([]);
  });

  it('closes a DOM panel without unregistering commands and remounts a clean view', async () => {
    const cleanup = vi.fn();
    const mount = vi.fn((element: HTMLElement) => {
      element.textContent = 'DOM view';
      return cleanup;
    });
    const run = vi.fn();
    const runtime = runtimeFor((app) => {
      app.commands.register({ id: 'run', title: 'Run', run });
      app.panels.register({ id: 'view', title: 'View', mount });
    });
    await runtime.sync(snapshot());
    runtime.openPanel('example.test', 'view');
    expect(screen.getByText('DOM view')).toBeInTheDocument();
    runtime.closePanel('example.test', 'view');
    expect(screen.queryByText('DOM view')).not.toBeInTheDocument();
    await runtime.runCommand('example.test', 'run');
    expect(run).toHaveBeenCalledOnce();
    runtime.openPanel('example.test', 'view');
    expect(mount).toHaveBeenCalledTimes(2);
    expect(mount.mock.calls[0]?.[0]).not.toBe(mount.mock.calls[1]?.[0]);
    await runtime.dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it.each([
    'commands',
    'panels',
  ] as const)('rejects duplicate %s IDs and cleans failed setup', async (kind) => {
    const cleanup = vi.fn();
    const runtime = runtimeFor((app) => {
      app.onCleanup(cleanup);
      if (kind === 'commands') {
        const definition = { id: 'same', title: 'Same', run: () => undefined };
        app.commands.register(definition);
        app.commands.register(definition);
      } else {
        const definition = {
          id: 'same',
          title: 'Same',
          mount: () => undefined,
        };
        app.panels.register(definition);
        app.panels.register(definition);
      }
    });
    await runtime.sync(snapshot());
    expect(cleanup).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot().plugins[0]?.status).toBe('failed');
    expect(runtime.getSnapshot().commands).toHaveLength(0);
    expect(runtime.getSnapshot().panels).toHaveLength(0);
    expect(runtime.getSnapshot().diagnostics[0]?.message).toContain(
      'Duplicate'
    );
  });

  it('reports import failure and invalid module exports', async () => {
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error('import failed'))
      .mockResolvedValueOnce({ setup: () => undefined });
    const runtime = new PluginRuntime({ importer });
    runtimes.push(runtime);
    await runtime.sync(snapshot());
    expect(runtime.getSnapshot().plugins[0]?.status).toBe('failed');
    await runtime.sync(snapshot('2'));
    expect(
      runtime
        .getSnapshot()
        .diagnostics.map((d) => d.message)
        .join()
    ).toContain('default-export');
  });

  it('reclaims registrations and workers after async setup rejects', async () => {
    const pending = deferred<void>();
    const terminate = vi.fn();
    const runtime = runtimeFor(async (app) => {
      app.commands.register({ id: 'run', title: 'Run', run: () => undefined });
      app.workers.track({ terminate } as unknown as Worker);
      await pending.promise;
      throw new Error('async failure');
    });
    const loading = runtime.sync(snapshot());
    await Promise.resolve();
    await Promise.resolve();
    pending.resolve();
    await loading;
    expect(terminate).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot().commands).toEqual([]);
  });

  it('cancels a slow import without awaiting it and never calls its setup', async () => {
    const pending = deferred<unknown>();
    const setup = vi.fn();
    const runtime = new PluginRuntime({ importer: () => pending.promise });
    runtimes.push(runtime);
    const loading = runtime.sync(snapshot());
    await Promise.resolve();
    await runtime.sync({ ...snapshot(), plugins: [] });
    await loading;
    pending.resolve({ default: { setup } });
    await Promise.resolve();
    await Promise.resolve();
    expect(setup).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().plugins).toEqual([]);
  });

  it('disposes late async setup results and refuses stale registrations', async () => {
    const pending = deferred<void>();
    const lateCleanup = vi.fn();
    const contexts: PluginContext[] = [];
    const runtime = runtimeFor(async (app) => {
      contexts.push(app);
      app.commands.register({ id: 'run', title: 'Run', run: () => undefined });
      if (contexts.length === 1) {
        await pending.promise;
      }
      return lateCleanup;
    });
    const old = runtime.sync(snapshot());
    await Promise.resolve();
    await Promise.resolve();
    await runtime.sync(snapshot('2'));
    await old;
    expect(() =>
      contexts[0]?.commands.register({
        id: 'late',
        title: 'Late',
        run: () => undefined,
      })
    ).toThrow('no longer active');
    pending.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(lateCleanup).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot().commands).toHaveLength(1);
    expect(runtime.getSnapshot().plugins[0]?.status).toBe('running');
  });

  it('binds a new activation to a changed workspace and old disposers cannot remove new IDs', async () => {
    const contexts: PluginContext[] = [];
    const disposers: Disposer[] = [];
    const runtime = runtimeFor((app) => {
      contexts.push(app);
      disposers.push(
        app.commands.register({
          id: 'run',
          title: app.workspaceId,
          run: () => undefined,
        })
      );
    });
    await runtime.sync(snapshot());
    await runtime.sync(snapshot('1', 'workspace-b'));
    await disposers[0]?.();
    expect(contexts.map((app) => app.workspaceId)).toEqual([
      'workspace-a',
      'workspace-b',
    ]);
    expect(runtime.getSnapshot().commands[0]?.title).toBe('workspace-b');
  });

  it('times out asynchronous cleanup without blocking another plugin', async () => {
    vi.useFakeTimers();
    const runtime = runtimeFor((app) => {
      if (app.pluginId === 'example.test') {
        app.onCleanup(() => new Promise(() => undefined));
      }
    });
    await runtime.sync(snapshot());
    const next = snapshot('2');
    next.plugins.push({ ...next.plugins[0]!, pluginId: 'example.other' });
    const updating = runtime.sync(next);
    await vi.advanceTimersByTimeAsync(0);
    expect(
      runtime.getSnapshot().plugins.find((p) => p.pluginId === 'example.other')
        ?.status
    ).toBe('running');
    await vi.advanceTimersByTimeAsync(21);
    await updating;
    expect(
      runtime
        .getSnapshot()
        .diagnostics.some((d) => d.message.includes('timed out'))
    ).toBe(true);
    const disposal = runtime.dispose();
    await vi.advanceTimersByTimeAsync(21);
    await disposal;
  });

  it('clears a DOM mount that throws and reports command/enablement errors', async () => {
    const runtime = runtimeFor((app) => {
      app.commands.register({
        id: 'throw',
        title: 'Throw',
        run: () => {
          throw new Error('command failed');
        },
      });
      app.commands.register({
        id: 'disabled',
        title: 'Disabled',
        enabled: () => {
          throw new Error('enabled failed');
        },
        run: vi.fn(),
      });
      app.panels.register({
        id: 'broken',
        title: 'Broken',
        mount: (element) => {
          element.textContent = 'partial';
          throw new Error('mount failed');
        },
      });
    });
    await runtime.sync(snapshot());
    runtime.openPanel('example.test', 'broken');
    expect(document.querySelector('[data-plugin-panel]')).toBeNull();
    await runtime.runCommand('example.test', 'throw');
    await runtime.runCommand('example.test', 'disabled');
    expect(runtime.getSnapshot().diagnostics.map((d) => d.phase)).toEqual([
      'panel',
      'command',
      'enabled',
    ]);
  });

  it('uses independent React roots with hooks, clean reopens and an error boundary', async () => {
    const unmounted = vi.fn();
    let broken = false;
    function Counter() {
      const [count, setCount] = useState(0);
      useEffect(() => unmounted, []);
      if (broken) {
        throw new Error('render failed');
      }
      return (
        <button onClick={() => setCount(count + 1)} type="button">
          Count {count}
        </button>
      );
    }
    const runtime = runtimeFor((app) => {
      app.panels.register({
        id: 'counter',
        title: 'Counter',
        component: Counter,
      });
    });
    await runtime.sync(snapshot());
    render(<PluginWorkbench runtime={runtime} />);
    await act(async () => {
      runtime.openPanel('example.test', 'counter');
    });
    fireEvent.click(screen.getByText('Count 0'));
    expect(screen.getByText('Count 1')).toBeInTheDocument();
    await act(async () => {
      runtime.closePanel('example.test', 'counter');
    });
    expect(unmounted).toHaveBeenCalledOnce();
    await act(async () => {
      runtime.openPanel('example.test', 'counter');
    });
    expect(screen.getByText('Count 0')).toBeInTheDocument();
    await act(async () => {
      runtime.closePanel('example.test', 'counter');
    });
    broken = true;
    await act(async () => {
      runtime.openPanel('example.test', 'counter');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Panel failed');
    expect(screen.getByLabelText('Plugin workbench')).toBeInTheDocument();
    expect(
      runtime.getSnapshot().diagnostics.some((d) => d.phase === 'panel')
    ).toBe(true);
    await act(async () => {
      runtime.closePanel('example.test', 'counter');
    });
    broken = false;
    await act(async () => {
      runtime.openPanel('example.test', 'counter');
    });
    expect(screen.getByText('Count 0')).toBeInTheDocument();
  });

  it('redacts launch tokens while retaining source locations', () => {
    expect(
      redactPluginError(
        new Error(
          'at http://127.0.0.1/plugins/top-secret/example.test/1/2/app.js:12:9'
        )
      )
    ).toContain('/plugins/[redacted]/example.test/1/2/app.js:12:9');
    expect(
      redactPluginError('https://localhost/app.js?token=secret#source')
    ).not.toContain('secret');
  });

  it('shortcuts preserve editing, repeat keys and host bindings, and disappear on disable', async () => {
    const run = vi.fn();
    const reserved = vi.fn();
    const runtime = runtimeFor((app) => {
      app.commands.register({
        id: 'run',
        title: 'Run',
        shortcut: 'Mod+Shift+J',
        run,
      });
      app.commands.register({
        id: 'reserved',
        title: 'Reserved',
        shortcut: 'Mod+K',
        run: reserved,
      });
    });
    await runtime.sync(snapshot());
    const detach = runtime.attachShortcuts();
    const send = (target: EventTarget, init: KeyboardEventInit = {}) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'j',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
          ...init,
        })
      );
    for (const tag of ['input', 'textarea', 'select', 'div']) {
      const element = document.createElement(tag);
      if (tag === 'div') {
        element.contentEditable = 'true';
        element.setAttribute('contenteditable', 'true');
      }
      document.body.append(element);
      send(element);
      element.remove();
    }
    send(window, { repeat: true });
    send(window, { key: 'k', shiftKey: false });
    expect(run).not.toHaveBeenCalled();
    expect(reserved).not.toHaveBeenCalled();
    expect(send(window)).toBe(false);
    expect(run).toHaveBeenCalledOnce();
    await runtime.sync({ ...snapshot(), plugins: [] });
    send(window);
    expect(run).toHaveBeenCalledOnce();
    detach();
  });

  it('waits for prior cleanup across rapid disable and re-enable races', async () => {
    const cleanup = deferred<void>();
    const setup = vi.fn<PluginDefinition['setup']>((app) => {
      if (setup.mock.calls.length === 1) {
        app.onCleanup(() => cleanup.promise);
      }
    });
    const runtime = runtimeFor(setup);
    await runtime.sync(snapshot());
    const second = runtime.sync(snapshot('2'));
    const disabled = runtime.sync({ ...snapshot(), plugins: [] });
    const third = runtime.sync(snapshot('3'));
    await Promise.resolve();
    await Promise.resolve();
    expect(setup).toHaveBeenCalledOnce();
    cleanup.resolve();
    await Promise.all([second, disabled, third]);
    expect(setup).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot().plugins[0]?.status).toBe('running');
  });

  it('keeps the new registration when a same-activation disposer is called twice', async () => {
    let app!: PluginContext;
    const runtime = runtimeFor((context) => {
      app = context;
    });
    await runtime.sync(snapshot());
    const definition = { id: 'same', title: 'Old', run: () => undefined };
    const old = app.commands.register(definition);
    definition.id = 'changed-after-registration';
    await old();
    app.commands.register({ id: 'same', title: 'New', run: () => undefined });
    await old();
    expect(runtime.getSnapshot().commands[0]?.title).toBe('New');
  });

  it('continues cleanup after a disposer throws and immediately terminates late workers', async () => {
    let app!: PluginContext;
    const cleanup = vi.fn();
    const terminate = vi.fn();
    const runtime = runtimeFor((context) => {
      app = context;
      app.onCleanup(cleanup);
      app.onCleanup(() => {
        throw new Error('cleanup failed');
      });
    });
    await runtime.sync(snapshot());
    await runtime.dispose();
    app.workers.track({ terminate } as unknown as Worker);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot().diagnostics[0]?.phase).toBe('cleanup');
  });

  it('cleans a panel that closes itself while mounting exactly once', async () => {
    const disposeView = vi.fn();
    const disposeShell = vi.fn();
    let app!: PluginContext;
    const runtime = new PluginRuntime({
      importer: async () => ({
        default: {
          setup(context: PluginContext) {
            app = context;
            app.panels.register({
              id: 'view',
              title: 'View',
              mount: () => {
                app.panels.close('view');
                return disposeView;
              },
            });
          },
        },
      }),
      mountPanel: () => ({
        element: document.createElement('div'),
        dispose: disposeShell,
      }),
    });
    runtimes.push(runtime);
    await runtime.sync(snapshot());
    runtime.openPanel('example.test', 'view');
    await runtime.dispose();
    expect(disposeShell).toHaveBeenCalledOnce();
    expect(disposeView).toHaveBeenCalledOnce();
  });

  it('diagnoses conflicting plugin shortcuts rather than running both', async () => {
    const run = vi.fn();
    const runtime = runtimeFor((app) => {
      for (const id of ['one', 'two']) {
        app.commands.register({ id, title: id, shortcut: 'Mod+J', run });
      }
    });
    await runtime.sync(snapshot());
    const detach = runtime.attachShortcuts();
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'j',
        metaKey: true,
        cancelable: true,
      })
    );
    expect(run).not.toHaveBeenCalled();
    expect(
      runtime
        .getSnapshot()
        .diagnostics.some((d) => d.message.includes('Conflicting'))
    ).toBe(true);
    detach();
  });
});
