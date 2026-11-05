import type { Electroview } from 'electrobun/view';
import { toast } from 'sonner';
import type { CanvasRPC } from '../../bun/rpc/types';
import * as m from '../../paraglide/messages.js';
import type {
  AIConnectionSettings,
  AIProvider,
  AITestResult,
} from '../../shared/ai/providerConfig';
import { encodeNodeMetadataPatch } from '../../shared/nodeMetadataPatch';
import type {
  BlockNoteSaveResult,
  CanvasSaveResult,
} from '../../shared/persistence';
import {
  RPC_MAX_WAIT_MS,
  withRpcErrorFeedback,
  withRpcRequestTimeouts,
} from './rpcErrorFeedback';
/**
 * RPC client for communicating with the Bun main process.
 * Returns null when running outside Electrobun (e.g., Vite dev server only).
 *
 * `electrobun/view` is dynamically imported to avoid crashing Vite.
 */

import { flushRegisteredCanvas } from '@/lib/canvasFlushRegistry';
import { collectNoteReferences } from '@/lib/noteReferences';
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
import {
  NOTE_CHANGED_EVENT,
  type NoteChangedEvent,
} from '../../shared/contentEvents';
import type {
  ExtensionInstanceLoadError,
  ExtensionInstanceRecord,
} from '../../shared/extensions/instance';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type { ExtensionTaskDelivery } from '../../shared/extensions/scheduling';
import type {
  DiagnosticsStatus,
  FeedbackInput,
  ReportError,
  SubmitReportResult,
} from '../../shared/support/reports';
import type { YouTubeVideo } from '../../shared/youtube';

type RendererRPC = ReturnType<typeof Electroview.defineRPC<CanvasRPC>>;
interface ElectrobunClient {
  rpc?: RendererRPC;
}

// Persist the init promise on `globalThis` so Vite HMR re-evaluating this
// module does NOT spawn a second Electroview. A duplicate Electroview opens
// a second WebSocket to Bun; Bun's socketMap[webviewId] then points at the
// new socket, but the OLD instance's `requestListeners` Map still owns any
// in-flight request promise. Bun would then deliver responses to the NEW
// socket whose RPC has no listener for those ids, leaving the promises
// dangling forever.
declare global {
  // eslint-disable-next-line no-var
  var __ghostboardInitPromise:
    | Promise<ElectrobunClient | null>
    | null
    | undefined;
  // eslint-disable-next-line no-var
  var __ghostboardNotElectrobun: boolean | undefined;
}
const MAX_INIT_RETRIES = 3;
let initRetries = 0;

