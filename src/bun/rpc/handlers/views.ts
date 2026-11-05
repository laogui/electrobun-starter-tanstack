import { readFile, stat } from 'node:fs/promises';
import { isRecoveryGraph } from '../../../shared/canvasRecovery';
import { appState } from '../../appState';
import {
  listCanvasDataDiagnostics,
  quarantineDamagedTrash,
} from '../../dataDiagnostics';
import {
  parseCanvasManifest,
  resolveWorkspaceManifestPath,
} from '../../manifest';
import { withNoteWorkspace } from '../../noteTransactions';
import {
  addRecoveredView,
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
  | 'listCanvasDataDiagnostics'
  | 'quarantineDamagedTrash'
  | 'readCanvasRecoveryGraph'
  | 'listCanvasRecoveryBackups'
  | 'restoreCanvasSnapshot'
  | 'listViews'
  | 'deleteView'
  | 'restoreView'
  | 'renameView'
  | 'setActiveView'
> {
  const { wsPath } = ctx;
  return {
    listCanvasDataDiagnostics: async () => listCanvasDataDiagnostics(wsPath),
    quarantineDamagedTrash: async ({ trashId, token }) =>
      quarantineDamagedTrash(wsPath, trashId, token),
    readCanvasRecoveryGraph: async ({ viewId }) => {
      const config = await loadWorkspaceConfig(wsPath);
      const view = config.views.find((entry) => entry.id === viewId);
      if (!view) {
        return null;
      }
      try {
        const graph = parseCanvasManifest(
          JSON.parse(
            await readFile(
              resolveWorkspaceManifestPath(wsPath, view.file),
              'utf8'
            )
          )
        );
        return isRecoveryGraph(graph) ? graph : null;
      } catch {
        return null;
      }
    },
    listCanvasRecoveryBackups: async () =>
      withNoteWorkspace(wsPath, async () => {
        const config = await loadWorkspaceConfig(wsPath);
        const backups: import('../../../shared/canvasRecovery').DiskRecoveryBackup[] =
          [];
        for (const view of config.views) {
          for (const suffix of ['.bak', '.pre-topic']) {
            const file = `${view.file}${suffix}`;
            try {
              const path = resolveWorkspaceManifestPath(wsPath, file);
              const graph = parseCanvasManifest(
                JSON.parse(await readFile(path, 'utf8'))
              );
              backups.push({
                file,
                name: view.name,
                viewId: view.id,
                savedAt: (await stat(path)).mtimeMs,
                graph,
              });
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.warn('[recovery] Unusable backup:', file, error);
              }
            }
          }
        }
        return backups;
      }),
    restoreCanvasSnapshot: async ({ name, nodes, edges, workspacePath }) => {
      if (!isRecoveryGraph({ nodes, edges })) {
        return { success: false };
      }
      if (workspacePath && workspacePath !== wsPath) {
        return { success: false };
      }
      const entry = await addRecoveredView(wsPath, name, { nodes, edges });
      return { success: true, viewId: entry.id };
    },
    listViews: async () => {
      const config = await loadWorkspaceConfig(wsPath);
      return { views: config.views, activeViewId: config.activeViewId };
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
