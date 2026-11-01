import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const CORRUPT_SUFFIX = '.corrupt-';
const UNSAFE_TIMESTAMP_RE = /[:.]/g;

export type JsonFileRead<T> =
  | { backupPath: string; error: Error; kind: 'corrupt' }
  | { kind: 'empty' }
  | { kind: 'ok'; value: T };

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

/**
 * Copies the unreadable file aside once. Re-reading a still-corrupt file must
 * not pile up backups, so an existing copy with the same bytes is reused.
 */
async function preserveCorruptFile(
  path: string,
  contents: string,
  mode?: number
): Promise<string> {
  const dir = dirname(path);
  const prefix = `${basename(path)}${CORRUPT_SUFFIX}`;
  const names = await readdir(dir).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.startsWith(prefix)) {
      continue;
    }
    const existing = await readFile(join(dir, name), 'utf8').catch(() => null);
    if (existing === contents) {
      return join(dir, name);
    }
  }
  const stamp = new Date().toISOString().replace(UNSAFE_TIMESTAMP_RE, '-');
  const unique = crypto.randomUUID().slice(0, 8);
  const target = join(dir, `${prefix}${stamp}-${unique}`);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, contents, mode === undefined ? {} : { mode });
  await rename(temporary, target);
  return target;
}

/**
 * Reads a JSON state file, telling apart "not written yet" from "damaged".
 *
 * A missing file is `empty`, which callers may safely treat as no data. Bad
 * JSON or a value the schema rejects is `corrupt`: the original is preserved
 * next to it and callers must fail closed rather than overwrite it, because
 * blindly rewriting turns a recoverable file into permanent data loss.
 */
export async function readJsonOrEmpty<T>(
  path: string,
  parse: (value: unknown) => T,
  options: {
    /** File mode for the preserved copy (e.g. 0o600 for secrets). */
    corruptCopyMode?: number;
  } = {}
): Promise<JsonFileRead<T>> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if (isNotFound(error)) {
      return { kind: 'empty' };
    }
    throw error;
  }
  try {
    return { kind: 'ok', value: parse(JSON.parse(contents) as unknown) };
  } catch (error) {
    return {
      kind: 'corrupt',
      backupPath: await preserveCorruptFile(
        path,
        contents,
        options.corruptCopyMode
      ),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
