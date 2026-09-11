import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

beforeAll(() => {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    })),
    write: vi.fn(async (filePath: string, data: string) => {
      mkdirSync(dirname(filePath), { recursive: true });
      await writeFile(filePath, data);
    }),
  });
});

import type { ExtensionTaskDelivery } from '../../shared/extensions/scheduling';
import {
  cancelExtensionTask,
  listExtensionTasks,
  type PersistedScheduledTask,
  scheduleExtensionTask,
} from './scheduler';
import { createExtensionSchedulerService } from './schedulerService';

const T0 = Date.parse('2026-06-01T12:00:00.000Z');
const realSetTimeout = globalThis.setTimeout;

function task(
  id: string,
  fireAtMs: number,
  repeat: PersistedScheduledTask['repeat'] = 'none'
): PersistedScheduledTask {
  return {
    id,
    instanceId: 'extinst_a',
    canvasTypeId: 'ghostboard.productivity/reminder',
    fireAt: new Date(fireAtMs).toISOString(),
    repeat,
  };
}

describe('extension scheduler service', () => {
  let wsPath: string;
  let nowMs: number;
  let delivered: ExtensionTaskDelivery[];

  beforeEach(async () => {
    vi.useFakeTimers();
    nowMs = T0;
    delivered = [];
    wsPath = await mkdtemp(join(tmpdir(), 'gb-sched-svc-'));
    await mkdir(join(wsPath, '.ghostboard'), { recursive: true });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(wsPath, { force: true, recursive: true });
  });

  function createService() {
    return createExtensionSchedulerService({
      wsPath,
      now: () => nowMs,
      deliver: (delivery) => delivered.push(delivery),
    });
  }

  /**
   * Advances both the fake clock and the service's injected clock, then lets
   * the real event loop run: a timer-driven tick reads the task file with real
   * fs promises, which fake timers do not drive.
   */
  async function advance(ms: number): Promise<void> {
    nowMs += ms;
    await vi.advanceTimersByTimeAsync(ms);
    for (let round = 0; round < 8; round += 1) {
      await new Promise((done) => realSetTimeout(done, 0));
      await vi.advanceTimersByTimeAsync(0);
    }
  }

  it('delivers a task once its fire time arrives', async () => {
    await scheduleExtensionTask(wsPath, task('reminder', T0 + 50));
    const service = createService();
    await service.tick();
    expect(delivered).toHaveLength(0);

    await advance(50);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.tasks[0]?.task.id).toBe('reminder');
    service.dispose();
  });

  it('keeps a delivered task on disk until the renderer acks', async () => {
    await scheduleExtensionTask(wsPath, task('reminder', T0 + 50));
    const service = createService();
    await service.tick();
    await advance(50);

    expect(await listExtensionTasks(wsPath)).toHaveLength(1);
    await service.ack(delivered[0]!.deliveryId);
    expect(await listExtensionTasks(wsPath)).toHaveLength(0);
    service.dispose();
  });

  it('re-delivers un-acked tasks on the next tick', async () => {
    await scheduleExtensionTask(wsPath, task('reminder', T0 + 50));
    const service = createService();
    await service.tick();
    await advance(50);
    expect(delivered).toHaveLength(1);

    await advance(30_000);
    expect(delivered).toHaveLength(2);
    expect(delivered[1]?.tasks[0]?.task.id).toBe('reminder');
    expect(delivered[1]?.deliveryId).not.toBe(delivered[0]?.deliveryId);

    await service.ack(delivered[1]!.deliveryId);
    await advance(30_000);
    expect(delivered).toHaveLength(2);
    service.dispose();
  });

  it('advances a repeating task and re-arms for the next cycle', async () => {
    await scheduleExtensionTask(wsPath, task('daily', T0 + 50, 'daily'));
    const service = createService();
    await service.tick();
    await advance(50);

    expect(delivered).toHaveLength(1);
    await service.ack(delivered[0]!.deliveryId);
    const [remaining] = await listExtensionTasks(wsPath);
    expect(remaining?.fireAt).toBe(
      new Date(T0 + 50 + 86_400_000).toISOString()
    );

    await advance(86_400_000);
    expect(delivered).toHaveLength(2);
    service.dispose();
  });

  it('delivers overdue tasks immediately on start with the missed count', async () => {
    await scheduleExtensionTask(
      wsPath,
      task('daily', T0 - 3 * 86_400_000, 'daily')
    );
    const service = createService();
    await service.tick();

    // T0-3d, T0-2d, T0-1d and T0 itself are all due, collapsed into one push.
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.tasks[0]?.missedCount).toBe(4);
    expect(delivered[0]?.tasks[0]?.lastDueAt).toBe(new Date(T0).toISOString());
    service.dispose();
  });

  it('does not deliver a task cancelled before it fired', async () => {
    await scheduleExtensionTask(wsPath, task('reminder', T0 + 50));
    const service = createService();
    await service.tick();
    await cancelExtensionTask(wsPath, 'extinst_a', 'reminder');
    await service.notifyTasksChanged();

    await advance(1000);
    expect(delivered).toEqual([]);
    service.dispose();
  });

  it('leaves a task rescheduled after delivery alone when the ack lands', async () => {
    await scheduleExtensionTask(wsPath, task('reminder', T0 + 50));
    const service = createService();
    await service.tick();
    await advance(50);
    expect(delivered).toHaveLength(1);

    await scheduleExtensionTask(wsPath, task('reminder', nowMs + 5000));
    await service.ack(delivered[0]!.deliveryId);

    const remaining = await listExtensionTasks(wsPath);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.fireAt).toBe(new Date(nowMs + 5000).toISOString());
    service.dispose();
  });

  it('stops firing after dispose', async () => {
    await scheduleExtensionTask(wsPath, task('reminder', T0 + 50));
    const service = createService();
    await service.tick();
    service.dispose();

    await advance(1000);
    expect(delivered).toEqual([]);
  });

  it('stays disarmed while the task file is unreadable', async () => {
    await writeFile(
      join(wsPath, '.ghostboard', 'extension-tasks.json'),
      '{"tasks": ['
    );
    const service = createService();
    await service.tick();

    await advance(60_000);
    expect(delivered).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(
      readFileSync(join(wsPath, '.ghostboard', 'extension-tasks.json'), 'utf8')
    ).toBe('{"tasks": [');
    service.dispose();
  });
});
