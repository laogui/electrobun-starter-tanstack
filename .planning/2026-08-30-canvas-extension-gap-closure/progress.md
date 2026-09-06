# Progress Log

## Session: 2026-08-30

### Phase 1: T0 behavior matrix menu baseline

- **Status:** complete
- **Started:** 2026-08-30
- Actions taken:
  - Read gap-closure plan, ContextMenu builders, builtin types, instance store
  - Add context-menu column and host vs type legend to the behavior matrix
- Files created/modified:
  - `docs/features/In Progress/canvas-extension-behavior-matrix.md`

### Phase 2: T1 host-generic context menu

- **Status:** complete
- Actions taken:
  - Added `CanvasTypeInteractions` + `colorFieldInteractions`
  - Context menu for `extension` now assembles from registry declarations
  - Color cycles through instance `updateState` and instance undo
  - `ExtensionHostShell` renders tag chips when `supportsTags`
  - link/image/file/recording declare color + tags; productivity widgets unchanged
- Files created/modified:
  - `src/mainview/extensions/types.ts`
  - `src/mainview/extensions/hostMenu.ts`
  - `src/mainview/extensions/hostMenu.test.ts`
  - `src/mainview/extensions/ExtensionHostShell.tsx`
  - `src/mainview/extensions/ExtensionHostShell.test.tsx`
  - `src/mainview/extensions/builtin/**`
  - `src/mainview/components/canvas/ContextMenu.tsx`
  - `src/mainview/hooks/useContextMenu.ts`
  - `src/mainview/store/canvasStore.ts`

### Phase 2b: T1 review nits

- **Status:** complete
- Actions taken:
  - Typed host-menu reads as `HostGenericMenuInteractions`
  - Toast `toast_color_change_failed` when a color-capable type cannot apply
  - Tag chips use instance fill for contrast; fall back to `html.dark`
  - Shell gets `transition-opacity` for tag-filter dimming
- Files created/modified:
  - `src/mainview/extensions/types.ts`
  - `src/mainview/extensions/hostMenu.ts`
  - `src/mainview/extensions/hostMenu.test.ts`
  - `src/mainview/extensions/ExtensionHostShell.tsx`
  - `src/mainview/extensions/ExtensionHostShell.test.tsx`
  - `messages/en.json`
  - `messages/zh.json`

### Phase 3: T2 type-specific menu actions

- **Status:** complete
- Actions taken:
  - Added `menuActions` plus Host API `assets.reveal` and `canvas.requestTitleEdit`
  - Restored link/image/file/recording type actions; inserted after Focus
  - Replace goes through `importFile` + instance `updateState`; rename overlay is host-owned
  - Added `menu_edit_url` i18n
- Files created/modified:
  - `src/shared/extensions/protocol.ts`
  - `src/mainview/extensions/types.ts`
  - `src/mainview/extensions/hostApi.ts`
  - `src/mainview/extensions/hostMenu.ts`
  - `src/mainview/extensions/builtin/**`
  - `src/mainview/extensions/ExtensionHostShell.tsx`
  - `src/mainview/components/canvas/ContextMenu.tsx`
  - `src/mainview/hooks/useContextMenu.ts`
  - `messages/en.json`
  - `messages/zh.json`

### Phase 4: T3 AI context from presentation

- **Status:** complete
- Actions taken:
  - `nodeToAIContext` / selection helpers take instance records and read presentation only
  - Toolbar and `runAISummarize` pass `useExtensionInstanceStore` records
  - Missing/corrupt records skipped; disabled types still summarize from last presentation
- Files created/modified:
  - `src/mainview/lib/ai/buildAIContext.ts`
  - `src/mainview/lib/ai/buildAIContext.test.ts`
  - `src/mainview/lib/ai/runAISummarize.ts`
  - `src/mainview/lib/ai/runAISummarize.test.ts`
  - `src/mainview/components/canvas/SelectionAIToolbar.tsx`
  - `src/mainview/components/canvas/SelectionAIToolbar.test.tsx`

### Phase 5: T4 move-to-library

- **Status:** complete
- Actions taken:
  - Declared `canDetach` on link/image/file; recording stays false
  - `detachNoteFromCanvas` uses `isDetachableNode` (legacy types + extension `canDetach`)
  - Detached sidebar lists extension nodes from presentation and previews via `ExtensionNodeReadOnly`
  - `persistableExtensionNode` keeps `detached`; serialization round-trip covered
- Files created/modified:
  - `src/mainview/lib/canvasNodePredicates.ts`
  - `src/mainview/store/canvasStore.ts`
  - `src/mainview/components/canvas/DetachedNotesSidebar.tsx`
  - `src/mainview/extensions/builtin/web/link.tsx`
  - `src/mainview/extensions/builtin/media/image.tsx`
  - `src/mainview/extensions/builtin/media/file.tsx`
  - `src/shared/extensions/migrateNodes.ts`
  - `docs/features/In Progress/canvas-extension-behavior-matrix.md`
  - `docs/features/In Progress/canvas-extension-gap-closure.md`

### Phase 6: T5 FocusedView via DetailSurface

- **Status:** complete
- Actions taken:
  - Removed `IMAGE_CANVAS_TYPE_ID` / `FILE_CANVAS_TYPE_ID` from FocusedView
  - Extension focused view goes through `ExtensionHostShell` (`surface="detail"`) + `DetailSurface`
  - `detailLayout` declares lightbox (image) vs wide (file) vs default contained (link)
  - Legacy `image` / `asset` / `link` / card paths unchanged
- Files created/modified:
  - `src/mainview/components/canvas/FocusedView.tsx`
  - `src/mainview/extensions/ExtensionHostShell.tsx`
  - `src/mainview/extensions/types.ts`
  - `src/mainview/extensions/builtin/media/image.tsx`
  - `src/mainview/extensions/builtin/media/file.tsx`
  - `docs/features/In Progress/canvas-extension-gap-closure.md`

## Test Results

| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| buildAIContext + runAISummarize + SelectionAIToolbar | vitest | pass | 23 related tests green | pass |
| ultracite check on T3 files | lint | pass | pass | pass |
| T4 store/sidebar/predicates/serialization/menu/library | vitest | pass | 232 related tests green | pass |
| ultracite check on T4 files | lint | pass | pass | pass |
| T5 FocusedView + ExtensionHostShell | vitest | pass | 21 related tests green | pass |
| ultracite check on T5 files | lint | pass | pass | pass |

## Error Log

| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
|           |       | 1       |            |
