import {
  rpcGetLocalHttpEndpoint,
  rpcListPluginDirectory,
  rpcPickPluginFiles,
  rpcReadPluginFileText,
  rpcReleasePluginFiles,
} from '@/lib/rpc';
import type {
  PluginDirectoryEntry,
  PluginDirectoryHandle,
  PluginFileFilter,
  PluginFileHandle,
  PluginFileReadOptions,
  PluginFileSystemHandle,
  PluginFiles,
} from '../../../../packages/plugin-sdk';
import {
  PLUGIN_TEXT_FILE_MAX_BYTES,
  type PluginDirectoryEntryData,
  type PluginDirectoryListRequest,
  type PluginDirectoryListResult,
  type PluginFileContext,
  type PluginFileHandleData,
  type PluginFilePickRequest,
  type PluginFilePickResult,
  type PluginFileReadRequest,
  type PluginFileReadResult,
  type PluginFileReleaseRequest,
  type PluginFileSystemHandleData,
} from '../../../shared/plugins/files';
import {
  createFileStream,
  type PluginFileDataTransport,
  readFileBytes,
  writePluginFile,
} from './fileTransfer';

const EXTENSION_RE = /^\.[a-z0-9][a-z0-9+_-]{0,15}$/;

export interface PluginFilesTransport extends PluginFileDataTransport {
  list?: (
    request: PluginDirectoryListRequest
  ) => Promise<PluginDirectoryListResult>;
  pick(request: PluginFilePickRequest): Promise<PluginFilePickResult>;
  readText(request: PluginFileReadRequest): Promise<PluginFileReadResult>;
  release(request: PluginFileReleaseRequest): Promise<{ success: boolean }>;
}

const defaultTransport: PluginFilesTransport = {
  fetch: globalThis.fetch.bind(globalThis),
  getEndpoint: rpcGetLocalHttpEndpoint,
  list: rpcListPluginDirectory,
  pick: rpcPickPluginFiles,
  readText: rpcReadPluginFileText,
  release: rpcReleasePluginFiles,
};

function abortError(): DOMException {
  return new DOMException('Plugin file operation aborted', 'AbortError');
}

function validateHandle(value: PluginFileHandleData): PluginFileHandle {
  if (
    !value ||
    value.kind !== 'file' ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.mimeType !== 'string' ||
    !(Number.isSafeInteger(value.size) && value.size >= 0) ||
    !(Number.isFinite(value.lastModified) && value.lastModified >= 0)
  ) {
    throw new Error('Invalid plugin file handle');
  }
  return Object.freeze({ ...value });
}

function validateSystemHandle(
  value: PluginFileSystemHandleData
): PluginFileSystemHandle {
  if (value.kind === 'file') {
    return validateHandle(value);
  }
  if (
    !value ||
    value.kind !== 'directory' ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string'
  ) {
    throw new Error('Invalid plugin directory handle');
  }
  return Object.freeze({ ...value });
}

function validateEntry(value: PluginDirectoryEntryData): PluginDirectoryEntry {
  if (
    !value ||
    typeof value.name !== 'string' ||
    !['directory', 'file', 'symlink'].includes(value.kind) ||
    (value.kind === 'symlink' && value.handle !== undefined) ||
    (value.kind !== 'symlink' && value.handle?.kind !== value.kind)
  ) {
    throw new Error('Invalid plugin directory entry');
  }
  return Object.freeze({
    kind: value.kind,
    name: value.name,
    ...(value.handle ? { handle: validateSystemHandle(value.handle) } : {}),
  });
}

