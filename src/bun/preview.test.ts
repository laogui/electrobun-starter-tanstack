import { beforeEach, describe, expect, it, vi } from 'vitest';

const noteMocks = {
  saveNote: vi.fn(),
};

vi.mock('./notes', () => ({
  saveNote: (...args: Parameters<typeof noteMocks.saveNote>) =>
    noteMocks.saveNote(...args),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  noteMocks.saveNote.mockResolvedValue(undefined);
});

describe('preview generation', () => {
  it('buildPreview renders markdown badges and keeps only one image', async () => {
    const { buildPreview } = await import('../shared/markdown/preview');

    const preview = buildPreview(
      [
        '```ts',
        'const value = 1;',
        '```',
        '',
        '| Col |',
        '| --- |',
        '| Row |',
        '',
        '![One](https://example.com/one.png)',
        '',
        '![Two](https://example.com/two.png)',
      ].join('\n'),
      { sanitizeHtml: (html) => html }
    );

    expect(preview.html).toContain('note-badge">Code');
    expect(preview.html).toContain('note-badge">Table');
    expect(preview.html).toContain('loading="lazy"');
    expect(preview.html).toContain('+1 images');
    expect(preview.html).not.toContain('<pre>');
    expect(preview.html.match(/<img\b/g)).toHaveLength(1);
  });

  it('writeNoteWithPreview writes sanitized preview metadata', async () => {
    const { writeNoteWithPreview } = await import('./preview');

    const preview = await writeNoteWithPreview(
      '/workspace',
      'content/note.md',
      { id: 'note-1', title: 'Note' },
      ['# Hello', '', '- [x] Done', '', '<script>alert(1)</script>'].join('\n')
    );

    const frontmatter = noteMocks.saveNote.mock.calls[0]?.[2] as Record<
      string,
      unknown
    >;

    expect(noteMocks.saveNote).toHaveBeenCalledWith(
      '/workspace',
      'content/note.md',
      expect.objectContaining({
        id: 'note-1',
        previewBlocks: 3,
        previewExcerpt: expect.stringContaining('Hello'),
        previewVersion: 1,
      }),
      expect.stringContaining('- [x] Done')
    );
    expect(String(frontmatter.previewHtml)).toContain('<h1>Hello</h1>');
    expect(String(frontmatter.previewHtml)).toContain('note-checkbox-checked');
    expect(String(frontmatter.previewHtml)).not.toContain('<script>');
    expect(preview).toEqual(
      expect.objectContaining({
        blocks: 3,
        excerpt: expect.stringContaining('Hello'),
        version: 1,
      })
    );
  });
});
