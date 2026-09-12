# @ghostboard/sdk 0.1

The trusted GhostBoard SDK for commands, panels, storage, events, tasks, revision-checked note metadata transactions, and note selection with React hooks. Plugins execute in the host renderer's JavaScript realm. This package is not a sandbox or a permission system.

## Runtime and types

A plugin imports `@ghostboard/sdk` normally. GhostBoard's initial HTML import map resolves it to the host's stable module, so a plain JavaScript plugin needs no build or dependency install. This package supplies the same ESM helper and standalone TypeScript declarations for author tooling. It contains no host store imports.

React panels use the host's **React / ReactDOM 19.2.x**. A bundler must externalize `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `@ghostboard/sdk`, and `@ghostboard/sdk/react`; other dependencies belong in the plugin's build. The package has optional React peers so a DOM-only JavaScript author does not have to use React.

## Minimal plugin

`manifest.json`:

```json
{
  "manifestVersion": 2,
  "id": "example.hello",
  "name": "Hello",
  "version": "0.1.0",
  "engines": { "ghostboard": ">=1.0.0 <2.0.0" },
  "entrypoints": { "app": "app.js" },
  "capabilities": []
}
```

`app.js`:

```js
import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  setup(app) {
    app.panels.register({
      id: 'hello',
      title: 'Hello',
      mount(element) {
        element.textContent = 'Hello GhostBoard';
        return () => element.replaceChildren();
      },
    });
    app.commands.register({
      id: 'hello',
      title: 'Open Hello',
      run: () => app.panels.open('hello'),
    });
  },
});
```

Connect the directory through GhostBoard Settings → Plugins, review it, and confirm that you trust it before enabling. While enabled, changes automatically replace the old module generation and registrations. The plugin menu opens commands and panels, reloads the entire relative module graph, and displays runtime errors with source locations. Old v1 packages are never implicitly upgraded.

## T1 API

See `index.d.ts` for signatures.

- `definePlugin({ setup(app) })`: `setup` may be async and may return a disposer. Prefer side effects inside setup, not module top level.
- `app.pluginId`, `app.workspaceId`: fixed identity for this activation. Workspace identity is not a file path or access boundary. GhostBoard currently changes workspaces across an app restart.
- `app.generation`: per-plugin numeric activation-attempt counter for this renderer lifetime, including failed candidates. It is distinct from the opaque module-URL generation.
- `app.signal`: aborts when this instance retires, fails, or is cancelled. An attempted reload does **not** abort the running instance unless the candidate setup succeeds.
- `app.commands.register({ id, title, shortcut?, enabled?, run })`: registration is scoped to this plugin. Menu and shortcut use the same command and recheck `enabled` before running. `Mod` means Command on macOS and Control elsewhere. Editing controls, composition, repeat events, and reserved host shortcuts take priority.
- `app.panels.register({ id, title, component })` for React, **or** `{ id, title, mount(element) }` for DOM. A DOM mount may return a disposer. Each React view gets its own root; host contexts are not inherited.
- `app.panels.open(id)` / `close(id)`: closing removes just that view. Reopening creates a new root; the command stays active.
- `app.onCleanup(disposer)`: register an owned timer, listener, connection, or other resource for cleanup. The returned disposer can also run it early, once.
- `app.workers.track(worker)`: track an already-created Web Worker for termination on disable/reload. Use normal browser rules when constructing workers; cross-origin module loading does not make arbitrary cross-origin Worker URLs valid.

Commands/panels return disposers and are also automatically cleaned on failed setup, disable, reload, and workspace exit. Late async setup cannot revive a disabled activation. Async cleanup has a bounded wait with diagnostics; arbitrary plugin side effects cannot all be reversed. Keep DOM/CSS changes inside the supplied panel mount point. A React error boundary does not stop infinite loops or protect against malicious code.

## Reload and cleanup (A2)

A reload first imports a fresh immutable module graph and runs candidate `setup`. Commands, shortcuts, panel registrations and panel open/close requests remain private until setup succeeds. The running instance keeps its original context, signal, commands and open views during preparation.

If import or setup fails, only the candidate is aborted and cleaned. The old instance is **not** aborted, unloaded or re-created: its existing React state stays intact and lazy relative imports still resolve to its old graph. Failed candidates are retried only after another source edit or manual reload, not on every poll.

On success, the host aborts the old signal, removes old registrations, waits for their cleanup, then publishes the candidate and opens its requested panels. Disposers are awaited in reverse registration order, at most once per registration, including those returned by setup. Early disposal is not repeated. Each async disposer has a two-second wait limit by default; errors and timeouts produce diagnostics without stopping other cleanup. A timeout cannot forcibly stop arbitrary JavaScript.

Both generations' JavaScript can run during preparation. Only managed registrations are staged: direct DOM/global mutation, networking, file writes, or workers you create yourself are not transactional. Keep setup focused on registration, register cleanup for resources, and pass `app.signal` to cancellable browser APIs. Disabling, workspace exit or superseding a pending candidate aborts it and prevents late setup results from publishing.

## Theme and component ownership (A1)

The stable shared surface is React, `@ghostboard/sdk` and `@ghostboard/sdk/react`, and these **frozen SDK 0.1 CSS variable names and roles**. Values are not frozen: they follow the host theme, including `.dark`, and may improve with host releases.

