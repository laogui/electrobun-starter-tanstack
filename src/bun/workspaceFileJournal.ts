import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile, unlink } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { type AtomicWriteOptions, atomicWriteRaw } from './atomicWrite';
import { assertInside } from './workspacePaths';

export const FILE_JOURNAL = '.ghostboard/canvas-write-intent.json';
interface Change {
  after: string;
  before: string | null;
  file: string;
  mode?: number;
  versions?: string[];
}
interface Journal {
  changes: Change[];
  committed: boolean;
  schema: 'ghostboard-canvas-write/v1';
}
interface Owner {
  active: boolean;
  chain: Promise<void>;
  effects: Array<() => void>;
  journal: Journal;
  workspace: string;
}
const active = new AsyncLocalStorage<Owner>();
const bytes = async (path: string): Promise<string | null> => {
  try {
    return (await readFile(path)).toString('base64');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};
function pathFor(workspace: string, file: string) {
  if (
    !(
      file.startsWith('content/') ||
      file.startsWith('.ghostboard/') ||
      file.startsWith('attachments/')
    ) ||
    file === FILE_JOURNAL
  ) {
    throw new Error('Invalid journal path');
  }
  return assertInside(workspace, file);
}
function parseJournal(workspace: string, text: string): Journal {
  const value = JSON.parse(text) as Journal;
  if (
    value?.schema !== 'ghostboard-canvas-write/v1' ||
    !Array.isArray(value.changes) ||
    typeof value.committed !== 'boolean'
  ) {
    throw new Error('Invalid canvas write journal');
  }
  const paths = new Set<string>();
  for (const change of value.changes) {
    if (
      !change ||
      typeof change.file !== 'string' ||
      (change.before !== null && typeof change.before !== 'string') ||
      typeof change.after !== 'string' ||
      (change.mode !== undefined &&
        (!Number.isInteger(change.mode) ||
          change.mode < 0 ||
          change.mode > 0o777))
    ) {
      throw new Error('Invalid canvas write entry');
    }
    if (
      change.versions !== undefined &&
      !(
        Array.isArray(change.versions) &&
        change.versions.every(
          (entry) =>
            typeof entry === 'string' &&
            Buffer.from(entry, 'base64').toString('base64') === entry
        )
      )
    ) {
      throw new Error('Invalid canvas write versions');
    }
    const path = pathFor(workspace, change.file);
    if (paths.has(path)) {
      throw new Error('Duplicate canvas write entry');
    }
    paths.add(path);
    for (const value of [change.before, change.after]) {
      if (
        value !== null &&
        Buffer.from(value, 'base64').toString('base64') !== value
      ) {
        throw new Error('Invalid canvas write bytes');
      }
    }
  }
  return value;
}
async function recover(workspace: string, journal: Journal) {
  // Validate the entire set before any recovery write; external edits always stop recovery.
  for (const change of journal.changes) {
    const current = await bytes(pathFor(workspace, change.file));
    if (
      current !== change.before &&
      current !== change.after &&
      !(current !== null && change.versions?.includes(current))
    ) {
      throw new Error(`Canvas recovery conflicts with ${change.file}`);
    }
  }
  for (const change of journal.changes.toReversed()) {
    const path = pathFor(workspace, change.file);
    const desired = journal.committed ? change.after : change.before;
    if ((await bytes(path)) === desired) {
      continue;
    }
    if (desired === null) {
      await unlink(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      });
    } else {
      await atomicWriteRaw(
        path,
        new Uint8Array(Buffer.from(desired, 'base64')),
        { mode: change.mode }
      );
    }
  }
  await unlink(join(workspace, FILE_JOURNAL)).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  );
}
export async function recoverWorkspaceFileJournal(workspace: string) {
  const path = join(workspace, FILE_JOURNAL);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }
  await recover(workspace, parseJournal(workspace, text));
}

export async function journalWrite(
  path: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions,
  write: () => Promise<void>
) {
  const owner = active.getStore();
  if (!owner?.active) {
    return write();
  }
  const operation = owner.chain.then(async () => {
    const file = relative(owner.workspace, resolve(path)).replaceAll('\\', '/');
    pathFor(owner.workspace, file);
    const after = Buffer.from(data).toString('base64');
    const existing = owner.journal.changes.find((entry) => entry.file === file);
    if (existing) {
      existing.versions = [...(existing.versions ?? []), existing.after];
      existing.after = after;
    } else {
      owner.journal.changes.push({
        file,
        before: await bytes(path),
        after,
        mode: options.mode,
      });
    }
    // Publish the undo image before touching each target.
    await atomicWriteRaw(
      join(owner.workspace, FILE_JOURNAL),
      JSON.stringify(owner.journal),
      { mode: 0o600 }
    );
    await write();
  });
  owner.chain = operation;
  await operation;
}
export async function withWorkspaceFileTransaction<T>(
  workspace: string,
  work: () => Promise<T>
): Promise<T> {
  if (active.getStore()?.active) {
    return work();
  }
  const owner: Owner = {
    active: true,
    workspace: resolve(workspace),
    journal: {
      schema: 'ghostboard-canvas-write/v1',
      changes: [],
      committed: false,
    },
    chain: Promise.resolve(),
    effects: [],
  };
  return active.run(owner, async () => {
    try {
      const result = await work();
      owner.active = false;
      await owner.chain;
      if (owner.journal.changes.length) {
        owner.journal.committed = true;
        await atomicWriteRaw(
          join(workspace, FILE_JOURNAL),
          JSON.stringify(owner.journal),
          { mode: 0o600 }
        );
        await unlink(join(workspace, FILE_JOURNAL)).catch(() => undefined);
      }
      owner.active = false;
      active.exit(() => {
        for (const effect of owner.effects) {
          effect();
        }
      });
      return result;
    } catch (error) {
      owner.active = false;
      await owner.chain.catch(() => undefined);
      if (owner.journal.changes.length) {
        owner.journal.committed = false;
        try {
          await recover(workspace, owner.journal);
        } catch (recoveryError) {
          throw new AggregateError(
            [error, recoveryError],
            'Canvas save failed; recovery is required'
          );
        }
      }
      throw error;
    }
  });
}

export function deferWorkspaceEffect(effect: () => void): boolean {
  const owner = active.getStore();
  if (!owner?.active) {
    return false;
  }
  owner.effects.push(effect);
  return true;
}

export function hasWorkspaceFileTransaction(): boolean {
  return Boolean(active.getStore()?.active);
}

export async function inspectWorkspaceFileJournal(
  workspace: string,
  text: string
): Promise<string[]> {
  const journal = parseJournal(workspace, text);
  const conflicts: string[] = [];
  for (const change of journal.changes) {
    const current = await bytes(pathFor(workspace, change.file));
    if (
      current !== change.before &&
      current !== change.after &&
      !(current !== null && change.versions?.includes(current))
    ) {
      conflicts.push(change.file);
    }
  }
  return conflicts;
}
