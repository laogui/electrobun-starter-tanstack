import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RpcContext } from './rpc/context';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));
vi.mock('./appLifecycle', () => ({
  getAppInfoData: async () => ({ version: '1.0.0' }),
}));
const hydration = await import('./canvasHydration');
const { createCanvasHandlers } = await import('./rpc/handlers/canvas');
const { createNotesHandlers } = await import('./rpc/handlers/notes');
const { saveBlockNoteSidecar, loadBlockNoteSidecar } = await import(
  './blocknote'
);
const { loadNote } = await import('./notes');
const metadata = await import('./nodeMetadata');
let ws: string;
const card = (id: string, data: Record<string, unknown>) => ({
  id,
  type: 'card',
  position: { x: 1, y: 2 },
  data: { noteId: id, type: 'text', ...data },
});
const handlers = () =>
  createCanvasHandlers({
    wsPath: ws,
    extensionScheduler: { tick: async () => undefined },
  } as RpcContext);
beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), 'canvas-persistence-'));
  await mkdir(join(ws, '.ghostboard/views'), { recursive: true });
  await mkdir(join(ws, 'content/.ghostboard/blocknote'), { recursive: true });
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
  vi.stubGlobal('Bun', {
    file: (path: string) => ({
      exists: async () => existsSync(path),
      text: () => readFile(path, 'utf8'),
      json: async () => JSON.parse(await readFile(path, 'utf8')),
    }),
    write: writeFile,
  });
});
afterEach(async () => {
  metadata.resetNodeMetadataCacheForTests(ws);
  await rm(ws, { recursive: true, force: true });
});

it('preserves legacy checklist tags on every migrated placement and after explicit clearing', async () => {
  await writeFile(
    join(ws, 'content/legacy.md'),
    '---\nid: note_legacy\ntitle: Tasks\ndisplayHint: checklist\n---\n- [x] Keep checked\n- [ ] Keep open'
  );
  await metadata.setNodeMetadata(ws, 'note_legacy', {
    tag: 'Acceptance',
    tags: ['Legacy'],
  });
  await writeFile(
    join(ws, '.ghostboard/views/default.canvas.json'),
    JSON.stringify({
      schema: 'ghostboard-canvas/v1',
      viewId: 'default',
      nodes: [
        card('top', { noteId: 'note_legacy', type: 'checklist' }),
        {
          id: 'folder',
          type: 'folder',
          position: { x: 400, y: 0 },
          data: {
            children: [
              { id: 'child', type: 'card', data: { noteId: 'note_legacy' } },
            ],
          },
        },
      ],
      edges: [],
    })
  );
  await handlers().loadCanvas({ viewId: 'default' });
  // The legacy primary tag folds into the single tag list, first position.
  expect(metadata.getNodeMetadata(ws, 'top')).toEqual({
    tags: ['Acceptance', 'Legacy'],
  });
  expect(metadata.getNodeMetadata(ws, 'child')).toEqual(
    metadata.getNodeMetadata(ws, 'top')
  );
  await metadata.setNodeMetadata(ws, 'top', { tag: null, tags: null });
  await metadata.flushNodeMetadata(ws);
  metadata.resetNodeMetadataCacheForTests(ws);
  await handlers().loadCanvas({ viewId: 'default' });
  expect(metadata.getNodeMetadata(ws, 'top')).toBeUndefined();
  expect(metadata.getNodeMetadata(ws, 'child')?.tags).toEqual([
    'Acceptance',
    'Legacy',
  ]);
});

it('repairs stranded widget tags on existing extension references without replacing newer placement tags', async () => {
  await metadata.setNodeMetadata(ws, 'widget_legacy', { tag: 'Old' });
  await metadata.setNodeMetadata(ws, 'existing', { tag: 'New' });
  await writeFile(
    join(ws, '.ghostboard/views/default.canvas.json'),
    JSON.stringify({
      schema: 'ghostboard-canvas/v1',
      viewId: 'default',
      nodes: ['existing', 'missing'].map((id) => ({
        id,
        type: 'extension',
        position: { x: 0, y: 0 },
        data: {
          canvasTypeId: 'ghostboard.productivity/checklist',
          instanceId: 'extinst_widget_legacy',
        },
      })),
      edges: [],
    })
  );
  await handlers().loadCanvas({ viewId: 'default' });
  // The placement's own tag stays first; the stranded one is appended.
  expect(metadata.getNodeMetadata(ws, 'existing')?.tags).toEqual([
    'New',
    'Old',
  ]);
  expect(metadata.getNodeMetadata(ws, 'missing')?.tags).toEqual(['Old']);
});

