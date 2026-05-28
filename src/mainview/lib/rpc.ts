/**
 * RPC client for communicating with the Bun main process.
 * Returns null when running outside Electrobun (e.g., Vite dev server only).
 *
 * `electrobun/view` is dynamically imported to avoid crashing Vite.
 */

let initPromise: Promise<any> | null = null;
/** True when we know for certain this is not an Electrobun environment. */
let notElectrobun = false;
const MAX_INIT_RETRIES = 3;
let initRetries = 0;

async function initElectrobun() {
  if ((globalThis as any).__electrobunWebviewId === undefined) {
    console.warn(
      '[persistence] Not running inside Electrobun — persistence disabled'
    );
    notElectrobun = true;
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
          settingsUpdated: ({
            theme,
            locale,
          }: {
            theme: string;
            locale: string;
          }) => {
            globalThis.dispatchEvent(
              new CustomEvent('settings-updated', {
                detail: { theme, locale },
              })
            );
          },
          openSearch: () => {
            globalThis.dispatchEvent(new CustomEvent('open-search'));
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
  // Permanently disabled when not in Electrobun environment
  if (notElectrobun) {
    return null;
  }

  if (!initPromise) {
    initPromise = initElectrobun().then((instance) => {
      if (
        instance === null &&
        !notElectrobun &&
        initRetries < MAX_INIT_RETRIES
      ) {
        // Transient failure — allow retry on next call
        initRetries += 1;
        initPromise = null;
      }
      return instance;
    });
  }
  return await initPromise;
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

export async function rpcSaveAttachment(
  dataUrl: string,
  existingFile?: string,
  options?: {
    kind?: 'audio' | 'file' | 'image' | 'video';
    mimeType?: string;
    suggestedName?: string;
  }
) {
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
) {
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

export interface UnfurlLinkResult {
  description?: string;
  faviconUrl?: string;
  imageUrl?: string;
  siteName?: string;
  status: 'failed' | 'ready';
  title?: string;
  url: string;
}

export async function rpcUnfurlLink(
  url: string
): Promise<UnfurlLinkResult | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.unfurlLink({ url });
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

export async function rpcGetSettings() {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.getSettings({});
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
