import type { PluginContentHistoryEvent } from '../../shared/plugins/contentHistory';

/*
 * Unified undo coordinator
 * ------------------------
 * One linear timeline that orders every user-visible history entry produced
 * in the active (workspace, canvas view), whatever its origin:
 *
 *   - `canvas`              one canvas snapshot push (store/slices/historySlice)
 *   - `widget`              one recorded legacy widget edit (widgetStore)
 *   - `extension-instance`  one recorded canvas-type instance edit
 *                           (extensionInstanceStore)
 *   - `plugin-note`         one committed plugin note batch (host events)
 *
 * The coordinator never stores payloads. Each source keeps its own stack and
 * the coordinator only decides *which* source the next Undo/Redo goes to, so
 * Cmd+Z reverts the most recent action regardless of origin.
 *
 * Invariant for stack sources (canvas, widget, extension-instance): for every
 * source key, the entries of that key in `past` are a suffix of the source's
 * own past, and the entries in `future` are a prefix of its own future. It is
 * maintained even when a source moves on its own (focused widget undo, a
 * direct store call): `observe*Transition` moves the matching entry, or drops
 * that key's entries on the other side when no matching entry is left. A
 * stack entry whose source reports nothing to undo/redo is stale; it and the
 * rest of that key's entries on the same side are dropped and the next entry
 * is tried, so a desynced source can never wedge Cmd+Z.
 *
 * Plugin batches are batch-addressed rather than stack-ordered: an explicit
 * SDK undo/redo that does not match the timeline top/front clears the whole
 * timeline instead of synthesising a false order (see
 * .planning/2026-09-11-plugin-unified-undo/findings.md).
 *
 * Text editing (inputs, textareas, BlockNote) keeps its editor-native history
 * and never enters this timeline; routeUndoRedo leaves those keystrokes to the
 * editor.
 */

const MAX_HISTORY = 100;
const MAX_COMPLETED_OPERATIONS = 100;

interface HistoryEntryScope {
  id: string;
  viewId: string;
  workspaceId: string;
}

export interface CanvasHistoryEntry extends HistoryEntryScope {
  kind: 'canvas';
}

export interface WidgetHistoryEntry extends HistoryEntryScope {
  kind: 'widget';
  widgetId: string;
}

export interface ExtensionInstanceHistoryEntry extends HistoryEntryScope {
  instanceId: string;
  kind: 'extension-instance';
}

export interface PluginNoteHistoryEntry extends HistoryEntryScope {
  batchId: string;
  kind: 'plugin-note';
  label: string;
  pluginId: string;
}

export type StackHistoryEntry =
  | CanvasHistoryEntry
  | ExtensionInstanceHistoryEntry
  | WidgetHistoryEntry;

export type UnifiedHistoryEntry = PluginNoteHistoryEntry | StackHistoryEntry;

export type HistoryAction = 'redo' | 'undo';

export interface UnifiedHistorySnapshot {
  future: readonly UnifiedHistoryEntry[];
  past: readonly UnifiedHistoryEntry[];
  pending: boolean;
  viewId: string;
  workspaceId: string;
}

export interface UnifiedHistoryHandlers {
  /** Apply a canvas snapshot transition; false when the stack is empty. */
  canvas(action: HistoryAction): boolean;
  /** Apply an extension-instance transition; false when nothing moved. */
  extensionInstance?(instanceId: string, action: HistoryAction): boolean;
  plugin(
    entry: PluginNoteHistoryEntry,
    action: HistoryAction,
    operationId: string
  ): Promise<void>;
  /** Apply a widget transition; false when nothing moved. */
  widget?(widgetId: string, action: HistoryAction): boolean;
}

export type UnifiedHistoryResult = 'applied' | 'empty' | 'pending';

interface PendingTransition {
  action: HistoryAction;
  entry: UnifiedHistoryEntry;
  operationId: string;
  transitioned: boolean;
}

type StackSourceKey =
  | `canvas`
  | `extension-instance:${string}`
  | `widget:${string}`;

function sameEntry(left: UnifiedHistoryEntry, right: UnifiedHistoryEntry) {
  return left.id === right.id && left.kind === right.kind;
}

function isStackEntry(entry: UnifiedHistoryEntry): entry is StackHistoryEntry {
  return entry.kind !== 'plugin-note';
}

