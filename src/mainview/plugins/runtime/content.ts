import { rpcGetLocalHttpEndpoint } from '@/lib/rpc';
import type {
  ContentBatchResult,
  ContentMutationOptions,
  NoteContentSnapshot,
  OperationOptions,
  PluginContent,
} from '../../../../packages/plugin-sdk';
import { cloneStorageValue } from '../../../shared/plugins/storage';
import type { PluginStorageTransportOptions } from './storage';

function parseBatch(value: unknown): ContentBatchResult {
  const result = value as ContentBatchResult;
  if (
    !result ||
    typeof result.operationId !== 'string' ||
    typeof result.changed !== 'boolean' ||
    !Array.isArray(result.items) ||
    !result.items.every(
      (item) =>
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.color === 'string' &&
        Number.isSafeInteger(item.revision)
    )
  ) {
    throw new Error('Invalid content batch response');
  }
  return result;
}
function parseSnapshot(value: unknown): NoteContentSnapshot {
  const item = value as NoteContentSnapshot;
  if (
    !item ||
    item.kind !== 'note' ||
    typeof item.id !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.color !== 'string' ||
    typeof item.text !== 'string' ||
    !['sidecar', 'markdown'].includes(item.source) ||
    !(item.revision === null || Number.isSafeInteger(item.revision))
  ) {
    throw new Error('Invalid note content response');
  }
  return item;
}

export function createPluginContent(
  context: { pluginId: string; workspaceId: string; signal: AbortSignal },
  transport: PluginStorageTransportOptions = {}
): PluginContent {
  const request = async (
    body: Record<string, unknown>,
    options?: OperationOptions
  ): Promise<Record<string, unknown>> => {
    const payload = cloneStorageValue({
      ...body,
      pluginId: context.pluginId,
      workspaceId: context.workspaceId,
    });
    const controller = new AbortController();
    const signals = [context.signal, options?.signal].filter(
      (signal): signal is AbortSignal => Boolean(signal)
    );
    const abort = () => controller.abort();
    for (const signal of signals) {
      signal.addEventListener('abort', abort, { once: true });
    }
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () =>
      rejectAbort(
        new DOMException(
          'Content operation aborted; a committed write is not rolled back',
          'AbortError'
        )
      );
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(abort, transport.timeoutMs ?? 10_000);
    try {
      if (signals.some((signal) => signal.aborted)) {
        throw new DOMException('Content operation aborted', 'AbortError');
      }
      const result = await Promise.race([
        aborted,
        (async () => {
          const endpoint = await (
            transport.getEndpoint ?? rpcGetLocalHttpEndpoint
          )();
          if (controller.signal.aborted) {
            throw new DOMException('Content operation aborted', 'AbortError');
          }
          if (!endpoint) {
            throw new Error('Plugin host endpoint is unavailable');
          }
          const response = await (transport.fetch ?? globalThis.fetch)(
            new URL('/plugins/content', endpoint.baseUrl),
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${endpoint.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            }
          );
          const result = (await response.json()) as Record<string, unknown>;
          if (!result || typeof result !== 'object') {
            throw new Error('Invalid content response');
          }
          if (!response.ok) {
            throw Object.assign(
              new Error(
                typeof result.error === 'string'
                  ? result.error
                  : `Content request failed (${response.status})`
              ),
              { code: result.code }
            );
          }
          return result;
        })(),
      ]);
      if (signals.some((signal) => signal.aborted)) {
        throw new DOMException('Content operation aborted', 'AbortError');
      }
      return result;
    } catch (error) {
      const source =
        error && typeof error === 'object'
          ? (error as { message?: unknown; name?: unknown; code?: unknown })
          : {};
      const failure = new Error(
        typeof source.message === 'string'
          ? source.message
          : 'Content request failed'
      );
      failure.name = typeof source.name === 'string' ? source.name : 'Error';
      throw Object.assign(failure, {
        code:
          error && typeof error === 'object' && 'code' in error
            ? error.code
            : 'transport-error',
        operationId: body.operationId,
      });
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      for (const signal of signals) {
        signal.removeEventListener('abort', abort);
      }
    }
  };
  const mutate = async (
    body: Record<string, unknown>,
    options?: ContentMutationOptions
  ) =>
    parseBatch(
      await request(
        { ...body, operationId: options?.operationId ?? crypto.randomUUID() },
        options
      )
    );
  return {
    async getMany(ids, options) {
      const capturedIds = [...ids];
      const result = await request(
        { action: 'getMany', ids: capturedIds },
        options
      );
      if (
        !Array.isArray(result.items) ||
        result.items.length !== capturedIds.length
      ) {
        throw new Error('Invalid content getMany response');
      }
      return result.items.map((value, index) => {
        if (value === null) {
          return null;
        }
        const item = parseSnapshot(value);
        if (item.id !== capturedIds[index]) {
          throw new Error('Content getMany response identity mismatch');
        }
        return item;
      });
    },
    async get(id, options) {
      const result = await request({ action: 'get', id }, options);
      return result.item === null ? null : parseSnapshot(result.item);
    },
    async query(query, options) {
      const result = await request(
        { action: 'query', query: query ?? {} },
        options
      );
      if (
        !(
          Array.isArray(result.items) &&
          (result.nextCursor === null || typeof result.nextCursor === 'string')
        )
      ) {
        throw new Error('Invalid content query response');
      }
      return {
        items: result.items.map(parseSnapshot),
        nextCursor: result.nextCursor,
      };
    },
    updateMany: (updates, options) =>
      mutate({ action: 'update', updates, label: options.label }, options),
    undo: (batchId, options) => mutate({ action: 'undo', batchId }, options),
    redo: (batchId, options) => mutate({ action: 'redo', batchId }, options),
  };
}
