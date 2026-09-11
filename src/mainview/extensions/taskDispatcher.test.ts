import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExtensionInstanceRecord } from '../../shared/extensions/instance';
import type { ExtensionTaskDelivery } from '../../shared/extensions/scheduling';
import { canvasTypeRegistry } from './registry';
import type { BuiltinCanvasType } from './types';

const ackExtensionTasks = vi.fn(async (_deliveryId: string) => ({
  success: true,
}));
const loadExtensionInstances = vi.fn(
  async (
    _ids: string[]
  ): Promise<Record<string, ExtensionInstanceRecord>> => ({})
);

vi.mock('@/lib/rpc', () => ({
  rpcAckExtensionTasks: (deliveryId: string) => ackExtensionTasks(deliveryId),
  rpcLoadExtensionInstances: (ids: string[]) => loadExtensionInstances(ids),
  rpcCancelExtensionTask: vi.fn(async () => ({ success: true })),
  rpcListExtensionTasks: vi.fn(async () => ({ tasks: [] })),
  rpcScheduleExtensionTask: vi.fn(async () => ({ success: true })),
  rpcLoadAttachment: vi.fn(async () => null),
  rpcOpenAttachment: vi.fn(async () => null),
  rpcOpenExternalUrl: vi.fn(async () => ({ success: true })),
  rpcRevealAttachment: vi.fn(async () => ({ success: true })),
  rpcUnfurlLink: vi.fn(async () => null),
  rpcCloneExtensionInstance: vi.fn(async () => ({ success: false })),
  rpcCreateExtensionInstance: vi.fn(async () => ({ success: false })),
  rpcUpdateExtensionInstance: vi.fn(async () => ({ success: false })),
}));

import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { dispatchExtensionTaskDelivery } from './taskDispatcher';

const CANVAS_TYPE_ID = 'ghostboard.test/tasks';

function record(id: string, state: unknown): ExtensionInstanceRecord {
  return {
    schema: 'ghostboard-extension-instance/v1',
    id,
    canvasTypeId: CANVAS_TYPE_ID,
    dataVersion: 1,
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    presentation: { title: 'Task' },
    state,
  } as ExtensionInstanceRecord;
}

function delivery(instanceId: string): ExtensionTaskDelivery {
  return {
    deliveryId: 'delivery_1',
    tasks: [
      {
        lastDueAt: '2026-01-01T00:00:00.000Z',
        missedCount: 1,
        task: {
          id: 'reminder',
          instanceId,
          canvasTypeId: CANVAS_TYPE_ID,
          fireAt: '2026-01-01T00:00:00.000Z',
          repeat: 'none',
        },
      },
    ],
  };
}

const onTaskFired = vi.fn();

const testCanvasType = {
  id: CANVAS_TYPE_ID,
  titleKey: 'canvas_type_test',
  icon: () => null,
  category: 'demo',
  dataVersion: 1,
  surface: {
    defaultSize: { width: 100, height: 100 },
    resizable: false,
    openBehavior: 'none',
    canEnterGroup: false,
    canEnterFolder: false,
  },
  createInitialState: () => ({ value: 0 }),
  validateState: (value: unknown): value is { value: number } =>
    typeof (value as { value?: unknown })?.value === 'number',
  migrateState: () => ({ value: 0 }),
  buildPresentation: () => ({ title: 'Task' }),
  CanvasSurface: () => null,
  PreviewSurface: () => null,
  onTaskFired,
} as unknown as BuiltinCanvasType<{ value: number }>;

describe('extension task dispatcher', () => {
  beforeEach(() => {
    onTaskFired.mockReset();
    ackExtensionTasks.mockClear();
    loadExtensionInstances.mockReset();
    loadExtensionInstances.mockResolvedValue({});
    useExtensionInstanceStore.setState({ records: {}, history: {} });
    try {
      canvasTypeRegistry.register(testCanvasType);
    } catch {
      // Registered by an earlier test in this file.
    }
  });

  it('handles a fired task when the record is already loaded', async () => {
    useExtensionInstanceStore.setState({
      records: { extinst_a: record('extinst_a', { value: 7 }) },
    });

    await dispatchExtensionTaskDelivery(delivery('extinst_a'));

    expect(onTaskFired).toHaveBeenCalledTimes(1);
    expect(onTaskFired.mock.calls[0]?.[1].state).toEqual({ value: 7 });
    expect(loadExtensionInstances).not.toHaveBeenCalled();
    expect(ackExtensionTasks).toHaveBeenCalledWith('delivery_1');
  });

  it('loads the record on demand when no surface has mounted', async () => {
    loadExtensionInstances.mockResolvedValue({
      extinst_b: record('extinst_b', { value: 3 }),
    });

    await dispatchExtensionTaskDelivery(delivery('extinst_b'));

    expect(loadExtensionInstances).toHaveBeenCalledWith(['extinst_b']);
    expect(onTaskFired).toHaveBeenCalledTimes(1);
    expect(onTaskFired.mock.calls[0]?.[1].state).toEqual({ value: 3 });
    expect(ackExtensionTasks).toHaveBeenCalledWith('delivery_1');
  });

  it('drops the task and still acks when the instance is gone', async () => {
    await dispatchExtensionTaskDelivery(delivery('extinst_missing'));

    expect(onTaskFired).not.toHaveBeenCalled();
    expect(ackExtensionTasks).toHaveBeenCalledWith('delivery_1');
  });

  it('acks without throwing when the canvas type is not registered', async () => {
    const unknown = delivery('extinst_a');
    unknown.tasks[0]!.task.canvasTypeId = 'ghostboard.test/unregistered';

    await expect(
      dispatchExtensionTaskDelivery(unknown)
    ).resolves.toBeUndefined();
    expect(ackExtensionTasks).toHaveBeenCalledWith('delivery_1');
  });

  it('acks even when a handler throws', async () => {
    useExtensionInstanceStore.setState({
      records: { extinst_a: record('extinst_a', { value: 1 }) },
    });
    onTaskFired.mockRejectedValue(new Error('boom'));

    await dispatchExtensionTaskDelivery(delivery('extinst_a'));

    expect(ackExtensionTasks).toHaveBeenCalledWith('delivery_1');
  });
});
