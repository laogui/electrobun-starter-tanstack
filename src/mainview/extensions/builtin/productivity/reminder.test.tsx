// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderState } from '../../../../shared/extensions/productivity/state';
import type {
  GhostBoardHostAPI,
  ScheduledTask,
} from '../../../../shared/extensions/protocol';
import { reminderCanvasType } from './reminder';

const SNOOZE_BUTTON = /snooze/i;
const DONE_BUTTON = /done/i;

/**
 * Stands in for the host's task file: `schedule` replaces by id the same way
 * the persisted store does, so orphaned tasks show up as extra entries.
 */
function createHost() {
  const tasks = new Map<string, ScheduledTask>();
  const notifications: Array<{ body?: string; title: string }> = [];
  const states: ReminderState[] = [];
  const host = {
    instance: {
      getState: () => ({
        revision: 1,
        state: null,
        presentation: { title: '' },
      }),
      updateState: vi.fn(async (request: { state: unknown }) => {
        states.push(request.state as ReminderState);
        return {
          revision: 2,
          state: request.state,
          presentation: { title: '' },
        };
      }),
    },
    scheduler: {
      schedule: vi.fn(async (task: ScheduledTask) => {
        tasks.set(task.id, task);
      }),
      cancel: vi.fn(async (taskId: string) => {
        tasks.delete(taskId);
      }),
      list: vi.fn(async () => [...tasks.values()]),
    },
    notifications: {
      show: vi.fn(async (notification: { body?: string; title: string }) => {
        notifications.push(notification);
      }),
    },
  } as unknown as GhostBoardHostAPI;
  return { host, notifications, states, tasks };
}

function state(overrides: Partial<ReminderState> = {}): ReminderState {
  return {
    title: 'Take medicine',
    dueAt: '2026-06-01T09:00:00.000Z',
    timezone: 'UTC',
    status: 'scheduled',
    ...overrides,
  };
}

function renderSurface(
  host: GhostBoardHostAPI,
  reminderState: ReminderState
): void {
  const Surface = reminderCanvasType.CanvasSurface;
  render(
    <Surface
      context={{
        height: 380,
        locale: 'en',
        readOnly: false,
        selected: false,
        surface: 'canvas',
        theme: 'light',
        width: 320,
      }}
      host={host}
      presentation={{ title: 'Take medicine' }}
      state={reminderState}
    />
  );
}

describe('reminder canvas type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers exactly one task on mount', async () => {
    const { host, tasks } = createHost();
    renderSurface(host, state());

    await vi.waitFor(() => expect(tasks.size).toBe(1));
    expect(tasks.get('reminder')?.fireAt).toBe('2026-06-01T09:00:00.000Z');
  });

  it('keeps a single task after repeated snoozes', async () => {
    const { host, tasks } = createHost();
    let current = state();
    const user = userEvent.setup();

    for (let round = 0; round < 2; round += 1) {
      const { unmount } = render(
        <reminderCanvasType.CanvasSurface
          context={{
            height: 380,
            locale: 'en',
            readOnly: false,
            selected: false,
            surface: 'canvas',
            theme: 'light',
            width: 320,
          }}
          host={host}
          presentation={{ title: 'Take medicine' }}
          state={current}
        />
      );
      await user.click(screen.getByRole('button', { name: SNOOZE_BUTTON }));
      const updates = (host.instance.updateState as ReturnType<typeof vi.fn>)
        .mock.calls;
      current = updates.at(-1)?.[0].state as ReminderState;
      unmount();
    }

    expect(current.status).toBe('snoozed');
    expect(await host.scheduler.list()).toHaveLength(1);
    expect(tasks.get('reminder')?.fireAt).toBe(current.snoozedUntil);
  });

  it('cancels the task when the reminder is marked done', async () => {
    const { host, tasks } = createHost();
    renderSurface(host, state());
    await vi.waitFor(() => expect(tasks.size).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: DONE_BUTTON }));

    await vi.waitFor(() => expect(tasks.size).toBe(0));
  });

  it('marks a one-shot reminder missed and notifies when it fires', async () => {
    const { host, notifications, states } = createHost();

    await reminderCanvasType.onTaskFired?.(
      {
        task: { id: 'reminder', fireAt: '2026-06-01T09:00:00.000Z' },
        lastDueAt: '2026-06-01T09:00:00.000Z',
        missedCount: 1,
      },
      { host, state: state({ note: 'two pills' }) }
    );

    expect(states.at(-1)?.status).toBe('missed');
    expect(notifications).toEqual([
      { title: 'Take medicine', body: 'two pills' },
    ]);
  });

  it('only notifies for a repeating reminder', async () => {
    const { host, notifications, states } = createHost();

    await reminderCanvasType.onTaskFired?.(
      {
        task: {
          id: 'reminder',
          fireAt: '2026-06-01T09:00:00.000Z',
          repeat: 'daily',
        },
        lastDueAt: '2026-06-01T09:00:00.000Z',
        missedCount: 1,
      },
      { host, state: state({ repeat: 'daily' }) }
    );

    expect(states).toEqual([]);
    expect(notifications).toHaveLength(1);
  });
});