export function normalizePluginFileFilters(
  accept: readonly PluginFileFilter[]
): readonly PluginFileFilter[] {
  if (!(Array.isArray(accept) && accept.length > 0)) {
    throw new Error('File picker requires at least one file filter');
  }
  const uniqueExtensions = new Set<string>();
  const normalized = accept.map((filter) => {
    if (
      !filter ||
      typeof filter.description !== 'string' ||
      !filter.description.trim() ||
      !Array.isArray(filter.extensions) ||
      filter.extensions.length === 0
    ) {
      throw new Error('Invalid plugin file filter');
    }
    const extensions = filter.extensions.map((extension) => {
      if (typeof extension !== 'string') {
        throw new Error('Invalid plugin file extension');
      }
      const normalizedExtension = extension.toLowerCase();
      if (!EXTENSION_RE.test(normalizedExtension)) {
        throw new Error(`Invalid plugin file extension: ${extension}`);
      }
      uniqueExtensions.add(normalizedExtension);
      return normalizedExtension;
    });
    return Object.freeze({
      description: filter.description.trim(),
      extensions: Object.freeze([...new Set(extensions)]),
    });
  });
  if (uniqueExtensions.size > 16) {
    throw new Error('File picker requires at most 16 unique extensions');
  }
  return Object.freeze(normalized);
}

