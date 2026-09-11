import type { PluginContentHistoryEvent } from '../../shared/plugins/contentHistory';

const MAX_HISTORY = 50;
const MAX_COMPLETED_OPERATIONS = 100;

export interface CanvasHistoryEntry {
  id: string;
  kind: 'canvas';
  viewId: string;
  workspaceId: string;
}

export interface PluginNoteHistoryEntry {
  batchId: string;
  id: string;
  kind: 'plugin-note';
  label: string;
  pluginId: string;
  viewId: string;
  workspaceId: string;
}

export type UnifiedHistoryEntry = CanvasHistoryEntry | PluginNoteHistoryEntry;

export interface UnifiedHistorySnapshot {
  future: readonly UnifiedHistoryEntry[];
  past: readonly UnifiedHistoryEntry[];
  pending: boolean;
  viewId: string;
  workspaceId: string;
}

export interface UnifiedHistoryHandlers {
  canvas(action: 'redo' | 'undo'): boolean;
  plugin(
    entry: PluginNoteHistoryEntry,
    action: 'redo' | 'undo',
    operationId: string
  ): Promise<void>;
}

interface PendingTransition {
  action: 'redo' | 'undo';
  entry: UnifiedHistoryEntry;
  operationId: string;
  transitioned: boolean;
}

function sameEntry(left: UnifiedHistoryEntry, right: UnifiedHistoryEntry) {
  return left.id === right.id && left.kind === right.kind;
}

function pluginEntryId(workspaceId: string, pluginId: string, batchId: string) {
  return `plugin-note:${workspaceId}:${pluginId}:${batchId}`;
}

export class UnifiedUndoHistory {
  private completedOperationIds: string[] = [];
  private readonly completedOperations = new Set<string>();
  private future: UnifiedHistoryEntry[] = [];
  private nextCanvasId = 0;
  private past: UnifiedHistoryEntry[] = [];
  private pending: PendingTransition | null = null;
  private viewId = '';
  private workspaceId = '';

  clear(): void {
    this.completedOperationIds = [];
    this.completedOperations.clear();
    this.future = [];
    this.past = [];
    this.pending = null;
  }

  getSnapshot(): UnifiedHistorySnapshot {
    return {
      future: [...this.future],
      past: [...this.past],
      pending: this.pending !== null,
      viewId: this.viewId,
      workspaceId: this.workspaceId,
    };
  }

  isActive(): boolean {
    return Boolean(this.workspaceId && this.viewId);
  }

  observeCanvasTransition(action: 'redo' | 'undo', viewId: string): void {
    if (!(this.isActive() && viewId === this.viewId)) {
      return;
    }
    const expected = action === 'undo' ? this.past.at(-1) : this.future[0];
    const pending = this.pending;
    if (
      expected?.kind !== 'canvas' ||
      (pending &&
        (pending.action !== action || !sameEntry(pending.entry, expected)))
    ) {
      this.clear();
      return;
    }
    this.transition(action, expected);
    if (pending) {
      pending.transitioned = true;
    }
  }

  observePluginTransition(
    workspaceId: string,
    event: PluginContentHistoryEvent
  ): void {
    if (!(this.isActive() && workspaceId === this.workspaceId)) {
      return;
    }
    const id = pluginEntryId(workspaceId, event.pluginId, event.batchId);
    if (event.action === 'record') {
      if ([...this.past, ...this.future].some((entry) => entry.id === id)) {
        return;
      }
      this.push({
        id,
        batchId: event.batchId,
        kind: 'plugin-note',
        label: event.label,
        pluginId: event.pluginId,
        viewId: this.viewId,
        workspaceId,
      });
      return;
    }
    if (this.completedOperations.has(event.operationId)) {
      return;
    }
    const action = event.action;
    const expected = action === 'undo' ? this.past.at(-1) : this.future[0];
    const pending = this.pending;
    if (
      expected?.kind !== 'plugin-note' ||
      expected.id !== id ||
      (pending &&
        (pending.action !== action ||
          pending.operationId !== event.operationId ||
          !sameEntry(pending.entry, expected)))
    ) {
      this.clear();
      return;
    }
    this.transition(action, expected);
    this.rememberCompleted(event.operationId);
    if (pending) {
      pending.transitioned = true;
    }
  }

  async perform(
    action: 'redo' | 'undo',
    handlers: UnifiedHistoryHandlers
  ): Promise<'applied' | 'empty' | 'pending'> {
    if (this.pending) {
      return 'pending';
    }
    const entry = action === 'undo' ? this.past.at(-1) : this.future[0];
    if (!entry) {
      if (!this.isActive()) {
        return handlers.canvas(action) ? 'applied' : 'empty';
      }
      return 'empty';
    }
    const operationId =
      entry.kind === 'canvas'
        ? `${entry.id}:${action}`
        : `native_${action}_${crypto.randomUUID()}`;
    const pending: PendingTransition = {
      action,
      entry,
      operationId,
      transitioned: false,
    };
    this.pending = pending;
    try {
      if (entry.kind === 'canvas') {
        if (!handlers.canvas(action)) {
          return 'empty';
        }
      } else {
        await handlers.plugin(entry, action, operationId);
      }
      if (!pending.transitioned && this.pending === pending) {
        this.transition(action, entry);
        pending.transitioned = true;
      }
      if (entry.kind === 'plugin-note') {
        this.rememberCompleted(operationId);
      }
      return 'applied';
    } finally {
      if (this.pending === pending) {
        this.pending = null;
      }
    }
  }

  recordCanvas(viewId: string): void {
    if (!(this.isActive() && viewId === this.viewId)) {
      return;
    }
    this.nextCanvasId += 1;
    this.push({
      id: `canvas:${this.nextCanvasId}`,
      kind: 'canvas',
      viewId,
      workspaceId: this.workspaceId,
    });
  }

  reset(): void {
    this.clear();
    this.viewId = '';
    this.workspaceId = '';
  }

  setContext(workspaceId: string, viewId: string): void {
    if (workspaceId === this.workspaceId && viewId === this.viewId) {
      return;
    }
    this.clear();
    this.workspaceId = workspaceId;
    this.viewId = viewId;
  }

  private push(entry: UnifiedHistoryEntry): void {
    this.past = [...this.past, entry].slice(-MAX_HISTORY);
    this.future = [];
  }

  private rememberCompleted(operationId: string): void {
    if (this.completedOperations.has(operationId)) {
      return;
    }
    this.completedOperations.add(operationId);
    this.completedOperationIds.push(operationId);
    if (this.completedOperationIds.length > MAX_COMPLETED_OPERATIONS) {
      const removed = this.completedOperationIds.shift();
      if (removed) {
        this.completedOperations.delete(removed);
      }
    }
  }

  private transition(
    action: 'redo' | 'undo',
    entry: UnifiedHistoryEntry
  ): void {
    if (action === 'undo') {
      if (!sameEntry(this.past.at(-1)!, entry)) {
        this.clear();
        return;
      }
      this.past = this.past.slice(0, -1);
      this.future = [entry, ...this.future];
      return;
    }
    if (!sameEntry(this.future[0]!, entry)) {
      this.clear();
      return;
    }
    this.future = this.future.slice(1);
    this.past = [...this.past, entry].slice(-MAX_HISTORY);
  }
}

export const unifiedUndoHistory = new UnifiedUndoHistory();
