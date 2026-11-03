import { existsSync, readdirSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { atomicWrite } from './atomicWrite';
import { withNoteWorkspace } from './noteTransactions';
import { notifyContentChanged } from './plugins/contentEvents';
import { resolveWorkspaceSubpath } from './workspacePaths';

export interface NoteFrontmatter {
  color?: string;
  createdAt?: string;
  displayHint?: string;
  id: string;
  previewBlocks?: number;
  previewExcerpt?: string;
  previewHtml?: string;
  previewVersion?: number;
  title?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface NoteDocument {
  body: string;
  file: string; // workspace-relative path
  frontmatter: NoteFrontmatter;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const NUMERIC_FRONTMATTER_KEYS = new Set(['previewBlocks', 'previewVersion']);

function assertWorkspaceNotePath(
  wsPath: string,
  filePath: string
): { fullPath: string; relativePath: string } {
  return resolveWorkspaceSubpath(wsPath, filePath, {
    dir: 'content',
    extension: '.md',
    label: 'Note',
  });
}

// Simple YAML frontmatter parser
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const yamlStr = match[1] ?? '';
  const body = match[2] ?? '';
  const frontmatter: Record<string, unknown> = {};

  for (const line of yamlStr.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    // react-doctor-disable-next-line react-doctor/js-set-map-lookups
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }
    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();

    // Remove surrounding quotes and unescape
    if (typeof value === 'string') {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value
          .slice(1, -1)
          .replaceAll(String.raw`\n`, '\n')
          .replaceAll(String.raw`\"`, '"')
          .replaceAll('\\\\', '\\');
      }
      // Parse arrays like ["Inbox", "Work"]
      if (
        (value as string).startsWith('[') &&
        (value as string).endsWith(']')
      ) {
        try {
          value = JSON.parse(value as string);
        } catch {
          // keep as string
        }
      }
      if (
        NUMERIC_FRONTMATTER_KEYS.has(key) &&
        typeof value === 'string' &&
        value.trim() !== ''
      ) {
        const numberValue = Number(value);
        if (Number.isFinite(numberValue)) {
          value = numberValue;
        }
      }
    }
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

// Simple frontmatter serializer
function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (
      typeof value === 'string' &&
      // react-doctor-disable-next-line react-doctor/js-set-map-lookups
      (value.includes(':') || value.includes('\n') || value.includes('"'))
    ) {
      lines.push(
        `${key}: "${value
          .replaceAll('\\', '\\\\')
          .replaceAll('"', String.raw`\"`)
          .replaceAll('\n', String.raw`\n`)}"`
      );
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join('\n');
}

/** Recursively list all files under a directory (returns relative paths). */
export function listFilesRecursive(dir: string, prefix = ''): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) {
    return results;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

/** Recursively list all files under a directory without blocking the event loop. */
export async function listFilesRecursiveAsync(
  dir: string,
  prefix = ''
): Promise<string[]> {
  if (!existsSync(dir)) {
    return [];
  }
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  const nestedResults = await Promise.all(
    entries.map(async (entry) => {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        return await listFilesRecursiveAsync(join(dir, entry.name), rel);
      }
      return [rel];
    })
  );
  for (const nested of nestedResults) {
    results.push(...nested);
  }
  return results;
}

/** Load a note by its file path (workspace-relative). */
export async function loadNote(
  wsPath: string,
  filePath: string
): Promise<NoteDocument | null> {
  const { fullPath, relativePath } = assertWorkspaceNotePath(wsPath, filePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return null;
  }
  const text = await file.text();
  const { frontmatter, body } = parseFrontmatter(text);
  return {
    frontmatter: frontmatter as NoteFrontmatter,
    body,
    file: relativePath,
  };
}

/** Save a note to disk (atomic write). */
export async function saveNote(
  wsPath: string,
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string
): Promise<void> {
  return withNoteWorkspace(wsPath, async () => {
    const { fullPath } = assertWorkspaceNotePath(wsPath, filePath);
    const content = `---\n${serializeFrontmatter(frontmatter)}\n---\n${body}`;
    await atomicWrite(fullPath, content);
    if (typeof frontmatter.id === 'string' && frontmatter.id) {
      notifyContentChanged(wsPath, {
        kind: 'note',
        ids: [frontmatter.id],
        operation: 'upsert',
      });
    }
  });
}

