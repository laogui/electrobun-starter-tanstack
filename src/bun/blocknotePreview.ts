import {
  type BuildPreviewOptions,
  PREVIEW_VERSION,
  type PreviewArtifacts,
} from '../shared/markdown/preview';

/**
 * Derive a card preview (HTML + excerpt + block count) directly from BlockNote
 * document blocks instead of the lossy Markdown mirror. This keeps card
 * previews faithful to the structured editor model (nested blocks, checklist
 * state, media placeholders) and is the source of truth for `previewHtml`
 * once Markdown stops being written (ADR 0002).
 *
 * The walker only emits a controlled, safe subset of HTML. Every user string
 * is escaped, links are protocol-whitelisted, and unknown / media blocks fall
 * back to stable placeholder badges. Callers may pass `sanitizeHtml` for a
 * second defensive pass (mirrors `buildPreview`).
 */

const MAX_PREVIEW_BLOCKS = 30;
const MAX_DEPTH = 4;
const EXCERPT_LIMIT = 160;
const SAFE_LINK_PROTOCOL_RE = /^(?:https?:|mailto:)/i;
const SAFE_IMAGE_PROTOCOL_RE = /^https?:\/\//i;
const URI_PROTOCOL_RE = /^[a-z][a-z\d+.-]*:/i;
const QUERY_OR_HASH_RE = /[?#]/;
const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string): string =>
  value.replaceAll(HTML_ESCAPE_RE, (char) => HTML_ESCAPES[char] ?? char);

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

const badge = (label: string): string =>
  `<span class="note-badge">${escapeHtml(label)}</span>`;

const LIST_TYPES = new Set([
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
]);

interface Budget {
  count: number;
  hiddenImageCount: number;
  renderedImage: boolean;
}

// ---------------------------------------------------------------------------
// Inline content
// ---------------------------------------------------------------------------

function applyInlineStyles(text: string, styles: unknown): string {
  const record = asRecord(styles);
  if (!record) {
    return text;
  }
  let out = text;
  // `underline` has no allowed tag in the preview sanitizer, so it renders
  // as plain text — acceptable for a summary view.
  if (record.code) {
    out = `<code>${out}</code>`;
  }
  if (record.bold) {
    out = `<strong>${out}</strong>`;
  }
  if (record.italic) {
    out = `<em>${out}</em>`;
  }
  if (record.strike) {
    out = `<s>${out}</s>`;
  }
  return out;
}

function renderInline(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  let html = '';
  for (const node of content) {
    const record = asRecord(node);
    if (!record) {
      continue;
    }
    if (record.type === 'text') {
      html += applyInlineStyles(
        escapeHtml(asString(record.text)),
        record.styles
      );
    } else if (record.type === 'link') {
      const inner = renderInline(record.content);
      const href = asString(record.href);
      html +=
        href && SAFE_LINK_PROTOCOL_RE.test(href)
          ? `<a href="${escapeHtml(href)}">${inner || escapeHtml(href)}</a>`
          : inner;
    } else {
      // Mentions / custom inline → plain text fallback.
      const props = asRecord(record.props);
      html += escapeHtml(asString(record.text) || asString(props?.text));
    }
  }
  return html;
}

