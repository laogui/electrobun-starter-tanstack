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
- `updateMany(updates, { label, operationId?, signal? })` accepts 1–100 **unique note IDs** and returns `{ operationId, items, changed }`. Every update requires `expectedRevision` and a nonempty `changes` containing only `title` (up to 256 characters) and/or `color` (up to 64 characters). Blocks, previews, timestamps other than `updatedAt`, and unknown sidecar fields are retained.
- All revisions are checked before any batch content is written. A conflict fails the whole batch. A no-op retains its revision and returns `changed: false`; an entirely no-op batch has no undo entry. Other notes and unsupported fields cannot be silently skipped.

### Recovery and retries

The Bun host serializes editor, manifest metadata and plugin note read/check/write operations through a workspace queue. A plugin batch first records an intent containing exact before/after files plus its history update, then completes those writes. SDK reads and normal note writes recover a pending intent before proceeding. Recovery rolls the recorded transaction **forward**, not backward. If a file matches neither recorded version, it fails closed with `recovery-conflict` and preserves the original intent and external file for recovery; it never overwrites an independent edit to make recovery appear successful.

This provides process-interruption recovery for host-managed operations, not a filesystem snapshot for external readers, cross-process arbitration, or a guarantee against arbitrary direct file edits. Power-loss/fsync fault testing is not claimed. The intent is limited to 32 MiB; operation receipts/history to 8 MiB. Oversized operations are rejected. History is not automatically pruned, and a full history reports `history-limit` before new content writes; automatic history archival remains future work.

Every mutation accepts an optional caller-generated `operationId` (1–128 ASCII letters/digits/underscore/hyphen). Use the **same ID and identical input** to retry an uncertain result. Reuse with different input fails with `operation-mismatch`. The receipt survives restart and also records no-ops. A receipt is the original result, not a fresh snapshot: replaying an update after it has been undone returns the original receipt without applying it again. Read the note to inspect its current state.

Server and transport errors expose `code` and, for mutations, `operationId`. Important codes include `revision-conflict`, `commit-pending`, `recovery-conflict`, `operation-mismatch`, `workspace-inactive`, `unsupported-content`, `corrupt-content`, `history-missing`, `history-state`, and `history-limit`. On `commit-pending`, retry the same request ID after the I/O problem is resolved; do not generate another operation as a substitute. Cancellation/timeout does not undo a committed intent. Calls bind to both the activation signal and any caller signal, with a 10-second transport deadline.

### Undo, projections and editor drafts

`undo(batchId, options?)` and `redo(batchId, options?)` address the **original update batch**, scoped to this plugin and workspace. Their optional `operationId` identifies the undo/redo request for retry, not the target batch. Each successful reversal writes fresh increasing revisions. If any affected note has changed since that history state, the whole reversal conflicts rather than partially succeeding or restoring an old revision.

These are explicit SDK operations. Plugins should expose commands for them; the current native/canvas Ctrl/Cmd+Z dispatcher is not a unified plugin-history timeline. Closing/reopening a plugin does not erase its persisted history.

`content.changed` may now carry `noteChanges: [{ id, before, after, metadataOnly }]`, with title/color/revision in `before` and `after`. A committed batch emits one such notification after its files/history are complete. Host-owned reconciliation updates duplicate placements, folders and focused metadata without remounting the editor or touching a dirty body. A matching metadata-only transition rebases the editor's private revision/frontmatter; genuine body changes, missing revision continuity and conflicting local title drafts fail closed instead of guessing. Loading an editor pairs its canonical metadata with the loaded revision. Stale manifest metadata cannot overwrite a newer committed note.

Canvas layout snapshots are still separate history. Restoring an old snapshot can show stale metadata; its stale revision prevents persisting it over current content. Reopening the note loads canonical metadata. A unified ordered history and richer conflict-resolution UI remain T2 work.

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

T1 covers the command/panel lifecycle. T2 now includes A4, note metadata transactions, note selection and the selection React hooks above. Content creation, body mutation, non-note content snapshots, custom cards, unified undo history and further business hooks remain T2 work. Complete file workflows are T3. The earlier T0 `files`/`net` experiment is not a public API here. Signed updates and startup safe mode remain T4. There is no Bun backend entry, per-capability approval, or dual v1 runtime.

The source package can be copied, packed, and installed locally without the GhostBoard repository. No npm publication is implied by its presence in the repository.
