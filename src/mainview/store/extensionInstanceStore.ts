import { toast } from 'sonner';
import { create } from 'zustand';
import { canvasTypeRegistry } from '@/extensions/registry';
import {
  rpcCloneExtensionInstance,
  rpcCreateExtensionInstance,
  rpcUpdateExtensionInstance,
} from '@/lib/rpc';
import * as m from '../../paraglide/messages.js';
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
import { ExtensionRevisionConflictError } from '../../shared/extensions/revisionConflict';

const SAVE_DEBOUNCE_MS = 400;
const MAX_HISTORY_DEPTH = 50;

type InstanceContent = Pick<ExtensionInstanceRecord, 'state' | 'presentation'>;

interface InstanceHistoryEntry {
  future: InstanceContent[];
  past: InstanceContent[];
}

function snapshotContent(record: ExtensionInstanceRecord): InstanceContent {
  return { state: record.state, presentation: record.presentation };
}

interface PendingSave {
  timer: ReturnType<typeof setTimeout>;
}

const pendingSaves = new Map<string, PendingSave>();
const saveChains = new Map<string, Promise<void>>();
const migrations = new Map<string, Promise<boolean>>();

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
  migrateInstance: (instanceId: string) => Promise<boolean>;
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

    migrateInstance: async (instanceId) => {
      const existing = migrations.get(instanceId);
      if (existing) {
        return existing;
      }
      const migrate = async () => {
        const current = get().records[instanceId];
        if (!current || isExtensionInstanceLoadError(current)) {
          return false;
        }
        const canvasType = canvasTypeRegistry.get(current.canvasTypeId);
        if (!canvasType) {
          return false;
        }
        if (
          current.dataVersion === canvasType.dataVersion &&
          canvasType.validateState(current.state)
        ) {
          return true;
        }
        if (current.dataVersion >= canvasType.dataVersion) {
          return false;
        }
        try {
          const state = canvasType.migrateState(current);
          if (!canvasType.validateState(state)) {
            throw new Error('Migrated extension state failed validation');
          }
          const presentation = canvasType.buildPresentation(state);
          const result = await rpcUpdateExtensionInstance({
            dataVersion: canvasType.dataVersion,
            expectedRevision: current.revision,
            instanceId,
            presentation,
            state,
          });
          if (!result.success) {
            return false;
          }
          set((snapshot) => {
            const latest = snapshot.records[instanceId];
            if (
              !latest ||
              isExtensionInstanceLoadError(latest) ||
              latest !== current
            ) {
              return snapshot;
            }
            return {
              records: {
                ...snapshot.records,
                [instanceId]: result.record,
              },
            };
          });
          return true;
        } catch (error) {
          console.error(
            `[extensionInstanceStore] Failed to migrate ${instanceId}:`,
            error
          );
          return false;
        }
      };
      const pending = migrate().finally(() => {
        if (migrations.get(instanceId) === pending) {
          migrations.delete(instanceId);
        }
      });
      migrations.set(instanceId, pending);
      return pending;
    },

    updateState: async (instanceId, request) => {
      const current = get().records[instanceId];
      if (!current || isExtensionInstanceLoadError(current)) {
        return { revision: 0, state: null, presentation: { title: '' } };
      }
      if (
        request.expectedRevision != null &&
        request.expectedRevision !== current.revision
      ) {
        // Compare-and-set: the caller read an older instance, so drop the
        // write instead of clobbering whatever landed in between.
        throw new ExtensionRevisionConflictError({
          presentation: current.presentation,
          revision: current.revision,
          state: current.state,
        });
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
                  past: [
                    ...(entry?.past ?? []),
                    snapshotContent(current),
                  ].slice(-MAX_HISTORY_DEPTH),
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
        !(entry && entry.past.length > 0 && current) ||
        isExtensionInstanceLoadError(current)
      ) {
        return;
      }
      const previous = entry.past.at(-1) as InstanceContent;
      set((s) => ({
        records: {
          ...s.records,
          [instanceId]: {
            ...current,
            ...previous,
            updatedAt: new Date().toISOString(),
          },
        },
        history: {
          ...s.history,
          [instanceId]: {
            past: entry.past.slice(0, -1),
            future: [...entry.future, snapshotContent(current)].slice(
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
        !(entry && entry.future.length > 0 && current) ||
        isExtensionInstanceLoadError(current)
      ) {
        return;
      }
      const next = entry.future.at(-1) as InstanceContent;
      set((s) => ({
        records: {
          ...s.records,
          [instanceId]: {
            ...current,
            ...next,
            updatedAt: new Date().toISOString(),
          },
        },
        history: {
          ...s.history,
          [instanceId]: {
            past: [...entry.past, snapshotContent(current)].slice(
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
      const doSave = async () => {
        // Read inside the queue: earlier writes may have advanced revision.
        const record = get().records[instanceId];
        if (!record || isExtensionInstanceLoadError(record)) {
          return;
        }
        try {
          const result = await rpcUpdateExtensionInstance({
            instanceId,
            expectedRevision: record.revision,
            state: record.state,
            presentation: record.presentation,
          });
          if (result.success && result.record) {
            const saved = result.record;
            set((s) => {
              const current = s.records[instanceId];
              if (!current || isExtensionInstanceLoadError(current)) {
                return s;
              }
              // A successful write acknowledges the submitted snapshot, not
              // edits made while the request was in flight.
              return {
                records: {
                  ...s.records,
                  [instanceId]:
                    current === record
                      ? saved
                      : { ...current, revision: saved.revision },
                },
              };
            });
            return;
          }
          toast.error(m.toast_save_failed());
        } catch (error) {
          console.error(
            `[extensionInstanceStore] Failed to save ${instanceId}:`,
            error
          );
          toast.error(m.toast_save_failed());
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
