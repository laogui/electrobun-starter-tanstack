# GhostBoard Plugin SDK — single-file AI reference

This self-contained reference is for humans and coding agents maintaining a
GhostBoard trusted plugin without reading GhostBoard's private source tree. The
adjacent `index.d.ts`, `react.d.ts`, and `testing.d.ts` files remain the exact
type source of truth.

## Runtime and trust model

- A plugin is high-trust JavaScript explicitly installed and enabled by the
  user. It shares the renderer JavaScript realm and can use browser APIs.
- The SDK manages registrations, lifecycle, workspace identity, host services,
  and recoverable content operations. It is not a permission sandbox.
- Keep DOM and CSS changes inside panel/card mount points. Host UI outside those
  points is private and may be replaced on any render.
- `capabilities` in the manifest are user-facing claims, not enforced grants.
- The host supplies `@ghostboard/sdk`, `@ghostboard/sdk/react`, `react`,
  `react-dom`, `react-dom/client`, and `react/jsx-runtime`. Never bundle a second
  React instance.
- There is no supported Bun/backend plugin entry. Use the host services,
  browser workers, and ordinary browser APIs.

## Runtime package and manifest

An installable runtime directory has `manifest.json` at its root and at least
one JavaScript entry. Relative modules and static assets may sit beside it.

```text
runtime/
├── manifest.json
├── app.js
├── csv.js
└── assets/
    └── icon.svg
```

Minimal manifest:

```json
{
  "manifestVersion": 2,
  "id": "example.notes",
  "name": "Example Notes",
  "version": "0.1.0",
  "engines": { "ghostboard": ">=1.0.0 <2.0.0" },
  "entrypoints": { "app": "app.js" },
  "capabilities": []
}
```

The schema is closed. Supported optional fields are `author`, `description`,
`publicKey`, and `update: { url }`. IDs must be third-party IDs; `ghostboard.*`
is reserved. App entries must be safe package-relative `.js` or `.mjs` paths.
Current capability names are `network`, `files`, and `clipboard`. `publicKey`
must be the exact `ed25519-spki:...` value emitted by the packer's key command.
Unsigned local packages omit it.

## Definition and activation lifecycle

Every entry default-exports `definePlugin({ setup })`:

```js
import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  setup(app) {
    // Register contributions and owned resources here.
    return () => {
      // Optional final cleanup.
    };
  },
});
```

```ts
type Disposer = () => void | Promise<void>;

interface PluginDefinition {
  setup(app: PluginContext): void | Disposer | Promise<void | Disposer>;
}

declare function definePlugin<T extends PluginDefinition>(definition: T): T;

interface PluginContext {
  readonly pluginId: string;
  readonly workspaceId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
  onCleanup(disposer: Disposer): Disposer;
  // commands, panels, canvas, content, selection, importers, files,
  // storage, events, tasks, and workers are described below.
}
```

Registrations made during `setup` are staged. A successful reload aborts and
cleans the old generation before publishing the candidate. A failed import or
setup cleans only the candidate and leaves the old generation running.
`app.signal` aborts when its own activation retires or fails. Cleanup runs in
reverse registration order and at most once. Register resources during setup,
respect abort signals, and avoid irreversible side effects while a candidate is
preparing.

## Commands

```ts
interface CommandDefinition {
  id: string;
  title: string;
  shortcut?: string; // for example Mod+Shift+J
  enabled?: () => boolean;
  run: () => void | Promise<void>;
}

app.commands.register(command: CommandDefinition): Disposer;
```

```js
app.commands.register({
  id: 'open-summary',
  title: 'Open summary',
  shortcut: 'Mod+Shift+J',
  enabled: () => !app.signal.aborted,
  run: () => app.panels.open('summary'),
});
```

Use plugin-local kebab-case IDs. Host shortcuts and text editing take priority.
Put business behavior in one function and call it from every entry point.

## Panels

A panel uses either a React component or a DOM mount function, never both.

```ts
type PanelDefinition = {
  id: string;
  title: string;
} & (
  | { component: React.ComponentType; mount?: never }
  | { component?: never; mount(element: HTMLElement): void | Disposer }
);

app.panels.register(panel: PanelDefinition): Disposer;
app.panels.open(id: string): void;
app.panels.close(id: string): void;
```

```js
app.panels.register({
  id: 'summary',
  title: 'Summary',
  mount(element) {
    const section = document.createElement('section');
    section.textContent = `Workspace: ${app.workspaceId}`;
    element.append(section);
    return () => section.remove();
  },
});
```

