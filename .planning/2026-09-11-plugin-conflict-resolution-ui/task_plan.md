# Task Plan: T2 plugin conflict-resolution UI

## Goal
Add a host-owned conflict recovery flow for plugin-versus-local note edits so preserved drafts are visible and users can inspect, discard, or intentionally retry them without silent data loss; verify the behavior in tests and the packaged macOS arm64 app.

## Next Step
Begin the next T2 slice by freezing the unified native/canvas/plugin undo event model and acceptance contract before implementation.

## Current Phase
Complete

## Phases

### Phase 1: Requirements & Discovery
- [x] Recover the completed custom-canvas slice and its explicit next step
- [x] Read the accepted T2 conflict requirements and existing failure behavior
- [x] Map editor/store/transport state available to a recovery UI
- [x] Document the implementation boundary in findings.md
- **Status:** complete

### Phase 2: Contract & Interaction Design
- [x] Freeze conflict states, user actions, copy, and accessibility behavior
- [x] Define stale-response and retry/discard safety rules
- [x] Define a packaged acceptance scenario before implementation
- **Status:** complete

### Phase 3: Implementation
- [x] Implement host-owned conflict state and recovery actions
- [x] Implement the focused-editor conflict UI
- [x] Preserve clean-editor reconciliation and existing plugin transaction semantics
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Add focused store/coordinator/component regressions
- [x] Run type checking, style checks, and focused tests
- [x] Build and run a packaged conflict acceptance probe
- [x] Run the full serial regression suite
- **Status:** complete

### Phase 5: Delivery
- [x] Update SDK/platform/development documentation and evidence
- [x] Review the final diff and working-tree state
- [x] Record the next T2 boundary for unified undo
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue with conflict-resolution UI as a new isolated plan | The completed custom-canvas plan explicitly names this as the next T2 slice. |
| Treat unified native/canvas/plugin undo as the following boundary, not an implicit part of this slice | Existing documentation separates richer conflict recovery from the ordered history redesign, and the user asked to continue the next task. |
| Use a persistent inline editor banner with an expandable two-version comparison | Conflict recovery stays visible without trapping focus; native disclosure remains keyboard accessible and avoids a new dialog dependency. |
| “Keep my version” performs a revision-checked rebase, while “Use saved version” is the only action that discards the local draft | Both destructive outcomes are explicit, and a second concurrent change cannot be overwritten silently. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