function stackSourceKey(entry: StackHistoryEntry): StackSourceKey {
  if (entry.kind === 'widget') {
    return `widget:${entry.widgetId}`;
  }
  if (entry.kind === 'extension-instance') {
    return `extension-instance:${entry.instanceId}`;
  }
  return 'canvas';
}

function hasSourceKey(entry: UnifiedHistoryEntry, key: StackSourceKey) {
  return isStackEntry(entry) && stackSourceKey(entry) === key;
}

function pluginEntryId(workspaceId: string, pluginId: string, batchId: string) {
  return `plugin-note:${workspaceId}:${pluginId}:${batchId}`;
}

function applyStackEntry(
  entry: StackHistoryEntry,
  action: HistoryAction,
  handlers: UnifiedHistoryHandlers
): boolean {
  if (entry.kind === 'widget') {
    return handlers.widget?.(entry.widgetId, action) ?? false;
  }
  if (entry.kind === 'extension-instance') {
    return handlers.extensionInstance?.(entry.instanceId, action) ?? false;
  }
  return handlers.canvas(action);
}

export class UnifiedUndoHistory {
  private completedOperationIds: string[] = [];
  private readonly completedOperations = new Set<string>();
  private future: UnifiedHistoryEntry[] = [];
  private nextEntryId = 0;
  private past: UnifiedHistoryEntry[] = [];
  private pending: PendingTransition | null = null;
  private viewId = '';
  private workspaceId = '';
  private nativeContext = false;
  private readonly branchListeners = new Set<() => void>();

  onBranch(listener: () => void): () => void {
    this.branchListeners.add(listener);
    return () => this.branchListeners.delete(listener);
  }

