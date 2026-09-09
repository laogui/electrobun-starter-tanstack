import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { atomicWrite } from './atomicWrite';
import { notifyContentChanged } from './plugins/contentEvents';

export const NOTE_HISTORY_PATH =
  'content/.ghostboard/plugin-content-history.json';
export const NOTE_INTENT_PATH =
  'content/.ghostboard/plugin-content-intent.json';
const NOTE_ID = /^[A-Za-z0-9_-]+$/;
const MAX_INTENT_BYTES = 32 * 1024 * 1024;
const queues = new Map<string, Promise<unknown>>();
const ownership = new AsyncLocalStorage<{ active: boolean; path: string }>();

export class NoteTransactionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'NoteTransactionError';
    this.code = code;
  }
}

export interface NoteFileChange {
  after: string | null;
  before: string | null;
  id: string;
}
interface Intent {
  changes: NoteFileChange[];
  historyAfter: string;
  historyBefore: string | null;
  schema: 'ghostboard-note-intent/v1';
}

export function noteFilePath(workspace: string, id: string): string {
  if (!NOTE_ID.test(id)) {
    throw new NoteTransactionError('invalid-input', 'Invalid note id');
  }
  return join(workspace, 'content/.ghostboard/blocknote', `${id}.json`);
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

function parseIntent(text: string): Intent {
  if (Buffer.byteLength(text) > MAX_INTENT_BYTES) {
    throw new NoteTransactionError(
      'recovery-required',
      'Note transaction intent exceeds size limit'
    );
  }
  const value = JSON.parse(text) as Partial<Intent> | null;
  if (
    value?.schema !== 'ghostboard-note-intent/v1' ||
    !Array.isArray(value.changes) ||
    value.changes.length > 100 ||
    typeof value.historyAfter !== 'string' ||
    !(value.historyBefore === null || typeof value.historyBefore === 'string')
  ) {
    throw new NoteTransactionError(
      'recovery-required',
      'Invalid note transaction intent; original files retained'
    );
  }
  const ids = new Set<string>();
  for (const change of value.changes) {
    if (
      !change ||
      typeof change.id !== 'string' ||
      !NOTE_ID.test(change.id) ||
      ids.has(change.id) ||
      ![change.before, change.after].every(
        (item) => item === null || typeof item === 'string'
      )
    ) {
      throw new NoteTransactionError(
        'recovery-required',
        'Invalid note transaction entry'
      );
    }
    ids.add(change.id);
    for (const data of [change.before, change.after]) {
      if (data !== null) {
        const note = JSON.parse(data) as Record<string, unknown> | null;
        if (
          note?.schema !== 'ghostboard-blocknote/v1' ||
          note.noteId !== change.id ||
          !Array.isArray(note.blocks) ||
          !Number.isSafeInteger(note.revision) ||
          (note.revision as number) < 0
        ) {
          throw new NoteTransactionError(
            'recovery-required',
            'Invalid note transaction content'
          );
        }
      }
    }
  }
  const history = JSON.parse(value.historyAfter) as Record<
    string,
    unknown
  > | null;
  if (
    history?.schema !== 'ghostboard-content-history/v1' ||
    !Array.isArray(history.operations)
  ) {
    throw new NoteTransactionError(
      'recovery-required',
      'Invalid note transaction history'
    );
  }
  return value as Intent;
}

async function recoverUnlocked(workspace: string): Promise<void> {
  const path = join(workspace, NOTE_INTENT_PATH);
  const text = await readOptionalText(path);
  if (text === null) {
    return;
  }
  const intent = parseIntent(text);
  const changes = [
    ...intent.changes.map((change) => ({
      ...change,
      path: noteFilePath(workspace, change.id),
    })),
    {
      path: join(workspace, NOTE_HISTORY_PATH),
      before: intent.historyBefore,
      after: intent.historyAfter,
    },
  ];
  for (const change of changes) {
    const current = await readOptionalText(change.path);
    if (current !== change.before && current !== change.after) {
      throw new NoteTransactionError(
        'recovery-conflict',
        'A pending note transaction conflicts with externally changed files; preserve the intent for recovery'
      );
    }
  }
  for (const change of changes) {
    if ((await readOptionalText(change.path)) === change.after) {
      continue;
    }
    if (change.after === null) {
      await unlink(change.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      });
    } else {
      await mkdir(dirname(change.path), { recursive: true });
      await atomicWrite(change.path, change.after);
    }
  }
  await unlink(path);
  if (intent.changes.length) {
    const noteChanges = intent.changes.flatMap((change) => {
      if (change.before === null || change.after === null) {
        return [];
      }
      const before = JSON.parse(change.before) as {
        title?: string;
        color?: string;
        revision: number;
        blocks: unknown[];
      };
      const after = JSON.parse(change.after) as typeof before;
      return [
        {
          id: change.id,
          before: {
            title: before.title ?? '',
            color: before.color ?? '',
            revision: before.revision,
          },
          after: {
            title: after.title ?? '',
            color: after.color ?? '',
            revision: after.revision,
          },
          metadataOnly:
            JSON.stringify(before.blocks) === JSON.stringify(after.blocks),
        },
      ];
    });
    notifyContentChanged(workspace, {
      kind: 'note',
      ids: intent.changes.map((change) => change.id),
      operation: 'upsert',
      noteChanges,
    });
  }
}

/** Reentrant only while the owning operation still holds the workspace queue. */
export async function withNoteWorkspace<T>(
  workspace: string,
  work: () => Promise<T>
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
          await recoverUnlocked(path);
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

export async function commitNoteFiles(
  workspace: string,
  changes: NoteFileChange[],
  historyAfter: string
): Promise<void> {
  if (
    !ownership.getStore()?.active ||
    ownership.getStore()?.path !== resolve(workspace)
  ) {
    throw new Error('Note transactions require workspace ownership');
  }
  const historyBefore = await readOptionalText(
    join(workspace, NOTE_HISTORY_PATH)
  );
  const text = JSON.stringify({
    schema: 'ghostboard-note-intent/v1',
    changes,
    historyBefore,
    historyAfter,
  });
  parseIntent(text);
  await mkdir(join(workspace, 'content/.ghostboard'), { recursive: true });
  await atomicWrite(join(workspace, NOTE_INTENT_PATH), text);
  // After intent publication, completion may require recovery. Never undo a
  // partial commit by restoring stale bytes over an independently changed file.
  await recoverUnlocked(workspace);
}
