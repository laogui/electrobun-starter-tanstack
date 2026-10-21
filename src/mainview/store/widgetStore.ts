import { toast } from 'sonner';
import { create } from 'zustand';
import { rpcCloneWidget, rpcCreateWidget, rpcSaveWidget } from '@/lib/rpc';
import type {
  PomodoroWidgetData,
  ReminderWidgetData,
  WidgetKind,
  WidgetLoadError,
  WidgetRecord,
} from '@/lib/widgetTypes';
import { isWidgetLoadError } from '@/lib/widgetTypes';
import * as m from '../../paraglide/messages.js';

const SAVE_DEBOUNCE_MS = 400;
const MAX_HISTORY_DEPTH = 50;

interface WidgetHistoryEntry {
  future: WidgetRecord[];
  past: WidgetRecord[];
}

interface PendingSave {
  timer: ReturnType<typeof setTimeout>;
}

interface UpdateWidgetOptions {
  recordHistory?: boolean;
}

export interface WidgetStoreState {
  cloneWidget: (widgetId: string) => Promise<WidgetRecord | null>;
  completePomodoroIfDue: (widgetId: string) => boolean;
  createWidget: (
    kind: WidgetKind,
    title?: string
  ) => Promise<WidgetRecord | null>;
  history: Record<string, WidgetHistoryEntry>;
  hydrate: (
    records: Record<string, WidgetRecord | WidgetLoadError>,
    referencedWidgetIds?: Set<string>
  ) => void;
  records: Record<string, WidgetRecord | WidgetLoadError>;
  redoWidget: (widgetId: string) => void;
  saveWidgetNow: (widgetId: string) => Promise<void>;
  undoWidget: (widgetId: string) => void;
  updateWidget: (
    widgetId: string,
    updater: (record: WidgetRecord) => WidgetRecord,
    options?: UpdateWidgetOptions
  ) => void;
}

// Debounce timers live outside the store state — they are not serializable
// UI state, just in-flight scheduling bookkeeping.
const pendingSaves = new Map<string, PendingSave>();

// Per-widget save promise chains. Serializing saves per widgetId guarantees
// that overlapping saveWidgetNow calls (e.g. hydrate auto-complete racing a
// user edit) apply to disk in submission order, so a slower earlier save can
// never overwrite a faster later one (silent data loss on next reload).
const saveChains = new Map<string, Promise<void>>();

function scheduleSave(widgetId: string, save: () => Promise<void>): void {
  const existing = pendingSaves.get(widgetId);
  if (existing) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(() => {
    pendingSaves.delete(widgetId);
    save().catch((error) => {
      console.error(`[widgetStore] Failed to save widget ${widgetId}:`, error);
    });
  }, SAVE_DEBOUNCE_MS);
  pendingSaves.set(widgetId, { timer });
}

function isExpiredRunningPomodoro(record: WidgetRecord): boolean {
  if (record.kind !== 'pomodoro') {
    return false;
  }
  const data = record.data as PomodoroWidgetData;
  if (data.timer.state !== 'running') {
    return false;
  }
  const startedAt = Date.parse(data.timer.startedAt);
  if (!Number.isFinite(startedAt)) {
    return false;
  }
  return Date.now() >= startedAt + data.timer.durationMs;
}

function completeExpiredPomodoro(record: WidgetRecord): WidgetRecord {
  const data = record.data as PomodoroWidgetData;
  return {
    ...record,
    data: {
      ...data,
      completedSessions: data.completedSessions + 1,
      timer: { state: 'idle' },
    },
    updatedAt: new Date().toISOString(),
  };
}

