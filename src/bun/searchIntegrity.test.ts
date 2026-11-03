import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));
const noteStore = await import('./noteStore');
const metadata = await import('./nodeMetadata');
const { searchWorkspace } = await import('./search');
const { saveNote } = await import('./notes');
let ws: string;
beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), 'search-integrity-'));
  await mkdir(join(ws, '.ghostboard/views'), { recursive: true });
  await mkdir(join(ws, 'content'), { recursive: true });
  vi.stubGlobal('Bun', {
    file: (path: string) => ({
      exists: async () => existsSync(path),
      text: () => readFile(path, 'utf8'),
      json: async () => JSON.parse(await readFile(path, 'utf8')),
    }),
    write: writeFile,
  });
  await writeFile(
    join(ws, '.ghostboard/workspace.json'),
    JSON.stringify({
      schema: 'ghostboard-workspace/v1',
      activeViewId: 'default',
      views: [
        { id: 'default', name: 'Default', file: 'views/default.canvas.json' },
      ],
    })
  );
  await writeFile(
    join(ws, '.ghostboard/views/default.canvas.json'),
    JSON.stringify({
      nodes: ['broken', 'healthy'].map((id) => ({
        id,
        type: 'card',
        position: { x: 0, y: 0 },
        data: { noteId: id, file: `content/${id}.md` },
      })),
      edges: [],
    })
  );
  await saveNote(
    ws,
    'content/healthy.md',
    { id: 'healthy', title: 'Surviving match', color: 'white' },
    'Readable match body'
  );
});
afterEach(async () => {
  await rm(ws, { recursive: true, force: true });
});
it('keeps healthy search results when one note throws and metadata is unreadable', async () => {
  const original = noteStore.loadNoteRecord;
  vi.spyOn(noteStore, 'loadNoteRecord').mockImplementation(
    (workspace, id, file) => {
      if (id === 'broken') {
        return Promise.reject(new Error('Injected read failure'));
      }
      return original(workspace, id, file);
    }
  );
  vi.spyOn(metadata, 'loadAllMetadata').mockRejectedValue(
    new Error('Injected metadata failure')
  );
  const results = await searchWorkspace(ws, { query: 'match' });
  expect(results.some((result) => result.noteId === 'healthy')).toBe(true);
  expect(results.some((result) => result.noteId === 'broken')).toBe(false);
  expect(await readFile(join(ws, 'content/healthy.md'), 'utf8')).toContain(
    'Readable match body'
  );
});
