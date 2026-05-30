import { describe, expect, it } from 'vitest';

import { buildBlockNotePreview } from './blocknotePreview';

const paragraph = (text: string, styles?: Record<string, boolean>) => ({
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: styles ?? {} }],
  children: [],
});

describe('buildBlockNotePreview', () => {
  it('returns an empty preview for empty / non-array input', () => {
    expect(buildBlockNotePreview([])).toEqual({
      html: '',
      excerpt: '',
      blocks: 0,
      version: 1,
    });
    expect(buildBlockNotePreview(undefined)).toEqual({
      html: '',
      excerpt: '',
      blocks: 0,
      version: 1,
    });
  });

  it('renders paragraphs and headings with inline styles', () => {
    const preview = buildBlockNotePreview([
      {
        type: 'heading',
        props: { level: 2 },
        content: [{ type: 'text', text: 'Title', styles: {} }],
        children: [],
      },
      {
        type: 'paragraph',
        props: {},
        content: [
          { type: 'text', text: 'bold', styles: { bold: true } },
          { type: 'text', text: ' and ', styles: {} },
          { type: 'text', text: 'code', styles: { code: true } },
        ],
        children: [],
      },
    ]);

    expect(preview.html).toBe(
      '<h2>Title</h2><p><strong>bold</strong> and <code>code</code></p>'
    );
    expect(preview.blocks).toBe(2);
    expect(preview.excerpt).toBe('Title bold and code');
  });

  it('clamps heading levels into the 1-6 range', () => {
    const high = buildBlockNotePreview([
      { type: 'heading', props: { level: 9 }, content: [], children: [] },
    ]);
    expect(high.html).toBe('<h6></h6>');
    const low = buildBlockNotePreview([
      { type: 'heading', props: { level: 0 }, content: [], children: [] },
    ]);
    expect(low.html).toBe('<h1></h1>');
  });

  it('groups consecutive list items and renders checklist state', () => {
    const preview = buildBlockNotePreview([
      {
        type: 'bulletListItem',
        props: {},
        content: [{ type: 'text', text: 'one', styles: {} }],
        children: [],
      },
      {
        type: 'bulletListItem',
        props: {},
        content: [{ type: 'text', text: 'two', styles: {} }],
        children: [],
      },
      {
        type: 'numberedListItem',
        props: {},
        content: [{ type: 'text', text: 'first', styles: {} }],
        children: [],
      },
      {
        type: 'checkListItem',
        props: { checked: true },
        content: [{ type: 'text', text: 'done', styles: {} }],
        children: [],
      },
    ]);

    expect(preview.html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(preview.html).toContain('<ol><li>first</li></ol>');
    expect(preview.html).toContain(
      '<ul><li><span aria-hidden="true" class="note-checkbox note-checkbox-checked">✓</span> done</li></ul>'
    );
  });

  it('renders safe links and drops dangerous protocols', () => {
    const safe = buildBlockNotePreview([
      {
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'link',
            href: 'https://example.com',
            content: [{ type: 'text', text: 'site', styles: {} }],
          },
        ],
        children: [],
      },
    ]);
    expect(safe.html).toBe('<p><a href="https://example.com">site</a></p>');

    const danger = buildBlockNotePreview([
      {
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'link',
            // Build the unsafe protocol dynamically so the literal does not
            // trip lint rules; the serializer must still strip it.
            href: `${'java'}script:alert(1)`,
            content: [{ type: 'text', text: 'click', styles: {} }],
          },
        ],
        children: [],
      },
    ]);
    expect(danger.html).toBe('<p>click</p>');
  });

  it('escapes HTML in text and link hrefs', () => {
    const preview = buildBlockNotePreview([
      paragraph('<script>alert("x")</script>'),
    ]);
    expect(preview.html).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>'
    );
    expect(preview.html).not.toContain('<script>');
  });

  it('emits stable placeholders for media and unknown blocks', () => {
    const preview = buildBlockNotePreview([
      {
        type: 'image',
        props: { name: 'diagram.png' },
        content: undefined,
        children: [],
      },
      { type: 'video', props: {}, content: undefined, children: [] },
      { type: 'audio', props: {}, content: undefined, children: [] },
      {
        type: 'file',
        props: { name: 'report.pdf' },
        content: undefined,
        children: [],
      },
      { type: 'codeBlock', props: {}, content: [], children: [] },
      { type: 'table', props: {}, content: {}, children: [] },
      { type: 'futuristicBlock', props: {}, content: [], children: [] },
    ]);

    expect(preview.html).toContain(
      '<span class="note-badge">Image: diagram.png</span>'
    );
    expect(preview.html).toContain('<span class="note-badge">Video</span>');
    expect(preview.html).toContain('<span class="note-badge">Audio</span>');
    expect(preview.html).toContain(
      '<span class="note-badge">File: report.pdf</span>'
    );
    expect(preview.html).toContain('<span class="note-badge">Code</span>');
    expect(preview.html).toContain('<span class="note-badge">Table</span>');
    expect(preview.html).toContain(
      '<span class="note-badge">block: futuristicBlock</span>'
    );
  });

  it('caps the number of rendered blocks at 30', () => {
    const blocks = Array.from({ length: 50 }, (_, i) => paragraph(`p${i}`));
    const preview = buildBlockNotePreview(blocks);
    expect(preview.blocks).toBe(30);
    expect(preview.html).toContain('<p>p0</p>');
    expect(preview.html).not.toContain('<p>p49</p>');
  });

  it('truncates long excerpts to ~160 chars with an ellipsis', () => {
    const long = 'word '.repeat(80).trim();
    const preview = buildBlockNotePreview([paragraph(long)]);
    expect(preview.excerpt.endsWith('...')).toBe(true);
    expect(preview.excerpt.length).toBeLessThanOrEqual(160);
  });

  it('applies an optional sanitizer to the rendered HTML', () => {
    const preview = buildBlockNotePreview([paragraph('hi')], {
      sanitizeHtml: (html) => html.replaceAll('<p>', '<p data-clean="1">'),
    });
    expect(preview.html).toBe('<p data-clean="1">hi</p>');
  });
});
