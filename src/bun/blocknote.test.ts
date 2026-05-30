import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));

vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  return { ...actual };
});

beforeAll(() => {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => existsSync(filePath),
      text: async () => readFileSync(filePath, 'utf8'),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    })),
    write: vi.fn(async (filePath: string, data: string) => {
      const dir = filePath.slice(0, filePath.lastIndexOf('/'));
      if (dir) {
        mkdirSync(dir, { recursive: true });
      }
      await writeFile(filePath, data);
    }),
  });
});

import {
  BLOCKNOTE_SCHEMA,
  blocknoteSidecarExists,
  blocknoteSidecarRelativePath,
  deleteBlockNoteSidecar,
  loadBlockNoteSidecar,
  saveBlockNoteSidecar,
} from './blocknote';

describe('blocknote sidecar I/O', () => {
  let wsPath: string;

  beforeEach(() => {
    wsPath = mkdtempSync(join(tmpdir(), 'gb-bn-'));
    mkdirSync(join(wsPath, 'content'));
  });

  afterEach(() => {
    rmSync(wsPath, { force: true, recursive: true });
  });

  it('blocknoteSidecarRelativePath rejects ../ traversal and bad chars', () => {
    expect(() => blocknoteSidecarRelativePath('../etc/passwd')).toThrow();
    expect(() => blocknoteSidecarRelativePath('with space')).toThrow();
    expect(blocknoteSidecarRelativePath('abc_DEF-123')).toBe(
      'content/.ghostboard/blocknote/abc_DEF-123.json'
    );
  });

  it('saveBlockNoteSidecar writes JSON with schema and revision, loadBlockNoteSidecar round-trips', async () => {
    const { relativePath, hash } = await saveBlockNoteSidecar(
      wsPath,
      'note_abc',
      {
        blocks: [{ type: 'paragraph' }],
        revision: 3,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }
    );
    expect(relativePath).toBe('content/.ghostboard/blocknote/note_abc.json');
    expect(hash.startsWith('sha256-')).toBe(true);

    const loaded = await loadBlockNoteSidecar(wsPath, 'note_abc');
    expect(loaded).not.toBeNull();
    expect(loaded?.revision).toBe(3);
    expect(loaded?.blocks).toEqual([{ type: 'paragraph' }]);
  });

  it('returns null when the sidecar does not exist', async () => {
    const loaded = await loadBlockNoteSidecar(wsPath, 'missing');
    expect(loaded).toBeNull();
  });

  it('flags corrupted sidecars instead of throwing', async () => {
    mkdirSync(join(wsPath, 'content', '.ghostboard', 'blocknote'), {
      recursive: true,
    });
    writeFileSync(
      join(wsPath, 'content', '.ghostboard', 'blocknote', 'note_bad.json'),
      '{not json'
    );
    const loaded = await loadBlockNoteSidecar(wsPath, 'note_bad');
    expect(loaded?.corrupted).toBe(true);
  });

  it('flags non-matching schema as corrupted', async () => {
    mkdirSync(join(wsPath, 'content', '.ghostboard', 'blocknote'), {
      recursive: true,
    });
    writeFileSync(
      join(wsPath, 'content', '.ghostboard', 'blocknote', 'note_wrong.json'),
      JSON.stringify({ schema: 'other/v9', blocks: [] })
    );
    const loaded = await loadBlockNoteSidecar(wsPath, 'note_wrong');
    expect(loaded?.corrupted).toBe(true);
  });

  it('deleteBlockNoteSidecar removes existing files and returns false for missing', async () => {
    await saveBlockNoteSidecar(wsPath, 'note_del', {
      blocks: [],
      revision: 1,
    });
    expect(deleteBlockNoteSidecar(wsPath, 'note_del')).toBe(true);
    expect(deleteBlockNoteSidecar(wsPath, 'note_del')).toBe(false);
  });

  it('round-trips note metadata and preview as the note record', async () => {
    await saveBlockNoteSidecar(wsPath, 'note_meta', {
      blocks: [{ type: 'paragraph' }],
      revision: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
      title: 'Meta Note',
      displayHint: 'note',
      color: '#fca5a5',
      preview: { html: '<p>x</p>', excerpt: 'x', blocks: 1, version: 1 },
    });
    const loaded = await loadBlockNoteSidecar(wsPath, 'note_meta');
    expect(loaded).toMatchObject({
      revision: 2,
      title: 'Meta Note',
      displayHint: 'note',
      color: '#fca5a5',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(loaded?.preview?.html).toBe('<p>x</p>');
  });

  it('blocknoteSidecarExists reflects whether a sidecar is present', async () => {
    expect(await blocknoteSidecarExists(wsPath, 'note_exists')).toBe(false);
    await saveBlockNoteSidecar(wsPath, 'note_exists', {
      blocks: [],
      revision: 1,
    });
    expect(await blocknoteSidecarExists(wsPath, 'note_exists')).toBe(true);
  });
});

describe('BLOCKNOTE_SCHEMA constant', () => {
  it('stays at the v1 ghostboard schema id', () => {
    expect(BLOCKNOTE_SCHEMA).toBe('ghostboard-blocknote/v1');
  });
});
