# Task Plan: T3 segmented import

## Goal
Deliver the next independently reviewable T3 slice: imports larger than 100 notes through explicit deterministic segments with visible completed ranges, idempotent per-segment retry, continue-after-failure, and conflict-safe rollback that never overwrites later user edits.

## Next Step
Commit this completed segmented-import slice, then start the separately reviewable generic importer-configuration slice recorded in the T3 plan.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Recover the completed complete-files plan and recorded next slice
- [x] Map current importer session and note creation/history persistence
- [x] Identify lifecycle, retry, continuation and rollback constraints
- [x] Record constraints and candidate boundaries in findings.md
- **Status:** complete

### Phase 2: Contract Freeze
- [x] Freeze public parse result and explicit segmentation limits
- [x] Freeze session progress, per-segment identity and retry/continue semantics
- [x] Freeze conflict-safe rollback behavior and packaged acceptance scenarios
- **Status:** complete

### Phase 3: Implementation
- [x] Confirm existing Bun note-creation journal and authenticated host protocol need no new mutation path
- [x] Extend renderer import session state machine and workbench UI
- [x] Extend public SDK/testing host and author fixture
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Add Bun, renderer, UI and SDK regression coverage
- [x] Run type-check, scoped style checks and focused tests
- [x] Run full serial regression and proportional packaged verification
- **Status:** complete

### Phase 5: Delivery
- [x] Update SDK, T3 and development documentation with exact boundaries
- [x] Review diff and working-tree state
- [x] Commit the completed slice with a conventional subject
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Implement segmented import before generic importer configuration and author packaging | The active T3 plan names it as the next independent slice; it can reuse complete files without prematurely coupling field mapping or canvas placement. |
| Add an explicit `{ segments: [{ notes }] }` parse-result variant while preserving `{ notes, warnings }` | Existing 1–100-note importers remain source-compatible; authors must opt into multi-batch behavior rather than having the host silently split an atomic result. |
| Bound segmented previews to 50 segments, 5,000 notes and 16 MiB of normalized note text | Each host write remains within the existing 100-note transaction limit while renderer memory and UI work stay bounded. |
| Commit segments sequentially with deterministic child operation IDs and stop at the first failure | A retry reuses the uncertain segment identity, completed ranges remain exact, and no later range can overtake an unresolved segment. |
| Roll back completed segments in reverse order through existing creation undo, continue past deterministic conflicts and stop on uncertain transport failures | Existing note-history byte equality and reference scans prevent overwriting later edits; clean segments can still be removed, while conflicted ranges remain visible and retryable. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| First type-check found that testing-harness consumers must narrow the new parse-result union before reading `notes` | Add an explicit single-batch assertion in the existing SDK test; importer implementations remain source-compatible. |
| First focused regression found the single-batch history label had changed to range wording | Retain the exact existing label for compatibility and use range labels only for explicit segmented imports. |
| First UI type-check assigned an inline async mock to Bun's extended `fetch` type without `preconnect` | Declare the typed mock first and attach its implementation separately, matching existing repository test patterns. |
