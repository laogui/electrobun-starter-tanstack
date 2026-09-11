# Task Plan: T3 importer and installable distribution

## Goal
Define and deliver the smallest honest T3 slice that lets an independently packaged high-trust plugin register a file importer, preview and commit imported notes without duplicate or hidden writes, and reach the same runnable package through final-user ZIP / HTTPS installation in the packaged macOS arm64 app.

## Next Step
Implement the activation-scoped read-only file-handle service and its cross-plugin/workspace/reload validation tests as the first dependency of the frozen CSV importer slice.

## Current Phase
Phase 1

## Phases

### Phase 1: Requirements & Discovery
- [x] Recover and commit the completed T2 unified-history slice
- [x] Map retained ZIP / HTTPS installer and application-level package state
- [x] Map existing SDK file services, native file selection and import UI paths
- [x] Map manifest/runtime contribution registration needed for an importer
- [x] Record the smallest independently package-testable boundary in findings.md
- **Status:** complete

### Phase 2: Import and Distribution Contract
- [x] Freeze package/install/enable identity and failure semantics
- [x] Freeze importer definition, file handle, preview, cancellation and commit semantics
- [x] Freeze partial completion, retry deduplication and undo/recovery boundaries
- [x] Define packaged acceptance scenarios before implementation
- **Status:** complete

### Phase 3: Minimal Implementation
- [ ] Implement the minimum retained-installer adaptation for manifest v2 application packages
- [ ] Implement SDK files and importer registration/runtime plumbing
- [ ] Implement host-owned select / preview / confirm / cancel flow
- [ ] Provide an independent combined plugin package and SDK testing support required by this slice
- **Status:** in_progress

### Phase 4: Testing & Verification
- [ ] Add unit and integration regressions for installer and importer contracts
- [ ] Run type checking, style checks and focused tests
- [ ] Build and run packaged ZIP / HTTPS / importer acceptance probes
- [ ] Run the full serial regression suite
- **Status:** pending

### Phase 5: Delivery
- [ ] Update SDK, platform and development documentation with exact supported boundaries
- [ ] Review the final diff and working-tree state
- [ ] Record remaining T3 work or advance the platform phase honestly
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Commit completed T2 as `c22be38` before starting T3 | The prior plan and verification were complete; T3 needs a separate reviewable contract and evidence trail. |
| Exclude T4 signing, update and safe-mode behavior from the first T3 boundary | The platform plan assigns those reliability/security flows to T4; mixing them into installer activation would prevent a minimal T3 slice. |
| Bound the first importer to one strict UTF-8 CSV, 1 MiB and 100 notes | One existing atomic transaction can prove preview/cancel/retry/undo now; larger segmented progress stays an honest later T3 phase. |
| Reuse the existing application-level ZIP/HTTPS installer and workspace enablement | The audit found a real recoverable v2 distribution path; the missing proof is an installed importer package, not another installer. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Scoped Ultracite check treated the quoted planning-file glob as a literal path and checked zero files | Retry with explicit file paths; do not repeat the quoted glob form. |
| First staged diff check found one extra blank line at the end of the new T3 plan | Removed the trailing blank line, restaged and reran the check before commit. |
