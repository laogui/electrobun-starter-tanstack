import type Token from 'markdown-it/lib/token.mjs';

import { markdownIt, renderMarkdownToHtml } from './render';

const MAX_PREVIEW_BLOCKS = 30;
export const PREVIEW_VERSION = 1;

const HTML_TAG_RE = /<[^>]*>/g;
const WHITESPACE_RE = /\s+/g;
const PRE_RE = /<pre><code\b[^>]*>[\s\S]*?<\/code><\/pre>/gi;
const TABLE_RE = /<table\b[\s\S]*?<\/table>/gi;
const IMAGE_RE = /<img\b[^>]*>/gi;
const INPUT_RE = /<input\b[^>]*>/gi;
const CHECKBOX_TYPE_RE = /\btype=(?:"checkbox"|'checkbox'|checkbox)/i;
const CHECKED_ATTR_RE = /\bchecked\b/i;
const LOADING_ATTR_RE = /\bloading=/i;
const IMG_OPEN_RE = /^<img\b/i;

export interface PreviewArtifacts {
  blocks: number;
  excerpt: string;
  html: string;
  version: number;
}

export interface BuildPreviewOptions {
  sanitizeHtml?: (dirtyHtml: string) => string;
}

const isTopLevelBlock = (token: Token): boolean => {
  if (token.level !== 0) {
    return false;
  }
  return token.nesting === 1 || token.type === 'fence' || token.type === 'hr';
};

const collectPreviewTokens = (
  source: string
): { blocks: number; tokens: Token[] } => {
  const tokens = markdownIt.parse(source, {});
  let blocks = 0;
  let endIndex = tokens.length;

  for (const [index, token] of tokens.entries()) {
    if (!isTopLevelBlock(token)) {
      continue;
    }
    blocks += 1;
    if (blocks > MAX_PREVIEW_BLOCKS) {
      endIndex = index;
      break;
    }
  }

  return {
    blocks: Math.min(blocks, MAX_PREVIEW_BLOCKS),
    tokens: tokens.slice(0, endIndex),
  };
};

const textFromHtml = (html: string): string =>
  html
    .replaceAll(HTML_TAG_RE, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll(WHITESPACE_RE, ' ')
    .trim();

const createExcerpt = (source: string): string => {
  const text = textFromHtml(renderMarkdownToHtml(source));
  if (text.length <= 160) {
    return text;
  }
  return `${text.slice(0, 157).trimEnd()}...`;
};

const badge = (label: string): string =>
  `<span class="note-badge">${label}</span>`;

const canonicalizeCheckboxes = (html: string): string =>
  html.replaceAll(INPUT_RE, (input) => {
    if (!CHECKBOX_TYPE_RE.test(input)) {
      return '';
    }
    const checked = CHECKED_ATTR_RE.test(input);
    return checked
      ? '<span aria-hidden="true" class="note-checkbox note-checkbox-checked">✓</span>'
      : '<span aria-hidden="true" class="note-checkbox"></span>';
  });

const keepFirstImage = (html: string): string => {
  let imageCount = 0;
  const htmlWithSingleImage = html.replaceAll(IMAGE_RE, (input) => {
    imageCount += 1;
    if (imageCount > 1) {
      return '';
    }
    if (LOADING_ATTR_RE.test(input)) {
      return input;
    }
    return input.replace(IMG_OPEN_RE, '<img loading="lazy"');
  });

  if (imageCount <= 1) {
    return htmlWithSingleImage;
  }
  return `${htmlWithSingleImage}<p>${badge(`+${imageCount - 1} images`)}</p>`;
};

const normalizePreviewHtml = (html: string): string =>
  keepFirstImage(
    canonicalizeCheckboxes(
      html
        .replaceAll(PRE_RE, badge('Code'))
        .replaceAll(TABLE_RE, badge('Table'))
    )
  );

export const buildPreview = (
  source: string,
  options: BuildPreviewOptions = {}
): PreviewArtifacts => {
  const body = source.trim();
  if (!body) {
    return { html: '', excerpt: '', blocks: 0, version: PREVIEW_VERSION };
  }

  const { blocks, tokens } = collectPreviewTokens(body);
  const dirtyHtml = normalizePreviewHtml(
    markdownIt.renderer.render(tokens, markdownIt.options, {})
  );
  const html = options.sanitizeHtml?.(dirtyHtml) ?? dirtyHtml;

  return {
    html,
    excerpt: createExcerpt(body),
    blocks,
    version: PREVIEW_VERSION,
  };
};
