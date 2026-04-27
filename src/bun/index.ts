import { join } from 'node:path';

import {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  Updater,
} from 'electrobun/bun';
import type { CanvasManifest, ManifestEdge, ManifestNode } from './manifest';
import { loadManifest, saveManifest as writeManifest } from './manifest';
import {
  buildNoteIndex,
  cardDataToNote,
  createNote,
  deleteNoteFile,
  loadNote,
  noteToCardData,
} from './notes';
import { type PreviewArtifacts, writeNoteWithPreview } from './preview';
import {
  addView,
  atomicWrite,
  initWorkspace,
  loadWorkspaceConfig,
  removeView,
  renameView,
} from './workspace';

const DEV_SERVER_PORT = '5173';
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const DATA_URL_RE = /^data:(image\/([a-z+]+));base64,(.+)$/i;
const DEV_SERVER_RETRY_COUNT = 20;
const DEV_SERVER_RETRY_DELAY_MS = 250;

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
      createNote: {
        params: { id: string; title: string; displayHint: string };
        response: { noteId: string; file: string };
      };
      deleteNote: {
        params: { noteId: string };
        response: { success: boolean };
      };
      saveAttachment: {
        params: { dataUrl: string; existingFile?: string };
        response: { filePath: string };
      };
      loadAttachment: {
        params: { filePath: string };
        response: { dataUrl: string } | null;
      };
      openSettings: {
        params: Record<string, unknown>;
        response: { success: boolean };
      };
      getSettings: {
        params: Record<string, unknown>;
        response: { theme: string; locale: string };
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
        response: { success: boolean; activeViewId?: string };
      };
      renameView: {
        params: { viewId: string; name: string };
        response: { success: boolean };
      };
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: {
      settingsUpdated: { theme: string; locale: string };
    };
  };
}

interface SettingsRPC {
  bun: {
    requests: {
      getSettings: {
        params: Record<string, unknown>;
        response: { theme: string; locale: string };
      };
      saveSettings: {
        params: { theme: string; locale: string };
        response: { success: boolean };
      };
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: Record<never, unknown>;
  };
}

interface AppSettings {
  locale: string;
  theme: string;
}

export const DEFAULT_SETTINGS: AppSettings = { theme: 'system', locale: 'en' };

// Cached in memory, backed by settings.json on disk
let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };
let settingsFilePath = '';
let settingsWindow: BrowserWindow | null = null;
// Reference to main window RPC — set in main(), used by settings to push updates
let mainRpc: ReturnType<typeof BrowserView.defineRPC<CanvasRPC>> | null = null;

export async function loadSettings(wsPath: string): Promise<AppSettings> {
  settingsFilePath = join(wsPath, '.ghostboard', 'settings.json');
  const file = Bun.file(settingsFilePath);
  if (await file.exists()) {
    try {
      cachedSettings = { ...DEFAULT_SETTINGS, ...(await file.json()) };
    } catch {
      cachedSettings = { ...DEFAULT_SETTINGS };
    }
  }
  return cachedSettings;
}

export async function persistSettings(settings: AppSettings) {
  cachedSettings = settings;
  if (settingsFilePath) {
    await atomicWrite(settingsFilePath, JSON.stringify(settings, null, 2));
  }
}

function createSettingsWindow(): BrowserWindow {
  const settingsRpc = BrowserView.defineRPC<SettingsRPC>({
    maxRequestTime: 5000,
    handlers: {
      requests: {
        getSettings: () => cachedSettings,
        saveSettings: async ({ theme, locale }) => {
          await persistSettings({ theme, locale });
          // Push update to main window
          mainRpc?.send?.settingsUpdated({ theme, locale });
          return { success: true };
        },
      },
      messages: {},
    },
  });

  const win = new BrowserWindow({
    title: 'Settings',
    url: 'views://settingsview/index.html',
    rpc: settingsRpc,
    frame: {
      width: 400,
      height: 300,
      x: 350,
      y: 250,
    },
  });

  win.on('close', () => {
    settingsWindow = null;
  });

  return win;
}

