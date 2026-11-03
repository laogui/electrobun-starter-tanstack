import { Utils } from 'electrobun/bun';
import {
  deleteBlockNoteSidecar,
  loadBlockNoteSidecar,
  saveBlockNoteSidecar,
} from '../../blocknote';
import { blocksToPlainText } from '../../blocknotePreview';
import { buildNoteIndex } from '../../noteStore';
import {
  createNote,
  deleteNoteFile,
  deriveMarkdownTitle,
  loadNote,
  parseFrontmatter,
  prepareImportedMarkdownBody,
  saveNote,
} from '../../notes';
import { withNoteWorkspace } from '../../noteTransactions';
import { pluginWorkspaceId } from '../../plugins/contentEvents';
import {
  buildNotePreviewFromBlocks,
  writeNoteWithPreview,
} from '../../preview';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createNotesHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'saveNote'
  | 'loadBlockNote'
  | 'saveBlockNote'
  | 'createNote'
  | 'deleteNote'
  | 'importMarkdownFiles'
> {
  const { wsPath } = ctx;
  return {
    saveNote: async ({ noteId, frontmatter, body }) =>
      withNoteWorkspace(wsPath, async () => {
        // Legacy markdown save path (checklist / plain-text cards). JSON
        // notes go through saveBlockNote; this only writes to an existing
        // `.md` and never creates one.
        const noteIndex = await buildNoteIndex(wsPath);
        const markdownFile = noteIndex.get(noteId)?.markdownFile;
        if (!markdownFile) {
          return { success: false };
        }
        const preview = await writeNoteWithPreview(
          wsPath,
          markdownFile,
          { ...frontmatter, updatedAt: new Date().toISOString() },
          body
        );
        return { success: true, preview };
      }),

    loadBlockNote: async ({ noteId, workspaceId }) => {
      const workspace = wsPath;
      const currentWorkspaceId = pluginWorkspaceId(workspace);
      if (workspaceId && workspaceId !== currentWorkspaceId) {
        return { success: false };
      }
      return withNoteWorkspace(workspace, async () => {
        // Sidecar JSON is the only source of truth — no Markdown reconcile.
        const sidecar = await loadBlockNoteSidecar(workspace, noteId);
        if (sidecar && !sidecar.corrupted) {
          return {
            success: true,
            blocks: sidecar.blocks,
            preview: buildNotePreviewFromBlocks(sidecar.blocks),
            text: blocksToPlainText(sidecar.blocks),
            workspaceId: currentWorkspaceId,
            revision: sidecar.revision,
            frontmatter: {
              id: noteId,
              title: sidecar.title ?? '',
              color: sidecar.color ?? '',
              displayHint: sidecar.displayHint ?? 'note',
              createdAt: sidecar.createdAt,
            },
          };
        }

        // No valid sidecar — offer a one-time import from a legacy `.md`.
        const noteIndex = await buildNoteIndex(workspace);
        const markdownFile = noteIndex.get(noteId)?.markdownFile;
        if (markdownFile) {
          const note = await loadNote(workspace, markdownFile);
          if (note) {
            return {
              success: true,
              workspaceId: currentWorkspaceId,
              blocks: undefined,
              markdown: note.body,
              frontmatter: note.frontmatter,
              revision: sidecar?.revision,
              recoveredFromMarkdown: true,
            };
          }
        }

        // Brand-new / empty note — start blank; first save creates a sidecar.
        return {
          success: true,
          workspaceId: currentWorkspaceId,
          blocks: [],
          revision: sidecar?.revision ?? 0,
        };
      });
    },

    saveBlockNote: async ({ noteId, frontmatter, blocks, revision }) =>
      withNoteWorkspace(wsPath, async () => {
        // JSON sidecar is the only thing written. No Markdown mirror, no
        // hashes (ADR 0002). Note metadata (title/color/createdAt) and the
        // derived preview live in the sidecar alongside the blocks.
        const existing = await loadBlockNoteSidecar(wsPath, noteId);
        if (
          existing?.corrupted ||
          (existing
            ? revision !== existing.revision
            : revision !== undefined && revision !== 0) ||
          (revision !== undefined &&
            (!Number.isSafeInteger(revision) ||
              revision < 0 ||
              revision >= Number.MAX_SAFE_INTEGER))
        ) {
          return {
            success: false,
            conflict: true,
            revision: existing?.revision ?? 0,
          };
        }
        const nextRevision =
          (typeof revision === 'number'
            ? revision
            : (existing?.revision ?? 0)) + 1;
        const now = new Date().toISOString();
        const preview = buildNotePreviewFromBlocks(blocks);
        const createdAt =
          existing?.createdAt ??
          (typeof frontmatter.createdAt === 'string'
            ? frontmatter.createdAt
            : now);

        const { relativePath: sidecarFile } = await saveBlockNoteSidecar(
          wsPath,
          noteId,
          {
            blocks,
            revision: nextRevision,
            createdAt,
            updatedAt: now,
            title:
              typeof frontmatter.title === 'string'
                ? frontmatter.title
                : (existing?.title ?? ''),
            displayHint:
              typeof frontmatter.displayHint === 'string'
                ? frontmatter.displayHint
                : (existing?.displayHint ?? 'note'),
            color:
              typeof frontmatter.color === 'string'
                ? frontmatter.color
                : (existing?.color ?? ''),
            preview,
          }
        );

        // Migration: retire any lingering legacy `.md` mirror once the note
        // is a v0.2 JSON record. This covers both brand-new notes (no
        // sidecar) AND mirror-era notes that already had a sidecar + `.md`
        // pair. A pre-v0.2 / mirror-era sidecar has no `preview` field, so
        // the check runs at most once per note — after this save the sidecar
        // carries a preview and later saves skip the index scan.
        const needsMirrorCleanup = !existing || existing.preview === undefined;
        if (needsMirrorCleanup) {
          const markdownFile = (await buildNoteIndex(wsPath)).get(
            noteId
          )?.markdownFile;
          if (markdownFile) {
            try {
              await deleteNoteFile(wsPath, markdownFile);
            } catch {
              // Best-effort; the sidecar is already the source of truth.
            }
          }
        }

        return {
          success: true,
          revision: nextRevision,
          preview,
          blocknoteFile: sidecarFile,
        };
      }).catch((error) => {
        console.warn('[persistence] Note save rejected:', error);
        return { success: false };
      }),

    createNote: async ({ id, title, displayHint }) => {
      const filePath = await createNote(wsPath, id, title, displayHint);
      return { noteId: id, file: filePath };
    },

    deleteNote: async ({ noteId }) =>
      withNoteWorkspace(wsPath, async () => {
        const noteIndex = await buildNoteIndex(wsPath);
        const location = noteIndex.get(noteId);

        let deleted = false;
        if (location?.markdownFile) {
          deleted = await deleteNoteFile(wsPath, location.markdownFile);
        }
        // Best-effort sidecar cleanup; ignore failures so we never block
        // deletion on a stale or read-only sidecar.
        try {
          if (await deleteBlockNoteSidecar(wsPath, noteId)) {
            deleted = true;
          }
        } catch {
          // ignore
        }
        return { success: deleted };
      }),

    importMarkdownFiles: async () => {
      const selected = await Utils.openFileDialog({
        allowedFileTypes: 'md',
        allowsMultipleSelection: true,
        canChooseDirectory: false,
        canChooseFiles: true,
        startingFolder: '~/Desktop',
      });
      const paths = selected.filter(Boolean);
      if (paths.length === 0) {
        return { canceled: true, failedCount: 0, notes: [] };
      }
      return withNoteWorkspace(wsPath, async () => {
        const importedNotes = await Promise.all(
          paths.map(async (path) => {
            try {
              const file = Bun.file(path);
              if (!(await file.exists())) {
                return null;
              }
              const raw = await file.text();
              const { frontmatter, body: rawBody } = parseFrontmatter(raw);
              const title = deriveMarkdownTitle(frontmatter, rawBody, path);
              const body = prepareImportedMarkdownBody(
                frontmatter,
                rawBody,
                path
              );
              const noteId = `note_${crypto.randomUUID().slice(0, 8)}`;
              const now = new Date().toISOString();
              const createdAt =
                typeof frontmatter.createdAt === 'string' &&
                frontmatter.createdAt.trim()
                  ? frontmatter.createdAt.trim()
                  : now;
              const filePath = await createNote(wsPath, noteId, title, 'text');
              await saveNote(
                wsPath,
                filePath,
                {
                  ...frontmatter,
                  id: noteId,
                  title,
                  displayHint: 'text',
                  createdAt,
                  updatedAt: now,
                },
                body
              );
              return { noteId, title, content: body };
            } catch (error) {
              console.warn(
                `[import] Failed to import markdown file ${path}:`,
                error
              );
              return null;
            }
          })
        );
        const notes: Array<{
          noteId: string;
          title: string;
          content?: string;
        }> = [];
        for (const note of importedNotes) {
          if (note) {
            notes.push(note);
          }
        }
        return { failedCount: paths.length - notes.length, notes };
      });
    },
  };
}
