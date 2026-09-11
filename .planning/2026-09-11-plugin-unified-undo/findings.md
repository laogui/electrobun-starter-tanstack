# Findings & Decisions

## Requirements
- The accepted next T2 boundary is to define ordering, scope, persistence and failure semantics for native/canvas/plugin undo before choosing the minimum implementation.
- The host must not claim a global ordered history while plugin batches, canvas snapshots, BlockNote editor history and record-local histories are merely independent stacks.
- Revision-checked plugin reversals must remain atomic and fail closed; a failed reversal must not advance a unified cursor or expose partial success.

## Research Findings
- The completed conflict-recovery slice is committed at `9ffdb9c`; the new plan starts from a clean code baseline except for its planning files.
- Current SDK documentation says plugin note batches have durable, batch-addressed undo/redo while native canvas shortcuts are not integrated.
- Canvas snapshots and widget/extension instance histories are renderer-memory histories capped at 50; plugin note history is persisted in the workspace and survives restart.
- The current platform plan explicitly requires this slice to freeze order, scope, persistence and failure boundaries without expanding card types or editor internals.
- `routeUndoRedo` is the shared keyboard/native-menu dispatcher. It gives focused extension instances first ownership, focused legacy widgets second, text-editing elements third, and otherwise calls the active canvas store's memory-only undo/redo.
- Electrobun's application menu deliberately sends custom `canvasUndo` / `canvasRedo` messages because native menu roles would stay inside WKWebView's edit stack. Keyboard editing returns `false` so the browser/editor owns the event; menu editing uses `document.execCommand`.
- `canvasStore.saveSnapshot()` pushes the current node/edge snapshot before discrete canvas mutations and clears that store's redo branch. `setActiveView` and full reset discard canvas history; view switches therefore already define a hard history boundary.
- Focused legacy-widget and extension-instance histories are per-record renderer stacks. They persist their resulting record asynchronously but not the history stacks themselves, and their focus ownership should remain ahead of the canvas-level ordered router.
- Plugin note `updateMany` / `createMany` batches use their operation ID as the durable batch ID. Explicit `undo(batchId)` / `redo(batchId)` write fresh revisions atomically and maintain a durable per-batch `undone` state plus idempotent operation receipts.
- All renderer plugin content mutations flow through `createPluginContent`. Successful results identify whether the call changed content and include the forward operation ID, but current `content.changed` notifications do not identify their originating batch or whether a change is forward/undo/redo.
- Note transaction notifications are emitted only after commit or forward recovery. Delivery failure does not roll back a committed mutation. This makes a commit notification the strongest existing source for registering an observed plugin event, but it needs internal history metadata or a correlated renderer acknowledgement to identify the batch.
- The plugin runtime already exposes the active workspace ID and changes it on workspace sync; host-event connection resets note revision/body caches on that boundary. This is the natural place to clear a session-native ordered timeline.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Treat BlockNote editor-local undo as a separate owner | Native editing semantics must stay with the rich editor while it owns focus. |
| Preserve focused widget/extension instance routing ahead of the unified canvas/plugin timeline | These are content-surface-local histories with explicit focus ownership; folding them into the canvas/plugin ordering would make typing/checklist controls undo unrelated canvas actions. |
| Scope the ordered timeline to `(workspaceId, activeViewId)` and keep it in renderer memory | Canvas snapshots are only valid for the hydrated active view and vanish on view switch/restart. Durable mixed history would require a new persistent canvas transaction format, which is larger than the minimum safe T2 closeout. |
| Use renderer-observed commit order, not request-start order | A plugin operation can fail, be canceled with an uncertain result, or recover later. The durable post-commit notification is the first reliable ordering point and matches when the host can reconcile visible state. |
| Carry private host-history metadata with Bun→renderer content notifications and strip it before public plugin event delivery | The ordered coordinator needs plugin/batch/action/operation identity, including after intent recovery, but this host plumbing is not a new public SDK contract. |
| Keep one linear `past` and front-ordered `future`, capped at 50 entries | This matches current canvas history bounds. Undo moves the top past entry to the front of future; redo reverses that; any new canvas or plugin record clears future. |
| Treat plugin no-op batches as no history event | `changed: false` has no committed content transition to reverse, and note transactions already omit content notifications for empty file sets. |
| Reconcile explicit SDK undo/redo only when it matches the native stack top/front; otherwise clear the mixed cursor | Explicit APIs are intentionally batch-addressed and may jump around durable history. The source operation remains valid, but the native linear ordering can no longer be proven. |
| Keep the cursor stationary while an async plugin reversal is pending and on all failures | Revision conflicts, referenced creations, transport failures and aborts must never look like successful undo. Repeated native shortcuts are consumed while pending to avoid duplicate operations. |

