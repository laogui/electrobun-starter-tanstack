import { afterEach, expect, it, vi } from 'vitest';
import { rpcGetLocalHttpEndpoint } from '@/lib/rpc';
import { requestPluginReload } from './requestPluginReload';

vi.mock('@/lib/rpc', () => ({ rpcGetLocalHttpEndpoint: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('requests a new host generation and refreshes runtime only after success', async () => {
  vi.mocked(rpcGetLocalHttpEndpoint).mockResolvedValue({
    baseUrl: 'http://127.0.0.1:1234',
    token: 'secret',
    aiEnabled: false,
  });
  const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true }));
  const dispatch = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('dispatchEvent', dispatch);
  await requestPluginReload('example.plugin');
  expect(fetcher).toHaveBeenCalledWith(
    'http://127.0.0.1:1234/plugins/reload',
    expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pluginId: 'example.plugin' }),
    })
  );
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'plugins-changed' })
  );
});

it('does not announce a failed reload as a successful change', async () => {
  vi.mocked(rpcGetLocalHttpEndpoint).mockResolvedValue({
    baseUrl: 'http://127.0.0.1:1234',
    token: 'secret',
    aiEnabled: false,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('no', { status: 404 }))
  );
  const dispatch = vi.fn();
  vi.stubGlobal('dispatchEvent', dispatch);
  await expect(requestPluginReload('missing')).rejects.toThrow('404');
  expect(dispatch).not.toHaveBeenCalled();
});
