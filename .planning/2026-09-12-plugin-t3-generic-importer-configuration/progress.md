# Progress Log

## Session: 2026-09-12

### Current Status
- **Phase:** Complete
- **Started:** 2026-09-12

### Actions Taken
- Recovered the clean `main` branch at `4b4a44b` and confirmed segmented import is complete and committed.
- Read the T3 plan and confirmed generic importer configuration is the next independent slice before author packaging.
- Created an isolated planning workspace and began mapping importer choice, mapping, placement and temporary asset boundaries.
- Traced the current importer entry point, canvas persistence split between active/non-active views, and final-only attachment storage. Identified handle ownership and cross-view persistence as the two contract-sensitive areas.
- Froze the compatibility, bounded mapping and placement direction: legacy parse remains automatic; configurable importers map fixed Note fields; canvas placement is explicit, deterministic and honestly non-atomic with Note creation.
- Implemented explicit importer selection, opt-in field inspection/mapping, detached or named-canvas destination, grid/vertical placement, stable placement retry and session-scoped source-handle release.
- Updated the public SDK types, fake host, Workbench UI, combined CSV package and packaged T3 probe.
- Passed type-check, 167 focused tests, and the independently assembled three-file T3 fixture package.
- Passed full static checking (692 files), full serial Vitest regression (220 files / 2,011 tests), and the local / restart / download macOS arm64 packaged acceptance phases.
- Recorded the canary and three-file plugin archive hashes, exact supported/excluded boundaries, and linked the completed fourth batch from the T3 plan.
- Reviewed the recovery UI and kept the target-canvas opener visible after placement failure while locking already-committed destination settings; also released segmented-import source handles immediately at successful completion and rejected retry nodes that no longer reference the expected Notes.
- Re-ran type-check, 169 directly affected tests, static checks and the complete three-phase packaged acceptance after the final lifecycle and recovery changes.

### Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| `bun run type-check` | No project diagnostics | Passed (29 dependency diagnostics intentionally ignored by repository runner) | ✅ |
| Focused importer/runtime/canvas Vitest | Configuration, placement and lifecycle regressions pass | 3 files / 167 tests | ✅ |
| `bun run test:plugin-t3-fixture` | Independent three-file plugin package validates | 2,826-byte archive; `app.js`, `csv.js`, `manifest.json` only | ✅ |
| `bun run check` | Full repository static checks pass | 692 files; no fixes | ✅ |
| `bun run test -- --maxWorkers=1` | Full serial regression passes | 220 files / 2,011 tests | ✅ |
| `bun run test:plugin-t3` | Real packaged local, restart and download phases pass | All three phases passed on macOS arm64 / WKWebView | ✅ |

### Errors
| Error | Resolution |
|-------|------------|
| `apply_patch` could not find an assumed findings sentence. | Re-read the generated file and applied the update against its exact content. |
| Focused runtime tests still expected the removed per-plugin importer button. | Updated the UI tests to select the importer explicitly, then choose a file. |
| The new placement tests left unified undo history for a later canvas-store test because their describe block precedes the file-level cleanup hook. | Added local placement-test cleanup for the store and unified history. |
| A combined planning/evidence patch used stale phase formatting and was rejected atomically. | Re-read the plan and applied the evidence plus phase updates against the exact checklist form. |
| Vitest 4.1.4 rejected the historical `--minWorkers` flag. | Retained `--maxWorkers=1`, which is the supported flag needed for the serial regression. |
| First packaged placement failed closed with `revision-conflict` while saving the manifest. | The placed card referenced a sidecar Note but omitted its receipt revision; added `blocknoteRevision` from the content receipt so the existing metadata merge can verify the exact revision. |
| A packaged rerun ended after assembling the fixture, before Vite produced output. | Inspected the evidence directory and process table, confirmed there was no product result or surviving acceptance process, and started a fresh bounded run. |
| The packaged placement passed, but probe cleanup first found a persisted canvas reference and then a changed-Note conflict. | Made cleanup await a real manifest save after deleting the cards; also stopped placement from converting an imported empty color to `#FFFFFF`, which had silently revised the Note during manifest save. This preserves both reference and revision guards. |
| Running `type-check` and focused Vitest concurrently raced Paraglide regeneration; two suites could not resolve the not-yet-written `runtime.js`. | Let Paraglide finish, then reran the focused suite serially. These commands must not share the generated directory concurrently. |
| After preserving an empty Note color, the canvas placement probe could no longer find both new Notes in an unfiltered 100-item query behind 100 deliberately preserved rollback-conflict notes. | Filtered the single-title helper at the service and raised the known bounded combined query to the public 500-item maximum; placement itself had succeeded and closed its session. |
| The lifecycle cancellation probe's legacy `__WAIT__` first-line sentinel became an unmappable CSV header under the new required-title configuration. | Moved the sentinel into a valid `title,text` row and detected it anywhere in the fixture so the probe reaches the intended blocked parse before disabling the plugin. |
