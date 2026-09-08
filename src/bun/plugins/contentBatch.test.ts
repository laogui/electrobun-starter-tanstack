import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createOperationContext,
  createPluginSession,
} from '../../shared/plugins/session';
import { ContentBatchError, ContentBatchStore } from './contentBatch';
import { loadPluginDirectory } from './loadDirectory';
import { runPluginCommand } from './logicRuntime';
import {
  redoNormalizeTitlesOnWorkspaceNotes,
  runNormalizeTitlesOnWorkspaceNotes,
  undoNormalizeTitlesOnWorkspaceNotes,
} from './noteTitleCommand';
import { requireGhostboardPluginSamplesRoot } from './outOfRepoSamples';
import { createContentBatchProbeHost } from './probeHost';

const TITLE_TOOLS_SAMPLE = join(
  requireGhostboardPluginSamplesRoot(),
  'title-tools'
);
const SELECTION_TOKEN = /^plgsel_/;

function seedStore() {
  const store = new ContentBatchStore();
  store.seed([
    { entityId: 'note_a', title: '  Hello   world ', revision: 3 },
    { entityId: 'note_b', title: 'Notes', revision: 1 },
  ]);
  return store;
}

describe('content batch titles', () => {
  it('applies a frozen title batch all-or-nothing and undoes it', async () => {
    const store = seedStore();
    const selection = await store.freezeSelection({
      operationId: 'plgop_one',
      entityIds: ['note_a', 'note_a', 'note_b'],
    });
    expect(selection).toHaveLength(2);
    const result = await store.applyBatch('plgop_one', 'ws_batch', {
      operationId: 'plgop_one',
      label: '整理资料标题',
      operations: selection.map((item) => ({
        ref: item.ref,
        expectedRevision: item.revision,
        set: {
          title: item.title.trim().replace(/\s+/g, ' '),
        },
      })),
    });
    expect(await store.get('note_a')).toMatchObject({
      title: 'Hello world',
      revision: 4,
    });
    expect(await store.get('note_b')).toMatchObject({
      title: 'Notes',
      revision: 1,
    });
    expect(result.results).toEqual([
      { ref: selection[0]?.ref, title: 'Hello world', revision: 4 },
      { ref: selection[1]?.ref, title: 'Notes', revision: 1 },
    ]);

    await store.undo('plgop_one');
    expect(await store.get('note_a')).toMatchObject({
      title: '  Hello   world ',
      revision: 3,
    });
    await store.redo('plgop_one');
    expect(await store.get('note_a')).toMatchObject({
      title: 'Hello world',
      revision: 4,
    });
  });

  it('rejects refs outside the freeze and stale revisions without writing', async () => {
    const store = seedStore();
    const selection = await store.freezeSelection({
      operationId: 'plgop_two',
      entityIds: ['note_a'],
    });
    await expect(
      store.applyBatch('plgop_two', 'ws_batch', {
        operationId: 'plgop_two',
        operations: [
          {
            ref: 'plgsel_forged',
            expectedRevision: 3,
            set: { title: 'Nope' },
          },
        ],
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      store.applyBatch('plgop_two', 'ws_batch', {
        operationId: 'plgop_two',
        operations: [
          {
            ref: selection[0]?.ref,
            expectedRevision: 2,
            set: { title: 'Nope' },
          },
        ],
      })
    ).rejects.toMatchObject({ code: 'revision-conflict' });
    expect((await store.get('note_a'))?.title).toBe('  Hello   world ');
  });

  it('does not restore an entity that moved to a newer revision', async () => {
    const store = seedStore();
    const first = await store.freezeSelection({
      operationId: 'plgop_first',
      entityIds: ['note_a'],
    });
    await store.applyBatch('plgop_first', 'ws_batch', {
      operationId: 'plgop_first',
      operations: [
        {
          ref: first[0]?.ref ?? '',
          expectedRevision: 3,
          set: { title: 'Hello world' },
        },
      ],
    });
    const second = await store.freezeSelection({
      operationId: 'plgop_second',
      entityIds: ['note_a'],
    });
    await store.applyBatch('plgop_second', 'ws_batch', {
      operationId: 'plgop_second',
      operations: [
        {
          ref: second[0]?.ref ?? '',
          expectedRevision: 4,
          set: { title: 'Later edit' },
        },
      ],
    });
    await store.undo('plgop_first');
    expect(await store.get('note_a')).toMatchObject({
      title: 'Later edit',
      revision: 5,
    });
    await store.redo('plgop_first');
    expect(await store.get('note_a')).toMatchObject({
      title: 'Later edit',
      revision: 5,
    });
  });

  it('reloads titles and undo history after a simulated restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'content-batch-'));
    const filePath = join(directory, 'titles.json');
    const store = await ContentBatchStore.open(filePath);
    store.seed([
      { entityId: 'note_a', title: '  Hello   world ', revision: 1 },
    ]);
    const selection = await store.freezeSelection({
      operationId: 'plgop_persist',
      entityIds: ['note_a'],
    });
    await store.applyBatch('plgop_persist', 'ws_batch', {
      operationId: 'plgop_persist',
      operations: [
        {
          ref: selection[0]?.ref ?? '',
          expectedRevision: 1,
          set: { title: 'Hello world' },
        },
      ],
    });
    const saved = JSON.parse(await readFile(filePath, 'utf8')) as {
      entities: { note_a: { title: string; revision: number } };
    };
    expect(saved.entities.note_a).toMatchObject({
      title: 'Hello world',
      revision: 2,
    });

    const restarted = await ContentBatchStore.open(filePath);
    expect(await restarted.get('note_a')).toMatchObject({
      title: 'Hello world',
      revision: 2,
    });
    await restarted.undo('plgop_persist');
    expect(await restarted.get('note_a')).toMatchObject({
      title: '  Hello   world ',
      revision: 1,
    });
  });

  it('runs the out-of-repo title-tools command through applyBatch', async () => {
    const loaded = await loadPluginDirectory(TITLE_TOOLS_SAMPLE);
    const store = seedStore();
    const session = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_batch',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read', 'content.selection.write'],
    });
    const operationId =
      session.context.kind === 'operation' ? session.context.operationId : '';
    await store.freezeSelection({
      operationId,
      entityIds: ['note_a', 'note_b'],
    });
    const result = await runPluginCommand({
      session,
      commandId: 'normalize-titles',
      source: loaded.sources['main.js'] ?? '',
      probe: createContentBatchProbeHost(store, operationId, 'ws_batch'),
    });
    expect(result.preview).toEqual([
      { token: expect.stringMatching(SELECTION_TOKEN), title: 'Hello world' },
      { token: expect.stringMatching(SELECTION_TOKEN), title: 'Notes' },
    ]);
    expect((await store.get('note_a'))?.title).toBe('Hello world');
    await store.undo(operationId);
    expect((await store.get('note_a'))?.title).toBe('  Hello   world ');
  });

  it('writes sidecar note titles and restores them after restart', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { writeFile } = await import('node:fs/promises');
    const ws = await mkdtemp(join(tmpdir(), 'note-title-batch-'));
    mkdirSync(join(ws, 'content', '.ghostboard', 'blocknote'), {
      recursive: true,
    });
    const fs = await import('node:fs');
    vi.stubGlobal('Bun', {
      file: vi.fn((filePath: string) => ({
        exists: async () => fs.existsSync(filePath),
        text: async () => fs.readFileSync(filePath, 'utf8'),
        json: async () => JSON.parse(fs.readFileSync(filePath, 'utf8')),
      })),
      write: vi.fn(async (filePath: string, data: string) => {
        await writeFile(filePath, data);
      }),
    });
    writeFileSync(
      join(ws, 'content', '.ghostboard', 'blocknote', 'note_a.json'),
      JSON.stringify({
        schema: 'ghostboard-blocknote/v1',
        noteId: 'note_a',
        revision: 3,
        title: '  Hello   world ',
        blocks: [],
        updatedAt: new Date().toISOString(),
      })
    );
    const store = await ContentBatchStore.openNotes(ws);
    const selection = await store.freezeSelection({
      operationId: 'plgop_note',
      entityIds: ['note_a'],
    });
    await store.applyBatch('plgop_note', 'ws_notes', {
      operationId: 'plgop_note',
      operations: [
        {
          ref: selection[0]?.ref ?? '',
          expectedRevision: 3,
          set: { title: 'Hello world' },
        },
      ],
    });
    const { loadNoteRecord } = await import('../noteStore');
    expect(await loadNoteRecord(ws, 'note_a')).toMatchObject({
      title: 'Hello world',
      revision: 4,
    });
    const restarted = await ContentBatchStore.openNotes(ws);
    expect(await restarted.get('note_a')).toMatchObject({
      title: 'Hello world',
      revision: 4,
    });
    await restarted.undo('plgop_note');
    expect(await loadNoteRecord(ws, 'note_a')).toMatchObject({
      title: '  Hello   world ',
      revision: 3,
    });
    vi.unstubAllGlobals();
  });

  it('normalizes sidecar notes from a canvas-like noteId selection', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { writeFile } = await import('node:fs/promises');
    const fs = await import('node:fs');
    const ws = await mkdtemp(join(tmpdir(), 'note-title-command-'));
    mkdirSync(join(ws, 'content', '.ghostboard', 'blocknote'), {
      recursive: true,
    });
    vi.stubGlobal('Bun', {
      file: vi.fn((filePath: string) => ({
        exists: async () => fs.existsSync(filePath),
        text: async () => fs.readFileSync(filePath, 'utf8'),
        json: async () => JSON.parse(fs.readFileSync(filePath, 'utf8')),
      })),
      write: vi.fn(async (filePath: string, data: string) => {
        await writeFile(filePath, data);
      }),
    });
    writeFileSync(
      join(ws, 'content', '.ghostboard', 'blocknote', 'note_a.json'),
      JSON.stringify({
        schema: 'ghostboard-blocknote/v1',
        noteId: 'note_a',
        revision: 3,
        title: '  Hello   world ',
        blocks: [],
        updatedAt: new Date().toISOString(),
      })
    );
    const applied = await runNormalizeTitlesOnWorkspaceNotes({
      workspacePath: ws,
      noteIds: ['note_a'],
      pluginDirectory: TITLE_TOOLS_SAMPLE,
    });
    expect(applied.titles.note_a).toBe('Hello world');
    const { loadNoteRecord } = await import('../noteStore');
    expect(await loadNoteRecord(ws, 'note_a')).toMatchObject({
      title: 'Hello world',
      revision: 4,
    });
    const undone = await undoNormalizeTitlesOnWorkspaceNotes({
      workspacePath: ws,
      noteIds: ['note_a'],
      operationId: applied.operationId,
    });
    expect(undone.note_a).toBe('  Hello   world ');
    expect(await loadNoteRecord(ws, 'note_a')).toMatchObject({
      title: '  Hello   world ',
      revision: 3,
    });
    const redone = await redoNormalizeTitlesOnWorkspaceNotes({
      workspacePath: ws,
      noteIds: ['note_a'],
      operationId: applied.operationId,
    });
    expect(redone.note_a).toBe('Hello world');
    expect(await loadNoteRecord(ws, 'note_a')).toMatchObject({
      title: 'Hello world',
      revision: 4,
    });
    vi.unstubAllGlobals();
  });

  it('rejects redo when the operation has not been undone', async () => {
    const store = seedStore();
    const selection = await store.freezeSelection({
      operationId: 'plgop_redo',
      entityIds: ['note_a'],
    });
    await store.applyBatch('plgop_redo', 'ws_batch', {
      operationId: 'plgop_redo',
      operations: [
        {
          ref: selection[0]?.ref ?? '',
          expectedRevision: 3,
          set: { title: 'Hello world' },
        },
      ],
    });
    await expect(store.redo('plgop_redo')).rejects.toMatchObject({
      code: 'invalid-state',
    });
  });

  it('rejects a mismatched operationId as invalid-state', async () => {
    const store = seedStore();
    await store.freezeSelection({
      operationId: 'plgop_real',
      entityIds: ['note_a'],
    });
    await expect(
      store.applyBatch('plgop_real', 'ws_batch', {
        operationId: 'plgop_other',
        operations: [],
      })
    ).rejects.toBeInstanceOf(ContentBatchError);
  });
});
