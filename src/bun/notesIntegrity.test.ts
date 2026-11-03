import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { saveNote, loadNote, parseFrontmatter } = await import('./notes');
let ws: string;
beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), 'notes-integrity-'));
  await mkdir(join(ws, 'content'));
  vi.stubGlobal('Bun', {
    file: (path: string) => ({
      exists: async () => existsSync(path),
      text: () => readFile(path, 'utf8'),
    }),
  });
});
afterEach(async () => {
  await rm(ws, { recursive: true, force: true });
});
it('parses CRLF delimiters without changing body line endings', () => {
  const parsed = parseFrontmatter(
    '---\r\nid: sample\r\ntitle: "A title"\r\n---\r\nBody\r\nNext'
  );
  expect(parsed.frontmatter.id).toBe('sample');
  expect(parsed.body).toBe('Body\r\nNext');
});
it('round trips backslashes, literal escapes, real newlines and quote characters', async () => {
  const title = 'C:\new"quoted"\n\nActual newline';
  await saveNote(
    ws,
    'content/sample.md',
    { id: 'sample', title, color: 'white', custom: '\\n\\r\\t\\' },
    'Body'
  );
  const loaded = await loadNote(ws, 'content/sample.md');
  expect(loaded?.frontmatter.title).toBe(title);
  expect(loaded?.frontmatter.custom).toBe('\\n\\r\\t\\');
  expect(loaded?.body).toBe('Body');
});
it('reads single quoted YAML scalars without treating backslashes as escapes', () => {
  const parsed = parseFrontmatter(
    "---\nid: sample\ntitle: 'C:\\new and it''s literal'\n---\nBody"
  );
  expect(parsed.frontmatter.title).toBe("C:\\new and it's literal");
});
