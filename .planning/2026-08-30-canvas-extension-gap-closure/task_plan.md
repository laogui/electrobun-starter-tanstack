# Task Plan: Canvas Extension Gap Closure

## Goal

Close the four RFC-1 acceptance gaps so migrated extension nodes regain host-generic menus, type-specific actions, AI context, library detach, and DetailSurface-based focused view.

## Next Step

Implement T6: centralize search-kind maps, update RFC, move the gap-closure plan out of In Progress.

## Current Phase

Phase 7: T6 docs and search-kind cleanup

## Phases

### Phase 1: T0 behavior matrix menu baseline

- [x] Add context-menu action column using the legacy builder inventory
- [x] Mark host-generic vs type-specific actions
- **Status:** complete

### Phase 2: T1 host-generic context menu

- [x] Add `CanvasTypeInteractions` to `BuiltinCanvasType`
- [x] Assemble extension menus from registry declarations
- [x] Cycle color through instance `updateState` (instance undo)
- [x] Render tag chips in `ExtensionHostShell`
- [x] Declare color + tags on link/image/file/recording
- **Status:** complete

### Phase 3: T2 type-specific menu actions

- [x] Add `menuActions` and restore link/image/file/recording actions
- **Status:** complete

### Phase 4: T3 AI context from presentation

- [x] Include extension nodes in `buildAIContext`
- **Status:** complete

### Phase 5: T4 move-to-library

- [x] Honor `canDetach` for extension nodes
- **Status:** complete

### Phase 6: T5 FocusedView via DetailSurface

- [x] Route extension focused view through DetailSurface
- **Status:** complete

### Phase 7: T6 docs and search-kind cleanup

- [ ] Centralize search kind maps, update RFC, move this plan out of In Progress
- **Status:** pending

## Key Questions

1. Color writes instance state, not node data — confirmed in the plan.
2. Tags live in the node-metadata sidecar keyed by nodeId — confirmed.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Extract `listHostGenericMenuActions` as a pure helper | ContextMenu tests and T2 insertion stay declaration-driven |
| Skip `changeNodeColor` for `extension` nodes | Color belongs in instance history |
| Show detach only when `canDetach` is declared | T1 ships the protocol; T4 enables it on types |
| Type actions insert after Focus, before Copy | Matches T0 matrix / legacy builders, not after Delete |
| Rename is `updateState` of `title` plus `canvas.requestTitleEdit` | Old handler only set `renamingNodeId`; no `assets.rename` API |
| `edit-url` opens detail via `host.canvas.openDetail` | Old handler was the same as Focus; create-flow URL popover would spawn a new node |
| AI context for extensions is presentation only | RFC §14.2; do not read instance state. Missing/corrupt records are skipped; disabled types still summarize from last presentation |
| Image `canDetach` is true even though the old image menu omitted it | Aligns with the old `detachNoteFromCanvas` guard (`card`/`image`/`link`/`asset`); recording stays false |
| `persistableExtensionNode` keeps `detached` | Migration of already-library notes must not drop the flag; live save already round-trips unknown fields |
| FocusedView chrome uses `surface.detailLayout` | Host stays type-id-free; image = lightbox, file = wide, link = default contained panel |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| Missing hostMenu/registry imports after partial edits | 1 | Re-applied imports and re-ran tests |
| `void` on `updateState` failed ultracite | 1 | Use `.catch(() => undefined)` |