```jsx
function SummaryPanel() {
  return <section>Ready</section>;
}

app.panels.register({
  id: 'summary',
  title: 'Summary',
  component: SummaryPanel,
});
```

The host owns the React root. Closing a panel disposes that view but does not
disable the plugin or remove its command. Use public `--gb-*` CSS variables or
vendored components from the template; host components are not SDK APIs.

## Storage, events, tasks, cleanup, and workers

Storage accepts JSON values only:

```ts
type JsonValue = null | boolean | number | string | JsonValue[] |
  { [key: string]: JsonValue };

interface PluginStorage {
  get(key: string, options?: { signal?: AbortSignal }):
    Promise<JsonValue | undefined>;
  set(key: string, value: JsonValue, options?: { signal?: AbortSignal }):
    Promise<void>;
  delete(key: string, options?: { signal?: AbortSignal }): Promise<void>;
  list(prefix?: string, options?: { signal?: AbortSignal }): Promise<string[]>;
}

app.storage.app: PluginStorage;       // this plugin across workspaces
app.storage.workspace: PluginStorage; // this plugin + workspace
```

```js
const count = (await app.storage.workspace.get('open-count')) ?? 0;
await app.storage.workspace.set('open-count', Number(count) + 1);
```

Typed events:

```ts
type PluginEventMap = {
  'content.changed': {
    ids: readonly string[];
    kind: 'note' | 'widget' | 'extension';
    operation: 'upsert' | 'delete';
    workspaceId: string;
    noteChanges?: readonly NoteMetadataChange[];
  };
  'selection.changed': {
    placementIds: readonly string[];
    viewId: string | null;
    workspaceId: string;
  };
  'workspace.activated': { workspaceId: string };
};

app.events.on(event, listener, { signal? }): Disposer;
```

Tasks exist only while the workspace activation is running. Missed ticks are
not replayed:

```ts
type TaskSchedule = { every: number; at?: never } |
  { at: Date; every?: never };

app.tasks.schedule(id: string, schedule: TaskSchedule,
  run: () => void | Promise<void>): Disposer;
```

Register arbitrary owned resources with `app.onCleanup`. Track a browser
`Worker` with `app.workers.track(worker)` so retirement terminates it.

## Note content

Content snapshots are persisted Note projections, not lossless editor blocks:

```ts
interface NoteContentSnapshot {
  id: string;
  kind: 'note';
  source: 'sidecar' | 'markdown';
  revision: number | null;
  title: string;
  color: string;
  text: string;
}

interface NoteContentCreate {
  title: string;
  color?: string;
  text?: string;
}
```

Reads:

```ts
app.content.get(id, { signal? }): Promise<NoteContentSnapshot | null>;
app.content.getMany(ids, { signal? }):
  Promise<(NoteContentSnapshot | null)[]>; // max 500 IDs
app.content.query({ text?, after?, limit? }, { signal? }):
  Promise<{ items: NoteContentSnapshot[]; nextCursor: string | null }>;
```

Create detached Notes in one 1–100 item transaction:

```js
const created = await app.content.createMany(
  [
    { title: 'Question', text: 'What changed?\nWhy?' },
    { title: 'Follow-up', color: '#bfdbfe' },
  ],
  { label: 'Create research notes', operationId: 'research-page-17' }
);
```

Update with compare-and-swap revisions:

```ts
interface NoteContentUpdate {
  id: string;
  expectedRevision: number;
  changes: { title?: string; color?: string; text?: string };
}

app.content.updateMany(updates, { label, operationId?, signal? }):
  Promise<ContentBatchResult>;
```

`text` is literal plain text split into paragraphs. It is not Markdown and is
not a lossless round trip for rich content. Legacy Markdown snapshots have a
`null` revision and are read-only through this API.

Mutation results contain a durable `operationId`. Retry an uncertain request
with the same ID and byte-equivalent input to receive the original result
without duplicating work. Reusing the ID with different input fails. Pass the
original batch ID to `undo` or `redo`; conflicts fail safely rather than
overwriting later edits or references.

```ts
interface ContentBatchResult {
  changed: boolean;
  items: Array<{ id: string; title: string; color: string; revision: number }>;
  operationId: string;
  removedIds?: string[];
}

app.content.undo(batchId, { operationId?, signal? }):
  Promise<ContentBatchResult>;
app.content.redo(batchId, { operationId?, signal? }):
  Promise<ContentBatchResult>;
```

## Selection and React hooks

```ts
interface PluginSelection {
  get(options?: { signal?: AbortSignal }):
    Promise<readonly NoteContentSnapshot[]>;
  getPlacements(): {
    viewId: string | null;
    items: readonly SelectionPlacement[];
  };
  getSnapshot(): SelectionSnapshot;
  subscribe(listener: () => void): () => void;
}
```

