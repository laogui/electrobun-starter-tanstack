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
    const { parseChecklistBody, serializeChecklistItems } =
      await import('./notes');
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
    expect(displayHintToType(undefined)).toBe('text');
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
    expect(result.body).toBe('hello');
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

  it('createNote creates a slugged markdown file and loadNote reads it back', async () => {
    const { createNote, loadNote } = await import('./notes');

    const filePath = await createNote(
      workspaceRoot,
      'note-3',
      'Morning Plan',
      'note'
    );
    const savedPath = join(workspaceRoot, filePath);

    expect(filePath).toBe('content/morning-plan.md');
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
