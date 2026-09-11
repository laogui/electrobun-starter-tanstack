import type { ScheduledTask } from './protocol';

/** A task as stored by the host, which also records who owns it. */
export interface PersistedScheduledTask extends ScheduledTask {
  canvasTypeId: string;
  instanceId: string;
  lastFiredAt?: string;
}

export interface FiredTask {
  lastDueAt: string;
  missedCount: number;
  task: PersistedScheduledTask;
}

/**
 * One host→renderer push of due tasks. The renderer must call back with
 * `deliveryId` once it has handled them; until then the host keeps the tasks
 * on disk and re-delivers them.
 */
export interface ExtensionTaskDelivery {
  deliveryId: string;
  tasks: FiredTask[];
}
