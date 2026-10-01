import { existsSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import Electrobun, {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  Updater,
  Utils,
} from 'electrobun/bun';
import {
  type AIConnectionSettings,
  type AIProvider,
  type AIProviderProfiles,
  type AITestResult,
  isAIProvider,
  normalizeAIProfiles,
} from '../shared/ai/providerConfig';
import type { AIRunTaskParams, AIRunTaskResponse } from '../shared/ai/types';
import type { ExtensionEnablementFile } from '../shared/extensions/enablement';
import type {
  ExtensionInstanceLoadError,
  ExtensionInstanceRecord,
} from '../shared/extensions/instance';
import type { ExtensionPresentation } from '../shared/extensions/presentation';
import { collectExtensionInstanceIds } from '../shared/extensions/refs';
import type { ExtensionTaskDelivery } from '../shared/extensions/scheduling';
import type { HostContentChangedEvent } from '../shared/plugins/contentHistory';
import type {
  PluginDirectoryListResult,
  PluginFilePickResult,
  PluginFileReadResult,
} from '../shared/plugins/files';
import type {
  InstalledPluginSummary,
  PluginInstallCommitResult,
  PluginInstallPreparationResult,
  PluginMigrationRestoreResult,
  PluginSafeModePreparationResult,
  PluginSafeModeState,
  PluginUpdatePreparationResult,
} from '../shared/plugins/management';
import {
  type DiagnosticsStatus,
  type FeedbackInput,
  type ReportError,
  reportErrorSchema,
  type SubmitReportResult,
} from '../shared/support/reports';
import { type AIServerConfig, testAIConnection, validateAIConfig } from './ai';
import { loadAICredentials, saveAIApiKey } from './aicredentials';
import { runAITask } from './aiTasks';
import { getAppChannel, getAppDataRoot } from './appPaths';
import {
  assertWorkspaceAttachmentPath,
  attachmentExists,
  loadAttachment as loadWorkspaceAttachment,
  openAttachment as openWorkspaceAttachment,
  revealAttachment as revealWorkspaceAttachment,
  saveAttachment as saveWorkspaceAttachment,
  saveAttachmentFile as saveWorkspaceAttachmentFile,
} from './attachments';
import {
  deleteBlockNoteSidecar,
  loadBlockNoteSidecar,
  saveBlockNoteSidecar,
} from './blocknote';
import { blocksToPlainText } from './blocknotePreview';
import {
  deleteUnlinkedNotes,
  scanUnlinkedNotes,
  type UnlinkedFileEntry,
} from './cleanup';
import {
  DiagnosticsService,
  initialReportAppInfo,
  installDiagnosticLogging,
} from './diagnostics';
import {
  loadExtensionEnablement,
  setCanvasTypeEnabled,
} from './extensions/enablement';
import {
  cloneExtensionInstance,
  countInstancesByCanvasType,
  createExtensionInstance,
  deleteInstancesByCanvasType,
  loadExtensionInstances,
  updateExtensionInstance,
} from './extensions/instanceStore';
import {
  buildManifestNodesAfterExtensionMigration,
  migrateLegacyCanvasNodes,
} from './extensions/migration';
import {
  cancelExtensionTask,
  cancelExtensionTasksByInstance,
  ExtensionTaskFileError,
  listExtensionTasks,
  scheduleExtensionTask,
} from './extensions/scheduler';
import { createExtensionSchedulerService } from './extensions/schedulerService';
import {
  activateLicense as activateLicenseKey,
  checkLicenseStatus,
  type LicenseInfo,
} from './license';
import {
  type LocalHttpServerHandle,
  startLocalHttpServer,
} from './localHttpServer';
import type { CanvasManifest, ManifestEdge, ManifestNode } from './manifest';
import { loadManifest, saveManifest as writeManifest } from './manifest';
import {
  buildIndexMarkdown,
  buildNoteMarkdown,
  type ExportedNote,
} from './markdownExport';
import {
  deleteNodeMetadata,
  deleteTagEverywhere,
  listAllTagsFromMetadata,
  loadAllMetadata,
  migrateLegacyTagsFromNotes,
  moveNodeMetadataKey,
  type NodeMetadata,
  type NodeMetadataMap,
  renameTagEverywhere,
  setNodeMetadata,
  type TagMutationResult,
  type TagSummary,
} from './nodeMetadata';
import {
  buildNoteIndex,
  listNoteRecords,
  loadNoteRecord,
  mergeNoteMeta,
  type NoteLocation,
  noteRecordToCardData,
} from './noteStore';
import {
  cardDataToNote,
  createNote,
  deleteNoteFile,
  deriveMarkdownTitle,
  loadNote,
  parseFrontmatter,
  prepareImportedMarkdownBody,
  saveNote,
  serializeChecklistItems,
} from './notes';
import { withNoteWorkspace } from './noteTransactions';
import {
  pluginWorkspaceId,
  subscribeContentChanges,
} from './plugins/contentEvents';
import { PluginFileStore, pluginPickerFileTypes } from './plugins/files';
import { PluginHostController } from './plugins/hostController';
import {
  PluginManagementService,
  pluginInstallErrorMessage,
} from './plugins/management';
import { NoteContentService } from './plugins/noteContent';
import { scriptedProbeSelection } from './plugins/probeSelection';
import { PluginStartupGuard } from './plugins/safeMode';
import { PluginStorageHost } from './plugins/storage';
import { T1HostController } from './plugins/t1Host';
import { T2A4HostController } from './plugins/t2A4Host';
import { T2ContentHostController } from './plugins/t2ContentHost';
import { T3HostController } from './plugins/t3Host';
import { T4HostController } from './plugins/t4Host';
import { T5HostController } from './plugins/t5Host';
import {
  buildNotePreviewFromBlocks,
  type PreviewArtifacts,
  writeNoteWithPreview,
} from './preview';
import type { SearchResult } from './search';
import { searchWorkspace } from './search';
import type {
  TemplateManifest,
  TemplateMeta,
  WriteTemplateThumbnailResult,
} from './templates';
import {
  listAllTemplates,
  loadTemplate,
  writeTemplateThumbnail,
} from './templates';
import { generateFileMetadata, generateVideoPosterFile } from './thumbnail';
import { loadUserPrefs, saveUserPrefs } from './userprefs';
import type {
  ChecklistWidgetData,
  ChecklistWidgetItem,
  WidgetKind,
  WidgetLoadError,
  WidgetRecord,
} from './widgets';
import {
  cloneWidget,
  createWidget,
  deleteWidget,
  loadWidget,
  loadWidgets,
  saveWidget,
  WIDGET_SCHEMA,
} from './widgets';
import {
  addView,
  addViewFromTemplate,
  atomicWrite,
  clearAllTrash,
  getDefaultWorkspacePath,
  initWorkspace,
  listTrash,
  loadWorkspaceConfig,
  purgeTrash,
  removeView,
  renameView,
  restoreView,
  seedFirstRunIfNeeded,
  setActiveViewId,
  type TrashEntry,
} from './workspace';

const DEV_SERVER_PORT = '5173';
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const PNG_DATA_URL_RE = /^data:image\/png;base64,(.+)$/i;
const NOTE_ID_PREFIX_RE = /^note_/;
const DEV_SERVER_RETRY_COUNT = 20;
const DEV_SERVER_RETRY_DELAY_MS = 250;
const UNSAFE_EXPORT_FILE_NAME_CHARS = '<>:"/\\|?*';
const UNSAFE_EXPORT_FILE_NAME_CHAR_SET = new Set(UNSAFE_EXPORT_FILE_NAME_CHARS);

function sanitizeExportBaseName(base: string): string {
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

function safeExportFileName(
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

function resolveExportPath(selectedFolder: string, fileName: string): string {
  const folderPath = resolve(selectedFolder);
  const outputPath = resolve(folderPath, fileName);
  const folderRelative = relative(folderPath, outputPath);
  if (folderRelative.startsWith('..') || isAbsolute(folderRelative)) {
    throw new Error('Export path must stay inside the selected folder.');
  }
  return outputPath;
}

const EXPORT_ATTACHMENT_RE = /^attachments\/[^/\\]+$/;
const EXPORT_DIR_NAME = 'GhostBoard Markdown Export';

/** Copy referenced workspace attachments into an export directory (flat). */
async function copyExportAttachments(
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

interface ViewExportRefs {
  noteIds: string[];
  widgetIds: string[];
}

/** Collect note and widget references from a canvas manifest. */
function collectViewExportRefs(
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

function buildChecklistWidgetMarkdown(
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

async function pickExportFolder(): Promise<string | null> {
  const selected = await Utils.openFileDialog({
    allowsMultipleSelection: false,
    canChooseDirectory: true,
    canChooseFiles: false,
    startingFolder: '~/Desktop',
  });
  return selected.find(Boolean) ?? null;
}
export async function sleep(ms: number) {
  return await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForDevServer(): Promise<boolean> {
  for (let attempt = 0; attempt < DEV_SERVER_RETRY_COUNT; attempt += 1) {
    try {
      // Polling attempts are intentionally sequential.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await fetch(DEV_SERVER_URL, { method: 'HEAD' });
      return true;
    } catch {
      await sleep(DEV_SERVER_RETRY_DELAY_MS);
    }
  }

  return false;
}

// Check if Vite dev server is running for HMR
export async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === 'dev') {
    const isDevServerReady = await waitForDevServer();

    if (isDevServerReady) {
      console.warn(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    }

    console.warn(
      "Vite dev server not running. Run 'bun run dev:hmr' for HMR support."
    );
  }
  return 'views://mainview/index.html';
}

function stripAttachmentRuntimeData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const {
    missing: _missing,
    previewUrl: _previewUrl,
    thumbnailUrl: _thumbnailUrl,
    ...restData
  } = data;
  return restData;
}

function serializeWidgetReference(data: unknown): Record<string, string> {
  const record =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return {
    widgetId: typeof record.widgetId === 'string' ? record.widgetId : '',
    kind: typeof record.kind === 'string' ? record.kind : '',
  };
}

const IMAGE_DATA_URL_RE = /^data:image\//i;

async function serializeImageDataForManifest(
  wsPath: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { imageUrl, thumbnailUrl: _thumbnailUrl, ...restData } = data;
  const nextData: Record<string, unknown> = { ...restData };

  if (typeof nextData.imageFile === 'string' && nextData.imageFile.trim()) {
    return nextData;
  }

  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return nextData;
  }

  if (IMAGE_DATA_URL_RE.test(imageUrl)) {
    const saved = await saveWorkspaceAttachment(wsPath, {
      dataUrl: imageUrl,
      kind: 'image',
    });
    nextData.imageFile = saved.filePath;
    return nextData;
  }

  try {
    const { relativePath } = assertWorkspaceAttachmentPath(wsPath, imageUrl);
    nextData.imageFile = relativePath;
  } catch {
    // Non-workspace URLs are runtime-only for image nodes and are not persisted.
  }

  return nextData;
}

async function hydrateAssetData(
  wsPath: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const nextData: Record<string, unknown> = { ...data };
  const attachmentFile = data.attachmentFile;
  if (typeof attachmentFile === 'string') {
    try {
      const exists = await attachmentExists(wsPath, attachmentFile);
      if (!exists) {
        nextData.missing = true;
      }
    } catch {
      nextData.missing = true;
    }
  }

  const thumbnailFile = data.thumbnailFile;
  if (typeof thumbnailFile === 'string') {
    try {
      const thumbnail = await loadWorkspaceAttachment(wsPath, thumbnailFile);
      if (thumbnail) {
        nextData.thumbnailUrl = thumbnail.dataUrl;
      }
    } catch {
      // Thumbnail hydrate is best-effort; keep the asset usable without it.
    }
  }

  return nextData;
}

async function hydrateImageData(
  wsPath: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const nextData: Record<string, unknown> = { ...data };
  const existingPreview =
    typeof data.thumbnailUrl === 'string' && Boolean(data.thumbnailUrl);
  let hasPreview = existingPreview;

  const thumbnailFile = data.thumbnailFile;
  if (typeof thumbnailFile === 'string' && !hasPreview) {
    try {
      const thumbnail = await loadWorkspaceAttachment(wsPath, thumbnailFile);
      if (thumbnail) {
        nextData.thumbnailUrl = thumbnail.dataUrl;
        hasPreview = true;
      }
    } catch {
      // Thumbnail hydrate is best-effort; fall back to the original below.
    }
  }

  const imageFile = data.imageFile;
  if (typeof imageFile === 'string' && !data.imageUrl && !hasPreview) {
    try {
      const image = await loadWorkspaceAttachment(wsPath, imageFile);
      if (image) {
        nextData.imageUrl = image.dataUrl;
      } else {
        console.warn(`[persistence] Attachment not found: ${imageFile}`);
      }
    } catch {
      console.warn(`[persistence] Attachment not found: ${imageFile}`);
    }
  }

  return nextData;
}

function hasAttachmentRuntimeData(type: string | undefined): boolean {
  return type === 'asset' || type === 'recording';
}

const asNoteString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

/**
 * Persist a manifest card's note during `saveManifest`.
 *
 * Discriminator (ADR 0002 v0.2 A6): a note that already has a BlockNote
 * sidecar is JSON-backed — `saveManifest` only merges note metadata (title /
 * color) into the sidecar and never touches blocks or writes Markdown. Legacy
 * (no-sidecar) checklist / plain-text cards keep the markdown-body round-trip
 * until their next focused-view edit migrates them to a sidecar.
 */
async function persistManifestCardNote(
  wsPath: string,
  location: NoteLocation,
  noteId: string,
  cardData: Record<string, unknown>
): Promise<void> {
  if (location.hasSidecar) {
    // JSON is the source of truth — merge metadata only, never the body.
    await mergeNoteMeta(wsPath, noteId, {
      expectedRevision:
        typeof cardData.blocknoteRevision === 'number'
          ? cardData.blocknoteRevision
          : undefined,
      title: typeof cardData.title === 'string' ? cardData.title : undefined,
      color: typeof cardData.color === 'string' ? cardData.color : undefined,
    });
    return;
  }

  // Legacy markdown note: derive frontmatter + body from node data and
  // regenerate the markdown preview. Skipped if there is no backing file.
  if (!location.markdownFile) {
    return;
  }
  const existingDoc = await loadNote(wsPath, location.markdownFile);
  const { frontmatter, body } = cardDataToNote(
    noteId,
    cardData,
    existingDoc?.frontmatter
  );
  await writeNoteWithPreview(wsPath, location.markdownFile, frontmatter, body);
}

/**
 * Hydrate a manifest card's `data` blob from its note record (sidecar JSON
 * first, legacy `.md` fallback). Returns `null` when the note cannot be found
 * so the caller can warn and keep the thin manifest reference.
 */
async function hydrateCardNoteData(
  wsPath: string,
  noteIndex: Map<string, NoteLocation>,
  noteId: string,
  existingData: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const markdownFile =
    asNoteString(existingData.file, '') ||
    noteIndex.get(noteId)?.markdownFile ||
    undefined;
  const record = await loadNoteRecord(wsPath, noteId, markdownFile);
  if (!record) {
    return null;
  }
  return { ...existingData, ...noteRecordToCardData(record), noteId };
}

function widgetIdForChecklistNote(noteId: string): string {
  return `widget_${noteId.replace(NOTE_ID_PREFIX_RE, '')}`;
}

function isWidgetLoadFailure(
  record: WidgetRecord | WidgetLoadError
): record is WidgetLoadError {
  return 'error' in record;
}

function normalizeChecklistWidgetItems(items: unknown): ChecklistWidgetItem[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    return {
      id:
        typeof raw.id === 'string' && raw.id
          ? raw.id
          : `item_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`,
      text: typeof raw.text === 'string' ? raw.text : '',
      checked: raw.checked === true,
      ...(raw.isHeader === true ? { isHeader: true } : {}),
      ...(typeof raw.createdAt === 'string'
        ? { createdAt: raw.createdAt }
        : {}),
      ...(typeof raw.completedAt === 'string'
        ? { completedAt: raw.completedAt }
        : {}),
    };
  });
}

function checklistRecordFromCard(
  noteId: string,
  cardData: Record<string, unknown>
): WidgetRecord {
  const now = new Date().toISOString();
  return {
    schema: WIDGET_SCHEMA,
    id: widgetIdForChecklistNote(noteId),
    kind: 'checklist',
    title: typeof cardData.title === 'string' ? cardData.title : '',
    createdAt: now,
    updatedAt: now,
    data: {
      items: normalizeChecklistWidgetItems(cardData.items),
    },
  };
}

async function migrateChecklistCardToWidgetReference(
  wsPath: string,
  noteId: string,
  cardData: Record<string, unknown>,
  migratedWidgets: Record<string, WidgetRecord>
): Promise<{ kind: 'checklist'; widgetId: string } | null> {
  if (cardData.type !== 'checklist') {
    return null;
  }

  const widgetId = widgetIdForChecklistNote(noteId);
  try {
    const existing = await loadWidget(wsPath, widgetId);
    if (!isWidgetLoadFailure(existing)) {
      migratedWidgets[existing.id] = existing;
      await moveNodeMetadataKey(wsPath, noteId, existing.id);
      return { widgetId: existing.id, kind: 'checklist' };
    }
    if (existing.error === 'corrupted') {
      // The deterministic widget file exists but is corrupted. Rebuild it from
      // the legacy card so migration is not permanently blocked by a broken
      // file (which would otherwise abort every subsequent loadCanvas).
      console.warn(
        `[persistence] Overwriting corrupted widget ${widgetId} during migration.`
      );
    }

    const record = checklistRecordFromCard(noteId, cardData);
    await saveWidget(wsPath, record);
    migratedWidgets[record.id] = record;
    await moveNodeMetadataKey(wsPath, noteId, record.id);
    return { widgetId: record.id, kind: 'checklist' };
  } catch (error) {
    console.warn(
      `[persistence] Failed to migrate checklist noteId=${noteId}`,
      error
    );
    return null;
  }
}

interface FolderChildNode {
  data?: Record<string, unknown>;
  id: string;
  noteId?: string;
  type?: string;
  [key: string]: unknown;
}

function widgetReferenceFromData(
  data: Record<string, unknown> | undefined
): { kind: string; widgetId: string } | null {
  if (!data) {
    return null;
  }
  const widgetId = data.widgetId;
  const kind = data.kind;
  if (typeof widgetId !== 'string' || !widgetId) {
    return null;
  }
  if (typeof kind !== 'string' || !kind) {
    return null;
  }
  return { widgetId, kind };
}

/**
 * Persist checklist→widget migration by patching only the nodes/children that
 * actually became widgets. Start from the on-disk manifest shape so hydrated
 * card bodies, attachment runtime fields, and preview URLs never get written
 * back into `views/*.canvas.json`.
 */
function buildManifestNodesAfterWidgetMigration(
  originalNodes: ManifestNode[],
  hydratedNodes: ManifestNode[]
): ManifestNode[] {
  const hydratedById = new Map(
    hydratedNodes.map((node) => [node.id, node] as const)
  );

  return originalNodes.map((node) => {
    const hydrated = hydratedById.get(node.id);
    if (!hydrated) {
      return node;
    }

    // Top-level legacy card (or other non-widget) → widget reference.
    if (node.type !== 'widget' && hydrated.type === 'widget') {
      const ref = widgetReferenceFromData(
        hydrated.data as Record<string, unknown>
      );
      if (!ref) {
        return node;
      }
      return {
        ...node,
        type: 'widget',
        data: ref,
      };
    }

    // Folder: rewrite only children that migrated to widgets; keep every other
    // child exactly as stored on disk (no hydrated card/attachment payload).
    if (node.type === 'folder' && hydrated.type === 'folder') {
      const originalChildren = (node.data.children ?? []) as FolderChildNode[];
      if (!Array.isArray(originalChildren) || originalChildren.length === 0) {
        return node;
      }
      const hydratedChildren = ((hydrated.data as Record<string, unknown>)
        .children ?? []) as FolderChildNode[];
      const hydratedChildById = new Map(
        hydratedChildren
          .filter((child) => typeof child?.id === 'string')
          .map((child) => [child.id, child] as const)
      );

      let changed = false;
      const nextChildren = originalChildren.map((child) => {
        if (child.type === 'widget') {
          return child;
        }
        const hydratedChild = hydratedChildById.get(child.id);
        if (!hydratedChild || hydratedChild.type !== 'widget') {
          return child;
        }
        const ref = widgetReferenceFromData(hydratedChild.data);
        if (!ref) {
          return child;
        }
        changed = true;
        return {
          id: child.id,
          type: 'widget',
          data: ref,
        };
      });

      if (!changed) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          children: nextChildren,
        },
      };
    }

    // Cards, images, assets, stickies, already-widget nodes: leave disk shape.
    return node;
  });
}

