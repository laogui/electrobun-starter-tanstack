import { Utils } from "electrobun/bun";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { rename } from "fs/promises";

// Default workspace is inside the app's userData directory
export function getDefaultWorkspacePath(): string {
  return join(Utils.paths.userData, "workspace");
}

export interface WorkspaceConfig {
  schema: "spatial-workspace/v1";
  activeViewId: string;
  views: Array<{ id: string; name: string; file: string }>;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  schema: "spatial-workspace/v1",
  activeViewId: "default",
  views: [{ id: "default", name: "Default Canvas", file: "views/default.canvas.json" }],
};

/** Ensure workspace directory structure exists. Returns workspace path. */
export function initWorkspace(workspacePath?: string): string {
  const wsPath = workspacePath ?? getDefaultWorkspacePath();
  const dirs = [
    wsPath,
    join(wsPath, ".spatial"),
    join(wsPath, ".spatial", "views"),
    join(wsPath, "content"),
    join(wsPath, "attachments"),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  return wsPath;
}

/** Read workspace.json. Returns default config if not found. */
export async function loadWorkspaceConfig(wsPath: string): Promise<WorkspaceConfig> {
  const configPath = join(wsPath, ".spatial", "workspace.json");
  const file = Bun.file(configPath);
  if (await file.exists()) {
    return await file.json();
  }
  // Write default config
  await atomicWrite(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return DEFAULT_CONFIG;
}

/** Atomic write: write to .tmp then rename */
export async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await Bun.write(tmp, data);
  await rename(tmp, filePath);
}
