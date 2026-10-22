import {
  deleteNodeMetadata,
  deleteTagEverywhere,
  listAllTagsFromMetadata,
  loadAllMetadata,
  renameTagEverywhere,
  setNodeMetadata,
} from '../../nodeMetadata';
import { searchWorkspace } from '../../search';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createMetadataHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'searchCanvas'
  | 'listTags'
  | 'renameTag'
  | 'deleteTag'
  | 'loadNodeMetadata'
  | 'setNodeMetadata'
  | 'deleteNodeMetadata'
> {
  const { wsPath } = ctx;
  return {
    searchCanvas: async ({ query, viewId, limit }) =>
      await searchWorkspace(wsPath, { query, viewId, limit }),

    listTags: async () => await listAllTagsFromMetadata(wsPath),

    renameTag: async ({ oldName, newName }) =>
      await renameTagEverywhere(wsPath, oldName, newName),

    deleteTag: async ({ name }) => await deleteTagEverywhere(wsPath, name),

    loadNodeMetadata: async () => await loadAllMetadata(wsPath),

    setNodeMetadata: async ({ id, metadata }) => {
      await setNodeMetadata(wsPath, id, metadata);
      return { success: true };
    },

    deleteNodeMetadata: async ({ id }) => {
      await deleteNodeMetadata(wsPath, id);
      return { success: true };
    },
  };
}
