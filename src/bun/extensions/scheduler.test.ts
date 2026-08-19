import { describe, expect, it } from 'vitest';

import {
  consumeDueTasks,
  EXTENSION_TASKS_SCHEMA,
  parseExtensionTaskFile,
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
