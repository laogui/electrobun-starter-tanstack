import { describe, expect, it } from 'vitest';

import { blocksToMarkdown } from './blocknoteMarkdown';

// ---------------------------------------------------------------------------
// Block / inline fixture builders (mirror the BlockNote document shape)
// ---------------------------------------------------------------------------

type Styles = Record<string, boolean>;

const text = (value: string, styles: Styles = {}) => ({
  type: 'text',
  text: value,
  styles,
});

const link = (href: string, ...content: unknown[]) => ({
  type: 'link',
  href,
  content,
});

const paragraph = (...content: unknown[]) => ({
  type: 'paragraph',
  props: {},
  content,
  children: [],
});

const heading = (level: number, ...content: unknown[]) => ({
  type: 'heading',
  props: { level },
  content,
  children: [],
});

const bullet = (value: string, children: unknown[] = []) => ({
  type: 'bulletListItem',
  props: {},
  content: [text(value)],
  children,
});

const numbered = (value: string, children: unknown[] = []) => ({
  type: 'numberedListItem',
  props: {},
  content: [text(value)],
  children,
});

const check = (value: string, checked: boolean, children: unknown[] = []) => ({
  type: 'checkListItem',
  props: { checked },
  content: [text(value)],
  children,
});

const quote = (value: string) => ({
  type: 'quote',
  props: {},
  content: [text(value)],
  children: [],
});

const codeBlock = (code: string, language?: string) => ({
  type: 'codeBlock',
  props: language === undefined ? {} : { language },
  content: [text(code)],
  children: [],
});

const table = (rows: string[][]) => ({
  type: 'table',
  props: {},
  content: {
    type: 'tableContent',
    columnWidths: [],
    rows: rows.map((cells) => ({
      cells: cells.map((cell) => [text(cell)]),
    })),
  },
  children: [],
});

const media = (type: string, props: Record<string, unknown>) => ({
  type,
  props,
  content: undefined,
  children: [],
});

