import type {
  ExtensionTaskDelivery,
  FiredTask,
  PersistedScheduledTask,
} from '../../shared/extensions/scheduling';
import {
  consumeDueTasks,
  EXTENSION_TASKS_SCHEMA,
  type ExtensionTaskFile,
  loadExtensionTasks,
  saveExtensionTasks,
  withExtensionTasks,
} from './scheduler';

/** `setTimeout` overflows past ~24.8 days, so long waits re-arm in chunks. */
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;
/** How long to wait before re-delivering tasks the renderer never acked. */
const ACK_RETRY_MS = 30_000;

export interface ExtensionSchedulerService {
  /** Settles delivered tasks on disk. Until this lands they stay pending. */
  ack(deliveryId: string): Promise<void>;
  dispose(): void;
  /** Re-arms after a schedule/cancel changed the earliest fire time. */
  notifyTasksChanged(): Promise<void>;
  tick(): Promise<void>;
}

interface PendingTask {
  /** The `fireAt` we delivered; a reschedule since then must not be settled. */
  firedFireAt: string;
  key: string;
  /** Replacement entry for repeating tasks, or null to drop the task. */
  next: PersistedScheduledTask | null;
  task: FiredTask;
}

function taskKey(task: { id: string; instanceId: string }): string {
  return `${task.instanceId}\u0000${task.id}`;
}

function earliestDelay(
  file: ExtensionTaskFile,
  nowMs: number,
  skip: ReadonlySet<string>
): number | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const task of file.tasks) {
    if (skip.has(taskKey(task))) {
      continue;
    }
    const fireAt = Date.parse(task.fireAt);
    if (Number.isFinite(fireAt) && fireAt < earliest) {
      earliest = fireAt;
    }
  }
  return Number.isFinite(earliest) ? Math.max(0, earliest - nowMs) : null;
}

/**
 * Drives `extension-tasks.json` from the host so due tasks reach the renderer
 * even when no surface is mounted.
 *
 * Delivery is at-least-once: a tick reads due tasks but leaves them on disk
 * until the renderer acks, and un-acked tasks ride along with every later
 * delivery. A renderer that dies mid-notification therefore sees the task
 * again instead of losing it.
 */
export function createExtensionSchedulerService(input: {
  deliver: (delivery: ExtensionTaskDelivery) => void;
  now?: () => number;
  wsPath: string;
}): ExtensionSchedulerService {
  const { deliver, wsPath } = input;
  const now = input.now ?? (() => Date.now());
  const pending = new Map<string, PendingTask>();
  const deliveries = new Map<string, string[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let chain: Promise<void> = Promise.resolve();
  let deliveryCounter = 0;

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function armIn(delayMs: number): void {
    clearTimer();
    if (disposed) {
      return;
    }
    timer = setTimeout(
      () => {
        timer = null;
        tick().catch((error) => {
          console.error('[extensions] scheduler tick failed', error);
        });
      },
      Math.min(Math.max(delayMs, 0), MAX_TIMER_MS)
    );
    (timer as { unref?: () => void }).unref?.();
  }

  async function reArm(): Promise<void> {
    if (disposed) {
      return;
    }
    let file: ExtensionTaskFile;
    try {
      file = await loadExtensionTasks(wsPath);
    } catch (error) {
      // Fail closed: an unreadable task file must not be rewritten by a tick.
      clearTimer();
      console.error(
        '[extensions] scheduler paused, task file unreadable',
        error
      );
      return;
    }
    const skip = new Set(pending.keys());
    const delay = earliestDelay(file, now(), skip);
    if (pending.size > 0) {
      armIn(Math.min(delay ?? ACK_RETRY_MS, ACK_RETRY_MS));
      return;
    }
    if (delay === null) {
      clearTimer();
      return;
    }
    armIn(delay);
  }

  function collectDue(nowMs: number): Promise<PendingTask[]> {
    return withExtensionTasks(wsPath, (file) => {
      const consumed = consumeDueTasks(file, nowMs);
      const nextByKey = new Map(
        consumed.file.tasks.map((task) => [taskKey(task), task])
      );
      const found: PendingTask[] = [];
      for (const fired of consumed.fired) {
        const key = taskKey(fired.task);
        if (pending.has(key)) {
          continue;
        }
        found.push({
          key,
          firedFireAt: fired.task.fireAt,
          next: nextByKey.get(key) ?? null,
          task: fired,
        });
      }
      return found;
    });
  }

  function enqueue(work: () => Promise<void>): Promise<void> {
    chain = chain.catch(() => undefined).then(work);
    return chain;
  }

  async function runTick(): Promise<void> {
    if (disposed) {
      return;
    }
    try {
      const due = await collectDue(now());
      for (const entry of due) {
        pending.set(entry.key, entry);
      }
      if (pending.size > 0) {
        const keys = [...pending.keys()];
        // Older deliveries for the same tasks are superseded by this one.
        for (const [id, ids] of deliveries) {
          const rest = ids.filter((key) => !pending.has(key));
          if (rest.length === 0) {
            deliveries.delete(id);
          } else {
            deliveries.set(id, rest);
          }
        }
        deliveryCounter += 1;
        const deliveryId = `delivery_${deliveryCounter}`;
        deliveries.set(deliveryId, keys);
        deliver({
          deliveryId,
          tasks: keys.map((key) => (pending.get(key) as PendingTask).task),
        });
      }
    } catch (error) {
      console.error('[extensions] scheduler tick failed', error);
    }
    await reArm();
  }

  async function runAck(deliveryId: string): Promise<void> {
    const keys = deliveries.get(deliveryId);
    if (!keys) {
      return;
    }
    deliveries.delete(deliveryId);
    const settled: PendingTask[] = [];
    for (const key of keys) {
      const entry = pending.get(key);
      if (entry) {
        settled.push(entry);
        pending.delete(key);
      }
    }
    if (settled.length > 0) {
      const byKey = new Map(settled.map((entry) => [entry.key, entry]));
      await withExtensionTasks(wsPath, async (file) => {
        let changed = false;
        const tasks: PersistedScheduledTask[] = [];
        for (const task of file.tasks) {
          const entry = byKey.get(taskKey(task));
          if (!entry || task.fireAt !== entry.firedFireAt) {
            tasks.push(task);
            continue;
          }
          changed = true;
          if (entry.next) {
            tasks.push(entry.next);
          }
        }
        if (changed) {
          await saveExtensionTasks(wsPath, {
            schema: EXTENSION_TASKS_SCHEMA,
            tasks,
          });
        }
      });
    }
    await reArm();
  }

  function tick(): Promise<void> {
    return enqueue(runTick);
  }

  return {
    tick,
    ack: (deliveryId) => enqueue(() => runAck(deliveryId)),
    notifyTasksChanged: () => enqueue(reArm),
    dispose: () => {
      disposed = true;
      clearTimer();
      pending.clear();
      deliveries.clear();
    },
  };
}
