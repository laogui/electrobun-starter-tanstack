// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Disposer, PluginContext } from '../../../../packages/plugin-sdk';
import type { PluginRuntimeSnapshot } from '../../../shared/plugins/runtime';
import { PluginRuntime } from './PluginRuntime';

const runtimes: PluginRuntime[] = [];
const INVALID_IMPORTER_MESSAGE_RE = /Importer|filter|Duplicate/;

function snapshot(
  generation = 'one',
  workspaceId = 'workspace-a'
): PluginRuntimeSnapshot {
  return {
    diagnostics: [],
    plugins: [
      {
        development: true,
        entryUrl: `http://localhost/plugins/example.csv/${generation}/app.js`,
        generation,
        name: 'CSV importer',
        pluginId: 'example.csv',
        version: '1.0.0',
      },
    ],
    workspaceId,
  };
}

function createRuntime(setup: (app: PluginContext) => void | Promise<void>) {
  const runtime = new PluginRuntime({
    importer: async () => ({ default: { setup } }),
  });
  runtimes.push(runtime);
  return runtime;
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

describe('plugin importer registrations', () => {
  it('publishes normalized metadata and lets its disposer unregister it', async () => {
    let dispose!: Disposer;
    const parse = vi.fn(async () => ({ notes: [], warnings: [] }));
    const runtime = createRuntime((app) => {
      dispose = app.importers.register({
        accept: [
          {
            description: ' CSV files ',
            extensions: ['.CSV', '.csv'],
          },
        ],
        id: 'notes-csv',
        parse,
        title: 'Import notes',
      });
    });

    await runtime.sync(snapshot());

    expect(runtime.getSnapshot().importers).toEqual([
      {
        accept: [
          {
            description: 'CSV files',
            extensions: ['.csv'],
          },
        ],
        id: 'notes-csv',
        pluginId: 'example.csv',
        title: 'Import notes',
      },
    ]);
    expect(Object.isFrozen(runtime.getSnapshot().importers[0]?.accept)).toBe(
      true
    );
    await dispose();
    expect(runtime.getSnapshot().importers).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'missing parse',
      register(app: PluginContext) {
        app.importers.register({
          accept: [{ description: 'CSV', extensions: ['.csv'] }],
          id: 'notes-csv',
          title: 'Import notes',
        } as never);
      },
    },
    {
      label: 'empty filters',
      register(app: PluginContext) {
        app.importers.register({
          accept: [],
          id: 'notes-csv',
          parse: async () => ({ notes: [], warnings: [] }),
          title: 'Import notes',
        });
      },
    },
    {
      label: 'duplicate id',
      register(app: PluginContext) {
        const definition = {
          accept: [{ description: 'CSV', extensions: ['.csv'] }],
          id: 'notes-csv',
          parse: async () => ({ notes: [], warnings: [] }),
          title: 'Import notes',
        };
        app.importers.register(definition);
        app.importers.register(definition);
      },
    },
  ])('rejects $label without publishing a contribution', async ({
    register,
  }) => {
    const runtime = createRuntime(register);

    await runtime.sync(snapshot());

    expect(runtime.getSnapshot().importers).toEqual([]);
    expect(runtime.getSnapshot().plugins[0]?.status).toBe('failed');
    expect(runtime.getSnapshot().diagnostics.at(-1)?.message).toMatch(
      INVALID_IMPORTER_MESSAGE_RE
    );
  });

  it('keeps the old importer through a failed candidate and replaces it atomically', async () => {
    const contexts: PluginContext[] = [];
    const runtime = createRuntime((app) => {
      contexts.push(app);
      app.importers.register({
        accept: [{ description: 'CSV', extensions: ['.csv'] }],
        id: 'notes-csv',
        parse: async () => ({ notes: [], warnings: [] }),
        title: `Generation ${app.generation}`,
      });
      if (app.generation === 2) {
        throw new Error('candidate importer failed');
      }
    });

    await runtime.sync(snapshot('one'));
    await runtime.sync(snapshot('two'));

    expect(contexts[0]?.signal.aborted).toBe(false);
    expect(contexts[1]?.signal.aborted).toBe(true);
    expect(runtime.getSnapshot().importers[0]?.title).toBe('Generation 1');

    await runtime.sync(snapshot('three'));

    expect(contexts[0]?.signal.aborted).toBe(true);
    expect(contexts[2]?.signal.aborted).toBe(false);
    expect(runtime.getSnapshot().importers[0]?.title).toBe('Generation 3');

    await runtime.sync({ ...snapshot('three'), plugins: [] });
    expect(contexts[2]?.signal.aborted).toBe(true);
    expect(runtime.getSnapshot().importers).toEqual([]);
  });
});
