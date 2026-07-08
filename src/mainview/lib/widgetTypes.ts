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

export function isWidgetLoadError(
  record: WidgetRecord | WidgetLoadError | undefined
): record is WidgetLoadError {
  return !!record && 'error' in record;
}
