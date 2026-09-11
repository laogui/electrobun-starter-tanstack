/**
 * RPC client for communicating with the Bun main process.
 * Returns null when running outside Electrobun (e.g., Vite dev server only).
 *
 * `electrobun/view` is dynamically imported to avoid crashing Vite.
 */

import type { WidgetKind, WidgetRecord } from '@/lib/widgetTypes';
import type {
  AICredentialStatus,
  AppInfo,
  AppSettings,
  ExportArchiveResult,
  SwitchWorkspaceResult,
  TrashEntry,
  UnlinkedFileEntry,
  UpdateCheckResult,
  WorkspaceInfo,
} from '@/settingsClient';
import type { AIRunTaskParams, AIRunTaskResponse } from '../../shared/ai/types';
import type { ExtensionEnablementFile } from '../../shared/extensions/enablement';
import type {
  ExtensionInstanceLoadError,
  ExtensionInstanceRecord,
} from '../../shared/extensions/instance';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type { ExtensionTaskDelivery } from '../../shared/extensions/scheduling';
import type { HostContentChangedEvent } from '../../shared/plugins/contentHistory';
import type {
  InstalledPluginSummary,
  PluginInstallCommitResult,
  PluginInstallPreparationResult,
} from '../../shared/plugins/management';

// Persist the init promise on `globalThis` so Vite HMR re-evaluating this
// module does NOT spawn a second Electroview. A duplicate Electroview opens
// a second WebSocket to Bun; Bun's socketMap[webviewId] then points at the
// new socket, but the OLD instance's `requestListeners` Map still owns any
// in-flight request promise. Bun would then deliver responses to the NEW
// socket whose RPC has no listener for those ids, leaving the promises
// dangling forever.
declare global {
  // eslint-disable-next-line no-var
  var __ghostboardInitPromise: Promise<any> | null | undefined;
  // eslint-disable-next-line no-var
  var __ghostboardNotElectrobun: boolean | undefined;
}
const MAX_INIT_RETRIES = 3;
let initRetries = 0;

export interface LicenseInfo {
  activated: boolean;
  activatedAt?: number;
  fingerprint?: string;
  key?: string;
}

async function initElectrobun() {
  if ((globalThis as any).__electrobunWebviewId === undefined) {
    console.warn(
      '[persistence] Not running inside Electrobun — persistence disabled'
    );
    globalThis.__ghostboardNotElectrobun = true;
    return null;
  }
  try {
    const mod = await import('electrobun/view');
    const Electrobun = mod.default;
    const { Electroview } = mod;

    const rpc = Electroview.defineRPC({
      maxRequestTime: Number.POSITIVE_INFINITY,
      handlers: {
        requests: {},
        messages: {
          // Phase 8 broadcast: the settings window now ships the full
          // AppSettings (theme + locale + fontFamily + canvasBackground +
          // canvasShowMinimap + canvasSnapToGrid + autoSaveInterval). Forward everything so
          // listeners can react without a second round-trip through
          // `rpcGetSettings`.
          settingsUpdated: (settings: Record<string, unknown>) => {
            globalThis.dispatchEvent(
              new CustomEvent('settings-updated', {
                detail: settings,
              })
            );
          },
          pluginContentChanged: (event: HostContentChangedEvent) => {
            globalThis.dispatchEvent(
              new CustomEvent('plugin-content-changed', { detail: event })
            );
          },
          extensionTaskFired: (delivery: ExtensionTaskDelivery) => {
            globalThis.dispatchEvent(
              new CustomEvent('extension-task-fired', { detail: delivery })
            );
          },
          openSearch: () => {
            globalThis.dispatchEvent(new CustomEvent('open-search'));
          },
          canvasUndo: () => {
            globalThis.dispatchEvent(new CustomEvent('canvas-undo'));
          },
          canvasRedo: () => {
            globalThis.dispatchEvent(new CustomEvent('canvas-redo'));
          },
          viewsUpdated: () => {
            globalThis.dispatchEvent(new CustomEvent('views-updated'));
          },
          trashUpdated: () => {
            globalThis.dispatchEvent(new CustomEvent('trash-updated'));
          },
        } as any,
      },
    });

    return new Electrobun.Electroview({ rpc });
  } catch (error) {
    console.warn('[persistence] Failed to initialize Electrobun RPC:', error);
    return null;
  }
}

