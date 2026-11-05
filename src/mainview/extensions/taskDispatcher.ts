import { rpcAckExtensionTasks, rpcLoadExtensionInstances } from '@/lib/rpc';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { isExtensionInstanceLoadError } from '../../shared/extensions/instance';
import type {
  ExtensionTaskDelivery,
  FiredTask,
} from '../../shared/extensions/scheduling';
import { createExtensionHostApi } from './hostApi';
import { canvasTypeRegistry } from './registry';
import type { AnyBuiltinCanvasType } from './types';

async function resolveState(
  canvasType: AnyBuiltinCanvasType,
  instanceId: string
): Promise<unknown | undefined> {
  const store = useExtensionInstanceStore.getState();
  let record = store.records[instanceId];
  if (!record) {
    // The surface never mounted, so nothing hydrated this instance yet.
    const loaded = await rpcLoadExtensionInstances([instanceId]);
    useExtensionInstanceStore.getState().hydrate(loaded);
    record = useExtensionInstanceStore.getState().records[instanceId];
  }
  if (!record || isExtensionInstanceLoadError(record)) {
    return;
  }
  return canvasType.validateState(record.state)
    ? record.state
    : canvasType.migrateState(record);
}

async function handleFired(fired: FiredTask): Promise<void> {
  const { canvasTypeId, instanceId } = fired.task;
  const canvasType = canvasTypeRegistry.get(canvasTypeId);
  if (!canvasType?.onTaskFired) {
    return;
  }
  const state = await resolveState(canvasType, instanceId);
  if (state === undefined) {
    console.warn(
      `[extensions] dropping task for missing instance ${instanceId}`
    );
    return;
  }
  await canvasType.onTaskFired(
    {
      task: {
        id: fired.task.id,
        fireAt: fired.task.fireAt,
        ...(fired.task.repeat ? { repeat: fired.task.repeat } : {}),
        ...(fired.task.payload !== undefined
          ? { payload: fired.task.payload }
          : {}),
      },
      lastDueAt: fired.lastDueAt,
      missedCount: fired.missedCount,
    },
    { host: createExtensionHostApi({ canvasTypeId, instanceId }), state }
  );
}

export async function dispatchExtensionTaskDelivery(
  delivery: ExtensionTaskDelivery
): Promise<void> {
  for (const fired of delivery.tasks) {
    try {
      await handleFired(fired);
    } catch (error) {
      console.error('[extensions] task handler failed', error);
    }
  }
  // Ack even when a handler threw or the type is gone: leaving the task
  // pending would re-deliver it forever.
  await rpcAckExtensionTasks(delivery.deliveryId);
}

/** Routes host task deliveries to canvas types, mounted or not. */
export function connectExtensionTaskDispatcher(
  target: Window = window
): () => void {
  const listener = (event: Event) => {
    const delivery = (event as CustomEvent).detail as ExtensionTaskDelivery;
    if (!delivery?.deliveryId) {
      return;
    }
    dispatchExtensionTaskDelivery(delivery).catch((error) => {
      console.error('[extensions] task delivery failed', error);
    });
  };
  target.addEventListener('extension-task-fired', listener);
  return () => {
    target.removeEventListener('extension-task-fired', listener);
  };
}
