import { type ExtensionPresentation, emptyPresentation } from '../presentation';

export interface ChecklistItem {
  checked: boolean;
  completedAt?: string;
  createdAt?: string;
  id: string;
  isHeader?: boolean;
  text: string;
}

export interface ChecklistState {
  items: ChecklistItem[];
  title: string;
}

export type PomodoroClockKind = 'pomodoro' | 'stopwatch';

export type StopwatchTimerState =
  | { state: 'idle' }
  | { elapsedMs: number; startedAt: string; state: 'running' }
  | { elapsedMs: number; state: 'paused' };

export interface PomodoroState {
  /** Which clock the card is showing. Missing on older records → pomodoro. */
  clockKind?: PomodoroClockKind;
  completedSessions: number;
  focusMinutes: number;
  longBreakMinutes: number;
  mode: 'focus' | 'shortBreak' | 'longBreak';
  sessionsBeforeLongBreak: number;
  shortBreakMinutes: number;
  /** Independent of `timer` so switching tabs does not drop a running clock. */
  stopwatch?: StopwatchTimerState;
  timer:
    | { state: 'idle' }
    | { durationMs: number; startedAt: string; state: 'running' }
    | { remainingMs: number; state: 'paused' };
  title: string;
}

export interface ReminderState {
  dueAt: string;
  note?: string;
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
  snoozedUntil?: string;
  status: 'scheduled' | 'snoozed' | 'done' | 'missed';
  timezone: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function createChecklistInitialState(): ChecklistState {
  return { title: 'Checklist', items: [] };
}

export function createPomodoroInitialState(): PomodoroState {
  return {
    title: 'Pomodoro',
    mode: 'focus',
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
    completedSessions: 0,
    timer: { state: 'idle' },
  };
}

export function createReminderInitialState(now = new Date()): ReminderState {
  return {
    title: 'Reminder',
    dueAt: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: 'scheduled',
  };
}

export function isChecklistState(value: unknown): value is ChecklistState {
  if (!(isRecord(value) && Array.isArray(value.items))) {
    return false;
  }
  return typeof value.title === 'string' || value.title === undefined;
}

export function isPomodoroState(value: unknown): value is PomodoroState {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.focusMinutes === 'number' &&
    typeof value.completedSessions === 'number' &&
    isRecord(value.timer) &&
    typeof value.timer.state === 'string'
  );
}

export function isReminderState(value: unknown): value is ReminderState {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.dueAt === 'string' && typeof value.status === 'string';
}

export function normalizeChecklistState(value: unknown): ChecklistState {
  if (!isChecklistState(value)) {
    return createChecklistInitialState();
  }
  return {
    title: typeof value.title === 'string' ? value.title : 'Checklist',
    items: value.items.map((item) => {
      const record: Record<string, unknown> = isRecord(item) ? item : {};
      return {
        id: typeof record.id === 'string' ? record.id : 'item_unknown',
        text: typeof record.text === 'string' ? record.text : '',
        checked: Boolean(record.checked),
        ...(record.isHeader ? { isHeader: true } : {}),
        ...(typeof record.createdAt === 'string'
          ? { createdAt: record.createdAt }
          : {}),
        ...(typeof record.completedAt === 'string'
          ? { completedAt: record.completedAt }
          : {}),
      };
    }),
  };
}

export function normalizePomodoroState(value: unknown): PomodoroState {
  const defaults = createPomodoroInitialState();
  if (!isPomodoroState(value)) {
    return defaults;
  }
  return {
    ...defaults,
    ...value,
    title: typeof value.title === 'string' ? value.title : defaults.title,
    timer: value.timer,
  };
}

export function normalizeReminderState(value: unknown): ReminderState {
  const defaults = createReminderInitialState();
  if (!isReminderState(value)) {
    return defaults;
  }
  return {
    ...defaults,
    ...value,
    title: typeof value.title === 'string' ? value.title : defaults.title,
  };
}

export function buildChecklistPresentation(
  state: ChecklistState
): ExtensionPresentation {
  const items = state.items ?? [];
  const open = items.filter((item) => !(item.checked || item.isHeader));
  const lines = items
    .map((item) =>
      item.isHeader
        ? item.text
        : `${item.checked ? '[x]' : '[ ]'} ${item.text}`.trim()
    )
    .filter(Boolean);
  return {
    ...emptyPresentation(state.title || 'Checklist'),
    subtitle: `${open.length} open`,
    plainText: lines.join('\n'),
    accessibilityLabel: `${state.title || 'Checklist'}, ${open.length} open`,
  };
}

export function buildPomodoroPresentation(
  state: PomodoroState
): ExtensionPresentation {
  return {
    ...emptyPresentation(state.title || 'Pomodoro'),
    subtitle: `${state.completedSessions} sessions`,
    plainText: `Pomodoro ${state.mode} ${state.completedSessions} sessions`,
    accessibilityLabel: `${state.title || 'Pomodoro'}, ${state.mode}`,
  };
}

export function buildReminderPresentation(
  state: ReminderState
): ExtensionPresentation {
  return {
    ...emptyPresentation(state.title || 'Reminder'),
    subtitle: state.status,
    plainText: [state.note ?? '', state.dueAt].filter(Boolean).join('\n'),
    accessibilityLabel: `${state.title || 'Reminder'} ${state.status}`,
  };
}

export function isExpiredRunningPomodoro(
  data: PomodoroState,
  nowMs = Date.now()
): boolean {
  if (data.timer.state !== 'running') {
    return false;
  }
  const startedAt = Date.parse(data.timer.startedAt);
  if (!Number.isFinite(startedAt)) {
    return false;
  }
  return nowMs >= startedAt + data.timer.durationMs;
}

export function completeExpiredPomodoro(data: PomodoroState): PomodoroState {
  return {
    ...data,
    completedSessions: data.completedSessions + 1,
    timer: { state: 'idle' },
  };
}

/** When the reminder should next notify: the snooze target wins over `dueAt`. */
export function reminderFireAt(data: ReminderState): string {
  return data.status === 'snoozed' && data.snoozedUntil
    ? data.snoozedUntil
    : data.dueAt;
}

export function reminderDueAtMs(data: ReminderState): number {
  const parsed = Date.parse(reminderFireAt(data));
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/** True when the reminder is in a state that should have a live host task. */
export function reminderWantsTask(data: ReminderState): boolean {
  return data.status === 'scheduled' || data.status === 'snoozed';
}

export function isDueReminder(
  data: ReminderState,
  nowMs = Date.now()
): boolean {
  if (data.status === 'done' || data.status === 'missed') {
    return false;
  }
  return reminderDueAtMs(data) <= nowMs;
}

export function markReminderMissed(data: ReminderState): ReminderState {
  return { ...data, status: 'missed' };
}