async function getElectrobun() {
  if (globalThis.__ghostboardNotElectrobun) {
    return null;
  }

  if (!globalThis.__ghostboardInitPromise) {
    globalThis.__ghostboardInitPromise = initElectrobun().then((instance) => {
      if (
        instance === null &&
        !globalThis.__ghostboardNotElectrobun &&
        initRetries < MAX_INIT_RETRIES
      ) {
        // Transient failure — allow retry on next call
        initRetries += 1;
        globalThis.__ghostboardInitPromise = null;
      }
      return instance;
    });
  }
  return await globalThis.__ghostboardInitPromise;
}

export async function loadCanvas(viewId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.loadCanvas({ viewId });
}

export async function rpcSaveManifest(
  viewId: string,
  nodes: any[],
  edges: any[]
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.saveManifest({ viewId, nodes, edges });
}

export async function rpcSaveNote(
  noteId: string,
  frontmatter: Record<string, unknown>,
  body: string
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.saveNote({ noteId, frontmatter, body });
}

export async function rpcCreateWidget(kind: WidgetKind, title?: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false as const };
  }
  return eb.rpc.request.createWidget({ kind, title });
}

export async function rpcCloneWidget(widgetId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false as const };
  }
  return eb.rpc.request.cloneWidget({ widgetId });
}

export async function rpcSaveWidget(widget: WidgetRecord) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.saveWidget({ widget });
}

export async function rpcDeleteWidget(widgetId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.deleteWidget({ widgetId });
}

export async function rpcListPluginPackages(): Promise<{
  available: boolean;
  plugins: InstalledPluginSummary[];
}> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { available: false, plugins: [] };
  }
  return { available: true, ...(await eb.rpc.request.pluginInstallList({})) };
}

export async function rpcPreparePluginInstallFromFile(): Promise<PluginInstallPreparationResult> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false, error: 'Plugin management is unavailable.' };
  }
  return eb.rpc.request.pluginPrepareInstallFromFile({});
}

export async function rpcPreparePluginDevelopmentDirectory(): Promise<PluginInstallPreparationResult> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false, error: 'Plugin management is unavailable.' };
  }
  return eb.rpc.request.pluginPrepareDevelopmentDirectory({});
}

export async function rpcPreparePluginInstallFromUrl(
  url: string
): Promise<PluginInstallPreparationResult> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false, error: 'Plugin management is unavailable.' };
  }
  return eb.rpc.request.pluginPrepareInstallFromUrl({ url });
}

export async function rpcCommitPluginInstall(
  transactionId: string
): Promise<PluginInstallCommitResult> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false, error: 'Plugin management is unavailable.' };
  }
  const result = await eb.rpc.request.pluginCommitInstall({ transactionId });
  if (result?.success) {
    globalThis.dispatchEvent(new Event('plugins-changed'));
  }
  return result;
}

export async function rpcCancelPluginInstall(
  transactionId: string
): Promise<{ success: boolean }> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.pluginCancelInstall({ transactionId });
}

export async function rpcEnablePlugin(input: {
  digest: string;
  pluginId: string;
}): Promise<PluginInstallCommitResult> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false, error: 'Plugin management is unavailable.' };
  }
  const result = await eb.rpc.request.pluginEnable(input);
  if (result?.success) {
    globalThis.dispatchEvent(new Event('plugins-changed'));
  }
  return result;
}

export async function rpcDisablePlugin(input: {
  digest: string;
  pluginId: string;
}): Promise<PluginInstallCommitResult> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false, error: 'Plugin management is unavailable.' };
  }
  const result = await eb.rpc.request.pluginDisable(input);
  if (result?.success) {
    globalThis.dispatchEvent(new Event('plugins-changed'));
  }
  return result;
}

export async function rpcListExtensionEnablement(): Promise<{
  disabledCanvasTypes: string[];
  instanceCounts: Record<string, number>;
}> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { disabledCanvasTypes: [], instanceCounts: {} };
  }
  return eb.rpc.request.extensionEnablementList({});
}

export async function rpcClearExtensionTypeData(
  canvasTypeId: string
): Promise<{ deleted: number; success: boolean }> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false, deleted: 0 };
  }
  return eb.rpc.request.extensionInstanceClearType({ canvasTypeId });
}

export async function rpcSetExtensionEnabled(
  canvasTypeId: string,
  enabled: boolean
): Promise<{
  enablement?: ExtensionEnablementFile;
  success: boolean;
}> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.extensionEnablementSetEnabled({
    canvasTypeId,
    enabled,
  });
}