const HEADING_RE = /^#\s+(.+)$/m;
const MD_EXTENSION_RE = /\.md$/i;

/**
 * Pick a display title for an imported markdown file. Frontmatter `title`
 * wins; otherwise the first `# Heading`; otherwise the file's base name.
 */
export function deriveMarkdownTitle(
  frontmatter: Record<string, unknown>,
  body: string,
  fileName: string
): string {
  const fmTitle = frontmatter.title;
  if (typeof fmTitle === 'string' && fmTitle.trim()) {
    return fmTitle.trim();
  }
  const heading = HEADING_RE.exec(body)?.[1]?.trim();
  if (heading) {
    return heading;
  }
  const base = fileName.split('/').pop()?.replace(MD_EXTENSION_RE, '') ?? '';
  return base.trim() || 'Untitled';
}

/**
 * Normalize an imported markdown body for workspace storage. When the display
 * title is derived from the first `# Heading`, strip that heading so the card
 * title and BlockNote body do not duplicate it.
 */
const LEADING_HEADING_RE = /^#\s+(.+?)(?:\r?\n|$)/;

export function prepareImportedMarkdownBody(
  frontmatter: Record<string, unknown>,
  body: string,
  fileName: string
): string {
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    return body;
  }
  const match = LEADING_HEADING_RE.exec(body);
  if (!match) {
    return body;
  }
  const heading = match[1]?.trim();
  const derivedTitle = deriveMarkdownTitle(frontmatter, body, fileName);
  if (!heading || heading !== derivedTitle) {
    return body;
  }
  return body.slice(match[0].length).trimStart();
}

/** Create a new note file. Returns the workspace-relative file path. */
export async function createNote(
  wsPath: string,
  noteId: string,
  title: string,
  displayHint: string
): Promise<string> {
  return withNoteWorkspace(wsPath, async () => {
    const slug = title
      ? title
          .toLowerCase()
          .replaceAll(/[^a-z\d]+/g, '-')
          .replaceAll(/^-|-$/g, '')
          .slice(0, 50) || noteId
      : noteId;
    // Include noteId suffix to guarantee uniqueness across notes with the same title
    const idSuffix = noteId.slice(-8);
    const fileName = `${slug}-${idSuffix}.md`;
    const filePath = `content/${fileName}`;
    const now = new Date().toISOString();
    const frontmatter: NoteFrontmatter = {
      id: noteId,
      title,
      displayHint,
      createdAt: now,
      updatedAt: now,
    };
    await saveNote(wsPath, filePath, frontmatter, '');
    return filePath;
  });
}