`get()` captures selected placement membership first, then reads unique
persisted Notes. `getPlacements()` includes selected widgets/extensions and
placement IDs. `getSnapshot()` distinguishes `loading`, `ready`, and `error`.

React panels can import:

```ts
useSelection(): readonly NoteContentSnapshot[];
useSelectionState(): SelectionSnapshot;
useSelectedPlacements(): PlacementSelectionSnapshot;
SelectionProvider({ selection, children }): ReactElement;
```

```jsx
import { useSelectionState } from '@ghostboard/sdk/react';

function SelectionPanel() {
  const selection = useSelectionState();
  if (selection.status === 'loading') return <p>Loading…</p>;
  if (selection.status === 'error') return <p>{selection.error?.message}</p>;
  return <p>{selection.items.length} selected Notes</p>;
}
```

The host wraps registered React panels. Use `SelectionProvider` only for a root
you create yourself or in standalone tests.

## Custom canvas types

```ts
interface CanvasTypeDefinition<TState = JsonValue> {
  id: string;
  title: string;
  description?: string;
  dataVersion: number;
  component: React.ComponentType<CanvasTypeComponentProps<TState>>;
  previewComponent?: React.ComponentType<CanvasTypePreviewProps<TState>>;
  createInitialState(): TState;
  validateState(state: unknown): state is TState;
  migrateState?(state: JsonValue, fromVersion: number): TState;
  summarize(state: TState): CanvasTypePresentation;
  surface?: {
    defaultSize?: { width: number; height: number };
    minSize?: { width: number; height: number };
    maxSize?: { width: number; height: number };
    openBehavior?: 'none' | 'detail';
    resizable?: boolean;
  };
}

app.canvas.registerType(definition): Disposer;
```

Minimal example without JSX:

```js
import { createElement } from 'react';

function CounterCard({ context, state, updateState }) {
  return createElement(
    'button',
    {
      disabled: context.readOnly,
      type: 'button',
      onClick: () => updateState({ count: state.count + 1 }),
    },
    `Count: ${state.count}`
  );
}

app.canvas.registerType({
  id: 'counter',
  title: 'Counter',
  dataVersion: 1,
  component: CounterCard,
  createInitialState: () => ({ count: 0 }),
  validateState: (state) => Boolean(
    state && typeof state === 'object' &&
    !Array.isArray(state) && typeof state.count === 'number'
  ),
  summarize: (state) => ({
    title: `Counter: ${state.count}`,
    plainText: `Counter value ${state.count}`,
  }),
});
```

The persisted type is `${pluginId}/${id}`. `summarize` supplies search,
accessibility, preview, export, and missing-plugin fallback text. Treat state as
untrusted input; validate it and provide migrations when increasing
`dataVersion`. `updateState` returns the committed revision. Use
`history: 'ephemeral'` only for transient interaction frames and finish with a
recorded update.

GhostBoard writes a host-owned preimage before a `dataVersion` increase. The
plugin settings recovery action can restore the latest pre-migration instance
with a new monotonic revision after retaining a guard copy of current data.
Code rollback and data restore are separate and both leave the plugin disabled.
This recovery contract applies to canvas instances; plugin KV storage does not
yet have a versioned migration API.

## Files

File and directory handles are opaque capabilities bound to the current plugin,
workspace, activation, and app process. Do not persist handle IDs.

```ts
interface PluginFileHandle {
  readonly id: string;
  readonly kind: 'file';
  readonly name: string;
  readonly size: number;
  readonly mimeType: string;
  readonly lastModified: number;
}

interface PluginDirectoryHandle {
  readonly id: string;
  readonly kind: 'directory';
  readonly name: string;
}
```

Selection and release:

```ts
app.files.pick({
  accept: readonly { description: string; extensions: readonly string[] }[];
  multiple?: boolean; // at most 16 files
  signal?: AbortSignal;
}): Promise<readonly PluginFileHandle[]>;

app.files.pickDirectory({ signal? }): Promise<PluginDirectoryHandle | null>;
app.files.release(...handles): void;
```

Reads:

```ts
app.files.readText(file, { start?, length?, maxBytes?, onProgress?, signal? }):
  Promise<string>; // strict UTF-8, default 1 MiB, max 16 MiB collected
app.files.readBytes(file, { start?, length?, maxBytes?, onProgress?, signal? }):
  Promise<Uint8Array>; // default max 16 MiB
app.files.stream(file, { start?, length?, onProgress?, signal? }):
  ReadableStream<Uint8Array>; // sequential 1 MiB ranges, max 256 MiB
```

