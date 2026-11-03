import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: {
    moveToTrash: vi.fn(() => true),
    paths: { userData: '/mock-user-data' },
  },
}));

const {
  authorizeManifestRecovery,
  loadManifest,
  loadManifestDetailed,
  loadManifestsStrict,
  ManifestCorruptError,
  readManifest,
  saveManifest,
} = await import('./manifest');
const { scanUnlinkedNotes, deleteUnlinkedNotes } = await import('./cleanup');
const { collectReferencedInstanceIds } = await import('./extensions/gc');

let ws: string;

const viewsDir = () => join(ws, '.ghostboard', 'views');

function manifestWith(noteId: string) {
  return {
    schema: 'ghostboard-canvas/v1' as const,
    viewId: 'default',
    nodes: [
      {
        id: 'n1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { noteId },
      },
      {
        id: 'n2',
        type: 'extension',
        position: { x: 0, y: 0 },
        data: { instanceId: 'extinst_live' },
      },
    ],
    edges: [],
  };
}

async function writeWorkspace(): Promise<void> {
  await mkdir(viewsDir(), { recursive: true });
  await mkdir(join(ws, 'content'), { recursive: true });
  await writeFile(
    join(ws, '.ghostboard', 'workspace.json'),
    JSON.stringify({
      schema: 'ghostboard-workspace/v1',
      activeViewId: 'default',
      views: [
        { id: 'default', name: 'Default', file: 'views/default.canvas.json' },
      ],
    })
  );
}

beforeEach(async () => {
  const fs = await import('node:fs');
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => fs.existsSync(filePath),
      text: async () => fs.readFileSync(filePath, 'utf8'),
      json: async () => JSON.parse(fs.readFileSync(filePath, 'utf8')),
    })),
    write: vi.fn(),
  });
  ws = await mkdtemp(join(tmpdir(), 'manifest-test-'));
  await writeWorkspace();
});

afterEach(async () => {
  await rm(ws, { force: true, recursive: true });
});

describe('readManifest', () => {
  it('distinguishes a missing manifest from a corrupt one', async () => {
    expect(await readManifest(ws, 'views/default.canvas.json')).toEqual({
      kind: 'missing',
    });
    await writeFile(join(viewsDir(), 'default.canvas.json'), '{"nodes": [');
    const read = await readManifest(ws, 'views/default.canvas.json');
    expect(read.kind).toBe('corrupt');
  });

  it('keeps a copy of the damaged bytes next to the manifest', async () => {
    await writeFile(join(viewsDir(), 'default.canvas.json'), 'garbage');
    const read = await readManifest(ws, 'views/default.canvas.json');
    if (read.kind !== 'corrupt') {
      throw new Error(`expected corrupt, got ${read.kind}`);
    }
    expect(read.backupPath).toContain('default.canvas.json.corrupt-');
    expect(await readFile(read.backupPath, 'utf8')).toBe('garbage');
  });

  it('treats a structurally wrong manifest as corrupt', async () => {
    await writeFile(
      join(viewsDir(), 'default.canvas.json'),
      JSON.stringify({ nodes: 'not-an-array', edges: [] })
    );
    expect((await readManifest(ws, 'views/default.canvas.json')).kind).toBe(
      'corrupt'
    );
  });

  it('accepts the empty trash payload written for a missing manifest', async () => {
    await writeFile(join(viewsDir(), 'default.canvas.json'), '{}');
    const read = await readManifest(ws, 'views/default.canvas.json');
    expect(read).toMatchObject({
      kind: 'ok',
      manifest: { nodes: [], edges: [] },
    });
  });
});

describe('manifest backup recovery', () => {
  it('recovers from the previous save when the manifest is damaged', async () => {
    await saveManifest(ws, 'views/default.canvas.json', manifestWith('note_a'));
    await saveManifest(ws, 'views/default.canvas.json', manifestWith('note_b'));
    // The rolling .bak holds the previous save, not the current one.
    const backup = JSON.parse(
      await readFile(join(viewsDir(), 'default.canvas.json.bak'), 'utf8')
    ) as { nodes: Array<{ data: { noteId?: string } }> };
    expect(backup.nodes[0]?.data.noteId).toBe('note_a');

    await writeFile(join(viewsDir(), 'default.canvas.json'), '{broken');
    const read = await readManifest(ws, 'views/default.canvas.json');
    expect(read).toMatchObject({
      kind: 'corrupt',
      recovered: { from: 'views/default.canvas.json.bak' },
    });
    const loaded = await loadManifest(ws, 'views/default.canvas.json');
    expect(loaded?.nodes[0]?.data.noteId).toBe('note_a');
  });

  it('throws instead of returning an empty canvas when nothing is usable', async () => {
    await writeFile(join(viewsDir(), 'default.canvas.json'), '{broken');
    await expect(
      loadManifest(ws, 'views/default.canvas.json')
    ).rejects.toBeInstanceOf(ManifestCorruptError);
  });
});

