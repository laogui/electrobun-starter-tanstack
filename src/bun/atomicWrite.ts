import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AtomicWriteOptions {
  /**
   * File mode applied when the temporary file is created, so the data is
   * never readable with looser permissions (e.g. `0o600` for secrets).
   */
  mode?: number;
}

const DEFAULT_MODE = 0o666;

/**
 * Best-effort directory fsync so the rename itself survives a power loss.
 * Some platforms/filesystems refuse to open or fsync a directory; that is not
 * worth failing the write over because the file data is already durable.
 */
async function fsyncDirectory(dir: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(dir, 'r');
    await handle.sync();
  } catch {
    // Directory fsync is unsupported on some platforms (e.g. Windows).
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/**
 * Durable atomic write: write a unique sibling `.tmp` (created with `mode`),
 * fsync it, rename it over `filePath`, then fsync the parent directory.
 * Missing parent directories are created. The temporary file is removed when any step fails so no `.tmp` debris is
 * left next to the target.
 */
export async function atomicWrite(
  filePath: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const tmp = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  const mode = options.mode ?? DEFAULT_MODE;
  let renamed = false;
  // Bun.write (the previous implementation) created missing parents; keep that.
  await mkdir(dirname(filePath), { recursive: true });
  try {
    // 'wx' guarantees we created the file, so `mode` is the mode it got.
    const handle = await open(tmp, 'wx', mode);
    try {
      await handle.writeFile(data);
      if (options.mode !== undefined) {
        // The umask may have stripped bits; never loosen, only pin exactly.
        await handle.chmod(mode);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, filePath);
    renamed = true;
  } finally {
    if (!renamed) {
      await unlink(tmp).catch(() => undefined);
    }
  }
  await fsyncDirectory(dirname(filePath));
}