function inlineText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  let text = '';
  for (const node of content) {
    const record = asRecord(node);
    if (!record) {
      continue;
    }
    if (record.type === 'link') {
      text += inlineText(record.content);
    } else {
      const props = asRecord(record.props);
      text += asString(record.text) || asString(props?.text);
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

const MEDIA_LABELS: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  file: 'File',
};

function renderMediaPlaceholder(
  type: string,
  props: Record<string, unknown> | null
): string {
  const base = MEDIA_LABELS[type] ?? 'Attachment';
  const name = asString(props?.name) || asString(props?.caption);
  return `<p>${badge(name ? `${base}: ${name}` : base)}</p>`;
}

function isWorkspaceAttachmentUrl(value: string): boolean {
  const [path = ''] = value
    .trim()
    .replaceAll('\\', '/')
    .split(QUERY_OR_HASH_RE, 1);
  if (!path || URI_PROTOCOL_RE.test(path) || path.startsWith('//')) {
    return false;
  }
  const segments = path.split('/').filter(Boolean);
  const attachmentIndex = segments.indexOf('attachments');
  if (attachmentIndex < 0) {
    return false;
  }
  const prefix = segments.slice(0, attachmentIndex);
  if (!prefix.every((segment) => segment === '.' || segment === '..')) {
    return false;
  }
  const attachmentSegments = segments.slice(attachmentIndex);
  return (
    attachmentSegments.length > 1 &&
    attachmentSegments.every((segment) => segment !== '.' && segment !== '..')
  );
}

function isSafePreviewImageUrl(value: string): boolean {
  const url = value.trim();
  return SAFE_IMAGE_PROTOCOL_RE.test(url) || isWorkspaceAttachmentUrl(url);
}

function renderImagePreview(
  props: Record<string, unknown> | null,
  budget: Budget
): string {
  if (budget.renderedImage) {
    budget.hiddenImageCount += 1;
    return '';
  }

  const url = asString(props?.url);
  if (!(url && isSafePreviewImageUrl(url))) {
    return renderMediaPlaceholder('image', props);
  }

  budget.renderedImage = true;
  const label = asString(props?.caption) || asString(props?.name);
  return `<p><img loading="lazy" src="${escapeHtml(url.trim())}" alt="${escapeHtml(label)}"></p>`;
}

function renderListItem(
  block: Record<string, unknown>,
  type: string,
  depth: number,
  budget: Budget
): string {
  const inner = renderInline(block.content);
  let prefix = '';
  if (type === 'checkListItem') {
    const props = asRecord(block.props);
    const checked = Boolean(props?.checked);
    prefix = checked
      ? '<span aria-hidden="true" class="note-checkbox note-checkbox-checked">✓</span> '
      : '<span aria-hidden="true" class="note-checkbox"></span> ';
  }
  const children = renderBlocks(block.children, depth + 1, budget);
  return `<li>${prefix}${inner}${children}</li>`;
}

function renderBlock(
  block: Record<string, unknown>,
  type: string,
  _depth: number,
  budget: Budget
): string {
  const props = asRecord(block.props);
  switch (type) {
    case 'paragraph': {
      const inner = renderInline(block.content);
      return inner ? `<p>${inner}</p>` : '<p></p>';
    }
    case 'heading': {
      const rawLevel = Number(props?.level);
      const level = Number.isFinite(rawLevel)
        ? Math.min(6, Math.max(1, Math.trunc(rawLevel)))
        : 1;
      return `<h${level}>${renderInline(block.content)}</h${level}>`;
    }
    case 'quote':
      return `<blockquote>${renderInline(block.content)}</blockquote>`;
    case 'codeBlock':
      return badge('Code');
    case 'table':
      return badge('Table');
    case 'image':
      return renderImagePreview(props, budget);
    case 'video':
    case 'audio':
    case 'file':
      return renderMediaPlaceholder(type, props);
    default:
      return `<p>${badge(`block: ${type || 'unknown'}`)}</p>`;
  }
}

function renderBlocks(blocks: unknown, depth: number, budget: Budget): string {
  if (!Array.isArray(blocks) || depth > MAX_DEPTH) {
    return '';
  }
  let html = '';
  let index = 0;
  while (index < blocks.length) {
    if (budget.count >= MAX_PREVIEW_BLOCKS) {
      break;
    }
    const type = blockType(blocks[index]);
    if (LIST_TYPES.has(type)) {
      const tag = type === 'numberedListItem' ? 'ol' : 'ul';
      let items = '';
      while (index < blocks.length && budget.count < MAX_PREVIEW_BLOCKS) {
        const itemType = blockType(blocks[index]);
        const sameFamily =
          tag === 'ol'
            ? itemType === 'numberedListItem'
            : itemType === 'bulletListItem' || itemType === 'checkListItem';
        if (!sameFamily) {
          break;
        }
        const record = asRecord(blocks[index]);
        if (record) {
          budget.count += 1;
          items += renderListItem(record, itemType, depth, budget);
        }
        index += 1;
      }
      html += `<${tag}>${items}</${tag}>`;
      continue;
    }
    const record = asRecord(blocks[index]);
    if (record) {
      budget.count += 1;
      html += renderBlock(record, type, depth, budget);
    }
    index += 1;
  }
  return html;
}

// ---------------------------------------------------------------------------
// Excerpt
// ---------------------------------------------------------------------------

function collectText(blocks: unknown, depth: number, out: string[]): void {
  if (!Array.isArray(blocks) || depth > MAX_DEPTH) {
    return;
  }
  for (const block of blocks) {
    if (out.join(' ').length > EXCERPT_LIMIT * 2) {
      return;
    }
    const record = asRecord(block);
    if (!record) {
      continue;
    }
    const text = inlineText(record.content);
    if (text.trim()) {
      out.push(text.trim());
    }
    collectText(record.children, depth + 1, out);
  }
}

function buildExcerpt(blocks: unknown): string {
  const parts: string[] = [];
  collectText(blocks, 0, parts);
  const text = parts.join(' ').replaceAll(/\s+/g, ' ').trim();
  if (text.length <= EXCERPT_LIMIT) {
    return text;
  }
  return `${text.slice(0, EXCERPT_LIMIT - 3).trimEnd()}...`;
}

/**
 * Flatten BlockNote blocks to a single plain-text string (no length cap). Used
 * by full-text search so sidecar notes remain searchable without a Markdown
 * mirror.
 */
export function blocksToPlainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) {
    return '';
  }
  const out: string[] = [];
  const walk = (nodes: unknown, depth: number): void => {
    if (!Array.isArray(nodes) || depth > MAX_DEPTH) {
      return;
    }
    for (const block of nodes) {
      const record = asRecord(block);
      if (!record) {
        continue;
      }
      const text = inlineText(record.content);
      if (text.trim()) {
        out.push(text.trim());
      }
      const props = asRecord(record.props);
      const caption = asString(props?.caption) || asString(props?.name);
      if (caption.trim()) {
        out.push(caption.trim());
      }
      walk(record.children, depth + 1);
    }
  };
  walk(blocks, 0);
  return out.join(' ').replaceAll(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build a card preview from BlockNote document blocks. */
export const buildBlockNotePreview = (
  blocks: unknown,
  options: BuildPreviewOptions = {}
): PreviewArtifacts => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { html: '', excerpt: '', blocks: 0, version: PREVIEW_VERSION };
  }
  const budget: Budget = {
    count: 0,
    hiddenImageCount: 0,
    renderedImage: false,
  };
  const bodyHtml = renderBlocks(blocks, 0, budget);
  const dirtyHtml =
    budget.hiddenImageCount > 0
      ? `${bodyHtml}<p>${badge(`+${budget.hiddenImageCount} images`)}</p>`
      : bodyHtml;
  const html = options.sanitizeHtml?.(dirtyHtml) ?? dirtyHtml;
  return {
    html,
    excerpt: buildExcerpt(blocks),
    blocks: budget.count,
    version: PREVIEW_VERSION,
  };
};
