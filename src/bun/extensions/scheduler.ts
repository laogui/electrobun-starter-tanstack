import { resolve } from 'node:path';

import type { ScheduledTask } from '../../shared/extensions/protocol';
import { atomicWrite } from '../atomicWrite';
import { withFileQueue } from '../persistence/fileQueue';

export const EXTENSION_TASKS_SCHEMA = 'ghostboard-extension-tasks/v1' as const;
const MAX_TASKS = 500;
const MAX_PAYLOAD_JSON = 8 * 1024;
const TASK_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

export interface PersistedScheduledTask extends ScheduledTask {
  canvasTypeId: string;
  instanceId: string;
  lastFiredAt?: string;
}

export interface ExtensionTaskFile {
  schema: typeof EXTENSION_TASKS_SCHEMA;
  tasks: PersistedScheduledTask[];
}

export interface FiredTask {
  lastDueAt: string;
  missedCount: number;
  task: PersistedScheduledTask;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function extensionTasksPath(wsPath: string): string {
  return resolve(wsPath, '.ghostboard', 'extension-tasks.json');
}

function parseTask(value: unknown): PersistedScheduledTask | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.id !== 'string' || !TASK_ID_RE.test(value.id)) {
    return null;
  }
  if (
    typeof value.fireAt !== 'string' ||
    !Number.isFinite(Date.parse(value.fireAt))
  ) {
    return null;
  }
  if (
    typeof value.instanceId !== 'string' ||
    typeof value.canvasTypeId !== 'string'
  ) {
    return null;
  }
  const repeat =
    value.repeat === 'daily' ||
    value.repeat === 'weekly' ||
    value.repeat === 'monthly'
      ? value.repeat
      : 'none';
  const task: PersistedScheduledTask = {
    id: value.id,
    fireAt: value.fireAt,
    instanceId: value.instanceId,
    canvasTypeId: value.canvasTypeId,
    repeat,
  };
  if (value.payload !== undefined) {
    task.payload = value.payload;
  }
  if (typeof value.lastFiredAt === 'string') {
    task.lastFiredAt = value.lastFiredAt;
  }
  return task;
}

export function parseExtensionTaskFile(input: unknown): ExtensionTaskFile {
  if (!(isRecord(input) && Array.isArray(input.tasks))) {
    return { schema: EXTENSION_TASKS_SCHEMA, tasks: [] };
  }
  const tasks = input.tasks
    .map(parseTask)
    .filter((task): task is PersistedScheduledTask => Boolean(task));
  return { schema: EXTENSION_TASKS_SCHEMA, tasks };
}

/**
 * Thrown when `extension-tasks.json` exists but cannot be read as a task file.
 * Callers must fail closed rather than treat it as "no tasks", which would
 * silently drop every reminder the user scheduled.
 */
export class ExtensionTaskFileError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExtensionTaskFileError';
  }
}

export async function loadExtensionTasks(
  wsPath: string
): Promise<ExtensionTaskFile> {
  const file = Bun.file(extensionTasksPath(wsPath));
  if (!(await file.exists())) {
    return { schema: EXTENSION_TASKS_SCHEMA, tasks: [] };
  }
  let contents: unknown;
  try {
    contents = await file.json();
  } catch (error) {
    throw new ExtensionTaskFileError('extension-tasks.json is not valid JSON', {
      cause: error,
    });
  }
  if (!(isRecord(contents) && Array.isArray(contents.tasks))) {
    throw new ExtensionTaskFileError(
      'extension-tasks.json does not match the task file schema'
    );
  }
  return parseExtensionTaskFile(contents);
}

export async function saveExtensionTasks(
  wsPath: string,
  file: ExtensionTaskFile
): Promise<void> {
  const normalized = parseExtensionTaskFile(file);
  await atomicWrite(
    extensionTasksPath(wsPath),
    JSON.stringify(normalized, null, 2)
  );
}

