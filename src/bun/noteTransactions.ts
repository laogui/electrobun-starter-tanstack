import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { recoverWorkspaceFileJournal } from './workspaceFileJournal';

const queues = new Map<string, Promise<unknown>>();
const ownership = new AsyncLocalStorage<{ active: boolean; path: string }>();

export class NoteTransactionError extends Error {
  readonly code: string;
  readonly noteIds?: string[];
  constructor(code: string, message: string, noteIds?: string[]) {
    super(message);
    this.name = 'NoteTransactionError';
    this.code = code;
    this.noteIds = noteIds;
  }
}

export async function readOptionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Serialise note/canvas writes per workspace. Reentrant only while the owning
 * operation still holds the workspace queue. Before running, a pending canvas
 * write journal is recovered so no write lands on half-committed files.
 */
export async function withNoteWorkspace<T>(
  workspace: string,
  work: () => Promise<T>,
  options?: { skipRecovery?: boolean }
): Promise<T> {
  const path = resolve(workspace);
  const owner = ownership.getStore();
  if (owner?.active && owner.path === path) {
    return work();
  }
  const pending = (queues.get(path) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => {
      const token = { active: true, path };
      return ownership.run(token, async () => {
        try {
          if (!options?.skipRecovery) {
            try {
              await recoverWorkspaceFileJournal(path);
            } catch (error) {
              throw new NoteTransactionError(
                'recovery-required',
                error instanceof Error ? error.message : String(error)
              );
            }
          }
          return await work();
        } finally {
          token.active = false;
        }
      });
    });
  queues.set(path, pending);
  try {
    return await pending;
  } finally {
    if (queues.get(path) === pending) {
      queues.delete(path);
    }
  }
}
