import { rename } from 'node:fs/promises';

/** Atomic write: write to a unique .tmp then rename. */
export async function atomicWrite(
  filePath: string,
  data: string
): Promise<void> {
  const tmp = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await Bun.write(tmp, data);
  await rename(tmp, filePath);
}