function advanceFireAt(
  fireAt: string,
  repeat: ScheduledTask['repeat']
): string {
  const date = new Date(fireAt);
  if (repeat === 'daily') {
    date.setUTCDate(date.getUTCDate() + 1);
  } else if (repeat === 'weekly') {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (repeat === 'monthly') {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return date.toISOString();
}

/**
 * At-least-once delivery: due tasks fire once even if the app was closed.
 * Missed repeats of the same task collapse into a single delivery.
 */
export function consumeDueTasks(
  file: ExtensionTaskFile,
  nowMs = Date.now()
): { file: ExtensionTaskFile; fired: FiredTask[] } {
  const fired: FiredTask[] = [];
  const nextTasks: PersistedScheduledTask[] = [];
  const nowIso = new Date(nowMs).toISOString();

  for (const task of file.tasks) {
    let fireAt = task.fireAt;
    let dueMs = Date.parse(fireAt);
    if (!Number.isFinite(dueMs) || dueMs > nowMs) {
      nextTasks.push(task);
      continue;
    }

    let missedCount = 1;
    let lastDueAt = fireAt;
    const repeat = task.repeat ?? 'none';
    if (repeat !== 'none') {
      while (dueMs <= nowMs) {
        lastDueAt = fireAt;
        fireAt = advanceFireAt(fireAt, repeat);
        const nextDue = Date.parse(fireAt);
        if (!Number.isFinite(nextDue) || nextDue <= dueMs) {
          break;
        }
        dueMs = nextDue;
        if (dueMs <= nowMs) {
          missedCount += 1;
        }
      }
    }

    fired.push({
      task: { ...task, lastFiredAt: nowIso },
      lastDueAt,
      missedCount,
    });

    if (repeat !== 'none') {
      nextTasks.push({
        ...task,
        fireAt,
        lastFiredAt: nowIso,
      });
    }
  }

  return {
    file: { schema: EXTENSION_TASKS_SCHEMA, tasks: nextTasks },
    fired,
  };
}

/**
 * Runs one read-modify-write cycle against the task file with the whole cycle
 * serialized per workspace. Every mutation goes through here so a concurrent
 * `tick` cannot write back a snapshot taken before a `schedule`.
 */
export function withExtensionTasks<T>(
  wsPath: string,
  mutator: (file: ExtensionTaskFile) => Promise<T> | T
): Promise<T> {
  return withFileQueue(extensionTasksPath(wsPath), async () =>
    mutator(await loadExtensionTasks(wsPath))
  );
}

/** Tasks are owned by an instance, so only `(instanceId, id)` is unique. */
function isSameTask(
  task: PersistedScheduledTask,
  instanceId: string,
  taskId: string
): boolean {
  return task.instanceId === instanceId && task.id === taskId;
}

export async function scheduleExtensionTask(
  wsPath: string,
  task: PersistedScheduledTask
): Promise<void> {
  const parsed = parseTask(task);
  if (!parsed) {
    throw new Error('Invalid scheduled task.');
  }
  if (
    parsed.payload !== undefined &&
    new TextEncoder().encode(JSON.stringify(parsed.payload)).length >
      MAX_PAYLOAD_JSON
  ) {
    throw new Error('Scheduled task payload is too large.');
  }
  await withExtensionTasks(wsPath, async (file) => {
    const tasks = file.tasks.filter(
      (entry) => !isSameTask(entry, parsed.instanceId, parsed.id)
    );
    if (tasks.length >= MAX_TASKS) {
      throw new Error('Too many scheduled tasks.');
    }
    tasks.push(parsed);
    await saveExtensionTasks(wsPath, { schema: EXTENSION_TASKS_SCHEMA, tasks });
  });
}

export function cancelExtensionTask(
  wsPath: string,
  instanceId: string,
  taskId: string
): Promise<boolean> {
  return withExtensionTasks(wsPath, async (file) => {
    const tasks = file.tasks.filter(
      (entry) => !isSameTask(entry, instanceId, taskId)
    );
    if (tasks.length === file.tasks.length) {
      return false;
    }
    await saveExtensionTasks(wsPath, { schema: EXTENSION_TASKS_SCHEMA, tasks });
    return true;
  });
}

/** One read, one filter, one write — used when instances are deleted en masse. */
export function cancelExtensionTasksByInstance(
  wsPath: string,
  instanceIds: readonly string[]
): Promise<number> {
  const owners = new Set(instanceIds);
  if (owners.size === 0) {
    return Promise.resolve(0);
  }
  return withExtensionTasks(wsPath, async (file) => {
    const tasks = file.tasks.filter((task) => !owners.has(task.instanceId));
    const removed = file.tasks.length - tasks.length;
    if (removed === 0) {
      return 0;
    }
    await saveExtensionTasks(wsPath, { schema: EXTENSION_TASKS_SCHEMA, tasks });
    return removed;
  });
}

export function listExtensionTasks(
  wsPath: string,
  instanceId?: string
): Promise<PersistedScheduledTask[]> {
  return withExtensionTasks(wsPath, (file) =>
    instanceId
      ? file.tasks.filter((task) => task.instanceId === instanceId)
      : file.tasks
  );
}

export function tickExtensionTasks(
  wsPath: string,
  nowMs = Date.now()
): Promise<FiredTask[]> {
  return withExtensionTasks(wsPath, async (file) => {
    const consumed = consumeDueTasks(file, nowMs);
    if (consumed.fired.length === 0) {
      return [];
    }
    await saveExtensionTasks(wsPath, consumed.file);
    return consumed.fired;
  });
}

/** Milliseconds until the earliest pending task, or null when idle. */
export function nextExtensionTaskDelay(
  file: ExtensionTaskFile,
  nowMs = Date.now()
): number | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const task of file.tasks) {
    const fireAt = Date.parse(task.fireAt);
    if (Number.isFinite(fireAt) && fireAt < earliest) {
      earliest = fireAt;
    }
  }
  if (!Number.isFinite(earliest)) {
    return null;
  }
  return Math.max(0, earliest - nowMs);
}
