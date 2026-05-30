/**
 * Convert BlockNote document blocks into GitHub-Flavored Markdown (GFM).
 *
 * This is the Bun-side serializer powering the Markdown *export* feature. It is
 * intentionally a **pure** function: no file IO, no Electrobun imports, and no
 * mutation of its inputs. Every block / inline shape is parsed defensively
 * (mirroring `blocknotePreview.ts`) so malformed or partial documents never
 * throw — unknown shapes degrade to their inline text or are skipped entirely.
 *
 * Output rules (see the feature spec):
 *   - paragraph            → inline text, blank line between top-level blocks
 *   - heading (level 1-6)  → `#`*level + space + inline
 *   - bulletListItem       → `- ` + inline
 *   - numberedListItem     → `1. ` + inline (renderers renumber automatically)
 *   - checkListItem        → `- [ ] ` / `- [x] ` per `props.checked`
 *   - nested children      → indented by two spaces per depth level
 *   - codeBlock            → fenced ``` with optional `props.language` (raw text)
 *   - quote                → `> ` prefixed lines
 *   - table                → GFM pipe table (header / `---` / body)
 *   - image                → `![caption](url)`
 *   - video/audio/file     → `[name or label](url)`
 *   - unknown block        → its inline text, else skipped
 */

export interface BlocksToMarkdownOptions {
  /**
   * Map a stored attachment path (e.g. `attachments/img.png`) onto a URL that
   * is meaningful inside the exported Markdown. When omitted, `props.url` is
   * passed through unchanged.
   */
  resolveAttachmentUrl?: (path: string) => string;
}

const INDENT = '  ';
const MAX_DEPTH = 12;

const LIST_TYPES = new Set([
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
]);

const MEDIA_LABELS: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  file: 'File',
};

// Markdown-significant characters we escape in plain text so literal
// punctuation never accidentally produces links, code spans, or emphasis.
// Backticks inside `code` styled runs are handled separately (left verbatim).
const TEXT_ESCAPE_RE = /[\\`*[\]]/g;

// ---------------------------------------------------------------------------
// Defensive shape helpers (mirror blocknotePreview.ts)
// ---------------------------------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const blockType = (block: unknown): string => {
  const record = asRecord(block);
  return record ? asString(record.type) : '';
};

const escapeText = (value: string): string =>
  value.replaceAll(TEXT_ESCAPE_RE, (char) => `\\${char}`);

const indentLines = (text: string, indent: string): string =>
  text
    .split('\n')
    .map((line) => (line ? `${indent}${line}` : line))
    .join('\n');

function longestBacktickRun(value: string): number {
  const runs = value.match(/`+/g);
  if (!runs) {
    return 0;
  }
  let longest = 0;
  for (const run of runs) {
    longest = Math.max(longest, run.length);
  }
  return longest;
}

function resolveUrl(rawUrl: string, options: BlocksToMarkdownOptions): string {
  if (!rawUrl) {
    return rawUrl;
  }
  return options.resolveAttachmentUrl
    ? options.resolveAttachmentUrl(rawUrl)
    : rawUrl;
}

// ---------------------------------------------------------------------------
// Inline content
// ---------------------------------------------------------------------------

function renderInlineCode(text: string): string {
  const longest = longestBacktickRun(text);
  if (longest === 0) {
    return `\`${text}\``;
  }
  // Pad with spaces and use a fence longer than the longest backtick run so
  // the literal backticks survive (CommonMark inline-code rule).
  const fence = '`'.repeat(longest + 1);
  return `${fence} ${text} ${fence}`;
}

function applyInlineStyles(rawText: string, styles: unknown): string {
  const record = asRecord(styles);
  // Code spans are emitted verbatim; all other text escapes Markdown-special
  // characters so literal punctuation round-trips safely.
  let out = record?.code ? renderInlineCode(rawText) : escapeText(rawText);
  if (!record) {
    return out;
  }
  if (record.strike) {
    out = `~~${out}~~`;
  }
  if (record.italic) {
    out = `*${out}*`;
  }
  if (record.bold) {
    out = `**${out}**`;
  }
  // `underline` has no GFM equivalent, so it renders as plain text (matches
  // the preview serializer).
  return out;
}

function renderLink(record: Record<string, unknown>): string {
  const inner = renderInline(record.content);
  const href = asString(record.href);
  if (!href) {
    return inner;
  }
  const label = inner || escapeText(href);
  return `[${label}](${href})`;
}

