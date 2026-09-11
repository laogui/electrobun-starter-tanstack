# Task Plan: T2 unified native/canvas/plugin undo

## Goal
Define and deliver the smallest honest host-owned undo/redo model that gives native canvas shortcuts one ordered history across canvas mutations and committed plugin note batches, without stealing editor-local undo or weakening revision/conflict safety; verify it in tests and the packaged macOS arm64 app.

## Next Step
Implement the session-scoped ordered coordinator and durable plugin commit metadata, then connect canvas snapshots and native routing without changing focused editor/widget/extension ownership.

## Current Phase
Phase 3

## Phases

### Phase 1: Requirements & History Audit
- [x] Recover and commit the completed conflict-recovery slice
- [x] Map native shortcut routing and every current history producer
- [x] Map plugin commit/undo/redo notifications and workspace/view lifecycle
- [x] Record explicit in-scope and excluded histories in findings.md
- **Status:** complete

### Phase 2: Ordered History Contract
- [x] Freeze event identity, order, cursor and branch semantics
- [x] Freeze workspace/view scope, lifetime and persistence behavior
- [x] Freeze async failure, conflict, reentrancy and stale-result behavior
- [x] Define packaged acceptance scenarios before implementation
- **Status:** complete

### Phase 3: Minimal Implementation
- [ ] Implement the host-owned ordered history coordinator
- [ ] Register canvas and committed plugin-note events exactly once
- [ ] Route native canvas undo/redo through the coordinator while preserving focused content histories
- [ ] Preserve explicit SDK undo/redo semantics and invalidate unsafe native history deterministically
- **Status:** in_progress

### Phase 4: Testing & Verification
- [ ] Add coordinator, router, store and integration regressions
- [ ] Run type checking, style checks and focused tests
- [ ] Build and run packaged ordered-history acceptance probes
- [ ] Run the full serial regression suite
- **Status:** pending

### Phase 5: Delivery
- [ ] Update SDK/platform/development documentation and evidence
- [ ] Review the final diff and working-tree state
- [ ] Record remaining T2 boundary or advance the platform phase honestly
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Start unified undo as a new isolated plan after committing conflict recovery as `9ffdb9c` | The previous plan was complete and explicitly named this as the next T2 boundary; keeping slices separate preserves reviewable evidence. |
| Exclude BlockNote text editing from native canvas history unless the audit disproves the existing ownership rule | Rich-editor undo is already editor-local and intercepting it would violate familiar text-editing behavior. |
| Make the unified cursor session-only and scoped to the active workspace plus active canvas view | Canvas snapshots are memory-only and discarded on view switch; persisting a mixed cursor without durable canvas payloads would create entries that cannot be replayed honestly. |
| Order plugin entries at the post-commit host notification observed by the renderer | That is the first existing signal proving the transaction and its recovery intent/history completed; request start or optimistic UI order can claim changes that never committed. |
| Clear the native ordered cursor when explicit source-targeted history changes a non-top entry | Reordering an already applied linear history would misrepresent source state; clearing is deterministic while durable plugin batch history remains available through its explicit API. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Initial planning-file patch tried delete/add for the same file in one patch | Recreated the three planning files in two explicit apply-patch operations. |
| First type-check found `isContentChange` still cast its local value to the public event type | Changed the parser-local cast to `HostContentChangedEvent`; the public type remains only at the delivery boundary. |
| Focused Vitest invocation rejected the unsupported `--minWorkers` option | Removed that option and retained the supported single-worker cap. |
| A broad patch context inserted the recovery-metadata assertion into an earlier batch test | Corrected that test to its own batch ID and added the intended assertion at the interrupted-recovery check. |
| First Ultracite pass reported mechanical import/order/format issues plus disallowed `void` fire-and-forget expressions | Consolidated async native routing into one caught helper, removed the unused public event import, marked stable state readonly and queued formatter-safe import/line fixes. |
