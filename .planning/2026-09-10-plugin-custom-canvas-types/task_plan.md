# Task Plan: T2 plugin custom canvas types

## Goal
Add the first public custom canvas-type slice to the trusted plugin runtime: durable opaque instances with versioned state, plugin rendering/editing, searchable host-owned summaries, migrations, and safe missing-plugin placeholders, verified in tests and the packaged macOS arm64 app.

## Next Step
Begin the next T2 slice: design and implement conflict-resolution UI, then define the boundary for unified native/canvas/plugin undo.

## Current Phase
Complete

## Phases

### Phase 1: Requirements & Discovery
- [x] Recover the previous completed T2 slice and its explicit next step
- [x] Read the accepted custom-type contract and addenda
- [x] Map existing extension-instance behavior and gaps
- [x] Document the implementation boundary in findings.md
- **Status:** complete

### Phase 2: Contract & Architecture
- [x] Freeze manifest/SDK/runtime shapes and compatibility rules
- [x] Define host persistence, summary/search, migration, and missing-plugin ownership
- [x] Define a packaged acceptance scenario before implementation
- **Status:** complete

### Phase 3: Host & Renderer Implementation
- [x] Implement validated public registration and lifecycle cleanup
- [x] Implement durable instance creation/editing/restart behavior
- [x] Implement summaries/search and missing-plugin rendering
- [x] Implement guarded state migrations and failure fallback
- **Status:** complete

### Phase 4: Tests & Packaged Verification
- [x] Add focused host, runtime, store, search, and renderer regressions
- [x] Run type checking and style checks
- [x] Build and run a real packaged custom-type acceptance probe
- [x] Run the full serial regression suite
- **Status:** complete

### Phase 5: Evidence & Documentation
- [x] Update SDK reference and current implementation plan
- [x] Add human-readable and machine-readable acceptance evidence
- [x] Review the staged diff without disturbing prior staged work
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue with custom canvas types as a new isolated plan | The completed 2026-09-10 body/creation plan names this as the next T2 slice. |
| Preserve the current index exactly while working | The previous slice is already staged by the user and must not be reset or overwritten. |
| Expose `app.canvas.registerType()` with plugin-local IDs and derive `${pluginId}/${localId}` in the host | This prevents namespace impersonation while producing stable globally unique persisted IDs. |
| Stage registrations inside a candidate activation and atomically replace the prior owner's generation only after setup succeeds | Failed imports/setup must leave the exact old card implementation and data path running. |
| Reuse extension-instance JSON and presentation as the source of persistence/search/missing display | The existing host-owned model already satisfies opaque data preservation and searchable fallback summaries. |
| Run migrations lazily and revision-checked when an older visible record meets a published type | Plugin code stays in the renderer; data is never overwritten after a concurrent edit, and a failed/absent plugin leaves the original record intact. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Initial multi-file migration patch missed the current `src/bun/index.ts` object shape | Inspected the exact handler and reapplied a narrower context-aware patch; no partial source edit landed. |
| Focused Vitest command used unsupported Jest flag `--runInBand` | Switched to the repository's supported serial flags `--fileParallelism=false --maxWorkers=1`. |
| Type predicates in new tests accessed properties after narrowing `unknown` only to `object` | Added explicit structural casts in the predicate bodies; production types were already correct. |
| First style check reported formatting/import-order issues plus three inline test regexes | Moved regexes to top-level constants, removed an unused type import, and applied the formatter only to touched source files. |
| Packaged probe type check exposed `unknown` search results and the digest-required disable signature | Added a structural search-result guard and resolved the installed plugin digest before disabling. |
