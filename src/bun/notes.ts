import { existsSync, readdirSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

import { atomicWrite } from './workspace';

export interface NoteFrontmatter {
  color?: string;
  createdAt?: string;
  displayHint?: string;
  id: string;
  previewBlocks?: number;
  previewExcerpt?: string;
  previewHtml?: string;
  previewVersion?: number;
  tag?: string;
  tagColor?: string;
  tags?: string[];
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

function normalizeManifestPath(filePath: string): string {
  return normalize(filePath).replaceAll('\\', '/');
}

function assertWorkspaceNotePath(
  wsPath: string,
  filePath: string
): { fullPath: string; relativePath: string } {
  if (!filePath.trim()) {
    throw new Error('Note path is required.');
  }
  if (isAbsolute(filePath)) {
    throw new Error('Note path must be relative.');
  }

  const relativePath = normalizeManifestPath(filePath);
  if (
    relativePath === 'content' ||
    !relativePath.startsWith('content/') ||
    relativePath.split('/').includes('..') ||
    !relativePath.endsWith('.md')
  ) {
    throw new Error('Note path must stay inside content/.');
  }

  const contentRoot = resolve(wsPath, 'content');
  const fullPath = resolve(wsPath, relativePath);
  const rootRelative = relative(contentRoot, fullPath);
  if (rootRelative.startsWith('..') || isAbsolute(rootRelative)) {
    throw new Error('Note path must stay inside content/.');
  }

  return { fullPath, relativePath };
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

/** Build a noteId → file path index from the content directory. */
export async function buildNoteIndex(
  wsPath: string
): Promise<Map<string, string>> {
  const contentDir = join(wsPath, 'content');
  const index = new Map<string, string>();

  for (const relPath of listFilesRecursive(contentDir)) {
    if (!relPath.endsWith('.md')) {
      continue;
    }
    const fullPath = join(contentDir, relPath);
    const file = Bun.file(fullPath);
    const text = await file.text();
    const { frontmatter } = parseFrontmatter(text);
    if (frontmatter.id && typeof frontmatter.id === 'string') {
      index.set(frontmatter.id, `content/${relPath}`);
    }
  }
  return index;
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
  const { fullPath } = assertWorkspaceNotePath(wsPath, filePath);
  const content = `---\n${serializeFrontmatter(frontmatter)}\n---\n${body}`;
  await atomicWrite(fullPath, content);
}

/** Create a new note file. Returns the workspace-relative file path. */
export async function createNote(
  wsPath: string,
  noteId: string,
  title: string,
  displayHint: string
): Promise<string> {
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
}

/** Delete a note file. Uses Bun.file to check existence. */
export async function deleteNoteFile(
  wsPath: string,
  filePath: string
): Promise<boolean> {
  const { fullPath } = assertWorkspaceNotePath(wsPath, filePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return false;
  }
  const { unlinkSync } = await import('node:fs');
  unlinkSync(fullPath);
  return true;
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
  existingFm?: Record<string, unknown>
): { frontmatter: Record<string, unknown>; body: string } {
  const now = new Date().toISOString();
  const frontmatter: Record<string, unknown> = {
    id: noteId,
    title: data.title ?? '',
    displayHint: typeToDisplayHint(data.type as string | undefined),
    color: data.color ?? '',
    createdAt: existingFm?.createdAt ?? data.createdAt ?? now,
    updatedAt: now,
  };

  // Optional fields
  if (data.tag) {
    frontmatter.tag = data.tag;
  }
  if (data.tagColor) {
    frontmatter.tagColor = data.tagColor;
  }
  if (data.pieData) {
    frontmatter.pieData = data.pieData;
  }

  // Body
  let body = '';
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
  const { id, displayHint, ...rest } = frontmatter;
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