export function createPluginFiles(
  context: PluginFileContext & { signal: AbortSignal },
  transport: PluginFilesTransport = defaultTransport
): PluginFiles {
  const handles = new Map<string, PluginFileSystemHandle>();
  const release = (ids: readonly string[]) => {
    if (ids.length === 0) {
      return;
    }
    for (const id of ids) {
      handles.delete(id);
    }
    transport
      .release({
        activationId: context.activationId,
        pluginId: context.pluginId,
        workspaceId: context.workspaceId,
        handleIds: [...ids],
      })
      .catch(() => undefined);
  };
  context.signal.addEventListener('abort', () => release([...handles.keys()]), {
    once: true,
  });

  return {
    async pick(options) {
      if (context.signal.aborted || options.signal?.aborted) {
        throw abortError();
      }
      const accept = normalizePluginFileFilters(options.accept);
      const extensions = [
        ...new Set(accept.flatMap((filter) => filter.extensions)),
      ];
      const request = transport.pick({
        activationId: context.activationId,
        pluginId: context.pluginId,
        workspaceId: context.workspaceId,
        extensions,
        kind: 'file',
        multiple: options.multiple === true,
      });
      const signals = [context.signal, options.signal].filter(
        (signal): signal is AbortSignal => Boolean(signal)
      );
      let rejectAbort!: (reason: unknown) => void;
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = reject;
      });
      const onAbort = () => rejectAbort(abortError());
      for (const signal of signals) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
      let result: PluginFilePickResult | undefined;
      try {
        result = await Promise.race([request, aborted]);
        if (signals.some((signal) => signal.aborted)) {
          throw abortError();
        }
        if (!result.success) {
          if ('cancelled' in result) {
            return [];
          }
          throw new Error(result.error);
        }
        return result.files.map((value) => {
          if (value.kind !== 'file') {
            throw new Error('File picker returned a directory handle');
          }
          const handle = validateHandle(value);
          handles.set(handle.id, handle);
          return handle;
        });
      } catch (error) {
        if (result?.success) {
          release(result.files.map((file) => file.id));
        } else if (signals.some((signal) => signal.aborted)) {
          request.then(
            (late) => {
              if (late.success) {
                release(late.files.map((file) => file.id));
              }
            },
            () => undefined
          );
        }
        throw error;
      } finally {
        for (const signal of signals) {
          signal.removeEventListener('abort', onAbort);
        }
      }
    },
    async readText(handle, options) {
      if (context.signal.aborted || options?.signal?.aborted) {
        throw abortError();
      }
      if (handles.get(handle.id) !== handle) {
        throw new Error('File handle does not belong to this activation');
      }
      if (transport.getEndpoint) {
        const maximum = options?.maxBytes ?? PLUGIN_TEXT_FILE_MAX_BYTES;
        const length =
          options?.length ?? Math.max(0, handle.size - (options?.start ?? 0));
        if (length > maximum) {
          throw new Error(`Text files are limited to ${maximum} bytes.`);
        }
        const bytes = await readFileBytes({
          context,
          handle,
          maximum,
          options,
          transport,
        });
        try {
          return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          throw new Error('Text file is not valid UTF-8');
        }
      }
      const result = await transport.readText({
        activationId: context.activationId,
        pluginId: context.pluginId,
        workspaceId: context.workspaceId,
        handleId: handle.id,
      });
      if (context.signal.aborted || options?.signal?.aborted) {
        throw abortError();
      }
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.text;
    },
    async pickDirectory(options = {}) {
      if (context.signal.aborted || options.signal?.aborted) {
        throw abortError();
      }
      const request = transport.pick({
        activationId: context.activationId,
        extensions: [],
        kind: 'directory',
        multiple: false,
        pluginId: context.pluginId,
        workspaceId: context.workspaceId,
      });
      const signals = [context.signal, options.signal].filter(
        (signal): signal is AbortSignal => Boolean(signal)
      );
      let rejectAbort!: (reason: unknown) => void;
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = reject;
      });
      const onAbort = () => rejectAbort(abortError());
      for (const signal of signals) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
      let result: PluginFilePickResult | undefined;
      try {
        result = await Promise.race([request, aborted]);
        if (signals.some((signal) => signal.aborted)) {
          throw abortError();
        }
        if (!result.success) {
          if ('cancelled' in result) {
            return null;
          }
          throw new Error(result.error);
        }
        const [value] = result.files;
        if (
          !(value && value.kind === 'directory' && result.files.length === 1)
        ) {
          throw new Error('Directory picker returned an invalid result');
        }
        const handle = validateSystemHandle(value) as PluginDirectoryHandle;
        handles.set(handle.id, handle);
        return handle;
      } catch (error) {
        if (result?.success) {
          release(result.files.map((handle) => handle.id));
        } else if (signals.some((signal) => signal.aborted)) {
          request.then(
            (late) => {
              if (late.success) {
                release(late.files.map((handle) => handle.id));
              }
            },
            () => undefined
          );
        }
        throw error;
      } finally {
        for (const signal of signals) {
          signal.removeEventListener('abort', onAbort);
        }
      }
    },
    async list(directory, options = {}) {
      if (context.signal.aborted || options.signal?.aborted) {
        throw abortError();
      }
      if (handles.get(directory.id) !== directory) {
        throw new Error('Directory handle does not belong to this activation');
      }
      if (!transport.list) {
        throw new Error('Plugin directory listing is unavailable');
      }
      const result = await transport.list({
        activationId: context.activationId,
        cursor: options.cursor,
        handleId: directory.id,
        limit: options.limit,
        pluginId: context.pluginId,
        workspaceId: context.workspaceId,
      });
      if (context.signal.aborted || options.signal?.aborted) {
        throw abortError();
      }
      if (!result.success) {
        throw new Error(result.error);
      }
      const entries = result.entries.map((value) => {
        const entry = validateEntry(value);
        if (entry.handle) {
          handles.set(entry.handle.id, entry.handle);
        }
        return entry;
      });
      return Object.freeze({
        entries: Object.freeze(entries),
        nextCursor: result.nextCursor,
      });
    },
    async readBytes(handle, options = {}) {
      if (handles.get(handle.id) !== handle) {
        throw new Error('File handle does not belong to this activation');
      }
      return readFileBytes({
        context,
        handle,
        maximum: options.maxBytes,
        options,
        transport,
      });
    },
    stream(handle, options: PluginFileReadOptions = {}) {
      if (context.signal.aborted || options.signal?.aborted) {
        throw abortError();
      }
      if (handles.get(handle.id) !== handle) {
        throw new Error('File handle does not belong to this activation');
      }
      return createFileStream({ context, handle, options, transport });
    },
    async write(directory, relativePath, data, options = {}) {
      if (context.signal.aborted || options.signal?.aborted) {
        throw abortError();
      }
      if (handles.get(directory.id) !== directory) {
        throw new Error('Directory handle does not belong to this activation');
      }
      const value = await writePluginFile({
        context,
        data,
        directory,
        onProgress: options.onProgress,
        overwrite: options.overwrite,
        relativePath,
        signal: options.signal,
        transport,
      });
      const handle = validateHandle(value);
      handles.set(handle.id, handle);
      return handle;
    },
    release(...owned) {
      release(
        owned
          .filter((handle) => handles.get(handle.id) === handle)
          .map((handle) => handle.id)
      );
    },
  };
}