describe('saveManifest never overwrites an unseen corrupt manifest', () => {
  it('refuses to write over a damaged canvas that was never recovered', async () => {
    const target = join(viewsDir(), 'default.canvas.json');
    await writeFile(target, '{broken');
    // e.g. "move to canvas" whose loadCanvas of the target rejected
    await expect(
      loadManifest(ws, 'views/default.canvas.json')
    ).rejects.toBeInstanceOf(ManifestCorruptError);
    await expect(
      saveManifest(ws, 'views/default.canvas.json', manifestWith('note_moved'))
    ).rejects.toBeInstanceOf(ManifestCorruptError);
    expect(await readFile(target, 'utf8')).toBe('{broken');
    expect(await readdir(viewsDir())).not.toContain('default.canvas.json.bak');
  });

  it('saves over a recovered canvas without rotating garbage into .bak', async () => {
    await saveManifest(ws, 'views/default.canvas.json', manifestWith('note_a'));
    await saveManifest(ws, 'views/default.canvas.json', manifestWith('note_b'));
    await writeFile(join(viewsDir(), 'default.canvas.json'), '{broken');

    const loaded = await loadManifestDetailed(ws, 'views/default.canvas.json');
    expect(loaded?.recovered?.from).toBe('views/default.canvas.json.bak');
    expect(loaded?.recovered?.backupPath).toContain(
      'default.canvas.json.corrupt-'
    );

    await expect(
      saveManifest(ws, 'views/default.canvas.json', manifestWith('note_c'))
    ).rejects.toBeInstanceOf(ManifestCorruptError);
    await authorizeManifestRecovery(
      ws,
      'views/default.canvas.json',
      loaded!.recovered!.token
    );
    await saveManifest(ws, 'views/default.canvas.json', manifestWith('note_c'));
    const backup = JSON.parse(
      await readFile(join(viewsDir(), 'default.canvas.json.bak'), 'utf8')
    ) as { nodes: Array<{ data: { noteId?: string } }> };
    expect(backup.nodes[0]?.data.noteId).toBe('note_a');
    expect(
      (await loadManifest(ws, 'views/default.canvas.json'))?.nodes[0]?.data
        .noteId
    ).toBe('note_c');
  });

  it('does not silently fall back to the .pre-topic snapshot', async () => {
    await writeFile(
      join(viewsDir(), 'default.canvas.json.pre-topic'),
      JSON.stringify(manifestWith('note_old'))
    );
    await writeFile(join(viewsDir(), 'default.canvas.json'), '{broken');
    await expect(
      loadManifestDetailed(ws, 'views/default.canvas.json')
    ).rejects.toBeInstanceOf(ManifestCorruptError);
  });
});

describe('reference scans fail closed on corrupt manifests', () => {
  async function seedUnlinkedNote(noteId: string): Promise<void> {
    await writeFile(
      join(ws, 'content', `${noteId}.md`),
      `---\nid: ${noteId}\ntitle: ${noteId}\n---\nbody\n`
    );
  }

  it('aborts loadManifestsStrict even when a backup exists', async () => {
    await saveManifest(ws, 'views/default.canvas.json', manifestWith('note_a'));
    await saveManifest(ws, 'views/default.canvas.json', manifestWith('note_a'));
    await writeFile(join(viewsDir(), 'default.canvas.json'), '{broken');
    await expect(
      loadManifestsStrict(ws, ['views/default.canvas.json'])
    ).rejects.toBeInstanceOf(ManifestCorruptError);
  });

  it('refuses to list or delete unlinked notes', async () => {
    await saveManifest(ws, 'views/default.canvas.json', manifestWith('note_a'));
    await seedUnlinkedNote('note_a');
    await seedUnlinkedNote('note_orphan');
    const healthy = await scanUnlinkedNotes(ws);
    expect(healthy.map((entry) => entry.noteId)).toEqual(['note_orphan']);

    await writeFile(join(viewsDir(), 'default.canvas.json'), '{broken');
    await expect(scanUnlinkedNotes(ws)).rejects.toBeInstanceOf(
      ManifestCorruptError
    );
    await expect(
      deleteUnlinkedNotes(ws, ['content/note_a.md'])
    ).rejects.toBeInstanceOf(ManifestCorruptError);
    expect(await readdir(join(ws, 'content'))).toContain('note_a.md');
  });

  it('refuses to compute extension instance garbage', async () => {
    await saveManifest(ws, 'views/default.canvas.json', manifestWith('note_a'));
    expect([...(await collectReferencedInstanceIds(ws))]).toEqual([
      'extinst_live',
    ]);
    await writeFile(join(viewsDir(), 'default.canvas.json'), '[]');
    await expect(collectReferencedInstanceIds(ws)).rejects.toBeInstanceOf(
      ManifestCorruptError
    );
  });
});

it('rejects a recovery approval if the damaged file or backup changed', async () => {
  await saveManifest(ws, 'views/default.canvas.json', manifestWith('a'));
  await saveManifest(ws, 'views/default.canvas.json', manifestWith('b'));
  const path = join(viewsDir(), 'default.canvas.json');
  await writeFile(path, '{broken');
  const loaded = await loadManifestDetailed(ws, 'views/default.canvas.json');
  await writeFile(path, '{different damage');
  await expect(
    authorizeManifestRecovery(
      ws,
      'views/default.canvas.json',
      loaded!.recovered!.token
    )
  ).rejects.toThrow();
  expect(await readFile(path, 'utf8')).toBe('{different damage');
});

it('revokes an approved recovery when the backup changes before saving', async () => {
  await saveManifest(ws, 'views/default.canvas.json', manifestWith('a'));
  await saveManifest(ws, 'views/default.canvas.json', manifestWith('b'));
  const path = join(viewsDir(), 'default.canvas.json');
  await writeFile(path, '{broken');
  const loaded = await loadManifestDetailed(ws, 'views/default.canvas.json');
  await authorizeManifestRecovery(
    ws,
    'views/default.canvas.json',
    loaded!.recovered!.token
  );
  await writeFile(`${path}.bak`, JSON.stringify(manifestWith('new-backup')));
  await expect(
    saveManifest(ws, 'views/default.canvas.json', manifestWith('stale'))
  ).rejects.toBeInstanceOf(ManifestCorruptError);
  expect(await readFile(path, 'utf8')).toBe('{broken');
});
