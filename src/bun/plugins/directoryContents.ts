import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface DirectoryContents {
  digest: string;
  files: Map<string, Uint8Array>;
}

export async function readPluginContents(
  directory: string
): Promise<DirectoryContents> {
  const files = new Map<string, Uint8Array>();
  const hash = createHash('sha256');
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
        const content = Uint8Array.from(await readFile(join(directory, path)));
        bytes += content.byteLength;
        if (files.size >= 20_000 || bytes > 64 * 1024 * 1024) {
          throw new Error(
            'Plugin directory exceeds the runtime snapshot limit (20,000 files / 64 MiB). Connect the runnable output directory.'
          );
        }
        files.set(path, content);
        hash.update(JSON.stringify([path, content.byteLength]));
        hash.update(content);
      } else {
        throw new Error(
          `Unsupported plugin file (symlink or special file): ${path}`
        );
      }
    }
  }
  await visit('');
  return { files, digest: hash.digest('hex') };
}
