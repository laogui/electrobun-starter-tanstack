import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { TransactionRecoveryEntry } from '../shared/transactionRecovery';
import {
  inspectNoteTransaction,
  NOTE_INTENT_PATH,
  readOptionalText,
  retryNoteRecovery,
  withNoteWorkspace,
} from './noteTransactions';
import {
  FILE_JOURNAL,
  inspectWorkspaceFileJournal,
  recoverWorkspaceFileJournal,
} from './workspaceFileJournal';

const files = { canvas: FILE_JOURNAL, notes: NOTE_INTENT_PATH } as const;
const tokenFor = (raw: string) =>
  createHash('sha256').update(raw).digest('hex');
export async function listTransactionRecovery(
  workspace: string
): Promise<TransactionRecoveryEntry[]> {
  return withNoteWorkspace(
    workspace,
    async () => {
      const entries: TransactionRecoveryEntry[] = [];
      for (const [id, file] of Object.entries(files) as [
        keyof typeof files,
        string,
      ][]) {
        const raw = await readOptionalText(join(workspace, file));
        if (raw === null) {
          continue;
        }
        let conflicts: string[] = [];
        let error: string | undefined;
        try {
          conflicts = await (id === 'canvas'
            ? inspectWorkspaceFileJournal(workspace, raw)
            : inspectNoteTransaction(workspace, raw));
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
        }
        entries.push({ id, file, raw, token: tokenFor(raw), error, conflicts });
      }
      return entries;
    },
    { skipRecovery: true }
  );
}
export async function resolveTransactionRecovery(
  workspace: string,
  id: keyof typeof files,
  token: string,
  action: 'retry' | 'quarantine'
) {
  return withNoteWorkspace(
    workspace,
    async () => {
      const path = join(workspace, files[id]);
      const raw = await readOptionalText(path);
      if (raw === null || tokenFor(raw) !== token) {
        return { success: false };
      }
      if (action === 'retry') {
        try {
          if (id === 'canvas') {
            await recoverWorkspaceFileJournal(workspace);
          } else {
            await retryNoteRecovery(workspace);
          }
          return { success: true };
        } catch {
          return { success: false };
        }
      }
      const directory = join(workspace, '.ghostboard/recovery');
      await mkdir(directory, { recursive: true });
      const archivedFile = `${id}-${Date.now()}-${randomUUID()}.json`;
      await rename(path, join(directory, archivedFile));
      return {
        success: true,
        archivedFile: `.ghostboard/recovery/${archivedFile}`,
      };
    },
    { skipRecovery: true }
  );
}
