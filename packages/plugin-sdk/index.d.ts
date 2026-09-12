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

export interface CanvasTypePresentation {
  accentColor?: string;
  accessibilityLabel?: string;
  plainText?: string;
  subtitle?: string;
  title: string;
}

export interface CanvasTypeRenderContext {
  height: number;
  locale: string;
  readOnly: boolean;
  selected: boolean;
  surface: 'canvas' | 'detail';
  theme: 'light' | 'dark';
  width: number;
}

export interface CanvasTypeStateSnapshot<TState = JsonValue> {
  presentation: CanvasTypePresentation;
  revision: number;
  state: TState;
}

export interface CanvasTypeComponentProps<TState = JsonValue> {
  context: CanvasTypeRenderContext;
  presentation: CanvasTypePresentation;
  state: TState;
  updateState(
    state: TState,
    options?: { history?: 'record' | 'ephemeral' }
  ): Promise<CanvasTypeStateSnapshot<TState>>;
}

export interface CanvasTypePreviewProps<TState = JsonValue> {
  context: Pick<
    CanvasTypeRenderContext,
    'height' | 'locale' | 'theme' | 'width'
  >;
  presentation: CanvasTypePresentation;
  state: TState;
}

export interface CanvasTypeDefinition<TState = JsonValue> {
  component: ComponentType<CanvasTypeComponentProps<TState>>;
  createInitialState(): TState;
  dataVersion: number;
  description?: string;
  /** Plugin-local kebab-case ID. The host persists `${pluginId}/${id}`. */
  id: string;
  /** Required when persisted dataVersion is older than this definition. */
  migrateState?(state: JsonValue, fromVersion: number): TState;
  previewComponent?: ComponentType<CanvasTypePreviewProps<TState>>;
  /** Plain-text projection used by search, exports, accessibility and fallback. */
  summarize(state: TState): CanvasTypePresentation;
  surface?: {
    defaultSize?: { height: number; width: number };
    maxSize?: { height: number; width: number };
    minSize?: { height: number; width: number };
    openBehavior?: 'none' | 'detail';
    resizable?: boolean;
  };
  title: string;
  validateState(state: unknown): state is TState;
}

export interface OperationOptions {
  /** Combined with app.signal; either signal cancels the operation. */
  signal?: AbortSignal;
}

export interface PluginFileFilter {
  description: string;
  /** Lowercase extensions with a leading dot, for example `.csv`. */
  extensions: readonly string[];
}

export interface PluginFileHandle {
  readonly id: string;
  readonly kind: 'file';
  readonly lastModified: number;
  readonly mimeType: string;
  readonly name: string;
  readonly size: number;
}

export interface PluginDirectoryHandle {
  readonly id: string;
  readonly kind: 'directory';
  readonly name: string;
}

export type PluginFileSystemHandle = PluginDirectoryHandle | PluginFileHandle;

export interface PluginFileProgress {
  loaded: number;
  total: number;
}

export interface PluginDirectoryEntry {
  readonly handle?: PluginFileSystemHandle;
  readonly kind: 'directory' | 'file' | 'symlink';
  readonly name: string;
}

export interface PluginDirectoryPage {
  readonly entries: readonly PluginDirectoryEntry[];
  readonly nextCursor: string | null;
}

export interface PluginFileReadOptions extends OperationOptions {
  /** Defaults to the handle size and may not exceed 256 MiB per stream. */
  length?: number;
  onProgress?: (progress: PluginFileProgress) => void;
  /** Zero-based byte offset. */
  start?: number;
}

export type PluginFileWriteData =
  | string
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream<Uint8Array>;