function renderInline(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  let out = '';
  for (const node of content) {
    const record = asRecord(node);
    if (!record) {
      continue;
    }
    if (record.type === 'text') {
      out += applyInlineStyles(asString(record.text), record.styles);
    } else if (record.type === 'link') {
      out += renderLink(record);
    } else {
      // Mentions / custom inline → plain text fallback.
      const props = asRecord(record.props);
      out += escapeText(asString(record.text) || asString(props?.text));
    }
  }
  return out;
}

/** Concatenate inline text *without* escaping — used for raw code content. */
function rawInlineText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  let out = '';
  for (const node of content) {
    const record = asRecord(node);
    if (!record) {
      continue;
    }
    if (record.type === 'link') {
      out += rawInlineText(record.content);
    } else {
      const props = asRecord(record.props);
      out += asString(record.text) || asString(props?.text);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function renderHeading(
  record: Record<string, unknown>,
  props: Record<string, unknown> | null
): string {
  const rawLevel = Number(props?.level);
  const level = Number.isFinite(rawLevel)
    ? Math.min(6, Math.max(1, Math.trunc(rawLevel)))
    : 1;
  const inner = renderInline(record.content);
  const hashes = '#'.repeat(level);
  return inner ? `${hashes} ${inner}` : hashes;
}

function renderQuote(content: unknown): string {
  const inner = renderInline(content);
  if (!inner) {
    return '';
  }
  return inner
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

function renderCodeBlock(
  record: Record<string, unknown>,
  props: Record<string, unknown> | null
): string {
  const language = asString(props?.language);
  const code = rawInlineText(record.content);
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(code) + 1));
  const header = language ? `${fence}${language}` : fence;
  return `${header}\n${code}\n${fence}`;
}

function renderImage(
  props: Record<string, unknown> | null,
  options: BlocksToMarkdownOptions
): string {
  const url = resolveUrl(asString(props?.url), options);
  const label = asString(props?.caption) || asString(props?.name);
  return `![${escapeText(label)}](${url})`;
}

function renderMediaLink(
  type: string,
  props: Record<string, unknown> | null,
  options: BlocksToMarkdownOptions
): string {
  const url = resolveUrl(asString(props?.url), options);
  const label =
    asString(props?.name) ||
    asString(props?.caption) ||
    (MEDIA_LABELS[type] ?? 'File');
  return `[${escapeText(label)}](${url})`;
}

function renderTableCell(cell: unknown): string {
  let inline = '';
  if (Array.isArray(cell)) {
    inline = renderInline(cell);
  } else {
    const record = asRecord(cell);
    if (record) {
      inline = renderInline(record.content);
    }
  }
  // GFM cells cannot contain raw newlines or unescaped pipes.
  return inline.replaceAll('\n', ' ').replaceAll('|', '\\|');
}

function extractTableRows(content: unknown): unknown[] {
  const record = asRecord(content);
  if (record && Array.isArray(record.rows)) {
    return record.rows;
  }
  // Lenient fallback: someone may have stored the rows array directly.
  if (Array.isArray(content)) {
    return content;
  }
  return [];
}

function extractRowCells(row: unknown): string[] {
  if (Array.isArray(row)) {
    return row.map((cell) => renderTableCell(cell));
  }
  const record = asRecord(row);
  if (record && Array.isArray(record.cells)) {
    return record.cells.map((cell) => renderTableCell(cell));
  }
  return [];
}

function formatTableRow(cells: string[], colCount: number): string {
  const padded = cells.slice(0, colCount);
  while (padded.length < colCount) {
    padded.push('');
  }
  return `| ${padded.join(' | ')} |`;
}

function renderTable(content: unknown): string {
  const rows = extractTableRows(content);
  if (rows.length === 0) {
    return '';
  }
  const matrix = rows.map((row) => extractRowCells(row));
  let colCount = 0;
  for (const row of matrix) {
    colCount = Math.max(colCount, row.length);
  }
  if (colCount === 0) {
    return '';
  }
  const header = formatTableRow(matrix[0] ?? [], colCount);
  const separator = formatTableRow(
    Array.from({ length: colCount }, () => '---'),
    colCount
  );
  const body = matrix.slice(1).map((row) => formatTableRow(row, colCount));
  return [header, separator, ...body].join('\n');
}

function listPrefix(record: Record<string, unknown>, type: string): string {
  if (type === 'numberedListItem') {
    return '1. ';
  }
  if (type === 'checkListItem') {
    const props = asRecord(record.props);
    return props?.checked ? '- [x] ' : '- [ ] ';
  }
  return '- ';
}

function renderBlock(
  record: Record<string, unknown>,
  type: string,
  options: BlocksToMarkdownOptions
): string {
  const props = asRecord(record.props);
  switch (type) {
    case 'paragraph':
      return renderInline(record.content);
    case 'heading':
      return renderHeading(record, props);
    case 'quote':
      return renderQuote(record.content);
    case 'codeBlock':
      return renderCodeBlock(record, props);
    case 'table':
      return renderTable(record.content);
    case 'image':
      return renderImage(props, options);
    case 'video':
    case 'audio':
    case 'file':
      return renderMediaLink(type, props, options);
    default:
      // Unknown / custom block → emit its inline text if any, else skip.
      return renderInline(record.content);
  }
}

function renderListItem(
  record: Record<string, unknown>,
  type: string,
  depth: number,
  options: BlocksToMarkdownOptions
): string {
  const indent = INDENT.repeat(depth);
  const inner = renderInline(record.content);
  const prefix = listPrefix(record, type);
  const head = inner
    ? `${indent}${prefix}${inner}`
    : `${indent}${prefix}`.trimEnd();
  const children = renderChildBlocks(record.children, depth + 1, options);
  return children ? `${head}\n${children}` : head;
}

function renderListRun(
  items: unknown[],
  depth: number,
  options: BlocksToMarkdownOptions
): string {
  const lines: string[] = [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    lines.push(renderListItem(record, blockType(record), depth, options));
  }
  return lines.join('\n');
}

/**
 * Render the `children` of a list item. Nested list runs recurse with a deeper
 * indent; non-list children are rendered normally then indented so they stay
 * visually attached to their parent item.
 */
function renderChildBlocks(
  blocks: unknown,
  depth: number,
  options: BlocksToMarkdownOptions
): string {
  if (!Array.isArray(blocks) || blocks.length === 0 || depth > MAX_DEPTH) {
    return '';
  }
  const parts: string[] = [];
  let index = 0;
  while (index < blocks.length) {
    const type = blockType(blocks[index]);
    if (LIST_TYPES.has(type)) {
      const start = index;
      while (
        index < blocks.length &&
        LIST_TYPES.has(blockType(blocks[index]))
      ) {
        index += 1;
      }
      const chunk = renderListRun(blocks.slice(start, index), depth, options);
      if (chunk) {
        parts.push(chunk);
      }
      continue;
    }
    const record = asRecord(blocks[index]);
    index += 1;
    if (!record) {
      continue;
    }
    const chunk = renderBlock(record, type, options);
    if (chunk) {
      parts.push(indentLines(chunk, INDENT.repeat(depth)));
    }
  }
  return parts.join('\n');
}

/** Render the top-level block sequence, joining blocks with a blank line. */
function renderDocument(
  blocks: unknown[],
  options: BlocksToMarkdownOptions
): string {
  const chunks: string[] = [];
  let index = 0;
  while (index < blocks.length) {
    const type = blockType(blocks[index]);
    if (LIST_TYPES.has(type)) {
      const start = index;
      while (
        index < blocks.length &&
        LIST_TYPES.has(blockType(blocks[index]))
      ) {
        index += 1;
      }
      const chunk = renderListRun(blocks.slice(start, index), 0, options);
      if (chunk) {
        chunks.push(chunk);
      }
      continue;
    }
    const record = asRecord(blocks[index]);
    index += 1;
    if (!record) {
      continue;
    }
    const chunk = renderBlock(record, type, options);
    if (chunk) {
      chunks.push(chunk);
    }
  }
  return chunks.join('\n\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialize BlockNote document blocks to GitHub-Flavored Markdown. Returns a
 * trimmed string with single blank lines between top-level blocks. Empty or
 * non-array input yields an empty string. Never throws on malformed input.
 */
export function blocksToMarkdown(
  blocks: unknown,
  options: BlocksToMarkdownOptions = {}
): string {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return '';
  }
  return renderDocument(blocks, options).trim();
}