async function initElectrobun(): Promise<ElectrobunClient | null> {
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

    const rpc = Electroview.defineRPC<CanvasRPC>({
      maxRequestTime: RPC_MAX_WAIT_MS,
      handlers: {
        requests: {
          // Sent by the main process right before quitting so the debounced
          // manifest flush is not lost. Bounded by a timeout on the Bun side.
          flushCanvas: async () => ({
            success: await flushRegisteredCanvas(),
          }),
        },
        messages: {
          // Phase 8 broadcast: the settings window now ships the full
          // AppSettings (theme + locale + fontFamily + canvasBackground +
          // canvasShowMinimap + canvasSnapToGrid + autoSaveInterval). Forward everything so
          // listeners can react without a second round-trip through
          // `rpcGetSettings`.
          settingsUpdated: (settings) => {
            globalThis.dispatchEvent(
              new CustomEvent('settings-updated', {
                detail: settings,
              })
            );
          },
          noteChanged: (event: NoteChangedEvent) => {
            globalThis.dispatchEvent(
              new CustomEvent(NOTE_CHANGED_EVENT, { detail: event })
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
        },
      },
    });

    const instance = new Electrobun.Electroview({ rpc });
    if (instance.rpc?.request) {
      instance.rpc.request = withRpcErrorFeedback(
        withRpcRequestTimeouts(instance.rpc.request, () =>
          toast.error(m.toast_rpc_timeout(), {
            id: 'rpc-timeout',
            duration: 10_000,
          })
        ),
        (method) =>
          toast.error(m.toast_rpc_invalid_params({ method }), {
            id: `rpc-invalid-${method}`,
          })
      );
    }
    return instance;
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

export interface LoadCanvasResponse {
  /** Optional: absolute path of the backup used for recovery, when any. */
  backupPath?: string;
  edges: any[];
  extensionInstances?: Record<string, any>;
  /**
   * Optional: set by the main process when the manifest was unreadable and
   * this payload came from a backup (e.g. `.bak`, `.pre-topic`).
   */
  loadIssues?: string[];
  nodes: any[];
  recoveredFrom?: string;
  recoveryToken?: string;
  widgets?: Record<string, any>;
}

export async function rpcListCanvasDataDiagnostics(): Promise<
  import('../../bun/dataDiagnostics').CanvasDataDiagnostic[]
> {
  const eb = await getElectrobun();
  return eb?.rpc ? eb.rpc.request.listCanvasDataDiagnostics({}) : [];
}
export async function rpcQuarantineDamagedTrash(
  trashId: string,
  token: string
) {
  const eb = await getElectrobun();
  return eb?.rpc
    ? eb.rpc.request.quarantineDamagedTrash({ trashId, token })
    : { success: false };
}
export async function rpcListTransactionRecovery(): Promise<
  import('../../shared/transactionRecovery').TransactionRecoveryEntry[]
> {
  const eb = await getElectrobun();
  return eb?.rpc ? eb.rpc.request.listTransactionRecovery({}) : [];
}
export async function rpcResolveTransactionRecovery(
  id: 'canvas',
  token: string,
  action: 'retry' | 'quarantine'
): Promise<{ success: boolean; archivedFile?: string }> {
  const eb = await getElectrobun();
  return eb?.rpc
    ? eb.rpc.request.resolveTransactionRecovery({ id, token, action })
    : { success: false };
}
export async function rpcReadCanvasRecoveryGraph(viewId: string) {
  const eb = await getElectrobun();
  return eb?.rpc ? eb.rpc.request.readCanvasRecoveryGraph({ viewId }) : null;
}
export async function rpcListCanvasRecoveryBackups(): Promise<
  import('../../shared/canvasRecovery').DiskRecoveryBackup[]
> {
  const eb = await getElectrobun();
  return eb?.rpc ? eb.rpc.request.listCanvasRecoveryBackups({}) : [];
}
export async function rpcRestoreCanvasSnapshot(
  name: string,
  graph: import('../../shared/canvasRecovery').RecoveryGraph,
  workspacePath?: string
) {
  const eb = await getElectrobun();
  return eb?.rpc
    ? eb.rpc.request.restoreCanvasSnapshot({ name, ...graph, workspacePath })
    : { success: false };
}

export async function rpcConfirmCanvasRecovery(viewId: string, token: string) {
  const eb = await getElectrobun();
  return eb?.rpc
    ? eb.rpc.request.confirmCanvasRecovery({ viewId, token })
    : { success: false };
}

export async function loadCanvas(
  viewId: string
): Promise<LoadCanvasResponse | null> {
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
  const requests = eb.rpc.request;
  // Prefetch uses this RPC loader; defer the reverse dependency until a write.
  const { withBlockNoteSave } = await import('./blockNotePrefetch');
  const result = await withBlockNoteSave<CanvasSaveResult>(
    collectNoteReferences(nodes),
    () => requests.saveManifest({ viewId, nodes, edges })
  );
  if (result.success && result.noteChanges?.length) {
    const [
      { useCanvasStore },
      { applyNoteMetadataChanges, publishNoteMetadataChanges },
    ] = await Promise.all([
      import('@/store/canvasStore'),
      import('./noteMetadataProjection'),
    ]);
    const current = useCanvasStore.getState();
    if (current.activeViewId === viewId && current._hydrated) {
      const changes = publishNoteMetadataChanges(result.noteChanges);
      useCanvasStore.setState((state) =>
        applyNoteMetadataChanges(state, changes)
      );
    }
  }
  return result;
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

const pendingCloneTokens = new Map<string, string>();
export async function rpcFinishCanvasClones(
  ids: string[],
  liveReferences: string[]
) {
  const eb = await getElectrobun();
  const tokens = ids.flatMap((id) => pendingCloneTokens.get(id) ?? []);
  if (!eb?.rpc || tokens.length === 0) {
    return { removed: [], retained: [] };
  }
  const result = await eb.rpc.request.finishCanvasClones({
    tokens,
    liveReferences,
  });
  for (const id of ids) {
    pendingCloneTokens.delete(id);
  }
  return result;
}
export async function rpcCloneWidget(widgetId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false as const };
  }
  const result = await eb.rpc.request.cloneWidget({ widgetId });
  if (result.success && result.cloneToken) {
    pendingCloneTokens.set(result.widget.id, result.cloneToken);
  }
  return result;
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
  const result = await eb.rpc.request.extensionInstanceClone({ instanceId });
  if (result.success && result.cloneToken) {
    pendingCloneTokens.set(result.record.id, result.cloneToken);
  }
  return result;
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

export async function rpcLoadBlockNote(
  noteId: string,
  workspaceId?: string,
  includeMarkdown = false
) {
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
  return eb.rpc.request.loadBlockNote({
    noteId,
    workspaceId,
    ...(includeMarkdown ? { includeMarkdown: true } : {}),
  });
}

export async function rpcSaveBlockNote(
  noteId: string,
  frontmatter: Record<string, unknown>,
  blocks: unknown[],
  markdown?: string,
  revision?: number
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false } as BlockNoteSaveResult;
  }
  const requests = eb.rpc.request;
  // Prefetch uses this RPC loader; defer the reverse dependency until a write.
  const { withBlockNoteSave } = await import('./blockNotePrefetch');
  return withBlockNoteSave<BlockNoteSaveResult>([noteId], () =>
    requests.saveBlockNote({
      noteId,
      frontmatter,
      blocks,
      markdown,
      revision,
    })
  );
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
  // The renderer token travels only in the Authorization header.
  const url = new URL(`${endpoint.baseUrl}/attachment/upload`);
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
let cachedLocalEndpoint: {
  baseUrl: string;
  mediaToken: string;
  token: string;
} | null = null;

async function getLocalHttpEndpoint(): Promise<{
  baseUrl: string;
  mediaToken: string;
  token: string;
} | null> {
  if (cachedLocalEndpoint) {
    return cachedLocalEndpoint;
  }
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint?.baseUrl) {
    return null;
  }
  cachedLocalEndpoint = {
    baseUrl: endpoint.baseUrl,
    mediaToken: endpoint.mediaToken,
    token: endpoint.token,
  };
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

export async function rpcExportTopicOutline(
  markdown: string,
  fileName: string
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.exportTopicOutline({ fileName, markdown });
}

async function prepareNoteExport(
  expectedGeneration?: number,
  expectedViewId?: string
) {
  const { useCanvasStore } = await import('@/store/canvasStore');
  const generation =
    expectedGeneration ?? useCanvasStore.getState()._canvasGeneration;
  if (!(await flushRegisteredCanvas())) {
    throw new Error(m.toast_export_unsaved());
  }
  const eb = await getElectrobun();
  const state = useCanvasStore.getState();
  if (
    state._canvasGeneration !== generation ||
    (expectedViewId && state.activeViewId !== expectedViewId)
  ) {
    throw new Error(m.toast_export_failed());
  }
  return eb;
}

export async function rpcExportNoteMarkdown(
  noteId: string,
  options?: { includeFrontmatter?: boolean }
) {
  const eb = await prepareNoteExport();
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
    canvasGeneration?: number;
    viewId?: string;
    noteIds?: string[];
    includeFrontmatter?: boolean;
  }
) {
  const eb = await prepareNoteExport(
    options?.canvasGeneration,
    options?.viewId
  );
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

export async function rpcGetDiagnosticsStatus(): Promise<DiagnosticsStatus> {
  const eb = await getElectrobun();
  return (
    eb?.rpc?.request.getDiagnosticsStatus({}) ?? {
      autoUpload: false,
      configured: false,
      pendingReports: 0,
    }
  );
}

export async function rpcGetDiagnosticsPreview(): Promise<{ logs: string }> {
  const eb = await getElectrobun();
  return eb?.rpc?.request.getDiagnosticsPreview({}) ?? { logs: '' };
}

export async function rpcSetCrashAutoUpload(
  enabled: boolean
): Promise<DiagnosticsStatus> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    throw new Error('Diagnostics unavailable');
  }
  return eb.rpc.request.setCrashAutoUpload({ enabled });
}

