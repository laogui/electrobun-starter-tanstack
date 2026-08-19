import { create } from 'zustand';
import { canvasTypeRegistry } from '@/extensions/registry';
import {
  rpcCloneExtensionInstance,
  rpcCreateExtensionInstance,
  rpcUpdateExtensionInstance,
} from '@/lib/rpc';
import {
  type ExtensionInstanceLoadError,
  type ExtensionInstanceRecord,
  isExtensionInstanceLoadError,
} from '../../shared/extensions/instance';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type {
  ExtensionStateSnapshot,
  ExtensionStateUpdate,
} from '../../shared/extensions/protocol';

const SAVE_DEBOUNCE_MS = 400;
const MAX_HISTORY_DEPTH = 50;

interface InstanceHistoryEntry {
  future: ExtensionInstanceRecord[];
  past: ExtensionInstanceRecord[];
}

interface PendingSave {
  timer: ReturnType<typeof setTimeout>;
}

const pendingSaves = new Map<string, PendingSave>();
const saveChains = new Map<string, Promise<void>>();

function scheduleSave(instanceId: string, save: () => Promise<void>): void {
  const existing = pendingSaves.get(instanceId);
  if (existing) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(() => {
    pendingSaves.delete(instanceId);
    save().catch((error) => {
      console.error(
        `[extensionInstanceStore] Failed to save ${instanceId}:`,
        error
      );
    });
  }, SAVE_DEBOUNCE_MS);
  pendingSaves.set(instanceId, { timer });
}

export interface ExtensionInstanceStoreState {
  cloneInstance: (
    instanceId: string
  ) => Promise<ExtensionInstanceRecord | null>;
  createInstance: (input: {
    canvasTypeId: string;
    dataVersion: number;
    presentation: ExtensionPresentation;
    state: unknown;
  }) => Promise<ExtensionInstanceRecord | null>;
  history: Record<string, InstanceHistoryEntry>;
  hydrate: (
    records: Record<
      string,
      ExtensionInstanceRecord | ExtensionInstanceLoadError
    >,
    referencedIds?: Set<string>
  ) => void;
  records: Record<string, ExtensionInstanceRecord | ExtensionInstanceLoadError>;
  redoInstance: (instanceId: string) => void;
  saveNow: (instanceId: string) => Promise<void>;
  undoInstance: (instanceId: string) => void;
  updateState: (
    instanceId: string,
    request: ExtensionStateUpdate
  ) => Promise<ExtensionStateSnapshot>;
}

export const useExtensionInstanceStore = create<ExtensionInstanceStoreState>(
  (set, get) => ({
    records: {},
    history: {},

    hydrate: (records, referencedIds) => {
      set((s) => {
        const nextHistory = { ...s.history };
        for (const id of Object.keys(records)) {
          delete nextHistory[id];
        }
        let nextRecords = { ...s.records, ...records };
        if (referencedIds) {
          const incomingIds = new Set(Object.keys(records));
          const kept: Record<
            string,
            ExtensionInstanceRecord | ExtensionInstanceLoadError
          > = {};
          for (const [id, record] of Object.entries(nextRecords)) {
            if (
              referencedIds.has(id) ||
              incomingIds.has(id) ||
              pendingSaves.has(id) ||
              saveChains.has(id)
            ) {
              kept[id] = record;
            }
          }
          nextRecords = kept;
        }
        return { records: nextRecords, history: nextHistory };
      });
    },

    createInstance: async (input) => {
      const result = await rpcCreateExtensionInstance(input);
      if (!result.success) {
        return null;
      }
      set((s) => ({
        records: { ...s.records, [result.record.id]: result.record },
      }));
      return result.record;
    },

    cloneInstance: async (instanceId) => {
      const result = await rpcCloneExtensionInstance(instanceId);
      if (!result.success) {
        return null;
      }
      set((s) => ({
        records: { ...s.records, [result.record.id]: result.record },
      }));
      return result.record;
    },

    updateState: async (instanceId, request) => {
      const current = get().records[instanceId];
      if (!current || isExtensionInstanceLoadError(current)) {
        return { revision: 0, state: null, presentation: { title: '' } };
      }
      const canvasType = canvasTypeRegistry.get(current.canvasTypeId);
      const nextState = request.state;
      const presentation =
        request.history === 'record' && canvasType?.validateState(nextState)
          ? canvasType.buildPresentation(nextState)
          : current.presentation;
      const updated: ExtensionInstanceRecord = {
        ...current,
        state: nextState,
        presentation,
        updatedAt: new Date().toISOString(),
      };
      const shouldRecord = request.history === 'record';
      set((s) => {
        const entry = s.history[instanceId];
        return {
          records: { ...s.records, [instanceId]: updated },
          history: shouldRecord
            ? {
                ...s.history,
                [instanceId]: {
                  past: [...(entry?.past ?? []), current].slice(
                    -MAX_HISTORY_DEPTH
                  ),
                  future: [],
                },
              }
            : s.history,
        };
      });
      if (shouldRecord) {
        scheduleSave(instanceId, () => get().saveNow(instanceId));
      }
      return {
        revision: updated.revision,
        state: updated.state,
        presentation: updated.presentation,
      };
    },

    undoInstance: (instanceId) => {
      const entry = get().history[instanceId];
      const current = get().records[instanceId];
      if (
        !(entry && entry.past.length > 0) ||
        isExtensionInstanceLoadError(current)
      ) {
        return;
      }
      const previous = entry.past.at(-1) as ExtensionInstanceRecord;
      set((s) => ({
        records: { ...s.records, [instanceId]: previous },
        history: {
          ...s.history,
          [instanceId]: {
            past: entry.past.slice(0, -1),
            future: [...entry.future, current as ExtensionInstanceRecord].slice(
              -MAX_HISTORY_DEPTH
            ),
          },
        },
      }));
      scheduleSave(instanceId, () => get().saveNow(instanceId));
    },

    redoInstance: (instanceId) => {
      const entry = get().history[instanceId];
      const current = get().records[instanceId];
      if (
        !(entry && entry.future.length > 0) ||
        isExtensionInstanceLoadError(current)
      ) {
        return;
      }
      const next = entry.future.at(-1) as ExtensionInstanceRecord;
      set((s) => ({
        records: { ...s.records, [instanceId]: next },
        history: {
          ...s.history,
          [instanceId]: {
            past: [...entry.past, current as ExtensionInstanceRecord].slice(
              -MAX_HISTORY_DEPTH
            ),
            future: entry.future.slice(0, -1),
          },
        },
      }));
      scheduleSave(instanceId, () => get().saveNow(instanceId));
    },

    saveNow: async (instanceId) => {
      const pending = pendingSaves.get(instanceId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingSaves.delete(instanceId);
      }
      const record = get().records[instanceId];
      if (!record || isExtensionInstanceLoadError(record)) {
        return;
      }
      const doSave = async () => {
        const result = await rpcUpdateExtensionInstance({
          instanceId,
          state: record.state,
          presentation: record.presentation,
        });
        if (result.success && result.record) {
          set((s) => ({
            records: { ...s.records, [instanceId]: result.record },
          }));
        }
      };
      const previous = saveChains.get(instanceId) ?? Promise.resolve();
      const chained = previous.then(doSave, doSave);
      saveChains.set(instanceId, chained);
      chained.finally(() => {
        if (saveChains.get(instanceId) === chained) {
          saveChains.delete(instanceId);
        }
      });
      await chained;
    },
  })
);
