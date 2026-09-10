import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  NOTE_HISTORY_PATH,
  NOTE_INTENT_PATH,
  NoteTransactionError,
} from '../noteTransactions';

/** Conservative reference check: fail closed on unreadable or malformed JSON. */
export async function assertCreationUnreferenced(
  workspace: string,
  ids: string[],
  protectedIds: unknown
): Promise<void> {
  if (
    !Array.isArray(protectedIds) ||
    protectedIds.some((id) => typeof id !== 'string')
  ) {
    throw new NoteTransactionError(
      'invalid-input',
      'Invalid live note references'
    );
  }
  if (ids.some((id) => protectedIds.includes(id))) {
    throw new NoteTransactionError(
      'content-referenced',
      'Created notes are still open or placed in the current view'
    );
  }
  const ownFiles = new Set(
    ids.map((id) =>
      join(workspace, 'content/.ghostboard/blocknote', `${id}.json`)
    )
  );
  const scan = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    );
    for (const entry of entries) {
      const path = join(directory, entry.name);
      // Do not traverse symlinks while deciding whether deletion is safe.
      if (entry.isSymbolicLink()) {
        throw new NoteTransactionError(
          'reference-check-failed',
          'Cannot verify references through a symlink'
        );
      }
      if (entry.isDirectory()) {
        await scan(path);
        continue;
      }
      if (
        !(entry.name.endsWith('.json') || entry.name.endsWith('.md')) ||
        ownFiles.has(path)
      ) {
        continue;
      }
      if (
        path === join(workspace, NOTE_HISTORY_PATH) ||
        path === join(workspace, NOTE_INTENT_PATH)
      ) {
        continue;
      }
      const text = await readFile(path, 'utf8');
      if (entry.name.endsWith('.json')) {
        try {
          JSON.parse(text);
        } catch {
          throw new NoteTransactionError(
            'reference-check-failed',
            'Cannot verify references in malformed workspace JSON'
          );
        }
      }
      if (ids.some((id) => text.includes(id))) {
        throw new NoteTransactionError(
          'content-referenced',
          'Created notes are referenced by workspace content or a canvas'
        );
      }
    }
  };
  for (const root of ['.ghostboard/views', '.ghostboard/trash', 'content']) {
    await scan(join(workspace, root));
  }
}
