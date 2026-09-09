import { rpcGetLocalHttpEndpoint } from '@/lib/rpc';

export async function requestPluginReload(pluginId: string): Promise<void> {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('Plugin host endpoint is unavailable');
  }
  const response = await fetch(`${endpoint.baseUrl}/plugins/reload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pluginId }),
  });
  if (!response.ok) {
    throw new Error(`Plugin reload failed (${response.status})`);
  }
  globalThis.dispatchEvent(new Event('plugins-changed'));
}
