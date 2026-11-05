import { useQuery } from '@tanstack/react-query';

import { rpcGetTemplate, rpcListTemplates } from '@/lib/rpc';

import * as m from '../../paraglide/messages.js';

/** Shape returned by the listTemplates RPC. */
export interface TemplateMeta {
  category: 'planning' | 'thinking' | 'knowledge' | 'blank';
  description: string;
  id: string;
  name: string;
  tags: string[];
  thumbnail: string;
}

/**
 * Per-template i18n entries. Built-in templates expose localized name and
 * description through paraglide so the templates browser respects the
 * user's locale. Templates not registered here fall back to the English
 * `name` and `description` from `meta.json`.
 */
const TEMPLATE_I18N: Record<
  string,
  { name: () => string; description: () => string }
> = {
  'feature-story': {
    name: () => m.template_feature_story_name(),
    description: () => m.template_feature_story_description(),
  },
  'topic-pool': {
    name: () => m.template_topic_pool_name(),
    description: () => m.template_topic_pool_description(),
  },
  'interview-notes': {
    name: () => m.template_interview_notes_name(),
    description: () => m.template_interview_notes_description(),
  },
  'novel-bible': {
    name: () => m.template_novel_bible_name(),
    description: () => m.template_novel_bible_description(),
  },
  blank: {
    name: () => m.template_blank_name(),
    description: () => m.template_blank_description(),
  },
  'brainstorm-mindmap': {
    name: () => m.template_brainstorm_mindmap_name(),
    description: () => m.template_brainstorm_mindmap_description(),
  },
  'reading-notes': {
    name: () => m.template_reading_notes_name(),
    description: () => m.template_reading_notes_description(),
  },
};

/**
 * Eagerly collect every built-in template's `thumbnail.png` at module load.
 * Vite resolves these as URLs (dev: served by the dev server with a HMR
 * fingerprint; prod: hashed asset URL inside the renderer bundle), so the
 * templates browser can render them directly via `<img src={...} />`.
 *
 * The `query: '?url'` form is intentional: without it Vite would inline
 * the PNG as a base64 data URI for small files, which:
 *   1. Bloats the renderer bundle, and
 *   2. Defeats HMR — when the dev-only "export thumbnail" workflow rewrites
 *      a PNG, we want the browser to refetch it under a new fingerprint.
 */
const THUMBNAIL_MODULES = import.meta.glob<string>(
  '../../bun/templates/*/thumbnail.png',
  { eager: true, query: '?url', import: 'default' }
);

const THUMBNAIL_PATH_RE = /\/templates\/([^/]+)\/thumbnail\.png$/;

const TEMPLATE_THUMBNAILS: Record<string, string> = Object.entries(
  THUMBNAIL_MODULES
).reduce<Record<string, string>>((acc, [path, url]) => {
  const match = THUMBNAIL_PATH_RE.exec(path);
  if (match?.[1]) {
    acc[match[1]] = url;
  }
  return acc;
}, {});

/**
 * Per-template thumbnail version counter. Bumped by
 * {@link bumpTemplateThumbnailVersion} whenever the dev-only "export
 * thumbnail" flow rewrites a PNG on disk. Vite hands us a stable URL for
 * each `thumbnail.png`, so without a cache-buster query string the
 * browser would happily serve the previous (cached) bytes even though
 * the underlying file has changed.
 */
const thumbnailVersions = new Map<string, number>();

/**
 * Increment the cache-buster for a given template. After calling this,
 * invalidate the `['templates']` React Query so consumers refetch and
 * pick up the new `thumbnail.png?v=<n>` URL.
 */
export function bumpTemplateThumbnailVersion(templateId: string): void {
  thumbnailVersions.set(
    templateId,
    (thumbnailVersions.get(templateId) ?? 0) + 1
  );
}

function appendCacheBuster(url: string, version: number): string {
  if (!url || version === 0) {
    return url;
  }
  return url.includes('?') ? `${url}&v=${version}` : `${url}?v=${version}`;
}

/** Apply paraglide i18n + per-template thumbnail to a meta entry. */
function localizeMeta(meta: TemplateMeta): TemplateMeta {
  const i18n = TEMPLATE_I18N[meta.id];
  const baseThumbnail = TEMPLATE_THUMBNAILS[meta.id] ?? meta.thumbnail;
  const thumbnail = appendCacheBuster(
    baseThumbnail,
    thumbnailVersions.get(meta.id) ?? 0
  );
  if (!i18n) {
    return thumbnail === meta.thumbnail ? meta : { ...meta, thumbnail };
  }
  return {
    ...meta,
    name: i18n.name(),
    description: i18n.description(),
    thumbnail,
  };
}

/** Fetch the full template list from the backend. */
export function useTemplates() {
  return useQuery<TemplateMeta[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const result = await rpcListTemplates();
      const list = (result as TemplateMeta[] | null) ?? [];
      return list.map(localizeMeta);
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Fetch a single template by id (includes nodes, edges, noteContents). */
export function useTemplate(id: string) {
  return useQuery({
    queryKey: ['templates', id],
    queryFn: async () => {
      const result = await rpcGetTemplate(id);
      if (!result) {
        throw new Error(`Template "${id}" not found`);
      }
      // Backend returns the raw meta; localize before handing to consumers.
      // Preserve all other fields (nodes / edges / noteContents) untouched
      // so the consumer types continue to match the pre-localization shape.
      return { ...result, meta: localizeMeta(result.meta) };
    },
    enabled: id.length > 0,
    staleTime: 1000 * 60 * 5,
  });
}
