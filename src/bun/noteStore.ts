import { join } from 'node:path';
import {
  blocknoteSidecarDir,
  isValidSidecarNoteId,
  loadBlockNoteSidecar,
  type SidecarPreview,
  saveBlockNoteSidecar,
} from './blocknote';
import {
  displayHintToType,
  listFilesRecursiveAsync,
  loadNote,
  type NoteDocument,
  type NoteFrontmatter,
  noteToCardData,
  parseFrontmatter,
} from './notes';
import { NoteTransactionError, withNoteWorkspace } from './noteTransactions';

/**
 * Note store — the single read abstraction over note records.
 *
 * Source of truth is the BlockNote sidecar JSON
 * (`content/.ghostboard/blocknote/<noteId>.json`). Legacy `content/<note>.md`
 * files are still discovered and read for migration / import, but are never
 * written by the save path (ADR 0002). A note that has a sidecar is fully
 * JSON-backed; a note that only has a `.md` is a legacy record awaiting a
 * one-time import on its next focused-view edit.
 */

const NOTE_ID_RE = /^[A-Za-z0-9_-]+$/;
const JSON_EXT_RE = /\.json$/;

/** Where a note's record currently lives. */
export interface NoteLocation {
  hasSidecar: boolean;
  /** Workspace-relative `.md` path, when a legacy markdown file exists. */
  markdownFile?: string;
  noteId: string;
}

/** A resolved note record from whichever backing store holds it. */
export interface NoteRecord {
  blocks: unknown[] | null;
  color: string;
  corrupted: boolean;
  createdAt?: string;
  displayHint: string;
  /** Legacy markdown document (present only for `source: 'markdown'`). */
  markdownDoc?: NoteDocument;
  markdownFile?: string;
  noteId: string;
  preview: SidecarPreview | null;
  revision: number;
  source: 'sidecar' | 'markdown';
  title: string;
  updatedAt?: string;
}

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/**
 * Build an index of every note in the workspace keyed by noteId. Sidecars are
 * authoritative; legacy `.md` files contribute a `markdownFile` (and seed the
 * entry when no sidecar exists yet).
 */
export async function buildNoteIndex(
  wsPath: string
): Promise<Map<string, NoteLocation>> {
  const index = new Map<string, NoteLocation>();

  // 1) Sidecars (JSON note records). The noteId is the file basename.
  const sidecarDir = blocknoteSidecarDir(wsPath);
  for (const rel of await listFilesRecursiveAsync(sidecarDir)) {
    if (!rel.endsWith('.json')) {
      continue;
    }
    const noteId = rel.replace(JSON_EXT_RE, '');
    // react-doctor-disable-next-line react-doctor/js-set-map-lookups
    if (!noteId.includes('/') && NOTE_ID_RE.test(noteId)) {
      index.set(noteId, { noteId, hasSidecar: true });
    }
  }

  // 2) Legacy markdown files. Skip the sidecar dir (only scan `.md`).
  const contentDir = join(wsPath, 'content');
  for (const rel of await listFilesRecursiveAsync(contentDir)) {
    if (!rel.endsWith('.md')) {
      continue;
    }
    let text = '';
    try {
      text = await Bun.file(join(contentDir, rel)).text();
    } catch {
      continue;
    }
    const { frontmatter } = parseFrontmatter(text);
    const id = asString(frontmatter.id);
    if (!id) {
      continue;
    }
    const markdownFile = `content/${rel}`;
    const existing = index.get(id);
    if (existing) {
      existing.markdownFile = markdownFile;
    } else {
      index.set(id, { noteId: id, hasSidecar: false, markdownFile });
    }
  }

  return index;
}

const previewFromFrontmatter = (
  fm: Record<string, unknown>
): SidecarPreview | null => {
  const html = asString(fm.previewHtml);
  const excerpt = asString(fm.previewExcerpt);
  if (!(html || excerpt)) {
    return null;
  }
  return {
    html,
    excerpt,
    blocks: typeof fm.previewBlocks === 'number' ? fm.previewBlocks : 0,
    version: typeof fm.previewVersion === 'number' ? fm.previewVersion : 0,
  };
};

/**
 * Load a single note record. Prefers the JSON sidecar; falls back to a legacy
 * `.md` when the sidecar is missing or corrupted. `markdownFile` is an optional
 * hint (e.g. the manifest node's `data.file`) used for the legacy fallback.
 */
