/**
 * RPC client for communicating with the Bun main process.
 * Returns null when running outside Electrobun (e.g., Vite dev server only).
 *
 * `electrobun/view` is dynamically imported to avoid crashing Vite.
 */

const electrobunInstance: any = null;
let initPromise: Promise<any> | null = null;

async function initElectrobun() {
  if ((globalThis as any).__electrobunWebviewId === undefined) {
    console.warn(
      '[persistence] Not running inside Electrobun — persistence disabled'
    );
    return null;
  }
  try {
    const mod = await import('electrobun/view');
    const Electrobun = mod.default;
    const { Electroview } = mod;

    const rpc = Electroview.defineRPC({
      maxRequestTime: 10000,
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
  if (!initPromise) {
    initPromise = initElectrobun();
  }
  return await initPromise;
}

export async function loadCanvas(viewId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) return null;
  return eb.rpc.request.loadCanvas({ viewId });
}

export async function rpcSaveManifest(
  viewId: string,
  nodes: Array<any>,
  edges: Array<any>,
  viewport?: any
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) return { success: false };
  return eb.rpc.request.saveManifest({ viewId, nodes, edges, viewport });
}

export async function rpcSaveNote(
  noteId: string,
  frontmatter: Record<string, unknown>,
  body: string
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) return { success: false };
  return eb.rpc.request.saveNote({ noteId, frontmatter, body });
}

export async function rpcCreateNote(
  id: string,
  title: string,
  displayHint: string
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) return null;
  return eb.rpc.request.createNote({ id, title, displayHint });
}

export async function rpcDeleteNote(noteId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) return { success: false };
  return eb.rpc.request.deleteNote({ noteId });
}

export async function rpcGetSettings() {
  const eb = await getElectrobun();
  if (!eb?.rpc) return null;
  return eb.rpc.request.getSettings({});
}

export async function rpcOpenSettings() {
  const eb = await getElectrobun();
  if (!eb?.rpc) return { success: false };
  return eb.rpc.request.openSettings({});
}

export async function rpcListViews() {
  const eb = await getElectrobun();
  if (!eb?.rpc) return null;
  return eb.rpc.request.listViews({});
}

export async function rpcCreateView(name: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) return null;
  return eb.rpc.request.createView({ name });
}

export async function rpcDeleteView(viewId: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) return null;
  return eb.rpc.request.deleteView({ viewId });
}

export async function rpcRenameView(viewId: string, name: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) return null;
  return eb.rpc.request.renameView({ viewId, name });
}

export async function isRpcAvailable(): Promise<boolean> {
  const eb = await getElectrobun();
  return eb?.rpc != null;
}
