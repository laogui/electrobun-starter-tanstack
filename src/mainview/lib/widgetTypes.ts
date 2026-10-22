/**
 * Renderer-side mirror of the widget data model owned by `src/bun/widgets.ts`.
 * Kept as a separate declaration (rather than importing across the bun/
 * renderer boundary) so the renderer bundle never pulls in Bun-only modules.
 */

export const WIDGET_SCHEMA = 'ghostboard-widget/v1' as const;

export type WidgetKind = 'checklist' | 'pomodoro' | 'reminder';

export interface ChecklistWidgetItem {
  checked: boolean;
  completedAt?: string;
  createdAt?: string;
  id: string;
  isHeader?: boolean;
  text: string;
}

export interface ChecklistWidgetData {
  items: ChecklistWidgetItem[];
}

export type PomodoroClockKind = 'pomodoro' | 'stopwatch';

export type PomodoroTimerState =
  | { state: 'idle' }
  | { durationMs: number; startedAt: string; state: 'running' }
  | { remainingMs: number; state: 'paused' };

/** Independent count-up clock. `elapsedMs` on `running` is time already
 *  accumulated before the current segment started. */
export type StopwatchTimerState =
  | { state: 'idle' }
  | { elapsedMs: number; startedAt: string; state: 'running' }
  | { elapsedMs: number; state: 'paused' };

export interface PomodoroWidgetData {
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
  timer: PomodoroTimerState;
}

export interface ReminderWidgetData {
  dueAt: string;
  note?: string;
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
  snoozedUntil?: string;
  status: 'scheduled' | 'snoozed' | 'done' | 'missed';
  timezone: string;
}

export type WidgetData =
  | ChecklistWidgetData
  | PomodoroWidgetData
  | ReminderWidgetData;

export interface WidgetRecord {
  createdAt: string;
  data: WidgetData;
  id: string;
  kind: WidgetKind;
  schema: typeof WIDGET_SCHEMA;
  title: string;
  updatedAt: string;
}

export interface WidgetLoadError {
  error: 'missing' | 'corrupted';
  id: string;
}

export function isWidgetLoadError(
  record: WidgetRecord | WidgetLoadError | undefined
): record is WidgetLoadError {
  return !!record && 'error' in record;
}

// ---------------------------------------------------------------------------
// Untrusted widget records (canvas export import)
// ---------------------------------------------------------------------------

const WIDGET_KIND_VALUES: readonly WidgetKind[] = [
  'checklist',
  'pomodoro',
  'reminder',
];
const WIDGET_ID_RE = /^[A-Za-z0-9_-]+$/;
const POMODORO_MODES: readonly PomodoroWidgetData['mode'][] = [
  'focus',
  'shortBreak',
  'longBreak',
];
const REMINDER_STATUSES: readonly ReminderWidgetData['status'][] = [
  'scheduled',
  'snoozed',
  'done',
  'missed',
];
const REMINDER_REPEATS: readonly NonNullable<ReminderWidgetData['repeat']>[] = [
  'none',
  'daily',
  'weekly',
  'monthly',
];

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumberValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pickLiteral<T extends string>(
  values: readonly T[],
  value: unknown
): T | undefined {
  return values.find((candidate) => candidate === value);
}

function parseChecklistItem(value: unknown): ChecklistWidgetItem | null {
  if (!(isRecordValue(value) && typeof value.id === 'string')) {
    return null;
  }
  return {
    id: value.id,
    text: typeof value.text === 'string' ? value.text : '',
    checked: value.checked === true,
    ...(value.isHeader === true ? { isHeader: true } : {}),
    ...(typeof value.createdAt === 'string'
      ? { createdAt: value.createdAt }
      : {}),
    ...(typeof value.completedAt === 'string'
      ? { completedAt: value.completedAt }
      : {}),
  };
}

function parseChecklistData(
  data: Record<string, unknown>
): ChecklistWidgetData | null {
  if (!Array.isArray(data.items)) {
    return null;
  }
  return {
    items: data.items
      .map(parseChecklistItem)
      .filter((item): item is ChecklistWidgetItem => item !== null),
  };
}

