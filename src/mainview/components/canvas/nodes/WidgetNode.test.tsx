// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PomodoroWidgetData,
  ReminderWidgetData,
  WidgetRecord,
} from '@/lib/widgetTypes';
import { WIDGET_SCHEMA } from '@/lib/widgetTypes';
import { useWidgetStore } from '@/store/widgetStore';
import WidgetNode, { WidgetNodeReadOnly } from './WidgetNode';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
  NodeResizeControl: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
}));

vi.mock('@/lib/rpc', () => ({
  rpcCloneWidget: vi.fn(),
  rpcCreateWidget: vi.fn(),
  rpcSaveWidget: vi.fn().mockResolvedValue({ success: true }),
}));

function pomodoroRecord(
  dataOverrides: Partial<PomodoroWidgetData> = {}
): WidgetRecord {
  return {
    schema: WIDGET_SCHEMA,
    id: 'widget_pomodoro',
    kind: 'pomodoro',
    title: 'Deep Work',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    data: {
      mode: 'focus',
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      sessionsBeforeLongBreak: 4,
      completedSessions: 0,
      timer: { state: 'idle' },
      ...dataOverrides,
    },
  };
}

function reminderRecord(
  dataOverrides: Partial<ReminderWidgetData> = {}
): WidgetRecord {
  return {
    schema: WIDGET_SCHEMA,
    id: 'widget_reminder',
    kind: 'reminder',
    title: 'Follow up',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    data: {
      dueAt: '2026-07-08T12:15:00.000Z',
      timezone: 'Asia/Singapore',
      status: 'scheduled',
      note: 'Send the invoice',
      repeat: 'none',
      ...dataOverrides,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'));
  useWidgetStore.setState({ records: {}, history: {} });
});

afterEach(async () => {
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  useWidgetStore.setState({ records: {}, history: {} });
});

describe('WidgetNode', () => {
  it('runs pomodoro timer transitions without adding undo history', () => {
    useWidgetStore.getState().hydrate({
      widget_pomodoro: pomodoroRecord(),
    });

    render(
      <WidgetNode
        data={{ kind: 'pomodoro', widgetId: 'widget_pomodoro' }}
        id="node-pomodoro"
      />
    );

    expect(screen.getByText('25:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: {
        timer: {
          state: 'running',
          startedAt: '2026-07-08T12:00:00.000Z',
        },
      },
    });
    expect(useWidgetStore.getState().history.widget_pomodoro).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Pause timer' }));
    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: {
        timer: {
          state: 'paused',
          remainingMs: 25 * 60 * 1000,
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Resume timer' }));
    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: {
        timer: {
          state: 'running',
          startedAt: '2026-07-08T12:00:00.000Z',
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: {
        completedSessions: 0,
        timer: { state: 'idle' },
      },
    });
    expect(useWidgetStore.getState().history.widget_pomodoro).toBeUndefined();
  });

  it('adjusts pomodoro durations from the settings panel', () => {
    useWidgetStore.getState().hydrate({
      widget_pomodoro: pomodoroRecord(),
    });

    render(
      <WidgetNode
        data={{ kind: 'pomodoro', widgetId: 'widget_pomodoro' }}
        id="node-pomodoro"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Timer settings' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Increase Focus session' })
    );
    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: { focusMinutes: 26 },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Decrease Short break' })
    );
    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: { shortBreakMinutes: 4 },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.getByText('26:00')).toBeInTheDocument();
  });

  it('snoozes and completes reminders', () => {
    useWidgetStore.getState().hydrate({
      widget_reminder: reminderRecord(),
    });

    render(
      <WidgetNode
        data={{ kind: 'reminder', widgetId: 'widget_reminder' }}
        id="node-reminder"
      />
    );

    expect(screen.getByLabelText('Reminder note')).toHaveValue(
      'Send the invoice'
    );
    fireEvent.change(screen.getByLabelText('Reminder time'), {
      target: { value: '2026-07-08T13:45' },
    });
    expect(useWidgetStore.getState().records.widget_reminder).toMatchObject({
      data: {
        dueAt: new Date('2026-07-08T13:45').toISOString(),
        status: 'scheduled',
      },
    });
    expect(useWidgetStore.getState().history.widget_reminder).toBeDefined();

    fireEvent.change(screen.getByLabelText('Reminder note'), {
      target: { value: 'Call the customer' },
    });
    expect(useWidgetStore.getState().records.widget_reminder).toMatchObject({
      data: {
        note: 'Call the customer',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Snooze 10 minutes' }));
    expect(useWidgetStore.getState().records.widget_reminder).toMatchObject({
      data: {
        status: 'snoozed',
        snoozedUntil: '2026-07-08T12:10:00.000Z',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark reminder done' }));
    expect(useWidgetStore.getState().records.widget_reminder).toMatchObject({
      data: {
        status: 'done',
      },
    });
  });

  it('renders read-only widget content without mutation controls', () => {
    useWidgetStore.getState().hydrate({
      widget_reminder: reminderRecord({ status: 'done' }),
    });

    render(
      <WidgetNodeReadOnly
        data={{ kind: 'reminder', widgetId: 'widget_reminder' }}
      />
    );

    expect(screen.getByText('Follow up')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark reminder done' })
    ).not.toBeInTheDocument();
  });

  it('does not auto-complete an expired pomodoro in read-only mode', async () => {
    const { rpcSaveWidget } = await import('@/lib/rpc');
    const rpcSaveWidgetMock = vi.mocked(rpcSaveWidget);
    rpcSaveWidgetMock.mockClear();

    // Bypass hydrate's auto-complete so we can mount an already-expired running
    // timer in the store and assert the read-only surface leaves it alone.
    useWidgetStore.setState({
      history: {},
      records: {
        widget_pomodoro: pomodoroRecord({
          completedSessions: 0,
          timer: {
            state: 'running',
            startedAt: '2026-07-08T11:59:00.000Z',
            durationMs: 60_000,
          },
        }),
      },
    });

    render(
      <WidgetNodeReadOnly
        data={{ kind: 'pomodoro', widgetId: 'widget_pomodoro' }}
      />
    );

    // remainingMs is 0 at system time 12:00 with startedAt 11:59 + 60s.
    expect(screen.getByText('0:00')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(0);

    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: {
        completedSessions: 0,
        timer: { state: 'running' },
      },
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(rpcSaveWidgetMock).not.toHaveBeenCalled();
  });
});