it('prepares current JSON-backed Markdown only on an export read', async () => {
  await saveBlockNoteSidecar(ws, 'export-note', {
    title: 'Structured',
    revision: 3,
    blocks: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Newest JSON body', styles: {} }],
      },
    ],
  });
  const notes = createNotesHandlers({ wsPath: ws } as RpcContext);
  const editorRead = await notes.loadBlockNote({ noteId: 'export-note' });
  expect(editorRead.success).toBe(true);
  expect(editorRead).not.toHaveProperty('markdown');
  const exportRead = await notes.loadBlockNote({
    noteId: 'export-note',
    includeMarkdown: true,
  });
  expect(exportRead.success).toBe(true);
  expect(exportRead.markdown).toContain('Newest JSON body');
});
it('does not offer a corrupt JSON note as an empty successful document', async () => {
  await writeFile(
    join(ws, 'content/.ghostboard/blocknote/broken.json'),
    '{broken'
  );
  const notes = createNotesHandlers({ wsPath: ws } as RpcContext);
  expect(
    await notes.loadBlockNote({ noteId: 'broken', includeMarkdown: true })
  ).toMatchObject({ success: false });
});

it('does not erase legacy content or change timestamps when saving only layout', async () => {
  const original =
    '---\nid: legacy\ntitle: Original\ndisplayHint: note\ncolor: white\ncreatedAt: 2020-01-01\nupdatedAt: 2020-01-02\ncustom: retained\n---\nDo not erase me';
  await writeFile(join(ws, 'content/legacy.md'), original);
  const result = await handlers().saveManifest({
    viewId: 'default',
    edges: [],
    nodes: [card('legacy', { title: 'Original', color: 'white' })],
  });
  expect(result).toMatchObject({ success: true });
  expect(await readFile(join(ws, 'content/legacy.md'), 'utf8')).toBe(original);
});

it('keeps unknown legacy frontmatter when a title is changed', async () => {
  await writeFile(
    join(ws, 'content/legacy.md'),
    '---\nid: legacy\ntitle: Original\ncustom: retained\n---\nBody'
  );
  await handlers().saveManifest({
    viewId: 'default',
    edges: [],
    nodes: [card('legacy', { title: 'Renamed', content: 'Body' })],
  });
  expect(await loadNote(ws, 'content/legacy.md')).toMatchObject({
    frontmatter: { title: 'Renamed', custom: 'retained' },
    body: 'Body',
  });
});

it('rejects a stale metadata batch before changing any other note', async () => {
  for (const id of ['first', 'stale']) {
    await saveBlockNoteSidecar(ws, id, { blocks: [], title: id, revision: 2 });
  }
  const pending: Promise<void>[] = [];
  const persist = hydration.persistManifestCardNote;
  vi.spyOn(hydration, 'persistManifestCardNote').mockImplementation(
    (...args) => {
      const write = persist(...args);
      pending.push(write);
      return write;
    }
  );
  const before = await readFile(
    join(ws, 'content/.ghostboard/blocknote/first.json'),
    'utf8'
  );
  const result = await handlers().saveManifest({
    viewId: 'default',
    edges: [],
    nodes: [
      card('first', { title: 'Changed', blocknoteRevision: 2 }),
      card('stale', { title: 'Old draft', blocknoteRevision: 1 }),
    ],
  });
  expect(result).toMatchObject({
    success: false,
    layoutSaved: true,
    conflictNoteIds: ['stale'],
  });
  const savedLayout = JSON.parse(
    await readFile(join(ws, '.ghostboard/views/default.canvas.json'), 'utf8')
  ) as { nodes: Array<{ data: Record<string, unknown> }> };
  expect(savedLayout.nodes).toHaveLength(2);
  expect(savedLayout.nodes[1]?.data).not.toHaveProperty('title');
  await Promise.allSettled(pending);
  expect(
    await readFile(join(ws, 'content/.ghostboard/blocknote/first.json'), 'utf8')
  ).toBe(before);
  expect(await loadBlockNoteSidecar(ws, 'stale')).toMatchObject({
    title: 'stale',
    revision: 2,
  });
});