export async function rpcCreateExtensionInstance(input: {
  canvasTypeId: string;
  dataVersion: number;
  id?: string;
  presentation: ExtensionPresentation;
  state: unknown;
}): Promise<
  { record: ExtensionInstanceRecord; success: true } | { success: false }
> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.extensionInstanceCreate(input);
}

export async function rpcLoadExtensionInstances(
  instanceIds: string[]
): Promise<
  Record<string, ExtensionInstanceRecord | ExtensionInstanceLoadError>
> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return {};
  }
  const result = await eb.rpc.request.extensionInstanceLoadMany({
    instanceIds,
  });
  return result.records;
}

export async function rpcUpdateExtensionInstance(input: {
  dataVersion?: number;
  expectedRevision?: number;
  instanceId: string;
  presentation: ExtensionPresentation;
  state: unknown;
}): Promise<
  { record: ExtensionInstanceRecord; success: true } | { success: false }
> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.extensionInstanceUpdate(input);
}

export async function rpcCloneExtensionInstance(
  instanceId: string
): Promise<
  { record: ExtensionInstanceRecord; success: true } | { success: false }
> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.extensionInstanceClone({ instanceId });
}

export async function rpcScheduleExtensionTask(task: {
  canvasTypeId: string;
  fireAt: string;
  id: string;
  instanceId: string;
  payload?: unknown;
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
}): Promise<{ success: boolean }> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.extensionSchedulerSchedule(task);
}

export async function rpcCancelExtensionTask(
  instanceId: string,
  taskId: string
): Promise<{ success: boolean }> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.extensionSchedulerCancel({ instanceId, taskId });
}

export async function rpcAckExtensionTasks(
  deliveryId: string
): Promise<{ success: boolean }> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.extensionSchedulerAck({ deliveryId });
}

export async function rpcListExtensionTasks(instanceId?: string): Promise<{
  tasks: Array<{
    canvasTypeId: string;
    fireAt: string;
    id: string;
    instanceId: string;
    payload?: unknown;
    repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
  }>;
}> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { tasks: [] };
  }
  return eb.rpc.request.extensionSchedulerList({ instanceId });
}

export async function rpcLoadBlockNote(noteId: string, workspaceId?: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false } as {
      success: boolean;
      blocks?: unknown[];
      markdown?: string;
      frontmatter?: Record<string, unknown>;
      revision?: number;
      recoveredFromMarkdown?: boolean;
      text?: string;
      workspaceId?: string;
      preview?: {
        html: string;
        excerpt: string;
        blocks: number;
        version: number;
      };
    };
  }
  return eb.rpc.request.loadBlockNote({ noteId, workspaceId });
}

export async function rpcSaveBlockNote(
  noteId: string,
  frontmatter: Record<string, unknown>,
  blocks: unknown[],
  markdown: string,
  revision?: number
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false } as {
      success: boolean;
      conflict?: boolean;
      revision?: number;
      preview?: {
        blocks: number;
        excerpt: string;
        html: string;
        version: number;
      };
      blocknoteFile?: string;
    };
  }
  return eb.rpc.request.saveBlockNote({
    noteId,
    frontmatter,
    blocks,
    markdown,
    revision,
  });
}

export async function rpcCreateNote(
  id: string,
  title: string,
  displayHint: string
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.createNote({ id, title, displayHint });
}

export async function rpcDeleteNote(noteId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.deleteNote({ noteId });
}

export interface SaveAttachmentResult {
  archiveSummary?: { entryCount: number; topFiles: string[] };
  filePath: string;
  previewExcerpt?: string;
}

export async function rpcSaveAttachment(
  dataUrl: string,
  existingFile?: string,
  options?: {
    kind?: 'audio' | 'file' | 'image' | 'video';
    mimeType?: string;
    suggestedName?: string;
  }
): Promise<SaveAttachmentResult | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.saveAttachment({ dataUrl, existingFile, ...options });
}

/**
 * Copy a file from an absolute OS path into the workspace `attachments/`
 * folder via the Bun main process. Use this for imports whose bytes are
 * already on disk (e.g. via a native file picker) so the renderer never
 * holds the full payload in memory — the data URL path has a 25 MB cap.
 */
