import { existsSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { Utils } from 'electrobun/bun';
import type { CanvasManifest } from './manifest';
import type { ExportedNote } from './markdownExport';
import { serializeChecklistItems } from './notes';
import type { ExportArchiveResponse } from './rpc/types';
import type { ChecklistWidgetData, WidgetRecord } from './widgets';

export const PNG_DATA_URL_RE = /^data:image\/png;base64,(.+)$/i;

export const UNSAFE_EXPORT_FILE_NAME_CHARS = '<>:"/\\|?*';

export const UNSAFE_EXPORT_FILE_NAME_CHAR_SET = new Set(
  UNSAFE_EXPORT_FILE_NAME_CHARS
);

export function sanitizeExportBaseName(base: string): string {
  let safe = '';
  for (const char of base.trim()) {
    safe +=
      char.charCodeAt(0) < 32 || UNSAFE_EXPORT_FILE_NAME_CHAR_SET.has(char)
        ? '-'
        : char;
  }
  return safe
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 80);
}

export function safeExportFileName(
  fileName: string,
  extension: 'json' | 'md' | 'png'
) {
  const normalized = fileName.replaceAll('\\', '/');
  const leaf =
    normalized
      .split('/')
      .filter((part) => part && part !== '.' && part !== '..')
      .at(-1) ?? '';
  const extensionSuffix = `.${extension}`;
  const base = leaf.toLowerCase().endsWith(extensionSuffix)
    ? leaf.slice(0, -extensionSuffix.length)
    : leaf;
  const safeBase = sanitizeExportBaseName(base) || 'ghostboard-canvas';
  return `${safeBase}.${extension}`;
}

export function resolveExportPath(
  selectedFolder: string,
  fileName: string
): string {
  const folderPath = resolve(selectedFolder);
  const outputPath = resolve(folderPath, fileName);
  const folderRelative = relative(folderPath, outputPath);
  if (folderRelative.startsWith('..') || isAbsolute(folderRelative)) {
    throw new Error('Export path must stay inside the selected folder.');
  }
  return outputPath;
}

export const EXPORT_ATTACHMENT_RE = /^attachments\/[^/\\]+$/;

export const EXPORT_DIR_NAME = 'GhostBoard Markdown Export';

/** Copy referenced workspace attachments into an export directory (flat). */
export async function copyExportAttachments(
  wsPath: string,
  attachments: Iterable<string>,
  destDir: string
): Promise<void> {
  await Promise.all(
    Array.from(attachments, async (rel) => {
      // react-doctor-disable-next-line react-doctor/js-set-map-lookups
      if (!EXPORT_ATTACHMENT_RE.test(rel) || rel.includes('..')) {
        return;
      }
      try {
        await Bun.write(
          join(destDir, basename(rel)),
          Bun.file(resolve(wsPath, rel))
        );
      } catch (error) {
        console.warn(`[export] Failed to copy attachment ${rel}:`, error);
      }
    })
  );
}

export interface ViewExportRefs {
  noteIds: string[];
  widgetIds: string[];
}

/** Collect note and widget references from a canvas manifest. */
export function collectViewExportRefs(
  manifest: CanvasManifest | null
): ViewExportRefs {
  const noteIds = new Set<string>();
  const widgetIds = new Set<string>();
  for (const node of manifest?.nodes ?? []) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (node.type === 'widget') {
      if (typeof data.widgetId === 'string' && data.widgetId) {
        widgetIds.add(data.widgetId);
      }
    } else if (typeof data.noteId === 'string' && data.noteId) {
      noteIds.add(data.noteId);
    }
    const children = data.children;
    if (!Array.isArray(children)) {
      continue;
    }
    for (const child of children) {
      const c = (child ?? {}) as Record<string, unknown>;
      const childData = c.data as Record<string, unknown> | undefined;
      if (c.type === 'widget') {
        if (typeof childData?.widgetId === 'string' && childData.widgetId) {
          widgetIds.add(childData.widgetId);
        }
        continue;
      }
      if (typeof c.noteId === 'string' && c.noteId) {
        noteIds.add(c.noteId);
      }
      if (typeof childData?.noteId === 'string' && childData.noteId) {
        noteIds.add(childData.noteId);
      }
    }
  }
  return { noteIds: [...noteIds], widgetIds: [...widgetIds] };
}

export function buildChecklistWidgetMarkdown(
  record: WidgetRecord,
  options: {
    exportedAt: string;
    includeFrontmatter?: boolean;
  }
): ExportedNote | null {
  if (record.kind !== 'checklist') {
    return null;
  }

  const title = record.title || record.id;
  const body = serializeChecklistItems(
    (record.data as ChecklistWidgetData).items
  );
  const includeFrontmatter = options.includeFrontmatter !== false;
  const markdown = includeFrontmatter
    ? [
        '---',
        `id: ${record.id}`,
        `title: ${JSON.stringify(title)}`,
        'source: ghostboard',
        'widgetKind: checklist',
        `createdAt: ${record.createdAt}`,
        `updatedAt: ${record.updatedAt}`,
        `exportedAt: ${options.exportedAt}`,
        '---',
        '',
        body,
        '',
      ].join('\n')
    : `# ${title}\n\n${body}\n`;

  return {
    noteId: record.id,
    title,
    fileName: safeExportFileName(`${title}-${record.id}.md`, 'md'),
    markdown,
    attachments: [],
  };
}

export async function pickExportFolder(): Promise<string | null> {
  const selected = await Utils.openFileDialog({
    allowsMultipleSelection: false,
    canChooseDirectory: true,
    canChooseFiles: false,
    startingFolder: '~/Desktop',
  });
  return selected.find(Boolean) ?? null;
}

/**
 * Pick a destination folder + filename for the workspace archive, then shell
 * out to `zip -r` to create the archive. Returns the resulting path / size or
 * `canceled: true` if the user dismissed the picker.
 */
export async function exportWorkspaceArchiveImpl(
  wsPath: string
): Promise<ExportArchiveResponse> {
  if (!existsSync(wsPath)) {
    return { success: false };
  }
  const selectedFolders = await Utils.openFileDialog({
    allowedFileTypes: '*',
    allowsMultipleSelection: false,
    canChooseDirectory: true,
    canChooseFiles: false,
    startingFolder: '~/Desktop',
  });
  const selectedFolder = selectedFolders.find(Boolean);
  if (!selectedFolder) {
    return { canceled: true, success: false };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveName = `ghostboard-workspace-${stamp}.zip`;
  const workspacePath = resolve(wsPath);
  const selectedFolderPath = resolve(selectedFolder);
  const outputPath = resolve(selectedFolderPath, archiveName);
  const folderRelativeToWorkspace = relative(workspacePath, selectedFolderPath);
  if (
    folderRelativeToWorkspace === '' ||
    !(
      folderRelativeToWorkspace.startsWith('..') ||
      isAbsolute(folderRelativeToWorkspace)
    )
  ) {
    // Refuse to write the archive inside the workspace we're zipping; this
    // would create a self-referential archive and could grow without bound.
    return { success: false };
  }
  const parentDir = resolve(workspacePath, '..');
  const leaf = basename(workspacePath);
  try {
    const proc = Bun.spawn(['zip', '-r', '-q', outputPath, leaf], {
      cwd: parentDir,
      stdout: 'ignore',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.warn('[settings] zip exited with', exitCode, stderr);
      return { success: false };
    }
    const file = Bun.file(outputPath);
    const size = await file.size;
    return { success: true, filePath: outputPath, size };
  } catch (error) {
    console.warn('[settings] Failed to spawn zip:', error);
    return { success: false };
  }
}
