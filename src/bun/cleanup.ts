import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { Utils } from 'electrobun/bun';

import { blocknoteSidecarDir } from './blocknote';
import { loadManifest, type ManifestNode } from './manifest';
import { listFilesRecursiveAsync, parseFrontmatter } from './notes';
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
const SIDECAR_PATH_RE =
  /^content\/\.ghostboard\/blocknote\/[A-Za-z0-9_-]+\.json$/;
const JSON_EXT_RE = /\.json$/;

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
  const manifests = await Promise.all(
    manifestFiles.map(async (file) => {
      try {
        return await loadManifest(wsPath, file);
      } catch (error) {
        console.warn(`[cleanup] Failed to load manifest ${file}:`, error);
        return null;
      }
    })
  );
  for (const manifest of manifests) {
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

  for (const rel of await listFilesRecursiveAsync(contentDir)) {
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
      const s = await stat(fullPath);
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

  // Orphaned BlockNote sidecars (JSON notes whose card was removed from every
  // view). Notes already surfaced via a legacy `.md` are skipped to avoid
  // double-listing during migration.
  const seenNoteIds = new Set<string>();
  for (const entry of entries) {
    if (entry.noteId) {
      seenNoteIds.add(entry.noteId);
    }
  }
  const sidecarDir = blocknoteSidecarDir(wsPath);
  const sidecarEntries = await Promise.all(
    (await listFilesRecursiveAsync(sidecarDir)).map(async (rel) => {
      if (!rel.endsWith('.json') || rel.includes('/')) {
        return null;
      }
      const noteId = rel.replace(JSON_EXT_RE, '');
      if (referenced.has(noteId) || seenNoteIds.has(noteId)) {
        return null;
      }
      const fullPath = join(sidecarDir, rel);
      const [parsed, stats] = await Promise.all([
        Bun.file(fullPath)
          .json()
          .catch(() => null) as Promise<{ title?: unknown } | null>,
        stat(fullPath).catch(() => null),
      ]);
      return {
        file: `content/.ghostboard/blocknote/${rel}`,
        hasFrontmatterId: true,
        modifiedAt: stats?.mtimeMs ?? 0,
        noteId,
        size: stats?.size ?? 0,
        title: typeof parsed?.title === 'string' ? parsed.title : '',
      };
    })
  );
  for (const entry of sidecarEntries) {
    if (entry) {
      entries.push(entry);
    }
  }

  entries.sort((a, b) => a.file.localeCompare(b.file));
  return entries;
}

/**
 * Resolve the noteId backing a cleanup target so deletion can re-validate it
 * against the live reference set. Markdown reads its frontmatter id; sidecars
 * derive the id from the filename.
 */
async function noteIdForCleanupPath(
  fullPath: string,
  rel: string
): Promise<string | null> {
  if (SIDECAR_PATH_RE.test(rel)) {
    return rel.split('/').pop()?.replace(JSON_EXT_RE, '') ?? null;
  }
  try {
    const text = await Bun.file(fullPath).text();
    const { frontmatter } = parseFrontmatter(text);
    return typeof frontmatter.id === 'string' && frontmatter.id
      ? frontmatter.id
      : null;
  } catch {
    return null;
  }
}

/**
 * Move the listed unlinked files to the system Trash via Electrobun's
 * `Utils.moveToTrash`. Re-validates against the current reference set so
 * files that became referenced after a stale scan are not touched. Paths
 * must be a `content/*.md` note or a `content/.ghostboard/blocknote/*.json`
 * sidecar.
 */
export async function deleteUnlinkedNotes(
  wsPath: string,
  files: string[]
): Promise<DeleteUnlinkedResult> {
  const referenced = await collectReferencedIds(wsPath);
  const deleted: string[] = [];
  const skipped: string[] = [];

  const results = await Promise.all(
    files.map(async (rel) => {
      const isAllowed = CONTENT_PATH_RE.test(rel) || SIDECAR_PATH_RE.test(rel);
      if (!isAllowed || rel.includes('..')) {
        return { rel, status: 'skipped' as const };
      }
      const fullPath = join(wsPath, rel);
      if (!existsSync(fullPath)) {
        return { rel, status: 'skipped' as const };
      }
      const noteId = await noteIdForCleanupPath(fullPath, rel);
      if (noteId && referenced.has(noteId)) {
        return { rel, status: 'skipped' as const };
      }
      try {
        const ok = Utils.moveToTrash(fullPath);
        return {
          rel,
          status: ok ? ('deleted' as const) : ('skipped' as const),
        };
      } catch (error) {
        console.warn(`[cleanup] Failed to move ${rel} to Trash:`, error);
        return { rel, status: 'skipped' as const };
      }
    })
  );
  for (const result of results) {
    if (result.status === 'deleted') {
      deleted.push(result.rel);
    } else {
      skipped.push(result.rel);
    }
  }

  return { deleted, skipped };
}