  setNativeView(viewId: string): void {
    if (this.viewId !== viewId) {
      this.clear();
    }
    this.viewId = viewId;
    this.nativeContext = true;
  }

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
    return Boolean((this.workspaceId || this.nativeContext) && this.viewId);
  }

  // -- recording ------------------------------------------------------------

  recordCanvas(viewId: string): void {
    if (!(this.isActive() && viewId === this.viewId)) {
      return;
    }
    this.push({ ...this.scope('canvas'), kind: 'canvas' });
  }

  recordWidget(widgetId: string): void {
    if (!this.isActive()) {
      return;
    }
    this.push({ ...this.scope('widget'), kind: 'widget', widgetId });
  }

  recordExtensionInstance(instanceId: string): void {
    if (!this.isActive()) {
      return;
    }
    this.push({
      ...this.scope('extension-instance'),
      instanceId,
      kind: 'extension-instance',
    });
  }

  // -- source transitions -----------------------------------------------------

  observeCanvasTransition(action: HistoryAction, viewId: string): void {
    if (!(this.isActive() && viewId === this.viewId)) {
      return;
    }
    this.observeStackTransition('canvas', action);
  }

  observeWidgetTransition(widgetId: string, action: HistoryAction): void {
    if (this.isActive()) {
      this.observeStackTransition(`widget:${widgetId}`, action);
    }
  }

  observeExtensionInstanceTransition(
    instanceId: string,
    action: HistoryAction
  ): void {
    if (this.isActive()) {
      this.observeStackTransition(`extension-instance:${instanceId}`, action);
    }
  }

  /** A source discarded its whole stack (e.g. re-hydrated from disk). */
  forgetWidget(widgetId: string): void {
    this.dropSource(`widget:${widgetId}`, 'both');
  }

  forgetExtensionInstance(instanceId: string): void {
    this.dropSource(`extension-instance:${instanceId}`, 'both');
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

  // -- replay -------------------------------------------------------------------

  async perform(
    action: HistoryAction,
    handlers: UnifiedHistoryHandlers
  ): Promise<UnifiedHistoryResult> {
    if (this.pending) {
      return 'pending';
    }
    // Each stale entry removes at least one entry, so this terminates; the
    // bound only guards against a misbehaving handler.
    for (let attempt = 0; attempt <= MAX_HISTORY * 2; attempt += 1) {
      const entry = action === 'undo' ? this.past.at(-1) : this.future[0];
      if (!entry) {
        if (!this.isActive()) {
          return handlers.canvas(action) ? 'applied' : 'empty';
        }
        return 'empty';
      }
      const result = await this.apply(entry, action, handlers);
      if (result !== 'stale') {
        return result;
      }
    }
    return 'empty';
  }

  reset(): void {
    this.clear();
    this.viewId = '';
    this.workspaceId = '';
    this.nativeContext = false;
  }

  setContext(workspaceId: string, viewId: string): void {
    if (workspaceId === this.workspaceId && viewId === this.viewId) {
      return;
    }
    if (
      this.nativeContext &&
      !this.workspaceId &&
      workspaceId &&
      viewId === this.viewId
    ) {
      this.past = this.past.map((entry) => ({ ...entry, workspaceId }));
      this.future = this.future.map((entry) => ({ ...entry, workspaceId }));
    } else {
      this.clear();
    }
    this.nativeContext = false;
    this.workspaceId = workspaceId;
    this.viewId = viewId;
  }

  // -- internals ------------------------------------------------------------

  private async apply(
    entry: UnifiedHistoryEntry,
    action: HistoryAction,
    handlers: UnifiedHistoryHandlers
  ): Promise<'applied' | 'stale'> {
    const operationId =
      entry.kind === 'plugin-note'
        ? `native_${action}_${crypto.randomUUID()}`
        : `${entry.id}:${action}`;
    const pending: PendingTransition = {
      action,
      entry,
      operationId,
      transitioned: false,
    };
    this.pending = pending;
    try {
      if (isStackEntry(entry)) {
        if (!applyStackEntry(entry, action, handlers)) {
          // The source has nothing left on this side: every remaining entry
          // of the same source on this side is unreachable too.
          this.dropSource(
            stackSourceKey(entry),
            action === 'undo' ? 'past' : 'future'
          );
          return 'stale';
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

  private dropSource(
    key: StackSourceKey,
    side: 'both' | 'future' | 'past'
  ): void {
    if (side !== 'future') {
      this.past = this.past.filter((entry) => !hasSourceKey(entry, key));
    }
    if (side !== 'past') {
      this.future = this.future.filter((entry) => !hasSourceKey(entry, key));
    }
  }

  private observeStackTransition(
    key: StackSourceKey,
    action: HistoryAction
  ): void {
    const pending = this.pending;
    if (
      pending &&
      !pending.transitioned &&
      pending.action === action &&
      hasSourceKey(pending.entry, key)
    ) {
      // The coordinator's own replay: move the entry it is applying.
      this.transition(action, pending.entry);
      pending.transitioned = true;
      return;
    }
    this.reconcile(key, action);
  }

  /** Keep the timeline consistent with a source that moved on its own. */
  private reconcile(key: StackSourceKey, action: HistoryAction): void {
    if (action === 'undo') {
      const index = this.past.findLastIndex((entry) =>
        hasSourceKey(entry, key)
      );
      if (index === -1) {
        this.dropSource(key, 'future');
        return;
      }
      const entry = this.past[index]!;
      this.past = this.past.filter((_, position) => position !== index);
      this.future = [entry, ...this.future];
      return;
    }
    const index = this.future.findIndex((entry) => hasSourceKey(entry, key));
    if (index === -1) {
      this.dropSource(key, 'past');
      return;
    }
    const entry = this.future[index]!;
    this.future = this.future.filter((_, position) => position !== index);
    this.past = [...this.past, entry].slice(-MAX_HISTORY);
  }

  private push(entry: UnifiedHistoryEntry): void {
    for (const listener of this.branchListeners) {
      listener();
    }
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

  private scope(prefix: string): HistoryEntryScope {
    this.nextEntryId += 1;
    return {
      id: `${prefix}:${this.nextEntryId}`,
      viewId: this.viewId,
      workspaceId: this.workspaceId,
    };
  }

  private transition(action: HistoryAction, entry: UnifiedHistoryEntry): void {
    if (action === 'undo') {
      const top = this.past.at(-1);
      if (!(top && sameEntry(top, entry))) {
        this.clear();
        return;
      }
      this.past = this.past.slice(0, -1);
      this.future = [entry, ...this.future];
      return;
    }
    const front = this.future[0];
    if (!(front && sameEntry(front, entry))) {
      this.clear();
      return;
    }
    this.future = this.future.slice(1);
    this.past = [...this.past, entry].slice(-MAX_HISTORY);
  }
}

export const unifiedUndoHistory = new UnifiedUndoHistory();