it('queues legacy note writes behind an active workspace transaction', async () => {
  const { withNoteWorkspace } = await import('./noteTransactions');
  const { saveNote } = await import('./notes');
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const holding = withNoteWorkspace(ws, async () => {
    entered();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await ready;
  const writing = saveNote(ws, 'content/queued.md', { id: 'queued' }, 'Body');
  try {
    const result = await Promise.race([
      writing.then(() => 'written'),
      new Promise<string>((resolve) => setTimeout(() => resolve('queued'), 30)),
    ]);
    expect(result).toBe('queued');
    expect(existsSync(join(ws, 'content/queued.md'))).toBe(false);
  } finally {
    release();
    await holding;
    await writing;
  }
  expect(await loadNote(ws, 'content/queued.md')).toMatchObject({
    body: 'Body',
  });
});

it('acknowledges a shared note metadata write once, including folder references', async () => {
  await saveBlockNoteSidecar(ws, 'shared', {
    blocks: [],
    title: 'Before',
    color: 'white',
    revision: 2,
  });
  const data = {
    noteId: 'shared',
    title: 'After',
    color: 'white',
    blocknoteRevision: 2,
    type: 'text',
  };
  const result = await handlers().saveManifest({
    viewId: 'default',
    edges: [],
    nodes: [
      card('shared', data),
      {
        id: 'folder',
        type: 'folder',
        position: { x: 0, y: 0 },
        data: {
          children: [{ id: 'child', type: 'card', noteId: 'shared', data }],
        },
      },
    ],
  });
  expect(result).toMatchObject({
    success: true,
    noteChanges: [
      {
        id: 'shared',
        before: { title: 'Before', color: 'white', revision: 2 },
        after: { title: 'After', color: 'white', revision: 3 },
        metadataOnly: true,
      },
    ],
  });
  expect(await loadBlockNoteSidecar(ws, 'shared')).toMatchObject({
    title: 'After',
    revision: 3,
  });
});

it('rechecks cleanup references after the pending canvas save finishes', async () => {
  const { withNoteWorkspace } = await import('./noteTransactions');
  const { deleteUnlinkedNotes } = await import('./cleanup');
  const { utimes } = await import('node:fs/promises');
  await writeFile(
    join(ws, 'content/retained.md'),
    '---\nid: retained\n---\nBody'
  );
  await utimes(join(ws, 'content/retained.md'), new Date(0), new Date(0));
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const saving = withNoteWorkspace(ws, async () => {
    entered();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await writeFile(
      join(ws, '.ghostboard/views/default.canvas.json'),
      JSON.stringify({
        schema: 'ghostboard-canvas/v1',
        viewId: 'default',
        nodes: [card('retained', {})],
        edges: [],
      })
    );
  });
  await ready;
  const cleaning = deleteUnlinkedNotes(ws, ['content/retained.md']);
  try {
    const result = await Promise.race([
      cleaning.then(() => 'cleaned'),
      new Promise<string>((resolve) => setTimeout(() => resolve('queued'), 30)),
    ]);
    expect(result).toBe('queued');
  } finally {
    release();
    await saving;
  }
  expect(await cleaning).toEqual({
    deleted: [],
    skipped: ['content/retained.md'],
  });
});

it('retains newly created notes that have not yet gained a manifest reference', async () => {
  const { deleteUnlinkedNotes } = await import('./cleanup');
  await writeFile(join(ws, 'content/new.md'), '---\nid: new\n---\nBody');
  expect(await deleteUnlinkedNotes(ws, ['content/new.md'])).toEqual({
    deleted: [],
    skipped: ['content/new.md'],
  });
});

it('keeps the view list readable when note recovery blocks writes', async () => {
  const { loadWorkspaceConfig } = await import('./workspace');
  const { NOTE_INTENT_PATH } = await import('./noteTransactions');
  await writeFile(join(ws, NOTE_INTENT_PATH), 'damaged intent');
  expect(await loadWorkspaceConfig(ws)).toMatchObject({
    activeViewId: 'default',
  });
  expect(
    await handlers().saveManifest({ viewId: 'default', nodes: [], edges: [] })
  ).toMatchObject({ success: false });
  expect(await readFile(join(ws, NOTE_INTENT_PATH), 'utf8')).toBe(
    'damaged intent'
  );
});

it('rejects disagreeing legacy references before either body overwrites the other', async () => {
  const original = '---\nid: legacy\ntitle: Note\n---\nOriginal';
  await writeFile(join(ws, 'content/legacy.md'), original);
  const result = await handlers().saveManifest({
    viewId: 'default',
    edges: [],
    nodes: [
      card('first', {
        noteId: 'legacy',
        title: 'Note',
        content: 'First draft',
      }),
      card('second', {
        noteId: 'legacy',
        title: 'Note',
        content: 'Second draft',
      }),
    ],
  });
  expect(result).toMatchObject({ success: false, error: 'revision-conflict' });
  expect(await readFile(join(ws, 'content/legacy.md'), 'utf8')).toBe(original);
});

it('does not release the workspace queue while a failed template still has writes running', async () => {
  const { populateViewFromTemplate } = await import('./workspace');
  const { withNoteWorkspace } = await import('./noteTransactions');
  const notes = await import('./notes');
  const original = notes.createNote;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(notes, 'createNote').mockImplementation(async (...args) => {
    if (args[2] === 'Fail') {
      throw new Error('write failed');
    }
    await delayed;
    return original(...args);
  });
  const writing = populateViewFromTemplate(
    ws,
    { id: 'default', name: 'Default', file: 'views/default.canvas.json' },
    {
      meta: {
        id: 'fixture',
        name: 'Fixture',
        description: '',
        category: 'blank',
        tags: [],
        thumbnail: '',
      },
      nodes: [],
      edges: [],
      noteContents: {
        failed: { title: 'Fail', displayHint: 'note', body: '' },
        delayed: { title: 'Delayed', displayHint: 'note', body: 'Retain me' },
      },
    }
  );
  const rejected = expect(writing).rejects.toThrow('write failed');
  const next = withNoteWorkspace(ws, async () => 'entered');
  try {
    expect(
      await Promise.race([
        next,
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('queued'), 30)
        ),
      ])
    ).toBe('queued');
  } finally {
    release();
    await rejected;
    await next;
  }
});

