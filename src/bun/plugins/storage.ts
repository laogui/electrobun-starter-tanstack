import { lstat, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { JsonValue } from '../../../packages/plugin-sdk';
import { isPluginId } from '../../shared/plugins/ids';
import {
  assertStorageKey,
  cloneStorageValue,
  PLUGIN_STORAGE_FILE_BYTES,
} from '../../shared/plugins/storage';
import { atomicWrite } from '../atomicWrite';

const queues = new Map<string, Promise<unknown>>();

type Scope = 'app' | 'workspace';
type Operation = 'get' | 'set' | 'delete' | 'list';

interface StorageRequest {
  key?: string;
  operation: Operation;
  pluginId: string;
  prefix?: string;
  scope: Scope;
  value?: JsonValue;
  workspaceId: string;
}

function parseRequest(body: unknown): StorageRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid storage request');
  }
  const input = body as StorageRequest;
  if (
    typeof input.pluginId !== 'string' ||
    input.pluginId.length > 200 ||
    !isPluginId(input.pluginId) ||
    typeof input.workspaceId !== 'string' ||
    !['app', 'workspace'].includes(input.scope) ||
    !['get', 'set', 'delete', 'list'].includes(input.operation)
  ) {
    throw new Error('Invalid storage identity, scope or operation');
  }
  if (input.operation === 'list') {
    if (
      input.prefix !== undefined &&
      (typeof input.prefix !== 'string' || input.prefix.length > 1024)
    ) {
      throw new Error('Invalid storage prefix');
    }
  } else {
    assertStorageKey(input.key);
  }
  return input.operation === 'set'
    ? { ...input, value: cloneStorageValue(input.value) }
    : input;
}

async function assertNotSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error('Plugin storage must not use symbolic links');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function readEntries(path: string): Promise<Map<string, JsonValue>> {
  let text: string;
  try {
    if ((await lstat(path)).size > PLUGIN_STORAGE_FILE_BYTES) {
      throw new Error('Plugin storage exceeds 4 MiB');
    }
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Map();
    }
    throw error;
  }
  const file = JSON.parse(text) as {
    schema?: unknown;
    entries?: unknown;
  } | null;
  if (
    file?.schema !== 'ghostboard-plugin-kv/v1' ||
    !Array.isArray(file.entries)
  ) {
    throw new Error('Invalid plugin storage file; original data was retained');
  }
  const entries = new Map<string, JsonValue>();
  for (const entry of file.entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error('Invalid plugin storage entry');
    }
    assertStorageKey(entry[0]);
    if (entries.has(entry[0])) {
      throw new Error('Duplicate plugin storage key');
    }
    entries.set(entry[0], cloneStorageValue(entry[1]));
  }
  return entries;
}

export class PluginStorageHost {
  private readonly roots: Record<Scope, string>;
  private readonly workspaceId: string;

  constructor(options: {
    appDataRoot: string;
    workspacePath: string;
    workspaceId: string;
  }) {
    this.roots = {
      app: resolve(options.appDataRoot, 'plugin-data'),
      workspace: resolve(options.workspacePath, '.ghostboard', 'plugin-data'),
    };
    this.workspaceId = options.workspaceId;
  }

  /**
   * @param scope.pluginId When the caller authenticated with a plugin-scoped
   * token, the plugin id it was issued to. Requests for any other plugin's
   * storage are refused.
   */
  async handle(
    request: Request,
    corsHeaders: HeadersInit,
    scope: { pluginId?: string } = {}
  ): Promise<Response | null> {
    if (new URL(request.url).pathname !== '/plugins/storage') {
      return null;
    }
    const headers = new Headers(corsHeaders);
    headers.set('Cache-Control', 'no-store');
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers });
    }
    let input: StorageRequest;
    try {
      const text = await request.text();
      if (
        new TextEncoder().encode(text).byteLength > PLUGIN_STORAGE_FILE_BYTES
      ) {
        throw new Error('Storage request too large');
      }
      input = parseRequest(JSON.parse(text));
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 400, headers });
    }
    if (scope.pluginId !== undefined && input.pluginId !== scope.pluginId) {
      return Response.json(
        { error: 'Storage belongs to another plugin' },
        { status: 403, headers }
      );
    }
    if (input.workspaceId !== this.workspaceId) {
      return Response.json(
        { error: 'Workspace is no longer active' },
        { status: 409, headers }
      );
    }
    const root = this.roots[input.scope];
    const directory = join(root, input.pluginId);
    const path = join(directory, 'kv.json');
    const operation = (queues.get(path) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        request.signal.throwIfAborted();
        await assertNotSymlink(root);
        await assertNotSymlink(directory);
        await assertNotSymlink(path);
        const entries = await readEntries(path);
        if (input.operation === 'list') {
          return {
            keys: [...entries.keys()]
              .filter((key) => key.startsWith(input.prefix ?? ''))
              .sort(),
          };
        }
        const key = input.key as string;
        if (input.operation === 'get') {
          return { found: entries.has(key), value: entries.get(key) };
        }
        if (input.operation === 'set') {
          entries.set(key, input.value as JsonValue);
        } else if (!entries.delete(key)) {
          return { success: true };
        }
        const text = JSON.stringify({
          schema: 'ghostboard-plugin-kv/v1',
          entries: [...entries],
        });
        if (
          new TextEncoder().encode(text).byteLength > PLUGIN_STORAGE_FILE_BYTES
        ) {
          throw new Error('Plugin storage exceeds 4 MiB per scope');
        }
        await mkdir(directory, { recursive: true });
        request.signal.throwIfAborted();
        await atomicWrite(path, text);
        return { success: true };
      });
    queues.set(path, operation);
    try {
      return Response.json(await operation, { headers });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error ? error.message : 'Storage operation failed',
        },
        { status: 500, headers }
      );
    } finally {
      if (queues.get(path) === operation) {
        queues.delete(path);
      }
    }
  }
}
