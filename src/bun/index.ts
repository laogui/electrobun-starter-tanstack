import { existsSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

import {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  Updater,
  Utils,
} from 'electrobun/bun';
import type { AIServerConfig } from './ai';
import { loadAICredentials, saveAIApiKey } from './aicredentials';
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
import {
  deleteUnlinkedNotes,
  scanUnlinkedNotes,
  type UnlinkedFileEntry,
} from './cleanup';
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
} from './notes';
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
const SETTINGS_DEV_SERVER_URL = `${DEV_SERVER_URL}/settings.html`;
const SETTINGS_VIEW_URL = 'views://settingsview/index.html';
const PNG_DATA_URL_RE = /^data:image\/png;base64,(.+)$/i;
const DEV_SERVER_RETRY_COUNT = 20;
const DEV_SERVER_RETRY_DELAY_MS = 250;
const SETTINGS_WINDOW_WIDTH = 720;
const SETTINGS_WINDOW_HEIGHT = 560;
const UNSAFE_EXPORT_FILE_NAME_CHARS = '<>:"/\\|?*';

function sanitizeExportBaseName(base: string): string {
  let safe = '';
  for (const char of base.trim()) {
    safe +=
      char.charCodeAt(0) < 32 || UNSAFE_EXPORT_FILE_NAME_CHARS.includes(char)
        ? '-'
        : char;
  }
  return safe
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 80);
}

function safeExportFileName(fileName: string, extension: 'json' | 'png') {
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
  for (const rel of attachments) {
    if (!EXPORT_ATTACHMENT_RE.test(rel) || rel.includes('..')) {
      continue;
    }
    try {
      await Bun.write(
        join(destDir, basename(rel)),
        Bun.file(resolve(wsPath, rel))
      );
    } catch (error) {
      console.warn(`[export] Failed to copy attachment ${rel}:`, error);
    }
  }
}

/** Collect every noteId referenced by a canvas manifest (cards + folder kids). */
function collectViewNoteIds(manifest: CanvasManifest | null): string[] {
  const ids = new Set<string>();
  for (const node of manifest?.nodes ?? []) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (typeof data.noteId === 'string' && data.noteId) {
      ids.add(data.noteId);
    }
    const children = data.children;
    if (!Array.isArray(children)) {
      continue;
    }
    for (const child of children) {
      const c = (child ?? {}) as Record<string, unknown>;
      if (typeof c.noteId === 'string' && c.noteId) {
        ids.add(c.noteId);
      }
      const childData = c.data as Record<string, unknown> | undefined;
      if (typeof childData?.noteId === 'string' && childData.noteId) {
        ids.add(childData.noteId);
      }
    }
  }
  return [...ids];
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
const FALLBACK_SETTINGS_WINDOW_X = 350;
const FALLBACK_SETTINGS_WINDOW_Y = 250;

