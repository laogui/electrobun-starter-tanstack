import { existsSync, mkdirSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';

import { Utils } from 'electrobun/bun';

// Default workspace is inside the app's userData directory
export function getDefaultWorkspacePath(): string {
  return join(Utils.paths.userData, 'workspace');
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

/** Ensure workspace directory structure exists. Returns workspace path. */
export function initWorkspace(workspacePath?: string): string {
  const wsPath = workspacePath ?? getDefaultWorkspacePath();
  const dirs = [
    wsPath,
    join(wsPath, '.ghostboard'),
    join(wsPath, '.ghostboard', 'views'),
    join(wsPath, '.ghostboard', 'trash'),
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

/** Atomic write: write to a unique .tmp then rename */
export async function atomicWrite(
  filePath: string,
  data: string
): Promise<void> {
  const tmp = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await Bun.write(tmp, data);
  await rename(tmp, filePath);
}

/** Save workspace config to disk (atomic write). */
export async function saveWorkspaceConfig(
  wsPath: string,
  config: WorkspaceConfig
): Promise<void> {
  const configPath = join(wsPath, '.ghostboard', 'workspace.json');
  await atomicWrite(configPath, JSON.stringify(config, null, 2));
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
  const sourcePath = join(wsPath, '.ghostboard', viewEntry.file);
  const trashPath = join(wsPath, '.ghostboard', trashFile);

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

  const trashPath = join(wsPath, '.ghostboard', entry.trashFile);
  const restorePath = join(wsPath, '.ghostboard', entry.view.file);

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
