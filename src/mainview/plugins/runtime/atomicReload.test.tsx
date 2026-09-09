// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  PluginContext,
  PluginDefinition,
} from '../../../../packages/plugin-sdk';
import type { PluginRuntimeSnapshot } from '../../../shared/plugins/runtime';
import { PluginRuntime } from './PluginRuntime';

const runtimes: PluginRuntime[] = [];
afterEach(async () => {
  await act(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
  });
  document.body.replaceChildren();
});

function snapshot(
  generation: string,
  workspaceId = 'workspace'
): PluginRuntimeSnapshot {
  return {
    workspaceId,
    diagnostics: [],
    plugins: [
      {
        pluginId: 'example.atomic',
        name: 'Atomic',
        version: '1',
        development: true,
        generation,
        entryUrl: `http://localhost/plugins/token/example.atomic/1/${generation}/app.js`,
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

function createRuntime(importer: (url: string) => Promise<unknown>) {
  const runtime = new PluginRuntime({ importer, cleanupTimeoutMs: 20 });
  runtimes.push(runtime);
  return runtime;
}

it('keeps the exact React root, state, signal and commands through import and setup failures', async () => {
  const contexts: PluginContext[] = [];
  const oldCleanup = vi.fn();
  const unmount = vi.fn();
  const candidateCleanup = vi.fn();
  const workerTerminate = vi.fn();
  const oldCommand = vi.fn();
  const setupGate = deferred<void>();
  const candidateStarted = deferred<void>();
  function Counter() {
    const [count, setCount] = useState(0);
    useEffect(() => unmount, []);
    return (
      <button onClick={() => setCount(count + 1)} type="button">
        Preserved {count}
      </button>
    );
  }
  const setup: PluginDefinition['setup'] = (app) => {
    contexts.push(app);
    app.onCleanup(oldCleanup);
    app.commands.register({ id: 'run', title: 'Old command', run: oldCommand });
    app.panels.register({ id: 'view', title: 'Old view', component: Counter });
    app.panels.open('view');
  };
  const importer = vi
    .fn<(url: string) => Promise<unknown>>()
    .mockResolvedValueOnce({ default: { setup } })
    .mockRejectedValueOnce(new SyntaxError('candidate import failed'))
    .mockResolvedValueOnce({
      default: {
        async setup(app: PluginContext) {
          contexts.push(app);
          app.onCleanup(candidateCleanup);
          app.workers.track({
            terminate: workerTerminate,
          } as unknown as Worker);
          app.commands.register({
            id: 'run',
            title: 'Candidate command',
            run: vi.fn(),
          });
          app.panels.register({
            id: 'view',
            title: 'Candidate view',
            mount: vi.fn(),
          });
          app.panels.close('view');
          app.panels.open('view');
          candidateStarted.resolve();
          await setupGate.promise;
          throw new Error('candidate setup failed');
        },
      },
    });
  const runtime = createRuntime(importer);
  await act(async () => {
    await runtime.sync(snapshot('one'));
  });
  const button = screen.getByText('Preserved 0');
  fireEvent.click(button);
  expect(button).toHaveTextContent('Preserved 1');
  await act(async () => {
    await runtime.sync(snapshot('bad-import'));
  });
  const loading = runtime.sync(snapshot('bad-setup'));
  await candidateStarted.promise;
  expect(contexts[0]?.signal.aborted).toBe(false);
  expect(
    runtime.getSnapshot().commands.map((command) => command.title)
  ).toEqual(['Old command']);
  expect(screen.getByText('Preserved 1')).toBe(button);
  await runtime.runCommand('example.atomic', 'run');
  expect(oldCommand).toHaveBeenCalledOnce();
  setupGate.resolve();
  await act(async () => {
    await loading;
  });
  expect(contexts[0]?.generation).toBe(1);
  expect(contexts[1]?.generation).toBe(3);
  expect(contexts[0]?.signal.aborted).toBe(false);
  expect(contexts[1]?.signal.aborted).toBe(true);
  expect(oldCleanup).not.toHaveBeenCalled();
  expect(unmount).not.toHaveBeenCalled();
  expect(candidateCleanup).toHaveBeenCalledOnce();
  expect(workerTerminate).toHaveBeenCalledOnce();
  expect(screen.getByText('Preserved 1')).toBe(button);
  expect(runtime.getSnapshot().plugins[0]?.status).toBe('running');
  expect(
    runtime.getReleasedGenerations().map((item) => item.generation)
  ).toEqual(['bad-import', 'bad-setup']);
  await runtime.sync(snapshot('bad-setup'));
  expect(importer).toHaveBeenCalledTimes(3);
  expect(runtime.getSnapshot().diagnostics.map((item) => item.phase)).toEqual([
    'import',
    'setup',
  ]);
});

it('publishes the candidate only after old abort and sequential reverse cleanup', async () => {
  const events: string[] = [];
  const contexts: PluginContext[] = [];
  const oldCleanupGate = deferred<void>();
  const cleanupStarted = deferred<void>();
  const newMount = vi.fn();
  const runtime = createRuntime(async () => ({
    default: {
      async setup(app: PluginContext) {
        contexts.push(app);
        const number = contexts.length;
        events.push(`setup ${number}`);
        app.commands.register({
          id: 'run',
          title: `Command ${number}`,
          run: vi.fn(),
        });
        if (number === 1) {
          app.signal.addEventListener('abort', () => events.push('abort old'));
          app.onCleanup(() => {
            events.push('first');
          });
          app.onCleanup(async () => {
            events.push('second start');
            cleanupStarted.resolve();
            await oldCleanupGate.promise;
            events.push('second end');
          });
          const early = app.onCleanup(() => {
            events.push('early');
          });
          await early();
          await early();
          return () => {
            events.push('setup return');
          };
        }
        app.panels.register({ id: 'new', title: 'New panel', mount: newMount });
        app.panels.open('new');
      },
    },
  }));
  await runtime.sync(snapshot('one'));
  const reloading = runtime.sync(snapshot('two'));
  await cleanupStarted.promise;
  expect(contexts.map((app) => app.generation)).toEqual([1, 2]);
  expect(contexts[0]?.signal.aborted).toBe(true);
  expect(contexts[1]?.signal.aborted).toBe(false);
  expect(runtime.getSnapshot().commands).toEqual([]);
  expect(newMount).not.toHaveBeenCalled();
  expect(events).toEqual([
    'setup 1',
    'early',
    'setup 2',
    'abort old',
    'setup return',
    'second start',
  ]);
  oldCleanupGate.resolve();
  await reloading;
  expect(events.slice(-2)).toEqual(['second end', 'first']);
  expect(runtime.getSnapshot().commands.map((item) => item.title)).toEqual([
    'Command 2',
  ]);
  expect(newMount).toHaveBeenCalledOnce();
  expect(
    runtime.getReleasedGenerations().map((item) => item.generation)
  ).toEqual(['one']);
  await runtime.dispose();
  expect(contexts[1]?.signal.aborted).toBe(true);
});

it.each([
  'disable',
  'workspace',
  'supersede',
] as const)('aborts a pending candidate on %s and never resurrects late results', async (action) => {
  const pending = deferred<void>();
  const started = deferred<void>();
  const contexts: PluginContext[] = [];
  const lateCleanup = vi.fn();
  const runtime = createRuntime(async () => ({
    default: {
      async setup(app: PluginContext) {
        contexts.push(app);
        app.commands.register({
          id: 'run',
          title: `Generation ${app.generation}`,
          run: vi.fn(),
        });
        if (app.generation === 2) {
          started.resolve();
          await pending.promise;
          return lateCleanup;
        }
      },
    },
  }));
  await runtime.sync(snapshot('one'));
  const loading = runtime.sync(snapshot('two'));
  await started.promise;
  const next =
    action === 'disable'
      ? { ...snapshot('two'), plugins: [] }
      : snapshot('three', action === 'workspace' ? 'other' : 'workspace');
  await runtime.sync(next);
  await loading;
  expect(contexts[1]?.signal.aborted).toBe(true);
  expect(() =>
    contexts[1]?.commands.register({ id: 'late', title: 'Late', run: vi.fn() })
  ).toThrow('no longer active');
  pending.resolve();
  await vi.waitFor(() => expect(lateCleanup).toHaveBeenCalledOnce());
  expect(runtime.getSnapshot().commands.map((item) => item.title)).toEqual(
    action === 'disable' ? [] : ['Generation 3']
  );
});

it('cancels a candidate during successful handoff cleanup without publishing it', async () => {
  const cleanup = deferred<void>();
  const started = deferred<void>();
  const contexts: PluginContext[] = [];
  const runtime = createRuntime(async () => ({
    default: {
      setup(app: PluginContext) {
        contexts.push(app);
        app.commands.register({
          id: 'run',
          title: String(app.generation),
          run: vi.fn(),
        });
        if (app.generation === 1) {
          app.onCleanup(() => {
            started.resolve();
            return cleanup.promise;
          });
        }
      },
    },
  }));
  await runtime.sync(snapshot('one'));
  const reloading = runtime.sync(snapshot('two'));
  await started.promise;
  const disabled = runtime.sync({ ...snapshot('two'), plugins: [] });
  expect(contexts.every((app) => app.signal.aborted)).toBe(true);
  cleanup.resolve();
  await Promise.all([reloading, disabled]);
  expect(runtime.getSnapshot().commands).toEqual([]);
  expect(runtime.getSnapshot().plugins).toEqual([]);
});
