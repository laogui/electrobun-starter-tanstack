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

    fireEvent.click(screen.getByRole('button', { name: 'Complete timer' }));
    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: {
        completedSessions: 1,
        timer: { state: 'idle' },
      },
    });
    expect(useWidgetStore.getState().history.widget_pomodoro).toBeUndefined();
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
});