| Variable | Role |
| --- | --- |
| `--gb-background` | Recessed page/input background |
| `--gb-foreground` | Primary text |
| `--gb-surface` | Raised panel background |
| `--gb-muted` | Muted controls and surfaces |
| `--gb-muted-foreground` | Secondary text |
| `--gb-border` | Control and panel boundaries |
| `--gb-accent` | Primary action fill |
| `--gb-accent-foreground` | Text on the primary action fill |
| `--gb-accent-soft` | Subtle accent background |
| `--gb-danger` | Destructive/error text |
| `--gb-focus-ring` | Keyboard-focus outline color |
| `--gb-radius` | Control/panel corner radius |
| `--gb-font-sans` | UI font stack |
| `--gb-font-mono` | Code font stack |
| `--gb-shadow` | Raised surface shadow |

Use complete CSS values, for example `color: var(--gb-foreground)` and `border: 1px solid var(--gb-border)`. These variables are inherited by plugin panels. Host tokens without the `--gb-` prefix are private.

Buttons, inputs, menus and dialogs are **not** exported through the SDK or import map. Both author templates vendor editable Button, Input and Surface source (`ui.js` or `src/components/ui.tsx`), using these tokens and no host component imports. The author owns this code; copying or changing it does not create a dependency on the host's component props. No experimental host component is exposed in T1.

## Bundler-global fallback (A3)

The initial HTML import map remains the recommended shared-dependency mechanism and the **only supported no-build JavaScript path**. For built plugins, GhostBoard also initializes this shallow-frozen object before any plugin module executes:

```ts
globalThis.__ghostboardPluginRuntime = Object.freeze({
  react,          // import-map module namespace: react
  reactDom,       // react-dom
  reactDomClient, // react-dom/client
  jsxRuntime,     // react/jsx-runtime
  sdk,            // @ghostboard/sdk
  sdkReact,       // @ghostboard/sdk/react; added in the T2 selection slice
  version,        // shared SDK package version, currently "0.1.0"
});
```

This is a **bundler shim target**, not an additional SDK. Only these seven fields are public; React internals, host stores and private components are not. The module fields are the exact import-map facade namespaces, including their default/named export identities. The container is frozen, not React itself or every object React exports. `version` is the SDK version, not the React version or a lifecycle generation.

The React author template defaults to bare externals. Its optional `vite.shim.config.ts` is a complete buildable example, selected with `bun run build:shim`: virtual ESM modules read the six namespaces from the global object, preserving each exported value without bundling another React or SDK implementation. Generated adapter namespaces are distinct from the native host namespaces; the exported functions/default objects retain identity. Neither config imports host-private files. A shim build is useful when import-map support is unreliable; it still requires the GhostBoard host and is not a standalone browser app. It includes the T2 selection hooks through `sdkReact`.

## T2 first slice: storage, events and tasks (A4)

These services are available in `PluginContext`; they do not imply completion of the content or custom-card APIs.

```js
export default definePlugin({
  async setup(app) {
    const preferences = await app.storage.app.get('preferences');
    const lastRun = await app.storage.workspace.get('last-run');

    app.events.on('content.changed', ({ kind, ids, operation }) => {
      console.log(kind, ids, operation);
    });
    app.tasks.schedule('refresh', { every: 60_000 }, async () => {
      await app.storage.workspace.set('last-run', new Date().toISOString());
    });
  },
});
```

### Persistent KV

- `app.storage.app` is shared across workspaces for this plugin; `app.storage.workspace` belongs to its fixed activation workspace. Both provide `get(key, options?)`, `set(key, value, options?)`, `delete(key, options?)`, and `list(prefix?, options?)`. `get` returns `undefined` for a missing key, distinct from stored `null`; `list` returns sorted keys, not values. Deleting an absent key succeeds.
- Values are detached JSON: finite numbers, strings, booleans, null, arrays and plain objects. No undefined, cycles, BigInt, dates, functions, class instances or sparse arrays. Keys contain 1–1024 characters and are dictionary keys, never paths. Limit: 1 MiB per JSON value, 64 nesting levels, 4 MiB per plugin/scope file.
- The Bun host persists outside installed code: `<app-data>/plugin-data/<plugin-id>/kv.json` and `<workspace>/.ghostboard/plugin-data/<plugin-id>/kv.json`. Disable/reload does not delete KV. The single host process serializes operations per file and commits via atomic rename. Corrupt files are reported, not silently reset or overwritten. This is not a multi-key transaction or cross-process database.
- All operations bind to `app.signal`; `{ signal }` combines a caller signal with it. The transport has a 10-second deadline and reports `AbortError` on cancellation/timeout. A successful write has reached the host's atomic file-write boundary. Cancellation or a lost response **does not roll back a committed write**; query the key again to settle an uncertain outcome. SDK calls during candidate setup are real reads/writes, not staged or transactional.

### Host events

`app.events.on(name, listener, { signal }?)` returns an owned disposer. Subscriptions start receiving events only after the activation is published. They stop on early disposal, caller abort, disable, successful replacement or workspace exit. Failed candidates never receive events; the old subscriptions remain active. Listener failures become plugin diagnostics and do not interrupt other listeners; payloads are copied for each listener.

| Name | Payload and meaning |
| --- | --- |
| `content.changed` | `{ workspaceId, kind: 'note' \| 'widget' \| 'extension', ids, operation: 'upsert' \| 'delete' }`. Bun pushes invalidations after successful persisted note, legacy-widget and extension-instance writes/deletions, including their save-based undo/redo paths. IDs identify content records, not canvas placements. |
| `selection.changed` | `{ workspaceId, viewId, placementIds }`. Active canvas selection membership or view changed; `viewId` is null while the canvas is unhydrated. IDs are placement IDs, not deduplicated content IDs. |
| `workspace.activated` | `{ workspaceId }`. Delivered once to subscriptions registered during setup when **this activation** is published, including a successful reload/re-enable. Late subscriptions do not replay it. |

