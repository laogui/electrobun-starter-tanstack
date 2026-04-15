import { existsSync, mkdirSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';

import { Utils } from 'electrobun/bun';

// Default workspace is inside the app's userData directory
export function getDefaultWorkspacePath(): string {
  return join(Utils.paths.userData, 'workspace');
}

export interface WorkspaceConfig {
  schema: 'spatial-workspace/v1';
  activeViewId: string;
  views: Array<{ id: string; name: string; file: string }>;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  schema: 'spatial-workspace/v1',
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
    join(wsPath, '.spatial'),
    join(wsPath, '.spatial', 'views'),
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
  const configPath = join(wsPath, '.spatial', 'workspace.json');
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
  const configPath = join(wsPath, '.spatial', 'workspace.json');
  await atomicWrite(configPath, JSON.stringify(config, null, 2));
}

/** Add a new view to the workspace. Returns the new view entry. */
export async function addView(
  wsPath: string,
  name: string
): Promise<{ id: string; name: string; file: string }> {
  const config = await loadWorkspaceConfig(wsPath);
  const id = `view_${crypto.randomUUID().slice(0, 8)}`;
  const file = `views/${id}.canvas.json`;
  const entry = { id, name, file };
  config.views.push(entry);
  config.activeViewId = id;
  await saveWorkspaceConfig(wsPath, config);
  return entry;
}

/** Remove a view from the workspace. Returns false if it's the last view. */
export async function removeView(
  wsPath: string,
  viewId: string
): Promise<boolean> {
  const config = await loadWorkspaceConfig(wsPath);
  if (config.views.length <= 1) return false;
  const viewEntry = config.views.find((v) => v.id === viewId);
  config.views = config.views.filter((v) => v.id !== viewId);
  if (config.activeViewId === viewId) {
    config.activeViewId = config.views[0]!.id;
  }
  await saveWorkspaceConfig(wsPath, config);
  // Delete the manifest file
  if (viewEntry) {
    const filePath = join(wsPath, '.spatial', viewEntry.file);
    try {
      const { unlinkSync } = await import('node:fs');
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
  return true;
}

/** Rename a view. */
export async function renameView(
  wsPath: string,
  viewId: string,
  name: string
): Promise<boolean> {
  const config = await loadWorkspaceConfig(wsPath);
  const view = config.views.find((v) => v.id === viewId);
  if (!view) return false;
  view.name = name;
  await saveWorkspaceConfig(wsPath, config);
  return true;
}
