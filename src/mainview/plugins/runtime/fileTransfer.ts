import type {
  PluginDirectoryHandle,
  PluginFileHandle,
  PluginFileProgress,
  PluginFileReadOptions,
  PluginFileWriteData,
} from '../../../../packages/plugin-sdk';
import {
  PLUGIN_COLLECTED_FILE_MAX_BYTES,
  PLUGIN_FILE_TRANSFER_CHUNK_BYTES,
  PLUGIN_FILE_TRANSFER_MAX_BYTES,
  type PluginFileContext,
  type PluginFileHandleData,
} from '../../../shared/plugins/files';

interface LocalEndpoint {
  baseUrl: string;
  token: string;
}

export interface PluginFileDataTransport {
  fetch?: typeof fetch;
  getEndpoint?: () => Promise<LocalEndpoint | null>;
}

function abortError(): DOMException {
  return new DOMException('Plugin file operation aborted', 'AbortError');
}

function combinedSignal(signals: readonly (AbortSignal | undefined)[]) {
  const controller = new AbortController();
  const active = signals.filter((signal): signal is AbortSignal =>
    Boolean(signal)
  );
  const abort = () => controller.abort();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', abort, { once: true });
    }
  }
  return {
    abort() {
      controller.abort();
    },
    dispose() {
      for (const signal of active) {
        signal.removeEventListener('abort', abort);
      }
    },
    signal: controller.signal,
  };
}

function validateRange(
  handle: PluginFileHandle,
  options: PluginFileReadOptions
) {
  const start = options.start ?? 0;
  const length = options.length ?? Math.max(0, handle.size - start);
  if (
    !Number.isSafeInteger(start) ||
    start < 0 ||
    start > handle.size ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    start + length > handle.size ||
    length > PLUGIN_FILE_TRANSFER_MAX_BYTES
  ) {
    throw new Error('Plugin file read range is invalid or exceeds 256 MiB');
  }
  return { length, start };
}

function validateMaximum(value: number | undefined, fallback: number): number {
  const maximum = value ?? fallback;
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 0 ||
    maximum > PLUGIN_COLLECTED_FILE_MAX_BYTES
  ) {
    throw new Error('Collected plugin file reads are limited to 16 MiB');
  }
  return maximum;
}

async function endpointFor(
  transport: PluginFileDataTransport
): Promise<LocalEndpoint> {
  const endpoint = await transport.getEndpoint?.();
  if (!endpoint?.baseUrl) {
    throw new Error('Plugin file streaming service is unavailable');
  }
  return endpoint;
}

function fileUrl(
  endpoint: LocalEndpoint,
  path: 'read' | 'write',
  context: PluginFileContext,
  params: Record<string, string>
): URL {
  const url = new URL(`/plugins/files/${path}`, endpoint.baseUrl);
  url.searchParams.set('activationId', context.activationId);
  url.searchParams.set('pluginId', context.pluginId);
  url.searchParams.set('workspaceId', context.workspaceId);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Plugin file request failed (${response.status})`;
    const clone = response.clone();
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string') {
        message = body.error;
      }
    } catch {
      const text = await clone.text().catch(() => '');
      if (text) {
        message = text;
      }
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function progress(
  callback: ((value: PluginFileProgress) => void) | undefined,
  loaded: number,
  total: number
) {
  callback?.(Object.freeze({ loaded, total }));
}

export function createFileStream(input: {
  context: PluginFileContext & { signal: AbortSignal };
  handle: PluginFileHandle;
  options?: PluginFileReadOptions;
  transport: PluginFileDataTransport;
}): ReadableStream<Uint8Array> {
  const options = input.options ?? {};
  const range = validateRange(input.handle, options);
  const operation = combinedSignal([input.context.signal, options.signal]);
  const fetcher = input.transport.fetch ?? globalThis.fetch.bind(globalThis);
  let offset = range.start;
  let loaded = 0;
  let endpoint: LocalEndpoint | undefined;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (operation.signal.aborted) {
        controller.error(abortError());
        operation.dispose();
        return;
      }
      if (loaded >= range.length) {
        progress(options.onProgress, loaded, range.length);
        controller.close();
        operation.dispose();
        return;
      }
      try {
        endpoint ??= await endpointFor(input.transport);
        const chunkLength = Math.min(
          PLUGIN_FILE_TRANSFER_CHUNK_BYTES,
          range.length - loaded
        );
        const response = await fetcher(
          fileUrl(endpoint, 'read', input.context, {
            handleId: input.handle.id,
          }),
          {
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${endpoint.token}`,
              Range: `bytes=${offset}-${offset + chunkLength - 1}`,
            },
            signal: operation.signal,
          }
        );
        if (response.status !== 206) {
          throw new Error(await response.text());
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== chunkLength) {
          throw new Error('Plugin file changed during streaming read');
        }
        offset += bytes.byteLength;
        loaded += bytes.byteLength;
        progress(options.onProgress, loaded, range.length);
        controller.enqueue(bytes);
      } catch (error) {
        controller.error(operation.signal.aborted ? abortError() : error);
        operation.dispose();
      }
    },
    cancel() {
      operation.abort();
      operation.dispose();
    },
  });
}

