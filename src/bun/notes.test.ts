import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: {
      userData: '/mock-user-data',
    },
  },
}));

const renameMock = vi.fn();
vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );

  return {
    ...actual,
    rename: (...args: Parameters<typeof renameMock>) => renameMock(...args),
  };
});

const setBunFile = () => {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => existsSync(filePath),
      text: async () => readFileSync(filePath, 'utf8'),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    })),
    write: vi.fn(writeFile),
  });
};

describe('notes', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'notes-test-'));
    mkdirSync(join(workspaceRoot, 'content'), { recursive: true });
    renameMock.mockReset();
    renameMock.mockImplementation(async (from: string, to: string) => {
      const data = await readFile(from, 'utf8');
      await writeFile(to, data);
      rmSync(from, { force: true });
    });
    setBunFile();
  });

  it('serializeChecklistItems and parseChecklistBody round-trip checklist content', async () => {
    const { serializeChecklistItems, parseChecklistBody } = await import(
      './notes'
    );
    const markdown = serializeChecklistItems([
      { text: 'Header', isHeader: true },
      { text: 'Done', checked: true },
      { text: 'Todo', checked: false },
    ]);

    expect(markdown).toBe('## Header\n- [x] Done\n- [ ] Todo');
    expect(parseChecklistBody(markdown)).toEqual([
      { text: 'Header', checked: false, isHeader: true },
      { text: 'Done', checked: true },
      { text: 'Todo', checked: false },
    ]);
  });

  it('displayHintToType maps note to text and preserves other hints', async () => {
    const { displayHintToType } = await import('./notes');

    expect(displayHintToType('note')).toBe('text');
    expect(displayHintToType('checklist')).toBe('checklist');
    expect(displayHintToType()).toBe('text');
  });

  it('cardDataToNote creates frontmatter/body for text cards', async () => {
    const { cardDataToNote } = await import('./notes');

    const result = cardDataToNote('note-1', {
      type: 'text',
      title: 'Inbox',
      content: 'hello',
      color: '#fff',
      tag: 'work',
      tagColor: 'blue',
    });

    expect(result.frontmatter).toMatchObject({
      id: 'note-1',
      title: 'Inbox',
      displayHint: 'note',
      color: '#fff',
      tag: 'work',
      tagColor: 'blue',
    });
    expect(result.frontmatter).not.toHaveProperty('previewHtml');
    expect(result.frontmatter).not.toHaveProperty('previewExcerpt');
    expect(result.frontmatter).not.toHaveProperty('previewBlocks');
    expect(result.frontmatter).not.toHaveProperty('previewVersion');
    expect(result.body).toBe('hello');
  });

  it('sanitizeTags trims, drops empties, dedupes (case-insensitive), and enforces limits', async () => {
    const { sanitizeTags } = await import('./notes');

    expect(sanitizeTags(undefined)).toEqual([]);
    expect(sanitizeTags(null)).toEqual([]);
    expect(sanitizeTags(['work', ' work ', 'WORK', ''])).toEqual(['work']);
    expect(sanitizeTags('alpha, beta ,, alpha , gamma')).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);

    const tooLong = 'x'.repeat(64);
    const [first] = sanitizeTags([tooLong]);
    expect(first).toHaveLength(32);

    const many = Array.from({ length: 12 }, (_, i) => `tag-${i}`);
    expect(sanitizeTags(many)).toHaveLength(8);
  });

  it('cardDataToNote persists sanitized tags[] into frontmatter', async () => {
    const { cardDataToNote } = await import('./notes');

    const result = cardDataToNote('note-tags', {
      type: 'text',
      title: 'With tags',
      content: '',
      tags: ['draft', ' draft ', 'review', ''],
    });

    expect(result.frontmatter.tags).toEqual(['draft', 'review']);
  });

  it('cardDataToNote omits tags[] when input has no valid entries', async () => {
    const { cardDataToNote } = await import('./notes');

    const result = cardDataToNote('note-no-tags', {
      type: 'text',
      title: 'No tags',
      content: '',
      tags: ['', '   '],
    });

    expect(result.frontmatter).not.toHaveProperty('tags');
  });

  it('cardDataToNote serializes checklist bodies', async () => {
    const { cardDataToNote } = await import('./notes');

    const result = cardDataToNote('note-2', {
      type: 'checklist',
      title: 'Checklist',
      items: [
        { text: 'Header', isHeader: true },
        { text: 'Done', checked: true },
      ],
    });

    expect(result.frontmatter.displayHint).toBe('checklist');
    expect(result.body).toBe('## Header\n- [x] Done');
  });

  it('noteToCardData hydrates checklist notes', async () => {
    const { noteToCardData } = await import('./notes');

    const data = noteToCardData({
      file: 'content/checklist.md',
      frontmatter: {
        id: 'note-1',
        title: 'Checklist',
        displayHint: 'checklist',
        color: '#fff',
      },
      body: '## Header\n- [ ] Todo',
    });

    expect(data).toMatchObject({
      type: 'checklist',
      file: 'content/checklist.md',
      title: 'Checklist',
      color: '#fff',
    });
    expect(data.items).toEqual([
      { text: 'Header', checked: false, isHeader: true },
      { text: 'Todo', checked: false },
    ]);
  });

  it('noteToCardData hydrates text note content', async () => {
    const { noteToCardData } = await import('./notes');

    const data = noteToCardData({
      file: 'content/note.md',
      frontmatter: {
        id: 'note-1',
        title: 'Text note',
        displayHint: 'note',
      },
      body: 'Plain body',
    });

    expect(data).toMatchObject({
      type: 'text',
      file: 'content/note.md',
      title: 'Text note',
      content: 'Plain body',
    });
  });

  it('noteToCardData normalizes preview numeric fields', async () => {
    const { noteToCardData } = await import('./notes');

    const data = noteToCardData({
      file: 'content/note.md',
      frontmatter: {
        id: 'note-1',
        title: 'Text note',
        displayHint: 'note',
        previewBlocks: '4' as unknown as number,
        previewHtml: '<p>Preview</p>',
        previewVersion: '1' as unknown as number,
      },
      body: 'Plain body',
    });

    expect(data).toMatchObject({
      previewBlocks: 4,
      previewHtml: '<p>Preview</p>',
      previewVersion: 1,
    });
  });

  it('createNote creates a slugged markdown file and loadNote reads it back', async () => {
    const { loadNote, createNote } = await import('./notes');

    const filePath = await createNote(
      workspaceRoot,
      'note-3',
      'Morning Plan',
      'note'
    );
    const savedPath = join(workspaceRoot, filePath);

    // filename now includes noteId suffix to guarantee uniqueness
    expect(filePath).toBe('content/morning-plan-note-3.md');
    expect(existsSync(savedPath)).toBe(true);

    const doc = await loadNote(workspaceRoot, filePath);
    expect(doc?.frontmatter).toMatchObject({
      id: 'note-3',
      title: 'Morning Plan',
      displayHint: 'note',
    });
    expect(doc?.body).toBe('');
  });

  it('saveNote persists frontmatter and body content', async () => {
    const { saveNote } = await import('./notes');

    await saveNote(
      workspaceRoot,
      'content/custom.md',
      { id: 'custom', title: 'Custom' },
      'Body'
    );

    const saved = readFileSync(
      join(workspaceRoot, 'content', 'custom.md'),
      'utf8'
    );
    expect(saved).toContain('id: custom');
    expect(saved).toContain('title: Custom');
    expect(saved).toContain('---\nBody');
  });

  it('loadNote parses preview numeric frontmatter fields', async () => {
    const { loadNote } = await import('./notes');
    writeFileSync(
      join(workspaceRoot, 'content', 'preview.md'),
      [
        '---',
        'id: preview',
        'previewBlocks: 2',
        'previewVersion: 1',
        '---',
        'Body',
      ].join('\n')
    );

    const doc = await loadNote(workspaceRoot, 'content/preview.md');

    expect(doc?.frontmatter.previewBlocks).toBe(2);
    expect(doc?.frontmatter.previewVersion).toBe(1);
  });

  it('rejects note paths that escape the content directory', async () => {
    const { deleteNoteFile, loadNote, saveNote } = await import('./notes');
    const outsidePath = join(workspaceRoot, 'secret.md');
    writeFileSync(outsidePath, '---\nid: secret\n---\nSecret');

    await expect(
      loadNote(workspaceRoot, 'content/../secret.md')
    ).rejects.toThrow('Note path must stay inside content/.');
    await expect(
      saveNote(workspaceRoot, 'content/../secret.md', { id: 'secret' }, 'Body')
    ).rejects.toThrow('Note path must stay inside content/.');
    await expect(
      deleteNoteFile(workspaceRoot, 'content/../secret.md')
    ).rejects.toThrow('Note path must stay inside content/.');
    expect(readFileSync(outsidePath, 'utf8')).toContain('Secret');
  });

  it('buildNoteIndex discovers note ids from markdown files', async () => {
    const { buildNoteIndex } = await import('./notes');
    writeFileSync(
      join(workspaceRoot, 'content', 'first.md'),
      '---\nid: first\ntitle: First\n---\nHello'
    );
    mkdirSync(join(workspaceRoot, 'content', 'nested'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'content', 'nested', 'second.md'),
      '---\nid: second\ntitle: Second\n---\nWorld'
    );

    const index = await buildNoteIndex(workspaceRoot);

    expect(index.get('first')).toBe('content/first.md');
    expect(index.get('second')).toBe('content/nested/second.md');
  });

  it('deleteNoteFile removes an existing note and returns false for missing files', async () => {
    const { deleteNoteFile } = await import('./notes');
    const notePath = join(workspaceRoot, 'content', 'delete-me.md');
    writeFileSync(notePath, '---\nid: delete\n---\n');

    await expect(
      deleteNoteFile(workspaceRoot, 'content/delete-me.md')
    ).resolves.toBe(true);
    expect(existsSync(notePath)).toBe(false);
    await expect(
      deleteNoteFile(workspaceRoot, 'content/missing.md')
    ).resolves.toBe(false);
  });
});
