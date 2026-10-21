import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

import { atomicWrite } from './atomicWrite';
import { notifyContentChanged } from './plugins/contentEvents';
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
  if (kind === 'checklist') {
    if (!Array.isArray(data.items)) {
      return { id, error: 'corrupted' };
    }
  } else if (kind === 'pomodoro') {
    if (
      !(
        isFiniteNumber(data.focusMinutes) &&
        isFiniteNumber(data.shortBreakMinutes) &&
        isFiniteNumber(data.longBreakMinutes) &&
        isFiniteNumber(data.sessionsBeforeLongBreak) &&
        isFiniteNumber(data.completedSessions) &&
        isStringRecord(data.timer)
      ) ||
      typeof data.timer.state !== 'string'
    ) {
      return { id, error: 'corrupted' };
    }
  } else if (
    kind === 'reminder' &&
    (typeof data.dueAt !== 'string' ||
      typeof data.timezone !== 'string' ||
      typeof data.status !== 'string')
  ) {
    return { id, error: 'corrupted' };
  }

  return input as unknown as WidgetRecord;
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
  return `widget_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

/** Create a new widget file with default data for its kind and return the record. */
export async function createWidget(
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
export async function loadWidget(
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
export async function loadWidgets(
  wsPath: string,
  widgetIds: string[]
): Promise<Record<string, WidgetRecord | WidgetLoadError>> {
  const uniqueIds = [...new Set(widgetIds)];
  const results = await Promise.all(
    uniqueIds.map(async (id) => [id, await loadWidget(wsPath, id)] as const)
  );
  return Object.fromEntries(results);
}

/** Atomically write the widget JSON file. Throws when the record is invalid. */
export async function saveWidget(
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
  notifyContentChanged(wsPath, {
    kind: 'widget',
    ids: [validated.id],
    operation: 'upsert',
  });
}

/** Delete the widget file for a given id. Returns true if a file was removed. */
export async function deleteWidget(
  wsPath: string,
  widgetId: string
): Promise<boolean> {
  const relativePath = widgetRelativePath(widgetId);
  const fullPath = assertWorkspaceWidgetPath(wsPath, relativePath);
  if (!existsSync(fullPath)) {
    return false;
  }
  await unlink(fullPath);
  notifyContentChanged(wsPath, {
    kind: 'widget',
    ids: [widgetId],
    operation: 'delete',
  });
  return true;
}

/**
 * Clone an existing widget's content into a brand new widget file/id. Used by
 * duplicate/paste so cloned nodes never share the same underlying file.
 */
export async function cloneWidget(
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
  await saveWidget(wsPath, cloned);
  return cloned;
}

export function widgetDir(wsPath: string): string {
  return resolve(wsPath, '.ghostboard', 'widgets');
}
