import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Utils } from 'electrobun/bun';

import { loadManifest, type ManifestNode } from './manifest';
import { listFilesRecursive, parseFrontmatter } from './notes';
import { loadWorkspaceConfig } from './workspace';

export interface UnlinkedFileEntry {
  file: string; // workspace-relative path, e.g. 'content/foo-abcd.md'
  hasFrontmatterId: boolean;
  modifiedAt: number;
  noteId: string | null;
  size: number;
  title: string;
}

export interface DeleteUnlinkedResult {
  deleted: string[];
  skipped: string[];
}

const CONTENT_PATH_RE = /^content\/[^/][^\\]*\.md$/;

function collectNoteIdsFromNode(node: ManifestNode, out: Set<string>): void {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const noteId = data.noteId;
  if (typeof noteId === 'string' && noteId) {
    out.add(noteId);
  }
  const children = data.children;
  if (!Array.isArray(children)) {
    return;
  }
  for (const child of children) {
    if (!child || typeof child !== 'object') {
      continue;
    }
    const c = child as Record<string, unknown>;
    const cid = c.noteId;
    if (typeof cid === 'string' && cid) {
      out.add(cid);
    }
    const cdata = c.data as Record<string, unknown> | undefined;
    const cdataId = cdata?.noteId;
    if (typeof cdataId === 'string' && cdataId) {
      out.add(cdataId);
    }
  }
}

async function collectReferencedIds(wsPath: string): Promise<Set<string>> {
  const config = await loadWorkspaceConfig(wsPath);
  const ids = new Set<string>();
  const manifestFiles: string[] = [];
  for (const view of config.views) {
    manifestFiles.push(view.file);
  }
  for (const entry of config.trash ?? []) {
    manifestFiles.push(entry.trashFile);
  }
  for (const file of manifestFiles) {
    let manifest: Awaited<ReturnType<typeof loadManifest>> = null;
    try {
      manifest = await loadManifest(wsPath, file);
    } catch (error) {
      console.warn(`[cleanup] Failed to load manifest ${file}:`, error);
      continue;
    }
    if (!manifest) {
      continue;
    }
    for (const node of manifest.nodes) {
      collectNoteIdsFromNode(node, ids);
    }
  }
  return ids;
}

/** Scan content/ for .md files not referenced by any active or trashed view. */
export async function scanUnlinkedNotes(
  wsPath: string
): Promise<UnlinkedFileEntry[]> {
  const referenced = await collectReferencedIds(wsPath);
  const contentDir = join(wsPath, 'content');
  const entries: UnlinkedFileEntry[] = [];

  for (const rel of listFilesRecursive(contentDir)) {
    if (!rel.endsWith('.md')) {
      continue;
    }
    const fullPath = join(contentDir, rel);
    let text = '';
    try {
      text = await Bun.file(fullPath).text();
    } catch (error) {
      console.warn(`[cleanup] Failed to read ${rel}:`, error);
      continue;
    }
    const { frontmatter } = parseFrontmatter(text);
    const noteId =
      typeof frontmatter.id === 'string' && frontmatter.id
        ? frontmatter.id
        : null;
    if (noteId && referenced.has(noteId)) {
      continue;
    }
    const title =
      typeof frontmatter.title === 'string' ? frontmatter.title : '';
    let size = 0;
    let modifiedAt = 0;
    try {
      const s = statSync(fullPath);
      size = s.size;
      modifiedAt = s.mtimeMs;
    } catch {
      // ignore — leave as 0
    }
    entries.push({
      file: `content/${rel}`,
      hasFrontmatterId: noteId !== null,
      modifiedAt,
      noteId,
      size,
      title,
    });
  }

  entries.sort((a, b) => a.file.localeCompare(b.file));
  return entries;
}

/**
 * Move the listed unlinked files to the system Trash via Electrobun's
 * `Utils.moveToTrash`. Re-validates against the current reference set so
 * files that became referenced after a stale scan are not touched. Paths
 * must live under `content/` and end in `.md`.
 */
export async function deleteUnlinkedNotes(
  wsPath: string,
  files: string[]
): Promise<DeleteUnlinkedResult> {
  const referenced = await collectReferencedIds(wsPath);
  const deleted: string[] = [];
  const skipped: string[] = [];

  for (const rel of files) {
    if (!CONTENT_PATH_RE.test(rel) || rel.includes('..')) {
      skipped.push(rel);
      continue;
    }
    const fullPath = join(wsPath, rel);
    if (!existsSync(fullPath)) {
      skipped.push(rel);
      continue;
    }
    try {
      const text = await Bun.file(fullPath).text();
      const { frontmatter } = parseFrontmatter(text);
      const noteId =
        typeof frontmatter.id === 'string' && frontmatter.id
          ? frontmatter.id
          : null;
      if (noteId && referenced.has(noteId)) {
        skipped.push(rel);
        continue;
      }
    } catch {
      // Read failures fall through to the moveToTrash attempt below.
    }
    try {
      const ok = Utils.moveToTrash(fullPath);
      if (ok) {
        deleted.push(rel);
      } else {
        skipped.push(rel);
      }
    } catch (error) {
      console.warn(`[cleanup] Failed to move ${rel} to Trash:`, error);
      skipped.push(rel);
    }
  }

  return { deleted, skipped };
}
