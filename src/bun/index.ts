import { join } from 'node:path';

import {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  Updater,
  Utils,
} from 'electrobun/bun';
import {
  deleteUnlinkedNotes,
  scanUnlinkedNotes,
  type UnlinkedFileEntry,
} from './cleanup';
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
import type { SearchResult } from './search';
import { searchWorkspace } from './search';
import type { TemplateManifest, TemplateMeta } from './templates';
import { listAllTemplates, loadTemplate } from './templates';
import {
  addView,
  addViewFromTemplate,
  atomicWrite,
  initWorkspace,
  listTrash,
  loadWorkspaceConfig,
  purgeTrash,
  removeView,
  renameView,
  restoreView,
  seedFirstRunIfNeeded,
  type TrashEntry,
} from './workspace';

const DEV_SERVER_PORT = '5173';
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const SETTINGS_DEV_SERVER_URL = `${DEV_SERVER_URL}/settings.html`;
const SETTINGS_VIEW_URL = 'views://settingsview/index.html';
const DATA_URL_RE = /^data:(image\/([a-z+]+));base64,(.+)$/i;
const PNG_DATA_URL_RE = /^data:image\/png;base64,(.+)$/i;
const DEV_SERVER_RETRY_COUNT = 20;
const DEV_SERVER_RETRY_DELAY_MS = 250;
const SETTINGS_WINDOW_WIDTH = 400;
const SETTINGS_WINDOW_HEIGHT = 380;
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

