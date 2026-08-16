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

  it('hydrate prunes records not in the referenced set', () => {
    // Pre-load two widgets from a previous view.
    useWidgetStore.getState().hydrate({
      widget_a: checklistRecord({ id: 'widget_a' }),
      widget_b: checklistRecord({ id: 'widget_b' }),
    });
    expect(useWidgetStore.getState().records.widget_a).toBeDefined();
    expect(useWidgetStore.getState().records.widget_b).toBeDefined();

    // Switch to a view that only references widget_a; widget_b should be
    // pruned from memory.
    useWidgetStore
      .getState()
      .hydrate(
        { widget_a: checklistRecord({ id: 'widget_a' }) },
        new Set(['widget_a'])
      );
    expect(useWidgetStore.getState().records.widget_a).toBeDefined();
    expect(useWidgetStore.getState().records.widget_b).toBeUndefined();
  });

  it('hydrate without a referenced set keeps existing records (backward compatible)', () => {
    useWidgetStore.getState().hydrate({
      widget_a: checklistRecord({ id: 'widget_a' }),
    });
    useWidgetStore.getState().hydrate({
      widget_b: checklistRecord({ id: 'widget_b' }),
    });
    // No pruning when referencedWidgetIds is omitted.
    expect(useWidgetStore.getState().records.widget_a).toBeDefined();
    expect(useWidgetStore.getState().records.widget_b).toBeDefined();
  });

  it('hydrate with an empty widgets bag prunes unreferenced records', () => {
    useWidgetStore.getState().hydrate({
      widget_a: checklistRecord({ id: 'widget_a' }),
      widget_b: checklistRecord({ id: 'widget_b' }),
    });

    // Switch to a canvas that references no widgets (widgets bag absent → {}).
    useWidgetStore.getState().hydrate({}, new Set());

    expect(useWidgetStore.getState().records.widget_a).toBeUndefined();
    expect(useWidgetStore.getState().records.widget_b).toBeUndefined();
  });

  it('hydrate keeps records with a pending debounced save across view switch', async () => {
    useWidgetStore.getState().hydrate({
      widget_edit: checklistRecord({ id: 'widget_edit', title: 'Original' }),
    });

    useWidgetStore.getState().updateWidget('widget_edit', (current) => ({
      ...current,
      title: 'Unsaved edit',
    }));
    expect(useWidgetStore.getState().records.widget_edit).toMatchObject({
      title: 'Unsaved edit',
    });
    expect(rpcSaveWidgetMock).not.toHaveBeenCalled();

    // View switch before debounce fires must not drop the edited record, or the
    // later save would no-op and silently lose the last edit.
    useWidgetStore.getState().hydrate({}, new Set());
    expect(useWidgetStore.getState().records.widget_edit).toMatchObject({
      title: 'Unsaved edit',
    });

    await vi.advanceTimersByTimeAsync(400);
    expect(rpcSaveWidgetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'widget_edit',
        title: 'Unsaved edit',
      })
    );
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

  it('does not complete a running stopwatch on hydrate', async () => {
    useWidgetStore.getState().hydrate({
      widget_pomodoro: pomodoroRecord(
        {},
        {
          clockKind: 'stopwatch',
          completedSessions: 1,
          timer: { state: 'idle' },
          stopwatch: {
            state: 'running',
            startedAt: '2026-07-08T10:00:00.000Z',
            elapsedMs: 0,
          },
        }
      ),
    });

    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: {
        clockKind: 'stopwatch',
        completedSessions: 1,
        timer: { state: 'idle' },
        stopwatch: { state: 'running' },
      },
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(rpcSaveWidgetMock).not.toHaveBeenCalled();
  });

  it('completePomodoroIfDue increments once and is idempotent', async () => {
    // Start with a running pomodoro that has already expired.
    useWidgetStore.setState({
      records: {
        widget_pomodoro: pomodoroRecord(
          {},
          {
            completedSessions: 1,
            timer: {
              state: 'running',
              startedAt: '2026-07-08T11:20:00.000Z',
              durationMs: 25 * 60 * 1000,
            },
          }
        ),
      },
      history: {},
    });

    const first = useWidgetStore
      .getState()
      .completePomodoroIfDue('widget_pomodoro');
    expect(first).toBe(true);
    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: { completedSessions: 2, timer: { state: 'idle' } },
    });

    // A second invocation (e.g. Strict Mode double effect) must be a no-op.
    const second = useWidgetStore
      .getState()
      .completePomodoroIfDue('widget_pomodoro');
    expect(second).toBe(false);
    expect(useWidgetStore.getState().records.widget_pomodoro).toMatchObject({
      data: { completedSessions: 2, timer: { state: 'idle' } },
    });

    await vi.advanceTimersByTimeAsync(400);
  });

  it('saveWidgetNow serializes concurrent saves for the same widget', async () => {
    // Use real timers for this test so promise resolution order is observable.
    vi.useRealTimers();
    useWidgetStore.setState({ records: {}, history: {} });

    const first = checklistRecord({ id: 'widget_race', title: 'First' });
    useWidgetStore.setState({ records: { widget_race: first } });

    // First save resolves slowly; second save is scheduled while the first is
    // still in flight. The chain must run them in submission order so a slower
    // earlier save can never overwrite the latest snapshot on disk.
    let resolveFirst: (value: { success: boolean }) => void = () => {};
    const firstPromise = new Promise<{ success: boolean }>((resolve) => {
      resolveFirst = resolve;
    });
    rpcSaveWidgetMock.mockReset();
    const saveOrder: string[] = [];
    rpcSaveWidgetMock.mockImplementationOnce(async (record: WidgetRecord) => {
      saveOrder.push(record.title);
      return firstPromise;
    });
    rpcSaveWidgetMock.mockImplementationOnce(async (record: WidgetRecord) => {
      saveOrder.push(record.title);
      return { success: true };
    });

    // Kick off the first save with the "First" snapshot.
    const firstSaveP = useWidgetStore.getState().saveWidgetNow('widget_race');

    // While the first save is still in flight, update the record to "Second"
    // and kick off a second save. Without serialization the faster second RPC
    // could finish before the first and then be overwritten by it on disk.
    const second = { ...first, title: 'Second' };
    useWidgetStore.setState({ records: { widget_race: second } });
    const secondSaveP = useWidgetStore.getState().saveWidgetNow('widget_race');

    // Let the first save's RPC start; the second must be queued behind it.
    await Promise.resolve();
    await Promise.resolve();
    expect(saveOrder).toEqual(['First']);
    expect(rpcSaveWidgetMock).toHaveBeenCalledTimes(1);

    resolveFirst({ success: true });
    await Promise.all([firstSaveP, secondSaveP]);

    // Both saves ran, in submission order: First then Second.
    expect(saveOrder).toEqual(['First', 'Second']);
    expect(rpcSaveWidgetMock).toHaveBeenCalledTimes(2);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'));
  });
});
