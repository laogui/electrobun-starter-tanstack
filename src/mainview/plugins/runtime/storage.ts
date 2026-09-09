import { rpcGetLocalHttpEndpoint } from '@/lib/rpc';
import type {
  JsonValue,
  OperationOptions,
  PluginStorage,
} from '../../../../packages/plugin-sdk';
import {
  assertStorageKey,
  cloneStorageValue,
} from '../../../shared/plugins/storage';

export interface PluginStorageTransportOptions {
  fetch?: typeof fetch;
  getEndpoint?: typeof rpcGetLocalHttpEndpoint;
  timeoutMs?: number;
}

export function createPluginStorage(
  context: { pluginId: string; workspaceId: string; signal: AbortSignal },
  scope: 'app' | 'workspace',
  options: PluginStorageTransportOptions = {}
): PluginStorage {
  const request = async (
    body: Record<string, unknown>,
    operationOptions?: OperationOptions
  ) => {
    const controller = new AbortController();
    const signals = [context.signal, operationOptions?.signal].filter(
      (signal): signal is AbortSignal => Boolean(signal)
    );
    const abort = () => controller.abort();
    for (const signal of signals) {
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
      }
    }
    let rejectAbort!: (error: Error) => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () =>
      rejectAbort(
        new DOMException('Plugin storage operation aborted', 'AbortError')
      );
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(abort, options.timeoutMs ?? 10_000);
    try {
      if (controller.signal.aborted) {
        throw new DOMException(
          'Plugin storage operation aborted',
          'AbortError'
        );
      }
      return await Promise.race([
        aborted,
        (async () => {
          const endpoint = await (
            options.getEndpoint ?? rpcGetLocalHttpEndpoint
          )();
          if (controller.signal.aborted) {
            throw new DOMException(
              'Plugin storage operation aborted',
              'AbortError'
            );
          }
          if (!endpoint) {
            throw new Error('Plugin host endpoint is unavailable');
          }
          const response = await (options.fetch ?? globalThis.fetch)(
            new URL('/plugins/storage', endpoint.baseUrl),
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${endpoint.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ...body,
                pluginId: context.pluginId,
                workspaceId: context.workspaceId,
                scope,
              }),
              signal: controller.signal,
            }
          );
          const payload: unknown = await response.json();
          if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid storage response');
          }
          const result = payload as Record<string, unknown>;
          if (!response.ok) {
            throw new Error(
              typeof result.error === 'string'
                ? result.error
                : `Plugin storage request failed (${response.status})`
            );
          }
          return result;
        })(),
      ]);
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', onAbort);
      for (const signal of signals) {
        signal.removeEventListener('abort', abort);
      }
    }
  };
  return {
    async get(key: string, operationOptions?: OperationOptions) {
      assertStorageKey(key);
      const result = await request({ operation: 'get', key }, operationOptions);
      if (typeof result?.found !== 'boolean') {
        throw new Error('Invalid storage response');
      }
      return result.found ? cloneStorageValue(result.value) : undefined;
    },
    async set(
      key: string,
      value: JsonValue,
      operationOptions?: OperationOptions
    ) {
      assertStorageKey(key);
      const result = await request(
        { operation: 'set', key, value: cloneStorageValue(value) },
        operationOptions
      );
      if (result?.success !== true) {
        throw new Error('Invalid storage response');
      }
    },
    async delete(key: string, operationOptions?: OperationOptions) {
      assertStorageKey(key);
      const result = await request(
        { operation: 'delete', key },
        operationOptions
      );
      if (result?.success !== true) {
        throw new Error('Invalid storage response');
      }
    },
    async list(prefix = '', operationOptions?: OperationOptions) {
      if (typeof prefix !== 'string' || prefix.length > 1024) {
        throw new Error('Invalid storage prefix');
      }
      const result = await request(
        { operation: 'list', prefix },
        operationOptions
      );
      if (
        !(
          Array.isArray(result?.keys) &&
          result.keys.every((key: unknown) => typeof key === 'string')
        )
      ) {
        throw new Error('Invalid storage response');
      }
      return result.keys as string[];
    },
  };
}
