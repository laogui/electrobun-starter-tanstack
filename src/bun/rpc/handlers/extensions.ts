import { getAppInfoData } from '../../appLifecycle';
import {
  loadExtensionEnablement,
  setCanvasTypeEnabled,
} from '../../extensions/enablement';
import {
  cloneExtensionInstance,
  countInstancesByCanvasType,
  createExtensionInstance,
  deleteInstancesByCanvasType,
  loadExtensionInstances,
  updateExtensionInstance,
} from '../../extensions/instanceStore';
import {
  cancelExtensionTask,
  cancelExtensionTasksByInstance,
  ExtensionTaskFileError,
  listExtensionTasks,
  scheduleExtensionTask,
} from '../../extensions/scheduler';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createExtensionsHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'extensionEnablementList'
  | 'extensionEnablementSetEnabled'
  | 'extensionInstanceCreate'
  | 'extensionInstanceLoadMany'
  | 'extensionInstanceUpdate'
  | 'extensionInstanceClone'
  | 'extensionInstanceClearType'
  | 'extensionSchedulerSchedule'
  | 'extensionSchedulerCancel'
  | 'extensionSchedulerAck'
  | 'extensionSchedulerList'
> {
  const { wsPath, extensionScheduler } = ctx;
  return {
    extensionEnablementList: async () => {
      const enablement = await loadExtensionEnablement(wsPath);
      const instanceCounts = await countInstancesByCanvasType(wsPath);
      return {
        disabledCanvasTypes: enablement.disabledCanvasTypes,
        instanceCounts,
      };
    },

    extensionEnablementSetEnabled: async ({ canvasTypeId, enabled }) => {
      try {
        const enablement = await setCanvasTypeEnabled(
          wsPath,
          canvasTypeId,
          enabled
        );
        return { success: true, enablement };
      } catch (error) {
        console.error('[extensions] setEnabled failed', error);
        return { success: false };
      }
    },

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
        const record = await cloneExtensionInstance(wsPath, instanceId);
        if (!record) {
          return { success: false };
        }
        return { success: true, record };
      } catch (error) {
        console.error('[extensions] clone instance failed', error);
        return { success: false };
      }
    },

    extensionInstanceClearType: async ({ canvasTypeId }) => {
      try {
        const deleted = await deleteInstancesByCanvasType(wsPath, canvasTypeId);
        await cancelExtensionTasksByInstance(wsPath, deleted);
        return { success: true, deleted: deleted.length };
      } catch (error) {
        console.error('[extensions] clear type data failed', error);
        return { success: false, deleted: 0 };
      }
    },

    extensionSchedulerSchedule: async (task) => {
      try {
        await scheduleExtensionTask(wsPath, task);
        await extensionScheduler.notifyTasksChanged();
        return { success: true };
      } catch (error) {
        console.error('[extensions] schedule failed', error);
        return { success: false };
      }
    },

    extensionSchedulerCancel: async ({ instanceId, taskId }) => {
      try {
        await cancelExtensionTask(wsPath, instanceId, taskId);
        await extensionScheduler.notifyTasksChanged();
        return { success: true };
      } catch (error) {
        console.error('[extensions] cancel task failed', error);
        return { success: false };
      }
    },

    extensionSchedulerAck: async ({ deliveryId }) => {
      try {
        await extensionScheduler.ack(deliveryId);
        return { success: true };
      } catch (error) {
        console.error('[extensions] scheduler ack failed', error);
        return { success: false };
      }
    },

    extensionSchedulerList: async ({ instanceId }) => {
      try {
        return { tasks: await listExtensionTasks(wsPath, instanceId) };
      } catch (error) {
        if (error instanceof ExtensionTaskFileError) {
          // Listing degrades to empty, but scheduling still fails loudly
          // so nobody overwrites the preserved file.
          return { diagnostic: error.message, tasks: [] };
        }
        throw error;
      }
    },
  };
}
