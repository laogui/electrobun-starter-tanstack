import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve } from 'node:path';

import { atomicWrite } from './atomicWrite';

/** Schema version for widget JSON files. */
export const WIDGET_SCHEMA = 'ghostboard-widget/v1';

const WIDGET_ID_RE = /^[A-Za-z0-9_-]+$/;

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

export interface PomodoroWidgetData {
  completedSessions: number;
  focusMinutes: number;
  longBreakMinutes: number;
  mode: 'focus' | 'shortBreak' | 'longBreak';
  sessionsBeforeLongBreak: number;
  shortBreakMinutes: number;
  timer:
    | { state: 'idle' }
    | { durationMs: number; startedAt: string; state: 'running' }
    | { remainingMs: number; state: 'paused' };
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
  if (!relativePath.trim()) {
    throw new Error('Widget path is required.');
  }
  if (isAbsolute(relativePath)) {
    throw new Error('Widget path must be relative.');
  }
  const normalized = normalize(relativePath).replaceAll('\\', '/');
  if (
    !normalized.startsWith('.ghostboard/widgets/') ||
    normalized.split('/').includes('..') ||
    !normalized.endsWith('.json')
  ) {
    throw new Error('Widget path must stay inside .ghostboard/widgets/.');
  }
  const fullPath = resolve(wsPath, normalized);
  const root = resolve(wsPath, '.ghostboard', 'widgets');
  const rel = relative(root, fullPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Widget path must stay inside .ghostboard/widgets/.');
  }
  return fullPath;
}

function defaultDataForKind(kind: WidgetKind): WidgetData {
  switch (kind) {
    case 'checklist':
      return { items: [] } satisfies ChecklistWidgetData;
    case 'pomodoro':
      return {
        mode: 'focus',
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        sessionsBeforeLongBreak: 4,
        completedSessions: 0,
        timer: { state: 'idle' },
      } satisfies PomodoroWidgetData;
    case 'reminder':
      return {
        dueAt: new Date().toISOString(),
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
    const parsed = (await file.json()) as Partial<WidgetRecord>;
    if (
      parsed.schema !== WIDGET_SCHEMA ||
      typeof parsed.id !== 'string' ||
      typeof parsed.kind !== 'string' ||
      typeof parsed.data !== 'object' ||
      parsed.data === null
    ) {
      return { id: widgetId, error: 'corrupted' };
    }
    return parsed as WidgetRecord;
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

/** Atomically write the widget JSON file. */
export async function saveWidget(
  wsPath: string,
  widget: WidgetRecord
): Promise<void> {
  const relativePath = widgetRelativePath(widget.id);
  const fullPath = assertWorkspaceWidgetPath(wsPath, relativePath);
  const serialized = JSON.stringify(widget, null, 2);
  await atomicWrite(fullPath, serialized);
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
