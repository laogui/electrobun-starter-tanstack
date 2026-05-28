import { join } from 'node:path';

import {
  listFilesRecursive,
  parseFrontmatter,
  sanitizeTags,
  saveNote,
} from './notes';

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

export interface TagMutationResult {
  /** Number of note files whose contents were rewritten. */
  updated: number;
}

type TagMutator = (fm: Record<string, unknown>) => boolean;

async function mutateAllNotes(
  wsPath: string,
  mutate: TagMutator
): Promise<TagMutationResult> {
  const contentDir = join(wsPath, 'content');
  let updated = 0;
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
    const { frontmatter, body } = parseFrontmatter(text);
    if (!mutate(frontmatter)) {
      continue;
    }
    await saveNote(wsPath, `content/${rel}`, frontmatter, body);
    updated += 1;
  }
  return { updated };
}

/**
 * Rename `oldName` to `newName` across every note's `tag` and `tags[]`
 * frontmatter fields. Matching is case-insensitive. If the new name already
 * appears alongside the old one on the same note, the duplicate is collapsed.
 * Returns the number of note files that were rewritten.
 */
export async function renameTagInAllNotes(
  wsPath: string,
  oldName: string,
  newName: string
): Promise<TagMutationResult> {
  const oldTrim = oldName.trim();
  const [clean] = sanitizeTags([newName]);
  if (!(oldTrim && clean)) {
    return { updated: 0 };
  }
  const oldKey = oldTrim.toLowerCase();
  const newKey = clean.toLowerCase();
  if (oldKey === newKey) {
    return { updated: 0 };
  }

  return mutateAllNotes(wsPath, (fm) => {
    let changed = false;
    const primary = typeof fm.tag === 'string' ? fm.tag : '';
    if (primary && primary.toLowerCase() === oldKey) {
      fm.tag = clean;
      changed = true;
    }
    if (Array.isArray(fm.tags)) {
      const next: string[] = [];
      const seen = new Set<string>();
      let listChanged = false;
      for (const entry of fm.tags as unknown[]) {
        if (typeof entry !== 'string') {
          continue;
        }
        const replaced = entry.toLowerCase() === oldKey ? clean : entry;
        if (entry !== replaced) {
          listChanged = true;
        }
        const key = replaced.toLowerCase();
        if (seen.has(key)) {
          listChanged = true;
          continue;
        }
        seen.add(key);
        next.push(replaced);
      }
      if (listChanged) {
        fm.tags = next;
        changed = true;
      }
    }
    return changed;
  });
}

/**
 * Remove `name` from every note's `tag` and `tags[]` frontmatter fields.
 * When the primary `tag` is removed, the associated `tagColor` is cleared too.
 * Matching is case-insensitive. Returns the number of note files rewritten.
 */
export async function deleteTagFromAllNotes(
  wsPath: string,
  name: string
): Promise<TagMutationResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { updated: 0 };
  }
  const key = trimmed.toLowerCase();

  return mutateAllNotes(wsPath, (fm) => {
    let changed = false;
    const primary = typeof fm.tag === 'string' ? fm.tag : '';
    if (primary && primary.toLowerCase() === key) {
      fm.tag = undefined;
      fm.tagColor = undefined;
      changed = true;
    }
    if (Array.isArray(fm.tags)) {
      const next = (fm.tags as unknown[]).filter(
        (entry) => typeof entry === 'string' && entry.toLowerCase() !== key
      ) as string[];
      if (next.length !== (fm.tags as unknown[]).length) {
        if (next.length === 0) {
          fm.tags = undefined;
        } else {
          fm.tags = next;
        }
        changed = true;
      }
    }
    return changed;
  });
}