Directories and atomic writes:

```ts
app.files.list(directory, { cursor?, limit?, signal? }): Promise<{
  entries: readonly {
    name: string;
    kind: 'file' | 'directory' | 'symlink';
    handle?: PluginFileHandle | PluginDirectoryHandle;
  }[];
  nextCursor: string | null;
}>;

app.files.write(directory, relativePath, data, {
  overwrite?, onProgress?, signal?
}): Promise<PluginFileHandle>;
```

`data` may be a string, `Blob`, `ArrayBuffer`, typed-array view, or
`ReadableStream<Uint8Array>`. Writes are limited to 256 MiB, use a host temporary
file followed by final rename, and stay below a directory the user selected.
Symlinks are listed without a usable handle. Release handles as soon as the
workflow finishes; activation retirement also releases them.

## Importers

Importers parse a selected file into an immutable, host-owned Note preview. They
do not commit content themselves.

```ts
interface ImporterDefinition {
  id: string;
  title: string;
  accept: readonly PluginFileFilter[];
  inspectFields?(file, { signal }): Promise<{
    fields: readonly string[];
    suggestedMapping?: Partial<{
      title: string | null;
      text: string | null;
      color: string | null;
    }>;
  }>;
  parse(file, { mapping?, signal }): Promise<
    | { notes: readonly NoteContentCreate[]; warnings: readonly string[] }
    | {
        segments: readonly { notes: readonly NoteContentCreate[] }[];
        warnings: readonly string[];
      }
  >;
}

app.importers.register(definition): Disposer;
```

Mapped CSV example:

```js
app.importers.register({
  id: 'notes-csv',
  title: 'Import Notes from CSV',
  accept: [{ description: 'CSV files', extensions: ['.csv'] }],
  async inspectFields(file, { signal }) {
    const text = await app.files.readText(file, { signal });
    const fields = parseHeader(text);
    const find = (name) =>
      fields.find((field) => field.toLowerCase() === name) ?? null;
    return {
      fields,
      suggestedMapping: {
        title: find('title'),
        text: find('text'),
        color: find('color'),
      },
    };
  },
  async parse(file, { mapping, signal }) {
    const text = await app.files.readText(file, { signal });
    return parseCsvToNotes(text, mapping);
  },
});
```

Field inspection is opt-in and limited to 100 unique fields. The host displays
mapping to the complete bounded Note surface: required `title`, optional `text`
and `color`. One source field cannot feed two targets.

The single-batch form contains 1–100 Notes. For 101–5,000 Notes, return 2–50
explicit segments, each containing 1–100 Notes. The host commits segments in
order with stable operation IDs and can resume an uncertain/failed range.
Rollback runs completed ranges in reverse and preserves a whole range on later
edit/reference conflict. Segmented imports stay detached. A single batch may be
placed on a selected canvas after creation; content creation and canvas saving
are separate operations, so a placement failure leaves the Notes detached and
retryable.

The host owns importer selection, source-handle lifetime, field mapping,
preview, warnings, destination choice, confirmation, retry, and cancellation.
Do not write workspace content during `inspectFields` or `parse`.

## Author tests

`@ghostboard/sdk/testing` provides an in-memory fake:

```js
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';

const fake = createFakeHost({
  pluginId: 'example.notes',
  workspaceId: 'test-workspace',
});
await plugin.setup(fake.app);

const file = fake.harness.files.addText(
  'notes.csv',
  'title,text\nOne,Body',
  { mimeType: 'text/csv' }
);
const preview = await fake.harness.behavior.parseImporter('notes-csv', file);
await fake.harness.lifecycle.dispose();
```

Useful harness surfaces:

- `inspection.commands`, `panels`, `canvasTypes`, `importers`, `tasks`,
  `openPanels`, `generation`, `signal`, and `cleanupCount`.
- `behavior.runCommand`, `runTask`, `inspectImporterFields`, `parseImporter`,
  `emit`, `setSelection`, and `abort`.
- `files.addText`, `addBytes`, `addDirectory`, `queuePick`, and
  `queueDirectory`.
- `lifecycle.reload(factory)` and `lifecycle.dispose()`.

`@ghostboard/sdk/testing/react` exports
`renderPanel(definition, { context })` for component panels. The fake does not
reproduce host layout/CSS, disk persistence, real RPC/native dialogs,
multi-plugin arbitration, installation, WebView behavior, or platform
differences. Validate those in a packaged GhostBoard app.

## Packaging