export async function rpcSaveAttachmentFile(
  sourcePath: string,
  options?: {
    kind?: 'audio' | 'file' | 'image' | 'video';
    mimeType?: string;
    suggestedName?: string;
  }
): Promise<SaveAttachmentResult | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.saveAttachmentFile({ sourcePath, ...options });
}

export async function rpcGenerateVideoThumbnail(
  attachmentFile: string
): Promise<{ thumbnailFile?: string } | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.generateVideoThumbnail({ attachmentFile });
}

/**
 * Stream a renderer `File`/`Blob` into `attachments/` through the localhost
 * HTTP bridge. Avoids data-URL round-trips and the 25 MB RPC cap.
 */
export async function uploadAttachmentBlob(
  blob: Blob,
  options: {
    fileName: string;
    kind: 'audio' | 'file' | 'image' | 'video';
    mimeType: string;
  }
): Promise<SaveAttachmentResult> {
  const endpoint = await getLocalHttpEndpoint();
  if (!endpoint?.baseUrl) {
    throw new Error('Local attachment upload bridge is unavailable.');
  }
  const url = new URL(`${endpoint.baseUrl}/attachment/upload`);
  url.searchParams.set('token', endpoint.token);
  url.searchParams.set('fileName', options.fileName);
  url.searchParams.set('mimeType', options.mimeType);
  url.searchParams.set('kind', options.kind);
  // WKWebView has been observed to leave Blob POSTs to localhost pending
  // forever. Abort after a generous timeout so callers can fall back / error.
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, 15_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        'Content-Type': options.mimeType || 'application/octet-stream',
      },
      body: blob,
      signal: controller.signal,
    });
    if (!response.ok) {
      // Drop a potentially stale endpoint cache (token rotated after HMR).
      cachedLocalEndpoint = null;
      throw new Error('Attachment upload failed.');
    }
    return (await response.json()) as SaveAttachmentResult;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      cachedLocalEndpoint = null;
      throw new Error('Attachment upload timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function rpcLoadAttachment(filePath: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.loadAttachment({ filePath });
}

export async function rpcOpenAttachment(filePath: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.openAttachment({ filePath });
}

export async function rpcRevealAttachment(filePath: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.revealAttachment({ filePath });
}

export async function rpcOpenExternalUrl(url: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.openExternalUrl({ url });
}

export async function rpcToggleWindowMaximize() {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.toggleWindowMaximize({});
}

export async function rpcImportMarkdownFiles(): Promise<{
  canceled?: boolean;
  failedCount?: number;
  notes: Array<{ content?: string; noteId: string; title: string }>;
}> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { canceled: true, notes: [] };
  }
  return eb.rpc.request.importMarkdownFiles({});
}

export interface UnfurlLinkResult {
  description?: string;
  faviconUrl?: string;
  imageUrl?: string;
  siteName?: string;
  status: 'failed' | 'ready';
  title?: string;
  url: string;
}

// The unfurl request goes over the localhost HTTP server started by
// `startLocalHttpServer` instead of Electrobun RPC. The RPC transport was
// occasionally dropping responses for subsequent unfurls when Vite HMR caused
// webview reloads, leaving the promise dangling forever. HTTP is request-scoped
// and immune to that class of socket-routing issue.
let cachedLocalEndpoint: { baseUrl: string; token: string } | null = null;

async function getLocalHttpEndpoint(): Promise<{
  baseUrl: string;
  token: string;
} | null> {
  if (cachedLocalEndpoint) {
    return cachedLocalEndpoint;
  }
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint?.baseUrl) {
    return null;
  }
  cachedLocalEndpoint = { baseUrl: endpoint.baseUrl, token: endpoint.token };
  return cachedLocalEndpoint;
}

// Renderer-side guard against bad input reaching the local HTTP server. The
// backend re-validates with stricter SSRF protections (`parseSafeHttpUrl` in
// linkPreview.ts), but rejecting obviously bad URLs here avoids a wasted
// round-trip and keeps the loading state from blinking on for invalid input.
function isValidUnfurlUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return false;
  }
  if (rawUrl.length > 2048) {
    return false;
  }
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Backend has its own 8s fetch timeout; this is an outer bound so the
// renderer never hangs on a stuck local socket. Slightly longer than the
// backend budget so backend failures surface as `{ status: 'failed' }`
// rather than as our own AbortError.
const UNFURL_FETCH_TIMEOUT_MS = 12_000;
const UNFURL_MAX_ATTEMPTS = 2;
const UNFURL_RETRY_DELAY_MS = 500;

