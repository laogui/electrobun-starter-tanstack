import { BrowserView, BrowserWindow, Updater } from "electrobun/bun";
import { initWorkspace, loadWorkspaceConfig } from "./workspace";
import { loadManifest, saveManifest as writeManifest } from "./manifest";
import type { CanvasManifest, ManifestNode, ManifestEdge } from "./manifest";
import { buildNoteIndex, loadNote, saveNote as writeNote, createNote, deleteNoteFile } from "./notes";

const DEV_SERVER_PORT = "5173";
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const DEV_SERVER_RETRY_COUNT = 20;
const DEV_SERVER_RETRY_DELAY_MS = 250;

async function sleep(ms: number) {
  return await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevServer(): Promise<boolean> {
  for (let attempt = 0; attempt < DEV_SERVER_RETRY_COUNT; attempt += 1) {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
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
  if (channel === "dev") {
    const isDevServerReady = await waitForDevServer();

    if (isDevServerReady) {
      console.warn(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    }

    console.warn("Vite dev server not running. Run 'bun run dev:hmr' for HMR support.");
  }
  return "views://mainview/index.html";
}

type CanvasRPC = {
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
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {};
  };
};

async function main() {
  const wsPath = initWorkspace();
  const url = await getMainViewUrl();

  const rpc = BrowserView.defineRPC<CanvasRPC>({
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
              if (node.type === "card" && node.data.noteId) {
                const filePath =
                  (node.data.file as string) || noteIndex.get(node.data.noteId as string);
                if (filePath) {
                  const doc = await loadNote(wsPath, filePath);
                  if (doc) {
                    const { id, displayHint, ...rest } = doc.frontmatter;
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        ...rest,
                        type: displayHint === "note" ? "text" : (displayHint || "text"),
                        content: doc.body,
                        file: filePath,
                      },
                    };
                  }
                }
              }
              return node;
            }),
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

          const manifest: CanvasManifest = {
            schema: "spatial-canvas/v1",
            viewId,
            viewport,
            nodes,
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
      },
      messages: {},
    },
  });

  return new BrowserWindow({
    title: "React + Tailwind + Vite",
    url,
    rpc,
    frame: {
      width: 900,
      height: 700,
      x: 200,
      y: 200,
    },
  });
}

void main();
