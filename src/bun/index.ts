import { join } from 'node:path';

import { BrowserView, BrowserWindow, Updater } from 'electrobun/bun';

import { loadManifest, saveManifest as writeManifest } from './manifest';
import type { CanvasManifest, ManifestEdge, ManifestNode } from './manifest';
import {
  buildNoteIndex,
  cardDataToNote,
  createNote,
  deleteNoteFile,
  loadNote,
  noteToCardData,
  saveNote as writeNote,
} from './notes';
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
const DEV_SERVER_RETRY_COUNT = 20;
const DEV_SERVER_RETRY_DELAY_MS = 250;

async function sleep(ms: number) {
  return await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevServer(): Promise<boolean> {
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
async function getMainViewUrl(): Promise<string> {
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

type CanvasRPC = {
  bun: {
    requests: {
      loadCanvas: {
        params: { viewId: string };
        response: {
          nodes: Array<ManifestNode>;
          edges: Array<ManifestEdge>;
          viewport?: { x: number; y: number; zoom: number };
        } | null;
      };
      saveManifest: {
        params: {
          viewId: string;
          nodes: Array<ManifestNode>;
          edges: Array<ManifestEdge>;
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
        response: { success: boolean };
      };
      createNote: {
        params: { id: string; title: string; displayHint: string };
        response: { noteId: string; file: string };
      };
      deleteNote: {
        params: { noteId: string };
        response: { success: boolean };
      };
      openSettings: {
        params: {};
        response: { success: boolean };
      };
      getSettings: {
        params: {};
        response: { theme: string; locale: string };
      };
      listViews: {
        params: {};
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
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      settingsUpdated: { theme: string; locale: string };
    };
  };
};

type SettingsRPC = {
  bun: {
    requests: {
      getSettings: {
        params: {};
        response: { theme: string; locale: string };
      };
      saveSettings: {
        params: { theme: string; locale: string };
        response: { success: boolean };
      };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {};
  };
};

interface AppSettings {
  theme: string;
  locale: string;
}

const DEFAULT_SETTINGS: AppSettings = { theme: 'system', locale: 'en' };

// Cached in memory, backed by settings.json on disk
let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };
let settingsFilePath = '';
let settingsWindow: BrowserWindow | null = null;
// Reference to main window RPC — set in main(), used by settings to push updates
let mainRpc: ReturnType<typeof BrowserView.defineRPC<CanvasRPC>> | null = null;

async function loadSettings(wsPath: string): Promise<AppSettings> {
  settingsFilePath = join(wsPath, '.spatial', 'settings.json');
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

async function persistSettings(settings: AppSettings) {
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
          if (!viewEntry) return null;

          const manifest = await loadManifest(wsPath, viewEntry.file);
          if (!manifest) return null;

          const noteIndex = await buildNoteIndex(wsPath);

          const hydratedNodes = await Promise.all(
            manifest.nodes.map(async (node) => {
              // Only hydrate card nodes that have a noteId reference
              if (node.type === 'card' && node.data.noteId) {
                const filePath =
                  (node.data.file as string) ||
                  noteIndex.get(node.data.noteId as string);
                if (filePath) {
                  const doc = await loadNote(wsPath, filePath);
                  if (doc) {
                    // Use the shared helper that handles checklist parsing
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
                // .md file missing → return node as-is (broken reference)
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
          if (!viewEntry) return { success: false };

          // Build note index so we can find existing .md files
          const noteIndex = await buildNoteIndex(wsPath);

          // Process nodes: extract card content into .md files
          const manifestNodes = await Promise.all(
            nodes.map(async (node) => {
              // Only extract content for card nodes
              if (node.type !== 'card') return node;

              // Assign noteId if not present
              const noteId =
                (node.data.noteId as string) ||
                `note_${crypto.randomUUID().slice(0, 8)}`;

              // Read existing frontmatter to preserve createdAt
              const existingFile = noteIndex.get(noteId);
              let existingFm: Record<string, unknown> | undefined;
              if (existingFile) {
                const doc = await loadNote(wsPath, existingFile);
                if (doc) existingFm = doc.frontmatter;
              }

              // Convert node data to frontmatter + body
              const { frontmatter, body } = cardDataToNote(
                noteId,
                node.data,
                existingFm
              );

              // Write .md file (create or update)
              let filePath: string;
              if (existingFile) {
                filePath = existingFile;
                await writeNote(wsPath, filePath, frontmatter, body);
              } else {
                filePath = await createNote(
                  wsPath,
                  noteId,
                  String(node.data.title || ''),
                  String(frontmatter.displayHint)
                );
                // createNote writes frontmatter but with empty body; rewrite with actual body
                await writeNote(wsPath, filePath, frontmatter, body);
                noteIndex.set(noteId, filePath);
              }

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
            schema: 'spatial-canvas/v1',
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
          if (!filePath) return { success: false };

          frontmatter.updatedAt = new Date().toISOString();
          await writeNote(wsPath, filePath, frontmatter, body);
          return { success: true };
        },

        createNote: async ({ id, title, displayHint }) => {
          const filePath = await createNote(wsPath, id, title, displayHint);
          return { noteId: id, file: filePath };
        },

        deleteNote: async ({ noteId }) => {
          const noteIndex = await buildNoteIndex(wsPath);
          const filePath = noteIndex.get(noteId);
          if (!filePath) return { success: false };

          const deleted = await deleteNoteFile(wsPath, filePath);
          return { success: deleted };
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
            schema: 'spatial-canvas/v1',
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

void main();