async function fetchUnfurlOnce(
  endpoint: { baseUrl: string; token: string },
  url: string
): Promise<
  | { kind: 'ok'; data: UnfurlLinkResult }
  | { kind: 'retry' }
  | { kind: 'giveUp' }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UNFURL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${endpoint.baseUrl}/unfurl?url=${encodeURIComponent(url)}`,
      {
        headers: { authorization: `Bearer ${endpoint.token}` },
        signal: controller.signal,
      }
    );
    // 5xx is treated as transient (worth a retry); 4xx is a client error and
    // will not change on retry.
    if (res.status >= 500) {
      return { kind: 'retry' };
    }
    if (!res.ok) {
      return { kind: 'giveUp' };
    }
    return { kind: 'ok', data: (await res.json()) as UnfurlLinkResult };
  } catch (error) {
    // AbortError (timeout) and network failures are both retryable.
    if (error instanceof Error) {
      console.warn('[rpcUnfurlLink] fetch attempt failed:', error.message);
    }
    return { kind: 'retry' };
  } finally {
    clearTimeout(timer);
  }
}

export async function rpcUnfurlLink(
  url: string
): Promise<UnfurlLinkResult | null> {
  if (!isValidUnfurlUrl(url)) {
    return null;
  }
  const endpoint = await getLocalHttpEndpoint();
  if (!endpoint) {
    return null;
  }
  for (let attempt = 1; attempt <= UNFURL_MAX_ATTEMPTS; attempt += 1) {
    // Retry attempts are intentionally sequential so we can stop on first success/give-up.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const outcome = await fetchUnfurlOnce(endpoint, url);
    if (outcome.kind === 'ok') {
      return outcome.data;
    }
    if (outcome.kind === 'giveUp') {
      return null;
    }
    if (attempt < UNFURL_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, UNFURL_RETRY_DELAY_MS));
    }
  }
  return null;
}

export async function rpcExportPng(dataUrl: string, fileName: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.exportPng({ dataUrl, fileName });
}

export async function rpcExportJson(json: string, fileName: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.exportJson({ json, fileName });
}

export async function rpcExportNoteMarkdown(
  noteId: string,
  options?: { includeFrontmatter?: boolean }
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.exportNoteMarkdown({
    noteId,
    includeFrontmatter: options?.includeFrontmatter,
  });
}

export async function rpcExportNotesMarkdown(
  scope: 'all' | 'selected' | 'view',
  options?: {
    viewId?: string;
    noteIds?: string[];
    includeFrontmatter?: boolean;
  }
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.exportNotesMarkdown({
    scope,
    viewId: options?.viewId,
    noteIds: options?.noteIds,
    includeFrontmatter: options?.includeFrontmatter,
  });
}

export async function rpcGetSettings() {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.getSettings({});
}

export async function rpcSaveSettings(settings: AppSettings) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.saveSettings(settings);
}

export async function rpcListTrash(): Promise<TrashEntry[]> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return [];
  }
  return eb.rpc.request.listTrash({});
}

export async function rpcRestoreTrash(trashId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.restoreTrash({ trashId });
}

export async function rpcPurgeTrash(trashId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.purgeTrash({ trashId });
}

export async function rpcClearAllTrash() {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { purged: 0, success: false };
  }
  return eb.rpc.request.clearAllTrash({});
}

export async function rpcScanUnlinkedNotes(): Promise<UnlinkedFileEntry[]> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return [];
  }
  const result = await eb.rpc.request.scanUnlinkedNotes({});
  return result.entries;
}

export async function rpcDeleteUnlinkedNotes(files: string[]) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { deleted: [], skipped: files };
  }
  return eb.rpc.request.deleteUnlinkedNotes({ files });
}

export async function rpcGetWorkspaceInfo(): Promise<WorkspaceInfo> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { path: '', isDefault: true };
  }
  return eb.rpc.request.getWorkspaceInfo({});
}

export async function rpcOpenWorkspaceFolder() {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.openWorkspaceFolder({});
}

export async function rpcSwitchWorkspace(): Promise<SwitchWorkspaceResult> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.switchWorkspace({});
}

export async function rpcExportWorkspaceArchive(): Promise<ExportArchiveResult> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.exportWorkspaceArchive({});
}

export async function rpcGetAppInfo(): Promise<AppInfo> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return {
      channel: 'dev',
      hash: '',
      identifier: 'dev.ghostboard',
      name: 'GhostBoard',
      version: '0.0.0',
    };
  }
  return eb.rpc.request.getAppInfo({});
}

export async function rpcCheckForUpdate(): Promise<UpdateCheckResult> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return {
      currentHash: '',
      hash: '',
      updateAvailable: false,
      version: '',
      error: 'RPC unavailable',
    };
  }
  return eb.rpc.request.checkForUpdate({});
}

export async function rpcGetAICredentialStatus(): Promise<AICredentialStatus> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { hasApiKey: false };
  }
  return eb.rpc.request.getAICredentialStatus({});
}

export async function rpcSetAIApiKey(apiKey: string | null) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.setAIApiKey({ apiKey });
}

export async function rpcRunAITask(
  params: AIRunTaskParams
): Promise<AIRunTaskResponse | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.aiRunTask(params);
}

export async function rpcCheckLicense(): Promise<LicenseInfo | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.checkLicense({});
}

export async function rpcActivateLicense(
  key: string
): Promise<{ success: boolean; error?: string } | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.activateLicense({ key });
}

/**
 * Fetch the localhost HTTP endpoint started by the Bun process. Returns the
 * base URL + bearer token used by local HTTP routes, plus whether an AI
 * provider is currently configured. Null outside Electrobun.
 */
export async function rpcGetLocalHttpEndpoint(): Promise<{
  aiEnabled: boolean;
  baseUrl: string;
  token: string;
} | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.getLocalHttpEndpoint({});
}

/**
 * Build a localhost streaming URL for a workspace attachment. Video and audio
 * players cannot attach Authorization headers, so the token is embedded in the
 * query string. Falls back to null when the local HTTP bridge is unavailable.
 */
export async function resolveAttachmentStreamUrl(
  attachmentFile: string
): Promise<string | null> {
  const endpoint = await getLocalHttpEndpoint();
  if (!endpoint?.baseUrl) {
    return null;
  }
  const url = new URL(`${endpoint.baseUrl}/attachment`);
  url.searchParams.set('path', attachmentFile);
  url.searchParams.set('token', endpoint.token);
  return url.toString();
}

export async function rpcListViews() {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.listViews({});
}

export async function rpcCreateView(name: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.createView({ name });
}

export async function rpcDeleteView(viewId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.deleteView({ viewId });
}

export async function rpcRestoreView(trashId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.restoreView({ trashId });
}

export async function rpcRenameView(viewId: string, name: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.renameView({ viewId, name });
}

export async function rpcSearchCanvas(
  query: string,
  options?: { viewId?: string; limit?: number }
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.searchCanvas({
    query,
    viewId: options?.viewId,
    limit: options?.limit,
  });
}

export async function rpcListTags() {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.listTags({});
}

export async function rpcRenameTag(oldName: string, newName: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.renameTag({ oldName, newName });
}

export async function rpcDeleteTag(name: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.deleteTag({ name });
}

export interface NodeMetadata {
  tag?: string;
  tagColor?: string;
  tagColors?: Record<string, string>;
  tags?: string[];
}

export type NodeMetadataMap = Record<string, NodeMetadata>;

export async function rpcLoadNodeMetadata(): Promise<NodeMetadataMap | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.loadNodeMetadata({});
}

export async function rpcSetNodeMetadata(id: string, metadata: NodeMetadata) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.setNodeMetadata({ id, metadata });
}

export async function rpcDeleteNodeMetadata(id: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.deleteNodeMetadata({ id });
}

export async function rpcListTemplates() {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.listTemplates({});
}

export async function rpcGetTemplate(id: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.getTemplate({ id });
}

export async function rpcCreateViewFromTemplate(
  name: string,
  templateId: string
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.createViewFromTemplate({ name, templateId });
}

/**
 * Dev-only: ask the bun process to drop a captured PNG into a built-in
 * template's source directory so the next git commit picks it up. Returns
 * `{ success: false, reason: 'production-mode' }` (or null when the RPC
 * channel itself is unavailable) outside dev launches.
 */
export async function rpcSaveTemplateThumbnail(
  templateId: string,
  pngBase64: string
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.saveTemplateThumbnail({ templateId, pngBase64 });
}

export async function rpcSetActiveView(viewId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.setActiveView({ viewId });
}

export async function isRpcAvailable(): Promise<boolean> {
  const eb = await getElectrobun();
  return eb?.rpc != null;
}
