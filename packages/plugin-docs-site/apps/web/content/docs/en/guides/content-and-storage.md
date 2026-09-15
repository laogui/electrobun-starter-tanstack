---
title: "Notes, storage and events"
description: "Read and write Notes in revision-checked, undoable transactions; keep JSON state per app or workspace; react to content, selection and workspace events."
section: guides
order: 50
---

## Note snapshots

`app.content` works on persisted Note projections, not live editor blocks:

```ts
interface NoteContentSnapshot {
  id: string;
  kind: 'note';
  source: 'sidecar' | 'markdown';
  revision: number | null; // null = legacy Markdown, read-only here
  title: string;
  color: string;
  text: string;            // plain text, paragraphs separated by newlines
}
```

Read with `app.content.get(id)`, `getMany(ids)` (up to 500) and `query({ text, after, limit })`, which pages with `nextCursor`.

## Create, update, undo

```js
const created = await app.content.createMany(
  [{ title: 'Question', text: 'What changed?\nWhy?' }, { title: 'Follow-up', color: '#bfdbfe' }],
  { label: 'Create research notes', operationId: 'research-page-17' }
);

const result = await app.content.updateMany(
  [{ id, expectedRevision: revision, changes: { title: 'Renamed' } }],
  { label: 'Rename note', operationId: 'rename-42' }
);

await app.content.undo(result.operationId);
```

- Batches contain **1–100 items** and are atomic: all or nothing.
- `expectedRevision` is compare-and-swap. A Note edited in the meantime fails that batch instead of overwriting; the user's open editor shows a conflict view with "keep mine" / "use saved" choices.
- `operationId` makes retries safe: retrying an uncertain request with the same ID and identical input returns the original result without duplicating work. Different input with the same ID is rejected.
- Every batch is persisted with a batch ID. `undo`/`redo` work across restarts. Undo refuses to delete created Notes that were since edited, placed on a canvas or referenced, so nothing disappears under the user.
- Committed batches also join the workspace's ordered history with native canvas changes; the normal Undo shortcut reverts them in order while the canvas view is active. Focused editors keep their own local history.
- `text` is plain text. It is not Markdown and not a lossless round trip for rich content.

New Notes are **detached**: they appear in the library and search but are not placed on a canvas unless the user places them (importers offer single-batch placement).

## Selection

`app.selection.get()` returns the unique persisted Notes behind the current canvas selection; `getPlacements()` exposes placement IDs including widgets and extensions; `getSnapshot()`/`subscribe()` give a cached, lifecycle-bound snapshot with `loading`/`ready`/`error` states. Selection covers Notes explicitly selected in the active canvas; containers are not expanded.

### Placements without content

Core node types that have no backing content record — folders, groups, images and Topics — appear in `getPlacements()` with `content: null`, and never in `get()` or `getSnapshot().items`. A mixed selection is therefore normal:

```js
app.selection.getPlacements().items;
// [
//   { id: 'topic-1', content: null },
//   { id: 'note-placement', content: { id: 'note-1', kind: 'note' } },
// ]
```

That array is the placement view, not the return value of `app.selection.get()`. Read the Notes with `get()` and treat a null-content placement as "selected but not readable through this API" instead of silently dropping it — a command that reports "2 selected, 1 note updated" is clearer to the user than one that pretends the Topic was not there.

Two consequences worth designing for:

- **Containers and Topics do not expand.** Selecting a folder or group does not select its contents, and selecting a Topic does not select its subtree: one selected Topic is exactly one placement, however many descendants it has. There is no SDK call that walks a Topic branch.
- **`app.content` is Notes only.** Widgets, extension instances and Topics are never returned as `NoteContentSnapshot`, and `app.content.updateMany()` cannot be pointed at them. Editing a Topic does not emit a `content.changed` event describing a Note; only `selection.changed` still applies when selection membership or the active view changes.

## Storage

```js
const count = (await app.storage.workspace.get('open-count')) ?? 0;
await app.storage.workspace.set('open-count', Number(count) + 1);
const keys = await app.storage.app.list('prefs:');
```

- `storage.app` is shared by this plugin across workspaces; `storage.workspace` is per plugin and workspace and never leaks between workspaces.
- Values are JSON only. Data survives disable, reload and uninstall; only an explicit permanent-delete removes it.
- There is **no versioned migration API for storage**. Store a version inside your values and handle old shapes yourself.

## Events and tasks

```js
app.events.on('content.changed', ({ ids, operation, noteChanges }) => { /* ... */ }, { signal: app.signal });
app.events.on('selection.changed', ({ placementIds, viewId }) => { /* ... */ });
app.events.on('workspace.activated', ({ workspaceId }) => { /* ... */ });

app.tasks.schedule('refresh', { every: 60_000 }, () => refresh(app));
app.tasks.schedule('reminder', { at: new Date(Date.now() + 3_600_000) }, () => notify(app));
```

Events fire for host, plugin and editor changes in the current workspace. Tasks run only while the workspace activation is alive; missed ticks are not replayed, and everything stops on disable or reload.

## Files (outside importers)

`app.files.pick`, `pickDirectory`, `readText`, `readBytes`, `stream`, `list` and `write` are available to any plugin. Handles are opaque, bound to the current activation and process, and cannot be persisted. Writes go to a host temporary file and are renamed into a directory the user selected; limits are 16 MiB collected reads, 256 MiB streams and writes, eight concurrent writes. Release handles with `app.files.release(...)` when a workflow finishes.