These are live invalidations, not a durable event log or a transaction feed. Repeated saves may emit repeated invalidations; Markdown and sidecar changes may invalidate the same note separately. There is no replay on reconnect or external filesystem watcher. The note metadata slice below adds optional `noteChanges` with title/color/revision transitions, but events do not contain full content snapshots. Canvas layout, tags and attachments are not content-record events. Note queries and note-selection React hooks are available below.

### In-process tasks

`app.tasks.schedule(id, { every: milliseconds } | { at: Date }, callback)` returns an owned disposer. IDs must be unique within the activation, intervals must be positive safe-integer milliseconds, and dates must be valid.

- Timers start only after successful publication, never during candidate setup. A failed reload leaves old tasks running; success retires old tasks before starting new ones. An absolute date already past at publication is skipped.
- Schedules exist only in memory while the plugin and workspace are active. Restart does not recover schedules or replay missed runs; setup must register them again. Intervals skip missed periods without a catch-up burst, and skip ticks while the same callback is still running. An already-running callback cannot be forcibly cancelled; respect `app.signal`.
- Disable, workspace exit and disposal stop timers. Callback failures appear in diagnostics. Long absolute delays are split to avoid the browser's 32-bit timer overflow. There is no cron syntax, OS background service, or guarantee of precise timing while the app is suspended.

## T2 second slice: note metadata transactions

`app.content` currently addresses **notes only**. Sidecar-backed notes support title/color mutations; legacy Markdown notes can be queried but have `revision: null` and cannot be mutated through this API. Widgets, extension instances, rich-document writes and content creation are not covered by this slice.

```js
const { items, nextCursor } = await app.content.query({ text: 'project', limit: 100 });
const writable = items.filter((item) => item.revision !== null);
if (writable.length) {
  const batch = await app.content.updateMany(
    writable.map((item) => ({
      id: item.id,
      expectedRevision: item.revision,
      changes: { title: item.title.trim() },
    })),
    { label: 'Trim project note titles' },
  );
  if (batch.changed) {
    await app.content.undo(batch.operationId);
    await app.content.redo(batch.operationId);
  }
}
```

### Reads and writes

- `get(id, options?)` returns `{ id, kind: 'note', title, color, text, source, revision }` or `null` if absent. `text` is searchable text extracted from BlockNote blocks, or the legacy Markdown body; it is not a lossless rich-document export. Corrupt content produces an explicit error rather than an empty replacement.
- `getMany(ids, options?)` reads up to 500 IDs in one workspace-queued operation. Results retain input order, including duplicate IDs and `null` slots for missing notes. An empty input returns an empty array. Corruption fails the request rather than returning partial success. This is the read path used for selection snapshots, not a series of independently interleaved `get` calls.
- `query({ text?, after?, limit? }?, options?)` searches title/text case-insensitively and returns `{ items, nextCursor }`, ordered by note ID. Default limit 100, range 1–500. Pass `nextCursor` as `after` for another page. Each request reads under the host workspace queue, but pages do not form a frozen multi-request snapshot.
- `updateMany(updates, { label, operationId?, signal? })` accepts 1–100 **unique note IDs** and returns `{ operationId, items, changed }`. Every update requires `expectedRevision` and a nonempty `changes` containing `title` (up to 256 characters), `color` (up to 64 characters), and/or `text` (up to 256 KiB UTF-8). Without `text`, blocks and previews are retained. Timestamps other than `updatedAt` and unknown sidecar fields are retained.
- All revisions are checked before any batch content is written. A conflict fails the whole batch. A no-op retains its revision and returns `changed: false`; an entirely no-op batch has no undo entry. Other notes and unsupported fields cannot be silently skipped.

### Recovery and retries

The Bun host serializes editor, manifest metadata and plugin note read/check/write operations through a workspace queue. A plugin batch first records an intent containing exact before/after files plus its history update, then completes those writes. SDK reads and normal note writes recover a pending intent before proceeding. Recovery rolls the recorded transaction **forward**, not backward. If a file matches neither recorded version, it fails closed with `recovery-conflict` and preserves the original intent and external file for recovery; it never overwrites an independent edit to make recovery appear successful.

This provides process-interruption recovery for host-managed operations, not a filesystem snapshot for external readers, cross-process arbitration, or a guarantee against arbitrary direct file edits. Power-loss/fsync fault testing is not claimed. The intent is limited to 32 MiB; operation receipts/history to 8 MiB. Oversized operations are rejected. History is not automatically pruned, and a full history reports `history-limit` before new content writes; automatic history archival remains future work.

Every mutation accepts an optional caller-generated `operationId` (1–128 ASCII letters/digits/underscore/hyphen). Use the **same ID and identical input** to retry an uncertain result. Reuse with different input fails with `operation-mismatch`. The receipt survives restart and also records no-ops. A receipt is the original result, not a fresh snapshot: replaying an update after it has been undone returns the original receipt without applying it again. Read the note to inspect its current state.

Server and transport errors expose `code` and, for mutations, `operationId`. Important codes include `revision-conflict`, `commit-pending`, `recovery-conflict`, `operation-mismatch`, `workspace-inactive`, `unsupported-content`, `corrupt-content`, `history-missing`, `history-state`, and `history-limit`. On `commit-pending`, retry the same request ID after the I/O problem is resolved; do not generate another operation as a substitute. Cancellation/timeout does not undo a committed intent. Calls bind to both the activation signal and any caller signal, with a 10-second transport deadline.

### Undo, projections and editor drafts

`undo(batchId, options?)` and `redo(batchId, options?)` address the **original update batch**, scoped to this plugin and workspace. Their optional `operationId` identifies the undo/redo request for retry, not the target batch. Each successful reversal writes fresh increasing revisions. If any affected note has changed since that history state, the whole reversal conflicts rather than partially succeeding or restoring an old revision.

