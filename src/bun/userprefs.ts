import { existsSync, mkdirSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { getAppDataRoot } from './appPaths';

/**
 * App-level user preferences that must live OUTSIDE the workspace
 * (the workspace path itself, for instance — we can't store that in
 * `<workspace>/.ghostboard/settings.json` because we wouldn't know
 * which workspace to read it from).
 *
 * Stored at `~/.ghostboard/{channel}/userprefs.json`.
 */
export interface UserPrefs {
  /**
   * Absolute path to the active workspace. When undefined the app falls back
   * to `~/.ghostboard/{channel}/workspace` (see `getDefaultWorkspacePath`).
   */
  workspacePath?: string;
}

const USERPREFS_FILENAME = 'userprefs.json';

function getUserPrefsPath(): string {
  return join(getAppDataRoot(), USERPREFS_FILENAME);
}

/** Read userprefs.json. Returns an empty object when the file is missing or unreadable. */
export async function loadUserPrefs(): Promise<UserPrefs> {
  const file = Bun.file(getUserPrefsPath());
  if (!(await file.exists())) {
    return {};
  }
  try {
    const parsed = (await file.json()) as Partial<UserPrefs>;
    return {
      workspacePath:
        typeof parsed.workspacePath === 'string' && parsed.workspacePath.length
          ? parsed.workspacePath
          : undefined,
    };
  } catch {
    return {};
  }
}

/** Atomic write to userprefs.json (creates parent dir if missing). */
export async function saveUserPrefs(prefs: UserPrefs): Promise<void> {
  const path = getUserPrefsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = `${path}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await Bun.write(tmp, JSON.stringify(prefs, null, 2));
  await rename(tmp, path);
}

/** Convenience: clear the custom workspace path (revert to default). */
export async function resetWorkspacePath(): Promise<void> {
  const prefs = await loadUserPrefs();
  prefs.workspacePath = undefined;
  await saveUserPrefs(prefs);
}