it('restores a snapshot as a new canvas without changing the source or shared note body', async () => {
  const { createViewsHandlers } = await import('./rpc/handlers/views');
  const { loadWorkspaceConfig } = await import('./workspace');
  const { loadManifest } = await import('./manifest');
  await writeFile(
    join(ws, 'content/shared.md'),
    '---\nid: shared\n---\nCurrent body'
  );
  const original = JSON.stringify({
    schema: 'ghostboard-canvas/v1',
    viewId: 'default',
    nodes: [],
    edges: [],
  });
  await writeFile(join(ws, '.ghostboard/views/default.canvas.json'), original);
  const viewHandlers = createViewsHandlers({ wsPath: ws } as RpcContext);
  const result = await viewHandlers.restoreCanvasSnapshot({
    name: 'Recovered',
    nodes: [card('shared', { content: 'Stale body' })],
    edges: [],
    workspacePath: ws,
  });
  expect(result.success).toBe(true);
  expect(await readFile(join(ws, 'content/shared.md'), 'utf8')).toContain(
    'Current body'
  );
  expect(
    await readFile(join(ws, '.ghostboard/views/default.canvas.json'), 'utf8')
  ).toBe(original);
  const config = await loadWorkspaceConfig(ws);
  expect(config.activeViewId).toBe('default');
  const added = config.views.find((entry) => entry.id === result.viewId)!;
  expect((await loadManifest(ws, added.file))?.nodes).toHaveLength(1);
  expect(
    (
      await viewHandlers.restoreCanvasSnapshot({
        name: 'Foreign',
        nodes: [],
        edges: [],
        workspacePath: '/other-workspace',
      })
    ).success
  ).toBe(false);
});

it('rolls back earlier note writes when a later canvas write fails', async () => {
  const one = '---\nid: a\ntitle: A\n---\nBody A';
  const two = '---\nid: b\ntitle: B\n---\nBody B';
  await writeFile(join(ws, 'content/a.md'), one);
  await writeFile(join(ws, 'content/b.md'), two);
  const original = JSON.stringify({
    schema: 'ghostboard-canvas/v1',
    viewId: 'default',
    nodes: [],
    edges: [],
  });
  const manifestPath = join(ws, '.ghostboard/views/default.canvas.json');
  await writeFile(manifestPath, original);
  const persist = hydration.persistManifestCardNote;
  vi.spyOn(hydration, 'persistManifestCardNote').mockImplementation(
    async (...args) => {
      if (args[2] === 'b') {
        throw new Error('Injected second-note failure');
      }
      return persist(...args);
    }
  );
  const result = await handlers().saveManifest({
    viewId: 'default',
    edges: [],
    nodes: [
      card('a', { title: 'Changed A', content: 'New A' }),
      card('b', { title: 'Changed B', content: 'New B' }),
    ],
  });
  expect(result.success).toBe(false);
  expect(await readFile(join(ws, 'content/a.md'), 'utf8')).toBe(one);
  expect(await readFile(join(ws, 'content/b.md'), 'utf8')).toBe(two);
  expect(await readFile(manifestPath, 'utf8')).toBe(original);
  expect(existsSync(join(ws, '.ghostboard/canvas-write-intent.json'))).toBe(
    false
  );
});