function reminderDueAtMs(data: ReminderWidgetData): number {
  const dueAt =
    data.status === 'snoozed' && data.snoozedUntil
      ? data.snoozedUntil
      : data.dueAt;
  const parsed = Date.parse(dueAt);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function isDueReminder(record: WidgetRecord): boolean {
  if (record.kind !== 'reminder') {
    return false;
  }
  const data = record.data as ReminderWidgetData;
  if (data.status === 'done' || data.status === 'missed') {
    return false;
  }
  return reminderDueAtMs(data) <= Date.now();
}

function markReminderMissed(record: WidgetRecord): WidgetRecord {
  return {
    ...record,
    data: {
      ...(record.data as ReminderWidgetData),
      status: 'missed',
    },
    updatedAt: new Date().toISOString(),
  };
}

export const useWidgetStore = create<WidgetStoreState>((set, get) => ({
  records: {},
  history: {},

  hydrate: (records, referencedWidgetIds) => {
    const normalizedRecords = { ...records };
    const saveAfterHydrateIds: string[] = [];
    const dueReminderRecords: WidgetRecord[] = [];
    for (const [id, record] of Object.entries(records)) {
      if (isWidgetLoadError(record)) {
        continue;
      }
      if (isExpiredRunningPomodoro(record)) {
        normalizedRecords[id] = completeExpiredPomodoro(record);
        saveAfterHydrateIds.push(id);
        continue;
      }
      if (isDueReminder(record)) {
        const missed = markReminderMissed(record);
        normalizedRecords[id] = missed;
        saveAfterHydrateIds.push(id);
        dueReminderRecords.push(missed);
      }
    }
    set((s) => {
      const nextHistory = { ...s.history };
      for (const id of Object.keys(normalizedRecords)) {
        delete nextHistory[id];
      }
      // When the caller supplies the set of widget ids referenced by the
      // current canvas, prune in-memory records that are neither referenced
      // nor part of this hydration batch. This bounds memory growth as the
      // user switches between views with disjoint widget sets.
      let nextRecords = { ...s.records, ...normalizedRecords };
      if (referencedWidgetIds) {
        const incomingIds = new Set(Object.keys(normalizedRecords));
        const kept: Record<string, WidgetRecord | WidgetLoadError> = {};
        for (const [id, record] of Object.entries(nextRecords)) {
          if (
            referencedWidgetIds.has(id) ||
            incomingIds.has(id) ||
            // Keep records with in-flight or debounced writes so a view switch
            // within the debounce window cannot drop unsaved edits (and cause
            // saveWidgetNow to no-op on a missing record).
            saveAfterHydrateIds.includes(id) ||
            pendingSaves.has(id) ||
            saveChains.has(id)
          ) {
            kept[id] = record;
          }
        }
        nextRecords = kept;
      }
      return {
        records: nextRecords,
        // History is in-memory only; reloading starts fresh per hydrated id.
        history: nextHistory,
      };
    });
    for (const record of dueReminderRecords) {
      const data = record.data as ReminderWidgetData;
      toast.info(m.toast_reminder_due({ title: record.title || record.id }), {
        ...(data.note ? { description: data.note } : {}),
      });
    }
    for (const id of saveAfterHydrateIds) {
      scheduleSave(id, () => get().saveWidgetNow(id));
    }
  },

  createWidget: async (kind, title) => {
    const result = await rpcCreateWidget(kind, title);
    if (!result.success) {
      return null;
    }
    set((s) => ({
      records: { ...s.records, [result.widget.id]: result.widget },
    }));
    return result.widget;
  },

  cloneWidget: async (widgetId) => {
    const result = await rpcCloneWidget(widgetId);
    if (!result.success) {
      return null;
    }
    set((s) => ({
      records: { ...s.records, [result.widget.id]: result.widget },
    }));
    return result.widget;
  },

  completePomodoroIfDue: (widgetId) => {
    // Guarded completion: only transition a running, expired pomodoro to idle
    // and increment the session count. Because the guard checks the live store
    // state, a second invocation (e.g. React Strict Mode double effect) finds
    // the timer already idle and is a no-op.
    const current = get().records[widgetId];
    if (
      !current ||
      isWidgetLoadError(current) ||
      !isExpiredRunningPomodoro(current)
    ) {
      return false;
    }
    set((s) => ({
      records: { ...s.records, [widgetId]: completeExpiredPomodoro(current) },
    }));
    scheduleSave(widgetId, () => get().saveWidgetNow(widgetId));
    return true;
  },

  updateWidget: (widgetId, updater, options = {}) => {
    const current = get().records[widgetId];
    if (!current || isWidgetLoadError(current)) {
      return;
    }
    const updated = updater(current);
    const shouldRecordHistory = options.recordHistory !== false;
    set((s) => {
      const entry = s.history[widgetId];
      return {
        records: { ...s.records, [widgetId]: updated },
        history: shouldRecordHistory
          ? {
              ...s.history,
              [widgetId]: {
                past: [...(entry?.past ?? []), current].slice(
                  -MAX_HISTORY_DEPTH
                ),
                future: [],
              },
            }
          : s.history,
      };
    });
    scheduleSave(widgetId, () => get().saveWidgetNow(widgetId));
  },

  undoWidget: (widgetId) => {
    const entry = get().history[widgetId];
    const current = get().records[widgetId];
    if (!(entry && entry.past.length > 0) || isWidgetLoadError(current)) {
      return;
    }
    const previous = entry.past.at(-1) as WidgetRecord;
    const past = entry.past.slice(0, -1);
    const future = [...entry.future, current as WidgetRecord].slice(
      -MAX_HISTORY_DEPTH
    );
    set((s) => ({
      records: { ...s.records, [widgetId]: previous },
      history: { ...s.history, [widgetId]: { past, future } },
    }));
    scheduleSave(widgetId, () => get().saveWidgetNow(widgetId));
  },

  redoWidget: (widgetId) => {
    const entry = get().history[widgetId];
    const current = get().records[widgetId];
    if (!(entry && entry.future.length > 0) || isWidgetLoadError(current)) {
      return;
    }
    const next = entry.future.at(-1) as WidgetRecord;
    const future = entry.future.slice(0, -1);
    const past = [...entry.past, current as WidgetRecord].slice(
      -MAX_HISTORY_DEPTH
    );
    set((s) => ({
      records: { ...s.records, [widgetId]: next },
      history: { ...s.history, [widgetId]: { past, future } },
    }));
    scheduleSave(widgetId, () => get().saveWidgetNow(widgetId));
  },

  saveWidgetNow: async (widgetId) => {
    const pending = pendingSaves.get(widgetId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingSaves.delete(widgetId);
    }
    // Capture the record snapshot now so every queued save writes the version
    // that was current when it was scheduled, and chain it behind any in-flight
    // save for the same widgetId to preserve submission order on disk.
    const record = get().records[widgetId];
    if (!record || isWidgetLoadError(record)) {
      return;
    }
    const doSave = async () => {
      try {
        const result = await rpcSaveWidget(record);
        if (!result.success) {
          console.error(`[widgetStore] saveWidget failed for ${widgetId}`);
          toast.error(m.toast_save_failed());
        }
      } catch (error) {
        console.error(`[widgetStore] saveWidget failed for ${widgetId}`, error);
        toast.error(m.toast_save_failed());
      }
    };
    const previous = saveChains.get(widgetId) ?? Promise.resolve();
    const chained = previous.then(doSave, doSave);
    saveChains.set(widgetId, chained);
    chained.finally(() => {
      if (saveChains.get(widgetId) === chained) {
        saveChains.delete(widgetId);
      }
    });
    await chained;
  },
}));
