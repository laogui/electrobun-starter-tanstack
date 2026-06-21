/**
 * RPC client for communicating with the Bun main process.
 * Returns null when running outside Electrobun (e.g., Vite dev server only).
 *
 * `electrobun/view` is dynamically imported to avoid crashing Vite.
 */

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
      maxRequestTime: 10_000,
      handlers: {
        requests: {},
        messages: {
          // Phase 8 broadcast: the settings window now ships the full
          // AppSettings (theme + locale + fontFamily + canvasBackground +
          // canvasSnapToGrid + autoSaveInterval). Forward everything so
          // listeners can react without a second round-trip through
          // `rpcGetSettings`.
          settingsUpdated: (settings: Record<string, unknown>) => {
            globalThis.dispatchEvent(
              new CustomEvent('settings-updated', {
                detail: settings,
              })
            );
          },
          openSearch: () => {
            globalThis.dispatchEvent(new CustomEvent('open-search'));
          },
          viewsUpdated: () => {
            globalThis.dispatchEvent(new CustomEvent('views-updated'));
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
  edges: any[],
  viewport?: any
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.saveManifest({ viewId, nodes, edges, viewport });
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

export async function rpcLoadBlockNote(noteId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false } as {
      success: boolean;
      blocks?: unknown[];
      markdown?: string;
      frontmatter?: Record<string, unknown>;
      revision?: number;
      recoveredFromMarkdown?: boolean;
    };
  }
  return eb.rpc.request.loadBlockNote({ noteId });
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

export async function rpcOpenSettings() {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return { success: false };
  }
  return eb.rpc.request.openSettings({});
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
