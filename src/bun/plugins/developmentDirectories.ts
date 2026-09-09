import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

import {
  type LoadedPluginDirectory,
  loadPluginDirectory,
} from './loadDirectory';
import { PLUGIN_PACKAGE_DIGEST_RE, PluginInstallError } from './pluginInstall';

export interface DevelopmentDirectoryRecord {
  digest: string;
  directory: string;
  installedAt: string;
  name: string;
  pluginId: string;
  version: string;
}
interface PendingDirectory {
  manifest: string;
  record: DevelopmentDirectoryRecord;
  transactionId: string;
}
interface DirectoryRegistry {
  connections: DevelopmentDirectoryRecord[];
  pending: PendingDirectory[];
  schema: 1;
}

const writes = new Map<string, Promise<unknown>>();

export async function withPluginSourceLock<T>(
  root: string,
  operation: () => Promise<T>
): Promise<T> {
  const next = (writes.get(root) ?? Promise.resolve())
    .catch(() => undefined)
    .then(operation);
  writes.set(root, next);
  try {
    return await next;
  } finally {
    if (writes.get(root) === next) {
      writes.delete(root);
    }
  }
}

function isRecord(value: unknown): value is DevelopmentDirectoryRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as DevelopmentDirectoryRecord;
  return (
    ['digest', 'directory', 'installedAt', 'name', 'pluginId', 'version'].every(
      (key) =>
        typeof record[key as keyof DevelopmentDirectoryRecord] === 'string'
    ) &&
    isAbsolute(record.directory) &&
    PLUGIN_PACKAGE_DIGEST_RE.test(record.digest)
  );
}

export class DevelopmentDirectories {
  private readonly path: string;

  constructor(root: string) {
    this.path = join(root, 'development-directories.json');
  }

  private async read(): Promise<DirectoryRegistry> {
    let value: DirectoryRegistry;
    try {
      value = JSON.parse(
        await readFile(this.path, 'utf8')
      ) as DirectoryRegistry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { schema: 1, connections: [], pending: [] };
      }
      throw new Error(
        'Cannot read development directory registry; existing records were preserved.',
        { cause: error }
      );
    }
    if (
      value?.schema !== 1 ||
      !Array.isArray(value.connections) ||
      !value.connections.every(isRecord) ||
      !Array.isArray(value.pending) ||
      !value.pending.every(
        (entry) =>
          entry &&
          isRecord(entry.record) &&
          typeof entry.manifest === 'string' &&
          typeof entry.transactionId === 'string'
      ) ||
      new Set(value.connections.map((entry) => entry.pluginId)).size !==
        value.connections.length
    ) {
      throw new Error(
        'Invalid development directory registry; existing records were preserved.'
      );
    }
    return value;
  }

  private async write(value: DirectoryRegistry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(value));
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async list(): Promise<DevelopmentDirectoryRecord[]> {
    return (await this.read()).connections;
  }

  async prepare(
    directory: string
  ): Promise<{ loaded: LoadedPluginDirectory; pending: PendingDirectory }> {
    const canonical = await realpath(directory);
    const loaded = await loadPluginDirectory(canonical);
    const state = await this.read();
    this.assertAvailable(state, loaded.manifest.id);
    const pending: PendingDirectory = {
      transactionId: `directory-${randomUUID()}`,
      manifest: JSON.stringify(loaded.manifest),
      record: {
        digest: createHash('sha256').update(randomUUID()).digest('hex'),
        directory: canonical,
        installedAt: new Date().toISOString(),
        name: loaded.manifest.name,
        pluginId: loaded.manifest.id,
        version: loaded.manifest.version,
      },
    };
    state.pending.push(pending);
    await this.write(state);
    return { loaded, pending };
  }

  async commit(transactionId: string): Promise<DevelopmentDirectoryRecord> {
    const state = await this.read();
    const pending = state.pending.find(
      (entry) => entry.transactionId === transactionId
    );
    if (!pending) {
      throw new PluginInstallError(
        'invalid-state',
        'Development directory review is no longer available.'
      );
    }
    this.assertAvailable(state, pending.record.pluginId);
    const loaded = await loadPluginDirectory(pending.record.directory);
    if (JSON.stringify(loaded.manifest) !== pending.manifest) {
      throw new PluginInstallError(
        'invalid-package',
        'Development manifest changed since review. Review the directory again.'
      );
    }
    state.connections.push(pending.record);
    state.pending = state.pending.filter((entry) => entry !== pending);
    await this.write(state);
    return pending.record;
  }

  async pendingPluginId(transactionId: string): Promise<string | undefined> {
    return (await this.read()).pending.find(
      (entry) => entry.transactionId === transactionId
    )?.record.pluginId;
  }

  async cancel(transactionId: string): Promise<void> {
    const state = await this.read();
    state.pending = state.pending.filter(
      (entry) => entry.transactionId !== transactionId
    );
    await this.write(state);
  }

  private assertAvailable(state: DirectoryRegistry, pluginId: string): void {
    if (state.connections.some((entry) => entry.pluginId === pluginId)) {
      throw new PluginInstallError(
        'already-installed',
        `Plugin already connected from a development directory: ${pluginId}`
      );
    }
  }
}
