import { rpcGetLocalHttpEndpoint } from '@/lib/rpc';
import type { PluginRuntimeSnapshot } from '../../../shared/plugins/runtime';
import { type PluginRuntime, pluginRuntime } from './PluginRuntime';
import { initializeSharedPluginRuntime } from './sharedRuntime';

export interface StartPluginRuntimeOptions {
  fetch?: typeof fetch;
  getEndpoint?: typeof rpcGetLocalHttpEndpoint;
  intervalMs?: number;
  requestTimeoutMs?: number;
  runtime?: PluginRuntime;
  target?: Window;
}

function isRuntimeSnapshot(value: unknown): value is PluginRuntimeSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const snapshot = value as PluginRuntimeSnapshot;
  return (
    typeof snapshot.workspaceId === 'string' &&
    Array.isArray(snapshot.plugins) &&
    Array.isArray(snapshot.diagnostics) &&
    snapshot.plugins.every(
      (plugin) =>
        plugin &&
        typeof plugin.pluginId === 'string' &&
        typeof plugin.name === 'string' &&
        typeof plugin.version === 'string' &&
        typeof plugin.development === 'boolean' &&
        typeof plugin.generation === 'string' &&
        typeof plugin.entryUrl === 'string' &&
        (plugin.hostToken === undefined || typeof plugin.hostToken === 'string')
    ) &&
    snapshot.diagnostics.every(
      (diagnostic) =>
        diagnostic &&
        typeof diagnostic.pluginId === 'string' &&
        typeof diagnostic.message === 'string'
    )
  );
}

export function startPluginRuntime(
  options: StartPluginRuntimeOptions = {}
): () => Promise<void> {
  initializeSharedPluginRuntime();
  const runtime = options.runtime ?? pluginRuntime;
  const target = options.target ?? window;
  const getEndpoint = options.getEndpoint ?? rpcGetLocalHttpEndpoint;
  const fetcher = options.fetch ?? globalThis.fetch;
  let stopped = false;
  let inFlight = false;
  let refreshQueued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let startupReadyController: AbortController | undefined;
  let startupReady = false;
  let startupReadyInFlight = false;
  let stopping: Promise<void> | undefined;
  const detachShortcuts = runtime.attachShortcuts(target);

  const acknowledgeStartup = async (endpoint: {
    baseUrl: string;
    token: string;
  }) => {
    if (
      stopped ||
      startupReady ||
      startupReadyInFlight ||
      runtime
        .getSnapshot()
        .plugins.some((plugin) => plugin.status === 'loading')
    ) {
      return;
    }
    startupReadyInFlight = true;
    const request = new AbortController();
    startupReadyController = request;
    const timeout = setTimeout(
      () => request.abort(),
      options.requestTimeoutMs ?? 5000
    );
    try {
      const response = await fetcher(
        new URL('/plugins/startup-ready', endpoint.baseUrl),
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${endpoint.token}` },
          signal: request.signal,
          cache: 'no-store',
        }
      );
      if (!response.ok) {
        throw new Error(
          `Plugin startup acknowledgement failed (${response.status})`
        );
      }
      startupReady = true;
    } catch (error) {
      if (!stopped) {
        runtime.report('host', 'startup-ready', error);
      }
    } finally {
      clearTimeout(timeout);
      startupReadyInFlight = false;
      if (startupReadyController === request) {
        startupReadyController = undefined;
      }
    }
  };

  const refresh = async () => {
    if (stopped) {
      return;
    }
    if (inFlight) {
      refreshQueued = true;
      return;
    }
    clearTimeout(timer);
    inFlight = true;
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(
      () => request.abort(),
      options.requestTimeoutMs ?? 5000
    );
    try {
      const endpoint = await getEndpoint();
      if (stopped || request.signal.aborted) {
        return;
      }
      if (!endpoint) {
        runtime.report(
          'host',
          'transport',
          'Plugin host endpoint is unavailable'
        );
        return;
      }
      const response = await fetcher(
        new URL('/plugins/runtime', endpoint.baseUrl),
        {
          headers: { Authorization: `Bearer ${endpoint.token}` },
          signal: request.signal,
          cache: 'no-store',
        }
      );
      if (!response.ok) {
        throw new Error(`Plugin runtime request failed (${response.status})`);
      }
      const snapshot: unknown = await response.json();
      if (!isRuntimeSnapshot(snapshot)) {
        throw new Error('Invalid plugin runtime snapshot');
      }
      if (!(stopped || request.signal.aborted)) {
        // Imports/setup may never settle; polling must still observe a later disable.
        const syncing = runtime.sync(snapshot);
        syncing.catch((error) => runtime.report('host', 'sync', error));
        syncing.then(() => acknowledgeStartup(endpoint)).catch(() => undefined);
        await Promise.all(
          runtime.getReleasedGenerations().map(async (descriptor) => {
            try {
              const release = await fetcher(
                new URL('/plugins/release', endpoint.baseUrl),
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${endpoint.token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    pluginId: descriptor.pluginId,
                    generation: descriptor.generation,
                  }),
                  signal: request.signal,
                }
              );
              if (!release.ok) {
                throw new Error(
                  `Plugin generation release failed (${release.status})`
                );
              }
              runtime.acknowledgeRelease(descriptor);
            } catch (error) {
              if (!stopped) {
                runtime.report(descriptor.pluginId, 'release', error);
              }
            }
          })
        );
      }
    } catch (error) {
      if (!stopped) {
        runtime.report('host', 'transport', error);
      }
    } finally {
      clearTimeout(timeout);
      inFlight = false;
      if (!stopped) {
        if (refreshQueued) {
          refreshQueued = false;
          refresh();
        } else {
          timer = setTimeout(() => {
            refresh();
          }, options.intervalMs ?? 1000);
        }
      }
    }
  };
  const changed = () => {
    refresh();
  };
  const stop = (): Promise<void> => {
    if (stopping) {
      return stopping;
    }
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    startupReadyController?.abort();
    detachShortcuts();
    target.removeEventListener('plugins-changed', changed);
    target.removeEventListener('pagehide', onPageHide);
    stopping = runtime.dispose();
    return stopping;
  };
  const onPageHide = () => {
    stop();
  };
  target.addEventListener('plugins-changed', changed);
  target.addEventListener('pagehide', onPageHide);
  refresh();
  return stop;
}
