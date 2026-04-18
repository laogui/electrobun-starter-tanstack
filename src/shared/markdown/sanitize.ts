import type { Config } from 'dompurify';

export const markdownAllowedTags = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const;

export const markdownAllowedAttributes = [
  'alt',
  'aria-hidden',
  'class',
  'href',
  'loading',
  'rel',
  'src',
  'title',
] as const;

export const markdownSanitizeConfig = {
  ALLOWED_TAGS: [...markdownAllowedTags],
  ALLOWED_ATTR: [...markdownAllowedAttributes],
} satisfies Config;
