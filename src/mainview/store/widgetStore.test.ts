import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rpcCloneWidget, rpcCreateWidget, rpcSaveWidget } from '@/lib/rpc';
import type {
  PomodoroWidgetData,
  ReminderWidgetData,
  WidgetRecord,
} from '@/lib/widgetTypes';
import { WIDGET_SCHEMA } from '@/lib/widgetTypes';
import { useWidgetStore } from '@/store/widgetStore';

vi.mock('@/lib/rpc', () => ({
  rpcCloneWidget: vi.fn(),
  rpcCreateWidget: vi.fn(),
  rpcSaveWidget: vi.fn(),
}));

const toastInfoMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    info: (...args: Parameters<typeof toastInfoMock>) => toastInfoMock(...args),
  },
}));

const rpcCloneWidgetMock = vi.mocked(rpcCloneWidget);
const rpcCreateWidgetMock = vi.mocked(rpcCreateWidget);
const rpcSaveWidgetMock = vi.mocked(rpcSaveWidget);

function checklistRecord(overrides: Partial<WidgetRecord> = {}): WidgetRecord {
  return {
    schema: WIDGET_SCHEMA,
    id: 'widget_1',
    kind: 'checklist',
    title: 'List',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    data: { items: [] },
    ...overrides,
  };
}

function pomodoroRecord(
  overrides: Partial<WidgetRecord> = {},
  dataOverrides: Partial<PomodoroWidgetData> = {}
): WidgetRecord {
  return {
    schema: WIDGET_SCHEMA,
    id: 'widget_pomodoro',
    kind: 'pomodoro',
    title: 'Focus timer',
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
    ...overrides,
  };
}

function reminderRecord(
  overrides: Partial<WidgetRecord> = {},
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
      dueAt: '2026-07-08T11:50:00.000Z',
      timezone: 'Asia/Singapore',
      status: 'scheduled',
      note: 'Send the invoice',
      repeat: 'none',
      ...dataOverrides,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'));
  rpcCloneWidgetMock.mockReset();
  rpcCreateWidgetMock.mockReset();
  rpcSaveWidgetMock.mockReset();
  toastInfoMock.mockReset();
  rpcSaveWidgetMock.mockResolvedValue({ success: true });
  useWidgetStore.setState({ records: {}, history: {} });
});

afterEach(async () => {
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  useWidgetStore.setState({ records: {}, history: {} });
});

