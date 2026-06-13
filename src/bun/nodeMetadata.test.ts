import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.stubGlobal('Bun', {
  file: vi.fn((filePath: string) => ({
    exists: async () => existsSync(filePath),
    json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    text: async () => readFileSync(filePath, 'utf8'),
  })),
  write: vi.fn(writeFile),
});

const {
  deleteNodeMetadata,
  deleteTagEverywhere,
  flushNodeMetadata,
  getNodeMetadata,
  listAllTagsFromMetadata,
  loadAllMetadata,
  renameTagEverywhere,
  resetNodeMetadataCacheForTests,
  sanitizeTagList,
  setNodeMetadata,
} = await import('./nodeMetadata');

async function makeWorkspace(): Promise<string> {
  const ws = await mkdtemp(join(tmpdir(), 'gb-nm-'));
  mkdirSync(join(ws, '.ghostboard'), { recursive: true });
  return ws;
}

function readFileSidecar(ws: string): unknown {
  const p = join(ws, '.ghostboard', 'node-metadata.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function seedFileSidecar(ws: string, entries: Record<string, unknown>): void {
  const doc = { schema: 'ghostboard-node-metadata/v1', entries };
  writeFileSync(
    join(ws, '.ghostboard', 'node-metadata.json'),
    JSON.stringify(doc, null, 2),
    'utf8'
  );
}

describe('sanitizeTagList', () => {
  it('trims, drops empty, dedupes case-insensitively, caps to 8', () => {
    const out = sanitizeTagList([
      ' Work ',
      'work',
      '',
      'idea',
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
    ]);
    expect(out).toEqual(['Work', 'idea', 'a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('splits string input on commas', () => {
    expect(sanitizeTagList('a, b, ,c')).toEqual(['a', 'b', 'c']);
  });

  it('caps individual tag length at 32', () => {
    const long = 'x'.repeat(50);
    expect(sanitizeTagList([long])[0]).toHaveLength(32);
  });
});

describe('nodeMetadata: load / set / get / delete', () => {
  let ws: string;
  beforeEach(async () => {
    ws = await makeWorkspace();
    resetNodeMetadataCacheForTests();
  });

  it('loadAllMetadata returns empty map when sidecar absent', async () => {
    const m = await loadAllMetadata(ws);
    expect(m).toEqual({});
  });

  it('loadAllMetadata reads existing sidecar', async () => {
    seedFileSidecar(ws, {
      'note-1': {
        tag: 'Work',
        tagColor: '#fcd34d',
        tagColors: { api: '#FDF2F8', stale: '#000000', Work: '#DBEAFE' },
        tags: ['api'],
      },
    });
    const m = await loadAllMetadata(ws);
    expect(m['note-1']).toEqual({
      tag: 'Work',
      tagColor: '#fcd34d',
      tagColors: { api: '#FDF2F8', Work: '#DBEAFE' },
      tags: ['api'],
    });
  });

  it('setNodeMetadata merges partials and flushes to disk', async () => {
    await setNodeMetadata(ws, 'note-1', { tag: 'Work', tagColor: '#fcd34d' });
    await setNodeMetadata(ws, 'note-1', {
      tagColors: { api: '#FDF2F8', h1: '#EAF2B8', stale: '#000000' },
      tags: ['api', 'h1'],
    });
    await flushNodeMetadata(ws);
    expect(getNodeMetadata(ws, 'note-1')).toEqual({
      tag: 'Work',
      tagColor: '#fcd34d',
      tagColors: { api: '#FDF2F8', h1: '#EAF2B8' },
      tags: ['api', 'h1'],
    });
    const onDisk = readFileSidecar(ws) as {
      entries: Record<string, unknown>;
    };
    expect(onDisk.entries['note-1']).toEqual({
      tag: 'Work',
      tagColor: '#fcd34d',
      tagColors: { api: '#FDF2F8', h1: '#EAF2B8' },
      tags: ['api', 'h1'],
    });
  });

  it('setting empty values clears fields and drops empty entry', async () => {
    await setNodeMetadata(ws, 'note-1', {
      tag: 'Work',
      tagColors: { api: '#FDF2F8' },
      tags: ['api'],
    });
    await setNodeMetadata(ws, 'note-1', {
      tag: '',
      tagColors: {},
      tags: [],
    });
    await flushNodeMetadata(ws);
    expect(getNodeMetadata(ws, 'note-1')).toBeUndefined();
  });

  it('deleteNodeMetadata removes the entry', async () => {
    await setNodeMetadata(ws, 'sticky-1', { tags: ['idea'] });
    await deleteNodeMetadata(ws, 'sticky-1');
    await flushNodeMetadata(ws);
    expect(getNodeMetadata(ws, 'sticky-1')).toBeUndefined();
  });
});

describe('listAllTagsFromMetadata', () => {
  let ws: string;
  beforeEach(async () => {
    ws = await makeWorkspace();
    resetNodeMetadataCacheForTests();
  });

  it('returns empty array for empty workspace', async () => {
    expect(await listAllTagsFromMetadata(ws)).toEqual([]);
  });

  it('aggregates primary + secondary tags across entries', async () => {
    seedFileSidecar(ws, {
      'note-1': { tag: 'Work', tags: ['api'] },
      'note-2': { tag: 'Work', tags: ['idea'] },
      'sticky-1': { tags: ['idea', 'api'] },
    });
    const summary = await listAllTagsFromMetadata(ws);
    expect(summary).toEqual([
      { name: 'api', count: 2 },
      { name: 'idea', count: 2 },
      { name: 'Work', count: 2 },
    ]);
  });

  it('dedupes within a single entry (tag === tags[i])', async () => {
    seedFileSidecar(ws, {
      'note-1': { tag: 'Work', tags: ['work'] },
    });
    const summary = await listAllTagsFromMetadata(ws);
    expect(summary).toEqual([{ name: 'Work', count: 1 }]);
  });

  it('sorts by count desc then alpha asc', async () => {
    seedFileSidecar(ws, {
      a: { tags: ['z', 'a'] },
      b: { tags: ['z'] },
    });
    const summary = await listAllTagsFromMetadata(ws);
    expect(summary).toEqual([
      { name: 'z', count: 2 },
      { name: 'a', count: 1 },
    ]);
  });
});

describe('renameTagEverywhere', () => {
  let ws: string;
  beforeEach(async () => {
    ws = await makeWorkspace();
    resetNodeMetadataCacheForTests();
  });

  it('renames primary tag and updates entries', async () => {
    seedFileSidecar(ws, {
      'note-1': { tag: 'Work', tagColor: '#fcd34d' },
      'sticky-1': {
        tagColors: { Work: '#FDF2F8', idea: '#EAF2B8' },
        tags: ['Work', 'idea'],
      },
    });
    const result = await renameTagEverywhere(ws, 'Work', 'Job');
    expect(result.updated).toBe(2);
    await flushNodeMetadata(ws);
    expect(getNodeMetadata(ws, 'note-1')).toEqual({
      tag: 'Job',
      tagColor: '#fcd34d',
    });
    expect(getNodeMetadata(ws, 'sticky-1')).toEqual({
      tagColors: { Job: '#FDF2F8', idea: '#EAF2B8' },
      tags: ['Job', 'idea'],
    });
  });

  it('case-insensitive matching merges duplicates', async () => {
    seedFileSidecar(ws, {
      'note-1': { tags: ['work', 'idea', 'Job'] },
    });
    const result = await renameTagEverywhere(ws, 'Work', 'Job');
    expect(result.updated).toBe(1);
    expect(getNodeMetadata(ws, 'note-1')?.tags).toEqual(['Job', 'idea']);
  });

  it('returns 0 when old/new same or blank', async () => {
    seedFileSidecar(ws, { 'note-1': { tag: 'Work' } });
    expect((await renameTagEverywhere(ws, 'Work', 'work')).updated).toBe(0);
    expect((await renameTagEverywhere(ws, '', 'Job')).updated).toBe(0);
    expect((await renameTagEverywhere(ws, 'Work', '  ')).updated).toBe(0);
  });
});

describe('deleteTagEverywhere', () => {
  let ws: string;
  beforeEach(async () => {
    ws = await makeWorkspace();
    resetNodeMetadataCacheForTests();
  });

  it('removes primary tag + clears tagColor', async () => {
    seedFileSidecar(ws, {
      'note-1': {
        tag: 'Work',
        tagColor: '#fcd34d',
        tagColors: { Work: '#DBEAFE', api: '#FDF2F8' },
        tags: ['api'],
      },
    });
    const result = await deleteTagEverywhere(ws, 'Work');
    expect(result.updated).toBe(1);
    expect(getNodeMetadata(ws, 'note-1')).toEqual({
      tagColors: { api: '#FDF2F8' },
      tags: ['api'],
    });
  });

  it('removes from secondary list and drops empty entries', async () => {
    seedFileSidecar(ws, {
      'sticky-1': { tagColors: { idea: '#FDF2F8' }, tags: ['idea'] },
      'sticky-2': {
        tagColors: { idea: '#FDF2F8', api: '#EAF2B8' },
        tags: ['idea', 'api'],
      },
    });
    const result = await deleteTagEverywhere(ws, 'idea');
    expect(result.updated).toBe(2);
    expect(getNodeMetadata(ws, 'sticky-1')).toBeUndefined();
    expect(getNodeMetadata(ws, 'sticky-2')).toEqual({
      tagColors: { api: '#EAF2B8' },
      tags: ['api'],
    });
  });

  it('returns 0 when name is blank', async () => {
    expect((await deleteTagEverywhere(ws, '  ')).updated).toBe(0);
  });
});
