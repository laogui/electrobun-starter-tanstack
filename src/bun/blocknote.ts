import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

import { atomicWrite } from './atomicWrite';
import { notifyNoteChanged } from './contentEvents';
import { withNoteWorkspace } from './noteTransactions';
import { resolveWorkspaceSubpath } from './workspacePaths';

/** Schema version for the BlockNote JSON sidecar file. */
export const BLOCKNOTE_SCHEMA = 'ghostboard-blocknote/v1';

const NOTE_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * True when `noteId` is safe to use as a sidecar filename (no spaces, slashes,
 * or traversal). Lets callers probe the sidecar store without risking a throw
 * from {@link blocknoteSidecarRelativePath} on hand-edited / imported ids.
 */
export function isValidSidecarNoteId(noteId: string): boolean {
  return NOTE_ID_RE.test(noteId);
}

/** Card preview cached inside the note sidecar (derived from blocks). */
export interface SidecarPreview {
  blocks: number;
  excerpt: string;
  html: string;
  version: number;
}

/**
 * BlockNote sidecar = the note record source of truth (ADR 0002 / v0.2 A7).
 * Besides the editor `blocks`, it carries the note's own properties (title,
 * color, displayHint, timestamps) and a derived card preview. Tag metadata
 * lives in `node-metadata.json`; layout lives in the canvas manifest.
 */
export interface BlockNoteSidecar {
  blocks: unknown[];
  color?: string;
  createdAt?: string;
  displayHint?: string;
  noteId: string;
  preview?: SidecarPreview;
  revision: number;
  schema: string;
  title?: string;
  updatedAt: string;
}

export interface BlockNoteSidecarLoadResult {
  blocks: unknown[];
  color?: string;
  corrupted?: boolean;
  createdAt?: string;
  displayHint?: string;
  preview?: SidecarPreview;
  revision: number;
  title?: string;
  updatedAt?: string;
}

/**
 * Resolve the sidecar JSON path for a noteId. We keep all sidecars under
 * `content/.ghostboard/blocknote/` so they travel with the workspace but do
 * not pollute the user-visible content/ listing.
 */
export function blocknoteSidecarRelativePath(noteId: string): string {
  if (!NOTE_ID_RE.test(noteId)) {
    throw new Error('Invalid noteId for BlockNote sidecar path.');
  }
  return `content/.ghostboard/blocknote/${noteId}.json`;
}

function assertWorkspaceSidecarPath(
  wsPath: string,
  relativePath: string
): string {
  return resolveWorkspaceSubpath(wsPath, relativePath, {
    dir: 'content/.ghostboard/blocknote',
    extension: '.json',
    label: 'BlockNote sidecar',
  }).fullPath;
}

/** sha256 hex digest. */
function contentHash(value: string): string {
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
  return withNoteWorkspace(wsPath, () => loadSidecarUnlocked(wsPath, noteId));
}

async function loadSidecarUnlocked(
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
    const asStr = (value: unknown): string | undefined =>
      typeof value === 'string' ? value : undefined;
    return {
      blocks: parsed.blocks,
      revision: typeof parsed.revision === 'number' ? parsed.revision : 0,
      updatedAt: asStr(parsed.updatedAt),
      createdAt: asStr(parsed.createdAt),
      title: asStr(parsed.title),
      displayHint: asStr(parsed.displayHint),
      color: asStr(parsed.color),
      preview:
        parsed.preview && typeof parsed.preview === 'object'
          ? (parsed.preview as SidecarPreview)
          : undefined,
    };
  } catch {
    return { blocks: [], revision: 0, corrupted: true };
  }
}

/** Atomically write the sidecar JSON (the full note record). */
export async function saveBlockNoteSidecar(
  wsPath: string,
  noteId: string,
  payload: {
    blocks: unknown[];
    revision: number;
    updatedAt?: string;
    createdAt?: string;
    title?: string;
    displayHint?: string;
    color?: string;
    preview?: SidecarPreview;
  }
): Promise<{ relativePath: string; hash: string }> {
  return withNoteWorkspace(wsPath, async () => {
    const before = await loadSidecarUnlocked(wsPath, noteId);
    const relativePath = blocknoteSidecarRelativePath(noteId);
    const fullPath = assertWorkspaceSidecarPath(wsPath, relativePath);
    const sidecar: BlockNoteSidecar = {
      schema: BLOCKNOTE_SCHEMA,
      noteId,
      revision: payload.revision,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
      title: payload.title,
      displayHint: payload.displayHint,
      color: payload.color,
      preview: payload.preview,
      blocks: payload.blocks,
    };
    const serialized = JSON.stringify(sidecar, null, 2);
    await atomicWrite(fullPath, serialized);
    if (before && !before.corrupted) {
      notifyNoteChanged(wsPath, {
        id: noteId,
        before: {
          title: before.title ?? '',
          color: before.color ?? '',
          revision: before.revision,
        },
        after: {
          title: sidecar.title ?? '',
          color: sidecar.color ?? '',
          revision: sidecar.revision,
        },
        metadataOnly:
          JSON.stringify(before.blocks) === JSON.stringify(sidecar.blocks),
      });
    }
    return { relativePath, hash: contentHash(serialized) };
  });
}

/**
 * Returns true when a BlockNote sidecar currently exists for the note. Used by
 * `saveManifest` to decide whether a card is already a JSON-backed note (in
 * which case its `.md` body must not be rewritten) or a legacy markdown card.
 */
export async function blocknoteSidecarExists(
  wsPath: string,
  noteId: string
): Promise<boolean> {
  const relativePath = blocknoteSidecarRelativePath(noteId);
  const fullPath = assertWorkspaceSidecarPath(wsPath, relativePath);
  return await Bun.file(fullPath).exists();
}

/** Delete the sidecar for a note. Returns true if a file was removed. */
export async function deleteBlockNoteSidecar(
  wsPath: string,
  noteId: string
): Promise<boolean> {
  return withNoteWorkspace(wsPath, async () => {
    const relativePath = blocknoteSidecarRelativePath(noteId);
    const fullPath = assertWorkspaceSidecarPath(wsPath, relativePath);
    if (!existsSync(fullPath)) {
      return false;
    }
    await unlink(fullPath);
    return true;
  });
}

export function blocknoteSidecarDir(wsPath: string): string {
  return resolve(wsPath, 'content', '.ghostboard', 'blocknote');
}