## Frozen Ordered-History Contract
- Entry owners are `canvas` and `plugin-note`. A canvas entry represents one successful pre-mutation snapshot push in the active view. A plugin entry represents one changed `createMany` or `updateMany` batch after its durable commit/recovery notification.
- The context is exactly the active runtime workspace ID plus the active canvas view ID. Workspace changes, view changes, disconnect, full canvas reset and application restart clear both mixed `past` and `future` without deleting any underlying durable plugin batch history.
- Native menu Undo/Redo and canvas-level Cmd/Ctrl+Z route through the mixed timeline. A focused plugin canvas instance, focused legacy widget, text input/textarea/contenteditable, and BlockNote retain their existing local ownership and do not consume mixed entries.
- Undo always targets `past.at(-1)`; redo targets `future[0]`. Canvas entries call the existing snapshot operation. Plugin entries issue host-owned, revision-checked `undo(batchId)` / `redo(batchId)` under the original plugin/workspace identity with a fresh retry-safe operation ID.
- A successful reversal moves the entry exactly once. Post-commit notification and HTTP response may arrive in either order, so operation IDs deduplicate confirmation. A failed request emits no transition and leaves both stacks unchanged; another native request is ignored while one is pending.
- A new changed forward operation clears the mixed redo branch. Source-local stale redo data may remain internally but is not reachable through native mixed redo; the next normal canvas snapshot already clears canvas-local future.
- Explicit SDK undo/redo remains supported across restart. If its committed transition matches the mixed top/front, the cursor follows it. If it targets any other batch, or an unexpected history transition is observed, the entire mixed cursor clears rather than synthesizing a false order.
- The public `content.changed` event remains an invalidation payload. Private host-history metadata is consumed and removed before plugin listeners receive the event.
- Existing T2 release acceptance uses Vite-gated renderer probes plus an isolated `GHOSTBOARD_DATA_DIR`, an external development-directory plugin and JSON reports written by a test-only host controller. Unified history now follows that same evidence shape so the package gate is repeatable rather than a one-off manual claim.
- A revision conflict caused by an ordinary write cannot be made retryable by restoring values because note revisions are monotonic; the honest acceptance is that the note and mixed cursor remain stationary and a visible error is emitted. Retry-after-resolution applies only to failures whose source precondition can actually be restored.
- The T2 exit table is satisfied by the ninth slice. Remaining rich-document creation, attachment/file authoring, plugin menu contributions and durable cross-restart canvas transactions belong to later demand-driven scopes rather than silently keeping T2 open.
- Corrupt-file preservation previously used only a millisecond timestamp after comparing existing bytes. Two distinct corrupt payloads observed within the same millisecond could overwrite the first backup; a random suffix now preserves both while repeated identical bytes still reuse the prior backup.

## Packaged Acceptance Scenario
- In a dedicated workspace/view, make canvas mutation A, run a changed plugin note batch B, then make canvas mutation C. Native Undo must restore C, then reverse B with fresh note revisions and visible projection reconciliation, then restore A. Native Redo must replay A, then B, then C in the same order.
- After undoing at least one entry, make a new plugin or canvas change and verify native Redo does nothing to the abandoned branch.
- Create a plugin revision conflict before native undo. Verify the note remains unchanged, the mixed cursor stays on the same entry, a visible failure is reported, and retry can succeed after the conflict is resolved where applicable.
- Switch canvas views and return; verify native mixed history does not replay the prior view, while the original plugin batch is still explicitly addressable through `app.content.undo/redo`.

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `docs/features/In Progress/trusted-plugin-platform.md`
- `docs/development-plan.md`
- `packages/plugin-sdk/README.md`
- `src/mainview/lib/routeUndoRedo.ts`
- `src/mainview/store/canvasStore.ts`
- `src/bun/plugins/noteContent.ts`
- `src/bun/noteTransactions.ts`
- `src/mainview/plugins/runtime/hostEvents.ts`
