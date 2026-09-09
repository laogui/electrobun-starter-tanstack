// T0 transport only. This is not the public SDK contract (T1).
let endpoint: { baseUrl: string; token: string } | undefined;

export function configureProbeTransport(value: typeof endpoint) {
  endpoint = value;
}

export function definePlugin<T>(plugin: T): T {
  return plugin;
}

export async function probeRequest<T = unknown>(
  route: string,
  input?: unknown
): Promise<T> {
  if (!endpoint) {
    throw new Error('T0 host transport is not configured');
  }
  const response = await fetch(`${endpoint.baseUrl}/plugin-t0/${route}`, {
    method: input === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      'Content-Type': 'application/json',
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`T0 ${route}: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export const net = {
  fetch: (url: string) => probeRequest('net', { url }),
};

export const files = {
  readText: (path: string): Promise<{ text: string }> =>
    probeRequest('files/read', { path }),
  writeText: (path: string, text: string): Promise<{ bytes: number }> =>
    probeRequest('files/write', { path, text }),
};