These remain explicit, durable SDK operations, and plugins may expose commands for them. In an active canvas session, the host also records each changed plugin note batch after its commit notification into one ordered timeline with canvas snapshots. Canvas-level Ctrl/Cmd+Z and the application Edit menu reverse the newest entry in that mixed timeline. A focused BlockNote editor, input, widget, or extension card keeps its existing local undo owner instead of consuming an unrelated canvas/plugin entry.

The mixed cursor is renderer-memory state scoped to the active workspace and canvas view. It clears on view/workspace changes, disconnect, full canvas reset, and application restart because canvas snapshots are not durable. The original plugin batch remains explicitly addressable through `undo(batchId)` / `redo(batchId)` after those boundaries. A failed or conflicting plugin reversal leaves the cursor stationary and reports a visible native-history failure. A new changed entry abandons the mixed redo branch. An explicit SDK reversal follows the cursor only when it matches the expected top entry; a source-targeted jump to another batch clears the mixed cursor rather than inventing an order.

`content.changed` may now carry `noteChanges: [{ id, before, after, metadataOnly }]`, with title/color/revision in `before` and `after`. A committed batch emits one such notification after its files/history are complete. Host-owned reconciliation updates duplicate placements, folders and focused metadata without remounting the editor or touching a dirty body. A matching metadata-only transition rebases the editor's private revision/frontmatter; genuine body changes, missing revision continuity and conflicting local title drafts fail closed instead of guessing. Loading an editor pairs its canonical metadata with the loaded revision. Stale manifest metadata cannot overwrite a newer committed note.

Canvas snapshots and durable plugin batches retain different storage lifetimes even though the active-session native router orders them together. Restoring an old canvas snapshot can still show stale metadata; its stale revision prevents persisting it over current content, and reopening the note loads canonical metadata. The focused editor conflict UI described below resolves local-draft conflicts separately from native mixed-history failures.

## T2 third slice: note selection and React hooks

### Snapshot and placement APIs

`app.selection.get({ signal }?)` captures the selected placement membership **at invocation**, deduplicates its note IDs, then reads persisted notes together through `content.getMany`. It returns a frozen array of detached, frozen `NoteContentSnapshot` values ordered by note ID. Selection changes while the read is pending do not retarget that call. The note data/revisions are captured at the host read, not at the earlier click. Use `expectedRevision` when submitting mutations, since later edits may conflict.

The current scope is selected, visible, non-detached nodes in the hydrated active canvas. Selection of a folder or group does **not** recursively select its contents. Focused editors, embedded folder rows, text ranges and other canvases are not additional selection sources. Only persisted notes appear in `get()`: missing references are omitted, legacy Markdown notes remain read-only, and widget/extension snapshots are not yet supported. A corrupt note fails the whole read. More than 500 distinct selected note IDs rejects without truncation; `updateMany` still has a separate 100-note limit.

`app.selection.getPlacements()` is synchronous and returns a frozen `{ viewId, items }`, ordered by placement ID. Each item is `{ id, content }`: the placement ID remains distinct even for duplicate note references. `content` is `{ kind: 'note' | 'widget' | 'extension', id }` where a supported backing identity exists, otherwise `null` (for example folders and images). This method does not read records or verify that the referenced content still exists. Before canvas hydration it returns `{ viewId: null, items: [] }`. In an in-process workspace transition, selection stays empty until the host observes a new hydration cycle rather than relabelling the previous workspace's nodes.

```js
const selected = await app.selection.get();
const writable = selected.filter((item) => item.revision !== null);
if (writable.length > 100) throw new Error('Select at most 100 writable notes');
if (writable.length) {
  await app.content.updateMany(writable.map((item) => ({
    id: item.id,
    expectedRevision: item.revision,
    changes: { title: item.title.trim() },
  })), { label: 'Trim selected titles' });
}
```

### Subscriptions and independent React roots

`app.selection.getSnapshot()` exposes a stable, frozen cached state:

```ts
{
  status: 'loading' | 'ready' | 'error';
  items: readonly NoteContentSnapshot[];
  placements: PlacementSelectionSnapshot;
  error: { code: string; message: string } | null;
}
```

`subscribe(listener)` returns a synchronous unsubscribe function. Subscriptions and background reads start only after activation publication. Candidate setup does not publish a replacement selection stream; a failed candidate leaves the old one intact. Explicit `get()` calls during setup are real reads, like other SDK reads. Selection membership/reference/view changes and host content invalidations for selected notes refresh the cache. Obsolete requests are cancelled and late results ignored. Loading and error states have **empty items**, never the previous selection's content. A subsequent selection change or selected-note invalidation retries a failed cache read; there is no timer retry or external filesystem watcher.

Subscriptions stop at retirement; pending and new `get()` calls reject with `AbortError`. `getPlacements()` and new subscriptions also reject after retirement. `getSnapshot()` then contains empty selection with `activation-inactive`; retired observers are not invoked. Cached snapshot identity stays the same until state changes. Consumers must not mutate any returned state. These subscriptions are synchronous notifications, not async event handlers.

The standalone package now exports `@ghostboard/sdk/react`:

- `useSelection()` returns cached note items; it is empty while loading or failed.
- `useSelectionState()` returns the complete status/items/placements/error state so an empty selection can be distinguished from a failed or pending read.
- `useSelectedPlacements()` returns the cached placement snapshot, including non-note placements.
- `SelectionProvider({ selection, children })` binds a `PluginSelection` for standalone author tests or author-created React roots. Host-managed React panels already receive it; normal plugin authors do not need to install a provider themselves.

