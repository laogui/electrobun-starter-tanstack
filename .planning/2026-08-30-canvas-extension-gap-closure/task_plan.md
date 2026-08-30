# Task Plan: Canvas Extension Gap Closure

## Goal

Close the four RFC-1 acceptance gaps so migrated extension nodes regain host-generic menus, type-specific actions, AI context, library detach, and DetailSurface-based focused view.

## Next Step

Implement T3: include extension nodes in AI selection context via presentation.

## Current Phase

Phase 4: T3 AI context from presentation

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

- [ ] Include extension nodes in `buildAIContext`
- **Status:** pending

### Phase 5: T4 move-to-library

- [ ] Honor `canDetach` for extension nodes
- **Status:** pending

### Phase 6: T5 FocusedView via DetailSurface

- [ ] Route extension focused view through DetailSurface
- **Status:** pending

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

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| Missing hostMenu/registry imports after partial edits | 1 | Re-applied imports and re-ran tests |
| `void` on `updateState` failed ultracite | 1 | Use `.catch(() => undefined)` |
