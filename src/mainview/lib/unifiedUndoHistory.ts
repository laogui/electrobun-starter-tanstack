/*
 * Unified undo coordinator
 * ------------------------
 * One linear timeline that orders every user-visible history entry produced
 * in the active canvas view, whatever its origin:
 *
 *   - `canvas`              one canvas snapshot push (store/slices/historySlice)
 *   - `widget`              one recorded legacy widget edit (widgetStore)
 *   - `extension-instance`  one recorded canvas-type instance edit
 *                           (extensionInstanceStore)
 *
 * The coordinator never stores payloads. Each source keeps its own stack and
 * the coordinator only decides *which* source the next Undo/Redo goes to, so
 * Cmd+Z reverts the most recent action regardless of origin.
 *
 * Invariant for every source (canvas, widget, extension-instance): for every
 * source key, the entries of that key in `past` are a suffix of the source's
 * own past, and the entries in `future` are a prefix of its own future. It is
 * maintained even when a source moves on its own (focused widget undo, a
 * direct store call): `observe*Transition` moves the matching entry, or drops
 * that key's entries on the other side when no matching entry is left. A
 * stack entry whose source reports nothing to undo/redo is stale; it and the
 * rest of that key's entries on the same side are dropped and the next entry
 * is tried, so a desynced source can never wedge Cmd+Z.
 *
 * Text editing (inputs, textareas, BlockNote) keeps its editor-native history
 * and never enters this timeline; routeUndoRedo leaves those keystrokes to the
 * editor.
 */

const MAX_HISTORY = 100;

interface HistoryEntryScope {
  id: string;
  viewId: string;
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

export type UnifiedHistoryEntry =
  | CanvasHistoryEntry
  | ExtensionInstanceHistoryEntry
  | WidgetHistoryEntry;

export type HistoryAction = 'redo' | 'undo';

export interface UnifiedHistorySnapshot {
  future: readonly UnifiedHistoryEntry[];
  past: readonly UnifiedHistoryEntry[];
  pending: boolean;
  viewId: string;
}

export interface UnifiedHistoryHandlers {
  /** Apply a canvas snapshot transition; false when the stack is empty. */
  canvas(action: HistoryAction): boolean;
  /** Apply an extension-instance transition; false when nothing moved. */
  extensionInstance?(instanceId: string, action: HistoryAction): boolean;
  /** Apply a widget transition; false when nothing moved. */
  widget?(widgetId: string, action: HistoryAction): boolean;
}

export type UnifiedHistoryResult = 'applied' | 'empty' | 'pending';

interface PendingTransition {
  action: HistoryAction;
  entry: UnifiedHistoryEntry;
  transitioned: boolean;
}

type StackSourceKey =
  | `canvas`
  | `extension-instance:${string}`
  | `widget:${string}`;

function sameEntry(left: UnifiedHistoryEntry, right: UnifiedHistoryEntry) {
  return left.id === right.id && left.kind === right.kind;
}

function stackSourceKey(entry: UnifiedHistoryEntry): StackSourceKey {
  if (entry.kind === 'widget') {
    return `widget:${entry.widgetId}`;
  }
  if (entry.kind === 'extension-instance') {
    return `extension-instance:${entry.instanceId}`;
  }
  return 'canvas';
}

function hasSourceKey(entry: UnifiedHistoryEntry, key: StackSourceKey) {
  return stackSourceKey(entry) === key;
}

function applyStackEntry(
  entry: UnifiedHistoryEntry,
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
  private future: UnifiedHistoryEntry[] = [];
  private nextEntryId = 0;
  private past: UnifiedHistoryEntry[] = [];
  private pending: PendingTransition | null = null;
  private viewId = '';
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
  }

  clear(): void {
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
    };
  }

  isActive(): boolean {
    return Boolean(this.viewId);
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

  // -- replay -------------------------------------------------------------------

  perform(
    action: HistoryAction,
    handlers: UnifiedHistoryHandlers
  ): UnifiedHistoryResult {
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
      const result = this.apply(entry, action, handlers);
      if (result !== 'stale') {
        return result;
      }
    }
    return 'empty';
  }

  reset(): void {
    this.clear();
    this.viewId = '';
  }

  // -- internals ------------------------------------------------------------

  private apply(
    entry: UnifiedHistoryEntry,
    action: HistoryAction,
    handlers: UnifiedHistoryHandlers
  ): 'applied' | 'stale' {
    const pending: PendingTransition = {
      action,
      entry,
      transitioned: false,
    };
    this.pending = pending;
    try {
      if (!applyStackEntry(entry, action, handlers)) {
        // The source has nothing left on this side: every remaining entry
        // of the same source on this side is unreachable too.
        this.dropSource(
          stackSourceKey(entry),
          action === 'undo' ? 'past' : 'future'
        );
        return 'stale';
      }
      if (!pending.transitioned && this.pending === pending) {
        this.transition(action, entry);
        pending.transitioned = true;
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

  private scope(prefix: string): HistoryEntryScope {
    this.nextEntryId += 1;
    return {
      id: `${prefix}:${this.nextEntryId}`,
      viewId: this.viewId,
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