All hooks use `useSyncExternalStore`. Each plugin root receives its own SDK-owned provider, not inherited host contexts or a global current-plugin pointer. Hooks outside a provider report a descriptive error. The host and plugin share the same React and SDK React entry in dev and packaged builds; both supplied external-import and optional shim configurations preserve that identity.

```tsx
import { useSelectionState } from '@ghostboard/sdk/react';

function SelectionPanel() {
  const { status, error, items } = useSelectionState();
  if (status === 'loading') return <p>Loading selection…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  return <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>;
}
```

## Stage boundaries

T1 covers the command/panel lifecycle. T2 includes A4, note metadata/body transactions, detached note creation, note selection and React hooks, live clean-editor reconciliation, custom canvas types, focused-editor conflict recovery, and session-level ordered native canvas/plugin note history. T3 now includes the accepted bounded importer/distribution slice, the complete host-mediated file service, explicit segmented imports, and the generic importer configuration described below. A general packaging command and public-HTTPS production evidence remain T3 work. The earlier T0 `files`/`net` experiment is not a public API. Signed updates and startup safe mode remain T4. There is no Bun backend entry, per-capability approval, or dual v1 runtime.

The source package can be copied, packed, and installed locally without the GhostBoard repository. No npm publication is implied by its presence in the repository.

## T3 files: activation-scoped files and directories

`app.files.pick({ accept, multiple?, signal? })` opens the host's native file picker and returns one file by default or up to 16 when `multiple: true`. Cancelling resolves to an empty array. Filters contain a user-facing description and 1–16 simple extensions with a leading dot; extensions are normalized to lowercase. Wildcards, paths and empty filters are rejected before the picker opens.

```js
const [file] = await app.files.pick({
  accept: [{ description: 'CSV files', extensions: ['.csv'] }],
});

if (file) {
  const csv = await app.files.readText(file);
  console.log(file.name, file.size, csv.length);
}
```

Handles expose a `kind` plus display metadata, never the local absolute path. A handle belongs to one plugin activation, workspace and application process. It cannot be reused by another plugin, after reload, after a workspace switch or after restart; there is intentionally no persistent-handle recovery without platform security-bookmark support. Activation and caller abort signals reject operations with `AbortError`; a native dialog already open cannot be programmatically closed by the current Electrobun API, so a late result is ignored and released. `app.files.release(...handles)` invalidates handles early.

`readText` performs fatal UTF-8 decoding and defaults to a 1 MiB collection limit; an explicit `maxBytes` may raise the limit to 16 MiB. `readBytes` collects at most 16 MiB. `stream` reads a selected byte range as sequential authenticated localhost requests of at most 1 MiB each; one stream may cover at most 256 MiB. All three accept `start`, `length`, `signal` and `onProgress`. Select another range for larger files instead of buffering the entire file.

```js
const [file] = await app.files.pick({
  accept: [{ description: 'Binary data', extensions: ['.bin'] }],
});

if (file) {
  const header = await app.files.readBytes(file, { start: 0, length: 64 });
  for await (const chunk of app.files.stream(file, {
    start: 64,
    length: Math.min(file.size - 64, 8 * 1024 * 1024),
    onProgress: ({ loaded, total }) => console.log(loaded, total),
  })) {
    consume(chunk);
  }
}
```

`pickDirectory()` returns one opaque directory handle or `null`. `list(directory, { cursor?, limit? })` returns a name-sorted direct-child page of at most 100 entries; it never recursively walks a directory. Regular files and directories include new activation-owned handles. Symbolic links are visible as `{ kind: 'symlink' }` but deliberately have no handle and cannot be followed.

`write(directory, relativePath, data, options?)` accepts text, Blob/ArrayBuffer/view data or a `ReadableStream<Uint8Array>`. The renderer sends sequential 1 MiB chunks to a temporary file below the user-selected directory and the Bun host renames it into place only after the final acknowledgement. One write is limited to 256 MiB; at most eight writes may be active. `overwrite` defaults to false. Relative paths may create ordinary subdirectories but cannot be absolute, contain `.`/`..`, escape the selected root or traverse symbolic links. `onProgress` reports host-acknowledged bytes; `total` is `0` for a source stream whose size is unknown until completion.

```js
const output = await app.files.pickDirectory();
if (output) {
  const written = await app.files.write(
    output,
    'exports/notes.json',
    JSON.stringify(notes),
    {
      overwrite: false,
      onProgress: ({ loaded, total }) => console.log(loaded, total),
    }
  );
  console.log(written.name, written.size);
}
```

The native picker stays on Electrobun RPC; directory listing and release are bounded control-plane messages. Binary ranges and chunked writes use the existing per-launch bearer-authenticated localhost data plane. The manifest `files` capability remains display metadata, not an enforcement boundary for high-trust code.

Importers follow the same staged activation lifecycle as commands, panels and canvas types. Registration made by a candidate activation is published only after `setup` completes. A failed reload keeps the old importer; successful reload, disable, workspace switch and the returned disposer remove it and abort the activation signal.

```js
app.importers.register({
  id: 'notes-csv',
  title: 'Import notes from CSV',
  accept: [{ description: 'CSV files', extensions: ['.csv'] }],
  async parse(file, { signal }) {
    const csv = await app.files.readText(file, { signal });
    return {
      notes: parseCsvIntoNotes(csv),
      warnings: [],
    };
  },
});
```

