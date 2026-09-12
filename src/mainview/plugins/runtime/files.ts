import {
  rpcPickPluginFiles,
  rpcReadPluginFileText,
  rpcReleasePluginFiles,
} from '@/lib/rpc';
import type {
  PluginFileFilter,
  PluginFileHandle,
  PluginFiles,
} from '../../../../packages/plugin-sdk';
import type {
  PluginFileContext,
  PluginFileHandleData,
  PluginFilePickRequest,
  PluginFilePickResult,
  PluginFileReadRequest,
  PluginFileReadResult,
  PluginFileReleaseRequest,
} from '../../../shared/plugins/files';

const EXTENSION_RE = /^\.[a-z0-9][a-z0-9+_-]{0,15}$/;

export interface PluginFilesTransport {
  pick(request: PluginFilePickRequest): Promise<PluginFilePickResult>;
  readText(request: PluginFileReadRequest): Promise<PluginFileReadResult>;
  release(request: PluginFileReleaseRequest): Promise<{ success: boolean }>;
}

const defaultTransport: PluginFilesTransport = {
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
  const handles = new Map<string, PluginFileHandle>();
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
      try {
        const result = await Promise.race([request, aborted]);
        if (signals.some((signal) => signal.aborted)) {
          if (result.success) {
            release(result.files.map((file) => file.id));
          }
          throw abortError();
        }
        if (!result.success) {
          if ('cancelled' in result) {
            return [];
          }
          throw new Error(result.error);
        }
        return result.files.map((value) => {
          const handle = validateHandle(value);
          handles.set(handle.id, handle);
          return handle;
        });
      } catch (error) {
        if (signals.some((signal) => signal.aborted)) {
          request.then((late) => {
            if (late.success) {
              release(late.files.map((file) => file.id));
            }
          });
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
  };
}
