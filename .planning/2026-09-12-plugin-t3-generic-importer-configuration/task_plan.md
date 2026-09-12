# Task Plan: T3 generic importer configuration

## Goal
Deliver the next independently reviewable T3 slice: explicit importer choice when file filters overlap, host-owned bounded field mapping, detached-versus-canvas target and placement policy, and lifecycle-safe temporary import assets, with tests, author documentation and honest packaged evidence.

## Next Step
Continue with the remaining T3 author toolchain as the next independent slice.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Recover the completed segmented-import slice and recorded next task
- [x] Map overlapping importer discovery and file-selection ownership
- [x] Map reusable field, canvas placement and attachment lifecycle primitives
- [x] Record constraints and candidate boundaries in findings.md
- **Status:** complete

### Phase 2: Contract Freeze
- [x] Freeze importer-choice and configuration contracts
- [x] Freeze field-mapping validation and preview semantics
- [x] Freeze target canvas, placement transaction and temporary-asset lifecycle
- [x] Freeze packaged acceptance scenarios and explicit exclusions
- **Status:** complete

### Phase 3: Implementation
- [x] Extend public SDK and testing host
- [x] Extend renderer import/configuration/session UI
- [x] Confirm no Bun host extension is needed for session source handles
- [x] Update independent author fixture
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Add unit/integration regressions across configuration and lifecycle boundaries
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
| Implement generic importer configuration before the remaining author packaging toolchain | The T3 plan records configuration as the next distinct capability after segmented imports; packaging can then template the final stable importer contract. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
