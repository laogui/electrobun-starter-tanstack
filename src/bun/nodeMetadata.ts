import { join } from 'node:path';

import { atomicWrite } from './atomicWrite';
import { listFilesRecursive, loadNote } from './notes';

export interface NodeMetadata {
  tag?: string;
  tagColor?: string;
  tagColors?: Record<string, string>;
  tags?: string[];
}

export type NodeMetadataMap = Record<string, NodeMetadata>;

export interface NodeMetadataDocument {
  entries: NodeMetadataMap;
  schema: 'ghostboard-node-metadata/v1';
}

export interface TagSummary {
  count: number;
  name: string;
}

export interface TagMutationResult {
  /** Number of metadata entries that were rewritten. */
  updated: number;
}

const SCHEMA = 'ghostboard-node-metadata/v1' as const;
const RELATIVE_PATH = '.ghostboard/node-metadata.json';
const FLUSH_DEBOUNCE_MS = 500;
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 32;

interface WorkspaceState {
  entries: NodeMetadataMap;
  flushTimer: ReturnType<typeof setTimeout> | null;
  loaded: boolean;
}

const states = new Map<string, WorkspaceState>();

function resolvePath(wsPath: string): string {
  return join(wsPath, RELATIVE_PATH);
}

function getState(wsPath: string): WorkspaceState {
  let s = states.get(wsPath);
  if (!s) {
    s = { entries: {}, flushTimer: null, loaded: false };
    states.set(wsPath, s);
  }
  return s;
}

function isPlainEntry(value: unknown): value is NodeMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return true;
}

