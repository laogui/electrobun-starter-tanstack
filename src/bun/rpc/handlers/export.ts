import { join, resolve } from 'node:path';
import {
  buildChecklistWidgetMarkdown,
  collectViewExportRefs,
  copyExportAttachments,
  createMarkdownExportDirectory,
  exportWorkspaceArchiveImpl,
  PNG_DATA_URL_RE,
  pickExportFolder,
  resolveExportPath,
  safeExportFileName,
} from '../../exportHelpers';
import { loadManifest } from '../../manifest';
import {
  buildIndexMarkdown,
  buildNoteMarkdown,
  type ExportedNote,
} from '../../markdownExport';
import {
  buildNoteIndex,
  listNoteRecords,
  loadNoteRecord,
} from '../../noteStore';
import { loadWidgets } from '../../widgets';
import { loadWorkspaceConfig } from '../../workspace';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createExportHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'exportPng'
  | 'exportJson'
  | 'exportTopicOutline'
  | 'exportNoteMarkdown'
  | 'exportNotesMarkdown'
  | 'exportWorkspaceArchive'
> {
  const { wsPath } = ctx;
  return {
    exportPng: async ({ dataUrl, fileName }) => {
      const match = PNG_DATA_URL_RE.exec(dataUrl);
      if (!match) {
        throw new Error('Invalid PNG data URL');
      }

      const selectedFolder = await pickExportFolder();
      if (!selectedFolder) {
        return { canceled: true, success: false };
      }

      const safeFileName = safeExportFileName(fileName, 'png');
      const outputPath = resolveExportPath(selectedFolder, safeFileName);
      const buffer = Buffer.from(match[1]!, 'base64');
      await Bun.write(outputPath, new Uint8Array(buffer));

      return { filePath: outputPath, success: true };
    },

    exportJson: async ({ json, fileName }) => {
      const selectedFolder = await pickExportFolder();
      if (!selectedFolder) {
        return { canceled: true, success: false };
      }

      const safeFileName = safeExportFileName(fileName, 'json');
      const outputPath = resolveExportPath(selectedFolder, safeFileName);
      await Bun.write(outputPath, json);

      return { filePath: outputPath, success: true };
    },

    exportTopicOutline: async ({ fileName, markdown }) => {
      // An empty outline means there was nothing to export; writing a
      // blank file would look like a successful but broken export.
      if (!markdown.trim()) {
        return { success: false };
      }
      const selectedFolder = await pickExportFolder();
      if (!selectedFolder) {
        return { canceled: true, success: false };
      }

      const safeFileName = safeExportFileName(fileName, 'md');
      const outputPath = resolveExportPath(selectedFolder, safeFileName);
      await Bun.write(outputPath, markdown);

      return { filePath: outputPath, success: true };
    },

    exportNoteMarkdown: async ({ noteId, includeFrontmatter }) => {
      const noteIndex = await buildNoteIndex(wsPath);
      const record = await loadNoteRecord(
        wsPath,
        noteId,
        noteIndex.get(noteId)?.markdownFile
      );
      // A corrupted sidecar with no markdown fallback would serialise to an
      // empty file — refuse rather than silently "export" empty content.
      if (!record || record.corrupted) {
        return { success: false };
      }
      const exported = buildNoteMarkdown(record, {
        includeFrontmatter,
        attachmentLinkPrefix: 'attachments/',
        exportedAt: new Date().toISOString(),
      });

      const folder = await pickExportFolder();
      if (!folder) {
        return { canceled: true, success: false };
      }

      const outputPath = resolveExportPath(folder, exported.fileName);
      await Bun.write(outputPath, exported.markdown);
      if (exported.attachments.length > 0) {
        await copyExportAttachments(
          wsPath,
          exported.attachments,
          resolve(folder, 'attachments')
        );
      }
      return { filePath: outputPath, success: true };
    },

    exportNotesMarkdown: async ({
      scope,
      viewId,
      noteIds,
      includeFrontmatter,
    }) => {
      // Resolve the set of notes to export based on the requested scope.
      let ids: string[] = [];
      let widgetIds: string[] = [];
      let source = 'All notes';
      if (scope === 'selected') {
        ids = Array.isArray(noteIds) ? noteIds : [];
        source = `${ids.length} selected note(s)`;
      } else if (scope === 'view') {
        if (!viewId) {
          return { success: false, exported: 0, failed: 0 };
        }
        const config = await loadWorkspaceConfig(wsPath);
        const view = config.views.find((v) => v.id === viewId);
        if (view) {
          const refs = collectViewExportRefs(
            await loadManifest(wsPath, view.file)
          );
          ids = refs.noteIds;
          widgetIds = refs.widgetIds;
          source = `Canvas: ${view.name}`;
        } else {
          return { success: false, exported: 0, failed: 0 };
        }
      } else if (scope === 'all') {
        const records = await listNoteRecords(wsPath);
        ids = records.map((record) => record.noteId);
      } else {
        return { success: false, exported: 0, failed: 0 };
      }
      ids = [...new Set(ids)];
      if (ids.length === 0 && widgetIds.length === 0) {
        return { success: false, exported: 0, failed: 0 };
      }

      const folder = await pickExportFolder();
      if (!folder) {
        return { canceled: true, exported: 0, failed: 0, success: false };
      }

      const exportDir = await createMarkdownExportDirectory(folder);
      const notesDir = join(exportDir, 'notes');
      const attachmentsDir = join(exportDir, 'attachments');
      const exportedAt = new Date().toISOString();
      const noteIndex = await buildNoteIndex(wsPath);
      const exportedNotes: ExportedNote[] = [];
      const failures: Array<{ noteId: string; reason: string }> = [];
      type ExportNoteResult =
        | { exported: ExportedNote; failure?: never; skipped?: never }
        | {
            exported?: never;
            failure: { noteId: string; reason: string };
            skipped?: never;
          }
        | {
            exported?: never;
            failure?: never;
            skipped: { noteId: string; reason: string };
          };

      const exportResults = await Promise.all(
        ids.map(async (id): Promise<ExportNoteResult> => {
          try {
            const record = await loadNoteRecord(
              wsPath,
              id,
              noteIndex.get(id)?.markdownFile
            );
            if (!record) {
              return {
                failure: { noteId: id, reason: 'note record not found' },
              };
            }
            if (record.corrupted) {
              return {
                failure: { noteId: id, reason: 'corrupted sidecar' },
              };
            }
            const exported = buildNoteMarkdown(record, {
              includeFrontmatter,
              attachmentLinkPrefix: '../attachments/',
              exportedAt,
            });
            await Bun.write(
              join(notesDir, exported.fileName),
              exported.markdown
            );
            if (exported.attachments.length > 0) {
              await copyExportAttachments(
                wsPath,
                exported.attachments,
                attachmentsDir
              );
            }
            return { exported };
          } catch (error) {
            return { failure: { noteId: id, reason: String(error) } };
          }
        })
      );
      for (const result of exportResults) {
        if (result.failure) {
          failures.push(result.failure);
        } else if (result.exported) {
          exportedNotes.push(result.exported);
        }
      }

      if (widgetIds.length > 0) {
        const widgetRecords = await loadWidgets(wsPath, widgetIds);
        const widgetExportResults = await Promise.all(
          widgetIds.map(async (widgetId): Promise<ExportNoteResult> => {
            try {
              const record = widgetRecords[widgetId];
              if (!record) {
                return {
                  failure: {
                    noteId: widgetId,
                    reason: 'widget record not found',
                  },
                };
              }
              if ('error' in record) {
                return {
                  failure: {
                    noteId: widgetId,
                    reason:
                      record.error === 'corrupted'
                        ? 'corrupted widget'
                        : 'widget record not found',
                  },
                };
              }
              // Non-checklist widgets (pomodoro/reminder) have no markdown
              // representation; skip them instead of counting as failures.
              if (record.kind !== 'checklist') {
                return {
                  skipped: {
                    noteId: widgetId,
                    reason: `non-markdown widget kind: ${record.kind}`,
                  },
                };
              }
              const exported = buildChecklistWidgetMarkdown(record, {
                includeFrontmatter,
                exportedAt,
              });
              if (!exported) {
                return {
                  failure: {
                    noteId: widgetId,
                    reason: `unsupported widget kind: ${record.kind}`,
                  },
                };
              }
              await Bun.write(
                join(notesDir, exported.fileName),
                exported.markdown
              );
              return { exported };
            } catch (error) {
              return {
                failure: { noteId: widgetId, reason: String(error) },
              };
            }
          })
        );
        for (const result of widgetExportResults) {
          if (result.failure) {
            failures.push(result.failure);
          } else if (result.exported) {
            exportedNotes.push(result.exported);
          }
          // result.skipped is intentionally ignored: non-markdown widgets
          // are neither exported nor failed.
        }
      }

      await Bun.write(
        join(exportDir, 'index.md'),
        buildIndexMarkdown({
          notes: exportedNotes,
          exportedAt,
          source,
          failures,
        })
      );

      return {
        filePath: exportDir,
        exported: exportedNotes.length,
        failed: failures.length,
        success: failures.length === 0 || exportedNotes.length > 0,
      };
    },

    exportWorkspaceArchive: () => exportWorkspaceArchiveImpl(wsPath),
  };
}