export async function rpcSubmitFeedback(
  input: FeedbackInput
): Promise<SubmitReportResult> {
  const eb = await getElectrobun();
  return (
    eb?.rpc?.request.submitFeedback(input) ?? {
      success: false,
      error: 'unavailable',
    }
  );
}

export async function rpcRecordRendererDiagnostic(input: {
  level: 'warn' | 'error';
  message: string;
  crash?: ReportError;
}): Promise<void> {
  const eb = await getElectrobun();
  await eb?.rpc?.request.recordRendererDiagnostic(input);
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
  if (!(await flushRegisteredCanvas())) {
    throw new Error(m.toast_export_unsaved());
  }
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

export async function rpcGetAICredentialStatus(
  provider?: AIProvider
): Promise<AICredentialStatus> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { hasApiKey: false };
  }
  return eb.rpc.request.getAICredentialStatus(provider ? { provider } : {});
}

export async function rpcSetAIApiKey(
  apiKey: string | null,
  provider?: AIProvider
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.setAIApiKey(
    provider ? { apiKey, provider } : { apiKey }
  );
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

/**
 * Fetch the localhost HTTP endpoint started by the Bun process. Returns the
 * base URL, the renderer bearer token (send it only as an `Authorization`
 * header), the read-only media token for `<video>`/iframe URLs, and whether
 * an AI provider is currently configured. Null outside Electrobun.
 */
export async function rpcGetLocalHttpEndpoint(): Promise<{
  aiEnabled: boolean;
  baseUrl: string;
  mediaToken: string;
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
 * players cannot attach Authorization headers, so the read-only media token
 * (never the renderer token) is embedded in the query string. Falls back to null when the local HTTP bridge is unavailable.
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
  url.searchParams.set('token', endpoint.mediaToken);
  return url.toString();
}

/** Use an HTTP player document so packaged views:// pages can embed YouTube. */
export async function resolveYouTubePlayerUrl(
  video: YouTubeVideo
): Promise<string | null> {
  const endpoint = await getLocalHttpEndpoint();
  if (!endpoint?.baseUrl) {
    return null;
  }
  const url = new URL(`${endpoint.baseUrl}/youtube`);
  url.searchParams.set('videoId', video.videoId);
  url.searchParams.set('start', String(video.startSeconds));
  url.searchParams.set('token', endpoint.mediaToken);
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
  return eb.rpc.request.setNodeMetadata({
    id,
    metadata: encodeNodeMetadataPatch(metadata),
  });
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

export async function rpcTestAIConnection(
  settings: AIConnectionSettings
): Promise<AITestResult> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false, error: 'network' };
  }
  return eb.rpc.request.testAIConnection(settings);
}
