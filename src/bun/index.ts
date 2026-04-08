import { BrowserView, BrowserWindow, Updater } from "electrobun/bun";
import { initWorkspace, loadWorkspaceConfig } from "./workspace";
import { loadManifest, saveManifest as writeManifest } from "./manifest";
import type { CanvasManifest, ManifestNode, ManifestEdge } from "./manifest";
import {
  buildNoteIndex, loadNote, saveNote as writeNote, createNote, deleteNoteFile,
  cardDataToNote, noteToCardData,
} from "./notes";

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
              // Only hydrate card nodes that have a noteId reference
              if (node.type === "card" && node.data.noteId) {
                const filePath =
                  (node.data.file as string) || noteIndex.get(node.data.noteId as string);
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
                console.warn(`[persistence] Note file not found for noteId=${node.data.noteId}`);
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

          // Build note index so we can find existing .md files
          const noteIndex = await buildNoteIndex(wsPath);

          // Process nodes: extract card content into .md files
          const manifestNodes = await Promise.all(
            nodes.map(async (node) => {
              // Only extract content for card nodes
              if (node.type !== "card") return node;

              // Assign noteId if not present
              const noteId = (node.data.noteId as string) ||
                `note_${crypto.randomUUID().slice(0, 8)}`;

              // Read existing frontmatter to preserve createdAt
              const existingFile = noteIndex.get(noteId);
              let existingFm: Record<string, unknown> | undefined;
              if (existingFile) {
                const doc = await loadNote(wsPath, existingFile);
                if (doc) existingFm = doc.frontmatter;
              }

              // Convert node data to frontmatter + body
              const { frontmatter, body } = cardDataToNote(noteId, node.data, existingFm);

              // Write .md file (create or update)
              let filePath: string;
              if (existingFile) {
                filePath = existingFile;
                await writeNote(wsPath, filePath, frontmatter, body);
              } else {
                filePath = await createNote(
                  wsPath, noteId,
                  String(node.data.title || ""),
                  String(frontmatter.displayHint),
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
            }),
          );

          const manifest: CanvasManifest = {
            schema: "spatial-canvas/v1",
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