async function main() {
  ApplicationMenu.setApplicationMenu([
    {
      label: 'GhostBoard',
      submenu: [{ role: 'about' }, { type: 'divider' }, { role: 'quit' }],
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
  ]);

  const wsPath = initWorkspace();
  await loadSettings(wsPath);
  const url = await getMainViewUrl();

  const rpc = (mainRpc = BrowserView.defineRPC<CanvasRPC>({
    maxRequestTime: 5000,
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
              // Hydrate image nodes: read attachment file → data URL
              if (
                node.type === 'image' &&
                node.data.imageFile &&
                !node.data.imageUrl
              ) {
                const fullPath = join(wsPath, node.data.imageFile as string);
                const file = Bun.file(fullPath);
                if (await file.exists()) {
                  const buffer = await file.arrayBuffer();
                  const mimeType = file.type || 'image/png';
                  const base64 = Buffer.from(buffer).toString('base64');
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      imageUrl: `data:${mimeType};base64,${base64}`,
                    },
                  };
                }
                console.warn(
                  `[persistence] Attachment not found: ${node.data.imageFile}`
                );
              }

              // Hydrate card nodes that have a noteId reference
              if (node.type === 'card' && node.data.noteId) {
                const filePath =
                  (node.data.file as string) ||
                  noteIndex.get(node.data.noteId as string);
                if (filePath) {
                  const doc = await loadNote(wsPath, filePath);
                  if (doc) {
                    const hydrated = noteToCardData(doc);
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        ...hydrated,
                        noteId: node.data.noteId,
                      },
                    };
                  }
                }
                console.warn(
                  `[persistence] Note file not found for noteId=${node.data.noteId}`
                );
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

          // Build note index so we can find existing .md files
          const noteIndex = await buildNoteIndex(wsPath);

          // Phase 1: Serially pre-allocate file paths for new card notes
          // to avoid concurrent createNote calls producing conflicting paths.
          const nodePathMap = new Map<number, string>();
          for (const [idx, node] of nodes.entries()) {
            if (node.type !== 'card') {
              continue;
            }
            const noteId =
              (node.data.noteId as string) ||
              `note_${crypto.randomUUID().slice(0, 8)}`;
            // Attach noteId so phase 2 can read it back
            node.data.noteId = noteId;
            const existingFile = noteIndex.get(noteId);
            if (existingFile) {
              nodePathMap.set(idx, existingFile);
            } else {
              const filePath = await createNote(
                wsPath,
                noteId,
                String(node.data.title || ''),
                String(node.data.type || 'note')
              );
              noteIndex.set(noteId, filePath);
              nodePathMap.set(idx, filePath);
            }
          }

          // Phase 2: Write content in parallel (paths are now unique)
          const manifestNodes = await Promise.all(
            nodes.map(async (node, idx) => {
              // Image nodes: strip imageUrl (large base64), keep imageFile ref
              if (node.type === 'image') {
                const { imageUrl, ...restData } = node.data;
                return {
                  id: node.id,
                  type: node.type,
                  position: node.position,
                  ...(node.style ? { style: node.style } : {}),
                  ...(node.parentId ? { parentId: node.parentId } : {}),
                  ...(node.extent ? { extent: node.extent } : {}),
                  data: restData,
                };
              }

              // Only extract content for card nodes
              if (node.type !== 'card') {
                return node;
              }

              const noteId = node.data.noteId as string;
              const filePath = nodePathMap.get(idx)!;

              // Read existing frontmatter to preserve createdAt
              let existingFm: Record<string, unknown> | undefined;
              const doc = await loadNote(wsPath, filePath);
              if (doc) {
                existingFm = doc.frontmatter;
              }

              // Convert node data to frontmatter + body
              const { frontmatter, body } = cardDataToNote(
                noteId,
                node.data,
                existingFm
              );

              // Write .md file and keep markdown preview metadata in sync.
              await writeNoteWithPreview(wsPath, filePath, frontmatter, body);

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
                  file: filePath,
                  type: node.data.type, // keep for quick component selection
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
          const noteIndex = await buildNoteIndex(wsPath);
          const filePath = noteIndex.get(noteId);
          if (!filePath) {
            return { success: false };
          }

          const preview = await writeNoteWithPreview(
            wsPath,
            filePath,
            {
              ...frontmatter,
              updatedAt: new Date().toISOString(),
            },
            body
          );
          return { success: true, preview };
        },

        createNote: async ({ id, title, displayHint }) => {
          const filePath = await createNote(wsPath, id, title, displayHint);
          return { noteId: id, file: filePath };
        },

        deleteNote: async ({ noteId }) => {
          const noteIndex = await buildNoteIndex(wsPath);
          const filePath = noteIndex.get(noteId);
          if (!filePath) {
            return { success: false };
          }

          const deleted = await deleteNoteFile(wsPath, filePath);
          return { success: deleted };
        },

        saveAttachment: async ({ dataUrl, existingFile }) => {
          const match = DATA_URL_RE.exec(dataUrl);
          if (!match) {
            throw new Error('Invalid data URL');
          }
          const mimeSubtype = match[2]!;
          const base64Data = match[3]!;

          // Map MIME subtype to file extension
          const extMap: Record<string, string> = {
            jpeg: 'jpg',
            png: 'png',
            gif: 'gif',
            webp: 'webp',
            svg: 'svg',
            'svg+xml': 'svg',
            bmp: 'bmp',
            tiff: 'tiff',
          };
          const ext = extMap[mimeSubtype.toLowerCase()] || 'png';

          // If updating an existing file, overwrite it
          const filePath =
            existingFile ||
            `attachments/img_${crypto.randomUUID().slice(0, 8)}.${ext}`;
          const fullPath = join(wsPath, filePath);
          const buffer = Buffer.from(base64Data, 'base64');
          await Bun.write(fullPath, new Uint8Array(buffer));

          return { filePath };
        },

        loadAttachment: async ({ filePath }) => {
          const fullPath = join(wsPath, filePath);
          const file = Bun.file(fullPath);
          if (!(await file.exists())) {
            return null;
          }

          const buffer = await file.arrayBuffer();
          const mimeType = file.type || 'image/png';
          const base64 = Buffer.from(buffer).toString('base64');
          return { dataUrl: `data:${mimeType};base64,${base64}` };
        },

        openSettings: () => {
          if (settingsWindow) {
            settingsWindow.focus();
            return { success: true };
          }
          settingsWindow = createSettingsWindow();
          return { success: true };
        },

        getSettings: () => cachedSettings,

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
          const success = await removeView(wsPath, viewId);
          if (success) {
            const config = await loadWorkspaceConfig(wsPath);
            return { success: true, activeViewId: config.activeViewId };
          }
          return { success: false };
        },

        renameView: async ({ viewId, name }) => {
          const success = await renameView(wsPath, viewId, name);
          return { success };
        },
      },
      messages: {},
    },
  }));

  return new BrowserWindow({
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
}

main().catch((err) => {
  console.error(err);
});
