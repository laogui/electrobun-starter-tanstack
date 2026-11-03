import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalTreeDigest } from '../../../packages/plugin-sdk/canonicalDigest.js';

export interface DirectoryContents {
  digest: string;
  files: Map<string, Uint8Array>;
  /** Pre-canonical runtime checksum, only for verifying an existing install before migration. */
  legacyDigest: string;
}

export async function readPluginContents(
  directory: string,
  options?: { excludePaths?: ReadonlySet<string> }
): Promise<DirectoryContents> {
  const files = new Map<string, Uint8Array>();
  const legacy = createHash('sha256');
  let bytes = 0;
  async function visit(relative: string): Promise<void> {
    const entries = await readdir(join(directory, relative), {
      withFileTypes: true,
    });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === '.git') {
        continue;
      }
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        if (options?.excludePaths?.has(path)) {
          continue;
        }
        const content = Uint8Array.from(await readFile(join(directory, path)));
        bytes += content.byteLength;
        if (files.size >= 20_000 || bytes > 64 * 1024 * 1024) {
          throw new Error(
            'Plugin directory exceeds the runtime snapshot limit (20,000 files / 64 MiB). Connect the runnable output directory.'
          );
        }
        files.set(path, content);
        legacy.update(JSON.stringify([path, content.byteLength]));
        legacy.update(content);
      } else {
        throw new Error(
          `Unsupported plugin file (symlink or special file): ${path}`
        );
      }
    }
  }
  await visit('');
  return {
    files,
    digest: canonicalTreeDigest(files),
    legacyDigest: legacy.digest('hex'),
  };
}