export interface PluginFiles {
  /** Lists a sorted direct-child page. Symlinks are reported without a handle. */
  list(
    directory: PluginDirectoryHandle,
    options?: OperationOptions & { cursor?: string; limit?: number }
  ): Promise<PluginDirectoryPage>;
  /** Selects up to 16 files; cancelling returns an empty array. */
  pick(options: {
    accept: readonly PluginFileFilter[];
    multiple?: boolean;
    signal?: AbortSignal;
  }): Promise<readonly PluginFileHandle[]>;
  /** Selects one directory. Handles cannot be restored after activation/restart. */
  pickDirectory(
    options?: OperationOptions
  ): Promise<PluginDirectoryHandle | null>;
  /** Collects binary data in memory; defaults to a 16 MiB maximum. */
  readBytes(
    handle: PluginFileHandle,
    options?: PluginFileReadOptions & { maxBytes?: number }
  ): Promise<Uint8Array>;
  /** Reads strict UTF-8; defaults to 1 MiB and permits at most 16 MiB. */
  readText(
    handle: PluginFileHandle,
    options?: PluginFileReadOptions & { maxBytes?: number }
  ): Promise<string>;
  /** Invalidates handles early. Activation retirement also releases all handles. */
  release(...handles: readonly PluginFileSystemHandle[]): void;
  /** Reads bounded ranges as sequential 1 MiB localhost requests. */
  stream(
    handle: PluginFileHandle,
    options?: PluginFileReadOptions
  ): ReadableStream<Uint8Array>;
  /** Atomically writes at most 256 MiB below a user-selected directory. */
  write(
    directory: PluginDirectoryHandle,
    relativePath: string,
    data: PluginFileWriteData,
    options?: OperationOptions & {
      onProgress?: (progress: PluginFileProgress) => void;
      overwrite?: boolean;
    }
  ): Promise<PluginFileHandle>;
}

export interface ImporterSingleBatchParseResult {
  notes: readonly NoteContentCreate[];
  segments?: never;
  warnings: readonly string[];
}

export interface ImporterSegment {
  /** One atomic, idempotent host transaction containing 1–100 notes. */
  notes: readonly NoteContentCreate[];
}

export interface ImporterSegmentedParseResult {
  notes?: never;
  /** 2–50 explicit segments, 101–5,000 notes total and 16 MiB preview text. */
  segments: readonly ImporterSegment[];
  warnings: readonly string[];
}

export type ImporterParseResult =
  | ImporterSingleBatchParseResult
  | ImporterSegmentedParseResult;

export type ImporterNoteField = 'color' | 'text' | 'title';

export type ImporterFieldMapping = Readonly<
  Record<ImporterNoteField, string | null>
>;

export interface ImporterFieldInspection {
  /** Stable source-field identifiers, in source order. Limited to 100 entries. */
  fields: readonly string[];
  /** Optional initial mapping. The host still presents it for explicit review. */
  suggestedMapping?: Partial<ImporterFieldMapping>;
}

export interface ImporterParseOptions extends OperationOptions {
  /** Present only for importers that register `inspectFields`. */
  mapping?: ImporterFieldMapping;
}

export interface ImporterDefinition {
  accept: readonly PluginFileFilter[];
  /** Plugin-local identifier. */
  id: string;
  /**
   * Opts into host-owned mapping from bounded source fields to Note fields.
   * The host requires an explicit mapping review before it calls `parse`.
   */
  inspectFields?(
    file: PluginFileHandle,
    options: OperationOptions
  ): Promise<ImporterFieldInspection>;
  /** Parse returns preview data only; committing it remains host-owned. */
  parse(
    file: PluginFileHandle,
    options: ImporterParseOptions
  ): Promise<ImporterParseResult>;
  title: string;
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
  readonly canvas: {
    /** Staged with this activation and published only after setup succeeds. */
    registerType<TState>(definition: CanvasTypeDefinition<TState>): Disposer;
  };
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
  readonly files: PluginFiles;
  /** Increases for each activation attempt; failed reloads do not reset it. */
  readonly generation: number;
  readonly importers: {
    /** Staged with this activation and published only after setup succeeds. */
    register(importer: ImporterDefinition): Disposer;
  };
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
