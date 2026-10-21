import { copyFile, link, rename, unlink } from 'node:fs/promises';

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

/**
 * Keep the current on-disk bytes of `filePath` at `backupPath` before the
 * caller replaces it. A hard link makes this O(1) (the later atomic rename
 * gives `filePath` a new inode, leaving the link on the old bytes); file
 * systems without links fall back to a copy. A missing source is a no-op, and
 * any other failure is logged and swallowed so it never blocks the real save.
 */
export async function rotateBackup(
  filePath: string,
  backupPath: string
): Promise<void> {
  const staging = `${backupPath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  try {
    try {
      await link(filePath, staging);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return;
      }
      await copyFile(filePath, staging);
    }
    await rename(staging, backupPath);
  } catch (error) {
    await unlink(staging).catch(() => undefined);
    if (errorCode(error) !== 'ENOENT') {
      console.warn(`[persistence] Failed to refresh ${backupPath}:`, error);
    }
  }
}
