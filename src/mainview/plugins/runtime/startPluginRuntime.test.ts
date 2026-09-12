// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { PluginRuntime } from './PluginRuntime';
import { startPluginRuntime } from './startPluginRuntime';

vi.mock('@/lib/rpc', () => ({
  rpcGetLocalHttpEndpoint: vi.fn(),
  rpcListPluginDirectory: vi.fn(),
  rpcPickPluginFiles: vi.fn(),
  rpcReadPluginFileText: vi.fn(),
  rpcReleasePluginFiles: vi.fn(),
}));

const endpoint = {
  baseUrl: 'http://127.0.0.1:12345',
  token: 'secret',
  aiEnabled: false,
};
const empty = { workspaceId: 'work', plugins: [], diagnostics: [] };
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
  vi.useRealTimers();
});

it('polls the bearer HTTP snapshot, coalesces change events and cleans on pagehide', async () => {
  vi.useFakeTimers();
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValue(Response.json(empty));
  const runtime = new PluginRuntime();
  const sync = vi.spyOn(runtime, 'sync');
  const dispose = vi.spyOn(runtime, 'dispose');
  const stop = startPluginRuntime({
    runtime,
    getEndpoint: async () => endpoint,
    fetch: fetcher,
  });
  stops.push(stop);
  await vi.advanceTimersByTimeAsync(0);
  window.dispatchEvent(new Event('plugins-changed'));
  window.dispatchEvent(new Event('plugins-changed'));
  await vi.advanceTimersByTimeAsync(1100);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(String(fetcher.mock.calls[0]?.[0])).toBe(
    'http://127.0.0.1:12345/plugins/runtime'
  );
  expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
    Authorization: 'Bearer secret',
  });
  finish(Response.json(empty));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(sync).toHaveBeenCalledWith(empty);
  window.dispatchEvent(new Event('pagehide'));
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(dispose).toHaveBeenCalledOnce();
  await stop();
  expect(dispose).toHaveBeenCalledOnce();
});

it('continues polling while setup is pending, allowing disable to cancel it', async () => {
  vi.useFakeTimers();
  const pending = new Promise(() => undefined);
  const runtime = new PluginRuntime({
    importer: async () => ({ default: { setup: () => pending } }),
  });
  const plugins = [
    {
      pluginId: 'example.test',
      name: 'Test',
      version: '1',
      generation: '1',
      development: true,
      entryUrl: 'http://127.0.0.1/plugins/token/example.test/1/1/app.js',
    },
  ];
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(async () => Response.json({ ...empty, plugins }))
    .mockImplementation(async () => Response.json(empty));
  stops.push(
    startPluginRuntime({
      runtime,
      getEndpoint: async () => endpoint,
      fetch: fetcher,
    })
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(runtime.getSnapshot().plugins[0]?.status).toBe('loading');
  await vi.advanceTimersByTimeAsync(1000);
  expect(runtime.getSnapshot().plugins).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('aborts on stop and ignores a late snapshot', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const runtime = new PluginRuntime();
  const sync = vi.spyOn(runtime, 'sync');
  const stop = startPluginRuntime({
    runtime,
    getEndpoint: async () => endpoint,
    fetch: fetcher,
  });
  stops.push(stop);
  await Promise.resolve();
  await stop();
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  finish(Response.json(empty));
  await Promise.resolve();
  await Promise.resolve();
  expect(sync).not.toHaveBeenCalled();
});

it('diagnoses invalid snapshots and retries transport failures', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(async () => new Response('{}'))
    .mockImplementation(async () => Response.json(empty));
  const runtime = new PluginRuntime();
  stops.push(
    startPluginRuntime({
      runtime,
      getEndpoint: async () => endpoint,
      fetch: fetcher,
    })
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect(
    runtime
      .getSnapshot()
      .diagnostics.map((d) => d.message)
      .join()
  ).toContain('offline');
  expect(
    runtime
      .getSnapshot()
      .diagnostics.map((d) => d.message)
      .join()
  ).toContain('Invalid plugin runtime snapshot');
  expect(runtime.getSnapshot().workspaceId).toBe('work');
});

it('retries failed graph releases without stopping snapshot polling or releasing live code', async () => {
  vi.useFakeTimers();
  const runtime = new PluginRuntime({
    importer: async () => ({ default: { setup() {} } }),
  });
  const plugin = (generation: string) => ({
    pluginId: 'example.test',
    name: 'Test',
    version: '1',
    development: true,
    generation,
    entryUrl: `${endpoint.baseUrl}/plugins/token/example.test/1/${generation}/app.js`,
  });
  let generation = 'one';
  let releases = 0;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input, init) => {
      if (String(input).endsWith('/plugins/release')) {
        expect(init?.headers).toEqual({
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          pluginId: 'example.test',
          generation: 'one',
        });
        releases += 1;
        return new Response(null, { status: releases === 1 ? 500 : 200 });
      }
      return Response.json({ ...empty, plugins: [plugin(generation)] });
    });
  stops.push(
    startPluginRuntime({
      runtime,
      getEndpoint: async () => endpoint,
      fetch: fetcher,
    })
  );
  await vi.advanceTimersByTimeAsync(0);
  generation = 'two';
  await vi.advanceTimersByTimeAsync(1000);
  expect(runtime.getSnapshot().plugins[0]?.status).toBe('running');
  await vi.advanceTimersByTimeAsync(2000);
  expect(releases).toBe(2);
  expect(runtime.getReleasedGenerations()).toEqual([]);
  expect(
    runtime.getSnapshot().diagnostics.some((item) => item.phase === 'release')
  ).toBe(true);
});
