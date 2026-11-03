import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RpcContext } from './rpc/context';

const native = vi.hoisted(() => ({ pick: vi.fn<() => Promise<string[]>>() }));
vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: { userData: '/mock-user-data' },
    openFileDialog: native.pick,
  },
}));
const { createExportHandlers } = await import('./rpc/handlers/export');
let root: string;
let ws: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'markdown-export-integrity-'));
  ws = join(root, 'workspace');
  for (const path of ['content', 'attachments', '.ghostboard', '../output']) {
    await mkdir(join(ws, path), { recursive: true });
  }
  native.pick.mockResolvedValue([join(root, 'output')]);
  vi.stubGlobal('Bun', {
    file: (path: string) => ({
      path,
      exists: async () => existsSync(path),
      text: () => readFile(path, 'utf8'),
      json: async () => JSON.parse(await readFile(path, 'utf8')),
    }),
    write: async (
      path: string,
      data: string | Uint8Array | { path: string }
    ) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        typeof data === 'string'
          ? data
          : Uint8Array.from('path' in data ? await readFile(data.path) : data)
      );
    },
  });
  await writeFile(
    join(ws, '.ghostboard/workspace.json'),
    JSON.stringify({
      schema: 'ghostboard-workspace/v1',
      activeViewId: 'v',
      views: [{ id: 'v', name: 'Canvas', file: 'views/v.canvas.json' }],
    })
  );
  await writeFile(
    join(ws, 'content/one.md'),
    '---\nid: one\ntitle: Portable\n---\nPortable body [file](attachments/test.txt)'
  );
  await writeFile(
    join(ws, 'content/two.md'),
    '---\nid: two\ntitle: Other\n---\nOther body'
  );
  await writeFile(join(ws, 'attachments/test.txt'), 'Exact attachment bytes');
});
afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});
const handlers = () => createExportHandlers({ wsPath: ws } as RpcContext);
it('rejects missing view and empty selection instead of exporting the whole workspace', async () => {
  for (const params of [
    { scope: 'view' as const, viewId: 'missing' },
    { scope: 'view' as const },
    { scope: 'selected' as const, noteIds: [] },
  ]) {
    expect(await handlers().exportNotesMarkdown(params)).toMatchObject({
      success: false,
    });
  }
  expect(native.pick).not.toHaveBeenCalled();
});
it('exports selected notes with portable attachments into a fresh directory, without old all-scope files', async () => {
  const all = await handlers().exportNotesMarkdown({ scope: 'all' });
  const selected = await handlers().exportNotesMarkdown({
    scope: 'selected',
    noteIds: ['one', 'one'],
  });
  expect(all).toMatchObject({ success: true, exported: 2 });
  expect(selected).toMatchObject({ success: true, exported: 1 });
  expect(selected.filePath).not.toBe(all.filePath);
  const files = await readdir(join(selected.filePath!, 'notes'));
  expect(files).toHaveLength(1);
  expect(
    await readFile(join(selected.filePath!, 'notes', files[0]!), 'utf8')
  ).toContain('../attachments/test.txt');
  expect(
    await readFile(join(selected.filePath!, 'attachments/test.txt'), 'utf8')
  ).toBe('Exact attachment bytes');
});
it('reports a missing attachment as an incomplete export', async () => {
  await rm(join(ws, 'attachments/test.txt'));
  const result = await handlers().exportNotesMarkdown({
    scope: 'selected',
    noteIds: ['one'],
  });
  expect(result).toMatchObject({ success: false, exported: 0, failed: 1 });
});
it('does not export external bytes through a workspace attachment symlink', async () => {
  await writeFile(join(root, 'private.txt'), 'External private bytes');
  await rm(join(ws, 'attachments/test.txt'));
  await symlink(join(root, 'private.txt'), join(ws, 'attachments/test.txt'));
  const result = await handlers().exportNotesMarkdown({
    scope: 'selected',
    noteIds: ['one'],
  });
  expect(result).toMatchObject({ success: false, exported: 0, failed: 1 });
  await expect(
    readFile(join(result.filePath!, 'attachments/test.txt'))
  ).rejects.toMatchObject({ code: 'ENOENT' });
});