describe('widgetStore', () => {
  it('hydrates widget records without creating history entries', () => {
    const record = checklistRecord();

    useWidgetStore.getState().hydrate({ widget_1: record });

    expect(useWidgetStore.getState().records.widget_1).toEqual(record);
    expect(useWidgetStore.getState().history.widget_1).toBeUndefined();
    expect(rpcSaveWidgetMock).not.toHaveBeenCalled();
  });

  it('creates and clones widgets through RPC and stores successful records', async () => {
    const created = checklistRecord({ id: 'widget_created' });
    const cloned = checklistRecord({
      id: 'widget_cloned',
      title: 'List clone',
    });
    rpcCreateWidgetMock.mockResolvedValueOnce({
      success: true,
      widget: created,
    });
    rpcCloneWidgetMock.mockResolvedValueOnce({ success: true, widget: cloned });

    await expect(
      useWidgetStore.getState().createWidget('checklist', 'List')
    ).resolves.toEqual(created);
    await expect(
      useWidgetStore.getState().cloneWidget('widget_created')
    ).resolves.toEqual(cloned);

    expect(rpcCreateWidgetMock).toHaveBeenCalledWith('checklist', 'List');
    expect(rpcCloneWidgetMock).toHaveBeenCalledWith('widget_created');
    expect(useWidgetStore.getState().records.widget_created).toEqual(created);
    expect(useWidgetStore.getState().records.widget_cloned).toEqual(cloned);
  });

  it('updates a widget, records undo history, and saves after debounce', async () => {
    const record = checklistRecord();
    useWidgetStore.getState().hydrate({ widget_1: record });

    useWidgetStore.getState().updateWidget('widget_1', (current) => ({
      ...current,
      title: 'Updated list',
    }));

    expect(useWidgetStore.getState().records.widget_1).toMatchObject({
      title: 'Updated list',
    });
    expect(useWidgetStore.getState().history.widget_1?.past).toEqual([record]);
    expect(rpcSaveWidgetMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(399);
    expect(rpcSaveWidgetMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(rpcSaveWidgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'widget_1', title: 'Updated list' })
    );
  });

  it('keeps undo and redo history per widget', () => {
    useWidgetStore.getState().hydrate({
      widget_1: checklistRecord(),
      widget_2: checklistRecord({ id: 'widget_2' }),
    });

    useWidgetStore.getState().updateWidget('widget_1', (current) => ({
      ...current,
      title: 'First update',
    }));
    useWidgetStore.getState().updateWidget('widget_1', (current) => ({
      ...current,
      title: 'Second update',
    }));
    useWidgetStore.getState().updateWidget('widget_2', (current) => ({
      ...current,
      title: 'Other update',
    }));

    useWidgetStore.getState().undoWidget('widget_1');
    expect(useWidgetStore.getState().records.widget_1).toMatchObject({
      title: 'First update',
    });
    expect(useWidgetStore.getState().records.widget_2).toMatchObject({
      title: 'Other update',
    });

    useWidgetStore.getState().redoWidget('widget_1');
    expect(useWidgetStore.getState().records.widget_1).toMatchObject({
      title: 'Second update',
    });
  });

  it('caps per-widget history depth at 50 entries', () => {
    useWidgetStore.getState().hydrate({ widget_1: checklistRecord() });

    for (let i = 1; i <= 51; i += 1) {
      useWidgetStore.getState().updateWidget('widget_1', (current) => ({
        ...current,
        title: `Update ${i}`,
      }));
    }

    const past = useWidgetStore.getState().history.widget_1?.past ?? [];
    expect(past).toHaveLength(50);
    expect(past[0]?.title).toBe('Update 1');
  });

  it('resets history for hydrated widget ids', () => {
    useWidgetStore.getState().hydrate({ widget_1: checklistRecord() });
    useWidgetStore.getState().updateWidget('widget_1', (current) => ({
      ...current,
      title: 'Dirty local title',
    }));
    expect(useWidgetStore.getState().history.widget_1).toBeDefined();

    useWidgetStore
      .getState()
      .hydrate({ widget_1: checklistRecord({ title: 'Reloaded title' }) });

    expect(useWidgetStore.getState().records.widget_1).toMatchObject({
      title: 'Reloaded title',
    });
    expect(useWidgetStore.getState().history.widget_1).toBeUndefined();
  });

  it('allows widget updates that save without adding undo history', async () => {
    useWidgetStore.getState().hydrate({ widget_pomodoro: pomodoroRecord() });

    useWidgetStore.getState().updateWidget(
      'widget_pomodoro',
      (current) => ({
        ...current,
        data: {
          ...(current.data as PomodoroWidgetData),
          timer: {
            state: 'running',
            startedAt: new Date().toISOString(),
            durationMs: 25 * 60 * 1000,
          },
        },
        updatedAt: new Date().toISOString(),
      }),
      { recordHistory: false }
    );

    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: {
        timer: {
          state: 'running',
          startedAt: '2026-07-08T12:00:00.000Z',
        },
      },
    });
    expect(useWidgetStore.getState().history.widget_pomodoro).toBeUndefined();

    await vi.advanceTimersByTimeAsync(400);
    expect(rpcSaveWidgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'widget_pomodoro' })
    );
  });

  it('completes overdue running pomodoro timers when hydrated', async () => {
    useWidgetStore.getState().hydrate({
      widget_pomodoro: pomodoroRecord(
        {},
        {
          completedSessions: 2,
          timer: {
            state: 'running',
            startedAt: '2026-07-08T11:20:00.000Z',
            durationMs: 25 * 60 * 1000,
          },
        }
      ),
    });

    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: {
        completedSessions: 3,
        timer: { state: 'idle' },
      },
      updatedAt: '2026-07-08T12:00:00.000Z',
    });
    expect(useWidgetStore.getState().history.widget_pomodoro).toBeUndefined();

    await vi.advanceTimersByTimeAsync(400);
    expect(rpcSaveWidgetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'widget_pomodoro',
        data: expect.objectContaining({
          completedSessions: 3,
          timer: { state: 'idle' },
        }),
      })
    );
  });

  it('marks due reminders missed and shows an in-app notification on hydrate', async () => {
    useWidgetStore.getState().hydrate({
      widget_reminder: reminderRecord(),
    });

    expect(useWidgetStore.getState().records.widget_reminder).toMatchObject({
      data: {
        status: 'missed',
      },
      updatedAt: '2026-07-08T12:00:00.000Z',
    });
    expect(toastInfoMock).toHaveBeenCalledWith('Reminder due: Follow up', {
      description: 'Send the invoice',
    });

    await vi.advanceTimersByTimeAsync(400);
    expect(rpcSaveWidgetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'widget_reminder',
        data: expect.objectContaining({ status: 'missed' }),
      })
    );
  });
});
