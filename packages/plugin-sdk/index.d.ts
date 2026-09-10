import type { ComponentType } from 'react';

export type Disposer = () => void | Promise<void>;

export interface CommandDefinition {
  enabled?: () => boolean;
  id: string;
  run: () => void | Promise<void>;
  /** For example Mod+Shift+J. Host shortcuts and text editing take priority. */
  shortcut?: string;
  title: string;
}

export type PanelDefinition = {
  id: string;
  title: string;
} & (
  | { component: ComponentType; mount?: never }
  // biome-ignore lint/suspicious/noConfusingVoidType: Side-effect-only mounts may return no disposer.
  | { component?: never; mount: (element: HTMLElement) => void | Disposer }
);

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface OperationOptions {
  /** Combined with app.signal; either signal cancels the operation. */
  signal?: AbortSignal;
}

export interface PluginStorage {
  delete(key: string, options?: OperationOptions): Promise<void>;
  get(key: string, options?: OperationOptions): Promise<JsonValue | undefined>;
  /** Returns sorted keys, not values. */
  list(prefix?: string, options?: OperationOptions): Promise<string[]>;
  set(key: string, value: JsonValue, options?: OperationOptions): Promise<void>;
}

export interface NoteMetadata {
  color: string;
  revision: number;
  title: string;
}

export interface NoteMetadataChange {
  after: NoteMetadata;
  before: NoteMetadata;
  id: string;
  /** True only when the persisted BlockNote document is unchanged. */
  metadataOnly: boolean;
}

export interface ContentChangedEvent {
  ids: readonly string[];
  kind: 'note' | 'widget' | 'extension';
  noteChanges?: readonly NoteMetadataChange[];
  operation: 'upsert' | 'delete';
  workspaceId: string;
}

export interface PluginEventMap {
  'content.changed': ContentChangedEvent;
  'selection.changed': {
    placementIds: readonly string[];
    viewId: string | null;
    workspaceId: string;
  };
  'workspace.activated': { workspaceId: string };
}

export type TaskSchedule =
  | { every: number; at?: never }
  | { at: Date; every?: never };

export interface NoteContentSnapshot {
  color: string;
  id: string;
  kind: 'note';
  /** Legacy Markdown is read-only through this API. */
  revision: number | null;
  source: 'sidecar' | 'markdown';
  /** Plain text, not editor-internal blocks or a lossless export. */
  text: string;
  title: string;
}

export interface NoteContentUpdate {
  changes: {
    title?: string;
    color?: string;
    /** Replaces the entire rich-text body with plain paragraphs (LF/CRLF lines).
     * Undo restores the original rich text. Max 256 KiB UTF-8; no Markdown parsing.
     */
    text?: string;
  };
  expectedRevision: number;
  id: string;
}

export interface NoteContentCreate {
  color?: string;
  /** Plain-text paragraphs, same limits and semantics as updateMany changes.text. */
  text?: string;
  title: string;
}

export interface ContentBatchResult {
  /** False for a batch containing only no-ops. */
  changed: boolean;
  items: (NoteMetadata & { id: string })[];
  operationId: string;
  /** Only creation undo: removed notes are absent from items. */
  removedIds?: string[];
}

export interface ContentMutationOptions extends OperationOptions {
  /** Reuse this ID with identical input to retry an uncertain outcome. */
  operationId?: string;
}

export interface SelectionPlacement {
  readonly content: {
    readonly id: string;
    readonly kind: 'note' | 'widget' | 'extension';
  } | null;
  readonly id: string;
}

export interface PlacementSelectionSnapshot {
  readonly items: readonly SelectionPlacement[];
  readonly viewId: string | null;
}

export interface SelectionSnapshot {
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly items: readonly NoteContentSnapshot[];
  readonly placements: PlacementSelectionSnapshot;
  readonly status: 'loading' | 'ready' | 'error';
}

export interface PluginSelection {
  /** Captures selected placements now, then reads their unique persisted notes. */
  get(options?: OperationOptions): Promise<readonly NoteContentSnapshot[]>;
  getPlacements(): PlacementSelectionSnapshot;
  /** Stable cached state for subscriptions; empty items while loading or failed. */
  getSnapshot(): SelectionSnapshot;
  /** Subscriptions start at activation publication and stop on retirement. */
  subscribe(listener: () => void): () => void;
}

export interface PluginContent {
  /** Creates 1–100 detached sidecar notes, with host-generated IDs. */
  createMany(
    notes: NoteContentCreate[],
    options: ContentMutationOptions & { label: string }
  ): Promise<ContentBatchResult>;
  get(
    id: string,
    options?: OperationOptions
  ): Promise<NoteContentSnapshot | null>;
  /** One host read operation; ordered results, null for missing notes. Max 500 IDs. */
  getMany(
    ids: readonly string[],
    options?: OperationOptions
  ): Promise<(NoteContentSnapshot | null)[]>;
  query(
    query?: { text?: string; after?: string; limit?: number },
    options?: OperationOptions
  ): Promise<{ items: NoteContentSnapshot[]; nextCursor: string | null }>;
  redo(
    batchId: string,
    options?: ContentMutationOptions
  ): Promise<ContentBatchResult>;
  /** Batch IDs belong to this plugin and workspace. Undo conflicts fail as a whole. */
  undo(
    batchId: string,
    options?: ContentMutationOptions
  ): Promise<ContentBatchResult>;
  updateMany(
    updates: NoteContentUpdate[],
    options: ContentMutationOptions & { label: string }
  ): Promise<ContentBatchResult>;
}

export interface PluginContext {
  readonly commands: {
    register(command: CommandDefinition): Disposer;
  };
  readonly content: PluginContent;
  readonly events: {
    on<K extends keyof PluginEventMap>(
      event: K,
      listener: (payload: PluginEventMap[K]) => void | Promise<void>,
      options?: OperationOptions
    ): Disposer;
  };
  /** Increases for each activation attempt; failed reloads do not reset it. */
  readonly generation: number;
  /** Registers a cleanup; the returned disposer also runs it early, once. */
  onCleanup(disposer: Disposer): Disposer;
  readonly panels: {
    register(panel: PanelDefinition): Disposer;
    open(id: string): void;
    close(id: string): void;
  };
  readonly pluginId: string;
  readonly selection: PluginSelection;
  /** Aborted on retirement, not when a replacement merely starts preparing. */
  readonly signal: AbortSignal;
  readonly storage: {
    app: PluginStorage;
    workspace: PluginStorage;
  };
  readonly tasks: {
    /** In-memory schedules start at publication; missed ticks are not replayed. */
    schedule(
      id: string,
      schedule: TaskSchedule,
      run: () => void | Promise<void>
    ): Disposer;
  };
  readonly workers: {
    /** The returned disposer terminates the worker; disable also terminates it. */
    track(worker: Worker): Disposer;
  };
  readonly workspaceId: string;
}

export interface PluginDefinition {
  // biome-ignore lint/suspicious/noConfusingVoidType: Async setup also supports plugins with no cleanup return.
  setup(app: PluginContext): void | Disposer | Promise<void | Disposer>;
}

export declare function definePlugin<T extends PluginDefinition>(
  definition: T
): T;
