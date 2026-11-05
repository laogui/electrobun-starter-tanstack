/**
 * Legacy widget files (`.ghostboard/widgets/*.json`). Checklist / Pomodoro /
 * Reminder widgets are retired; this module only reads old files so the
 * canvas loader can migrate them (see extensions/migration.ts).
 */
import { withNoteWorkspace } from './noteTransactions';
import { resolveWorkspaceSubpath } from './workspacePaths';

/** Schema version for widget JSON files. */
export const WIDGET_SCHEMA = 'ghostboard-widget/v1';

const WIDGET_ID_RE = /^[A-Za-z0-9_-]+$/;

export type WidgetKind = 'checklist' | 'pomodoro' | 'reminder';

const WIDGET_KINDS: ReadonlySet<WidgetKind> = new Set<WidgetKind>([
  'checklist',
  'pomodoro',
  'reminder',
]);

function isWidgetKind(value: unknown): value is WidgetKind {
  return typeof value === 'string' && WIDGET_KINDS.has(value as WidgetKind);
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate the shape of a widget record. Used by both load and save so a
 * partially corrupt or adversarial payload can never round-trip as a
 * "successful" record that later crashes the renderer (e.g. `data.items.map`
 * on a non-array). Returns a {@link WidgetLoadError} when validation fails so
 * the caller can surface the broken-widget fallback UI.
 */
export function parseWidgetRecord(
  input: unknown
): WidgetRecord | WidgetLoadError {
  if (!isStringRecord(input)) {
    return { id: 'unknown', error: 'corrupted' };
  }
  if (input.schema !== WIDGET_SCHEMA) {
    return { id: 'unknown', error: 'corrupted' };
  }
  const id = input.id;
  if (typeof id !== 'string' || !isValidWidgetId(id)) {
    return { id: 'unknown', error: 'corrupted' };
  }
  if (!isWidgetKind(input.kind)) {
    return { id, error: 'corrupted' };
  }
  if (typeof input.title !== 'string') {
    return { id, error: 'corrupted' };
  }
  if (
    typeof input.createdAt !== 'string' ||
    typeof input.updatedAt !== 'string'
  ) {
    return { id, error: 'corrupted' };
  }
  const data = input.data;
  if (!isStringRecord(data)) {
    return { id, error: 'corrupted' };
  }

  const kind = input.kind;
  if (!isWidgetDataForKind(kind, data)) {
    return { id, error: 'corrupted' };
  }

  // Spread first so unknown forward-compatible keys survive and the original
  // key order is kept; the validated fields then overwrite in place.
  return {
    ...input,
    createdAt: input.createdAt,
    data,
    id,
    kind,
    schema: WIDGET_SCHEMA,
    title: input.title,
    updatedAt: input.updatedAt,
  };
}

function isChecklistWidgetData(
  data: Record<string, unknown>
): data is Record<string, unknown> & ChecklistWidgetData {
  return Array.isArray(data.items);
}

function isPomodoroWidgetData(
  data: Record<string, unknown>
): data is Record<string, unknown> & PomodoroWidgetData {
  return (
    isFiniteNumber(data.focusMinutes) &&
    isFiniteNumber(data.shortBreakMinutes) &&
    isFiniteNumber(data.longBreakMinutes) &&
    isFiniteNumber(data.sessionsBeforeLongBreak) &&
    isFiniteNumber(data.completedSessions) &&
    isStringRecord(data.timer) &&
    typeof data.timer.state === 'string'
  );
}

function isReminderWidgetData(
  data: Record<string, unknown>
): data is Record<string, unknown> & ReminderWidgetData {
  return (
    typeof data.dueAt === 'string' &&
    typeof data.timezone === 'string' &&
    typeof data.status === 'string'
  );
}

/**
 * Structural check of `data` for a widget `kind`. Mirrors what the renderer
 * dereferences unguarded; nested values are normalized by the widget UIs.
 */
function isWidgetDataForKind(
  kind: WidgetKind,
  data: Record<string, unknown>
): data is Record<string, unknown> & WidgetData {
  switch (kind) {
    case 'checklist':
      return isChecklistWidgetData(data);
    case 'pomodoro':
      return isPomodoroWidgetData(data);
    case 'reminder':
      return isReminderWidgetData(data);
    default:
      return false;
  }
}

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

export type StopwatchTimerState =
  | { state: 'idle' }
  | { elapsedMs: number; startedAt: string; state: 'running' }
  | { elapsedMs: number; state: 'paused' };

export interface PomodoroWidgetData {
  clockKind?: PomodoroClockKind;
  completedSessions: number;
  focusMinutes: number;
  longBreakMinutes: number;
  mode: 'focus' | 'shortBreak' | 'longBreak';
  sessionsBeforeLongBreak: number;
  shortBreakMinutes: number;
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

/** True when `widgetId` is safe to use as a file name (no traversal). */
export function isValidWidgetId(widgetId: string): boolean {
  return WIDGET_ID_RE.test(widgetId);
}

/** Resolve the workspace-relative path for a widget's JSON file. */
export function widgetRelativePath(widgetId: string): string {
  if (!WIDGET_ID_RE.test(widgetId)) {
    throw new Error('Invalid widgetId for widget path.');
  }
  return `.ghostboard/widgets/${widgetId}.json`;
}

function assertWorkspaceWidgetPath(
  wsPath: string,
  relativePath: string
): string {
  return resolveWorkspaceSubpath(wsPath, relativePath, {
    dir: '.ghostboard/widgets',
    extension: '.json',
    label: 'Widget',
  }).fullPath;
}

/**
 * Load a single widget by id. Never throws: missing file or corrupted JSON
 * are reported as a {@link WidgetLoadError} instead.
 */
async function loadWidgetUnlocked(
  wsPath: string,
  widgetId: string
): Promise<WidgetRecord | WidgetLoadError> {
  if (!isValidWidgetId(widgetId)) {
    return { id: widgetId, error: 'corrupted' };
  }
  const relativePath = widgetRelativePath(widgetId);
  const fullPath = assertWorkspaceWidgetPath(wsPath, relativePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return { id: widgetId, error: 'missing' };
  }
  try {
    const parsed = await file.json();
    const result = parseWidgetRecord(parsed);
    if ('error' in result) {
      return { id: widgetId, error: 'corrupted' };
    }
    return result;
  } catch {
    return { id: widgetId, error: 'corrupted' };
  }
}

export const loadWidget = (...args: Parameters<typeof loadWidgetUnlocked>) =>
  withNoteWorkspace(args[0], () => loadWidgetUnlocked(...args));