export async function loadNoteRecord(
  wsPath: string,
  noteId: string,
  markdownFile?: string
): Promise<NoteRecord | null> {
  // Only probe the sidecar store for ids that are valid sidecar filenames.
  // A legacy `.md` with a hand-edited / imported id (e.g. `my note`, `a/b`)
  // must not throw — it falls through to the markdown fallback below so a
  // single bad note can't break listNoteRecords / search / export.
  const sidecar = isValidSidecarNoteId(noteId)
    ? await loadBlockNoteSidecar(wsPath, noteId)
    : null;
  if (sidecar && !sidecar.corrupted) {
    return {
      noteId,
      source: 'sidecar',
      title: sidecar.title ?? '',
      displayHint: sidecar.displayHint ?? 'note',
      color: sidecar.color ?? '',
      createdAt: sidecar.createdAt,
      updatedAt: sidecar.updatedAt,
      revision: sidecar.revision,
      blocks: sidecar.blocks,
      preview: sidecar.preview ?? null,
      corrupted: false,
      markdownFile,
    };
  }

  if (markdownFile) {
    const doc = await loadNote(wsPath, markdownFile);
    if (doc) {
      const fm = doc.frontmatter;
      return {
        noteId,
        source: 'markdown',
        title: asString(fm.title),
        displayHint: asString(fm.displayHint) || 'note',
        color: asString(fm.color),
        createdAt: asString(fm.createdAt) || undefined,
        updatedAt: asString(fm.updatedAt) || undefined,
        revision:
          typeof fm.blocknoteRevision === 'number' ? fm.blocknoteRevision : 0,
        blocks: null,
        preview: previewFromFrontmatter(fm),
        corrupted: Boolean(sidecar?.corrupted),
        markdownDoc: doc,
        markdownFile,
      };
    }
  }

  // Sidecar corrupted with no markdown fallback — surface it so callers can
  // decide (e.g. offer recovery) rather than silently dropping the note.
  if (sidecar?.corrupted) {
    return {
      noteId,
      source: 'sidecar',
      title: '',
      displayHint: 'note',
      color: '',
      revision: sidecar.revision,
      blocks: [],
      preview: null,
      corrupted: true,
      markdownFile,
    };
  }

  return null;
}

/**
 * Project a note record into the renderer's card `data` shape used by
 * `loadCanvas`. Sidecar records expose their cached preview directly; legacy
 * markdown records reuse the existing `noteToCardData` hydration.
 */
export function noteRecordToCardData(
  record: NoteRecord
): Record<string, unknown> {
  if (record.source === 'markdown' && record.markdownDoc) {
    return noteToCardData(record.markdownDoc);
  }
  const data: Record<string, unknown> = {
    type: displayHintToType(record.displayHint),
    title: record.title,
    color: record.color,
    editor: 'blocknote',
    blocknoteRevision: record.revision,
  };
  if (record.createdAt) {
    data.createdAt = record.createdAt;
  }
  if (record.updatedAt) {
    data.updatedAt = record.updatedAt;
  }
  if (record.preview) {
    data.previewHtml = record.preview.html;
    data.previewExcerpt = record.preview.excerpt;
    data.previewBlocks = record.preview.blocks;
    data.previewVersion = record.preview.version;
  }
  return data;
}

/** Merge metadata under the same revision discipline as editor writes. */
export async function mergeNoteMeta(
  wsPath: string,
  noteId: string,
  patch: { title?: string; color?: string; expectedRevision?: number }
): Promise<boolean> {
  return withNoteWorkspace(wsPath, async () => {
    const sidecar = await loadBlockNoteSidecar(wsPath, noteId);
    if (!sidecar || sidecar.corrupted) {
      return false;
    }
    const currentTitle = sidecar.title ?? '';
    const currentColor = sidecar.color ?? '';
    const nextTitle = patch.title ?? currentTitle;
    const nextColor = patch.color ?? currentColor;
    if (currentTitle === nextTitle && currentColor === nextColor) {
      return false;
    }
    if (
      patch.expectedRevision !== sidecar.revision ||
      !Number.isSafeInteger(sidecar.revision) ||
      sidecar.revision >= Number.MAX_SAFE_INTEGER
    ) {
      throw new NoteTransactionError(
        'revision-conflict',
        `Stale manifest metadata for ${noteId}`,
        [noteId]
      );
    }
    await saveBlockNoteSidecar(wsPath, noteId, {
      blocks: sidecar.blocks,
      revision: sidecar.revision + 1,
      createdAt: sidecar.createdAt,
      updatedAt: new Date().toISOString(),
      title: nextTitle,
      displayHint: sidecar.displayHint,
      color: nextColor,
      preview: sidecar.preview ?? undefined,
    });
    return true;
  });
}

/**
 * Historical title-batch adapter. The public content service uses recoverable
 * transactions rather than this legacy revision-restoring interface.
 */
export async function applyNoteTitle(
  wsPath: string,
  noteId: string,
  input: { revision: number; title: string }
): Promise<void> {
  const sidecar = await loadBlockNoteSidecar(wsPath, noteId);
  if (!sidecar || sidecar.corrupted) {
    throw new Error(`note sidecar missing or corrupted: ${noteId}`);
  }
  await saveBlockNoteSidecar(wsPath, noteId, {
    blocks: sidecar.blocks,
    revision: input.revision,
    createdAt: sidecar.createdAt,
    updatedAt: new Date().toISOString(),
    title: input.title,
    displayHint: sidecar.displayHint,
    color: sidecar.color,
    preview: sidecar.preview ?? undefined,
  });
}

/** Enumerate every note record in the workspace (sidecars + legacy md). */
export async function listNoteRecords(wsPath: string): Promise<NoteRecord[]> {
  const index = await buildNoteIndex(wsPath);
  const loadedRecords = await Promise.all(
    Array.from(index, ([noteId, location]) =>
      loadNoteRecord(wsPath, noteId, location.markdownFile)
    )
  );
  const records: NoteRecord[] = [];
  for (const record of loadedRecords) {
    if (record) {
      records.push(record);
    }
  }
  return records;
}

export type { NoteDocument, NoteFrontmatter };
