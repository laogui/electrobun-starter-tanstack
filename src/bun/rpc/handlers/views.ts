import { appState } from '../../appState';
import { saveManifest as writeManifest } from '../../manifest';
import {
  addView,
  loadWorkspaceConfig,
  removeView,
  renameView,
  restoreView,
  setActiveViewId,
} from '../../workspace';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createViewsHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'listViews'
  | 'createView'
  | 'deleteView'
  | 'restoreView'
  | 'renameView'
  | 'setActiveView'
> {
  const { wsPath } = ctx;
  return {
    listViews: async () => {
      const config = await loadWorkspaceConfig(wsPath);
      return { views: config.views, activeViewId: config.activeViewId };
    },

    createView: async ({ name }) => {
      const entry = await addView(wsPath, name);
      // Write an empty manifest for the new view
      await writeManifest(wsPath, entry.file, {
        schema: 'ghostboard-canvas/v1',
        viewId: entry.id,
        nodes: [],
        edges: [],
      });
      return entry;
    },

    deleteView: async ({ viewId }) => {
      const result = await removeView(wsPath, viewId);
      if (!result.success) {
        return { success: false };
      }
      // Notify the main renderer so an open Settings dialog refreshes Trash.
      appState.mainRpc?.send?.trashUpdated({});
      return {
        success: true,
        activeViewId: result.activeViewId,
        trashId: result.trashId,
      };
    },

    restoreView: async ({ trashId }) => {
      const result = await restoreView(wsPath, trashId);
      if (!result.success) {
        return { success: false };
      }
      appState.mainRpc?.send?.trashUpdated({});
      return {
        success: true,
        view: result.view,
        activeViewId: result.activeViewId,
      };
    },

    renameView: async ({ viewId, name }) => {
      const success = await renameView(wsPath, viewId, name);
      return { success };
    },

    setActiveView: async ({ viewId }) => {
      const success = await setActiveViewId(wsPath, viewId);
      return { success };
    },
  };
}