function normalizeTagColorMap(
  raw: unknown,
  allowedTags: string[]
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return;
  }
  const canonicalNames = new Map(
    allowedTags.map((name) => [name.toLowerCase(), name])
  );
  const out: Record<string, string> = {};
  for (const [rawName, rawColor] of Object.entries(raw)) {
    if (typeof rawColor !== 'string') {
      continue;
    }
    const name = rawName.trim().slice(0, MAX_TAG_LENGTH);
    const color = rawColor.trim();
    if (!(name && color)) {
      continue;
    }
    const canonical = canonicalNames.get(name.toLowerCase());
    if (!canonical) {
      continue;
    }
    out[canonical] = color;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function compactEntry(entry: NodeMetadata): NodeMetadata | null {
  const out: NodeMetadata = {};
  if (entry.tag !== undefined) {
    out.tag = entry.tag;
  }
  if (entry.tagColor !== undefined) {
    out.tagColor = entry.tagColor;
  }
  if (entry.tagColors !== undefined) {
    out.tagColors = entry.tagColors;
  }
  if (entry.tags !== undefined) {
    out.tags = entry.tags;
  }
  return Object.keys(out).length === 0 ? null : out;
}

function tagNamesForColors(entry: NodeMetadata): string[] {
  return [...(entry.tag ? [entry.tag] : []), ...(entry.tags ?? [])];
}

function sameTagColorMap(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined
): boolean {
  const aEntries = Object.entries(a ?? {});
  const bEntries = Object.entries(b ?? {});
  if (aEntries.length !== bEntries.length) {
    return false;
  }
  return aEntries.every(([key, value]) => b?.[key] === value);
}

function renameTagColors(
  colors: Record<string, string> | undefined,
  oldKey: string,
  newName: string,
  allowedTags: string[]
): Record<string, string> | undefined {
  if (!colors) {
    return;
  }
  const canonicalNames = new Map(
    allowedTags.map((name) => [name.toLowerCase(), name])
  );
  const out: Record<string, string> = {};
  let renamedColor: string | undefined;
  for (const [name, color] of Object.entries(colors)) {
    if (name.toLowerCase() === oldKey) {
      renamedColor = color;
      continue;
    }
    const canonical = canonicalNames.get(name.toLowerCase());
    if (canonical) {
      out[canonical] = color;
    }
  }
  const renamedCanonical = canonicalNames.get(newName.toLowerCase());
  if (renamedCanonical && renamedColor && !out[renamedCanonical]) {
    out[renamedCanonical] = renamedColor;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeEntry(raw: unknown): NodeMetadata | null {
  if (!isPlainEntry(raw)) {
    return null;
  }
  const out: NodeMetadata = {};
  const tag = (raw as { tag?: unknown }).tag;
  if (typeof tag === 'string' && tag.trim()) {
    out.tag = tag.trim().slice(0, MAX_TAG_LENGTH);
  }
  const tagColor = (raw as { tagColor?: unknown }).tagColor;
  if (typeof tagColor === 'string' && tagColor.trim()) {
    out.tagColor = tagColor.trim();
  }
  const tags = (raw as { tags?: unknown }).tags;
  if (Array.isArray(tags)) {
    const clean = sanitizeTagList(tags);
    if (clean.length > 0) {
      out.tags = clean;
    }
  }
  const tagColors = normalizeTagColorMap(
    (raw as { tagColors?: unknown }).tagColors,
    tagNamesForColors(out)
  );
  if (tagColors) {
    out.tagColors = tagColors;
  }
  return compactEntry(out);
}

/** Public helper used both at read and write time. Mirrors sanitize rules. */
export function sanitizeTagList(input: unknown): string[] {
  const raw: unknown[] = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim().slice(0, MAX_TAG_LENGTH);
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_TAGS) {
      break;
    }
  }
  return out;
}

async function loadFromDisk(wsPath: string): Promise<NodeMetadataMap> {
  const file = Bun.file(resolvePath(wsPath));
  if (!(await file.exists())) {
    return {};
  }
  try {
    const doc = (await file.json()) as Partial<NodeMetadataDocument>;
    if (!doc || typeof doc !== 'object' || !doc.entries) {
      return {};
    }
    const cleaned: NodeMetadataMap = {};
    for (const [id, raw] of Object.entries(doc.entries)) {
      const norm = normalizeEntry(raw);
      if (norm) {
        cleaned[id] = norm;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

async function writeToDisk(wsPath: string): Promise<void> {
  const s = getState(wsPath);
  const doc: NodeMetadataDocument = { schema: SCHEMA, entries: s.entries };
  await atomicWrite(resolvePath(wsPath), JSON.stringify(doc, null, 2));
}

function scheduleFlush(wsPath: string): void {
  const s = getState(wsPath);
  if (s.flushTimer) {
    clearTimeout(s.flushTimer);
  }
  s.flushTimer = setTimeout(() => {
    s.flushTimer = null;
    writeToDisk(wsPath).catch((err) => {
      console.error('[nodeMetadata] flush failed:', err);
    });
  }, FLUSH_DEBOUNCE_MS);
}

/**
 * Load the metadata map for a workspace, populating the in-memory cache on
 * first access. Subsequent calls return the cached map directly.
 */
export async function loadAllMetadata(
  wsPath: string
): Promise<NodeMetadataMap> {
  const s = getState(wsPath);
  if (!s.loaded) {
    s.entries = await loadFromDisk(wsPath);
    s.loaded = true;
  }
  return s.entries;
}

/** Read a single entry from the cache. Returns undefined if not present. */
export function getNodeMetadata(
  wsPath: string,
  id: string
): NodeMetadata | undefined {
  return getState(wsPath).entries[id];
}

/**
 * Merge a partial update into the entry for `id`. Fields set to `undefined`
 * are removed. If the resulting entry has no fields the entry is dropped.
 * The change is scheduled for a debounced disk flush.
 */
export async function setNodeMetadata(
  wsPath: string,
  id: string,
  partial: Partial<NodeMetadata>
): Promise<void> {
  await loadAllMetadata(wsPath);
  const s = getState(wsPath);
  const next: NodeMetadata = { ...(s.entries[id] ?? {}) };
  if ('tag' in partial) {
    if (partial.tag?.trim()) {
      next.tag = partial.tag.trim().slice(0, MAX_TAG_LENGTH);
    } else {
      next.tag = undefined;
    }
  }
  if ('tagColor' in partial) {
    if (partial.tagColor?.trim()) {
      next.tagColor = partial.tagColor.trim();
    } else {
      next.tagColor = undefined;
    }
  }
  if ('tags' in partial) {
    const cleaned = sanitizeTagList(partial.tags);
    if (cleaned.length > 0) {
      next.tags = cleaned;
    } else {
      next.tags = undefined;
    }
  }
  if ('tagColors' in partial) {
    const cleaned = normalizeTagColorMap(
      partial.tagColors,
      tagNamesForColors(next)
    );
    if (cleaned) {
      next.tagColors = cleaned;
    } else {
      next.tagColors = undefined;
    }
  } else if ('tag' in partial || 'tags' in partial) {
    const cleaned = normalizeTagColorMap(
      next.tagColors,
      tagNamesForColors(next)
    );
    if (cleaned) {
      next.tagColors = cleaned;
    } else {
      next.tagColors = undefined;
    }
  }
  const compacted = compactEntry(next);
  if (compacted) {
    s.entries[id] = compacted;
  } else {
    delete s.entries[id];
  }
  scheduleFlush(wsPath);
}

/** Drop the entry for `id` entirely. No-op if absent. */
export async function deleteNodeMetadata(
  wsPath: string,
  id: string
): Promise<void> {
  await loadAllMetadata(wsPath);
  const s = getState(wsPath);
  if (s.entries[id]) {
    delete s.entries[id];
    scheduleFlush(wsPath);
  }
}

function mergeMetadataForMovedKey(
  source: NodeMetadata,
  target: NodeMetadata | undefined
): NodeMetadata {
  const next: NodeMetadata = { ...(target ?? {}) };
  if (!next.tag && source.tag) {
    next.tag = source.tag;
  }
  if (!next.tagColor && source.tagColor) {
    next.tagColor = source.tagColor;
  }

  const mergedTags = sanitizeTagList([
    ...(target?.tags ?? []),
    ...(source.tags ?? []),
  ]);
  if (mergedTags.length > 0) {
    next.tags = mergedTags;
  }

  const mergedColors = normalizeTagColorMap(
    {
      ...(source.tagColors ?? {}),
      ...(target?.tagColors ?? {}),
    },
    tagNamesForColors(next)
  );
  if (mergedColors) {
    next.tagColors = mergedColors;
  }

  return compactEntry(next) ?? {};
}

/**
 * Move metadata from one backing object id to another. Used by checklist card
 * lazy migration, where legacy tags keyed by `note_xxx` must follow the new
 * `widget_xxx` record. Existing target metadata wins for primary tag/color,
 * while secondary tags and per-tag colors are merged.
 */
export async function moveNodeMetadataKey(
  wsPath: string,
  fromId: string,
  toId: string
): Promise<TagMutationResult> {
  if (!(fromId && toId) || fromId === toId) {
    return { updated: 0 };
  }

  const entries = await loadAllMetadata(wsPath);
  const source = entries[fromId];
  if (!source) {
    return { updated: 0 };
  }

  entries[toId] = mergeMetadataForMovedKey(source, entries[toId]);
  delete entries[fromId];
  scheduleFlush(wsPath);
  return { updated: 1 };
}

/** Cancel pending flush and write immediately. Use on shutdown / in tests. */
export async function flushNodeMetadata(wsPath: string): Promise<void> {
  const s = getState(wsPath);
  if (s.flushTimer) {
    clearTimeout(s.flushTimer);
    s.flushTimer = null;
  }
  if (s.loaded) {
    await writeToDisk(wsPath);
  }
}

/** Test helper — reset cache for a workspace. Not exported via index. */
export function resetNodeMetadataCacheForTests(wsPath?: string): void {
  if (wsPath) {
    states.delete(wsPath);
    return;
  }
  states.clear();
}

/**
 * Aggregate tags across all metadata entries for this workspace. Each entry
 * contributes at most once per unique tag (so an entry with both `tag: Work`
 * and `tags: ["Work"]` still counts as one). Sorted by descending count, then
 * alphabetically.
 */
export async function listAllTagsFromMetadata(
  wsPath: string
): Promise<TagSummary[]> {
  const entries = await loadAllMetadata(wsPath);
  const bucket = new Map<string, { display: string; count: number }>();

  for (const meta of Object.values(entries)) {
    const seen = new Set<string>();
    const recordTag = (value: unknown) => {
      const str = typeof value === 'string' ? value.trim() : '';
      if (!str) {
        return;
      }
      const key = str.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      const existing = bucket.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        bucket.set(key, { display: str, count: 1 });
      }
    };
    recordTag(meta.tag);
    if (Array.isArray(meta.tags)) {
      for (const t of meta.tags) {
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

/**
 * Check every `.md` file under `content/` for legacy frontmatter
 * `tag` / `tagColor` / `tags` fields and migrate them into the
 * node-metadata sidecar. Idempotent — entries that already exist in the
 * sidecar are left untouched. Run once at workspace init after seeding so
 * existing workspaces with old-format frontmatter tags get picked up.
 */
export async function migrateLegacyTagsFromNotes(
  wsPath: string
): Promise<void> {
  await loadAllMetadata(wsPath);
  const s = getState(wsPath);
  const contentDir = join(wsPath, 'content');
  const files = listFilesRecursive(contentDir);
  const markdownFiles: string[] = [];
  for (const rel of files) {
    if (rel.endsWith('.md')) {
      markdownFiles.push(rel);
    }
  }
  const markdownDocs = await Promise.all(
    markdownFiles.map((rel) => loadNote(wsPath, `content/${rel}`))
  );
  let dirty = false;

  for (const doc of markdownDocs) {
    if (!doc?.frontmatter?.id) {
      continue;
    }
    const noteId = doc.frontmatter.id as string;
    if (s.entries[noteId]) {
      continue;
    }

    const fmTag = doc.frontmatter.tag as string | undefined;
    const fmTagColor = doc.frontmatter.tagColor as string | undefined;
    const fmTags = doc.frontmatter.tags as string[] | undefined;

    const hasTag = typeof fmTag === 'string' && fmTag.trim().length > 0;
    const hasTagColor =
      typeof fmTagColor === 'string' && fmTagColor.trim().length > 0;
    const hasTags =
      Array.isArray(fmTags) &&
      fmTags.filter((t) => typeof t === 'string' && t.trim().length > 0)
        .length > 0;

    if (!(hasTag || hasTagColor || hasTags)) {
      continue;
    }

    const meta: NodeMetadata = {};
    if (hasTag) {
      meta.tag = fmTag!.trim().slice(0, MAX_TAG_LENGTH);
    }
    if (hasTagColor) {
      meta.tagColor = fmTagColor!.trim();
    }
    if (hasTags) {
      const clean: string[] = [];
      for (const tag of fmTags!) {
        if (typeof tag !== 'string') {
          continue;
        }
        const normalized = tag.trim().slice(0, MAX_TAG_LENGTH);
        if (normalized) {
          clean.push(normalized);
        }
      }
      if (clean.length > 0) {
        meta.tags = [...new Set(clean)];
      }
    }

    s.entries[noteId] = meta;
    dirty = true;
  }

  if (dirty) {
    scheduleFlush(wsPath);
  }
}

/**
 * Rename `oldName` to `newName` across every metadata entry. Matching is
 * case-insensitive. If the new name already appears alongside the old one on
 * the same entry, the duplicate is collapsed. When the primary `tag` matches
 * old name it is rewritten in place (preserving `tagColor`). Returns the
 * number of metadata entries that were rewritten.
 */
export async function renameTagEverywhere(
  wsPath: string,
  oldName: string,
  newName: string
): Promise<TagMutationResult> {
  const oldTrim = oldName.trim();
  const cleanNext = newName.trim().slice(0, MAX_TAG_LENGTH);
  if (!(oldTrim && cleanNext)) {
    return { updated: 0 };
  }
  const oldKey = oldTrim.toLowerCase();
  const newKey = cleanNext.toLowerCase();
  if (oldKey === newKey) {
    return { updated: 0 };
  }

  const entries = await loadAllMetadata(wsPath);
  let updated = 0;
  for (const [id, meta] of Object.entries(entries)) {
    const next: NodeMetadata = { ...meta };
    let changed = false;
    if (meta.tag && meta.tag.toLowerCase() === oldKey) {
      next.tag = cleanNext;
      changed = true;
    }
    if (Array.isArray(meta.tags)) {
      const seen = new Set<string>();
      const rebuilt: string[] = [];
      let listChanged = false;
      for (const entry of meta.tags) {
        const replaced = entry.toLowerCase() === oldKey ? cleanNext : entry;
        if (entry !== replaced) {
          listChanged = true;
        }
        const key = replaced.toLowerCase();
        if (seen.has(key)) {
          listChanged = true;
          continue;
        }
        seen.add(key);
        rebuilt.push(replaced);
      }
      if (listChanged) {
        next.tags = rebuilt.length > 0 ? rebuilt : undefined;
        changed = true;
      }
    }
    if (meta.tagColors) {
      const rebuiltColors = renameTagColors(
        meta.tagColors,
        oldKey,
        cleanNext,
        tagNamesForColors(next)
      );
      if (!sameTagColorMap(meta.tagColors, rebuiltColors)) {
        next.tagColors = rebuiltColors;
        changed = true;
      }
    }
    if (changed) {
      const compacted = compactEntry(next);
      if (compacted) {
        entries[id] = compacted;
      } else {
        delete entries[id];
      }
      updated += 1;
    }
  }

  if (updated > 0) {
    scheduleFlush(wsPath);
  }
  return { updated };
}

/**
 * Remove `name` from every entry's primary `tag` and `tags[]`. Matching is
 * case-insensitive. Removing the primary tag also clears `tagColor`. Returns
 * the number of metadata entries rewritten.
 */
export async function deleteTagEverywhere(
  wsPath: string,
  name: string
): Promise<TagMutationResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { updated: 0 };
  }
  const key = trimmed.toLowerCase();
  const entries = await loadAllMetadata(wsPath);
  let updated = 0;
  for (const [id, meta] of Object.entries(entries)) {
    const next: NodeMetadata = { ...meta };
    let changed = false;
    if (meta.tag && meta.tag.toLowerCase() === key) {
      next.tag = undefined;
      next.tagColor = undefined;
      changed = true;
    }
    if (Array.isArray(meta.tags)) {
      const filtered = meta.tags.filter((t) => t.toLowerCase() !== key);
      if (filtered.length !== meta.tags.length) {
        if (filtered.length > 0) {
          next.tags = filtered;
        } else {
          next.tags = undefined;
        }
        changed = true;
      }
    }
    if (meta.tagColors) {
      const filteredColors = normalizeTagColorMap(
        Object.fromEntries(
          Object.entries(meta.tagColors).filter(
            ([tagName]) => tagName.toLowerCase() !== key
          )
        ),
        tagNamesForColors(next)
      );
      if (!sameTagColorMap(meta.tagColors, filteredColors)) {
        if (filteredColors) {
          next.tagColors = filteredColors;
        } else {
          next.tagColors = undefined;
        }
        changed = true;
      }
    }
    if (changed) {
      const compacted = compactEntry(next);
      if (compacted) {
        entries[id] = compacted;
      } else {
        delete entries[id];
      }
      updated += 1;
    }
  }
  if (updated > 0) {
    scheduleFlush(wsPath);
  }
  return { updated };
}
