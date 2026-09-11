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

import {
  cancelExtensionTask,
  cancelExtensionTasksByInstance,
  consumeDueTasks,
  EXTENSION_TASKS_SCHEMA,
  ExtensionTaskFileError,
  listExtensionTasks,
  type PersistedScheduledTask,
  parseExtensionTaskFile,
  scheduleExtensionTask,
  tickExtensionTasks,
} from './scheduler';

describe('extension scheduler', () => {
  it('fires a one-shot due task and drops it', () => {
    const { file, fired } = consumeDueTasks(
      {
        schema: EXTENSION_TASKS_SCHEMA,
        tasks: [
          {
            id: 'task-1',
            instanceId: 'extinst_abc',
            canvasTypeId: 'ghostboard.productivity/reminder',
            fireAt: '2020-01-01T00:00:00.000Z',
            repeat: 'none',
          },
        ],
      },
      Date.parse('2026-01-01T00:00:00.000Z')
    );
    expect(fired).toHaveLength(1);
    expect(fired[0]?.missedCount).toBe(1);
    expect(file.tasks).toEqual([]);
  });

  it('merges missed daily repeats into one delivery', () => {
    const { file, fired } = consumeDueTasks(
      {
        schema: EXTENSION_TASKS_SCHEMA,
        tasks: [
          {
            id: 'daily',
            instanceId: 'extinst_abc',
            canvasTypeId: 'ghostboard.productivity/reminder',
            fireAt: '2026-01-01T00:00:00.000Z',
            repeat: 'daily',
          },
        ],
      },
      Date.parse('2026-01-04T00:00:00.000Z')
    );
    expect(fired).toHaveLength(1);
    expect(fired[0]?.missedCount).toBeGreaterThan(1);
    expect(fired[0]?.lastDueAt).toBe('2026-01-04T00:00:00.000Z');
    expect(file.tasks[0]?.fireAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('ignores future tasks', () => {
    const { fired } = consumeDueTasks(
      {
        schema: EXTENSION_TASKS_SCHEMA,
        tasks: [
          {
            id: 'later',
            instanceId: 'extinst_abc',
            canvasTypeId: 'ghostboard.productivity/pomodoro',
            fireAt: '2099-01-01T00:00:00.000Z',
          },
        ],
      },
      Date.parse('2026-01-01T00:00:00.000Z')
    );
    expect(fired).toEqual([]);
  });

  it('drops malformed file contents', () => {
    expect(parseExtensionTaskFile({ tasks: [{ id: 'bad' }] })).toEqual({
      schema: EXTENSION_TASKS_SCHEMA,
      tasks: [],
    });
  });
});

describe('extension task store', () => {
  let wsPath: string;

  beforeEach(async () => {
    wsPath = await mkdtemp(join(tmpdir(), 'gb-scheduler-'));
    await mkdir(join(wsPath, '.ghostboard'), { recursive: true });
  });

  afterEach(async () => {
    await rm(wsPath, { force: true, recursive: true });
  });

  function task(
    instanceId: string,
    id: string,
    fireAt = '2099-01-01T00:00:00.000Z'
  ): PersistedScheduledTask {
    return {
      id,
      instanceId,
      canvasTypeId: 'ghostboard.productivity/reminder',
      fireAt,
      repeat: 'none',
    };
  }

  it('keeps same-id tasks owned by different instances apart', async () => {
    await scheduleExtensionTask(wsPath, task('inst_a', 'reminder'));
    await scheduleExtensionTask(wsPath, task('inst_b', 'reminder'));

    expect(await listExtensionTasks(wsPath)).toHaveLength(2);

    expect(await cancelExtensionTask(wsPath, 'inst_a', 'reminder')).toBe(true);
    const remaining = await listExtensionTasks(wsPath);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.instanceId).toBe('inst_b');
  });

  it('replaces a task rather than orphaning it when the fire time moves', async () => {
    await scheduleExtensionTask(
      wsPath,
      task('inst_a', 'reminder', '2099-01-01T00:00:00.000Z')
    );
    await scheduleExtensionTask(
      wsPath,
      task('inst_a', 'reminder', '2099-02-01T00:00:00.000Z')
    );

    const tasks = await listExtensionTasks(wsPath, 'inst_a');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.fireAt).toBe('2099-02-01T00:00:00.000Z');
  });

  it('cancels every task owned by the listed instances in one write', async () => {
    await scheduleExtensionTask(wsPath, task('inst_a', 'one'));
    await scheduleExtensionTask(wsPath, task('inst_a', 'two'));
    await scheduleExtensionTask(wsPath, task('inst_b', 'one'));

    expect(
      await cancelExtensionTasksByInstance(wsPath, ['inst_a', 'inst_missing'])
    ).toBe(2);
    const remaining = await listExtensionTasks(wsPath);
    expect(remaining.map((entry) => entry.instanceId)).toEqual(['inst_b']);
  });

  it('serializes concurrent mutations without losing writes', async () => {
    const scheduled = Array.from({ length: 100 }, (_, index) =>
      scheduleExtensionTask(wsPath, task(`inst_${index % 10}`, `t_${index}`))
    );
    await Promise.all(scheduled);
    expect(await listExtensionTasks(wsPath)).toHaveLength(100);

    await Promise.all([
      ...Array.from({ length: 50 }, (_, index) =>
        cancelExtensionTask(wsPath, `inst_${index % 10}`, `t_${index}`)
      ),
      tickExtensionTasks(wsPath),
      scheduleExtensionTask(wsPath, task('inst_late', 'late')),
    ]);

    const remaining = await listExtensionTasks(wsPath);
    expect(remaining).toHaveLength(51);
    expect(remaining.some((entry) => entry.instanceId === 'inst_late')).toBe(
      true
    );
  });

  it('does not let a tick overwrite a task scheduled while it ran', async () => {
    await scheduleExtensionTask(
      wsPath,
      task('inst_a', 'due', '2020-01-01T00:00:00.000Z')
    );
    const [fired] = await Promise.all([
      tickExtensionTasks(wsPath),
      scheduleExtensionTask(wsPath, task('inst_b', 'future')),
    ]);
    expect(fired).toHaveLength(1);

    const remaining = await listExtensionTasks(wsPath);
    expect(remaining.map((entry) => entry.id)).toEqual(['future']);
  });

  it('fails closed when the task file is corrupt', async () => {
    await writeFile(
      join(wsPath, '.ghostboard', 'extension-tasks.json'),
      '{"tasks": ['
    );
    await expect(listExtensionTasks(wsPath)).rejects.toBeInstanceOf(
      ExtensionTaskFileError
    );
    await expect(
      scheduleExtensionTask(wsPath, task('inst_a', 'reminder'))
    ).rejects.toBeInstanceOf(ExtensionTaskFileError);
  });

  it('treats a missing file as no tasks', async () => {
    expect(await listExtensionTasks(wsPath)).toEqual([]);
  });
});