The SDK includes a deterministic, dependency-free package command exposed as
the `ghostboard-plugin` bin. Projects created with `create-ghostboard-plugin`
call it from their `package` script; run it directly with
`bunx ghostboard-plugin` (or `bun node_modules/@ghostboard/sdk/package-plugin.js`)
after `bun install`:

```sh
ghostboard-plugin <runtime-directory> \
  --output release/example.notes-0.1.0.ghostboard-plugin
```

By default every regular file below the runtime directory is included. The
output must be outside that directory. For a no-build project whose author files
share the runtime root, provide repeated explicit includes:

```sh
ghostboard-plugin . \
  --output dist/example.notes-0.1.0.ghostboard-plugin \
  --include manifest.json \
  --include app.js \
  --include csv.js
```

The packer sorts paths, writes deterministic stored ZIP entries, refuses
symlinks and escaping/unsafe paths, enforces the host's 256-file and 8 MiB
uncompressed limits, checks manifest v2 and its app entry, and replaces the
exact output atomically. It never executes plugin code or dependency lifecycle
scripts.

To establish an author identity for same-ID updates, generate a private key
outside the runtime directory and source control:

```sh
ghostboard-plugin --generate-key ../plugin-keys/example.notes.pem
```

Copy the printed `ed25519-spki:...` value into manifest `publicKey`, declare a
stable HTTPS `update.url`, then package with:

```sh
ghostboard-plugin <runtime-directory> \
  --sign ../plugin-keys/example.notes.pem \
  --output release/example.notes-0.1.0.ghostboard-plugin
```

The package contains strict `ghostboard-signature.json` schema v1. Its Ed25519
payload binds the plugin ID, version, normalized update URL, and a sorted tree
SHA-256 that excludes only the envelope itself. The host separately records a
full installed-tree digest including the envelope. A same-ID update must
advance semver and retain the first verified public key and update URL. Key
loss or rotation requires a new plugin ID. Unsigned packages remain usable for
local experiments but cannot be updated in place.

The archive may use `.ghostboard-plugin` or `.zip`. Final-user installation
needs only this runtime archive; it must not require Bun, Node, `node_modules`,
the `@ghostboard/sdk` package, source tests, or the host repository.

## Compatibility

Reference version: `@ghostboard/sdk` `0.1.0` for GhostBoard hosts matching
`>=1.0.0 <2.0.0`. `create-ghostboard-plugin` `0.1.0` generates that range.

- `engines.ghostboard` must be exactly `>=a.b.c <x.y.z`. A host outside the
  range reports `incompatible-host-api`, runs no plugin code, and keeps the
  installed files, enablement preference, KV, canvas instances, and imported
  notes.
- Within one host major, every API in this document is additive-only.
  Breaking changes ship only with a new host major together with a new SDK and
  scaffold major and a “since host x.y” migration note here. Deprecated APIs
  are marked at least one host minor before removal.
- The host provides the runtime for `@ghostboard/sdk`, `@ghostboard/sdk/react`,
  and React / ReactDOM 19.2.x through its import map. The npm package supplies
  types, the fake host, this reference, and the packer only. Raise the lower
  bound of `engines.ghostboard` when you use an API introduced by a newer host.
- `manifestVersion: 1` packages are rejected with a notice; their data is kept.
- Custom canvas types migrate lazily on `dataVersion` increase with a preimage
  backup; downgrades never overwrite data. Persistent KV has no migration API,
  so version your own values.
- Unsigned packages cannot be updated in place. Signed updates must advance
  semver and keep the pinned public key and update URL; the release document
  schema is `ghostboard-plugin-release/v2` with a per-release `ghostboard`
  range and SHA-256.
- Supported platform: macOS arm64 (packaged evidence). macOS x64 is pending
  verification; Windows and Linux are not supported for plugins. URL installs
  accept public HTTPS only.

## Completion checklist

- Keep `manifest.json` v2 and its app entry inside the packaged runtime files.
- Keep plugin-local IDs stable and use migrations for persisted canvas state.
- Keep setup registration-focused; register cleanup and respect `app.signal`.
- Use stable operation IDs when retrying uncertain content mutations.
- Treat snapshots and file input as untrusted; validate sizes, shapes, fields,
  revisions, and state.
- Do not use host-private imports, stores, DOM, components, or filesystem paths.
- Test setup and pure behavior with `@ghostboard/sdk/testing`.
- Build React with shared React/SDK imports externalized.
- Run `bun run package` and install the resulting archive in a packaged app.
- Keep signing private keys outside runtime directories and source control.
- Document capabilities honestly. Do not describe unsigned packages, the fake
  host, or high-trust code as a security boundary.