export async function readFileBytes(input: {
  context: PluginFileContext & { signal: AbortSignal };
  handle: PluginFileHandle;
  maximum?: number;
  options?: PluginFileReadOptions;
  transport: PluginFileDataTransport;
}): Promise<Uint8Array> {
  const maximum = validateMaximum(
    input.maximum,
    PLUGIN_COLLECTED_FILE_MAX_BYTES
  );
  const range = validateRange(input.handle, input.options ?? {});
  if (range.length > maximum) {
    throw new Error(`Plugin file read exceeds the ${maximum}-byte limit`);
  }
  const reader = createFileStream(input).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maximum) {
        throw new Error(`Plugin file read exceeds the ${maximum}-byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function toByteStream(data: PluginFileWriteData): {
  stream: ReadableStream<Uint8Array>;
  total: number;
} {
  if (typeof data === 'string') {
    const bytes = new TextEncoder().encode(data);
    return {
      stream: byteStream(bytes),
      total: bytes.byteLength,
    };
  }
  if (data instanceof Blob) {
    // `Response` exposes the blob as a typed DOM byte stream without
    // buffering it, sidestepping the Bun/DOM `Blob.stream()` typing clash.
    return {
      stream: new Response(data).body ?? byteStream(new Uint8Array(0)),
      total: data.size,
    };
  }
  if (data instanceof ArrayBuffer) {
    return {
      stream: byteStream(new Uint8Array(data)),
      total: data.byteLength,
    };
  }
  if (ArrayBuffer.isView(data)) {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return {
      stream: byteStream(bytes),
      total: bytes.byteLength,
    };
  }
  if (
    data &&
    typeof data === 'object' &&
    typeof (data as ReadableStream<Uint8Array>).getReader === 'function'
  ) {
    return { stream: data as ReadableStream<Uint8Array>, total: 0 };
  }
  throw new Error('Unsupported plugin file write data');
}

function byteStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  const stable = Uint8Array.from(bytes);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(stable);
      controller.close();
    },
  });
}

async function* boundedChunks(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      if (!(value instanceof Uint8Array)) {
        throw new Error('Plugin file streams must yield Uint8Array chunks');
      }
      for (
        let offset = 0;
        offset < value.byteLength;
        offset += PLUGIN_FILE_TRANSFER_CHUNK_BYTES
      ) {
        yield value.subarray(
          offset,
          Math.min(offset + PLUGIN_FILE_TRANSFER_CHUNK_BYTES, value.byteLength)
        );
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function writePluginFile(input: {
  context: PluginFileContext & { signal: AbortSignal };
  data: PluginFileWriteData;
  directory: PluginDirectoryHandle;
  onProgress?: (value: PluginFileProgress) => void;
  overwrite?: boolean;
  relativePath: string;
  signal?: AbortSignal;
  transport: PluginFileDataTransport;
}): Promise<PluginFileHandleData> {
  const operation = combinedSignal([input.context.signal, input.signal]);
  const fetcher = input.transport.fetch ?? globalThis.fetch.bind(globalThis);
  let endpoint: LocalEndpoint | undefined;
  let uploadId: string | undefined;
  try {
    endpoint = await endpointFor(input.transport);
    const source = toByteStream(input.data);
    if (source.total > PLUGIN_FILE_TRANSFER_MAX_BYTES) {
      throw new Error('Plugin file writes are limited to 256 MiB');
    }
    const base = { Authorization: `Bearer ${endpoint.token}` };
    const begin = await responseJson<{ uploadId: string }>(
      await fetcher(
        fileUrl(endpoint, 'write', input.context, { action: 'begin' }),
        {
          body: JSON.stringify({
            directoryHandleId: input.directory.id,
            overwrite: input.overwrite === true,
            relativePath: input.relativePath,
          }),
          headers: { ...base, 'Content-Type': 'application/json' },
          method: 'POST',
          signal: operation.signal,
        }
      )
    );
    uploadId = begin.uploadId;
    let written = 0;
    for await (const chunk of boundedChunks(source.stream)) {
      if (written + chunk.byteLength > PLUGIN_FILE_TRANSFER_MAX_BYTES) {
        throw new Error('Plugin file writes are limited to 256 MiB');
      }
      const result = await responseJson<{ written: number }>(
        await fetcher(
          fileUrl(endpoint, 'write', input.context, {
            action: 'chunk',
            offset: String(written),
            uploadId,
          }),
          {
            body: Uint8Array.from(chunk).buffer,
            headers: { ...base, 'Content-Type': 'application/octet-stream' },
            method: 'POST',
            signal: operation.signal,
          }
        )
      );
      written = result.written;
      progress(input.onProgress, written, source.total);
    }
    const committed = await responseJson<{ file: PluginFileHandleData }>(
      await fetcher(
        fileUrl(endpoint, 'write', input.context, {
          action: 'commit',
          uploadId,
        }),
        { headers: base, method: 'POST', signal: operation.signal }
      )
    );
    progress(input.onProgress, written, source.total || written);
    return committed.file;
  } catch (error) {
    if (endpoint && uploadId) {
      const base = { Authorization: `Bearer ${endpoint.token}` };
      await fetcher(
        fileUrl(endpoint, 'write', input.context, {
          action: 'cancel',
          uploadId,
        }),
        { headers: base, method: 'DELETE' }
      ).catch(() => undefined);
    }
    throw operation.signal.aborted ? abortError() : error;
  } finally {
    operation.dispose();
  }
}
