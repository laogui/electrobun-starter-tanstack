import { lstat, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { comparePluginPaths } from '../../../packages/plugin-sdk/canonicalDigest.js';
import {
  isPluginManifestError,
  LEGACY_PLUGIN_MESSAGE,
  parsePluginManifest,
} from '../../shared/plugins/manifest';
import {
  type DirectoryContents,
  readPluginContents,
} from './directoryContents';
import {
  type LoadedPluginDirectory,
  PluginDirectoryError,
} from './loadDirectory';

export interface PluginDirectorySnapshot {
  contents: DirectoryContents;
  load(): LoadedPluginDirectory;
}
const MAX_BYTES = 64 * 1024 * 1024;

/** Metadata is checked on every lookup; byte verification has a bounded age. */
export class PluginDirectoryCache {
  private readonly entries = new Map<
    string,
    {
      fingerprint: string;
      readAt: number;
      snapshot: PluginDirectorySnapshot;
      bytes: number;
    }
  >();
  private readonly pending = new Map<
    string,
    Promise<PluginDirectorySnapshot>
  >();
  private readonly now: () => number;
  private readonly maxAgeMs: number;
  constructor(now: () => number = Date.now, maxAgeMs = 30_000) {
    this.now = now;
    this.maxAgeMs = maxAgeMs;
  }

  invalidate(directory?: string): void {
    if (directory) {
      this.entries.delete(resolve(directory));
    } else {
      this.entries.clear();
    }
  }

  async read(
    directory: string,
    force = false
  ): Promise<PluginDirectorySnapshot> {
    const root = resolve(directory);
    const pending = this.pending.get(root);
    if (pending) {
      if (!force) {
        return pending;
      }
      await pending;
    }
    const next = this.readFresh(root, force);
    this.pending.set(root, next);
    try {
      return await next;
    } finally {
      if (this.pending.get(root) === next) {
        this.pending.delete(root);
      }
    }
  }

  private async fingerprint(root: string): Promise<string> {
    const parts: string[] = [];
    let bytes = 0;
    let count = 0;
    const visit = async (path: string): Promise<void> => {
      const full = path ? join(root, path) : root;
      const stat = await lstat(full, { bigint: true });
      if (!(stat.isDirectory() || stat.isFile())) {
        throw new Error(`Unsafe plugin path: ${path}`);
      }
      parts.push(
        JSON.stringify([
          path,
          String(stat.ino),
          String(stat.size),
          String(stat.mtimeNs),
          String(stat.ctimeNs),
        ])
      );
      count += 1;
      if (count > 20_000) {
        throw new Error(
          'Plugin directory exceeds the metadata snapshot limit.'
        );
      }
      if (stat.isFile()) {
        bytes += Number(stat.size);
        if (bytes > MAX_BYTES) {
          throw new Error('Plugin directory exceeds the runtime byte limit.');
        }
        return;
      }
      for (const name of (await readdir(full)).sort(comparePluginPaths)) {
        if (name !== '.git') {
          await visit(path ? `${path}/${name}` : name);
        }
      }
    };
    await visit('');
    return parts.join('\n');
  }

  private async readFresh(
    root: string,
    force: boolean
  ): Promise<PluginDirectorySnapshot> {
    const fingerprint = await this.fingerprint(root);
    const previous = this.entries.get(root);
    if (
      !force &&
      previous?.fingerprint === fingerprint &&
      this.now() - previous.readAt < this.maxAgeMs
    ) {
      return previous.snapshot;
    }
    const contents = await readPluginContents(root);
    if ((await this.fingerprint(root)) !== fingerprint) {
      throw new Error(
        'Plugin changed while loading; retry after files settle.'
      );
    }
    let loaded: LoadedPluginDirectory | undefined;
    const snapshot: PluginDirectorySnapshot = {
      contents,
      load: () => {
        if (loaded) {
          return loaded;
        }
        const raw = contents.files.get('manifest.json');
        if (!raw) {
          throw new PluginDirectoryError(
            contents.files.has('ghostboard.plugin.json')
              ? 'legacy-contract'
              : 'not-found',
            contents.files.has('ghostboard.plugin.json')
              ? LEGACY_PLUGIN_MESSAGE
              : 'Missing manifest.json'
          );
        }
        const manifest = parsePluginManifest(new TextDecoder().decode(raw));
        if (isPluginManifestError(manifest)) {
          throw new PluginDirectoryError(
            manifest.code === 'legacy-contract'
              ? 'legacy-contract'
              : 'invalid-manifest',
            manifest.message
          );
        }
        const entry = contents.files.get(manifest.entrypoints.app);
        if (!entry) {
          throw new PluginDirectoryError(
            'missing-entry',
            `Missing app entry: ${manifest.entrypoints.app}`
          );
        }
        loaded = {
          directory: root,
          manifest,
          sources: {
            [manifest.entrypoints.app]: new TextDecoder().decode(entry),
          },
        };
        return loaded;
      },
    };
    const bytes = [...contents.files.values()].reduce(
      (sum, value) => sum + value.byteLength,
      0
    );
    this.entries.delete(root);
    this.entries.set(root, {
      fingerprint,
      snapshot,
      bytes,
      readAt: this.now(),
    });
    let total = [...this.entries.values()].reduce(
      (sum, value) => sum + value.bytes,
      0
    );
    while (
      this.entries.size > 16 ||
      (this.entries.size > 1 && total > MAX_BYTES)
    ) {
      const oldest = this.entries.keys().next().value!;
      total -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
    return snapshot;
  }
}
