// @vitest-environment jsdom
import { expect, it } from 'vitest';
import type { PluginContext } from '../../../../packages/plugin-sdk';
import type { PluginRuntimeSnapshot } from '../../../shared/plugins/runtime';
import { PluginRuntime } from './PluginRuntime';

it.each([
  'disable',
  'dispose',
  'workspace',
] as const)('honors reentrant %s from a superseded candidate abort handler', async (action) => {
  const snapshot = (
    generation: string,
    workspaceId = 'original'
  ): PluginRuntimeSnapshot => ({
    workspaceId,
    diagnostics: [],
    plugins: [
      {
        pluginId: 'example.reentrant',
        name: 'Reentrant',
        version: '1',
        generation,
        development: true,
        entryUrl: `http://localhost/plugins/token/example.reentrant/1/${generation}/app.js`,
      },
    ],
  });
  const contexts: PluginContext[] = [];
  let started!: () => void;
  const candidateStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let nested: Promise<void> | undefined;
  const runtime = new PluginRuntime({
    importer: async () => ({
      default: {
        setup(app: PluginContext) {
          contexts.push(app);
          app.commands.register({
            id: 'run',
            title: app.workspaceId,
            run() {},
          });
          if (app.generation === 2) {
            app.signal.addEventListener('abort', () => {
              nested =
                action === 'dispose'
                  ? runtime.dispose()
                  : runtime.sync(
                      action === 'disable'
                        ? { ...snapshot('two'), plugins: [] }
                        : snapshot('four', 'new-workspace')
                    );
            });
            started();
            return new Promise<void>(() => undefined);
          }
        },
      },
    }),
  });
  try {
    await runtime.sync(snapshot('one'));
    const pending = runtime.sync(snapshot('two'));
    await candidateStarted;
    await runtime.sync(snapshot('three'));
    await nested;
    await pending;
    expect(contexts[0]?.signal.aborted).toBe(true);
    expect(contexts[1]?.signal.aborted).toBe(true);
    if (action === 'workspace') {
      expect(contexts.map((app) => app.workspaceId)).toEqual([
        'original',
        'original',
        'new-workspace',
      ]);
      expect(
        runtime.getSnapshot().commands.map((command) => command.title)
      ).toEqual(['new-workspace']);
    } else {
      expect(contexts).toHaveLength(2);
      expect(runtime.getSnapshot().plugins).toEqual([]);
      expect(runtime.getSnapshot().commands).toEqual([]);
    }
  } finally {
    await runtime.dispose();
  }
});
