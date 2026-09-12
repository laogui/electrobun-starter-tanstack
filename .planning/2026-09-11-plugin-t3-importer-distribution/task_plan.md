# Task Plan: T3 importer and installable distribution

## Goal
Define and deliver the smallest honest T3 slice that lets an independently packaged high-trust plugin register a file importer, preview and commit imported notes without duplicate or hidden writes, and reach the same runnable package through final-user ZIP / HTTPS installation in the packaged macOS arm64 app.

## Next Step
Wire importer sessions into Plugin Workbench and implement explicit confirmation with one stable-operation `content.createMany` transaction, preserving the preview for retry after uncertain or failed outcomes and closing it on cancel or successful receipt.

## Current Phase
Phase 3

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
- [x] Implement SDK files and importer registration/runtime plumbing
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
| A planning update patch targeted the same progress file twice | Combined its status and action hunks into one update; the rejected patch made no changes. |
| Initial focused tests had nine Bun-side failures: the shared test setup stubs `Bun.file`, the expected fixture byte count was wrong, and Vitest `it.each` spread array rows | Derive the small supported MIME set from the extension, calculate the expected byte count, wrap table values as one argument, and validate non-array RPC input explicitly. |
| Three corrective patches included stale error-table context and were rejected atomically | Removed the unrelated context and applied only the targeted source, test and task-plan changes. |
| First type-check found widened boolean mocks and another `it.each` row-shape mismatch in the renderer test | Annotated mock promise result unions explicitly and changed invalid-filter cases to named `{ accept }` rows. |
| First Ultracite pass reported six mechanical formatting/order issues and two disallowed TypeScript parameter properties | Expanded the class fields explicitly, then use a scoped safe formatter for import/member/layout fixes. |
| First full serial suite had two import-time failures because complete `@/lib/rpc` mocks did not export the three new file RPC functions | Extend both full module mocks; the other 212 files / 1951 tests passed. |
| Three malformed session-poll wrapper snippets failed before calling the running test process | Corrected the JavaScript wrapper and resumed the existing session; no test process was duplicated or interrupted. |
| One mock-fix patch contained a mistyped progress-table context and was rejected atomically | Split the source/task-plan correction from the progress log update. |
| First importer-registration Ultracite pass reported only import/member formatting plus one test-local regex | Applied the mechanical ordering/layout changes and promoted the regex to a top-level constant before rerunning the check. |
| The first resumed-turn tool wrapper evaluated an undefined `Exception` identifier before calling any tool | Reissued a valid wrapper; no repository command ran and no files changed in the failed attempt. |
| First importer-session type-check found widened success booleans in transport mocks, an unsafe fetch mock cast and an insufficiently narrowed warnings array | Added explicit transport result unions, typed the fetch mock directly and preserved the validated string-array type in the frozen preview. |
| First importer-session Ultracite pass reported only safe ordering/layout issues and one test-local operation-ID regex | Applied the mechanical member/import/layout changes and moved the regex to module scope. |
