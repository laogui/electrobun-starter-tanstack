import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicWrite } from './atomicWrite';
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

function defaultDataForKind(kind: WidgetKind): WidgetData {
  switch (kind) {
    case 'checklist':
      return { items: [] } satisfies ChecklistWidgetData;
    case 'pomodoro':
      return {
        clockKind: 'pomodoro',
        mode: 'focus',
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        sessionsBeforeLongBreak: 4,
        completedSessions: 0,
        timer: { state: 'idle' },
        stopwatch: { state: 'idle' },
      } satisfies PomodoroWidgetData;
    case 'reminder':
      return {
        dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        status: 'scheduled',
      } satisfies ReminderWidgetData;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function defaultTitleForKind(kind: WidgetKind): string {
  switch (kind) {
    case 'checklist':
      return 'Checklist';
    case 'pomodoro':
      return 'Pomodoro';
    case 'reminder':
      return 'Reminder';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function generateWidgetId(): string {
  return `widget_${crypto.randomUUID().replaceAll('-', '')}`;
}

/** Create a new widget file with default data for its kind and return the record. */
async function createWidgetUnlocked(
  wsPath: string,
  kind: WidgetKind,
  title?: string,
  widgetId?: string
): Promise<WidgetRecord> {
  const id = widgetId ?? generateWidgetId();
  const now = new Date().toISOString();
  const record: WidgetRecord = {
    schema: WIDGET_SCHEMA,
    id,
    kind,
    title: title ?? defaultTitleForKind(kind),
    createdAt: now,
    updatedAt: now,
    data: defaultDataForKind(kind),
  };
  await saveWidget(wsPath, record);
  return record;
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

/** Batch-load widgets concurrently; a single corrupted/missing widget never fails the batch. */
async function loadWidgetsUnlocked(
  wsPath: string,
  widgetIds: string[]
): Promise<Record<string, WidgetRecord | WidgetLoadError>> {
  const uniqueIds = [...new Set(widgetIds)];
  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        return [id, await loadWidget(wsPath, id)] as const;
      } catch (error) {
        console.warn(`[widgets] Failed to load ${id}:`, error);
        return [id, { id, error: 'corrupted' as const }] as const;
      }
    })
  );
  return Object.fromEntries(results);
}

/** Atomically write the widget JSON file. Throws when the record is invalid. */
async function saveWidgetUnlocked(
  wsPath: string,
  widget: WidgetRecord
): Promise<void> {
  const validated = parseWidgetRecord(widget);
  if ('error' in validated) {
    throw new Error(
      `Refusing to save invalid widget record: ${validated.error}`
    );
  }
  const relativePath = widgetRelativePath(validated.id);
  const fullPath = assertWorkspaceWidgetPath(wsPath, relativePath);
  const serialized = JSON.stringify(validated, null, 2);
  await atomicWrite(fullPath, serialized);
}

/** Delete the widget file for a given id. Returns true if a file was removed. */
async function deleteWidgetUnlocked(
  wsPath: string,
  widgetId: string
): Promise<boolean> {
  const relativePath = widgetRelativePath(widgetId);
  const fullPath = assertWorkspaceWidgetPath(wsPath, relativePath);
  if (!existsSync(fullPath)) {
    return false;
  }
  await unlink(fullPath);
  return true;
}

/**
 * Clone an existing widget's content into a brand new widget file/id. Used by
 * duplicate/paste so cloned nodes never share the same underlying file.
 */
async function cloneWidgetUnlocked(
  wsPath: string,
  widgetId: string
): Promise<WidgetRecord | null> {
  const source = await loadWidget(wsPath, widgetId);
  if ('error' in source) {
    return null;
  }
  const now = new Date().toISOString();
  const cloned: WidgetRecord = {
    ...source,
    id: generateWidgetId(),
    createdAt: now,
    updatedAt: now,
  };
  if (
    existsSync(assertWorkspaceWidgetPath(wsPath, widgetRelativePath(cloned.id)))
  ) {
    throw new Error('Clone id already exists');
  }
  await saveWidget(wsPath, cloned);
  return cloned;
}

export function widgetDir(wsPath: string): string {
  return resolve(wsPath, '.ghostboard', 'widgets');
}

export const createWidget = (
  ...args: Parameters<typeof createWidgetUnlocked>
) => withNoteWorkspace(args[0], () => createWidgetUnlocked(...args));

export const loadWidget = (...args: Parameters<typeof loadWidgetUnlocked>) =>
  withNoteWorkspace(args[0], () => loadWidgetUnlocked(...args));

export const saveWidget = (...args: Parameters<typeof saveWidgetUnlocked>) =>
  withNoteWorkspace(args[0], () => saveWidgetUnlocked(...args));

export const deleteWidget = (
  ...args: Parameters<typeof deleteWidgetUnlocked>
) => withNoteWorkspace(args[0], () => deleteWidgetUnlocked(...args));

export const cloneWidget = (...args: Parameters<typeof cloneWidgetUnlocked>) =>
  withNoteWorkspace(args[0], () => cloneWidgetUnlocked(...args));

export const loadWidgets = (...args: Parameters<typeof loadWidgetsUnlocked>) =>
  withNoteWorkspace(args[0], () => loadWidgetsUnlocked(...args));