When several importers accept the same extension, the Workbench never chooses by registration order: the user first selects the named importer, then opens its picker. Existing importers keep the direct `parse(file, { signal })` flow. A tabular importer can opt into the host-owned field-mapping step with `inspectFields`; the host validates at most 100 unique source fields and maps them to the complete bounded Note surface (`title`, optional `text`, optional `color`). `title` is required and one source field cannot feed two targets.

```js
app.importers.register({
  id: 'mapped-csv',
  title: 'Import mapped CSV',
  accept: [{ description: 'CSV files', extensions: ['.csv'] }],
  async inspectFields(file, { signal }) {
    const csv = await app.files.readText(file, { signal });
    const fields = readHeader(csv);
    return {
      fields,
      suggestedMapping: {
        title: fields.find((field) => field.toLowerCase() === 'title') ?? null,
        text: fields.find((field) => field.toLowerCase() === 'text') ?? null,
        color: fields.find((field) => field.toLowerCase() === 'color') ?? null,
      },
    };
  },
  async parse(file, { mapping, signal }) {
    const csv = await app.files.readText(file, { signal });
    return parseMappedCsv(csv, mapping);
  },
});
```

After preview, the user chooses either library-only detached Notes or a named canvas with grid/vertical placement. Canvas placement is deliberately limited to one atomic batch (at most 100 Notes), uses stable node identities for safe retry, and requires the target canvas to be open and hydrated so the host never overwrites a background manifest without revision protection. Content creation and canvas persistence are separate operations: if canvas saving fails, the Notes remain detached and the same session retries placement without recreating them. Explicit segmented imports remain detached so their existing per-segment retry and conflict-safe rollback semantics do not acquire a false cross-store transaction guarantee.

The selected source handle is an ephemeral import-session asset. It stays valid through inspection, mapping, preview, commit retry, and placement retry, then is explicitly released on cancellation, successful completion, importer disposal, reload, disable, workspace switch, or runtime disposal. This lifecycle does not claim attachment import or durable file handles: importers that directly create workspace side effects outside the SDK remain outside the host transaction.

`parse` returns preview data only. Registration or activation never invokes it, and importer code does not own the eventual workspace commit. The host runtime owns a single ephemeral import session: it selects one file, runs `parse` with a session abort signal, validates and freezes the preview, and cancels the session on reload, disable, workspace switch or importer disposal. Selection and preview do not call `content.createMany`.

Plugin Workbench shows the file, warnings, titles, body summaries and colors before any write. Explicit confirmation submits one atomic `content.createMany` request with a stable operation ID. Confirmation cannot be cancelled or replaced while the request is in flight. A failed or uncertain response retains the same immutable preview and operation ID for retry; a successful receipt or explicit pre-commit cancellation closes the session. The imported Notes remain ordinary workspace content after the plugin is disabled.

For more than 100 notes, the importer must opt into explicit segments. Each segment is one atomic `content.createMany` transaction with 1–100 notes. A result may contain 2–50 segments and 101–5,000 notes total; normalized title, color and body text across the preview is limited to 16 MiB. The host does not silently split the single-batch `notes` form.

```js
const notes = parseLargeCsv(csv);
return {
  segments: Array.from(
    { length: Math.ceil(notes.length / 100) },
    (_, index) => ({ notes: notes.slice(index * 100, (index + 1) * 100) })
  ),
  warnings: [],
};
```

Segment confirmation runs in order and exposes one-based completed ranges in the Workbench. Every range has a deterministic child operation ID. An uncertain response pauses on that range; retry reuses its ID, accepts the persistent receipt if it already committed, then continues with later ranges. This is deliberately not whole-import atomicity: a later failure leaves earlier ranges committed and visible.

After all ranges complete—or after a partial failure—the user can keep the committed notes or request rollback. Rollback visits completed ranges in reverse order and gives each undo its own stable retry ID. A modified, referenced, missing or corrupt note causes that entire range to remain unchanged and visibly conflicted; clean ranges continue rolling back. An uncertain rollback transport error pauses before earlier ranges and can be retried with the same ID. This conflict-safe behavior never restores old imported bytes over later user edits, but its granularity is one explicit segment, not one note. The segmented session and its progress are renderer-session state; normal Note content and per-range history receipts remain durable after the session closes.

## Author testing without GhostBoard (A5)

`@ghostboard/sdk/testing` exports `createFakeHost({ pluginId, workspaceId })`. It returns `{ app, harness }`: pass `app` to plugin `setup`, then use the harness to inspect registrations and trigger behavior.

```js
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';

const fake = createFakeHost({
  pluginId: 'example.csv',
  workspaceId: 'test-workspace',
});
await plugin.setup(fake.app);

const file = fake.harness.files.addText(
  'notes.csv',
  'title,text\nOne,Body',
  { mimeType: 'text/csv' },
);
const preview = await fake.harness.behavior.parseImporter('notes-csv', file);
```

`harness.inspection` exposes the active commands, panels, canvas types, importers, tasks, open panel IDs, cleanup count, generation and signal. `harness.behavior` can run commands/tasks/importers, emit typed host events, replace the selection snapshot and abort the current activation. `harness.lifecycle.reload(factory)` prepares registrations against an isolated candidate: a rejected factory cleans the candidate and retains the old activation; a successful factory swaps generations, aborts/cleans the old activation and returns the new `PluginContext`. `harness.files.addText/queuePick` provide activation-local in-memory handles. Fake content operations use in-memory Notes and stable operation receipts so identical retries deduplicate.

`@ghostboard/sdk/testing/react` exports `renderPanel(definition, { context })` for React component panels. It uses Testing Library and wraps the component with the SDK `SelectionProvider`; install `@testing-library/react` in the author test project when using this subpath. DOM `mount` panels can be tested directly against a jsdom element and are intentionally not accepted by `renderPanel`.

