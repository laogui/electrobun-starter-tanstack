import {
  listAllTemplates,
  loadTemplate,
  writeTemplateThumbnail,
} from '../../templates';
import { addViewFromTemplate } from '../../workspace';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createTemplatesHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'listTemplates'
  | 'getTemplate'
  | 'createViewFromTemplate'
  | 'saveTemplateThumbnail'
> {
  const { wsPath, isDevChannel } = ctx;
  return {
    listTemplates: () => listAllTemplates(),

    getTemplate: ({ id }) => loadTemplate(id),

    createViewFromTemplate: async ({ name, templateId }) => {
      const result = await addViewFromTemplate(wsPath, name, templateId);
      return result.entry;
    },

    saveTemplateThumbnail: async ({ templateId, pngBase64 }) => {
      // Dev-only: refuse in production launches so packaged apps can't
      // accidentally write back into source-tree paths that don't exist.
      if (!isDevChannel) {
        return { success: false, reason: 'production-mode' };
      }
      return await writeTemplateThumbnail(templateId, pngBase64);
    },
  };
}
