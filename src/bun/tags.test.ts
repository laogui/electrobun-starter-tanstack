import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));

const setBunFile = () => {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => existsSync(filePath),
      text: async () => readFileSync(filePath, 'utf8'),
    })),
    write: vi.fn(writeFile),
  });
};

function writeNote(
  workspaceRoot: string,
  relPath: string,
  frontmatter: Record<string, unknown>,
  body = ''
) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else if (v == null) {
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push('---', '', body);
  const fullPath = join(workspaceRoot, 'content', relPath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, lines.join('\n'), 'utf8');
}

describe('listAllTags', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'tags-test-'));
    mkdirSync(join(workspaceRoot, 'content'), { recursive: true });
    setBunFile();
  });

  it('returns empty array when no notes exist', async () => {
    const { listAllTags } = await import('./tags');
    const result = await listAllTags(workspaceRoot);
    expect(result).toEqual([]);
  });

  it('aggregates primary tag and tags[] across notes', async () => {
    writeNote(workspaceRoot, 'a.md', {
      id: 'a',
      tag: 'Work',
      tags: ['Urgent', 'Inbox'],
    });
    writeNote(workspaceRoot, 'b.md', { id: 'b', tag: 'Work', tags: ['Inbox'] });
    writeNote(workspaceRoot, 'c.md', { id: 'c', tags: ['Personal'] });

    const { listAllTags } = await import('./tags');
    const result = await listAllTags(workspaceRoot);
    const map = new Map(result.map((t) => [t.name, t.count]));
    expect(map.get('Work')).toBe(2);
    expect(map.get('Inbox')).toBe(2);
    expect(map.get('Urgent')).toBe(1);
    expect(map.get('Personal')).toBe(1);
  });

  it('deduplicates case-insensitively keeping first-seen casing', async () => {
    writeNote(workspaceRoot, 'a.md', { id: 'a', tag: 'Work' });
    writeNote(workspaceRoot, 'b.md', { id: 'b', tag: 'work' });
    writeNote(workspaceRoot, 'c.md', { id: 'c', tags: ['WORK'] });

    const { listAllTags } = await import('./tags');
    const result = await listAllTags(workspaceRoot);
    const work = result.find((t) => t.name.toLowerCase() === 'work');
    expect(work).toBeDefined();
    expect(work?.name).toBe('Work');
    expect(work?.count).toBe(3);
  });

  it('counts a note once even when both tag and tags[] reference the same value', async () => {
    writeNote(workspaceRoot, 'a.md', {
      id: 'a',
      tag: 'Work',
      tags: ['Work', 'work'],
    });
    const { listAllTags } = await import('./tags');
    const result = await listAllTags(workspaceRoot);
    expect(result).toEqual([{ name: 'Work', count: 1 }]);
  });

  it('sorts by descending count then alphabetically', async () => {
    writeNote(workspaceRoot, 'a.md', { id: 'a', tags: ['Beta'] });
    writeNote(workspaceRoot, 'b.md', { id: 'b', tags: ['Alpha'] });
    writeNote(workspaceRoot, 'c.md', { id: 'c', tags: ['Alpha'] });
    writeNote(workspaceRoot, 'd.md', { id: 'd', tags: ['Beta'] });
    writeNote(workspaceRoot, 'e.md', { id: 'e', tags: ['Gamma'] });

    const { listAllTags } = await import('./tags');
    const result = await listAllTags(workspaceRoot);
    expect(result.map((t) => t.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('ignores empty / non-string entries', async () => {
    writeNote(workspaceRoot, 'a.md', {
      id: 'a',
      tag: '',
      tags: ['', '  ', 'Valid'],
    });
    const { listAllTags } = await import('./tags');
    const result = await listAllTags(workspaceRoot);
    expect(result).toEqual([{ name: 'Valid', count: 1 }]);
  });

  it('skips non-.md files', async () => {
    writeNote(workspaceRoot, 'a.md', { id: 'a', tag: 'Real' });
    writeFileSync(
      join(workspaceRoot, 'content', 'b.txt'),
      'tag: Fake\n',
      'utf8'
    );
    const { listAllTags } = await import('./tags');
    const result = await listAllTags(workspaceRoot);
    expect(result.map((t) => t.name)).toEqual(['Real']);
  });
});