The fake host is a unit-test aid, not an embedded GhostBoard. It does **not** reproduce host layout or CSS, disk persistence or interruption recovery, real RPC/native dialogs, multi-plugin arbitration, package installation, or platform/WebView differences. Use real packaged-app probes for those behaviors. Its fake `undo`/`redo` responses are no-op placeholders; transaction conflict and recovery claims come only from the real host tests.

## T2 fourth slice: explicit plain-text body replacement

`updateMany([{ id, expectedRevision, changes: { text } }], { label })` replaces the entire body of an existing sidecar note with plain paragraphs. CRLF and CR normalize to LF; each line becomes a paragraph, including blank lines. An empty string clears the body to one empty paragraph. This is an explicit replacement: Markdown and HTML are literal text, and existing rich formatting, links, tables and attachments are removed from the new document. Attachment files are not deleted. Do not use `snapshot.text` for a lossless round trip.

```js
const note = await app.content.get(noteId);
if (note?.revision != null) {
  await app.content.updateMany([
    { id: note.id, expectedRevision: note.revision,
      changes: { text: 'First paragraph\nSecond paragraph' } },
  ], { label: 'Replace note body' });
}
```

The same operation can change title/color and body across multiple notes. Revision conflicts reject the whole batch. Use the same operation ID with identical input for uncertain retries; replacement with a fresh operation ID creates fresh paragraph identities and a new revision, even for identical text. Results still contain metadata, not bodies; read with `get`/`getMany` afterward.

The first body mutation upgrades the history file to schema v2; this host reads existing v1 histories, while older hosts reject v2 instead of silently undoing metadata alone. Body history stores original blocks and preview, so undo restores rich content exactly and redo restores the replacement, including after app restart. Previews are regenerated with escaped text. Existing 1 MiB request and 8 MiB history limits also apply; large rich originals can cause `history-limit` before any write. Legacy Markdown remains read-only.

Body notifications have `metadataOnly: false`; SDK selection subscriptions refresh their persisted snapshots. The next slice below adds automatic clean-editor and placement refresh. An unsaved editor keeps its draft and previous revision; an attempted stale save fails instead of overwriting the plugin change. Unified history and conflict-resolution UI remain later T2 work.

## T2 fifth slice: live host body reconciliation

After a committed body event, the host reads the canonical blocks, plain text and derived preview under the workspace queue. It binds the read and any mounted editor to the workspace identity and discards obsolete responses after workspace switches, disconnection or newer changes. Consecutive body/metadata changes retain the original placement baseline while fetching the latest revision.

For clean notes, the host updates duplicate placements, folder children and focused data, and replaces blocks in the existing editor instance. Undo/redo therefore refresh the visible rich document too. This does not trigger an automatic save of the replacement. The canvas `content` cache uses plain text; the canonical rich document remains in the sidecar and the rendered preview is derived from it.

A dirty body, in-flight save, local title/color conflict or title being edited prevents refresh for that note's open editors and placements. Editing is marked dirty before asynchronous Markdown serialization; older serialization results cannot overwrite a newer one. The draft and its revision remain intact, and a stale save enters the focused-editor recovery flow described in the eighth slice below.

This is driven by host content notifications, not external file watching. Failed reads do not replace existing content; a later event can retry. Preview projection requires matching known placement revisions and metadata, so unknown or conflicting cached state is retained rather than guessed. No new public SDK API or unified native/plugin undo timeline is introduced.

## T2 sixth slice: detached note creation

`createMany(notes, { label, operationId?, signal? })` creates 1–100 sidecar-backed notes in one transaction. The host generates opaque note IDs; callers provide a required title and optional color and plain-text body. The body has the same line normalization, literal-text behavior and 256 KiB UTF-8 limit as `updateMany({ changes: { text } })`.

```js
const batch = await app.content.createMany(
  [
    { title: 'Research question', text: 'What changed?\nWhy?' },
    { title: 'Empty follow-up', color: '#bfdbfe' },
  ],
  { label: 'Create research notes', operationId: 'import-page-17' },
);

const [firstId] = batch.items.map((item) => item.id);
```

Created notes start at revision 1 and appear as unlinked notes in the workspace library. This API creates content records; it does not place cards on a canvas. Retrying identical input with the same operation ID returns the original IDs and receipt, including after restart. Different input with that ID fails with `operation-mismatch`.

The original creation batch can be passed to `undo`. A successful creation undo removes every note in the batch and returns `items: []` plus `removedIds`; `redo` recreates the same IDs with increasing revisions. Undo rejects the whole batch if any created note changed, is open or present in the current renderer state, is referenced by an active or trashed canvas, or is mentioned by persisted workspace content. An unreadable reference source also fails closed. Remove saved and live references before undoing creation. An old canvas save cannot recreate an undone `plugin_note_*` record as an empty legacy note.

Creation, its history update and recovery intent share the note workspace queue with editor and canvas saves. The first creation upgrades history to schema v3; older hosts reject it instead of interpreting creation as an ordinary update. Creation/upsert and creation-undo/delete notifications are emitted only after the transaction finishes or recovery completes. The normal 1 MiB request, 8 MiB history and 32 MiB intent limits still apply. History is not pruned automatically.

The live-reference check is a reliability guard for the official SDK path. It does not provide a security boundary against high-trust plugin code, and it does not promise general backlink semantics. Rich-text creation, caller-specified IDs, attachments, canvas placement and a unified native/plugin undo timeline remain outside this slice.

## T2 seventh slice: custom canvas types

