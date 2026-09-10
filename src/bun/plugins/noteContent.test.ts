import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteContentUpdate } from '../../../packages/plugin-sdk';
import { loadBlockNoteSidecar, saveBlockNoteSidecar } from '../blocknote';
import { mergeNoteMeta } from '../noteStore';
import {
  NOTE_HISTORY_PATH,
  NOTE_INTENT_PATH,
  noteFilePath,
  withNoteWorkspace,
} from '../noteTransactions';
import { subscribeContentChanges } from './contentEvents';
import { NoteContentService } from './noteContent';

let workspace: string;
let service: NoteContentService;
const disposers: (() => void)[] = [];
const write = async (path: string, value: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
};
async function call(
  body: Record<string, unknown>,
  target = service,
  signal?: AbortSignal
) {
  const response = await target.handle(
    new Request('http://localhost/plugins/content', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: 'workspace',
        pluginId: 'example.notes',
        ...body,
      }),
      signal,
    }),
    {}
  );
  return {
    status: response!.status,
    result: (await response!.json()) as Record<string, any>,
  };
}
const update = (id = 'a', expectedRevision = 1, title = 'New title') => ({
  id,
  expectedRevision,
  changes: { title, color: 'blue' },
});
const batch = (
  operationId = 'batch-1',
  updates: NoteContentUpdate[] = [update()]
) => ({ action: 'update', operationId, label: 'Update notes', updates });
async function raw(id: string) {
  return JSON.parse(
    await readFile(noteFilePath(workspace, id), 'utf8')
  ) as Record<string, any>;
}
async function seed(id: string) {
  await saveBlockNoteSidecar(workspace, id, {
    title: `Title ${id}`,
    color: 'red',
    blocks: [
      {
        id: 'paragraph',
        type: 'paragraph',
        content: [{ type: 'text', text: 'Retain my body', styles: {} }],
        children: [],
      },
    ],
    revision: 1,
    preview: {
      html: '<p>Retain my body</p>',
      excerpt: 'Retain my body',
      blocks: 1,
      version: 1,
    },
  });
}
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'gb-note-content-'));
  vi.stubGlobal('Bun', {
    write: vi.fn(write),
    file: (path: string) => ({
      exists: async () => existsSync(path),
      text: () => readFile(path, 'utf8'),
      json: async () => JSON.parse(await readFile(path, 'utf8')),
    }),
  });
  service = new NoteContentService(workspace, 'workspace');
  await seed('a');
  await seed('b');
});
afterEach(async () => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  vi.unstubAllGlobals();
  await rm(workspace, { recursive: true, force: true });
});

