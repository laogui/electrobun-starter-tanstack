/**
 * Pure helpers for the GhostBoard plugin documentation routes.
 *
 * Entries come from the `docs` content collection whose ids look like
 * `en/start/first-plugin`. The locale is the first path segment; everything
 * after it is the public slug served under `/docs/<slug>/` (English) and
 * `/zh/docs/<slug>/` (Chinese). Chinese pages that do not exist yet fall back
 * to the English entry so the sidebar never has dead links.
 */

export const DOCS_LOCALES = ['en', 'zh'] as const;
export type DocsLocale = (typeof DOCS_LOCALES)[number];
export const DEFAULT_DOCS_LOCALE: DocsLocale = 'en';

export const DOCS_SECTIONS = [
  'start',
  'guides',
  'reference',
  'distribution',
  'policy',
] as const;
export type DocsSection = (typeof DOCS_SECTIONS)[number];

export const SECTION_TITLES: Record<DocsLocale, Record<DocsSection, string>> = {
  en: {
    distribution: 'Distribution',
    guides: 'Guides',
    policy: 'Policy and limits',
    reference: 'Reference',
    start: 'Start',
  },
  zh: {
    distribution: '分发',
    guides: '指南',
    policy: '策略与限制',
    reference: '参考',
    start: '开始',
  },
};

export interface DocsFrontmatter {
  description?: string;
  order: number;
  section: DocsSection;
  sourceVersion?: string;
  title: string;
}

export interface DocsEntryLike {
  body?: string;
  data: DocsFrontmatter;
  id: string;
}

export interface DocsPage extends DocsFrontmatter {
  id: string;
  locale: DocsLocale;
  slug: string;
}

export interface ResolvedDocsPage {
  /** True when a non-English request was served from the English entry. */
  fallback: boolean;
  page: DocsPage;
}

export interface SidebarItem {
  fallback: boolean;
  slug: string;
  title: string;
}

export interface SidebarSection {
  id: DocsSection;
  items: SidebarItem[];
  title: string;
}

const TRAILING_SLASHES_RE = /\/+$/;
const LEADING_SLASHES_RE = /^\/+/;

export function isDocsLocale(value: string): value is DocsLocale {
  return (DOCS_LOCALES as readonly string[]).includes(value);
}

export function normalizeSlug(value: string | undefined): string {
  return (value ?? '')
    .replace(LEADING_SLASHES_RE, '')
    .replace(TRAILING_SLASHES_RE, '');
}

export function parseDocsId(id: string): { locale: DocsLocale; slug: string } {
  const [locale, ...rest] = id.split('/');
  if (!(locale && isDocsLocale(locale)) || rest.length === 0) {
    throw new Error(`Docs entry id must be <locale>/<slug>, got ${id}`);
  }
  return { locale, slug: rest.join('/') };
}

export function toPages(entries: readonly DocsEntryLike[]): DocsPage[] {
  return entries
    .map((entry) => {
      const { locale, slug } = parseDocsId(entry.id);
      return { ...entry.data, id: entry.id, locale, slug };
    })
    .sort(comparePages);
}

function comparePages(left: DocsPage, right: DocsPage): number {
  const sectionDelta =
    DOCS_SECTIONS.indexOf(left.section) - DOCS_SECTIONS.indexOf(right.section);
  if (sectionDelta !== 0) {
    return sectionDelta;
  }
  if (left.order !== right.order) {
    return left.order - right.order;
  }
  return left.slug.localeCompare(right.slug);
}

export function resolvePage(
  pages: readonly DocsPage[],
  locale: DocsLocale,
  slug: string
): ResolvedDocsPage | null {
  const normalized = normalizeSlug(slug);
  const exact = pages.find(
    (page) => page.locale === locale && page.slug === normalized
  );
  if (exact) {
    return { fallback: false, page: exact };
  }
  if (locale === DEFAULT_DOCS_LOCALE) {
    return null;
  }
  const fallback = pages.find(
    (page) => page.locale === DEFAULT_DOCS_LOCALE && page.slug === normalized
  );
  return fallback ? { fallback: true, page: fallback } : null;
}

/**
 * Builds the sidebar for one locale. Every English page appears; a localized
 * page replaces the English one when it exists, otherwise the item is marked
 * as a fallback so the UI can label it.
 */