export function getSettingsViewUrl(mainViewUrl: string): string {
  return mainViewUrl === DEV_SERVER_URL
    ? SETTINGS_DEV_SERVER_URL
    : SETTINGS_VIEW_URL;
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
      exportPng: {
        params: { dataUrl: string; fileName: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      exportJson: {
        params: { fileName: string; json: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      openSettings: {
        params: Record<string, unknown>;
        response: { success: boolean };
      };
      getSettings: {
        params: Record<string, unknown>;
        response: {
          theme: string;
          locale: string;
          defaultLayoutMode: 'canvas' | 'document';
        };
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
      searchCanvas: {
        params: {
          query: string;
          viewId?: string;
          limit?: number;
        };
        response: SearchResult[];
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
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: {
      openSearch: Record<never, unknown>;
      settingsUpdated: { theme: string; locale: string };
    };
  };
}

interface SettingsRPC {
  bun: {
    requests: {
      getSettings: {
        params: Record<string, unknown>;
        response: {
          theme: string;
          locale: string;
          defaultLayoutMode: 'canvas' | 'document';
        };
      };
      saveSettings: {
        params: {
          theme: string;
          locale: string;
          defaultLayoutMode: 'canvas' | 'document';
        };
        response: { success: boolean };
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
      scanUnlinkedNotes: {
        params: Record<string, unknown>;
        response: { entries: UnlinkedFileEntry[] };
      };
      deleteUnlinkedNotes: {
        params: { files: string[] };
        response: { deleted: string[]; skipped: string[] };
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

interface AppSettings {
  defaultLayoutMode: 'canvas' | 'document';
  locale: string;
  theme: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  locale: 'en',
  defaultLayoutMode: 'canvas',
};

// Cached in memory, backed by settings.json on disk
let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };
let settingsFilePath = '';
let settingsViewUrl = SETTINGS_VIEW_URL;
let settingsWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
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

function createSettingsWindow(
  parentWindow: BrowserWindow | null,
  wsPath: string
): BrowserWindow {
  settingsRpc = BrowserView.defineRPC<SettingsRPC>({
    maxRequestTime: 5000,
    handlers: {
      requests: {
        getSettings: () => cachedSettings,
        saveSettings: async ({ theme, locale, defaultLayoutMode }) => {
          await persistSettings({ theme, locale, defaultLayoutMode });
          // Push update to main window. Note: only theme/locale are pushed
          // live — `defaultLayoutMode` only matters for cold-start, no need
          // to retro-apply it to the running window.
          mainRpc?.send?.settingsUpdated({ theme, locale });
          return { success: true };
        },
        listTrash: async () => await listTrash(wsPath),
        restoreTrash: async ({ trashId }) => {
          const result = await restoreView(wsPath, trashId);
          return { success: result.success };
        },
        purgeTrash: async ({ trashId }) => await purgeTrash(wsPath, trashId),
        scanUnlinkedNotes: async () => {
          const entries = await scanUnlinkedNotes(wsPath);
          return { entries };
        },
        deleteUnlinkedNotes: async ({ files }) =>
          await deleteUnlinkedNotes(wsPath, files),
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
  ]);

  ApplicationMenu.on('application-menu-clicked', (event: unknown) => {
    const e = event as { data?: { action?: string } };
    if (e.data?.action === 'openSearch') {
      mainRpc?.send?.openSearch({});
    }
  });

  const wsPath = initWorkspace();
  await seedFirstRunIfNeeded(wsPath);
  await loadSettings(wsPath);
  const url = await getMainViewUrl();
  settingsViewUrl = getSettingsViewUrl(url);

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
                    const filePath =
                      (childData.file as string | undefined) ??
                      noteIndex.get(existingNoteId);
                    if (filePath) {
                      const doc = await loadNote(wsPath, filePath);
                      if (doc) {
                        const hydrated = noteToCardData(doc);
                        return {
                          ...child,
                          noteId: existingNoteId,
                          data: {
                            ...childData,
                            ...hydrated,
                            noteId: existingNoteId,
                          },
                        };
                      }
                      console.warn(
                        `[persistence] Missing note file for folder-child noteId=${existingNoteId}`
                      );
                    }
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

          // Build note index so we can find existing .md files
          const noteIndex = await buildNoteIndex(wsPath);

          // Phase 1: Serially pre-allocate file paths for new card notes
          // (both top-level cards AND folder card-children) to avoid
          // concurrent createNote calls producing conflicting paths.
          const nodePathMap = new Map<number, string>();
          const folderChildPathMap = new Map<number, Map<number, string>>();
          for (const [idx, node] of nodes.entries()) {
            if (node.type === 'card') {
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
              continue;
            }
            if (node.type === 'folder') {
              const children = (node.data.children ?? []) as Array<{
                data?: Record<string, unknown>;
                id: string;
                noteId?: string;
                type?: string;
              }>;
              const childMap = new Map<number, string>();
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
                const existingFile = noteIndex.get(noteId);
                if (existingFile) {
                  childMap.set(cidx, existingFile);
                } else {
                  const filePath = await createNote(
                    wsPath,
                    noteId,
                    String(childData.title || ''),
                    String(childData.type || 'note')
                  );
                  noteIndex.set(noteId, filePath);
                  childMap.set(cidx, filePath);
                }
              }
              if (childMap.size > 0) {
                folderChildPathMap.set(idx, childMap);
              }
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

              // Folder nodes: write each card-child's .md file and serialize
              // children as thin references (mirrors top-level card flow).
              if (node.type === 'folder') {
                const rawChildren = (node.data.children ?? []) as Array<{
                  data?: Record<string, unknown>;
                  id: string;
                  noteId?: string;
                  type?: string;
                }>;
                const childPathMap = folderChildPathMap.get(idx);
                const serializedChildren = await Promise.all(
                  rawChildren.map(async (child, cidx) => {
                    if (child.type === 'image') {
                      const childData = (child.data ?? {}) as Record<
                        string,
                        unknown
                      >;
                      const { imageUrl, ...rest } = childData;
                      return { ...child, data: rest };
                    }
                    if (child.type !== 'card') {
                      return child;
                    }
                    const filePath = childPathMap?.get(cidx);
                    const noteId = child.noteId as string | undefined;
                    if (!(filePath && noteId)) {
                      return child;
                    }
                    const childData = (child.data ?? {}) as Record<
                      string,
                      unknown
                    >;
                    // Read existing frontmatter to preserve createdAt
                    let existingFm: Record<string, unknown> | undefined;
                    const existingDoc = await loadNote(wsPath, filePath);
                    if (existingDoc) {
                      existingFm = existingDoc.frontmatter;
                    }
                    const { frontmatter, body } = cardDataToNote(
                      noteId,
                      childData,
                      existingFm
                    );
                    await writeNoteWithPreview(
                      wsPath,
                      filePath,
                      frontmatter,
                      body
                    );
                    return {
                      id: child.id,
                      noteId,
                      type: 'card' as const,
                      data: {
                        noteId,
                        file: filePath,
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

          const safeFileName = fileName.endsWith('.png')
            ? fileName
            : `${fileName}.png`;
          const outputPath = join(selectedFolder, safeFileName);
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

          const safeFileName = fileName.endsWith('.json')
            ? fileName
            : `${fileName}.json`;
          const outputPath = join(selectedFolder, safeFileName);
          await Bun.write(outputPath, json);

          return { filePath: outputPath, success: true };
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

        searchCanvas: async ({ query, viewId, limit }) =>
          await searchWorkspace(wsPath, { query, viewId, limit }),

        listTemplates: () => listAllTemplates(),

        getTemplate: ({ id }) => loadTemplate(id),

        createViewFromTemplate: async ({ name, templateId }) => {
          const result = await addViewFromTemplate(wsPath, name, templateId);
          return result.entry;
        },
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