describe('blocksToMarkdown', () => {
  it('returns an empty string for empty / non-array input', () => {
    expect(blocksToMarkdown([])).toBe('');
    expect(blocksToMarkdown(undefined)).toBe('');
    expect(blocksToMarkdown(null)).toBe('');
    expect(blocksToMarkdown({})).toBe('');
    expect(blocksToMarkdown('not blocks')).toBe('');
  });

  it('renders a single paragraph without trailing whitespace', () => {
    const md = blocksToMarkdown([paragraph(text('Hello world'))]);
    expect(md).toBe('Hello world');
    expect(md.endsWith('\n')).toBe(false);
  });

  it('separates top-level blocks with a single blank line', () => {
    const md = blocksToMarkdown([
      paragraph(text('First')),
      paragraph(text('Second')),
    ]);
    expect(md).toBe('First\n\nSecond');
  });

  it('drops empty paragraphs so no extra blank lines appear', () => {
    expect(blocksToMarkdown([paragraph(), paragraph(text('only'))])).toBe(
      'only'
    );
  });

  it('renders headings and clamps the level into 1-6', () => {
    expect(blocksToMarkdown([heading(1, text('One'))])).toBe('# One');
    expect(blocksToMarkdown([heading(3, text('Three'))])).toBe('### Three');
    expect(blocksToMarkdown([heading(9, text('Deep'))])).toBe('###### Deep');
    expect(blocksToMarkdown([heading(0, text('Shallow'))])).toBe('# Shallow');
    expect(
      blocksToMarkdown([
        {
          type: 'heading',
          props: {},
          content: [text('NoLevel')],
          children: [],
        },
      ])
    ).toBe('# NoLevel');
  });

  it('applies inline styles', () => {
    expect(blocksToMarkdown([paragraph(text('bold', { bold: true }))])).toBe(
      '**bold**'
    );
    expect(
      blocksToMarkdown([paragraph(text('italic', { italic: true }))])
    ).toBe('*italic*');
    expect(blocksToMarkdown([paragraph(text('inline', { code: true }))])).toBe(
      '`inline`'
    );
    expect(blocksToMarkdown([paragraph(text('gone', { strike: true }))])).toBe(
      '~~gone~~'
    );
    // Underline has no GFM equivalent and renders as plain text.
    expect(
      blocksToMarkdown([paragraph(text('plain', { underline: true }))])
    ).toBe('plain');
    // Combined styles nest (italic inside bold).
    expect(
      blocksToMarkdown([paragraph(text('both', { bold: true, italic: true }))])
    ).toBe('***both***');
    // Code combined with bold keeps the backticks verbatim.
    expect(
      blocksToMarkdown([paragraph(text('x', { code: true, bold: true }))])
    ).toBe('**`x`**');
  });

  it('renders mixed inline runs in order', () => {
    expect(
      blocksToMarkdown([
        paragraph(text('A '), text('B', { bold: true }), text(' C')),
      ])
    ).toBe('A **B** C');
  });

  it('renders links and falls back to the href when there is no label', () => {
    expect(
      blocksToMarkdown([
        paragraph(link('https://example.com', text('Example'))),
      ])
    ).toBe('[Example](https://example.com)');
    expect(
      blocksToMarkdown([
        paragraph(
          text('See '),
          link('https://x.dev', text('docs')),
          text(' now')
        ),
      ])
    ).toBe('See [docs](https://x.dev) now');
    expect(blocksToMarkdown([paragraph(link('https://only.url'))])).toBe(
      '[https://only.url](https://only.url)'
    );
  });

  it('escapes Markdown-special characters in plain text', () => {
    expect(blocksToMarkdown([paragraph(text('[x]'))])).toBe('\\[x\\]');
    expect(blocksToMarkdown([paragraph(text('a*b'))])).toBe('a\\*b');
    expect(blocksToMarkdown([paragraph(text('c\\d'))])).toBe('c\\\\d');
    expect(blocksToMarkdown([paragraph(text('`raw`'))])).toBe('\\`raw\\`');
  });

  it('renders bullet lists', () => {
    expect(
      blocksToMarkdown([bullet('one'), bullet('two'), bullet('three')])
    ).toBe('- one\n- two\n- three');
  });

  it('renders numbered lists with a 1. prefix', () => {
    expect(blocksToMarkdown([numbered('first'), numbered('second')])).toBe(
      '1. first\n1. second'
    );
  });

  it('renders checklist state', () => {
    expect(blocksToMarkdown([check('done', true), check('todo', false)])).toBe(
      '- [x] done\n- [ ] todo'
    );
  });

  it('indents nested children by two spaces per depth level', () => {
    expect(
      blocksToMarkdown([
        bullet('Parent', [bullet('Child', [bullet('Grandchild')])]),
        bullet('Sibling'),
      ])
    ).toBe('- Parent\n  - Child\n    - Grandchild\n- Sibling');
  });

  it('handles mixed nested list types', () => {
    expect(
      blocksToMarkdown([
        numbered('Step', [bullet('detail'), check('verify', true)]),
      ])
    ).toBe('1. Step\n  - detail\n  - [x] verify');
  });

  it('renders fenced code blocks with an optional language and raw content', () => {
    expect(blocksToMarkdown([codeBlock('const x = 1;', 'typescript')])).toBe(
      '```typescript\nconst x = 1;\n```'
    );
    expect(blocksToMarkdown([codeBlock('plain text here')])).toBe(
      '```\nplain text here\n```'
    );
    expect(blocksToMarkdown([codeBlock('line1\nline2', 'js')])).toBe(
      '```js\nline1\nline2\n```'
    );
    // Content inside a code fence is never escaped.
    expect(
      blocksToMarkdown([codeBlock('arr = [1]; y = a*b; `tick`', 'python')])
    ).toBe('```python\narr = [1]; y = a*b; `tick`\n```');
  });

  it('widens the code fence when the content contains backtick runs', () => {
    expect(blocksToMarkdown([codeBlock('```\nnested\n```', 'md')])).toBe(
      '````md\n```\nnested\n```\n````'
    );
  });

  it('renders quotes with a > prefix', () => {
    expect(blocksToMarkdown([quote('To be, or not to be')])).toBe(
      '> To be, or not to be'
    );
  });

  it('renders a GFM table with a header, separator, and body rows', () => {
    expect(
      blocksToMarkdown([
        table([
          ['Name', 'Role'],
          ['Ada', 'Engineer'],
          ['Alan', 'Mathematician'],
        ]),
      ])
    ).toBe(
      '| Name | Role |\n| --- | --- |\n| Ada | Engineer |\n| Alan | Mathematician |'
    );
  });

  it('renders a header-only table when there is a single row', () => {
    expect(blocksToMarkdown([table([['A', 'B']])])).toBe(
      '| A | B |\n| --- | --- |'
    );
  });

  it('pads ragged rows and escapes pipes inside cells', () => {
    expect(blocksToMarkdown([table([['x', 'y'], ['solo']])])).toBe(
      '| x | y |\n| --- | --- |\n| solo |  |'
    );
    expect(blocksToMarkdown([table([['a | b', 'c']])])).toBe(
      '| a \\| b | c |\n| --- | --- |'
    );
  });

  it('reads table cells expressed as tableCell objects', () => {
    const tableBlock = {
      type: 'table',
      props: {},
      content: {
        type: 'tableContent',
        rows: [
          {
            cells: [
              { type: 'tableCell', props: {}, content: [text('H1')] },
              { type: 'tableCell', props: {}, content: [text('H2')] },
            ],
          },
        ],
      },
      children: [],
    };
    expect(blocksToMarkdown([tableBlock])).toBe('| H1 | H2 |\n| --- | --- |');
  });

  it('skips an unparseable table without throwing', () => {
    expect(
      blocksToMarkdown([
        { type: 'table', props: {}, content: {}, children: [] },
        paragraph(text('after')),
      ])
    ).toBe('after');
  });

  it('renders images with a caption or name label', () => {
    expect(
      blocksToMarkdown([
        media('image', {
          url: 'attachments/diagram.png',
          caption: 'System diagram',
        }),
      ])
    ).toBe('![System diagram](attachments/diagram.png)');
    expect(
      blocksToMarkdown([media('image', { url: 'a/b.png', name: 'b.png' })])
    ).toBe('![b.png](a/b.png)');
    expect(blocksToMarkdown([media('image', { url: 'x.png' })])).toBe(
      '![](x.png)'
    );
  });

  it('applies resolveAttachmentUrl to image urls when provided', () => {
    expect(
      blocksToMarkdown(
        [
          media('image', {
            url: 'attachments/diagram.png',
            caption: 'System diagram',
          }),
        ],
        { resolveAttachmentUrl: (path: string) => `https://cdn.test/${path}` }
      )
    ).toBe('![System diagram](https://cdn.test/attachments/diagram.png)');
  });

  it('renders video / audio / file blocks as links', () => {
    expect(
      blocksToMarkdown([
        media('file', { url: 'attachments/report.pdf', name: 'report.pdf' }),
      ])
    ).toBe('[report.pdf](attachments/report.pdf)');
    expect(
      blocksToMarkdown([media('video', { url: 'v.mp4', caption: 'Demo clip' })])
    ).toBe('[Demo clip](v.mp4)');
    // Fall back to a human label when there is no name / caption.
    expect(blocksToMarkdown([media('audio', { url: 'a.mp3' })])).toBe(
      '[Audio](a.mp3)'
    );
    expect(blocksToMarkdown([media('file', { url: 'f.bin' })])).toBe(
      '[File](f.bin)'
    );
  });

  it('applies resolveAttachmentUrl to file urls when provided', () => {
    expect(
      blocksToMarkdown(
        [media('file', { url: 'attachments/report.pdf', name: 'report.pdf' })],
        { resolveAttachmentUrl: (path: string) => `file:///ws/${path}` }
      )
    ).toBe('[report.pdf](file:///ws/attachments/report.pdf)');
  });

  it('falls back to the inline text of unknown blocks, or skips them', () => {
    expect(
      blocksToMarkdown([
        {
          type: 'mysteryBlock',
          props: {},
          content: [text('fallback content')],
          children: [],
        },
      ])
    ).toBe('fallback content');
    expect(
      blocksToMarkdown([
        { type: 'mysteryBlock', props: {}, content: [], children: [] },
        paragraph(text('next')),
      ])
    ).toBe('next');
  });

  it('never throws on malformed input', () => {
    expect(() =>
      blocksToMarkdown([null, 42, 'str', {}, { type: 123 }, []])
    ).not.toThrow();
    expect(blocksToMarkdown([null, 42, 'str', {}])).toBe('');
  });

  it('serializes a representative mixed document', () => {
    expect(
      blocksToMarkdown([
        heading(1, text('Title')),
        paragraph(text('Intro paragraph.')),
        bullet('item a'),
        bullet('item b'),
        codeBlock('print("hi")', 'python'),
        quote('A wise quote'),
      ])
    ).toBe(
      '# Title\n\nIntro paragraph.\n\n- item a\n- item b\n\n```python\nprint("hi")\n```\n\n> A wise quote'
    );
  });
});
