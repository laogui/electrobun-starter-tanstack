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
  existingFile?: string
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.saveAttachment({ dataUrl, existingFile });
}

export async function rpcLoadAttachment(filePath: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.loadAttachment({ filePath });
}

export async function rpcExportPng(dataUrl: string, fileName: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.exportPng({ dataUrl, fileName });
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

export async function isRpcAvailable(): Promise<boolean> {
  const eb = await getElectrobun();
  return eb?.rpc != null;
}
