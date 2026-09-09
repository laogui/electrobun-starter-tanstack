import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPluginStorage } from './storage';

const endpoint = {
  aiEnabled: false,
  baseUrl: 'http://127.0.0.1:1234',
  token: 'secret',
};
afterEach(() => vi.useRealTimers());

describe('plugin storage transport', () => {
  it('captures identity, snapshots JSON and keeps credentials in the header', async () => {
    let finish!: (value: typeof endpoint) => void;
    const getEndpoint = vi.fn(
      () =>
        new Promise<typeof endpoint>((resolve) => {
          finish = resolve;
        })
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ success: true }));
    const storage = createPluginStorage(
      {
        pluginId: 'example.test',
        workspaceId: 'fixed',
        signal: new AbortController().signal,
      },
      'workspace',
      { getEndpoint, fetch: fetcher }
    );
    const value = { count: 1 };
    const pending = storage.set('key', value);
    value.count = 2;
    finish(endpoint);
    await pending;
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:1234/plugins/storage');
    expect(options?.headers).toEqual({
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(options!.body as string)).toEqual({
      operation: 'set',
      key: 'key',
      value: { count: 1 },
      pluginId: 'example.test',
      workspaceId: 'fixed',
      scope: 'workspace',
    });
  });

  it.each([
    'activation',
    'caller',
  ] as const)('cancels a pending endpoint lookup on %s abort without sending a late write', async (source) => {
    const activation = new AbortController();
    const caller = new AbortController();
    let finish!: (value: typeof endpoint) => void;
    const getEndpoint = () =>
      new Promise<typeof endpoint>((resolve) => {
        finish = resolve;
      });
    const fetcher = vi.fn<typeof fetch>();
    const storage = createPluginStorage(
      { pluginId: 'example.test', workspaceId: 'a', signal: activation.signal },
      'app',
      { getEndpoint, fetch: fetcher }
    );
    const pending = storage.set('key', true, { signal: caller.signal });
    (source === 'activation' ? activation : caller).abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    finish(endpoint);
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('cancels fetch even if the transport ignores the signal, and times out unresolved work', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValue(new Promise(() => undefined));
    const storage = createPluginStorage(
      { pluginId: 'example.test', workspaceId: 'a', signal: controller.signal },
      'app',
      { getEndpoint: async () => endpoint, fetch: fetcher, timeoutMs: 100 }
    );
    const pending = storage.get('key');
    const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('distinguishes missing from null and rejects malformed and failed responses', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ found: false }))
      .mockResolvedValueOnce(Response.json({ found: true, value: null }))
      .mockResolvedValueOnce(Response.json({ keys: ['a', 'b'] }))
      .mockResolvedValueOnce(
        Response.json(
          { error: 'Workspace is no longer active' },
          { status: 409 }
        )
      )
      .mockResolvedValueOnce(Response.json({ keys: [42] }));
    const storage = createPluginStorage(
      {
        pluginId: 'example.test',
        workspaceId: 'a',
        signal: new AbortController().signal,
      },
      'workspace',
      { getEndpoint: async () => endpoint, fetch: fetcher }
    );
    expect(await storage.get('missing')).toBeUndefined();
    expect(await storage.get('null')).toBeNull();
    expect(await storage.list()).toEqual(['a', 'b']);
    await expect(storage.delete('a')).rejects.toThrow(
      'Workspace is no longer active'
    );
    await expect(storage.list()).rejects.toThrow('Invalid storage response');
  });
});
