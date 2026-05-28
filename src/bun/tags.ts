import { join } from 'node:path';

import { listFilesRecursive, parseFrontmatter } from './notes';

export interface TagSummary {
  /** Number of notes referencing this tag (case-insensitive match). */
  count: number;
  /** Display name as originally stored (first-seen casing wins). */
  name: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function pushTag(
  bucket: Map<string, { display: string; count: number }>,
  raw: unknown
): void {
  const value = asString(raw).trim();
  if (!value) {
    return;
  }
  const key = value.toLowerCase();
  const existing = bucket.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  bucket.set(key, { display: value, count: 1 });
}

/**
 * Scan all `.md` files under the workspace `content/` directory and aggregate
 * tags from the `tag` (primary) and `tags[]` (secondary) frontmatter fields.
 *
 * - Tags are matched case-insensitively for deduplication; the display name
 *   uses the first casing encountered during the scan.
 * - Each note contributes at most one increment per unique tag (so a note
 *   that has both `tag: Work` and `tags: ["Work"]` still counts as one).
 * - The returned list is sorted by descending count, then alphabetically for
 *   stable presentation.
 */
export async function listAllTags(wsPath: string): Promise<TagSummary[]> {
  const contentDir = join(wsPath, 'content');
  const bucket = new Map<string, { display: string; count: number }>();

  for (const rel of listFilesRecursive(contentDir)) {
    if (!rel.endsWith('.md')) {
      continue;
    }
    const fullPath = join(contentDir, rel);
    let text: string;
    try {
      text = await Bun.file(fullPath).text();
    } catch {
      continue;
    }
    const { frontmatter } = parseFrontmatter(text);

    const seen = new Set<string>();
    const recordTag = (value: unknown) => {
      const str = asString(value).trim();
      if (!str) {
        return;
      }
      const key = str.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      pushTag(bucket, str);
    };

    recordTag(frontmatter.tag);
    if (Array.isArray(frontmatter.tags)) {
      for (const t of frontmatter.tags as unknown[]) {
        recordTag(t);
      }
    }
  }

  return Array.from(bucket.values())
    .map(({ display, count }) => ({ name: display, count }))
    .sort((a, b) => {
      if (a.count !== b.count) {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    });
}