`app.canvas.registerType(definition)` contributes a React card type for the lifetime of one plugin activation. Authors provide a plugin-local kebab-case `id`; the host derives and persists the canonical `${pluginId}/${id}` value, so a plugin cannot claim another namespace. Registration is staged with the candidate activation: failed imports or setup keep the exact old card implementation, and a successful reload replaces all types from that plugin as one owner generation.

```js
import { definePlugin } from '@ghostboard/sdk';
import { createElement } from 'react';

function ScoreCard({ context, state, updateState }) {
  return createElement(
    'button',
    {
      disabled: context.readOnly,
      onClick: () => updateState({ ...state, score: state.score + 1 }),
    },
    `${state.label}: ${state.score}`,
  );
}

export default definePlugin({
  setup(app) {
    app.canvas.registerType({
      id: 'score-card',
      title: 'Score card',
      dataVersion: 1,
      createInitialState: () => ({ label: 'Release', score: 0 }),
      validateState: (value) =>
        value !== null && typeof value === 'object' &&
        typeof value.label === 'string' && typeof value.score === 'number',
      summarize: (state) => ({
        title: `${state.label}: ${state.score}`,
        plainText: `${state.label} score ${state.score}`,
      }),
      component: ScoreCard,
      surface: {
        defaultSize: { width: 280, height: 220 },
        minSize: { width: 200, height: 160 },
        openBehavior: 'detail',
      },
    });
  },
});
```

State must be finite JSON data (no functions, dates, maps, cycles, `undefined` or prototype-bearing instances) and the persisted instance envelope is limited to 1 MiB. `createInitialState` is validated during candidate setup. `updateState(nextState, { history: 'record' })` is the default and participates in the focused-card undo/redo path; `ephemeral` updates the live state without recording or scheduling a durable write. Each recorded update rebuilds the plain-text `summarize` projection, increments the persisted revision and emits the existing `content.changed` extension event.

The host sanitizes `title`, `subtitle`, `plainText`, `accessibilityLabel` and `accentColor` from `summarize`. This projection is the searchable, accessible and exportable fallback; it is not arbitrary HTML. Disabling or removing the plugin unregisters executable React code but retains the opaque state, last saved summary and canvas placement. Re-enabling a compatible plugin renders the same instance again.

When `dataVersion` increases, provide synchronous `migrateState(oldState, fromVersion)`. Migration runs lazily when a referenced card is opened with the new type, validates the returned JSON state, rebuilds its summary and writes it with the old revision plus the new monotonic data version. A concurrent edit, invalid result, missing migration, newer on-disk version or failed write leaves the original state/summary intact and shows the compatible-migration fallback. Unvisited canvases are not eagerly migrated; they migrate when loaded. Plugin downgrade is never written over newer state.

This slice supports immediate create-menu cards, shared React rendering, an optional preview component, bounded sizing/resizing and optional detail opening. It does not expose host UI components, arbitrary create flows, plugin menu contributions, rich editor internals, programmatic canvas placement, background migration of unopened canvases, or a single ordered history spanning note transactions and canvas layout.

## T2 eighth slice: focused-editor conflict recovery

When a normal BlockNote save loses a revision race to a plugin content transaction, the host keeps the current title/body draft in the mounted editor, stops automatic retries against the stale revision, and reloads the current canonical record using the editor's bound workspace ID. The persistent alert can expand to compare the local title/plain-text excerpt with the saved title/plain-text excerpt.

`Use saved version` performs no write. It clears the local dirty payload, replaces the mounted blocks/title, adopts the canonical revision and preview, and deliberately refreshes all current canvas/folder/focused projections even when their cached metadata conflicts. `Keep my version` retains the still-current editor payload, rebases it onto the loaded revision, and runs the same revision-checked save. Another concurrent write returns to the conflict alert with the newer saved version rather than overwriting it. If the canonical read fails, the draft remains editable and the alert offers a reload; resolving or explicitly confirming close is required before the in-memory draft is discarded.

This is deterministic choose-one-version recovery, not automatic rich-text merging. It applies to the host BlockNote editor's local draft versus canonical note content; plugin commands still receive machine-readable `revision-conflict` errors for their own batches. The ninth slice below orders committed plugin note batches with canvas snapshots for canvas-level native undo while deliberately retaining BlockNote and focused widget/extension histories as local owners.

## T2 ninth slice: unified native canvas and plugin note history

The host owns a bounded, linear active-session history containing canvas snapshots and committed plugin note batches. Entries are ordered when the renderer observes the durable post-commit notification, not when a plugin request starts. Undo targets the newest applied entry; redo targets the oldest reverted entry; a new canvas or plugin entry discards the abandoned redo branch. No-op plugin batches create no entry.

Canvas-level keyboard shortcuts and the native application menu use this coordinator. Focused rich-text editors and ordinary editable controls continue using browser/editor history. Focused widget and extension cards continue using their per-record history. This ownership rule prevents a local checklist edit or text keystroke from undoing an unrelated canvas/plugin transaction.

Plugin reversal remains atomic and revision checked. While it is pending, repeated native requests are consumed without starting another operation. Success advances the cursor once whether the notification or HTTP response arrives first. A revision conflict, referenced-creation rejection, transport error, or abort leaves both stacks unchanged and displays a failure toast. Explicit batch-addressed SDK undo/redo remains available; when it changes a non-top batch, the host clears the mixed cursor because the previous linear order can no longer be proven.

The mixed timeline is capped at 50 entries and scoped to `(workspaceId, activeViewId)`. It is intentionally not persisted: switching views/workspaces, disconnecting, resetting the canvas, or restarting the application clears it. Durable plugin batch history is not deleted and remains available through the explicit SDK APIs. Persisting a mixed cursor would require durable canvas transaction payloads and is outside this slice.
