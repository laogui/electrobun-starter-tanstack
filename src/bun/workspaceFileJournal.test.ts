import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));
const { atomicWrite } = await import('./atomicWrite');
const { withNoteWorkspace } = await import('./noteTransactions');
const { FILE_JOURNAL, withWorkspaceFileTransaction } = await import(
  './workspaceFileJournal'
);
const { listTransactionRecovery, resolveTransactionRecovery } = await import(
  './transactionRecovery'
);
let ws: string;
const encoded = (value: string) => Buffer.from(value).toString('base64');
beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), 'workspace-journal-'));
  await mkdir(join(ws, '.ghostboard'));
  await mkdir(join(ws, 'content'));
});
afterEach(async () => {
  await rm(ws, { recursive: true, force: true });
});
const journal = (committed: boolean) =>
  JSON.stringify({
    schema: 'ghostboard-canvas-write/v1',
    committed,
    changes: [
      {
        file: 'content/note.md',
        before: encoded('Before'),
        after: encoded('After'),
      },
    ],
  });
it.each([
  false,
  true,
])('recovers a process interruption with committed=%s before allowing another write', async (committed) => {
  await writeFile(join(ws, FILE_JOURNAL), journal(committed));
  await writeFile(join(ws, 'content/note.md'), committed ? 'Before' : 'After');
  await withNoteWorkspace(ws, async () =>
    expect(await readFile(join(ws, 'content/note.md'), 'utf8')).toBe(
      committed ? 'After' : 'Before'
    )
  );
  expect(existsSync(join(ws, FILE_JOURNAL))).toBe(false);
});
it('restores repeated writes and removes newly created files when a later step fails', async () => {
  await writeFile(join(ws, 'content/note.md'), 'Before');
  await expect(
    withNoteWorkspace(ws, () =>
      withWorkspaceFileTransaction(ws, async () => {
        await atomicWrite(join(ws, 'content/note.md'), 'Intermediate');
        await atomicWrite(join(ws, 'content/new.md'), 'New');
        await atomicWrite(join(ws, 'content/note.md'), 'After');
        throw new Error('later failure');
      })
    )
  ).rejects.toThrow('later failure');
  expect(await readFile(join(ws, 'content/note.md'), 'utf8')).toBe('Before');
  expect(existsSync(join(ws, 'content/new.md'))).toBe(false);
});
it('exposes conflicts, refuses stale decisions and archives evidence without rewriting external edits', async () => {
  const raw = journal(false);
  await writeFile(join(ws, FILE_JOURNAL), raw);
  await writeFile(join(ws, 'content/note.md'), 'External edit');
  await expect(withNoteWorkspace(ws, async () => undefined)).rejects.toThrow();
  const [entry] = await listTransactionRecovery(ws);
  expect(entry?.conflicts).toEqual(['content/note.md']);
  expect(
    (
      await resolveTransactionRecovery(
        ws,
        'canvas',
        'stale-token',
        'quarantine'
      )
    ).success
  ).toBe(false);
  expect(
    (await resolveTransactionRecovery(ws, 'canvas', entry!.token, 'retry'))
      .success
  ).toBe(false);
  const result = await resolveTransactionRecovery(
    ws,
    'canvas',
    entry!.token,
    'quarantine'
  );
  expect(result.success).toBe(true);
  expect(await readFile(join(ws, result.archivedFile!), 'utf8')).toBe(raw);
  await withNoteWorkspace(ws, async () =>
    expect(await readFile(join(ws, 'content/note.md'), 'utf8')).toBe(
      'External edit'
    )
  );
});
it('rejects journal paths escaping the workspace without writing outside it', async () => {
  await writeFile(
    join(ws, FILE_JOURNAL),
    JSON.stringify({
      schema: 'ghostboard-canvas-write/v1',
      committed: false,
      changes: [
        { file: '../outside', before: null, after: encoded('payload') },
      ],
    })
  );
  await expect(withNoteWorkspace(ws, async () => undefined)).rejects.toThrow();
  expect(existsSync(join(ws, FILE_JOURNAL))).toBe(true);
});
it('does not let a timer inherited from a completed save create a stale transaction', async () => {
  let later!: Promise<void>;
  await withNoteWorkspace(ws, () =>
    withWorkspaceFileTransaction(ws, async () => {
      later = new Promise((resolve, reject) =>
        setTimeout(
          () =>
            atomicWrite(join(ws, 'content/later.md'), 'Later').then(
              resolve,
              reject
            ),
          10
        )
      );
    })
  );
  await later;
  expect(existsSync(join(ws, FILE_JOURNAL))).toBe(false);
});
