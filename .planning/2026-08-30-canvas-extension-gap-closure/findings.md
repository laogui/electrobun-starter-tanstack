# Findings & Decisions

## Requirements

- Restore host-generic context menu for migrated extension nodes (focus, color, tags, copy, lock, delete).
- Color must go through `host.instance.updateState` with `history: 'record'`.
- Tags stay in the node-metadata sidecar; only the edit entry and chip display are missing.
- Surface/builtin code must not import canvasStore.

## Research Findings

- `ContextMenu` maps `extension` to `getWidgetItems` (copy/lock/delete only).
- `LinkState` / `ImageState` / `FileState` / `RecordingState` already have `color`.
- `useNodeTagEditing` indexes metadata by `noteId` or `nodeId`; migration keeps node ids.
- `isFocusableNode` already treats extension `openBehavior === 'detail'` as focusable.
- Folder-child `change-color` currently writes child data; extension children must use instance state instead.
- `canvasStore.changeNodeColor` would otherwise write `color` onto extension node data.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| `interactions` is optional; `assertComplete` does not require it | Missing block means no extra menu items |
| T1 does not set `canDetach` on types | Avoid a visible menu item whose handler still no-ops until T4 |
| Host shell renders chips | Surfaces must not own sidecar tag UI |
| Toast only when the type declares color but apply fails | Menu should not appear without `color`; cards also have no toast on success |
| Tag chip `isDark` comes from instance fill, then `html.dark` | Chips overlay the pastel fill, not the shell `dark:bg-neutral-900` |
| `HostGenericMenuInteractions` uses presence-only `color?: unknown` | `get`/`set` are contravariant in `TState` |
| Type menu items insert after Focus | Matches legacy builders / T0 matrix |
| Rename writes `state.title` via instance history; overlay lives in host shell | Old `setRenamingNodeId` targeted ImageNode/AssetNode, which extensions do not render |
| `edit-url` calls `host.canvas.openDetail` | Same as the legacy handler; URL create popover is create-only |
| `assets.reveal` wraps existing `rpcRevealAttachment` | Asset ids are workspace-relative attachment paths |
| Extension AI context is `presentation.title` + `plainText` | RFC §14.2; `aiPanelStore` does not extract context — `runAISummarize` and the toolbar pass instance records |
| Keep dual-read detach for card/image/link/asset | Unmigrated canvases still use old node types |
| Preserve `detached` in `persistableExtensionNode` | Otherwise migrating a library link/asset would put it back on the canvas |
| `surface.detailLayout` is host chrome, not protocol | Lightbox vs wide vs contained; FocusedView must not import `*_CANVAS_TYPE_ID` |
| `ExtensionHostShell` `surface="detail"` drops node chrome | Handles, resize, tags, and rename belong on the canvas card |