function parsePomodoroTimer(value: unknown): PomodoroTimerState | null {
  if (!isRecordValue(value)) {
    return null;
  }
  if (value.state === 'idle') {
    return { state: 'idle' };
  }
  if (
    value.state === 'running' &&
    isFiniteNumberValue(value.durationMs) &&
    typeof value.startedAt === 'string'
  ) {
    return {
      state: 'running',
      durationMs: value.durationMs,
      startedAt: value.startedAt,
    };
  }
  if (value.state === 'paused' && isFiniteNumberValue(value.remainingMs)) {
    return { state: 'paused', remainingMs: value.remainingMs };
  }
  return null;
}

function parseStopwatch(value: unknown): StopwatchTimerState | undefined {
  if (!isRecordValue(value)) {
    return;
  }
  if (value.state === 'idle') {
    return { state: 'idle' };
  }
  if (!isFiniteNumberValue(value.elapsedMs)) {
    return;
  }
  if (value.state === 'running' && typeof value.startedAt === 'string') {
    return {
      state: 'running',
      elapsedMs: value.elapsedMs,
      startedAt: value.startedAt,
    };
  }
  if (value.state === 'paused') {
    return { state: 'paused', elapsedMs: value.elapsedMs };
  }
  return;
}

function parsePomodoroData(
  data: Record<string, unknown>
): PomodoroWidgetData | null {
  const timer = parsePomodoroTimer(data.timer);
  if (
    !(
      timer &&
      isFiniteNumberValue(data.focusMinutes) &&
      isFiniteNumberValue(data.shortBreakMinutes) &&
      isFiniteNumberValue(data.longBreakMinutes) &&
      isFiniteNumberValue(data.sessionsBeforeLongBreak) &&
      isFiniteNumberValue(data.completedSessions)
    )
  ) {
    return null;
  }
  const clockKind =
    data.clockKind === 'pomodoro' || data.clockKind === 'stopwatch'
      ? data.clockKind
      : undefined;
  const stopwatch = parseStopwatch(data.stopwatch);
  return {
    completedSessions: data.completedSessions,
    focusMinutes: data.focusMinutes,
    longBreakMinutes: data.longBreakMinutes,
    mode: pickLiteral(POMODORO_MODES, data.mode) ?? 'focus',
    sessionsBeforeLongBreak: data.sessionsBeforeLongBreak,
    shortBreakMinutes: data.shortBreakMinutes,
    timer,
    ...(clockKind ? { clockKind } : {}),
    ...(stopwatch ? { stopwatch } : {}),
  };
}

function parseReminderData(
  data: Record<string, unknown>
): ReminderWidgetData | null {
  const status = pickLiteral(REMINDER_STATUSES, data.status);
  if (
    !(status && typeof data.dueAt === 'string') ||
    typeof data.timezone !== 'string'
  ) {
    return null;
  }
  const repeat = pickLiteral(REMINDER_REPEATS, data.repeat);
  return {
    dueAt: data.dueAt,
    status,
    timezone: data.timezone,
    ...(typeof data.note === 'string' ? { note: data.note } : {}),
    ...(repeat ? { repeat } : {}),
    ...(typeof data.snoozedUntil === 'string'
      ? { snoozedUntil: data.snoozedUntil }
      : {}),
  };
}

function parseWidgetData(
  kind: WidgetKind,
  data: Record<string, unknown>
): WidgetData | null {
  if (kind === 'checklist') {
    return parseChecklistData(data);
  }
  if (kind === 'pomodoro') {
    return parsePomodoroData(data);
  }
  return parseReminderData(data);
}

/**
 * Validate a widget record from an untrusted source (an imported canvas export
 * file). Mirrors the main-process `parseWidgetRecord` envelope checks and
 * rebuilds `data` from its validated fields, so a malformed payload can never
 * reach the widget renderers. Returns `null` for anything unusable.
 */
export function parseUntrustedWidgetRecord(
  input: unknown
): WidgetRecord | null {
  if (!isRecordValue(input) || input.schema !== WIDGET_SCHEMA) {
    return null;
  }
  const { createdAt, id, title, updatedAt } = input;
  const kind = pickLiteral(WIDGET_KIND_VALUES, input.kind);
  if (
    !(typeof id === 'string' && WIDGET_ID_RE.test(id) && kind) ||
    typeof title !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof updatedAt !== 'string' ||
    !isRecordValue(input.data)
  ) {
    return null;
  }
  const data = parseWidgetData(kind, input.data);
  if (!data) {
    return null;
  }
  return {
    createdAt,
    data,
    id,
    kind,
    schema: WIDGET_SCHEMA,
    title,
    updatedAt,
  };
}
