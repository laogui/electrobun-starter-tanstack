// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { PluginContext } from '../../../../packages/plugin-sdk';
import type { PluginRuntimeSnapshot } from '../../../shared/plugins/runtime';
import { PluginRuntime } from './PluginRuntime';

const runtimes: PluginRuntime[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});
const host = (
  generation: string,
  workspaceId = 'workspace'
): PluginRuntimeSnapshot => ({
  workspaceId,
  diagnostics: [],
  plugins: [
    {
      pluginId: 'example.selection',
      name: 'Selection',
      version: '1',
      development: true,
      generation,
      entryUrl: `http://localhost/${generation}.js`,
    },
  ],
});
const selected = (id: string) => ({
  viewId: 'view',
  items: [{ id: 'placement', content: { kind: 'note' as const, id } }],
});
async function settle() {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

it('keeps old selection subscriptions through a failed candidate and retires them after handoff or workspace exit', async () => {
  const contexts: PluginContext[] = [];
  const calls = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, options) => {
      const body = JSON.parse(options!.body as string) as { ids: string[] };
      return Response.json({
        items: body.ids.map((id) => ({
          id,
          kind: 'note',
          title: id,
          color: '',
          text: 'Text',
          source: 'sidecar',
          revision: 1,
        })),
      });
    });
  const runtime = new PluginRuntime({
    contentTransport: {
      getEndpoint: async () => ({
        aiEnabled: false,
        baseUrl: 'http://localhost',
        token: 'test',
      }),
      fetch: fetcher,
    },
    importer: async () => ({
      default: {
        setup(app: PluginContext) {
          const index = contexts.length;
          contexts.push(app);
          app.selection.subscribe(calls[index]!);
          if (index === 1) {
            throw new Error('Candidate failure');
          }
        },
      },
    }),
  });
  runtimes.push(runtime);
  await runtime.sync(host('one'));
  runtime.updateSelection('workspace', selected('a'));
  await settle();
  expect(contexts[0]!.selection.getSnapshot().items[0]?.id).toBe('a');
  await runtime.sync(host('bad'));
  expect(calls[1]).not.toHaveBeenCalled();
  expect(contexts[0]!.signal.aborted).toBe(false);
  runtime.updateSelection('workspace', selected('b'));
  await settle();
  expect(contexts[0]!.selection.getSnapshot().items[0]?.id).toBe('b');
  await runtime.sync(host('three'));
  await settle();
  const oldCalls = calls[0]!.mock.calls.length;
  expect(contexts[0]!.signal.aborted).toBe(true);
  runtime.updateSelection('workspace', selected('c'));
  await settle();
  expect(calls[0]).toHaveBeenCalledTimes(oldCalls);
  expect(contexts[2]!.selection.getSnapshot().items[0]?.id).toBe('c');
  runtime.emitHostEvent('content.changed', {
    workspaceId: 'wrong',
    kind: 'note',
    ids: ['c'],
    operation: 'upsert',
  });
  const ready = contexts[2]!.selection.getSnapshot();
  expect(ready.status).toBe('ready');
  await runtime.sync(host('four', 'other-workspace'));
  await settle();
  expect(contexts[2]!.signal.aborted).toBe(true);
  expect(contexts[3]!.selection.getSnapshot().items).toEqual([]);
  runtime.updateSelection('workspace', selected('leaked'));
  expect(contexts[3]!.selection.getPlacements().items).toEqual([]);
});