describe('public note content transactions', () => {
  it('replaces bodies atomically, refreshes safe previews and restores rich text across restart', async () => {
    const original = await raw('a');
    original.blocks[0].type = 'heading';
    original.blocks[0].content[0].styles = { bold: true };
    await writeFile(noteFilePath(workspace, 'a'), JSON.stringify(original));
    const events: any[] = [];
    disposers.push(
      subscribeContentChanges(workspace, (event) => events.push(event))
    );
    const input = batch('body', [
      {
        id: 'a',
        expectedRevision: 1,
        changes: {
          text: '<script>alert(1)</script>\r\n第二行',
          title: 'Body changed',
        },
      },
      { id: 'b', expectedRevision: 1, changes: { text: '' } },
    ]);
    const result = await call(input);
    expect(result.status).toBe(200);
    expect(result.result.items[0]).toEqual({
      id: 'a',
      title: 'Body changed',
      color: 'red',
      revision: 2,
    });
    expect(
      JSON.parse(await readFile(join(workspace, NOTE_HISTORY_PATH), 'utf8'))
    ).toMatchObject({ schema: 'ghostboard-content-history/v2' });
    const replaced = await raw('a');
    expect(replaced.blocks).toHaveLength(2);
    expect(replaced.preview.html).not.toContain('<script>');
    expect(replaced.preview.html).toContain('&lt;script&gt;');
    expect((await call({ action: 'get', id: 'a' })).result.item.text).toContain(
      '第二行'
    );
    expect(
      (await call({ action: 'query', query: { text: '第二行' } })).result.items
    ).toHaveLength(1);
    expect((await raw('b')).blocks[0].content).toEqual([]);
    expect(
      events
        .at(-1)
        .noteChanges.every((change: any) => change.metadataOnly === false)
    ).toBe(true);
    service = new NoteContentService(workspace, 'workspace');
    expect((await call(input)).result).toEqual(result.result);
    expect(
      (
        await call({
          action: 'undo',
          batchId: 'body',
          operationId: 'undo-body',
        })
      ).status
    ).toBe(200);
    expect(await raw('a')).toMatchObject({
      blocks: original.blocks,
      preview: original.preview,
      title: original.title,
      revision: 3,
    });
    expect(
      (
        await call({
          action: 'redo',
          batchId: 'body',
          operationId: 'redo-body',
        })
      ).status
    ).toBe(200);
    expect(await raw('a')).toMatchObject({
      blocks: replaced.blocks,
      preview: replaced.preview,
      revision: 4,
    });
  });

  it('rejects invalid bodies and conflicts without changing any note', async () => {
    const original = await raw('a');
    for (const text of [null, {}, '界'.repeat(90_000)]) {
      expect(
        (
          await call({
            action: 'update',
            operationId: 'invalid-body',
            label: 'Invalid',
            updates: [{ id: 'a', expectedRevision: 1, changes: { text } }],
          })
        ).status
      ).toBe(400);
    }
    expect(
      (
        await call(
          batch('conflict-body', [
            { id: 'a', expectedRevision: 1, changes: { text: 'Changed' } },
            { id: 'b', expectedRevision: 0, changes: { text: 'Conflict' } },
          ])
        )
      ).status
    ).toBe(409);
    expect(await raw('a')).toEqual(original);
  });

  it('reads a requested note set in one operation, preserving order and missing slots', async () => {
    const result = await call({
      action: 'getMany',
      ids: ['b', 'absent', 'a', 'b'],
    });
    expect(result.status).toBe(200);
    expect(
      result.result.items.map((item: { id: string } | null) => item?.id ?? null)
    ).toEqual(['b', null, 'a', 'b']);
    expect((await call({ action: 'getMany', ids: [] })).result.items).toEqual(
      []
    );
    expect(
      (await call({ action: 'getMany', ids: new Array(501).fill('a') })).status
    ).toBe(400);
    expect((await call({ action: 'getMany', ids: ['a', 42] })).status).toBe(
      400
    );
  });

  it('queues set reads behind a complete writer operation', async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((done) => {
      entered = done;
    });
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const writer = withNoteWorkspace(workspace, async () => {
      entered();
      await mergeNoteMeta(workspace, 'a', {
        title: 'Updated a',
        expectedRevision: 1,
      });
      await gate;
      await mergeNoteMeta(workspace, 'b', {
        title: 'Updated b',
        expectedRevision: 1,
      });
    });
    await started;
    const reading = call({ action: 'getMany', ids: ['a', 'b'] });
    release();
    await writer;
    expect((await reading).result.items).toMatchObject([
      { id: 'a', title: 'Updated a', revision: 2 },
      { id: 'b', title: 'Updated b', revision: 2 },
    ]);
  });

  it('does not present a partially successful set when a selected note is corrupt', async () => {
    await writeFile(noteFilePath(workspace, 'b'), '{broken');
    const result = await call({ action: 'getMany', ids: ['a', 'b'] });
    expect(result.status).toBe(500);
    expect(result.result.code).toBe('corrupt-content');
    expect(result.result.items).toBeUndefined();
  });
  it('reads plain text, pages in note-id order, and preserves rich content and extras in a batch', async () => {
    const original = await raw('a');
    original.futureMetadata = { keep: true };
    await writeFile(noteFilePath(workspace, 'a'), JSON.stringify(original));
    expect(
      (await call({ action: 'get', id: 'missing' })).result.item
    ).toBeNull();
    expect((await call({ action: 'get', id: 'a' })).result.item.text).toContain(
      'Retain my body'
    );
    expect(
      (await call({ action: 'query', query: { limit: 1 } })).result
    ).toMatchObject({ items: [{ id: 'a' }], nextCursor: 'a' });
    expect(
      (await call({ action: 'query', query: { after: 'a', text: 'retain' } }))
        .result
    ).toMatchObject({ items: [{ id: 'b' }], nextCursor: null });
    const changed = vi.fn();
    disposers.push(subscribeContentChanges(workspace, changed));
    const result = await call(batch('batch-1', [update('a'), update('b')]));
    expect(result.status).toBe(200);
    expect(result.result.items).toEqual([
      { id: 'a', revision: 2, title: 'New title', color: 'blue' },
      { id: 'b', revision: 2, title: 'New title', color: 'blue' },
    ]);
    const saved = await raw('a');
    expect(saved.blocks).toEqual(original.blocks);
    expect(saved.preview).toEqual(original.preview);
    expect(saved.futureMetadata).toEqual({ keep: true });
    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0]?.[0].noteChanges).toHaveLength(2);
    expect(
      changed.mock.calls[0]?.[0].noteChanges.every(
        (item: { metadataOnly: boolean }) => item.metadataOnly
      )
    ).toBe(true);
    expect(
      (await call(batch('batch-1', [update('a'), update('b')]))).result
    ).toEqual(result.result);
    expect(changed).toHaveBeenCalledOnce();
    expect(
      (await call(batch('batch-1', [update('a', 2, 'Different')]))).result.code
    ).toBe('operation-mismatch');
  });

  it('checks every revision before writing and rejects duplicate or unsupported updates', async () => {
    const originals = [await raw('a'), await raw('b')];
    const failed = await call(batch('conflict', [update('a'), update('b', 0)]));
    expect(failed.status).toBe(409);
    expect(failed.result.code).toBe('revision-conflict');
    expect([await raw('a'), await raw('b')]).toEqual(originals);
    expect(existsSync(join(workspace, NOTE_HISTORY_PATH))).toBe(false);
    expect((await call(batch('duplicate', [update(), update()]))).status).toBe(
      400
    );
    expect(
      (
        await call({
          ...batch(),
          updates: [{ id: 'a', expectedRevision: 1, changes: { blocks: [] } }],
        })
      ).status
    ).toBe(400);
  });

  it('persists undo/redo with increasing revisions and idempotent history receipts', async () => {
    await call(batch('original', [update('a'), update('b')]));
    service = new NoteContentService(workspace, 'workspace');
    const undo = { action: 'undo', batchId: 'original', operationId: 'undo-1' };
    expect((await call(undo)).result.items).toEqual([
      { id: 'a', title: 'Title a', color: 'red', revision: 3 },
      { id: 'b', title: 'Title b', color: 'red', revision: 3 },
    ]);
    expect(
      (
        await call({
          action: 'redo',
          batchId: 'original',
          operationId: 'redo-1',
        })
      ).result.items[0].revision
    ).toBe(4);
    expect((await call(undo)).result.items[0].revision).toBe(3);
    expect((await raw('a')).revision).toBe(4);
    expect(
      (
        await call({
          action: 'undo',
          batchId: 'original',
          operationId: 'other',
          pluginId: 'example.other',
        })
      ).result.code
    ).toBe('history-missing');
    expect((await call(batch('old-write', [update('a', 1)]))).result.code).toBe(
      'revision-conflict'
    );
  });

  it('fails all of undo on conflict instead of silently skipping an edited note', async () => {
    await call(batch('original', [update('a'), update('b')]));
    await mergeNoteMeta(workspace, 'b', {
      expectedRevision: 2,
      title: 'User edit',
    });
    const result = await call({
      action: 'undo',
      batchId: 'original',
      operationId: 'undo',
    });
    expect(result.result.code).toBe('revision-conflict');
    expect((await raw('a')).title).toBe('New title');
    expect((await raw('b')).title).toBe('User edit');
  });

  it('records no-op receipts without advancing revisions or emitting content changes', async () => {
    const changed = vi.fn();
    disposers.push(subscribeContentChanges(workspace, changed));
    const input = batch('noop', [
      { id: 'a', expectedRevision: 1, changes: { title: 'Title a' } },
    ]);
    const result = await call(input);
    expect(result.result.changed).toBe(false);
    expect(result.result.items[0].revision).toBe(1);
    expect((await call(input)).result).toEqual(result.result);
    expect(changed).not.toHaveBeenCalled();
  });

  it('serializes the editor and plugin read-check-write sections', async () => {
    const editor = withNoteWorkspace(workspace, async () => {
      const current = await loadBlockNoteSidecar(workspace, 'a');
      await new Promise((resolve) => setTimeout(resolve, 20));
      await saveBlockNoteSidecar(workspace, 'a', {
        ...current!,
        blocks: [{ type: 'paragraph', content: 'Editor wins' }],
        revision: current!.revision + 1,
      });
    });
    const plugin = call(batch());
    await editor;
    expect((await plugin).result.code).toBe('revision-conflict');
    expect((await raw('a')).blocks).toEqual([
      { type: 'paragraph', content: 'Editor wins' },
    ]);
  });

  it('rejects stale or missing manifest revisions and advances a valid metadata revision', async () => {
    await expect(
      mergeNoteMeta(workspace, 'a', { title: 'No revision' })
    ).rejects.toMatchObject({ code: 'revision-conflict' });
    await mergeNoteMeta(workspace, 'a', {
      title: 'User title',
      expectedRevision: 1,
    });
    expect((await raw('a')).revision).toBe(2);
    await expect(
      mergeNoteMeta(workspace, 'a', { title: 'Stale', expectedRevision: 1 })
    ).rejects.toMatchObject({ code: 'revision-conflict' });
    expect(await mergeNoteMeta(workspace, 'a', { title: 'User title' })).toBe(
      false
    );
  });

  it.each([
    'note',
    'history',
    'body-note',
    'body-history',
  ])('recovers an interrupted %s write before the next SDK read or retry', async (failure) => {
    let fail = true;
    vi.mocked(Bun.write).mockImplementation(async (path, value) => {
      const file = String(path);
      if (
        fail &&
        file.includes(
          failure.endsWith('note')
            ? '/b.json.'
            : '/plugin-content-history.json.'
        )
      ) {
        fail = false;
        throw new Error('simulated disk failure');
      }
      return (await write(
        file,
        value === undefined ? '' : String(value)
      )) as never;
    });
    const changed = vi.fn();
    disposers.push(subscribeContentChanges(workspace, changed));
    const input = batch(
      'recover',
      [update('a'), update('b')].map((item) => ({
        ...item,
        changes: {
          ...item.changes,
          ...(failure.startsWith('body-') ? { text: 'Recovered body' } : {}),
        },
      }))
    );
    expect((await call(input)).result.code).toBe('commit-pending');
    expect(existsSync(join(workspace, NOTE_INTENT_PATH))).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    service = new NoteContentService(workspace, 'workspace');
    expect((await call({ action: 'get', id: 'a' })).result.item.revision).toBe(
      2
    );
    expect((await raw('b')).revision).toBe(2);
    expect((await call(input)).result.items).toHaveLength(2);
    expect(existsSync(join(workspace, NOTE_INTENT_PATH))).toBe(false);
    expect(changed).toHaveBeenCalledOnce();
    if (failure.startsWith('body-')) {
      expect((await call({ action: 'get', id: 'b' })).result.item.text).toBe(
        'Recovered body'
      );
      expect(
        (
          await call({
            action: 'undo',
            batchId: 'recover',
            operationId: 'recover-undo',
          })
        ).status
      ).toBe(200);
      expect((await call({ action: 'get', id: 'b' })).result.item.text).toBe(
        'Retain my body'
      );
    }
  });

  it('preserves external edits instead of overwriting them during recovery', async () => {
    vi.mocked(Bun.write).mockImplementation(async (path, value) => {
      if (String(path).includes('/b.json.')) {
        throw new Error('disk failure');
      }
      return (await write(
        String(path),
        value === undefined ? '' : String(value)
      )) as never;
    });
    expect(
      (await call(batch('conflict-recovery', [update('a'), update('b')])))
        .result.code
    ).toBe('commit-pending');
    const external = { ...(await raw('a')), title: 'External edit' };
    await writeFile(noteFilePath(workspace, 'a'), JSON.stringify(external));
    expect((await call({ action: 'get', id: 'a' })).result.code).toBe(
      'recovery-conflict'
    );
    expect(await raw('a')).toEqual(external);
    expect(existsSync(join(workspace, NOTE_INTENT_PATH))).toBe(true);
  });

  it('rejects corrupted journals and foreign workspaces without modifying notes', async () => {
    expect((await call({ ...batch(), workspaceId: 'other' })).result.code).toBe(
      'workspace-inactive'
    );
    await writeFile(join(workspace, NOTE_HISTORY_PATH), '{corrupted');
    expect((await call(batch())).status).toBe(500);
    expect((await raw('a')).revision).toBe(1);
    expect(await readFile(join(workspace, NOTE_HISTORY_PATH), 'utf8')).toBe(
      '{corrupted'
    );
  });
});