export function buildSidebar(
  pages: readonly DocsPage[],
  locale: DocsLocale
): SidebarSection[] {
  const bySlug = new Map<
    string,
    SidebarItem & { order: number; section: DocsSection }
  >();
  for (const page of pages) {
    if (page.locale === DEFAULT_DOCS_LOCALE) {
      bySlug.set(page.slug, {
        fallback: locale !== DEFAULT_DOCS_LOCALE,
        order: page.order,
        section: page.section,
        slug: page.slug,
        title: page.title,
      });
    }
  }
  for (const page of pages) {
    if (page.locale === locale && locale !== DEFAULT_DOCS_LOCALE) {
      const base = bySlug.get(page.slug);
      bySlug.set(page.slug, {
        fallback: false,
        order: base?.order ?? page.order,
        section: base?.section ?? page.section,
        slug: page.slug,
        title: page.title,
      });
    }
  }
  return DOCS_SECTIONS.map((section) => ({
    id: section,
    items: [...bySlug.values()]
      .filter((item) => item.section === section)
      .sort(
        (left, right) =>
          left.order - right.order || left.slug.localeCompare(right.slug)
      )
      .map(({ fallback, slug, title }) => ({ fallback, slug, title })),
    title: SECTION_TITLES[locale][section],
  })).filter((section) => section.items.length > 0);
}

export function flattenSidebar(
  sections: readonly SidebarSection[]
): SidebarItem[] {
  return sections.flatMap((section) => section.items);
}

export function adjacentPages(
  sections: readonly SidebarSection[],
  slug: string
): { previous: SidebarItem | null; next: SidebarItem | null } {
  const items = flattenSidebar(sections);
  const index = items.findIndex((item) => item.slug === normalizeSlug(slug));
  if (index === -1) {
    return { next: null, previous: null };
  }
  return {
    next: items[index + 1] ?? null,
    previous: items[index - 1] ?? null,
  };
}

export function docsPath(slug: string): string {
  const normalized = normalizeSlug(slug);
  return normalized ? `/docs/${normalized}/` : '/docs/';
}

export interface LlmsOptions {
  origin: string;
  siteName?: string;
}

/**
 * `llms.txt`: a short index of every English page with absolute URLs, following
 * the llmstxt.org convention so agents can pick pages to read.
 */
export function buildLlmsIndex(
  pages: readonly DocsPage[],
  options: LlmsOptions
): string {
  const siteName = options.siteName ?? 'GhostBoard plugin documentation';
  const sections = buildSidebar(pages, DEFAULT_DOCS_LOCALE);
  const lines = [
    `# ${siteName}`,
    '',
    '> Documentation for building, packaging, signing and distributing high-trust GhostBoard plugins with @ghostboard/sdk.',
    '',
    `Full text of every page: ${options.origin}/docs/llms-full.txt`,
    '',
  ];
  for (const section of sections) {
    lines.push(`## ${section.title}`, '');
    for (const item of section.items) {
      const page = pages.find(
        (candidate) =>
          candidate.locale === DEFAULT_DOCS_LOCALE &&
          candidate.slug === item.slug
      );
      const description = page?.description ? `: ${page.description}` : '';
      lines.push(
        `- [${item.title}](${options.origin}${docsPath(item.slug)})${description}`
      );
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * `llms-full.txt`: every English page body in sidebar order, separated by a
 * title heading and source URL, so one fetch gives an agent the whole site.
 */
export function buildLlmsFull(
  entries: readonly DocsEntryLike[],
  options: LlmsOptions
): string {
  const pages = toPages(entries);
  const sections = buildSidebar(pages, DEFAULT_DOCS_LOCALE);
  const bodies = new Map(entries.map((entry) => [entry.id, entry.body ?? '']));
  const chunks: string[] = [];
  for (const item of flattenSidebar(sections)) {
    const page = pages.find(
      (candidate) =>
        candidate.locale === DEFAULT_DOCS_LOCALE && candidate.slug === item.slug
    );
    if (!page) {
      continue;
    }
    const version = page.sourceVersion
      ? `\nSource version: ${page.sourceVersion}`
      : '';
    chunks.push(
      `# ${page.title}\n\nURL: ${options.origin}${docsPath(page.slug)}${version}\n\n${(bodies.get(page.id) ?? '').trim()}\n`
    );
  }
  return chunks.join('\n---\n\n');
}