export async function sleep(ms: number) {
  return await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForDevServer(): Promise<boolean> {
  for (let attempt = 0; attempt < DEV_SERVER_RETRY_COUNT; attempt += 1) {
    try {
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

export function getSettingsViewUrl(mainViewUrl: string): string {
  return mainViewUrl === DEV_SERVER_URL
    ? SETTINGS_DEV_SERVER_URL
    : SETTINGS_VIEW_URL;
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

interface CanvasRPC {
  bun: {
    requests: {
      loadCanvas: {
        params: { viewId: string };
        response: {
          nodes: ManifestNode[];
          edges: ManifestEdge[];
          viewport?: { x: number; y: number; zoom: number };
        } | null;
      };
      saveManifest: {
        params: {
          viewId: string;
          nodes: ManifestNode[];
          edges: ManifestEdge[];
          viewport?: { x: number; y: number; zoom: number };
        };
        response: { success: boolean };
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
        params: { noteId: string };
        response: {
          success: boolean;
          blocks?: unknown[];
          markdown?: string;
          frontmatter?: Record<string, unknown>;
          revision?: number;
          recoveredFromMarkdown?: boolean;
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
      openSettings: {
        params: Record<string, unknown>;
        response: { success: boolean };
      };
      getSettings: {
        params: Record<string, unknown>;
        response: AppSettings;
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
      openSearch: Record<never, unknown>;
      settingsUpdated: AppSettings;
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

interface SettingsRPC {
  bun: {
    requests: {
      checkForUpdate: {
        params: Record<string, unknown>;
        response: UpdateCheckResponse;
      };
      clearAllTrash: {
        params: Record<string, unknown>;
        response: { purged: number; success: boolean };
      };
      deleteUnlinkedNotes: {
        params: { files: string[] };
        response: { deleted: string[]; skipped: string[] };
      };
      exportWorkspaceArchive: {
        params: Record<string, unknown>;
        response: ExportArchiveResponse;
      };
      getAICredentialStatus: {
        params: Record<string, unknown>;
        response: { hasApiKey: boolean };
      };
      getAppInfo: {
        params: Record<string, unknown>;
        response: AppInfoResponse;
      };
      getSettings: {
        params: Record<string, unknown>;
        response: AppSettings;
      };
      getWorkspaceInfo: {
        params: Record<string, unknown>;
        response: WorkspaceInfoResponse;
      };
      listTrash: {
        params: Record<string, unknown>;
        response: TrashEntry[];
      };
      openWorkspaceFolder: {
        params: Record<string, unknown>;
        response: { success: boolean };
      };
      purgeTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      restoreTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      saveSettings: {
        params: AppSettings;
        response: { success: boolean };
      };
      scanUnlinkedNotes: {
        params: Record<string, unknown>;
        response: { entries: UnlinkedFileEntry[] };
      };
      setAIApiKey: {
        params: { apiKey: string | null };
        response: { success: boolean };
      };
      switchWorkspace: {
        params: Record<string, unknown>;
        response: SwitchWorkspaceResponse;
      };
      checkLicense: {
        params: Record<string, unknown>;
        response: LicenseInfo;
      };
      activateLicense: {
        params: { key: string };
        response: { success: boolean; error?: string };
      };
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: {
      trashUpdated: Record<never, unknown>;
    };
  };
}

const FONT_FAMILY_VALUES = ['system', 'serif', 'mono'] as const;
type FontFamilySetting = (typeof FONT_FAMILY_VALUES)[number];

const CANVAS_BACKGROUND_VALUES = ['default', 'paper', 'mono'] as const;
type CanvasBackgroundSetting = (typeof CANVAS_BACKGROUND_VALUES)[number];

const AUTO_SAVE_INTERVAL_VALUES = [500, 800, 2000, 5000] as const;
type AutoSaveIntervalSetting = (typeof AUTO_SAVE_INTERVAL_VALUES)[number];

const AI_PROVIDER_VALUES = ['openai', 'anthropic', 'ollama', 'custom'] as const;

interface AppSettings {
  aiBaseUrl: string;
  aiEnabled: boolean;
  aiModel: string;
  aiProvider: (typeof AI_PROVIDER_VALUES)[number];
  autoSaveInterval: AutoSaveIntervalSetting;
  canvasBackground: CanvasBackgroundSetting;
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
    canvasBackground: includes(CANVAS_BACKGROUND_VALUES, raw.canvasBackground)
      ? raw.canvasBackground
      : DEFAULT_SETTINGS.canvasBackground,
    canvasSnapToGrid:
      typeof raw.canvasSnapToGrid === 'boolean'
        ? raw.canvasSnapToGrid
        : DEFAULT_SETTINGS.canvasSnapToGrid,
    autoSaveInterval: includes(AUTO_SAVE_INTERVAL_VALUES, raw.autoSaveInterval)
      ? raw.autoSaveInterval
      : DEFAULT_SETTINGS.autoSaveInterval,
    aiEnabled:
      typeof raw.aiEnabled === 'boolean'
        ? raw.aiEnabled
        : DEFAULT_SETTINGS.aiEnabled,
    aiProvider: includes(AI_PROVIDER_VALUES, raw.aiProvider)
      ? raw.aiProvider
      : DEFAULT_SETTINGS.aiProvider,
    aiModel:
      typeof raw.aiModel === 'string' && raw.aiModel.length
        ? raw.aiModel
        : DEFAULT_SETTINGS.aiModel,
    aiBaseUrl:
      typeof raw.aiBaseUrl === 'string'
        ? raw.aiBaseUrl
        : DEFAULT_SETTINGS.aiBaseUrl,
  };
}

// Cached in memory, backed by settings.json on disk
let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };
let settingsFilePath = '';
let settingsViewUrl = SETTINGS_VIEW_URL;
let settingsWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
// Local HTTP endpoint bridging the BlockNote editor to the LLM provider.
// Streaming responses cannot travel over RPC, so it runs on 127.0.0.1.
let localHttpServer: LocalHttpServerHandle | null = null;
// LLM API key loaded from <userData>/ai-credentials.json (never in settings.json)
let cachedAIApiKey: string | null = null;
// Reference to main window RPC — set in main(), used by settings to push updates
let mainRpc: ReturnType<typeof BrowserView.defineRPC<CanvasRPC>> | null = null;
// Reference to settings window RPC — set when the settings window is opened.
// The main window uses this to push trash-list refresh hints into settings.
let settingsRpc: ReturnType<typeof BrowserView.defineRPC<SettingsRPC>> | null =
  null;

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
  cachedSettings = normalized;
  if (settingsFilePath) {
    await atomicWrite(settingsFilePath, JSON.stringify(normalized, null, 2));
  }
}

/**
 * Assemble the live AI server config from cached settings + the API key stored
 * in `<userData>/ai-credentials.json`. Returns null when AI is disabled or a
 * cloud provider is missing its key, which makes /ai/chat reply 503.
 */
function buildAIConfig(): AIServerConfig | null {
  if (!cachedSettings.aiEnabled) {
    return null;
  }
  const provider = cachedSettings.aiProvider;
  const apiKey = cachedAIApiKey ?? process.env.GHOSTBOARD_AI_API_KEY;
  const needsKey = provider === 'openai' || provider === 'anthropic';
  if (needsKey && !apiKey) {
    return null;
  }
  return {
    provider,
    model: cachedSettings.aiModel,
    apiKey: apiKey ?? undefined,
    baseUrl: cachedSettings.aiBaseUrl || undefined,
  };
}

function getCenteredSettingsWindowFrame(parentWindow: BrowserWindow | null) {
  if (!parentWindow) {
    return {
      width: SETTINGS_WINDOW_WIDTH,
      height: SETTINGS_WINDOW_HEIGHT,
      x: FALLBACK_SETTINGS_WINDOW_X,
      y: FALLBACK_SETTINGS_WINDOW_Y,
    };
  }

  const parentFrame = parentWindow.getFrame();

  return {
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    x: Math.round(
      parentFrame.x + (parentFrame.width - SETTINGS_WINDOW_WIDTH) / 2
    ),
    y: Math.round(
      parentFrame.y + (parentFrame.height - SETTINGS_WINDOW_HEIGHT) / 2
    ),
  };
}

async function getAppInfoData(): Promise<AppInfoResponse> {
  try {
    // Updater.getLocallocalInfo returns the full version.json shape
    // (version + hash + channel + name + identifier) — Updater.localInfo
    // only exposes a subset, so we use the lower-level call here.
    const info = await (
      Updater as unknown as {
        getLocallocalInfo: () => Promise<{
          channel: string;
          hash: string;
          identifier: string;
          name: string;
          version: string;
        }>;
      }
    ).getLocallocalInfo();
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
 * persisted to `<userData>/userprefs.json`; the renderer is expected to show
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

function createSettingsWindow(
  parentWindow: BrowserWindow | null,
  wsPath: string
): BrowserWindow {
  settingsRpc = BrowserView.defineRPC<SettingsRPC>({
    maxRequestTime: 5000,
    handlers: {
      requests: {
        getSettings: () => cachedSettings,
        saveSettings: async (settings) => {
          await persistSettings(settings);
          // Push update to main window so all settings (theme/locale/font/
          // canvas background/auto-save) apply immediately.
          mainRpc?.send?.settingsUpdated(cachedSettings);
          return { success: true };
        },
        getAICredentialStatus: () => ({ hasApiKey: cachedAIApiKey != null }),
        setAIApiKey: async ({ apiKey }) => {
          await saveAIApiKey(apiKey);
          cachedAIApiKey = apiKey && apiKey.length > 0 ? apiKey : null;
          mainRpc?.send?.settingsUpdated(cachedSettings);
          return { success: true };
        },
        listTrash: async () => await listTrash(wsPath),
        restoreTrash: async ({ trashId }) => {
          const result = await restoreView(wsPath, trashId);
          if (result.success) {
            // Notify the main window so its view switcher shows the
            // restored canvas immediately, without requiring a restart.
            mainRpc?.send?.viewsUpdated({});
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
      },
      messages: {},
    },
  });

  const win = new BrowserWindow({
    title: 'Settings',
    url: settingsViewUrl,
    rpc: settingsRpc,
    frame: getCenteredSettingsWindowFrame(parentWindow),
  });

  win.on('close', () => {
    settingsWindow = null;
    settingsRpc = null;
  });

  return win;
}

async function main() {
  // NOTE on accelerators: Electrobun only auto-attaches standard macOS
  // shortcuts for the text-editing roles (undo, redo, cut, copy, paste,
  // pasteAndMatchStyle, delete, selectAll). All other roles — including quit,
  // close, minimize, hide, hideOthers — require an explicit `accelerator`,
  // otherwise pressing the system shortcut does nothing.
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
        { role: 'undo' },
        { role: 'redo' },
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

  ApplicationMenu.on('application-menu-clicked', (event: unknown) => {
    const e = event as { data?: { action?: string } };
    if (e.data?.action === 'openSearch') {
      mainRpc?.send?.openSearch({});
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
  await migrateLegacyTagsFromNotes(wsPath);
  await loadSettings(wsPath);
  // The LLM API key lives outside the workspace so it never lands in
  // `<workspace>/.ghostboard/settings.json`. Cache it in memory for the
  // duration of the run; the secure file is only touched on read/write.
  cachedAIApiKey = (await loadAICredentials()).apiKey ?? null;
  // Local HTTP endpoint for renderer calls that do not fit Electrobun RPC
  // well. The handle holds the localhost base URL + bearer token the renderer
  // connects with. AI config is resolved per-request so settings updates take
  // effect without restarting the server.
  localHttpServer = startLocalHttpServer({
    getAIConfig: () => buildAIConfig(),
    getWorkspacePath: () => wsPath,
  });
  const url = await getMainViewUrl();
  settingsViewUrl = getSettingsViewUrl(url);
  const isDevChannel = (await Updater.localInfo.channel()) === 'dev';

  const rpc = (mainRpc = BrowserView.defineRPC<CanvasRPC>({
    maxRequestTime: 10_000,
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

          const hydratedNodes = await Promise.all(
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

          return {
            nodes: hydratedNodes,
            edges: manifest.edges,
            viewport: manifest.viewport,
          };
        },

        saveManifest: async ({ viewId, nodes, edges, viewport }) => {
          const config = await loadWorkspaceConfig(wsPath);
          const viewEntry = config.views.find((v) => v.id === viewId);
          if (!viewEntry) {
            return { success: false };
          }

          // Build note index (sidecars + legacy markdown) so we can find
          // existing notes and decide sidecar vs legacy handling.
          const noteIndex = await buildNoteIndex(wsPath);

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
            const markdownFile = await createNote(
              wsPath,
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
                const childData = (child.data ?? {}) as Record<string, unknown>;
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
                  data: await serializeImageDataForManifest(wsPath, node.data),
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
                          wsPath,
                          childData
                        ),
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
                      wsPath,
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
                wsPath,
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

          const manifest: CanvasManifest = {
            schema: 'ghostboard-canvas/v1',
            viewId,
            viewport,
            nodes: manifestNodes,
            edges,
          };
          await writeManifest(wsPath, viewEntry.file, manifest);
          return { success: true };
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

        loadBlockNote: async ({ noteId }) => {
          // Sidecar JSON is the only source of truth — no Markdown reconcile.
          const sidecar = await loadBlockNoteSidecar(wsPath, noteId);
          if (sidecar && !sidecar.corrupted) {
            return {
              success: true,
              blocks: sidecar.blocks,
              revision: sidecar.revision,
            };
          }

          // No valid sidecar — offer a one-time import from a legacy `.md`.
          const noteIndex = await buildNoteIndex(wsPath);
          const markdownFile = noteIndex.get(noteId)?.markdownFile;
          if (markdownFile) {
            const note = await loadNote(wsPath, markdownFile);
            if (note) {
              return {
                success: true,
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
            blocks: [],
            revision: sidecar?.revision ?? 0,
          };
        },

        saveBlockNote: async ({ noteId, frontmatter, blocks, revision }) => {
          // JSON sidecar is the only thing written. No Markdown mirror, no
          // hashes (ADR 0002). Note metadata (title/color/createdAt) and the
          // derived preview live in the sidecar alongside the blocks.
          const existing = await loadBlockNoteSidecar(wsPath, noteId);
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
        },

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
          const notes: Array<{
            noteId: string;
            title: string;
            content?: string;
          }> = [];
          for (const path of paths) {
            try {
              const file = Bun.file(path);
              if (!(await file.exists())) {
                continue;
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
              notes.push({ noteId, title, content: body });
            } catch (error) {
              console.warn(
                `[import] Failed to import markdown file ${path}:`,
                error
              );
            }
          }
          return { failedCount: paths.length - notes.length, notes };
        },

        exportPng: async ({ dataUrl, fileName }) => {
          const match = PNG_DATA_URL_RE.exec(dataUrl);
          if (!match) {
            throw new Error('Invalid PNG data URL');
          }

          const selectedFolders = await Utils.openFileDialog({
            allowedFileTypes: 'png',
            allowsMultipleSelection: false,
            canChooseDirectory: true,
            canChooseFiles: false,
            startingFolder: '~/Desktop',
          });
          const selectedFolder = selectedFolders.find(Boolean);
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
          const selectedFolders = await Utils.openFileDialog({
            allowedFileTypes: 'json',
            allowsMultipleSelection: false,
            canChooseDirectory: true,
            canChooseFiles: false,
            startingFolder: '~/Desktop',
          });
          const selectedFolder = selectedFolders.find(Boolean);
          if (!selectedFolder) {
            return { canceled: true, success: false };
          }

          const safeFileName = safeExportFileName(fileName, 'json');
          const outputPath = resolveExportPath(selectedFolder, safeFileName);
          await Bun.write(outputPath, json);

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
          let source = 'All notes';
          if (scope === 'selected') {
            ids = Array.isArray(noteIds) ? noteIds : [];
            source = `${ids.length} selected note(s)`;
          } else if (scope === 'view' && viewId) {
            const config = await loadWorkspaceConfig(wsPath);
            const view = config.views.find((v) => v.id === viewId);
            if (view) {
              ids = collectViewNoteIds(await loadManifest(wsPath, view.file));
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

          for (const id of ids) {
            try {
              const record = await loadNoteRecord(
                wsPath,
                id,
                noteIndex.get(id)?.markdownFile
              );
              if (!record) {
                failures.push({ noteId: id, reason: 'note record not found' });
                continue;
              }
              if (record.corrupted) {
                failures.push({ noteId: id, reason: 'corrupted sidecar' });
                continue;
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
              exportedNotes.push(exported);
            } catch (error) {
              failures.push({ noteId: id, reason: String(error) });
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

        openSettings: () => {
          if (settingsWindow) {
            settingsWindow.focus();
            return { success: true };
          }
          settingsWindow = createSettingsWindow(mainWindow, wsPath);
          return { success: true };
        },

        getSettings: () => cachedSettings,

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
          // Notify settings window so its trash list refreshes immediately.
          settingsRpc?.send?.trashUpdated({});
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
          settingsRpc?.send?.trashUpdated({});
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

        // @ts-expect-error - Type inference issue with Electrobun RPC
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

  return mainWindow;
}

main().catch((err) => {
  console.error(err);
});
