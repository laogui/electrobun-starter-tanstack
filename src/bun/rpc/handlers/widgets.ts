import { trackedClone } from '../../cloneReceipts';
import {
  cloneWidget,
  createWidget,
  deleteWidget,
  saveWidget,
} from '../../widgets';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createWidgetsHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  'createWidget' | 'cloneWidget' | 'saveWidget' | 'deleteWidget'
> {
  const { wsPath } = ctx;
  return {
    createWidget: async ({ kind, title }) => {
      try {
        const widget = await createWidget(wsPath, kind, title);
        return { success: true, widget };
      } catch (error) {
        console.error('[widgets] createWidget failed', error);
        return { success: false };
      }
    },

    cloneWidget: async ({ widgetId }) => {
      try {
        const cloned = await trackedClone(wsPath, 'widget', () =>
          cloneWidget(wsPath, widgetId)
        );
        if (!cloned) {
          return { success: false };
        }
        return {
          success: true,
          widget: cloned.record,
          cloneToken: cloned.token,
        };
      } catch (error) {
        console.error('[widgets] cloneWidget failed', error);
        return { success: false };
      }
    },

    saveWidget: async ({ widget }) => {
      try {
        await saveWidget(wsPath, widget);
        return { success: true };
      } catch (error) {
        console.error('[widgets] saveWidget failed', error);
        return { success: false };
      }
    },

    deleteWidget: async ({ widgetId }) => {
      try {
        await deleteWidget(wsPath, widgetId);
        return { success: true };
      } catch (error) {
        console.error('[widgets] deleteWidget failed', error);
        return { success: false };
      }
    },
  };
}