interface CanvasRPC {
  bun: {
    requests: {
      loadCanvas: {
        params: { viewId: string };
        response: {
          nodes: ManifestNode[];
          edges: ManifestEdge[];
          widgets?: Record<string, WidgetRecord | WidgetLoadError>;
          extensionInstances?: Record<
            string,
            ExtensionInstanceRecord | ExtensionInstanceLoadError
          >;
        } | null;
      };
      saveManifest: {
        params: {
          viewId: string;
          nodes: ManifestNode[];
          edges: ManifestEdge[];
        };
        response: { success: boolean };
      };
      createWidget: {
        params: { kind: WidgetKind; title?: string };
        response: { success: true; widget: WidgetRecord } | { success: false };
      };
      cloneWidget: {
        params: { widgetId: string };
        response: { success: true; widget: WidgetRecord } | { success: false };
      };
      saveWidget: {
        params: { widget: WidgetRecord };
        response: { success: boolean };
      };
      deleteWidget: {
        params: { widgetId: string };
        response: { success: boolean };
      };
      pluginInstallList: {
        params: Record<string, unknown>;
        response: {
          plugins: InstalledPluginSummary[];
          safeMode: PluginSafeModeState;
        };
      };
      pluginPrepareInstallFromFile: {
        params: Record<string, unknown>;
        response: PluginInstallPreparationResult;
      };
      pluginPrepareDevelopmentDirectory: {
        params: Record<string, unknown>;
        response: PluginInstallPreparationResult;
      };
      pluginPrepareInstallFromUrl: {
        params: { url: string };
        response: PluginInstallPreparationResult;
      };
      pluginPrepareUpdate: {
        params: { digest: string; pluginId: string };
        response: PluginUpdatePreparationResult;
      };
      pluginCommitInstall: {
        params: { transactionId: string };
        response: PluginInstallCommitResult;
      };
      pluginCancelInstall: {
        params: { transactionId: string };
        response: { success: boolean };
      };
      pluginEnable: {
        params: { digest: string; pluginId: string };
        response: PluginInstallCommitResult;
      };
      pluginDisable: {
        params: { digest: string; pluginId: string };
        response: PluginInstallCommitResult;
      };
      pluginRollback: {
        params: { digest: string; pluginId: string };
        response: PluginInstallCommitResult;
      };
      pluginRestoreMigrationBackup: {
        params: { pluginId: string };
        response: PluginMigrationRestoreResult;
      };
      pluginSafeModePrepareNormalStart: {
        params: Record<string, unknown>;
        response: PluginSafeModePreparationResult;
      };
      pluginFilesPick: {
        params: {
          activationId: string;
          extensions: string[];
          kind?: 'directory' | 'file';
          multiple?: boolean;
          pluginId: string;
          workspaceId: string;
        };
        response: PluginFilePickResult;
      };
      pluginFilesReadText: {
        params: {
          activationId: string;
          handleId: string;
          pluginId: string;
          workspaceId: string;
        };
        response: PluginFileReadResult;
      };
      pluginFilesListDirectory: {
        params: {
          activationId: string;
          cursor?: string;
          handleId: string;
          limit?: number;
          pluginId: string;
          workspaceId: string;
        };
        response: PluginDirectoryListResult;
      };
      pluginFilesRelease: {
        params: {
          activationId: string;
          handleIds: string[];
          pluginId: string;
          workspaceId: string;
        };
        response: { success: boolean };
      };
      extensionEnablementList: {
        params: Record<string, unknown>;
        response: {
          disabledCanvasTypes: string[];
          instanceCounts: Record<string, number>;
        };
      };
      extensionEnablementSetEnabled: {
        params: { canvasTypeId: string; enabled: boolean };
        response: {
          enablement?: ExtensionEnablementFile;
          success: boolean;
        };
      };
      extensionInstanceCreate: {
        params: {
          canvasTypeId: string;
          dataVersion: number;
          id?: string;
          presentation: ExtensionPresentation;
          state: unknown;
        };
        response:
          | { record: ExtensionInstanceRecord; success: true }
          | { success: false };
      };
      extensionInstanceLoadMany: {
        params: { instanceIds: string[] };
        response: {
          records: Record<
            string,
            ExtensionInstanceRecord | ExtensionInstanceLoadError
          >;
        };
      };
      extensionInstanceUpdate: {
        params: {
          dataVersion?: number;
          expectedRevision?: number;
          instanceId: string;
          presentation: ExtensionPresentation;
          state: unknown;
        };
        response:
          | { record: ExtensionInstanceRecord; success: true }
          | { success: false };
      };
      extensionInstanceClone: {
        params: { instanceId: string };
        response:
          | { record: ExtensionInstanceRecord; success: true }
          | { success: false };
      };
      extensionInstanceClearType: {
        params: { canvasTypeId: string };
        response: { deleted: number; success: boolean };
      };
      extensionSchedulerSchedule: {
        params: {
          canvasTypeId: string;
          fireAt: string;
          id: string;
          instanceId: string;
          payload?: unknown;
          repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
        };
        response: { success: boolean };
      };
      extensionSchedulerCancel: {
        params: { instanceId: string; taskId: string };
        response: { success: boolean };
      };
      extensionSchedulerAck: {
        params: { deliveryId: string };
        response: { success: boolean };
      };
      extensionSchedulerList: {
        params: { instanceId?: string };
        response: {
          diagnostic?: string;
          tasks: Array<{
            canvasTypeId: string;
            fireAt: string;
            id: string;
            instanceId: string;
            payload?: unknown;
            repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
          }>;
        };
      };
      saveNote: {
        params: {
          noteId: string;
          frontmatter: Record<string, unknown>;
          body: string;
        };
        response: { preview?: PreviewArtifacts; success: boolean };
      };
      loadBlockNote: {
        params: { noteId: string; workspaceId?: string };
        response: {
          success: boolean;
          blocks?: unknown[];
          markdown?: string;
          frontmatter?: Record<string, unknown>;
          revision?: number;
          recoveredFromMarkdown?: boolean;
          preview?: PreviewArtifacts;
          text?: string;
          workspaceId?: string;
        };
      };
      saveBlockNote: {
        params: {
          noteId: string;
          frontmatter: Record<string, unknown>;
          blocks: unknown[];
          markdown: string;
          revision?: number;
        };
        response: {
          success: boolean;
          conflict?: boolean;
          revision?: number;
          preview?: PreviewArtifacts;
          blocknoteFile?: string;
        };
      };
      createNote: {
        params: { id: string; title: string; displayHint: string };
        response: { noteId: string; file: string };
      };
      deleteNote: {
        params: { noteId: string };
        response: { success: boolean };
      };
      saveAttachment: {
        params: {
          dataUrl: string;
          existingFile?: string;
          kind?: 'audio' | 'file' | 'image' | 'video';
          mimeType?: string;
          suggestedName?: string;
        };
        response: {
          archiveSummary?: { entryCount: number; topFiles: string[] };
          filePath: string;
          previewExcerpt?: string;
        };
      };
      saveAttachmentFile: {
        params: {
          sourcePath: string;
          kind?: 'audio' | 'file' | 'image' | 'video';
          mimeType?: string;
          suggestedName?: string;
        };
        response: {
          archiveSummary?: { entryCount: number; topFiles: string[] };
          filePath: string;
          previewExcerpt?: string;
        };
      };
      loadAttachment: {
        params: { filePath: string };
        response: { dataUrl: string } | null;
      };
      openAttachment: {
        params: { filePath: string };
        response: { success: boolean };
      };
      revealAttachment: {
        params: { filePath: string };
        response: { success: boolean };
      };
      openExternalUrl: {
        params: { url: string };
        response: { success: boolean };
      };
      toggleWindowMaximize: {
        params: Record<string, unknown>;
        response: { maximized: boolean; success: boolean };
      };
      importMarkdownFiles: {
        params: Record<string, unknown>;
        response: {
          canceled?: boolean;
          failedCount?: number;
          notes: Array<{ noteId: string; title: string; content?: string }>;
        };
      };
      generateVideoThumbnail: {
        params: { attachmentFile: string };
        response: { thumbnailFile?: string };
      };

      exportPng: {
        params: { dataUrl: string; fileName: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      exportJson: {
        params: { fileName: string; json: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      exportNoteMarkdown: {
        params: { noteId: string; includeFrontmatter?: boolean };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      /** Topic outline export. The renderer projects the tree to Markdown —
       *  it holds the live graph — and the main process only saves it. */
      exportTopicOutline: {
        params: { fileName: string; markdown: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      exportNotesMarkdown: {
        params: {
          scope: 'all' | 'selected' | 'view';
          viewId?: string;
          noteIds?: string[];
          includeFrontmatter?: boolean;
        };
        response: {
          canceled?: boolean;
          exported?: number;
          failed?: number;
          filePath?: string;
          success: boolean;
        };
      };
      getSettings: {
        params: Record<string, unknown>;
        response: AppSettings;
      };
      getDiagnosticsStatus: {
        params: Record<string, unknown>;
        response: DiagnosticsStatus;
      };
      getDiagnosticsPreview: {
        params: Record<string, unknown>;
        response: { logs: string };
      };
      setCrashAutoUpload: {
        params: { enabled: boolean };
        response: DiagnosticsStatus;
      };
      submitFeedback: {
        params: FeedbackInput;
        response: SubmitReportResult;
      };
      recordRendererDiagnostic: {
        params: {
          level: 'warn' | 'error';
          message: string;
          crash?: ReportError;
        };
        response: { success: boolean };
      };
      saveSettings: {
        params: AppSettings;
        response: { success: boolean };
      };
      getAICredentialStatus: {
        params: { provider?: AIProvider };
        response: {
          hasApiKey: boolean;
          source: 'stored' | 'environment' | 'none';
        };
      };
      testAIConnection: {
        params: AIConnectionSettings;
        response: AITestResult;
      };
      setAIApiKey: {
        params: { apiKey: string | null; provider?: AIProvider };
        response: { success: boolean };
      };
      aiRunTask: {
        params: AIRunTaskParams;
        response: AIRunTaskResponse;
      };
      listTrash: {
        params: Record<string, unknown>;
        response: TrashEntry[];
      };
      restoreTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      purgeTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      clearAllTrash: {
        params: Record<string, unknown>;
        response: { purged: number; success: boolean };
      };
      scanUnlinkedNotes: {
        params: Record<string, unknown>;
        response: { entries: UnlinkedFileEntry[] };
      };
      deleteUnlinkedNotes: {
        params: { files: string[] };
        response: { deleted: string[]; skipped: string[] };
      };
      getWorkspaceInfo: {
        params: Record<string, unknown>;
        response: WorkspaceInfoResponse;
      };
      openWorkspaceFolder: {
        params: Record<string, unknown>;
        response: { success: boolean };
      };
      switchWorkspace: {
        params: Record<string, unknown>;
        response: SwitchWorkspaceResponse;
      };
      exportWorkspaceArchive: {
        params: Record<string, unknown>;
        response: ExportArchiveResponse;
      };
      getAppInfo: {
        params: Record<string, unknown>;
        response: AppInfoResponse;
      };
      checkForUpdate: {
        params: Record<string, unknown>;
        response: UpdateCheckResponse;
      };
      checkLicense: {
        params: Record<string, unknown>;
        response: LicenseInfo;
      };
      activateLicense: {
        params: { key: string };
        response: { success: boolean; error?: string };
      };
      getLocalHttpEndpoint: {
        params: Record<string, unknown>;
        response: { aiEnabled: boolean; baseUrl: string; token: string };
      };
      listViews: {
        params: Record<string, unknown>;
        response: {
          views: Array<{ id: string; name: string; file: string }>;
          activeViewId: string;
        };
      };
      createView: {
        params: { name: string };
        response: { id: string; name: string; file: string };
      };
      deleteView: {
        params: { viewId: string };
        response: {
          success: boolean;
          activeViewId?: string;
          trashId?: string;
        };
      };
      restoreView: {
        params: { trashId: string };
        response: {
          success: boolean;
          view?: { id: string; name: string; file: string };
          activeViewId?: string;
        };
      };
      renameView: {
        params: { viewId: string; name: string };
        response: { success: boolean };
      };
      setActiveView: {
        params: { viewId: string };
        response: { success: boolean };
      };
      searchCanvas: {
        params: {
          query: string;
          viewId?: string;
          limit?: number;
        };
        response: SearchResult[];
      };
      listTags: {
        params: Record<string, unknown>;
        response: TagSummary[];
      };
      renameTag: {
        params: { oldName: string; newName: string };
        response: TagMutationResult;
      };
      deleteTag: {
        params: { name: string };
        response: TagMutationResult;
      };
      loadNodeMetadata: {
        params: Record<string, unknown>;
        response: NodeMetadataMap;
      };
      setNodeMetadata: {
        params: { id: string; metadata: NodeMetadata };
        response: { success: boolean };
      };
      deleteNodeMetadata: {
        params: { id: string };
        response: { success: boolean };
      };
      listTemplates: {
        params: Record<string, unknown>;
        response: TemplateMeta[];
      };
      getTemplate: {
        params: { id: string };
        response: TemplateManifest | null;
      };
      createViewFromTemplate: {
        params: { name: string; templateId: string };
        response: { id: string; name: string; file: string };
      };
      saveTemplateThumbnail: {
        params: { templateId: string; pngBase64: string };
        response: WriteTemplateThumbnailResult;
      };
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: {
      canvasRedo: Record<never, unknown>;
      canvasUndo: Record<never, unknown>;
      extensionTaskFired: ExtensionTaskDelivery;
      pluginContentChanged: HostContentChangedEvent;
      openSearch: Record<never, unknown>;
      settingsUpdated: AppSettings;
      trashUpdated: Record<never, unknown>;
      viewsUpdated: Record<never, unknown>;
    };
  };
}

interface AppInfoResponse {
  channel: string;
  hash: string;
  identifier: string;
  name: string;
  version: string;
}

interface UpdateCheckResponse {
  currentHash: string;
  error?: string;
  hash: string;
  updateAvailable: boolean;
  version: string;
}

interface WorkspaceInfoResponse {
  isDefault: boolean;
  path: string;
}

interface ExportArchiveResponse {
  canceled?: boolean;
  filePath?: string;
  size?: number;
  success: boolean;
}

interface SwitchWorkspaceResponse {
  canceled?: boolean;
  path?: string;
  success: boolean;
}

const FONT_FAMILY_VALUES = ['system', 'serif', 'mono'] as const;
type FontFamilySetting = (typeof FONT_FAMILY_VALUES)[number];

const CANVAS_BACKGROUND_PRESETS = [
  'default',
  'paper',
  'cream',
  'mono',
  'lavender',
  'sage',
  'mist',
  'sand',
  'ivory',
  'mint',
  'lichen',
] as const;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function isCanvasBackgroundSetting(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (includes(CANVAS_BACKGROUND_PRESETS, value) || HEX_COLOR_RE.test(value))
  );
}

const AUTO_SAVE_INTERVAL_VALUES = [500, 800, 2000, 5000] as const;
type AutoSaveIntervalSetting = (typeof AUTO_SAVE_INTERVAL_VALUES)[number];

const AI_PROVIDER_VALUES = ['openai', 'anthropic', 'ollama', 'custom'] as const;

interface AppSettings {
  aiBaseUrl: string;
  aiEnabled: boolean;
  aiModel: string;
  aiProfiles?: AIProviderProfiles;
  aiProvider: (typeof AI_PROVIDER_VALUES)[number];
  autoSaveInterval: AutoSaveIntervalSetting;
  canvasBackground: string;
  canvasShowMinimap: boolean;
  canvasSnapToGrid: boolean;
  fontFamily: FontFamilySetting;
  locale: string;
  theme: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  locale: 'en',
  fontFamily: 'system',
  canvasBackground: 'default',
  canvasShowMinimap: false,
  canvasSnapToGrid: true,
  autoSaveInterval: 800,
  aiEnabled: false,
  aiProvider: 'openai',
  aiModel: 'gpt-4.1-mini',
  aiBaseUrl: '',
};

function includes<T extends string | number>(
  values: readonly T[],
  value: unknown
): value is T {
  return values.includes(value as T);
}

function normalizeAppSettings(raw: Partial<AppSettings>): AppSettings {
  return {
    theme: typeof raw.theme === 'string' ? raw.theme : DEFAULT_SETTINGS.theme,
    locale:
      typeof raw.locale === 'string' ? raw.locale : DEFAULT_SETTINGS.locale,
    fontFamily: includes(FONT_FAMILY_VALUES, raw.fontFamily)
      ? raw.fontFamily
      : DEFAULT_SETTINGS.fontFamily,
    canvasBackground: isCanvasBackgroundSetting(raw.canvasBackground)
      ? raw.canvasBackground
      : DEFAULT_SETTINGS.canvasBackground,
    canvasShowMinimap:
      typeof raw.canvasShowMinimap === 'boolean'
        ? raw.canvasShowMinimap
        : DEFAULT_SETTINGS.canvasShowMinimap,
    canvasSnapToGrid:
      typeof raw.canvasSnapToGrid === 'boolean'
        ? raw.canvasSnapToGrid
        : DEFAULT_SETTINGS.canvasSnapToGrid,
    autoSaveInterval: includes(AUTO_SAVE_INTERVAL_VALUES, raw.autoSaveInterval)
      ? raw.autoSaveInterval
      : DEFAULT_SETTINGS.autoSaveInterval,
    ...(raw.aiProfiles
      ? { aiProfiles: normalizeAIProfiles(raw.aiProfiles) }
      : {}),
    aiEnabled:
      typeof raw.aiEnabled === 'boolean'
        ? raw.aiEnabled
        : DEFAULT_SETTINGS.aiEnabled,
    aiProvider: includes(AI_PROVIDER_VALUES, raw.aiProvider)
      ? raw.aiProvider
      : DEFAULT_SETTINGS.aiProvider,
    aiModel:
      typeof raw.aiModel === 'string' ? raw.aiModel : DEFAULT_SETTINGS.aiModel,
    aiBaseUrl:
      typeof raw.aiBaseUrl === 'string'
        ? raw.aiBaseUrl
        : DEFAULT_SETTINGS.aiBaseUrl,
  };
}

// Cached in memory, backed by settings.json on disk
let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };
let settingsFilePath = '';
let mainWindow: BrowserWindow | null = null;
let diagnostics: DiagnosticsService | null = null;
// Local HTTP endpoint bridging the BlockNote editor to the LLM provider.
// Streaming responses cannot travel over RPC, so it runs on 127.0.0.1.
let localHttpServer: LocalHttpServerHandle | null = null;
// LLM API key loaded from ~/.ghostboard/{channel}/ai-credentials.json (never in settings.json)
let cachedAIKeys: Partial<Record<AIProvider, string>> = {};
let legacyEnvProvider: AIProvider = 'openai';
// Reference to main window RPC — set in main(), used by settings to push updates
let mainRpc: ReturnType<typeof BrowserView.defineRPC<CanvasRPC>> | null = null;

export async function loadSettings(wsPath: string): Promise<AppSettings> {
  settingsFilePath = join(wsPath, '.ghostboard', 'settings.json');
  const file = Bun.file(settingsFilePath);
  if (await file.exists()) {
    try {
      const raw = (await file.json()) as Partial<AppSettings>;
      cachedSettings = normalizeAppSettings({ ...DEFAULT_SETTINGS, ...raw });
    } catch {
      cachedSettings = { ...DEFAULT_SETTINGS };
    }
  } else {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

export async function persistSettings(settings: AppSettings) {
  const normalized = normalizeAppSettings(settings);
  if (settingsFilePath) {
    await atomicWrite(settingsFilePath, JSON.stringify(normalized, null, 2));
  }
  cachedSettings = normalized;
}

/**
 * Assemble the live AI server config from cached settings + the API key stored
 * in `~/.ghostboard/{channel}/ai-credentials.json`. Returns null when AI is disabled or a
 * cloud provider is missing its key, which makes /ai/chat reply 503.
 */
function getProviderKey(provider: AIProvider): string | undefined {
  const environmentKey =
    process.env[`GHOSTBOARD_AI_${provider.toUpperCase()}_API_KEY`] ||
    (provider === legacyEnvProvider
      ? process.env.GHOSTBOARD_AI_API_KEY
      : undefined);
  return cachedAIKeys[provider] || environmentKey;
}

function buildAIConfig(
  settings: AIConnectionSettings = cachedSettings
): AIServerConfig | null {
  if (settings === cachedSettings && !cachedSettings.aiEnabled) {
    return null;
  }
  const config: AIServerConfig = {
    provider: settings.aiProvider,
    model: settings.aiModel.trim(),
    apiKey: getProviderKey(settings.aiProvider),
    baseUrl: settings.aiBaseUrl.trim() || undefined,
  };
  return validateAIConfig(config) ? config : null;
}

async function getAppInfoData(): Promise<AppInfoResponse> {
  try {
    // Updater.getLocalInfo returns the full version.json shape
    // (version + hash + channel + name + identifier) — Updater.localInfo
    // only exposes a subset, so we use the lower-level call here.
    const info = await (
      Updater as unknown as {
        getLocalInfo: () => Promise<{
          channel: string;
          hash: string;
          identifier: string;
          name: string;
          version: string;
        }>;
      }
    ).getLocalInfo();
    return {
      version: info.version,
      hash: info.hash,
      channel: info.channel,
      name: info.name,
      identifier: info.identifier,
    };
  } catch (error) {
    console.warn('[settings] Failed to read app info:', error);
    return {
      version: '0.0.0',
      hash: '',
      channel: 'dev',
      name: 'GhostBoard',
      identifier: 'dev.ghostboard',
    };
  }
}

async function checkForUpdateImpl(): Promise<UpdateCheckResponse> {
  try {
    const localHash = await Updater.localInfo.hash().catch(() => '');
    const result = await Updater.checkForUpdate();
    return {
      currentHash: localHash,
      hash: result.hash ?? '',
      version: result.version ?? '',
      updateAvailable: Boolean(result.updateAvailable),
    };
  } catch (error) {
    return {
      currentHash: '',
      hash: '',
      version: '',
      updateAvailable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Pick a destination folder + filename for the workspace archive, then shell
 * out to `zip -r` to create the archive. Returns the resulting path / size or
 * `canceled: true` if the user dismissed the picker.
 */
async function exportWorkspaceArchiveImpl(
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

/**
 * Prompt the user to pick a new workspace directory. The new path is
 * persisted to `~/.ghostboard/{channel}/userprefs.json`; the renderer is expected to show
 * a "restart required" toast — switching wsPath in-process would require
 * tearing down every open RPC handler, manifest cache, and file watcher, so
 * we keep the pivot to a restart boundary.
 */
async function switchWorkspaceImpl(): Promise<SwitchWorkspaceResponse> {
  const selectedFolders = await Utils.openFileDialog({
    allowedFileTypes: '*',
    allowsMultipleSelection: false,
    canChooseDirectory: true,
    canChooseFiles: false,
    startingFolder: '~/',
  });
  const selectedFolder = selectedFolders.find(Boolean);
  if (!selectedFolder) {
    return { canceled: true, success: false };
  }
  const target = resolve(selectedFolder);
  // Initialize the workspace dirs eagerly so a brand-new folder boots into a
  // valid layout on next launch.
  try {
    initWorkspace(target);
  } catch (error) {
    console.warn('[settings] Failed to init new workspace:', error);
    return { success: false };
  }
  const prefs = await loadUserPrefs();
  prefs.workspacePath = target;
  await saveUserPrefs(prefs);
  return { success: true, path: target };
}

function setApplicationMenu() {
  ApplicationMenu.setApplicationMenu([
    {
      label: 'GhostBoard',
      submenu: [
        { role: 'about' },
        { type: 'divider' },
        { role: 'hide', accelerator: 'CmdOrCtrl+H' },
        { role: 'hideOthers', accelerator: 'CmdOrCtrl+Alt+H' },
        { role: 'showAll' },
        { type: 'divider' },
        { role: 'quit', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          action: 'canvasUndo',
          accelerator: 'CmdOrCtrl+Z',
        },
        {
          label: 'Redo',
          action: 'canvasRedo',
          accelerator: 'CmdOrCtrl+Shift+Z',
        },
        { type: 'divider' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Search…',
          action: 'openSearch',
          accelerator: 'CmdOrCtrl+K',
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', accelerator: 'CmdOrCtrl+M' },
        { role: 'close', accelerator: 'CmdOrCtrl+W' },
      ],
    },
  ]);
}

async function main() {
  if (!process.env.VITEST) {
    try {
      diagnostics = new DiagnosticsService(
        getAppDataRoot(),
        initialReportAppInfo(getAppChannel())
      );
      installDiagnosticLogging(diagnostics);
      const service = diagnostics;
      Electrobun.events.on('before-quit', () => service.shutdown());
      process.once('exit', (code) => {
        if (code === 0) {
          service.shutdown();
        }
      });
      const fatalError = (error: unknown) => {
        try {
          service.captureCrash(
            {
              source: 'main',
              name:
                error instanceof Error
                  ? error.name.slice(0, 128)
                  : 'UnhandledError',
              message: String(
                error instanceof Error ? error.message : error
              ).slice(0, 4096),
              stack:
                error instanceof Error
                  ? error.stack?.slice(0, 16_384)
                  : undefined,
            },
            true
          );
        } finally {
          process.exit(1);
        }
      };
      process.once('uncaughtException', fatalError);
      process.once('unhandledRejection', fatalError);
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
          service.shutdown();
          Utils.quit();
        });
      }
      const timer = setInterval(() => {
        try {
          service.heartbeat();
        } catch (error) {
          console.warn('[diagnostics] Heartbeat failed:', error);
        }
      }, 60_000);
      timer.unref();
      service.flush();
      getAppInfoData()
        .then((info) => service.updateAppInfo(info))
        .catch((error) => {
          console.warn('[diagnostics] Could not read app information:', error);
        });
    } catch (error) {
      diagnostics = null;
      console.warn('[diagnostics] Could not initialize diagnostics:', error);
    }
  }
  // NOTE on accelerators: Electrobun only auto-attaches standard macOS
  // shortcuts for the text-editing roles (undo, redo, cut, copy, paste,
  // pasteAndMatchStyle, delete, selectAll). All other roles — including quit,
  // close, minimize, hide, hideOthers — require an explicit `accelerator`,
  // otherwise pressing the system shortcut does nothing.
  setApplicationMenu();

  ApplicationMenu.on('application-menu-clicked', (event: unknown) => {
    const e = event as { data?: { action?: string } };
    if (e.data?.action === 'openSearch') {
      mainRpc?.send?.openSearch({});
    }
    if (e.data?.action === 'canvasUndo') {
      mainRpc?.send?.canvasUndo({});
    }
    if (e.data?.action === 'canvasRedo') {
      mainRpc?.send?.canvasRedo({});
    }
  });

  // Resolve workspace path from user prefs first; fall back to the default
  // when prefs are missing or point at a path that no longer exists.
  const prefs = await loadUserPrefs();
  const preferredPath =
    prefs.workspacePath && existsSync(prefs.workspacePath)
      ? prefs.workspacePath
      : undefined;
  const wsPath = initWorkspace(preferredPath);
  await seedFirstRunIfNeeded(wsPath);
  const pluginManagement = new PluginManagementService(wsPath);
  const pluginFiles = new PluginFileStore(pluginWorkspaceId(wsPath));
  const pluginProbeActive = [
    process.env.GHOSTBOARD_PLUGIN_T1_DIR,
    process.env.GHOSTBOARD_PLUGIN_T2_A4_DIR,
    process.env.GHOSTBOARD_PLUGIN_T2_CANVAS_DIR,
    process.env.GHOSTBOARD_PLUGIN_T2_CONTENT_DIR,
    process.env.GHOSTBOARD_PLUGIN_T2_HISTORY_DIR,
    process.env.GHOSTBOARD_PLUGIN_T2_SELECTION_DIR,
    process.env.GHOSTBOARD_PLUGIN_T3_DIR,
  ].some(Boolean);
  const pluginStartupGuard = pluginProbeActive
    ? undefined
    : await PluginStartupGuard.start({
        appDataRoot: getAppDataRoot(),
        argv: process.argv,
        env: process.env,
      });
  pluginManagement.recover().catch((error) => {
    console.warn('[plugins] Failed to recover package transactions:', error);
  });
  const [, , aiCredentials] = await Promise.all([
    migrateLegacyTagsFromNotes(wsPath),
    loadSettings(wsPath),
    loadAICredentials(),
  ]);
  // The LLM API key lives outside the workspace so it never lands in
  // `<workspace>/.ghostboard/settings.json`. Cache it in memory for the
  // duration of the run; the secure file is only touched on read/write.
  cachedAIKeys = aiCredentials.providers ?? {};
  legacyEnvProvider = cachedSettings.aiProvider;
  if (aiCredentials.apiKey && !cachedAIKeys[cachedSettings.aiProvider]) {
    await saveAIApiKey(aiCredentials.apiKey, cachedSettings.aiProvider);
    cachedAIKeys[cachedSettings.aiProvider] = aiCredentials.apiKey;
  }
  // Local HTTP endpoint for renderer calls that do not fit Electrobun RPC
  // well. The handle holds the localhost base URL + bearer token the renderer
  // connects with. AI config is resolved per-request so settings updates take
  // effect without restarting the server.
  localHttpServer = startLocalHttpServer({
    getAIConfig: () => buildAIConfig(),
    getWorkspacePath: () => wsPath,
    pluginContent: new NoteContentService(wsPath, pluginWorkspaceId(wsPath)),
    pluginFiles,
    pluginStorage: new PluginStorageHost({
      appDataRoot: getAppDataRoot(),
      workspacePath: wsPath,
      workspaceId: pluginWorkspaceId(wsPath),
    }),
    pluginRuntime: process.env.GHOSTBOARD_PLUGIN_T5_DIR
      ? new T5HostController(
          pluginManagement,
          pluginWorkspaceId(wsPath),
          process.env.GHOSTBOARD_PLUGIN_T5_DIR,
          {
            safeMode: pluginStartupGuard?.getState(),
            markStartupReady: () =>
              pluginStartupGuard?.markReady() ?? Promise.resolve(),
          }
        )
      : process.env.GHOSTBOARD_PLUGIN_T4_DIR
        ? new T4HostController(
            pluginManagement,
            pluginWorkspaceId(wsPath),
            process.env.GHOSTBOARD_PLUGIN_T4_DIR,
            wsPath,
            {
              safeMode: pluginStartupGuard?.getState(),
              markStartupReady: () =>
                pluginStartupGuard?.markReady() ?? Promise.resolve(),
            }
          )
        : process.env.GHOSTBOARD_PLUGIN_T3_DIR
          ? new T3HostController(
              pluginManagement,
              pluginWorkspaceId(wsPath),
              process.env.GHOSTBOARD_PLUGIN_T3_DIR
            )
          : process.env.GHOSTBOARD_PLUGIN_T1_DIR
            ? new T1HostController(
                pluginManagement,
                pluginWorkspaceId(wsPath),
                process.env.GHOSTBOARD_PLUGIN_T1_DIR
              )
            : process.env.GHOSTBOARD_PLUGIN_T2_A4_DIR
              ? new T2A4HostController(
                  pluginManagement,
                  pluginWorkspaceId(wsPath),
                  process.env.GHOSTBOARD_PLUGIN_T2_A4_DIR
                )
              : process.env.GHOSTBOARD_PLUGIN_T2_CONTENT_DIR
                ? new T2ContentHostController(
                    pluginManagement,
                    pluginWorkspaceId(wsPath),
                    process.env.GHOSTBOARD_PLUGIN_T2_CONTENT_DIR
                  )
                : process.env.GHOSTBOARD_PLUGIN_T2_HISTORY_DIR
                  ? new T2ContentHostController(
                      pluginManagement,
                      pluginWorkspaceId(wsPath),
                      process.env.GHOSTBOARD_PLUGIN_T2_HISTORY_DIR,
                      'history'
                    )
                  : process.env.GHOSTBOARD_PLUGIN_T2_CANVAS_DIR
                    ? new T2ContentHostController(
                        pluginManagement,
                        pluginWorkspaceId(wsPath),
                        process.env.GHOSTBOARD_PLUGIN_T2_CANVAS_DIR,
                        'canvas'
                      )
                    : process.env.GHOSTBOARD_PLUGIN_T2_SELECTION_DIR
                      ? new T2ContentHostController(
                          pluginManagement,
                          pluginWorkspaceId(wsPath),
                          process.env.GHOSTBOARD_PLUGIN_T2_SELECTION_DIR,
                          'selection'
                        )
                      : new PluginHostController(
                          pluginManagement,
                          pluginWorkspaceId(wsPath),
                          {
                            safeMode: pluginStartupGuard?.getState(),
                            markStartupReady: () =>
                              pluginStartupGuard?.markReady() ??
                              Promise.resolve(),
                          }
                        ),
  });
  subscribeContentChanges(wsPath, (event) => {
    mainRpc?.send?.pluginContentChanged(event);
  });
  const extensionScheduler = createExtensionSchedulerService({
    wsPath,
    deliver: (delivery) => {
      mainRpc?.send?.extensionTaskFired(delivery);
    },
  });
  const url = await getMainViewUrl();
  const isDevChannel = (await Updater.localInfo.channel()) === 'dev';

  const rpc = (mainRpc = BrowserView.defineRPC<CanvasRPC>({
    maxRequestTime: Number.POSITIVE_INFINITY,
    handlers: {
      requests: {
        loadCanvas: async ({ viewId }) => {
          const config = await loadWorkspaceConfig(wsPath);
          const viewEntry = config.views.find((v) => v.id === viewId);
          if (!viewEntry) {
            return null;
          }

          const manifest = await loadManifest(wsPath, viewEntry.file);
          if (!manifest) {
            return null;
          }

          const noteIndex = await buildNoteIndex(wsPath);
          const migratedWidgets: Record<string, WidgetRecord> = {};

          let hydratedNodes = await Promise.all(
            manifest.nodes.map(async (node) => {
              if (hasAttachmentRuntimeData(node.type)) {
                return {
                  ...node,
                  data: await hydrateAssetData(wsPath, node.data),
                };
              }

              // Hydrate image nodes. New images persist a small thumbnail and
              // the canvas displays it directly; the original full-resolution
              // `imageUrl` is loaded lazily by the focused / lightbox view.
              // Legacy images (no `thumbnailFile`) still hydrate `imageUrl`
              // eagerly so older manifests keep rendering as before.
              if (node.type === 'image') {
                return {
                  ...node,
                  data: await hydrateImageData(wsPath, node.data),
                };
              }

              // Hydrate card nodes that have a noteId reference
              if (node.type === 'card' && node.data.noteId) {
                const hydrated = await hydrateCardNoteData(
                  wsPath,
                  noteIndex,
                  node.data.noteId as string,
                  node.data
                );
                if (hydrated) {
                  const widgetReference =
                    await migrateChecklistCardToWidgetReference(
                      wsPath,
                      node.data.noteId as string,
                      hydrated,
                      migratedWidgets
                    );
                  if (widgetReference) {
                    return {
                      ...node,
                      type: 'widget',
                      data: widgetReference,
                    };
                  }
                  return { ...node, data: hydrated };
                }
                console.warn(
                  `[persistence] Note record not found for noteId=${node.data.noteId}`
                );
              }

              // Hydrate folder card-children from their individual .md files.
              // Legacy children (without a noteId) get one stamped here; the
              // next saveManifest pass will create the backing file.
              if (node.type === 'folder') {
                const rawChildren = (node.data.children ?? []) as Array<{
                  data?: Record<string, unknown>;
                  id: string;
                  noteId?: string;
                  type?: string;
                }>;
                const hydratedChildren = await Promise.all(
                  rawChildren.map(async (child) => {
                    if (hasAttachmentRuntimeData(child.type)) {
                      return {
                        ...child,
                        data: await hydrateAssetData(
                          wsPath,
                          (child.data ?? {}) as Record<string, unknown>
                        ),
                      };
                    }
                    if (child.type === 'image') {
                      return {
                        ...child,
                        data: await hydrateImageData(
                          wsPath,
                          (child.data ?? {}) as Record<string, unknown>
                        ),
                      };
                    }
                    if (child.type !== 'card') {
                      return child;
                    }
                    const childData = (child.data ?? {}) as Record<
                      string,
                      unknown
                    >;
                    const existingNoteId =
                      child.noteId ?? (childData.noteId as string | undefined);
                    if (!existingNoteId) {
                      const newNoteId = `note_${crypto.randomUUID().slice(0, 8)}`;
                      return {
                        ...child,
                        noteId: newNoteId,
                        data: { ...childData, noteId: newNoteId },
                      };
                    }
                    const hydrated = await hydrateCardNoteData(
                      wsPath,
                      noteIndex,
                      existingNoteId,
                      childData
                    );
                    if (hydrated) {
                      const widgetReference =
                        await migrateChecklistCardToWidgetReference(
                          wsPath,
                          existingNoteId,
                          hydrated,
                          migratedWidgets
                        );
                      if (widgetReference) {
                        return {
                          ...child,
                          noteId: existingNoteId,
                          type: 'widget',
                          data: widgetReference,
                        };
                      }
                      return {
                        ...child,
                        noteId: existingNoteId,
                        data: hydrated,
                      };
                    }
                    console.warn(
                      `[persistence] Missing note record for folder-child noteId=${existingNoteId}`
                    );
                    return {
                      ...child,
                      noteId: existingNoteId,
                      data: { ...childData, noteId: existingNoteId },
                    };
                  })
                );
                return {
                  ...node,
                  data: {
                    ...node.data,
                    children: hydratedChildren,
                  },
                };
              }
              return node;
            })
          );

          // Collect widgetIds referenced by top-level widget nodes and
          // folder-child widget entries, then batch-load their records.
          const widgetIds = new Set<string>();
          for (const node of hydratedNodes) {
            if (node.type === 'widget' && node.data?.widgetId) {
              widgetIds.add(node.data.widgetId as string);
            }
            if (node.type === 'folder') {
              const nodeData = node.data as Record<string, unknown>;
              const children = (nodeData.children ?? []) as Array<{
                data?: Record<string, unknown>;
                type?: string;
              }>;
              for (const child of children) {
                if (
                  child.type === 'widget' &&
                  (child.data?.widgetId as string | undefined)
                ) {
                  widgetIds.add(child.data?.widgetId as string);
                }
              }
            }
          }
          const widgets =
            widgetIds.size > 0
              ? await loadWidgets(wsPath, [...widgetIds])
              : undefined;
          const hydratedWidgets =
            Object.keys(migratedWidgets).length > 0
              ? { ...(widgets ?? {}), ...migratedWidgets }
              : widgets;

          // Persist the migration so the on-disk manifest matches the hydrated
          // widget references. Without this, search and other loadManifest
          // consumers still see legacy checklist cards, and a mid-session crash
          // re-runs the migration on every load. Only rewrite when a migration
          // actually occurred — and only patch migrated refs so hydrated
          // runtime content never pollutes the canvas JSON.
          let diskNodes = manifest.nodes;
          if (Object.keys(migratedWidgets).length > 0) {
            try {
              const persistedNodes = buildManifestNodesAfterWidgetMigration(
                manifest.nodes,
                hydratedNodes
              );
              await writeManifest(wsPath, viewEntry.file, {
                ...manifest,
                nodes: persistedNodes,
              });
              diskNodes = persistedNodes;
            } catch (error) {
              console.warn(
                '[persistence] Failed to persist checklist migration:',
                error
              );
            }
          }

          const appVersion = (await getAppInfoData()).version;
          const extensionMigration = await migrateLegacyCanvasNodes(
            wsPath,
            viewId,
            hydratedNodes,
            appVersion
          );
          if (extensionMigration.changed) {
            hydratedNodes = extensionMigration.nodes;
            try {
              await writeManifest(wsPath, viewEntry.file, {
                ...manifest,
                nodes: buildManifestNodesAfterExtensionMigration(
                  diskNodes,
                  extensionMigration.nodes
                ),
              });
            } catch (error) {
              console.warn(
                '[persistence] Failed to persist extension migration:',
                error
              );
            }
          }

          // Catch up on anything that came due while the app was closed. The
          // service owns the timer from here; this only shortens the wait for
          // overdue tasks when a canvas opens.
          extensionScheduler.tick().catch((error) => {
            console.warn('[extensions] scheduler tick failed', error);
          });

          const instanceIds = collectExtensionInstanceIds(hydratedNodes);
          const extensionInstances =
            instanceIds.length > 0
              ? await loadExtensionInstances(wsPath, instanceIds)
              : undefined;

          // Viewport is intentionally omitted: camera state is session-only
          // in the renderer and is never restored from disk.
          return {
            nodes: hydratedNodes,
            edges: manifest.edges,
            widgets: hydratedWidgets,
            extensionInstances,
          };
        },

        saveManifest: async ({ viewId, nodes, edges }) => {
          const workspace = wsPath;
          return withNoteWorkspace(workspace, async () => {
            try {
              const config = await loadWorkspaceConfig(workspace);
              const viewEntry = config.views.find((v) => v.id === viewId);
              if (!viewEntry) {
                return { success: false };
              }

              // Build note index (sidecars + legacy markdown) so we can find
              // existing notes and decide sidecar vs legacy handling.
              const noteIndex = await buildNoteIndex(workspace);

              // Resolve (or allocate) a note location for a card. Brand-new notes
              // get a legacy markdown stub which migrates to a sidecar on their
              // first focused-view edit.
              const resolveCardLocation = async (
                noteId: string,
                title: unknown,
                type: unknown
              ): Promise<NoteLocation> => {
                const existing = noteIndex.get(noteId);
                if (existing) {
                  return existing;
                }
                if (noteId.startsWith('plugin_note_')) {
                  throw new Error(
                    'Plugin-created note is missing; restore it before saving a placement'
                  );
                }
                const markdownFile = await createNote(
                  workspace,
                  noteId,
                  String(title || ''),
                  String(type || 'note')
                );
                const loc: NoteLocation = {
                  noteId,
                  hasSidecar: false,
                  markdownFile,
                };
                noteIndex.set(noteId, loc);
                return loc;
              };

              // Phase 1: Serially pre-allocate note locations for new card notes
              // (both top-level cards AND folder card-children) to avoid
              // concurrent createNote calls producing conflicting paths.
              const nodeLocMap = new Map<number, NoteLocation>();
              const folderChildLocMap = new Map<
                number,
                Map<number, NoteLocation>
              >();
              for (const [idx, node] of nodes.entries()) {
                if (node.type === 'card') {
                  const noteId =
                    (node.data.noteId as string) ||
                    `note_${crypto.randomUUID().slice(0, 8)}`;
                  // Attach noteId so phase 2 can read it back
                  node.data.noteId = noteId;
                  nodeLocMap.set(
                    idx,
                    // react-doctor-disable-next-line react-doctor/async-await-in-loop
                    await resolveCardLocation(
                      noteId,
                      node.data.title,
                      node.data.type
                    )
                  );
                  continue;
                }
                if (node.type === 'folder') {
                  const children = (node.data.children ?? []) as Array<{
                    data?: Record<string, unknown>;
                    id: string;
                    noteId?: string;
                    type?: string;
                  }>;
                  const childMap = new Map<number, NoteLocation>();
                  for (const [cidx, child] of children.entries()) {
                    if (child.type !== 'card') {
                      continue;
                    }
                    const childData = (child.data ?? {}) as Record<
                      string,
                      unknown
                    >;
                    const noteId =
                      child.noteId ||
                      (childData.noteId as string) ||
                      `note_${crypto.randomUUID().slice(0, 8)}`;
                    // Stamp noteId so phase 2 can read it back from both places
                    child.noteId = noteId;
                    childData.noteId = noteId;
                    child.data = childData;
                    childMap.set(
                      cidx,
                      // react-doctor-disable-next-line react-doctor/async-await-in-loop
                      await resolveCardLocation(
                        noteId,
                        childData.title,
                        childData.type
                      )
                    );
                  }
                  if (childMap.size > 0) {
                    folderChildLocMap.set(idx, childMap);
                  }
                }
              }

              // Phase 2: Write content in parallel (paths are now unique)
              const manifestNodes = await Promise.all(
                nodes.map(async (node, idx) => {
                  // Image nodes: strip imageUrl / thumbnailUrl (large base64),
                  // keep imageFile / thumbnailFile references.
                  if (node.type === 'image') {
                    return {
                      id: node.id,
                      type: node.type,
                      position: node.position,
                      ...(node.style ? { style: node.style } : {}),
                      ...(node.parentId ? { parentId: node.parentId } : {}),
                      ...(node.extent ? { extent: node.extent } : {}),
                      data: await serializeImageDataForManifest(
                        workspace,
                        node.data
                      ),
                    };
                  }

                  if (hasAttachmentRuntimeData(node.type)) {
                    return {
                      id: node.id,
                      type: node.type,
                      position: node.position,
                      ...(node.style ? { style: node.style } : {}),
                      ...(node.parentId ? { parentId: node.parentId } : {}),
                      ...(node.extent ? { extent: node.extent } : {}),
                      data: stripAttachmentRuntimeData(node.data),
                    };
                  }

                  // Folder nodes: write each card-child's .md file and serialize
                  // children as thin references (mirrors top-level card flow).
                  if (node.type === 'folder') {
                    const rawChildren = (node.data.children ?? []) as Array<{
                      data?: Record<string, unknown>;
                      id: string;
                      noteId?: string;
                      type?: string;
                    }>;
                    const childLocMap = folderChildLocMap.get(idx);
                    const serializedChildren = await Promise.all(
                      rawChildren.map(async (child, cidx) => {
                        if (hasAttachmentRuntimeData(child.type)) {
                          return {
                            ...child,
                            data: stripAttachmentRuntimeData(
                              (child.data ?? {}) as Record<string, unknown>
                            ),
                          };
                        }
                        if (child.type === 'image') {
                          const childData = (child.data ?? {}) as Record<
                            string,
                            unknown
                          >;
                          return {
                            ...child,
                            data: await serializeImageDataForManifest(
                              workspace,
                              childData
                            ),
                          };
                        }
                        if (child.type === 'widget') {
                          return {
                            id: child.id,
                            type: child.type,
                            data: serializeWidgetReference(child.data),
                          };
                        }
                        if (child.type !== 'card') {
                          return child;
                        }
                        const location = childLocMap?.get(cidx);
                        const noteId = child.noteId as string | undefined;
                        if (!(location && noteId)) {
                          return child;
                        }
                        const childData = (child.data ?? {}) as Record<
                          string,
                          unknown
                        >;
                        // Persist note content (sidecar-aware): sidecar-backed
                        // notes merge metadata only; legacy cards round-trip md.
                        await persistManifestCardNote(
                          workspace,
                          location,
                          noteId,
                          childData
                        );
                        return {
                          id: child.id,
                          noteId,
                          type: 'card' as const,
                          data: {
                            noteId,
                            ...(location.markdownFile
                              ? { file: location.markdownFile }
                              : {}),
                            type: childData.type,
                          },
                        };
                      })
                    );
                    return {
                      id: node.id,
                      type: node.type,
                      position: node.position,
                      ...(node.style ? { style: node.style } : {}),
                      ...(node.parentId ? { parentId: node.parentId } : {}),
                      ...(node.extent ? { extent: node.extent } : {}),
                      data: {
                        ...node.data,
                        children: serializedChildren,
                      },
                    };
                  }

                  // Only extract content for card nodes
                  if (node.type === 'widget') {
                    return {
                      id: node.id,
                      type: node.type,
                      position: node.position,
                      ...(node.style ? { style: node.style } : {}),
                      ...(node.parentId ? { parentId: node.parentId } : {}),
                      ...(node.extent ? { extent: node.extent } : {}),
                      data: serializeWidgetReference(node.data),
                    };
                  }
                  if (node.type !== 'card') {
                    return node;
                  }

                  const noteId = node.data.noteId as string | undefined;
                  const location = nodeLocMap.get(idx);
                  if (!(location && noteId)) {
                    // Phase 1 should always pre-allocate a location for every card.
                    // If one is missing (logic error, or a future refactor that
                    // makes Phase 1 tolerant of single-note failures), skip the
                    // note write and keep the node as-is instead of crashing the
                    // whole save. Mirrors the folder-child guard above.
                    return node;
                  }

                  // Persist note content (sidecar-aware): sidecar-backed notes merge
                  // metadata only; legacy cards round-trip markdown.
                  await persistManifestCardNote(
                    workspace,
                    location,
                    noteId,
                    node.data
                  );

                  // Return manifest-only node: strip content fields, keep reference
                  return {
                    id: node.id,
                    type: node.type,
                    position: node.position,
                    ...(node.style ? { style: node.style } : {}),
                    ...(node.parentId ? { parentId: node.parentId } : {}),
                    ...(node.extent ? { extent: node.extent } : {}),
                    data: {
                      noteId,
                      ...(location.markdownFile
                        ? { file: location.markdownFile }
                        : {}),
                      type: node.data.type, // keep for quick component selection
                      ...(node.data.detached ? { detached: true } : {}),
                    },
                  };
                })
              );

              // Omit viewport so legacy values are stripped on the next save.
              const manifest: CanvasManifest = {
                schema: 'ghostboard-canvas/v1',
                viewId,
                nodes: manifestNodes,
                edges,
              };
              await writeManifest(workspace, viewEntry.file, manifest);
              return { success: true };
            } catch (error) {
              console.warn('[persistence] Manifest save rejected:', error);
              return { success: false };
            }
          });
        },

        createWidget: async ({ kind, title }) => {
          try {
            const widget = await createWidget(wsPath, kind, title);
            return { success: true, widget };
          } catch (error) {
            console.error('[widgets] createWidget failed', error);
            return { success: false };
          }
        },

        cloneWidget: async ({ widgetId }) => {
          try {
            const widget = await cloneWidget(wsPath, widgetId);
            if (!widget) {
              return { success: false };
            }
            return { success: true, widget };
          } catch (error) {
            console.error('[widgets] cloneWidget failed', error);
            return { success: false };
          }
        },

        saveWidget: async ({ widget }) => {
          try {
            await saveWidget(wsPath, widget);
            return { success: true };
          } catch (error) {
            console.error('[widgets] saveWidget failed', error);
            return { success: false };
          }
        },

        deleteWidget: async ({ widgetId }) => {
          try {
            await deleteWidget(wsPath, widgetId);
            return { success: true };
          } catch (error) {
            console.error('[widgets] deleteWidget failed', error);
            return { success: false };
          }
        },

        pluginInstallList: async () => ({
          plugins: await pluginManagement.list(),
          safeMode: pluginStartupGuard?.getState() ?? {
            active: false,
            nextStart: 'normal',
          },
        }),

        pluginPrepareInstallFromFile: async () => {
          const selected = await Utils.openFileDialog({
            allowedFileTypes: '*',
            allowsMultipleSelection: false,
            canChooseDirectory: false,
            canChooseFiles: true,
            startingFolder: '~/',
          });
          const filePath = selected.find(Boolean);
          if (!filePath) {
            return { success: false, cancelled: true };
          }
          try {
            return {
              success: true,
              preview: await pluginManagement.prepareFromFile(filePath),
            };
          } catch (error) {
            return { success: false, error: pluginInstallErrorMessage(error) };
          }
        },

        pluginPrepareDevelopmentDirectory: async () => {
          const selected = await Utils.openFileDialog({
            allowedFileTypes: '*',
            allowsMultipleSelection: false,
            canChooseDirectory: true,
            canChooseFiles: false,
            startingFolder: '~/',
          });
          const directory = selected.find(Boolean);
          if (!directory) {
            return { success: false, cancelled: true };
          }
          try {
            return {
              success: true,
              preview:
                await pluginManagement.prepareDevelopmentDirectory(directory),
            };
          } catch (error) {
            return { success: false, error: pluginInstallErrorMessage(error) };
          }
        },

        pluginPrepareInstallFromUrl: async ({ url }) => {
          try {
            return {
              success: true,
              preview: await pluginManagement.prepareFromUrl(url),
            };
          } catch (error) {
            return { success: false, error: pluginInstallErrorMessage(error) };
          }
        },

        pluginPrepareUpdate: async ({ digest, pluginId }) => {
          try {
            return {
              success: true,
              preview: await pluginManagement.prepareUpdate({
                digest,
                pluginId,
              }),
            };
          } catch (error) {
            return { success: false, error: pluginInstallErrorMessage(error) };
          }
        },

        pluginCommitInstall: async ({ transactionId }) => {
          try {
            return {
              success: true,
              plugin: await pluginManagement.commit(transactionId),
            };
          } catch (error) {
            return { success: false, error: pluginInstallErrorMessage(error) };
          }
        },

        pluginCancelInstall: async ({ transactionId }) => {
          try {
            await pluginManagement.cancel(transactionId);
            return { success: true };
          } catch (error) {
            console.warn('[plugins] Failed to cancel install:', error);
            return { success: false };
          }
        },

        pluginEnable: async ({ digest, pluginId }) => {
          try {
            const plugin = await pluginManagement.enable({
              digest,
              pluginId,
            });
            return { success: true, plugin };
          } catch (error) {
            return { success: false, error: pluginInstallErrorMessage(error) };
          }
        },

        pluginDisable: async ({ digest, pluginId }) => {
          try {
            const plugin = await pluginManagement.disable({
              digest,
              pluginId,
            });
            return { success: true, plugin };
          } catch (error) {
            return { success: false, error: pluginInstallErrorMessage(error) };
          }
        },

        pluginRollback: async ({ digest, pluginId }) => {
          try {
            return {
              success: true,
              plugin: await pluginManagement.rollback({ digest, pluginId }),
            };
          } catch (error) {
            return { success: false, error: pluginInstallErrorMessage(error) };
          }
        },

        pluginRestoreMigrationBackup: async ({ pluginId }) => {
          try {
            return {
              success: true,
              ...(await pluginManagement.restoreMigrationBackup(pluginId)),
            };
          } catch (error) {
            return { success: false, error: pluginInstallErrorMessage(error) };
          }
        },

        pluginSafeModePrepareNormalStart: async () => {
          if (!pluginStartupGuard) {
            return {
              success: true,
              safeMode: { active: false, nextStart: 'normal' },
            };
          }
          try {
            return {
              success: true,
              safeMode: await pluginStartupGuard.prepareNormalStart(),
            };
          } catch (error) {
            return {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not prepare a normal plugin start.',
            };
          }
        },

        pluginFilesPick: async (request) => {
          try {
            pluginFiles.validateContext(request);
            const kind = request.kind ?? 'file';
            if (kind === 'directory' && request.multiple) {
              throw new Error(
                'Directory selection does not support multiple items.'
              );
            }
            const selected =
              scriptedProbeSelection(process.env, kind) ??
              (await Utils.openFileDialog({
                allowedFileTypes:
                  kind === 'file'
                    ? pluginPickerFileTypes(request.extensions)
                    : '*',
                allowsMultipleSelection:
                  kind === 'file' && request.multiple === true,
                canChooseDirectory: kind === 'directory',
                canChooseFiles: kind === 'file',
                startingFolder: '~/Documents',
              }));
            const paths = selected.filter(Boolean);
            if (paths.length === 0) {
              return { success: false, cancelled: true };
            }
            return {
              success: true,
              files: await pluginFiles.registerSelection(request, paths, kind),
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },

        pluginFilesReadText: async (request) => {
          try {
            return {
              success: true,
              text: await pluginFiles.readText(request, request.handleId),
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },

        pluginFilesListDirectory: async (request) => {
          try {
            return await pluginFiles.listDirectory(request);
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },

        pluginFilesRelease: async (request) => {
          try {
            pluginFiles.release(request, request.handleIds);
            return { success: true };
          } catch {
            return { success: false };
          }
        },

        extensionEnablementList: async () => {
          const enablement = await loadExtensionEnablement(wsPath);
          const instanceCounts = await countInstancesByCanvasType(wsPath);
          return {
            disabledCanvasTypes: enablement.disabledCanvasTypes,
            instanceCounts,
          };
        },

        extensionEnablementSetEnabled: async ({ canvasTypeId, enabled }) => {
          try {
            const enablement = await setCanvasTypeEnabled(
              wsPath,
              canvasTypeId,
              enabled
            );
            return { success: true, enablement };
          } catch (error) {
            console.error('[extensions] setEnabled failed', error);
            return { success: false };
          }
        },

        extensionInstanceCreate: async ({
          canvasTypeId,
          dataVersion,
          id,
          presentation,
          state,
        }) => {
          try {
            const appVersion = (await getAppInfoData()).version;
            const record = await createExtensionInstance(wsPath, {
              appVersion,
              canvasTypeId,
              dataVersion,
              ...(id ? { id } : {}),
              presentation,
              state,
            });
            return { success: true, record };
          } catch (error) {
            console.error('[extensions] create instance failed', error);
            return { success: false };
          }
        },

        extensionInstanceLoadMany: async ({ instanceIds }) => ({
          records: await loadExtensionInstances(wsPath, instanceIds),
        }),

        extensionInstanceUpdate: async ({
          dataVersion,
          expectedRevision,
          instanceId,
          presentation,
          state,
        }) => {
          try {
            const appVersion = (await getAppInfoData()).version;
            const updated = await updateExtensionInstance(wsPath, {
              appVersion,
              ...(dataVersion !== undefined ? { dataVersion } : {}),
              expectedRevision,
              instanceId,
              presentation,
              state,
            });
            if ('error' in updated) {
              return { success: false };
            }
            return { success: true, record: updated.record };
          } catch (error) {
            console.error('[extensions] update instance failed', error);
            return { success: false };
          }
        },

        extensionInstanceClone: async ({ instanceId }) => {
          try {
            const record = await cloneExtensionInstance(wsPath, instanceId);
            if (!record) {
              return { success: false };
            }
            return { success: true, record };
          } catch (error) {
            console.error('[extensions] clone instance failed', error);
            return { success: false };
          }
        },

        extensionInstanceClearType: async ({ canvasTypeId }) => {
          try {
            const deleted = await deleteInstancesByCanvasType(
              wsPath,
              canvasTypeId
            );
            await cancelExtensionTasksByInstance(wsPath, deleted);
            return { success: true, deleted: deleted.length };
          } catch (error) {
            console.error('[extensions] clear type data failed', error);
            return { success: false, deleted: 0 };
          }
        },

        extensionSchedulerSchedule: async (task) => {
          try {
            await scheduleExtensionTask(wsPath, task);
            await extensionScheduler.notifyTasksChanged();
            return { success: true };
          } catch (error) {
            console.error('[extensions] schedule failed', error);
            return { success: false };
          }
        },

        extensionSchedulerCancel: async ({ instanceId, taskId }) => {
          try {
            await cancelExtensionTask(wsPath, instanceId, taskId);
            await extensionScheduler.notifyTasksChanged();
            return { success: true };
          } catch (error) {
            console.error('[extensions] cancel task failed', error);
            return { success: false };
          }
        },

        extensionSchedulerAck: async ({ deliveryId }) => {
          try {
            await extensionScheduler.ack(deliveryId);
            return { success: true };
          } catch (error) {
            console.error('[extensions] scheduler ack failed', error);
            return { success: false };
          }
        },

        extensionSchedulerList: async ({ instanceId }) => {
          try {
            return { tasks: await listExtensionTasks(wsPath, instanceId) };
          } catch (error) {
            if (error instanceof ExtensionTaskFileError) {
              // Listing degrades to empty, but scheduling still fails loudly
              // so nobody overwrites the preserved file.
              return { diagnostic: error.message, tasks: [] };
            }
            throw error;
          }
        },

        saveNote: async ({ noteId, frontmatter, body }) => {
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
        },

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
            const needsMirrorCleanup =
              !existing || existing.preview === undefined;
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

        deleteNote: async ({ noteId }) => {
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
        },

        saveAttachment: async (params) => {
          const saved = await saveWorkspaceAttachment(wsPath, params);
          // Generate any text excerpt / archive summary the renderer can show
          // on the canvas card. Failures are swallowed inside the helper so
          // the save itself never blocks on metadata.
          const { fullPath } = assertWorkspaceAttachmentPath(
            wsPath,
            saved.filePath
          );
          const metadata = await generateFileMetadata(
            fullPath,
            params.mimeType ?? ''
          );
          return { ...saved, ...metadata };
        },

        saveAttachmentFile: async (params) => {
          const saved = await saveWorkspaceAttachmentFile(wsPath, params);
          const { fullPath } = assertWorkspaceAttachmentPath(
            wsPath,
            saved.filePath
          );
          const metadata = await generateFileMetadata(
            fullPath,
            params.mimeType ?? ''
          );
          return { ...saved, ...metadata };
        },

        generateVideoThumbnail: async ({ attachmentFile }) => {
          const { fullPath } = assertWorkspaceAttachmentPath(
            wsPath,
            attachmentFile
          );
          const thumbnailFile = await generateVideoPosterFile(wsPath, fullPath);
          return thumbnailFile ? { thumbnailFile } : {};
        },

        loadAttachment: async ({ filePath }) =>
          loadWorkspaceAttachment(wsPath, filePath),

        openAttachment: async ({ filePath }) =>
          openWorkspaceAttachment(wsPath, filePath),

        revealAttachment: async ({ filePath }) =>
          revealWorkspaceAttachment(wsPath, filePath),

        toggleWindowMaximize: () => {
          if (!mainWindow) {
            return { success: false, maximized: false };
          }

          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
            return { success: true, maximized: false };
          }

          mainWindow.maximize();
          return { success: true, maximized: true };
        },

        openExternalUrl: ({ url }) => {
          // Restrict to common safe schemes. file:// / javascript: / custom
          // app schemes never leave this gate so a malicious link node cannot
          // pivot through the bun process.
          let parsed: URL;
          try {
            parsed = new URL(url);
          } catch {
            return { success: false };
          }
          if (
            parsed.protocol !== 'http:' &&
            parsed.protocol !== 'https:' &&
            parsed.protocol !== 'mailto:'
          ) {
            return { success: false };
          }
          return { success: Utils.openExternal(url) };
        },

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
                const filePath = await createNote(
                  wsPath,
                  noteId,
                  title,
                  'text'
                );
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
        },

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
          } else if (scope === 'view' && viewId) {
            const config = await loadWorkspaceConfig(wsPath);
            const view = config.views.find((v) => v.id === viewId);
            if (view) {
              const refs = collectViewExportRefs(
                await loadManifest(wsPath, view.file)
              );
              ids = refs.noteIds;
              widgetIds = refs.widgetIds;
              source = `Canvas: ${view.name}`;
            }
          } else {
            const records = await listNoteRecords(wsPath);
            ids = records.map((record) => record.noteId);
          }

          const folder = await pickExportFolder();
          if (!folder) {
            return { canceled: true, exported: 0, failed: 0, success: false };
          }

          const exportDir = resolve(folder, EXPORT_DIR_NAME);
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
            success: true,
          };
        },

        getSettings: () => cachedSettings,

        getDiagnosticsStatus: () =>
          diagnostics?.status() ?? {
            autoUpload: false,
            configured: false,
            pendingReports: 0,
          },

        getDiagnosticsPreview: () => ({ logs: diagnostics?.preview() ?? '' }),

        setCrashAutoUpload: ({ enabled }) => {
          if (typeof enabled !== 'boolean' || !diagnostics) {
            throw new Error('Diagnostics unavailable');
          }
          return diagnostics.setAutoUpload(enabled);
        },

        submitFeedback: (input) =>
          diagnostics?.submitFeedback(input) ?? {
            success: false as const,
            error: 'unavailable' as const,
          },

        recordRendererDiagnostic: ({ level, message, crash }) => {
          if (
            !(diagnostics && ['warn', 'error'].includes(level)) ||
            typeof message !== 'string'
          ) {
            return { success: false };
          }
          diagnostics.record(level, 'renderer', message.slice(0, 4096));
          if (crash) {
            const parsed = reportErrorSchema.safeParse(crash);
            if (parsed.success && parsed.data.source === 'renderer') {
              diagnostics.captureCrash(parsed.data);
            }
          }
          return { success: true };
        },

        saveSettings: async (settings) => {
          await persistSettings(settings);
          mainRpc?.send?.settingsUpdated(cachedSettings);
          return { success: true };
        },

        getAICredentialStatus: ({
          provider = cachedSettings.aiProvider,
        } = {}) => ({
          hasApiKey: Boolean(getProviderKey(provider)),
          source: cachedAIKeys[provider]
            ? 'stored'
            : getProviderKey(provider)
              ? 'environment'
              : 'none',
        }),

        setAIApiKey: async ({
          apiKey,
          provider = cachedSettings.aiProvider,
        }) => {
          if (!isAIProvider(provider)) {
            return { success: false };
          }
          await saveAIApiKey(apiKey, provider);
          if (apiKey?.trim()) {
            cachedAIKeys[provider] = apiKey.trim();
          } else {
            delete cachedAIKeys[provider];
          }
          mainRpc?.send?.settingsUpdated(cachedSettings);
          return { success: true };
        },

        testAIConnection: async (settings) => {
          if (
            !isAIProvider(settings.aiProvider) ||
            typeof settings.aiModel !== 'string' ||
            typeof settings.aiBaseUrl !== 'string'
          ) {
            return { success: false, error: 'configuration' };
          }
          const config = buildAIConfig(settings);
          return config
            ? testAIConnection(config)
            : { success: false, error: 'configuration' };
        },

        aiRunTask: async (params) => {
          const config = buildAIConfig();
          if (!config) {
            return { success: false, error: 'ai-disabled' };
          }
          return runAITask(params, config, wsPath);
        },

        listTrash: async () => await listTrash(wsPath),

        restoreTrash: async ({ trashId }) => {
          const result = await restoreView(wsPath, trashId);
          if (result.success) {
            mainRpc?.send?.viewsUpdated({});
            mainRpc?.send?.trashUpdated({});
          }
          return { success: result.success };
        },

        purgeTrash: async ({ trashId }) => await purgeTrash(wsPath, trashId),

        clearAllTrash: async () => await clearAllTrash(wsPath),

        scanUnlinkedNotes: async () => {
          const entries = await scanUnlinkedNotes(wsPath);
          return { entries };
        },

        deleteUnlinkedNotes: async ({ files }) =>
          await deleteUnlinkedNotes(wsPath, files),

        getWorkspaceInfo: async () => {
          const defaultPath = getDefaultWorkspacePath();
          return {
            path: wsPath,
            isDefault: resolve(wsPath) === resolve(defaultPath),
          };
        },

        openWorkspaceFolder: () => {
          Utils.showItemInFolder(wsPath);
          return { success: true };
        },

        switchWorkspace: () => switchWorkspaceImpl(),

        exportWorkspaceArchive: () => exportWorkspaceArchiveImpl(wsPath),

        getAppInfo: () => getAppInfoData(),

        checkForUpdate: () => checkForUpdateImpl(),

        getLocalHttpEndpoint: () => ({
          baseUrl: localHttpServer?.baseUrl ?? '',
          token: localHttpServer?.token ?? '',
          aiEnabled: localHttpServer != null && buildAIConfig() !== null,
        }),

        listViews: async () => {
          const config = await loadWorkspaceConfig(wsPath);
          return { views: config.views, activeViewId: config.activeViewId };
        },

        createView: async ({ name }) => {
          const entry = await addView(wsPath, name);
          // Write an empty manifest for the new view
          await writeManifest(wsPath, entry.file, {
            schema: 'ghostboard-canvas/v1',
            viewId: entry.id,
            nodes: [],
            edges: [],
          });
          return entry;
        },

        deleteView: async ({ viewId }) => {
          const result = await removeView(wsPath, viewId);
          if (!result.success) {
            return { success: false };
          }
          // Notify the main renderer so an open Settings dialog refreshes Trash.
          mainRpc?.send?.trashUpdated({});
          return {
            success: true,
            activeViewId: result.activeViewId,
            trashId: result.trashId,
          };
        },

        restoreView: async ({ trashId }) => {
          const result = await restoreView(wsPath, trashId);
          if (!result.success) {
            return { success: false };
          }
          mainRpc?.send?.trashUpdated({});
          return {
            success: true,
            view: result.view,
            activeViewId: result.activeViewId,
          };
        },

        renameView: async ({ viewId, name }) => {
          const success = await renameView(wsPath, viewId, name);
          return { success };
        },

        setActiveView: async ({ viewId }) => {
          const success = await setActiveViewId(wsPath, viewId);
          return { success };
        },

        searchCanvas: async ({ query, viewId, limit }) =>
          await searchWorkspace(wsPath, { query, viewId, limit }),

        listTags: async () => await listAllTagsFromMetadata(wsPath),

        renameTag: async ({ oldName, newName }) =>
          await renameTagEverywhere(wsPath, oldName, newName),

        deleteTag: async ({ name }) => await deleteTagEverywhere(wsPath, name),

        loadNodeMetadata: async () => await loadAllMetadata(wsPath),

        setNodeMetadata: async ({ id, metadata }) => {
          await setNodeMetadata(wsPath, id, metadata);
          return { success: true };
        },

        deleteNodeMetadata: async ({ id }) => {
          await deleteNodeMetadata(wsPath, id);
          return { success: true };
        },

        listTemplates: () => listAllTemplates(),

        getTemplate: ({ id }) => loadTemplate(id),

        createViewFromTemplate: async ({ name, templateId }) => {
          const result = await addViewFromTemplate(wsPath, name, templateId);
          return result.entry;
        },

        saveTemplateThumbnail: async ({ templateId, pngBase64 }) => {
          // Dev-only: refuse in production launches so packaged apps can't
          // accidentally write back into source-tree paths that don't exist.
          if (!isDevChannel) {
            return { success: false, reason: 'production-mode' };
          }
          return await writeTemplateThumbnail(templateId, pngBase64);
        },

        checkLicense: async () => await checkLicenseStatus(),

        activateLicense: async (params: { key: string }) =>
          await activateLicenseKey(params.key),
      },
      messages: {},
    },
  }));

  mainWindow = new BrowserWindow({
    title: 'React + Tailwind + Vite',
    url,
    rpc,
    titleBarStyle: 'hiddenInset',
    frame: {
      width: 900,
      height: 700,
      x: 200,
      y: 200,
    },
  });

  // Arm the host timer for this workspace. Tasks that come due before the
  // renderer is listening are re-delivered until it acks.
  extensionScheduler.tick().catch((error) => {
    console.warn('[extensions] scheduler start failed', error);
  });

  return mainWindow;
}

main().catch((err) => {
  console.error(err);
  diagnostics?.captureCrash(
    {
      source: 'main',
      name: 'StartupError',
      message: String(err instanceof Error ? err.message : err).slice(0, 4096),
      stack: err instanceof Error ? err.stack?.slice(0, 16_384) : undefined,
    },
    true
  );
  if (!process.env.VITEST) {
    process.exit(1);
  }
});
