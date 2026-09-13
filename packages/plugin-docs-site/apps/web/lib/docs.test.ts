import { describe, expect, it } from 'vitest';

import {
  adjacentPages,
  buildLlmsFull,
  buildLlmsIndex,
  buildSidebar,
  type DocsEntryLike,
  docsPath,
  normalizeSlug,
  parseDocsId,
  resolvePage,
  toPages,
} from './docs';

const entries: DocsEntryLike[] = [
  {
    body: '## Install\n\nOpen Settings.',
    data: { order: 10, section: 'start', title: 'Install GhostBoard' },
    id: 'en/start/install',
  },
  {
    body: 'Fifteen minutes.',
    data: {
      description: 'Your first command plugin',
      order: 20,
      section: 'start',
      title: 'First plugin',
    },
    id: 'en/start/first-plugin',
  },
  {
    body: 'Reference body',
    data: {
      order: 10,
      section: 'reference',
      sourceVersion: '@ghostboard/sdk 0.1.0',
      title: 'SDK reference',
    },
    id: 'en/reference/sdk',
  },
  {
    body: '十五分钟。',
    data: { order: 20, section: 'start', title: '第一个插件' },
    id: 'zh/start/first-plugin',
  },
  {
    body: 'Policy',
    data: { order: 5, section: 'policy', title: 'Compatibility' },
    id: 'en/policy/compatibility',
  },
];

describe('docs ids and slugs', () => {
  it('parses locale and slug from collection ids', () => {
    expect(parseDocsId('en/start/first-plugin')).toEqual({
      locale: 'en',
      slug: 'start/first-plugin',
    });
    expect(() => parseDocsId('fr/start/x')).toThrow();
    expect(() => parseDocsId('en')).toThrow();
  });

  it('normalizes slugs and builds paths', () => {
    expect(normalizeSlug('/start/first-plugin/')).toBe('start/first-plugin');
    expect(docsPath('start/first-plugin')).toBe('/docs/start/first-plugin/');
    expect(docsPath('')).toBe('/docs/');
  });

  it('sorts pages by section order, then order, then slug', () => {
    expect(toPages(entries).map((page) => page.id)).toEqual([
      'en/start/install',
      'en/start/first-plugin',
      'zh/start/first-plugin',
      'en/reference/sdk',
      'en/policy/compatibility',
    ]);
  });
});

describe('locale resolution', () => {
  const pages = toPages(entries);

  it('serves exact localized pages', () => {
    expect(resolvePage(pages, 'zh', 'start/first-plugin')).toMatchObject({
      fallback: false,
      page: { id: 'zh/start/first-plugin' },
    });
  });

  it('falls back to English for missing Chinese pages and flags it', () => {
    expect(resolvePage(pages, 'zh', 'start/install')).toMatchObject({
      fallback: true,
      page: { id: 'en/start/install' },
    });
  });

  it('returns null for unknown slugs in any locale', () => {
    expect(resolvePage(pages, 'en', 'nope')).toBeNull();
    expect(resolvePage(pages, 'zh', 'nope')).toBeNull();
  });
});

describe('sidebar', () => {
  const pages = toPages(entries);

  it('lists every English page for English readers without fallback flags', () => {
    const sidebar = buildSidebar(pages, 'en');
    expect(sidebar.map((section) => section.id)).toEqual([
      'start',
      'reference',
      'policy',
    ]);
    expect(sidebar[0]?.items).toEqual([
      { fallback: false, slug: 'start/install', title: 'Install GhostBoard' },
      { fallback: false, slug: 'start/first-plugin', title: 'First plugin' },
    ]);
  });

  it('uses localized titles where available and marks fallbacks', () => {
    const sidebar = buildSidebar(pages, 'zh');
    expect(sidebar[0]?.title).toBe('开始');
    expect(sidebar[0]?.items).toEqual([
      { fallback: true, slug: 'start/install', title: 'Install GhostBoard' },
      { fallback: false, slug: 'start/first-plugin', title: '第一个插件' },
    ]);
  });

  it('computes previous and next across sections', () => {
    const sidebar = buildSidebar(pages, 'en');
    expect(adjacentPages(sidebar, 'start/first-plugin')).toEqual({
      next: { fallback: false, slug: 'reference/sdk', title: 'SDK reference' },
      previous: {
        fallback: false,
        slug: 'start/install',
        title: 'Install GhostBoard',
      },
    });
    expect(adjacentPages(sidebar, 'start/install').previous).toBeNull();
    expect(adjacentPages(sidebar, 'policy/compatibility').next).toBeNull();
    expect(adjacentPages(sidebar, 'missing')).toEqual({
      next: null,
      previous: null,
    });
  });
});

describe('llms text endpoints', () => {
  it('indexes English pages with absolute URLs and descriptions', () => {
    const text = buildLlmsIndex(toPages(entries), {
      origin: 'https://example.test',
    });
    expect(text).toContain('# GhostBoard plugin documentation');
    expect(text).toContain(
      '- [First plugin](https://example.test/docs/start/first-plugin/): Your first command plugin'
    );
    expect(text).toContain('https://example.test/docs/llms-full.txt');
    expect(text).not.toContain('第一个插件');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('concatenates English bodies in sidebar order with source versions', () => {
    const text = buildLlmsFull(entries, { origin: 'https://example.test' });
    const installIndex = text.indexOf('# Install GhostBoard');
    const referenceIndex = text.indexOf('# SDK reference');
    expect(installIndex).toBeGreaterThan(-1);
    expect(referenceIndex).toBeGreaterThan(installIndex);
    expect(text).toContain('Source version: @ghostboard/sdk 0.1.0');
    expect(text).toContain('URL: https://example.test/docs/reference/sdk/');
    expect(text).not.toContain('十五分钟');
  });
});
