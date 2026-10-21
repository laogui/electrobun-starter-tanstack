import { existsSync, mkdirSync } from 'node:fs';
import { readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { Utils } from 'electrobun/bun';
import { z } from 'zod';

import { getAppDataRoot } from './appPaths';
import { atomicWrite } from './atomicWrite';
import { saveAttachment } from './attachments';
import { createExtensionInstance } from './extensions/instanceStore';
import type { CanvasManifest } from './manifest';
import {
  manifestBackupViewFile,
  resolveWorkspaceManifestPath,
  saveManifest,
} from './manifest';

import { flushNodeMetadata, setNodeMetadata } from './nodeMetadata';
import { createNote, saveNote } from './notes';
import { rotateBackup } from './persistence/backupFile';
import { readJsonOrEmpty } from './persistence/corruptFile';
import { withFileQueue } from './persistence/fileQueue';
import type { TemplateManifest } from './templates';
import { loadTemplate } from './templates';
import { saveWidget } from './widgets';

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
    join(wsPath, '.ghostboard', 'extension-instances'),
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
  const configPath = workspaceConfigPath(wsPath);
  // The default workspace config must be written even when template seeding is disabled.
  const created = await withWorkspaceConfig(wsPath, async () => {
    if (existsSync(configPath)) {
      return false;
    }
    await atomicWrite(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return true;
  });
  if (!created) {
    return;
  }

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

const workspaceViewEntrySchema = z
  .object({
    file: z.string().min(1),
    id: z.string().min(1),
    name: z.string(),
  })
  .loose();

const workspaceConfigSchema = z
  .object({
    activeViewId: z.string(),
    schema: z.literal('ghostboard-workspace/v1').optional(),
    trash: z
      .array(
        z
          .object({
            deletedAt: z.number(),
            trashFile: z.string().min(1),
            trashId: z.string().min(1),
            view: workspaceViewEntrySchema,
          })
          .loose()
      )
      .optional(),
    views: z.array(workspaceViewEntrySchema),
  })
  .loose();

/** Validate a parsed workspace.json value. Throws on any structural problem. */
export function parseWorkspaceConfig(value: unknown): WorkspaceConfig {
  const parsed = workspaceConfigSchema.parse(value);
  return {
    ...parsed,
    schema: 'ghostboard-workspace/v1',
  } as WorkspaceConfig;
}

function workspaceConfigPath(wsPath: string): string {
  return join(wsPath, '.ghostboard', 'workspace.json');
}

function workspaceConfigBackupPath(wsPath: string): string {
  return `${workspaceConfigPath(wsPath)}.bak`;
}

function cloneDefaultConfig(): WorkspaceConfig {
  return structuredClone(DEFAULT_CONFIG);
}

const CANVAS_FILE_SUFFIX = '.canvas.json';

/**
 * Last-resort recovery: rebuild the view list from the manifests that are
 * still in `.ghostboard/views/`. Names are lost (the id is used), but every
 * canvas stays reachable instead of the workspace collapsing to one default.
 */
async function rebuildConfigFromViews(
  wsPath: string
): Promise<WorkspaceConfig | null> {
  const names = await readdir(join(wsPath, '.ghostboard', 'views')).catch(
    () => [] as string[]
  );
  const views: ViewEntry[] = names
    .filter((name) => name.endsWith(CANVAS_FILE_SUFFIX))
    .toSorted()
    .map((name) => {
      const id = name.slice(0, -CANVAS_FILE_SUFFIX.length);
      return { id, name: id, file: `views/${name}` };
    })
    .filter((view) => resolveManagedManifestPath(wsPath, view.file) !== null);
  const first = views[0];
  if (!first) {
    return null;
  }
  return {
    schema: 'ghostboard-workspace/v1',
    activeViewId: first.id,
    views,
  };
}

async function readBackupConfig(
  wsPath: string
): Promise<WorkspaceConfig | null> {
  try {
    return parseWorkspaceConfig(
      JSON.parse(
        await readFile(workspaceConfigBackupPath(wsPath), 'utf8')
      ) as unknown
    );
  } catch {
    return null;
  }
}

/**
 * Read and validate workspace.json without taking the queue. A missing file
 * is replaced by the default config. A damaged file is copied aside to
 * `workspace.json.corrupt-<timestamp>`, then restored from `workspace.json.bak`
 * or rebuilt from the canvases on disk, and the recovered config is written
 * back so the app keeps working.
 */
async function readWorkspaceConfigUnlocked(
  wsPath: string
): Promise<WorkspaceConfig> {
  const configPath = workspaceConfigPath(wsPath);
  const read = await readJsonOrEmpty(configPath, parseWorkspaceConfig);
  if (read.kind === 'ok') {
    return read.value;
  }
  if (read.kind === 'empty') {
    const config = cloneDefaultConfig();
    await atomicWrite(configPath, JSON.stringify(config, null, 2));
    return config;
  }
  console.warn(
    `[workspace] workspace.json is corrupt (${read.error.message}); preserved at ${read.backupPath}`
  );
  const recovered =
    (await readBackupConfig(wsPath)) ??
    (await rebuildConfigFromViews(wsPath)) ??
    cloneDefaultConfig();
  // Do not rotate the corrupt bytes into .bak; they are already preserved.
  await atomicWrite(configPath, JSON.stringify(recovered, null, 2));
  return recovered;
}

async function writeWorkspaceConfigUnlocked(
  wsPath: string,
  config: WorkspaceConfig
): Promise<void> {
  const configPath = workspaceConfigPath(wsPath);
  await rotateBackup(configPath, workspaceConfigBackupPath(wsPath));
  await atomicWrite(configPath, JSON.stringify(config, null, 2));
}

/**
 * Serialize every workspace.json read-modify-write for one workspace so
 * concurrent RPCs (add/rename/remove view, active view, trash) cannot lose
 * each other's updates. Not reentrant: never call a public workspace
 * function from inside `work`.
 */
function withWorkspaceConfig<T>(
  wsPath: string,
  work: () => Promise<T>
): Promise<T> {
  return withFileQueue(workspaceConfigPath(wsPath), work);
}

/** Read workspace.json. Returns (and writes) the default config if not found. */
export function loadWorkspaceConfig(wsPath: string): Promise<WorkspaceConfig> {
  return withWorkspaceConfig(wsPath, () => readWorkspaceConfigUnlocked(wsPath));
}

export { atomicWrite } from './atomicWrite';

/** Save workspace config to disk (atomic write, previous copy kept as .bak). */
export function saveWorkspaceConfig(
  wsPath: string,
  config: WorkspaceConfig
): Promise<void> {
  return withWorkspaceConfig(wsPath, () =>
    writeWorkspaceConfigUnlocked(wsPath, config)
  );
}

/**
 * Run one read-modify-write of workspace.json inside the queue. `mutate`
 * receives a fresh config and returns `{ result, save }`; the config is
 * written back only when `save` is true.
 */
function updateWorkspaceConfig<T>(
  wsPath: string,
  mutate: (config: WorkspaceConfig) => Promise<{ result: T; save: boolean }>
): Promise<T> {
  return withWorkspaceConfig(wsPath, async () => {
    const config = await readWorkspaceConfigUnlocked(wsPath);
    const { result, save } = await mutate(config);
    if (save) {
      await writeWorkspaceConfigUnlocked(wsPath, config);
    }
    return result;
  });
}

/** Persist the active view selection so it survives app restarts. */
export function setActiveViewId(
  wsPath: string,
  viewId: string
): Promise<boolean> {
  return updateWorkspaceConfig(wsPath, async (config) => {
    const exists = config.views.some((v) => v.id === viewId);
    if (!exists) {
      return { result: false, save: false };
    }
    config.activeViewId = viewId;
    return { result: true, save: true };
  });
}

/** Add a new view to the workspace. Returns the new view entry. */
export function addView(wsPath: string, name: string): Promise<ViewEntry> {
  return updateWorkspaceConfig(wsPath, async (config) => {
    const id = `view_${crypto.randomUUID().slice(0, 8)}`;
    const file = `views/${id}.canvas.json`;
    const entry: ViewEntry = { id, name, file };
    config.views.push(entry);
    config.activeViewId = id;
    return { result: entry, save: true };
  });
}

export interface RemoveViewResult {
  activeViewId?: string;
  success: boolean;
  trashId?: string;
}

/** Move a manifest's rolling `.bak` along with it (best effort). */
async function moveManifestBackup(
  wsPath: string,
  fromViewFile: string,
  toViewFile: string
): Promise<void> {
  const from = resolveManagedManifestPath(
    wsPath,
    manifestBackupViewFile(fromViewFile)
  );
  const to = resolveManagedManifestPath(
    wsPath,
    manifestBackupViewFile(toViewFile)
  );
  if (!(from && to && existsSync(from))) {
    return;
  }
  await rename(from, to).catch((error: unknown) => {
    console.warn('[workspace] Failed to move manifest backup:', error);
  });
}

/** Send a trashed manifest's rolling `.bak` to the system Trash (best effort). */
function trashManifestBackup(wsPath: string, viewFile: string): void {
  const path = resolveManagedManifestPath(
    wsPath,
    manifestBackupViewFile(viewFile)
  );
  if (!(path && existsSync(path))) {
    return;
  }
  try {
    Utils.moveToTrash(path);
  } catch (error) {
    console.warn('[workspace] Failed to trash manifest backup:', error);
  }
}

/**
 * Soft-delete a view: move its manifest into `.ghostboard/trash/` and
 * record a TrashEntry in workspace.json. The deletion is recoverable via
 * `restoreView` until the trash entry is purged. Returns success=false if
 * this is the last remaining view.
 */
export function removeView(
  wsPath: string,
  viewId: string
): Promise<RemoveViewResult> {
  return updateWorkspaceConfig(wsPath, async (config) => {
    const fail = { result: { success: false }, save: false };
    if (config.views.length <= 1) {
      return fail;
    }
    const viewEntry = config.views.find((v) => v.id === viewId);
    if (!viewEntry) {
      return fail;
    }
    const remainingViews = config.views.filter((v) => v.id !== viewId);
    let activeViewId = config.activeViewId;
    if (activeViewId === viewId) {
      const nextView = remainingViews[0];
      if (!nextView) {
        return fail;
      }
      activeViewId = nextView.id;
    }

    const trashId = `trash_${crypto.randomUUID().slice(0, 8)}`;
    const deletedAt = Date.now();
    const trashFile = `trash/${trashId}.canvas.json`;
    const sourcePath = resolveManagedManifestPath(wsPath, viewEntry.file);
    const trashPath = resolveManagedManifestPath(wsPath, trashFile);
    if (!(sourcePath && trashPath)) {
      return fail;
    }

    // Move manifest into trash. If the source is missing we still record the
    // trash entry with an empty payload so restore can succeed gracefully.
    try {
      if (existsSync(sourcePath)) {
        await rename(sourcePath, trashPath);
      } else {
        await atomicWrite(trashPath, '{}');
      }
    } catch (err) {
      console.error('[workspace] Failed to move manifest to trash:', err);
      return fail;
    }
    await moveManifestBackup(wsPath, viewEntry.file, trashFile);

    const trashEntry: TrashEntry = {
      trashId,
      view: viewEntry,
      trashFile,
      deletedAt,
    };
    config.views = remainingViews;
    config.activeViewId = activeViewId;
    config.trash = [...(config.trash ?? []), trashEntry];
    return {
      result: { success: true, activeViewId, trashId },
      save: true,
    };
  });
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
export function restoreView(
  wsPath: string,
  trashId: string
): Promise<RestoreViewResult> {
  return updateWorkspaceConfig(wsPath, async (config) => {
    const fail = { result: { success: false }, save: false };
    const trash = config.trash ?? [];
    const entry = trash.find((t) => t.trashId === trashId);
    if (!entry) {
      return fail;
    }

    const trashPath = resolveManagedManifestPath(wsPath, entry.trashFile);
    const restorePath = resolveManagedManifestPath(wsPath, entry.view.file);
    if (!(trashPath && restorePath)) {
      return fail;
    }

    // If the original id is somehow already taken, refuse rather than clobber.
    if (config.views.some((v) => v.id === entry.view.id)) {
      return fail;
    }

    try {
      if (existsSync(trashPath)) {
        await rename(trashPath, restorePath);
      }
    } catch (err) {
      console.error('[workspace] Failed to restore manifest from trash:', err);
      return fail;
    }
    await moveManifestBackup(wsPath, entry.trashFile, entry.view.file);

    config.views = [...config.views, entry.view];
    config.trash = trash.filter((t) => t.trashId !== trashId);
    return {
      result: {
        success: true,
        view: entry.view,
        activeViewId: config.activeViewId,
      },
      save: true,
    };
  });
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
export function clearAllTrash(
  wsPath: string
): Promise<{ purged: number; success: boolean }> {
  return updateWorkspaceConfig(wsPath, async (config) => {
    const trash = config.trash ?? [];
    if (trash.length === 0) {
      return { result: { success: true, purged: 0 }, save: false };
    }
    const remaining: TrashEntry[] = [];
    for (const entry of trash) {
      const trashPath = resolveManagedManifestPath(wsPath, entry.trashFile);
      if (!trashPath) {
        remaining.push(entry);
        continue;
      }
      if (!existsSync(trashPath)) {
        trashManifestBackup(wsPath, entry.trashFile);
        continue;
      }
      try {
        const moved = Utils.moveToTrash(trashPath);
        if (moved) {
          trashManifestBackup(wsPath, entry.trashFile);
        } else {
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
    return {
      result: { success: remaining.length === 0, purged },
      save: true,
    };
  });
}

/**
 * Permanently remove a trash entry: drop it from `workspace.json` and move
 * the manifest file to the system Trash via Electrobun's `Utils.moveToTrash`.
 */
export function purgeTrash(
  wsPath: string,
  trashId: string
): Promise<{ success: boolean }> {
  return updateWorkspaceConfig(wsPath, async (config) => {
    const fail = { result: { success: false }, save: false };
    const trash = config.trash ?? [];
    const entry = trash.find((t) => t.trashId === trashId);
    if (!entry) {
      return fail;
    }
    const trashPath = resolveManagedManifestPath(wsPath, entry.trashFile);
    if (!trashPath) {
      return fail;
    }
    if (existsSync(trashPath)) {
      try {
        const moved = Utils.moveToTrash(trashPath);
        if (!moved) {
          return fail;
        }
      } catch (err) {
        console.warn(
          '[workspace] Failed to move trashed manifest to system Trash:',
          err
        );
        return fail;
      }
    }
    trashManifestBackup(wsPath, entry.trashFile);
    config.trash = trash.filter((t) => t.trashId !== trashId);
    return { result: { success: true }, save: true };
  });
}

/** Rename a view. */
export function renameView(
  wsPath: string,
  viewId: string,
  name: string
): Promise<boolean> {
  return updateWorkspaceConfig(wsPath, async (config) => {
    const view = config.views.find((v) => v.id === viewId);
    if (!view) {
      return { result: false, save: false };
    }
    view.name = name;
    return { result: true, save: true };
  });
}

export interface AddViewFromTemplateResult {
  entry: ViewEntry;
  success: boolean;
}
const TEMPLATE_ASSET_PREFIX = 'tpl-asset:';

function rewriteTemplateAssetValue(
  value: unknown,
  paths: Record<string, string>,
  dataUrls: Record<string, string>,
  key?: string
): unknown {
  if (typeof value === 'string' && value.startsWith(TEMPLATE_ASSET_PREFIX)) {
    const name = value.slice(TEMPLATE_ASSET_PREFIX.length);
    if (key === 'imageUrl') {
      return dataUrls[name] ?? value;
    }
    return paths[name] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      rewriteTemplateAssetValue(item, paths, dataUrls)
    );
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(
      value as Record<string, unknown>
    )) {
      next[childKey] = rewriteTemplateAssetValue(
        child,
        paths,
        dataUrls,
        childKey
      );
    }
    return next;
  }
  return value;
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
  const extensionSeeds = template.extensionInstances ?? {};
  const instanceIdMap = new Map<string, string>();
  const assetPaths: Record<string, string> = {};
  const assetDataUrls: Record<string, string> = {};

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
            ...(content.color ? { color: content.color } : {}),
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

  await Promise.all(
    Object.entries(template.assets ?? {}).map(async ([name, base64]) => {
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      assetDataUrls[name] = dataUrl;
      const saved = await saveAttachment(wsPath, {
        dataUrl,
        kind: 'image',
        mimeType: 'image/jpeg',
        suggestedName: name,
      });
      assetPaths[name] = saved.filePath;
    })
  );
  mkdirSync(join(wsPath, '.ghostboard', 'extension-instances'), {
    recursive: true,
  });
  for (const placeholderId of Object.keys(extensionSeeds)) {
    instanceIdMap.set(
      placeholderId,
      `extinst_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
    );
  }
  await Promise.all(
    Array.from(instanceIdMap, async ([placeholderId, realId]) => {
      const seed = extensionSeeds[placeholderId];
      if (!seed) {
        return;
      }
      await createExtensionInstance(wsPath, {
        appVersion: '0.0.0',
        canvasTypeId: seed.canvasTypeId,
        dataVersion: seed.dataVersion,
        id: realId,
        presentation: seed.presentation,
        state: rewriteTemplateAssetValue(seed.state, assetPaths, assetDataUrls),
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
    if (
      typeof nextData.instanceId === 'string' &&
      instanceIdMap.has(nextData.instanceId)
    ) {
      nextData.instanceId = instanceIdMap.get(nextData.instanceId);
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
          if (
            typeof childData.instanceId === 'string' &&
            instanceIdMap.has(childData.instanceId)
          ) {
            childData.instanceId = instanceIdMap.get(childData.instanceId);
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
