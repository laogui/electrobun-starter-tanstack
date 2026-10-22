import { resolve } from 'node:path';
import { Utils } from 'electrobun/bun';
import { buildAIConfig } from '../../aiConfig';
import {
  checkForUpdateImpl,
  getAppInfoData,
  switchWorkspaceImpl,
} from '../../appLifecycle';
import { appState } from '../../appState';
import { getDefaultWorkspacePath } from '../../workspace';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createAppHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'toggleWindowMaximize'
  | 'openExternalUrl'
  | 'getWorkspaceInfo'
  | 'openWorkspaceFolder'
  | 'switchWorkspace'
  | 'getAppInfo'
  | 'checkForUpdate'
  | 'getLocalHttpEndpoint'
> {
  const { wsPath } = ctx;
  return {
    toggleWindowMaximize: () => {
      if (!appState.mainWindow) {
        return { success: false, maximized: false };
      }

      if (appState.mainWindow.isMaximized()) {
        appState.mainWindow.unmaximize();
        return { success: true, maximized: false };
      }

      appState.mainWindow.maximize();
      return { success: true, maximized: true };
    },

    openExternalUrl: ({ url }) => {
      // Restrict to common safe schemes. file:// / javascript: / custom
      // app schemes never leave this gate so a malicious link node cannot
      // pivot through the bun process.
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { success: false };
      }
      if (
        parsed.protocol !== 'http:' &&
        parsed.protocol !== 'https:' &&
        parsed.protocol !== 'mailto:'
      ) {
        return { success: false };
      }
      return { success: Utils.openExternal(url) };
    },

    getWorkspaceInfo: async () => {
      const defaultPath = getDefaultWorkspacePath();
      return {
        path: wsPath,
        isDefault: resolve(wsPath) === resolve(defaultPath),
      };
    },

    openWorkspaceFolder: () => {
      Utils.showItemInFolder(wsPath);
      return { success: true };
    },

    switchWorkspace: () => switchWorkspaceImpl(),

    getAppInfo: () => getAppInfoData(),

    checkForUpdate: () => checkForUpdateImpl(),

    getLocalHttpEndpoint: () => ({
      baseUrl: appState.localHttpServer?.baseUrl ?? '',
      token: appState.localHttpServer?.token ?? '',
      mediaToken: appState.localHttpServer?.mediaToken ?? '',
      aiEnabled: appState.localHttpServer != null && buildAIConfig() !== null,
    }),
  };
}