/** Delete a note file. Uses Bun.file to check existence. */
export async function deleteNoteFile(
  wsPath: string,
  filePath: string
): Promise<boolean> {
  return withNoteWorkspace(wsPath, async () => {
    const { fullPath } = assertWorkspaceNotePath(wsPath, filePath);
    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      return false;
    }
    const note = await loadNote(wsPath, filePath).catch(() => null);
    await unlink(fullPath);
    if (note?.frontmatter.id) {
      notifyContentChanged(wsPath, {
        kind: 'note',
        ids: [note.frontmatter.id],
        operation: 'delete',
      });
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Checklist GFM serialization
// ---------------------------------------------------------------------------

/** Serialize structured checklist items to GFM checkbox markdown. */
export function serializeChecklistItems(
  items: Array<{ text?: string; checked?: boolean; isHeader?: boolean }>
): string {
  return items
    .map((item) => {
      if (item.isHeader) {
        return `## ${item.text ?? ''}`;
      }
      return item.checked
        ? `- [x] ${item.text ?? ''}`
        : `- [ ] ${item.text ?? ''}`;
    })
    .join('\n');
}

/** Parse GFM checkbox markdown back to structured checklist items. */
export function parseChecklistBody(
  body: string
): Array<{ text: string; checked: boolean; isHeader?: boolean }> {
  const items: Array<{ text: string; checked: boolean; isHeader?: boolean }> =
    [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('## ')) {
      items.push({ text: trimmed.slice(3), checked: false, isHeader: true });
    } else if (trimmed.startsWith('- [x] ') || trimmed.startsWith('- [X] ')) {
      items.push({ text: trimmed.slice(6), checked: true });
    } else if (trimmed.startsWith('- [ ] ')) {
      items.push({ text: trimmed.slice(6), checked: false });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Card node ↔ Note document helpers
// ---------------------------------------------------------------------------

/** Map renderer data.type to displayHint for frontmatter. */
function typeToDisplayHint(type: string | undefined): string {
  if (type === 'text') {
    return 'note';
  }
  return type || 'note';
}

/** Map frontmatter displayHint back to renderer data.type. */
export function displayHintToType(hint?: string): string {
  if (hint === 'note') {
    return 'text';
  }
  return hint || 'text';
}

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 32;

/**
 * Normalize a free-form tags value into a clean string[]:
 * - Coerces to array (strings split on commas)
 * - Trims whitespace, drops empties
 * - Caps each tag at MAX_TAG_LENGTH chars
 * - Dedupes case-insensitively (keeping first occurrence)
 * - Caps total at MAX_TAGS entries
 */
export function sanitizeTags(input: unknown): string[] {
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

function normalizeOptionalNumber(
  data: Record<string, unknown>,
  key: string
): void {
  const value = data[key];
  if (value === undefined || typeof value === 'number') {
    return;
  }
  if (typeof value !== 'string') {
    delete data[key];
    return;
  }
  const numberValue = Number(value);
  if (Number.isFinite(numberValue)) {
    data[key] = numberValue;
  } else {
    delete data[key];
  }
}

/**
 * Extract content fields from a card node's data into frontmatter + body
 * suitable for writing to a .md file. Non-content fields (noteId, file) are excluded.
 */
export function cardDataToNote(
  noteId: string,
  data: Record<string, unknown>,
  existingFm?: Record<string, unknown>,
  existingBody = ''
): { frontmatter: Record<string, unknown>; body: string } {
  const now = new Date().toISOString();
  const frontmatter: Record<string, unknown> = {
    ...existingFm,
    id: noteId,
    title: data.title ?? existingFm?.title ?? '',
    displayHint:
      data.type === undefined
        ? (existingFm?.displayHint ?? 'note')
        : typeToDisplayHint(data.type as string | undefined),
    color: data.color ?? existingFm?.color ?? '',
    createdAt: existingFm?.createdAt ?? data.createdAt ?? now,
    updatedAt: now,
  };

  // Optional fields. Tag / tagColor / tags are not persisted here — they
  // live in the workspace-level node-metadata sidecar.
  if (data.pieData) {
    frontmatter.pieData = data.pieData;
  }

  // Body
  let body = existingBody;
  if (data.type === 'checklist' && Array.isArray(data.items)) {
    body = serializeChecklistItems(
      data.items as Array<{
        text?: string;
        checked?: boolean;
        isHeader?: boolean;
      }>
    );
  } else if (typeof data.content === 'string') {
    body = data.content;
  }

  return { frontmatter, body };
}

/**
 * Hydrate a card node's data from a loaded NoteDocument.
 * Merges frontmatter fields + parsed body back into a data object
 * that the renderer expects.
 */
export function noteToCardData(doc: NoteDocument): Record<string, unknown> {
  const { frontmatter, body, file } = doc;
  const {
    id,
    displayHint,
    // Legacy frontmatter tag fields are intentionally dropped here — they
    // are migrated into the node-metadata sidecar at workspace init time
    // (see migrateLegacyTagsFromNotes in workspace.ts) and never flow back
    // into the renderer's node.data blob.
    tag: _tag,
    tagColor: _tagColor,
    tags: _tags,
    ...rest
  } = frontmatter;
  const type = displayHintToType(displayHint);

  const data: Record<string, unknown> = {
    ...rest,
    type,
    file,
  };
  normalizeOptionalNumber(data, 'previewBlocks');
  normalizeOptionalNumber(data, 'previewVersion');

  if (type === 'checklist') {
    data.items = parseChecklistBody(body);
  } else {
    data.content = body;
  }

  return data;
}
