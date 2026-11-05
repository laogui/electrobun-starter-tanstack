import { getAppInfoData } from '../../appLifecycle';
import { trackedClone } from '../../cloneReceipts';
import {
  cloneExtensionInstance,
  createExtensionInstance,
  loadExtensionInstances,
  updateExtensionInstance,
} from '../../extensions/instanceStore';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createExtensionsHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'extensionInstanceCreate'
  | 'extensionInstanceLoadMany'
  | 'extensionInstanceUpdate'
  | 'extensionInstanceClone'
> {
  const { wsPath } = ctx;
  return {
    extensionInstanceCreate: async ({
      canvasTypeId,
      dataVersion,
      id,
      presentation,
      state,
    }) => {
      try {
        const appVersion = (await getAppInfoData()).version;
        const record = await createExtensionInstance(wsPath, {
          appVersion,
          canvasTypeId,
          dataVersion,
          ...(id ? { id } : {}),
          presentation,
          state,
        });
        return { success: true, record };
      } catch (error) {
        console.error('[extensions] create instance failed', error);
        return { success: false };
      }
    },

    extensionInstanceLoadMany: async ({ instanceIds }) => ({
      records: await loadExtensionInstances(wsPath, instanceIds),
    }),

    extensionInstanceUpdate: async ({
      dataVersion,
      expectedRevision,
      instanceId,
      presentation,
      state,
    }) => {
      try {
        const appVersion = (await getAppInfoData()).version;
        const updated = await updateExtensionInstance(wsPath, {
          appVersion,
          ...(dataVersion !== undefined ? { dataVersion } : {}),
          expectedRevision,
          instanceId,
          presentation,
          state,
        });
        if ('error' in updated) {
          return { success: false };
        }
        return { success: true, record: updated.record };
      } catch (error) {
        console.error('[extensions] update instance failed', error);
        return { success: false };
      }
    },

    extensionInstanceClone: async ({ instanceId }) => {
      try {
        const cloned = await trackedClone(wsPath, 'extension', () =>
          cloneExtensionInstance(wsPath, instanceId)
        );
        if (!cloned) {
          return { success: false };
        }
        return {
          success: true,
          record: cloned.record,
          cloneToken: cloned.token,
        };
      } catch (error) {
        console.error('[extensions] clone instance failed', error);
        return { success: false };
      }
    },
  };
}
