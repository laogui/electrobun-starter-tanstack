import { existsSync, mkdirSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';

import { Utils } from 'electrobun/bun';

import { getAppDataRoot } from './appPaths';
import { atomicWrite } from './atomicWrite';
import type { CanvasManifest } from './manifest';
import { resolveWorkspaceManifestPath, saveManifest } from './manifest';

function resolveManagedManifestPath(
  wsPath: string,
  viewFile: string
): string | null {
  try {
    return resolveWorkspaceManifestPath(wsPath, viewFile);
  } catch {
    return null;
  }
}
import { flushNodeMetadata, setNodeMetadata } from './nodeMetadata';
import { createNote, saveNote } from './notes';
import type { TemplateManifest } from './templates';
import { loadTemplate } from './templates';
import { saveWidget } from './widgets';

// Default workspace lives under ~/.ghostboard/{channel}/workspace
export function getDefaultWorkspacePath(): string {
  return join(getAppDataRoot(), 'workspace');
}

export interface ViewEntry {
  file: string;
  id: string;
  name: string;
}

export interface TrashEntry {
  deletedAt: number;
  trashFile: string;
  trashId: string;
  view: ViewEntry;
}

export interface WorkspaceConfig {
  activeViewId: string;
  schema: 'ghostboard-workspace/v1';
  trash?: TrashEntry[];
  views: ViewEntry[];
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  schema: 'ghostboard-workspace/v1',
  activeViewId: 'default',
  views: [
    {
      id: 'default',
      name: 'Default Canvas',
      file: 'views/default.canvas.json',
    },
  ],
};

/**
 * Template id used to seed the default canvas on the very first launch
 * (when `workspace.json` does not yet exist). Setting this to `null` skips
 * first-run seeding entirely so the default canvas opens blank.
 *
 * Defaults to `quick-start` so newcomers land on an interactive 5-minute
 * tutorial that demonstrates pan/zoom, focused mode, edges, and folder
 * stacking on a single canvas.
 */
const FIRST_RUN_SEED_TEMPLATE_ID: string | null = 'quick-start';

/** Ensure workspace directory structure exists. Returns workspace path. */
export function initWorkspace(workspacePath?: string): string {
  const wsPath = workspacePath ?? getDefaultWorkspacePath();
  const dirs = [
    wsPath,
    join(wsPath, '.ghostboard'),
    join(wsPath, '.ghostboard', 'views'),
    join(wsPath, '.ghostboard', 'trash'),
    join(wsPath, '.ghostboard', 'widgets'),
    join(wsPath, 'content'),
    join(wsPath, 'attachments'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  return wsPath;
}

/**
 * On the very first launch (workspace.json absent), write the default
 * config and seed the default canvas from the demo template so users land
 * in a populated workspace. Subsequent launches and explicit "New Canvas
 * → Blank Canvas" creations leave manifests untouched.
 */
export async function seedFirstRunIfNeeded(wsPath: string): Promise<void> {
  const configPath = join(wsPath, '.ghostboard', 'workspace.json');
  if (existsSync(configPath)) {
    return;
  }

  // The default workspace config must be written even when template seeding is disabled.
  // react-doctor-disable-next-line react-doctor/async-defer-await
  await atomicWrite(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));

  if (!FIRST_RUN_SEED_TEMPLATE_ID) {
    return;
  }
  const template = loadTemplate(FIRST_RUN_SEED_TEMPLATE_ID);
  const defaultView = DEFAULT_CONFIG.views[0];
  if (!(template && defaultView)) {
    return;
  }
  try {
    await populateViewFromTemplate(wsPath, defaultView, template);
  } catch (err) {
    console.error('[workspace] First-run seeding failed:', err);
  }
}

/** Read workspace.json. Returns default config if not found. */
export async function loadWorkspaceConfig(
  wsPath: string
): Promise<WorkspaceConfig> {
  const configPath = join(wsPath, '.ghostboard', 'workspace.json');
  const file = Bun.file(configPath);
  if (await file.exists()) {
    return await file.json();
  }
  // Write default config
  await atomicWrite(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return DEFAULT_CONFIG;
}

export { atomicWrite } from './atomicWrite';

/** Save workspace config to disk (atomic write). */
export async function saveWorkspaceConfig(
  wsPath: string,
  config: WorkspaceConfig
): Promise<void> {
  const configPath = join(wsPath, '.ghostboard', 'workspace.json');
  await atomicWrite(configPath, JSON.stringify(config, null, 2));
}

/** Persist the active view selection so it survives app restarts. */
export async function setActiveViewId(
  wsPath: string,
  viewId: string
): Promise<boolean> {
  const config = await loadWorkspaceConfig(wsPath);
  const exists = config.views.some((v) => v.id === viewId);
  if (!exists) {
    return false;
  }
  config.activeViewId = viewId;
  await saveWorkspaceConfig(wsPath, config);
  return true;
}

/** Add a new view to the workspace. Returns the new view entry. */
export async function addView(
  wsPath: string,
  name: string
): Promise<ViewEntry> {
  const config = await loadWorkspaceConfig(wsPath);
  const id = `view_${crypto.randomUUID().slice(0, 8)}`;
  const file = `views/${id}.canvas.json`;
  const entry: ViewEntry = { id, name, file };
  config.views.push(entry);
  config.activeViewId = id;
  await saveWorkspaceConfig(wsPath, config);
  return entry;
}

export interface RemoveViewResult {
  activeViewId?: string;
  success: boolean;
  trashId?: string;
}

/**
 * Soft-delete a view: move its manifest into `.ghostboard/trash/` and
 * record a TrashEntry in workspace.json. The deletion is recoverable via
 * `restoreView` until the trash entry is purged. Returns success=false if
 * this is the last remaining view.
 */
export async function removeView(
  wsPath: string,
  viewId: string
): Promise<RemoveViewResult> {
  const config = await loadWorkspaceConfig(wsPath);
  if (config.views.length <= 1) {
    return { success: false };
  }
  const viewEntry = config.views.find((v) => v.id === viewId);
  if (!viewEntry) {
    return { success: false };
  }
  config.views = config.views.filter((v) => v.id !== viewId);
  if (config.activeViewId === viewId) {
    const nextView = config.views[0];
    if (!nextView) {
      return { success: false };
    }
    config.activeViewId = nextView.id;
  }

  const trashId = `trash_${crypto.randomUUID().slice(0, 8)}`;
  const deletedAt = Date.now();
  const trashFile = `trash/${trashId}.canvas.json`;
  const sourcePath = resolveManagedManifestPath(wsPath, viewEntry.file);
  const trashPath = resolveManagedManifestPath(wsPath, trashFile);
  if (!(sourcePath && trashPath)) {
    return { success: false };
  }

  // Move manifest into trash. If the source is missing we still record the
  // trash entry with an empty payload so restore can succeed gracefully.
  try {
    if (existsSync(sourcePath)) {
      await rename(sourcePath, trashPath);
    } else {
      await Bun.write(trashPath, '{}');
    }
  } catch (err) {
    console.error('[workspace] Failed to move manifest to trash:', err);
    return { success: false };
  }

  const trashEntry: TrashEntry = {
    trashId,
    view: viewEntry,
    trashFile,
    deletedAt,
  };
  config.trash = [...(config.trash ?? []), trashEntry];

  await saveWorkspaceConfig(wsPath, config);
  return { success: true, activeViewId: config.activeViewId, trashId };
}

export interface RestoreViewResult {
  activeViewId?: string;
  success: boolean;
  view?: ViewEntry;
}

/**
 * Restore a previously soft-deleted view. Moves the manifest back to its
 * original location and re-inserts the view entry into `views`. The active
 * view is left unchanged unless it is now invalid.
 */
export async function restoreView(
  wsPath: string,
  trashId: string
): Promise<RestoreViewResult> {
  const config = await loadWorkspaceConfig(wsPath);
  const trash = config.trash ?? [];
  const entry = trash.find((t) => t.trashId === trashId);
  if (!entry) {
    return { success: false };
  }

  const trashPath = resolveManagedManifestPath(wsPath, entry.trashFile);
  const restorePath = resolveManagedManifestPath(wsPath, entry.view.file);
  if (!(trashPath && restorePath)) {
    return { success: false };
  }

  // If the original id is somehow already taken, refuse rather than clobber.
  if (config.views.some((v) => v.id === entry.view.id)) {
    return { success: false };
  }

  try {
    if (existsSync(trashPath)) {
      await rename(trashPath, restorePath);
    }
  } catch (err) {
    console.error('[workspace] Failed to restore manifest from trash:', err);
    return { success: false };
  }

  config.views = [...config.views, entry.view];
  config.trash = trash.filter((t) => t.trashId !== trashId);
  await saveWorkspaceConfig(wsPath, config);
  return {
    success: true,
    view: entry.view,
    activeViewId: config.activeViewId,
  };
}

/** List soft-deleted views, newest first. */
export async function listTrash(wsPath: string): Promise<TrashEntry[]> {
  const config = await loadWorkspaceConfig(wsPath);
  return (config.trash ?? []).toSorted((a, b) => b.deletedAt - a.deletedAt);
}

/**
 * Permanently remove every trash entry in a single pass. Returns the number
 * of trash entries that were purged (regardless of whether the underlying
 * manifest file still existed on disk).
 */
export async function clearAllTrash(
  wsPath: string
): Promise<{ purged: number; success: boolean }> {
  const config = await loadWorkspaceConfig(wsPath);
  const trash = config.trash ?? [];
  if (trash.length === 0) {
    return { success: true, purged: 0 };
  }
  const remaining: TrashEntry[] = [];
  for (const entry of trash) {
    const trashPath = resolveManagedManifestPath(wsPath, entry.trashFile);
    if (!trashPath) {
      remaining.push(entry);
      continue;
    }
    if (!existsSync(trashPath)) {
      continue;
    }
    try {
      const moved = Utils.moveToTrash(trashPath);
      if (!moved) {
        remaining.push(entry);
      }
    } catch (err) {
      console.warn(
        '[workspace] Failed to move trashed manifest to system Trash:',
        err
      );
      remaining.push(entry);
    }
  }
  const purged = trash.length - remaining.length;
  config.trash = remaining;
  await saveWorkspaceConfig(wsPath, config);
  return { success: remaining.length === 0, purged };
}

/**
 * Permanently remove a trash entry: drop it from `workspace.json` and move
 * the manifest file to the system Trash via Electrobun's `Utils.moveToTrash`.
 */
export async function purgeTrash(
  wsPath: string,
  trashId: string
): Promise<{ success: boolean }> {
  const config = await loadWorkspaceConfig(wsPath);
  const trash = config.trash ?? [];
  const entry = trash.find((t) => t.trashId === trashId);
  if (!entry) {
    return { success: false };
  }
  const trashPath = resolveManagedManifestPath(wsPath, entry.trashFile);
  if (!trashPath) {
    return { success: false };
  }
  if (existsSync(trashPath)) {
    try {
      const moved = Utils.moveToTrash(trashPath);
      if (!moved) {
        return { success: false };
      }
    } catch (err) {
      console.warn(
        '[workspace] Failed to move trashed manifest to system Trash:',
        err
      );
      return { success: false };
    }
  }
  config.trash = trash.filter((t) => t.trashId !== trashId);
  await saveWorkspaceConfig(wsPath, config);
  return { success: true };
}

/** Rename a view. */
export async function renameView(
  wsPath: string,
  viewId: string,
  name: string
): Promise<boolean> {
  const config = await loadWorkspaceConfig(wsPath);
  const view = config.views.find((v) => v.id === viewId);
  if (!view) {
    return false;
  }
  view.name = name;
  await saveWorkspaceConfig(wsPath, config);
  return true;
}

export interface AddViewFromTemplateResult {
  entry: ViewEntry;
  success: boolean;
}

/**
 * Populate an existing view's manifest from a template:
 *   1. Generate a real noteId for every placeholder in `template.noteContents`
 *   2. Create the corresponding .md note files
 *   3. Rewrite top-level node `noteId` references to the real ids
 *   4. Write the populated canvas manifest to disk
 *
 * Used both for first-run seeding (the default view) and for creating new
 * views from the templates browser.
 */
export async function populateViewFromTemplate(
  wsPath: string,
  view: ViewEntry,
  template: TemplateManifest
): Promise<void> {
  const noteIdMap = new Map<string, string>();
  const noteContents = template.noteContents ?? {};
  const widgetIdMap = new Map<string, string>();
  const widgetSeeds = template.widgets ?? {};

  for (const placeholderId of Object.keys(noteContents)) {
    const realId = `note_${crypto.randomUUID().slice(0, 8)}`;
    noteIdMap.set(placeholderId, realId);
  }
  for (const placeholderId of Object.keys(widgetSeeds)) {
    const realId = `widget_${crypto.randomUUID().slice(0, 8)}`;
    widgetIdMap.set(placeholderId, realId);
  }

  await Promise.all(
    Array.from(noteIdMap, async ([placeholderId, realId]) => {
      const content = noteContents[placeholderId];
      if (!content) {
        return;
      }
      const filePath = await createNote(
        wsPath,
        realId,
        content.title,
        content.displayHint
      );
      if (content.body) {
        const now = new Date().toISOString();
        await saveNote(
          wsPath,
          filePath,
          {
            id: realId,
            title: content.title,
            displayHint: content.displayHint,
            createdAt: now,
            updatedAt: now,
          },
          content.body
        );
      }
    })
  );
  await Promise.all(
    Array.from(widgetIdMap, async ([placeholderId, realId]) => {
      const seed = widgetSeeds[placeholderId];
      if (!seed) {
        return;
      }
      const now = new Date().toISOString();
      await saveWidget(wsPath, {
        ...seed,
        id: realId,
        createdAt: now,
        updatedAt: now,
      });
    })
  );

  const nodes = template.nodes.map((node) => {
    const noteId = node.data.noteId as string | undefined;
    const widgetId = node.data.widgetId as string | undefined;
    const nextData = { ...node.data };
    if (noteId && noteIdMap.has(noteId)) {
      nextData.noteId = noteIdMap.get(noteId);
    }
    if (widgetId && widgetIdMap.has(widgetId)) {
      nextData.widgetId = widgetIdMap.get(widgetId);
    }
    if (node.type !== 'folder') {
      return { ...node, data: nextData };
    }
    const children = Array.isArray(nextData.children)
      ? nextData.children.map((rawChild) => {
          if (!rawChild || typeof rawChild !== 'object') {
            return rawChild;
          }
          const child = rawChild as {
            data?: Record<string, unknown>;
            noteId?: string;
            type?: string;
          };
          const childData = { ...(child.data ?? {}) };
          const childNoteId =
            child.noteId ?? (childData.noteId as string | undefined);
          const childWidgetId = childData.widgetId as string | undefined;
          if (childNoteId && noteIdMap.has(childNoteId)) {
            childData.noteId = noteIdMap.get(childNoteId);
          }
          if (childWidgetId && widgetIdMap.has(childWidgetId)) {
            childData.widgetId = widgetIdMap.get(childWidgetId);
          }
          return {
            ...child,
            ...(childNoteId && noteIdMap.has(childNoteId)
              ? { noteId: noteIdMap.get(childNoteId) }
              : {}),
            data: childData,
          };
        })
      : nextData.children;
    return {
      ...node,
      data: { ...nextData, children },
    };
  });

  // Write per-node tag metadata to the workspace sidecar. Card placeholders
  // are remapped to their real noteIds; non-card keys (node.id) flow through
  // unchanged.
  if (template.nodeMetadata) {
    await Promise.all(
      Object.entries(template.nodeMetadata).map(([placeholderKey, meta]) => {
        const realKey =
          noteIdMap.get(placeholderKey) ??
          widgetIdMap.get(placeholderKey) ??
          placeholderKey;
        return setNodeMetadata(wsPath, realKey, meta);
      })
    );
    await flushNodeMetadata(wsPath);
  }

  const manifest: CanvasManifest = {
    schema: 'ghostboard-canvas/v1',
    viewId: view.id,
    nodes,
    edges: template.edges,
  };
  await saveManifest(wsPath, view.file, manifest);
}

/**
 * Create a new view pre-populated from a built-in template.
 */
export async function addViewFromTemplate(
  wsPath: string,
  name: string,
  templateId: string
): Promise<AddViewFromTemplateResult> {
  const template = loadTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const entry = await addView(wsPath, name);
  await populateViewFromTemplate(wsPath, entry, template);
  return { success: true, entry };
}
