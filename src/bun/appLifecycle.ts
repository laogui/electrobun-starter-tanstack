import { resolve } from 'node:path';
import { ApplicationMenu, Updater, Utils } from 'electrobun/bun';
import type {
  AppInfoResponse,
  SwitchWorkspaceResponse,
  UpdateCheckResponse,
} from './rpc/types';
import { loadUserPrefs, saveUserPrefs } from './userprefs';
import { initWorkspace } from './workspace';

export async function getAppInfoData(): Promise<AppInfoResponse> {
  try {
    // Updater.getLocalInfo returns the full version.json shape
    // (version + hash + channel + name + identifier) — Updater.localInfo
    // only exposes a subset, so we use the lower-level call here.
    const info = await Updater.getLocalInfo();
    return {
      version: info.version,
      hash: info.hash,
      channel: info.channel,
      name: info.name,
      identifier: info.identifier,
    };
  } catch (error) {
    console.warn('[settings] Failed to read app info:', error);
    return {
      version: '0.0.0',
      hash: '',
      channel: 'dev',
      name: 'GhostBoard',
      identifier: 'dev.ghostboard',
    };
  }
}

export async function checkForUpdateImpl(): Promise<UpdateCheckResponse> {
  try {
    const localHash = await Updater.localInfo.hash().catch(() => '');
    const result = await Updater.checkForUpdate();
    return {
      currentHash: localHash,
      hash: result.hash ?? '',
      version: result.version ?? '',
      updateAvailable: Boolean(result.updateAvailable),
    };
  } catch (error) {
    return {
      currentHash: '',
      hash: '',
      version: '',
      updateAvailable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Prompt the user to pick a new workspace directory. The new path is
 * persisted to `~/.ghostboard/{channel}/userprefs.json`; the renderer is expected to show
 * a "restart required" toast — switching wsPath in-process would require
 * tearing down every open RPC handler, manifest cache, and file watcher, so
 * we keep the pivot to a restart boundary.
 */
export async function switchWorkspaceImpl(): Promise<SwitchWorkspaceResponse> {
  const selectedFolders = await Utils.openFileDialog({
    allowedFileTypes: '*',
    allowsMultipleSelection: false,
    canChooseDirectory: true,
    canChooseFiles: false,
    startingFolder: '~/',
  });
  const selectedFolder = selectedFolders.find(Boolean);
  if (!selectedFolder) {
    return { canceled: true, success: false };
  }
  const target = resolve(selectedFolder);
  // Initialize the workspace dirs eagerly so a brand-new folder boots into a
  // valid layout on next launch.
  try {
    initWorkspace(target);
  } catch (error) {
    console.warn('[settings] Failed to init new workspace:', error);
    return { success: false };
  }
  const prefs = await loadUserPrefs();
  prefs.workspacePath = target;
  await saveUserPrefs(prefs);
  return { success: true, path: target };
}

export function setApplicationMenu() {
  ApplicationMenu.setApplicationMenu([
    {
      label: 'GhostBoard',
      submenu: [
        { role: 'about' },
        { type: 'divider' },
        { role: 'hide', accelerator: 'CmdOrCtrl+H' },
        { role: 'hideOthers', accelerator: 'CmdOrCtrl+Alt+H' },
        { role: 'showAll' },
        { type: 'divider' },
        { role: 'quit', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          action: 'canvasUndo',
          accelerator: 'CmdOrCtrl+Z',
        },
        {
          label: 'Redo',
          action: 'canvasRedo',
          accelerator: 'CmdOrCtrl+Shift+Z',
        },
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
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', accelerator: 'CmdOrCtrl+M' },
        { role: 'close', accelerator: 'CmdOrCtrl+W' },
      ],
    },
  ]);
}
