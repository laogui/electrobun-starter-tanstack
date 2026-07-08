import { create } from 'zustand';
import { rpcCloneWidget, rpcCreateWidget, rpcSaveWidget } from '@/lib/rpc';
import type {
  WidgetKind,
  WidgetLoadError,
  WidgetRecord,
} from '@/lib/widgetTypes';
import { isWidgetLoadError } from '@/lib/widgetTypes';

const SAVE_DEBOUNCE_MS = 400;
const MAX_HISTORY_DEPTH = 50;

interface WidgetHistoryEntry {
  future: WidgetRecord[];
  past: WidgetRecord[];
}

interface PendingSave {
  timer: ReturnType<typeof setTimeout>;
}

export interface WidgetStoreState {
  cloneWidget: (widgetId: string) => Promise<WidgetRecord | null>;
  createWidget: (
    kind: WidgetKind,
    title?: string
  ) => Promise<WidgetRecord | null>;
  history: Record<string, WidgetHistoryEntry>;
  hydrate: (records: Record<string, WidgetRecord | WidgetLoadError>) => void;
  records: Record<string, WidgetRecord | WidgetLoadError>;
  redoWidget: (widgetId: string) => void;
  saveWidgetNow: (widgetId: string) => Promise<void>;
  undoWidget: (widgetId: string) => void;
  updateWidget: (
    widgetId: string,
    updater: (record: WidgetRecord) => WidgetRecord
  ) => void;
}

// Debounce timers live outside the store state — they are not serializable
// UI state, just in-flight scheduling bookkeeping.
const pendingSaves = new Map<string, PendingSave>();

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

export const useWidgetStore = create<WidgetStoreState>((set, get) => ({
  records: {},
  history: {},

  hydrate: (records) => {
    set((s) => ({
      records: { ...s.records, ...records },
      // History is in-memory only; reloading always starts with empty stacks.
      history: { ...s.history },
    }));
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

  updateWidget: (widgetId, updater) => {
    const current = get().records[widgetId];
    if (!current || isWidgetLoadError(current)) {
      return;
    }
    const updated = updater(current);
    set((s) => {
      const entry = s.history[widgetId] ?? { past: [], future: [] };
      const past = [...entry.past, current].slice(-MAX_HISTORY_DEPTH);
      return {
        records: { ...s.records, [widgetId]: updated },
        history: {
          ...s.history,
          [widgetId]: { past, future: [] },
        },
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
    const record = get().records[widgetId];
    if (!record || isWidgetLoadError(record)) {
      return;
    }
    const result = await rpcSaveWidget(record);
    if (!result.success) {
      console.error(`[widgetStore] saveWidget failed for ${widgetId}`);
    }
  },
}));
