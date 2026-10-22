import { appState } from '../../appState';
import { deleteUnlinkedNotes, scanUnlinkedNotes } from '../../cleanup';
import {
  clearAllTrash,
  listTrash,
  purgeTrash,
  restoreView,
} from '../../workspace';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createTrashHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'listTrash'
  | 'restoreTrash'
  | 'purgeTrash'
  | 'clearAllTrash'
  | 'scanUnlinkedNotes'
  | 'deleteUnlinkedNotes'
> {
  const { wsPath } = ctx;
  return {
    listTrash: async () => await listTrash(wsPath),

    restoreTrash: async ({ trashId }) => {
      const result = await restoreView(wsPath, trashId);
      if (result.success) {
        appState.mainRpc?.send?.viewsUpdated({});
        appState.mainRpc?.send?.trashUpdated({});
      }
      return { success: result.success };
    },

    purgeTrash: async ({ trashId }) => await purgeTrash(wsPath, trashId),

    clearAllTrash: async () => await clearAllTrash(wsPath),

    scanUnlinkedNotes: async () => {
      const entries = await scanUnlinkedNotes(wsPath);
      return { entries };
    },

    deleteUnlinkedNotes: async ({ files }) =>
      await deleteUnlinkedNotes(wsPath, files),
  };
}
