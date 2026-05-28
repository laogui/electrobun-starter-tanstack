import { createHash } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { isAbsolute, normalize, relative, resolve } from 'node:path';

import { parseFrontmatter } from './notes';
import { atomicWrite } from './workspace';

/** Schema version for the BlockNote JSON sidecar file. */
export const BLOCKNOTE_SCHEMA = 'ghostboard-blocknote/v1';

export interface BlockNoteSidecar {
  blocks: unknown[];
  noteId: string;
  revision: number;
  schema: string;
  updatedAt: string;
}

export interface BlockNoteSidecarLoadResult {
  blocks: unknown[];
  corrupted?: boolean;
  revision: number;
  updatedAt?: string;
}

/**
 * Resolve the sidecar JSON path for a noteId. We keep all sidecars under
 * `content/.ghostboard/blocknote/` so they travel with the workspace but do
 * not pollute the user-visible content/ listing.
 */
export function blocknoteSidecarRelativePath(noteId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(noteId)) {
    throw new Error('Invalid noteId for BlockNote sidecar path.');
  }
  return `content/.ghostboard/blocknote/${noteId}.json`;
}

function assertWorkspaceSidecarPath(
  wsPath: string,
  relativePath: string
): string {
  if (!relativePath.trim()) {
    throw new Error('BlockNote sidecar path is required.');
  }
  if (isAbsolute(relativePath)) {
    throw new Error('BlockNote sidecar path must be relative.');
  }
  const normalized = normalize(relativePath).replaceAll('\\', '/');
  if (
    !normalized.startsWith('content/.ghostboard/blocknote/') ||
    normalized.split('/').includes('..') ||
    !normalized.endsWith('.json')
  ) {
    throw new Error(
      'BlockNote sidecar path must stay inside content/.ghostboard/blocknote/.'
    );
  }
  const fullPath = resolve(wsPath, normalized);
  const root = resolve(wsPath, 'content', '.ghostboard', 'blocknote');
  const rel = relative(root, fullPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      'BlockNote sidecar path must stay inside content/.ghostboard/blocknote/.'
    );
  }
  return fullPath;
}

/** sha256 hex digest. */
export function contentHash(value: string): string {
  return `sha256-${createHash('sha256').update(value).digest('hex')}`;
}

/**
 * Load the BlockNote sidecar for a note. Returns `null` when the sidecar
 * does not exist yet (e.g. the note has only ever been edited as Markdown).
 */
export async function loadBlockNoteSidecar(
  wsPath: string,
  noteId: string
): Promise<BlockNoteSidecarLoadResult | null> {
  const relativePath = blocknoteSidecarRelativePath(noteId);
  const fullPath = assertWorkspaceSidecarPath(wsPath, relativePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return null;
  }
  try {
    const parsed = (await file.json()) as Partial<BlockNoteSidecar>;
    if (parsed.schema !== BLOCKNOTE_SCHEMA || !Array.isArray(parsed.blocks)) {
      return { blocks: [], revision: 0, corrupted: true };
    }
    return {
      blocks: parsed.blocks,
      revision: typeof parsed.revision === 'number' ? parsed.revision : 0,
      updatedAt:
        typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    return { blocks: [], revision: 0, corrupted: true };
  }
}

/** Atomically write the sidecar JSON. */
export async function saveBlockNoteSidecar(
  wsPath: string,
  noteId: string,
  payload: { blocks: unknown[]; revision: number; updatedAt?: string }
): Promise<{ relativePath: string; hash: string }> {
  const relativePath = blocknoteSidecarRelativePath(noteId);
  const fullPath = assertWorkspaceSidecarPath(wsPath, relativePath);
  const sidecar: BlockNoteSidecar = {
    schema: BLOCKNOTE_SCHEMA,
    noteId,
    revision: payload.revision,
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    blocks: payload.blocks,
  };
  const serialized = JSON.stringify(sidecar, null, 2);
  await atomicWrite(fullPath, serialized);
  return { relativePath, hash: contentHash(serialized) };
}

/** Delete the sidecar for a note. Returns true if a file was removed. */
export function deleteBlockNoteSidecar(
  wsPath: string,
  noteId: string
): boolean {
  const relativePath = blocknoteSidecarRelativePath(noteId);
  const fullPath = assertWorkspaceSidecarPath(wsPath, relativePath);
  if (!existsSync(fullPath)) {
    return false;
  }
  unlinkSync(fullPath);
  return true;
}

/**
 * Compute the hash of the markdown body inside a note file. If the file
 * does not exist we return null so callers can treat that as "no prior state".
 */
export async function readMarkdownBodyHash(
  wsPath: string,
  filePath: string
): Promise<string | null> {
  const fullPath = resolve(wsPath, filePath);
  if (!fullPath.startsWith(resolve(wsPath, 'content'))) {
    throw new Error('Note path must stay inside content/.');
  }
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return null;
  }
  const text = await file.text();
  const { body } = parseFrontmatter(text);
  return contentHash(body);
}

/**
 * Decide what happens when a note is loaded. Compares stored hashes against
 * the current Markdown body and sidecar revision.
 *
 * Returns:
 *   - 'use-sidecar': sidecar is the source of truth, markdown unchanged.
 *   - 'reimport-markdown': markdown was edited externally, re-import blocks.
 *   - 'conflict': both sidecar and markdown moved independently since last save.
 *   - 'recover-from-markdown': sidecar is missing/corrupted.
 */
export type ExternalChangeDecision =
  | 'use-sidecar'
  | 'reimport-markdown'
  | 'conflict'
  | 'recover-from-markdown';

export function detectExternalMarkdownChange(input: {
  sidecarExists: boolean;
  sidecarCorrupted?: boolean;
  storedMarkdownHash?: string;
  storedSidecarRevision?: number;
  sidecarRevision?: number;
  currentMarkdownHash: string;
}): ExternalChangeDecision {
  if (!input.sidecarExists || input.sidecarCorrupted) {
    return 'recover-from-markdown';
  }
  const markdownChanged =
    typeof input.storedMarkdownHash === 'string' &&
    input.storedMarkdownHash !== input.currentMarkdownHash;
  const sidecarChanged =
    typeof input.storedSidecarRevision === 'number' &&
    typeof input.sidecarRevision === 'number' &&
    input.storedSidecarRevision !== input.sidecarRevision;
  if (markdownChanged && sidecarChanged) {
    return 'conflict';
  }
  if (markdownChanged) {
    return 'reimport-markdown';
  }
  return 'use-sidecar';
}

export function blocknoteSidecarDir(wsPath: string): string {
  return resolve(wsPath, 'content', '.ghostboard', 'blocknote');
}
