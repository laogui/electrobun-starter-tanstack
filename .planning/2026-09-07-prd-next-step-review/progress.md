# Progress Log

## Session: 2026-09-07

### Current Status
- **Phase:** 1 - Requirements & Discovery
- **Started:** 2026-09-07

### Actions Taken
- Read the complete `planning-with-files` skill instructions.
- Checked for existing planning files; none existed.
- Initialized an isolated plan at `.planning/2026-09-07-prd-next-step-review/`.
- Tried to read the repository-referenced RTK instructions and confirmed the referenced file is missing.
- Defined a repository-evidence-based review approach.
- Read the PRD's product goal, current implementation caveats, current roadmap, task index, open decisions, and known backlog.
- Extracted the explicit immediate work for both the core-flow and public-plugin delivery lines into `findings.md`.
- Read the complete D0-D3 development plan, the full extension behavior matrix, the extension gap-closure plan, and the plugin P0/P1 implementation and test gates.
- Identified the specific OD-6 mismatch and the documented T6 remainder.
- Inspected the dirty working tree, recent commit history, current built-in behavior declarations, and T6 search mapping location.
- Confirmed that the just-authored plugin/PRD documentation is uncommitted and the implementation still has not started.
- Read the prior gap-closure findings/progress and current test inventory.
- Traced Productivity Folder behavior through Git history and found it was intentionally disabled before the extension migration, while Checklist's legacy focused-detail implementation remains in the codebase.
- Inspected focusability predicates, Folder-child compatibility tests, the Checklist canvas surface, and the historical commit that originally enabled widget focus.
- Found the later commit that intentionally removed generic widget focusability and used the new per-type contract to form a narrower Checklist-specific recommendation.
- Re-read the task plan before prioritization and ran `git diff --check` successfully.
- Final recommendation prepared: isolate the docs commit, execute D0-1 with explicit OD-6 rules, then complete T6/D0 regression; run plugin P0 separately if capacity allows.
- Reviewed final evidence and marked all review phases complete.

## Session: 2026-09-07 — D0-1 Implementation

### Current Status
- **Phase:** 9 - Full Verification and Delivery complete
- **Started:** 2026-09-07

### Actions Taken
- User authorized implementation of the recommended next slice.
- Re-read the `planning-with-files` skill and restored the completed review context.
- Added implementation, verification, and delivery phases to the existing plan.
- Inspected the generic detail-surface contract, Checklist state/view shapes, FocusedView extension tests, and legacy Folder compatibility tests.
- Identified a narrow implementation: a Checklist type-local DetailSurface adapter plus target-behavior tests; no host branching required.
- Confirmed extension instance updates already provide presentation refresh, Undo history, and persistence scheduling.
- Confirmed there is no direct Checklist Canvas Type test; selected FocusedView integration and predicate tests as the first failing coverage.
- Added the D0-1 tests in `FocusedView.test.tsx`, `canvasNodePredicates.test.ts`, and `canvasStore.test.ts`.
- First focused-test attempt could not start because the local `vitest` executable is absent; no test assertions ran.
- Confirmed `node_modules` was absent. The first locked install hit sandbox tempdir permissions; the approved retry completed and installed 581 locked packages, including Vitest.
- Ran the three focused suites: 111 existing canvas-store tests passed, the new legacy Widget restore test failed because the type became `card`, and two suites could not load due missing generated Paraglide message modules.
- Used the required `find-docs`/Context7 flow to verify the current Paraglide JS compile command before restoring generated messages.
- Confirmed the Vite config already declares the Paraglide plugin and `src/paraglide` is a generated directory.
- Ran the locked local `paraglide-js compile` command successfully; generated message modules are now available for tests without editing generated files manually.
- Re-ran focused suites and established the expected red baseline: 173 passed, three D0-1 assertions failed.
- Located the legacy Widget conversion bug in `resolveFolderChildSpec`, where current Folder eligibility incorrectly controls recovery of already-stored children.
- Checked resolver call sites and existing extension-detach tests; selected a recovery-policy fix that preserves stored runtime type independently of current placement eligibility.
- Implemented Checklist DetailSurface via the existing generic Canvas Type host path; no FocusedView built-in branch was added.
- Fixed Folder child recovery so current placement restrictions do not coerce legacy Widget or extension children into Cards.
- Focused verification passed: 3 files, 177 tests.
- Reconciled the behavior matrix, PRD, development plan, and technical specification against the implemented D0-1 rules; identified the exact stale Folder/focus/store descriptions to update while preserving the broader D0 acceptance gate.
- Updated the behavior matrix with the per-type open/Folder rules, current default sizes, Checklist focus action, and the admission-versus-recovery invariant.
- Synchronized the PRD, development plan, and technical specification with OD-6: Checklist detail editing through instance state/history, Pomodoro/Reminder canvas-only, no new Productivity Folder placement, and lossless legacy Folder recovery.
- Marked only D0-1 implementation/document synchronization as complete in the working plan; D0 remains open for full regression and desktop acceptance.
- Ran `git diff --check` after code and documentation edits; it passed with no whitespace errors.
- Reviewed the scoped diff and confirmed unrelated pre-existing plugin/PRD planning changes remain in the working tree and were not rewritten or removed.
- Updated the existing context-menu test to assert Checklist's new host focus action.
- Non-mutating repository check passed: `bun run check` checked 441 files with no fixes or errors.
- Expanded D0-1 verification passed: 4 files / 195 tests, covering Checklist FocusedView, context menu, predicates, and Folder recovery.
- Reproduced the unrelated SearchDialog failure in isolation: all 22 cases stop in shared `beforeEach` because this runtime exposes `window.localStorage` as undefined; no SearchDialog assertion executes.
- Traced the isolated SearchDialog failure to Node `v26.7.0`: its configurable global `localStorage` accessor exists but returns `undefined` without a backing file, while the test setup does not replace that accessor for jsdom suites.
- Retried SearchDialog by launching Vitest with Node's explicit `--localstorage-file`; Vitest workers did not inherit the option, so the same pre-test failure remained. No project files were changed for this experiment.
- Ran the repository test suite excluding only the independently reproduced SearchDialog environment failure: 150 files / 1387 tests passed.
- Retried `tsgo --noEmit --skipLibCheck`; the tool still traversed Electrobun sources and reported the same dependency diagnostics plus the pre-existing missing `beforeAll`, with no errors from D0-1 touched files.
- Re-ran the stale-rule scan with safe quoting; no obsolete D0-1 phrases remained in the behavior matrix, PRD, development plan, or technical specification.
- Reviewed the implementation seam end to end: `ChecklistFocusedView` preserves runtime-only item metadata through object spreads, the adapter supplies IDs for newly inserted rows, and `extensionInstanceStore.updateState` synchronously rebuilds presentation, records instance history, and schedules persistence.
- Strengthened the Checklist detail integration test to cover title edits, adding a new item with a generated stable ID, toggling an existing item, presentation refresh, and three instance-history entries.
- Final non-mutating checks passed again after the stronger test: 441 files linted/formatted cleanly and the 4 focused files / 195 tests passed.
- Final scope review passed: no stale D0-1 rule phrases remain, `git diff --check` is clean, implementation changes are limited to Checklist detail behavior and Folder-child recovery, and unrelated dirty plugin-planning files remain untouched.
- D0-1 implementation and automated verification are ready to hand off. The remaining acceptance item is a desktop behavior-matrix walk-through in a disposable workspace; broader T6 and D0-3 work remains deliberately out of this slice.

### Scope Guard
- Restore Checklist detail editing through the Canvas Type contract.
- Keep Pomodoro and Reminder canvas-only.
- Keep new Productivity placement into Folder disabled.
- Preserve and verify access to legacy Folder-contained widgets.
- Do not begin plugin P0, D1 search redesign, or unrelated backlog work in this slice.

### Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Focused D0-1 suites | Checklist detail and legacy Folder recovery rules pass | 3 files / 177 tests passed | pass |

### Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| `git diff --check` | No whitespace errors in current tracked changes | No output | pass |
| `bun run check` | Repository lint/format check passes without mutation | 441 files checked, no errors | pass |
| D0-1 focused suites | Checklist detail/menu and Folder compatibility pass | 4 files / 195 tests passed | pass |
| Full suite excluding reproduced SearchDialog environment blocker | All remaining tests pass | 150 files / 1387 tests passed | pass |
| `bun run type-check` | No type errors | Blocked by Electrobun dependency diagnostics and existing missing `beforeAll`; no touched file reported | blocked |

### Errors
| Error | Resolution |
|-------|------------|
| `sed: /Users/laogui/.codex/RTK.md: No such file or directory` | Searched `.codex` and `.codex-switcher`; no `RTK.md` candidate exists. |
| `bun run test ...` → `/bin/bash: vitest: command not found` | Restored dependencies with `bun install --frozen-lockfile`. |
| First `bun install --frozen-lockfile` → tempdir `PermissionDenied` | Re-ran with the required filesystem permission; install succeeded. |
| Focused suites → missing `src/paraglide/messages/_index.js` | Verified the official Paraglide compile command through Context7; generate the ignored build artifact before rerunning. |
| Legacy Folder Widget restore test → expected `widget`, received `card` | Treat as an in-scope D0 compatibility defect; inspect and correct the type-normalization path. |
| `bun run type-check` → Electrobun dependency type errors and existing `index.test.tsx` missing `beforeAll` | No touched project file appeared in the diagnostic output; leave unrelated baseline files unchanged and report this verification blocker. |
| `bun run check` → two formatter diffs in newly edited files | Applied the exact formatter-prescribed layout with `apply_patch`; rerun the non-mutating check. |
| Full `bun run test` → Checklist context-menu expectation still assumed no focus | Updated the existing menu test to assert the newly frozen Checklist focus action; Pomodoro/Reminder non-focus behavior remains covered by predicate tests. |
| Full `bun run test` → all 22 `SearchDialog` tests fail because `window.localStorage` is undefined | This suite is unrelated to D0-1 and fails in `beforeEach` before assertions; isolate it as an environment/baseline issue while rerunning the corrected in-scope suites and full test suite. |
| First stale-rule `rg` command used Markdown backticks in a double-quoted shell argument, causing zsh to attempt three command substitutions | The diff review still completed and `git diff --check` passed; rerun the scan with safely single-quoted patterns and no executable substitutions. |
| Strengthened FocusedView test introduced an inline regex rejected by `useTopLevelRegex` | Moved the item-ID regex to a top-level test constant; the behavior test itself already passed. |

## Session: 2026-09-07 — D0 Continuation

### Current Status
- **Phase:** 10 - Desktop Behavior Acceptance
- **Started:** 2026-09-07

### Actions Taken
- User requested continuation after the D0-1 implementation handoff.
- Re-read the complete `planning-with-files` skill and restored the active plan, findings, and progress context.
- Ran the planning session catch-up script; it reported no unsynchronized context.
- Extended the plan with desktop acceptance, T6, D0-3 regression, and final D0 closeout phases while keeping D1 and plugin P0 out of scope.
- Inspected startup/workspace resolution and found the supported `GHOSTBOARD_DATA_DIR` local-isolation override, allowing desktop verification without reading or writing the user's real GhostBoard workspace preferences.
- Confirmed the isolated default workspace will live entirely under `<temporary-data-root>/workspace` and will be seeded before the BrowserWindow is created.
- Created `/private/tmp/ghostboard-d0-acceptance.sWWA65` and launched `bun run dev:hmr` with that explicit `GHOSTBOARD_DATA_DIR`; Vite built successfully and the Electrobun desktop window opened against the seeded disposable workspace.
- Through the desktop UI, created a new Checklist, opened its detail view, renamed it to `D0 Desktop Checklist`, added `Persist me`, and toggled the item successfully.
- Pressing `Cmd+Z` after the item toggle unexpectedly removed the Checklist node via canvas history; `Cmd+Shift+Z` restored the node. Desktop acceptance is paused while this in-scope instance-history routing regression is converted to a test and fixed.
- Inspected `useCanvasKeyboard` and its tests. Confirmed extension Undo depends only on the keyboard event's DOM ancestry, unlike the legacy Widget path which also consults `focusedNode`; selected a focused-extension fallback and a global-event regression test as the narrow fix.
- Implemented the focused-extension fallback in `useCanvasKeyboard`; the keyboard suite passed 26/26 and `bun run check` passed 441 files.
- Retested the actual desktop DetailSurface after HMR. Fresh item toggle Undo and Redo both routed to extension instance history and the Checklist node remained on the canvas.
- Completed Checklist persistence acceptance: toggled the item checked, closed detail, reloaded the renderer, reopened the node, and observed the saved title/item plus `1/1` checked state.
- Created Pomodoro through the desktop Create menu and confirmed clicking its timer surface does not open a detail view.
- Right-clicking the Pomodoro surface triggered `Maximum update depth exceeded` and the app error boundary. Paused the remaining desktop matrix to capture the terminal trace and create a focused reproduction.
- Captured the Vite console trace: React warns `The result of getSnapshot should be cached` and identifies `<CanvasContextMenu>`. Traced the unstable snapshot to the selector returning a newly allocated extension reference object on every store read.
- Added `ContextMenu.store.test.tsx`, which renders a Pomodoro extension menu against the real Zustand stores. It reproduced the desktop crash exactly: React emitted the uncached-snapshot warning and the test failed with maximum update depth.
- Replaced the unstable object-valued subscription with primitive `canvasTypeId` and `instanceId` subscriptions; this retains per-type menu assembly without violating React's external-store snapshot stability requirement.
- The real-store and existing context-menu suites passed 19/19 after the fix. The repository check then rejected three inline test regexes and their wrapping, so they were moved to top-level constants and formatted without changing behavior.
- The next check required the three short assertions on single lines; applied the formatter-prescribed layout. The three affected suites remained green at 45/45.
- Final context-menu check passed after formatting: 442 files checked cleanly.
- Desktop HMR recovered from the error boundary. Reopening the Pomodoro context menu showed Copy/Lock/Delete with no crash and no Open Focused action.
- Created Reminder from the real desktop menu; it remained an inline canvas surface with its own controls and no automatic detail view.
- Opened Reminder's desktop context menu successfully; it exposed Copy/Lock/Delete and no focused-detail action.
- Dragged the desktop Checklist onto the seeded Folder and verified the drop was rejected: Folder remained at 3 items and the Checklist stayed top-level.
- Repeated the desktop Folder-drop attempt with Pomodoro and observed the same rejection and unchanged Folder count.
- Repeated the Folder-drop attempt with Reminder; it remained top-level and the Folder stayed at 3 items, completing the new-placement rejection matrix for all three Productivity types.
- Marked the first two Phase 10 acceptance items complete. The remaining desktop item is a deliberately constructed pre-existing Folder-contained Productivity record and its open/search/extract recovery path.
- Inspected the isolated on-disk canvas manifest and legacy Widget/migration schema. Selected a real `ghostboard-widget/v1` Checklist Folder child fixture so restart will exercise legacy-to-extension migration before desktop search/open/extract checks.
- A diagnostic glob used the wrong historical extension-instance directory (`.ghostboard/extensions/instances`); the actual files are under `.ghostboard/extension-instances`, and no data was changed.
- Read the exact seeded Widget and generated extension-instance records and confirmed the deterministic migration format needed for the compatibility fixture.
- Stopped the isolated Electrobun process before editing persisted data. Electrobun exited gracefully on the first interrupt; the sibling Vite process required the documented second interrupt and then exited with code 0 for the combined session.
- Added a disposable `ghostboard-widget/v1` Checklist record titled `Legacy Folder Checklist D0` with a checked item and historical timestamps, then added it as the fourth `type: 'widget'` child of the seeded Folder.
- Validated both JSON documents with `jq`; the Widget schema/content and four-child manifest reference are structurally correct before restart.
- Restarted the desktop app against the same disposable data directory in session `48772`; build, Vite, and Electrobun startup all completed successfully.
- Desktop startup showed the seeded Folder's member counter increase from 3 to 4.
- Inspected the migrated manifest and generated `extinst_widget_legacy_folder_d0` record: the child is an extension in place, all legacy Checklist fields are preserved, and the original Widget backing file remains present.
- Opened the desktop global search dialog to begin the Folder-contained Checklist reachability check.
- The first CUA click used an object argument unsupported by this app driver and made no UI change; retried with the documented integer element index and opened Search successfully.
- Searched for the unique legacy Checklist title and received one matching result, confirming the Folder child is present in the search index.
- Clicked the result; Search closed, but no Folder/detail navigation became visible and the prior top-level selection remained. Recorded this separately from search indexing and continued through the Folder's direct entry path.
- The CUA driver does not expose an `app.doubleClick` method. Retried by issuing two immediate clicks to the fresh Folder element index, which triggered the application's double-click handler.
- Entered the Folder isolation layer and observed the fourth child as `Legacy Folder Checklist D0` with `Preserve legacy folder item` checked.
- Opened that migrated Folder child's full Checklist detail view and observed the exact title, item text, checked state, and `1/1` count.
- Located the user-facing extraction route in source: a Folder-child context-menu action labeled `Move to canvas…` invokes the already-regression-tested store operation.
- Closed the Checklist DetailSurface and returned to the expanded Folder layer.
- The CUA driver does not expose an `app.rightClick` convenience method; that attempt changed no state. Continue with the documented `click` button option against a fresh element index.
- The first secondary-click retry used the wrong option name (`button`) and was treated as a left click, reopening Checklist detail. Reset/rebound the CUA session to recover the full API documentation; the correct option is `mouseButton: 'right'`.
- Returned to the Folder layer and opened the child menu with the correct secondary-button option. The migrated Checklist exposes `Open Focused`, `Copy`, `Move Out`, and `Delete`.
- Activated `Move Out`. The Folder member count dropped from 4 to 3, the canvas count rose from 12 to 13, and `Legacy Folder Checklist D0` appeared as a selected top-level Checklist extension.
- Opened the extracted node's DetailSurface and reconfirmed its exact title, checked item, and `1/1` state.
- Compared the UI result with the persisted canvas manifest. The instance and original Widget records remain lossless, but the manifest did not save the move: it still contains 12 top-level nodes and four Folder children.
- Paused Phase 10 completion to diagnose this generic extraction-persistence defect test-first; reloading now would intentionally demonstrate the rollback but would not explain the missing save trigger.
- Traced `Move Out` through `useContextMenu` into `moveFolderChildToCanvas`; the store mutation itself is structurally correct and replaces `nodes`, so the central persistence subscriber should see it.
- Found a matching persistence-hook hazard: `skipHydrate` unconditionally drops the first hydrated layout change. On the fresh compatibility restart, extraction was the first user mutation, explaining why no debounce save was scheduled.
- Reviewed the persistence test suite and hydration/view-switch state transitions. Chose a narrow hook fix: initialize the skip flag from the store's actual hydration state, with a new regression proving the first post-mount mutation is saved when the store is already hydrated.
- Added the first-mutation persistence regression. It established the intended red state: 10 existing tests passed, while the new case waited the full debounce and observed zero manifest saves.
- Changed `useCanvasPersistence` so its hydration-skip flag reflects the store's state at mount instead of always starting true.
- Re-ran the persistence hook suite: 1 file / 11 tests passed, including the new first-mutation case and the existing pre-hydration/view-switch/flush regressions.
- Confirmed Vite hot-updated the route after the hook change. The dev console emitted a large burst of `ResizeObserver loop completed with undelivered notifications` warnings during the prior Folder/detail layout; they did not trigger the app error boundary, and HMR completed.
- The HMR remount reloaded the stale manifest and rolled the unsaved extraction back exactly as predicted: Folder returned to 4 items and the canvas to 12 nodes. Proceeding with a clean first-mutation desktop retest on the fixed hook.
- Re-entered the Folder after the HMR remount and reopened the legacy Checklist's standard context menu; no layout mutation has occurred yet, so the upcoming `Move Out` remains the first post-hydration mutation.
- Executed `Move Out` as the first layout mutation after remount; the UI again shows 13 top-level nodes, Folder count 3, and the restored Checklist.
- Waited longer than the 2.5-second manifest debounce before inspecting disk, so the next result distinguishes a real save from transient in-memory state.
- Disk still showed 12 top-level nodes and four Folder children after the fixed-hook desktop retest; marked the fix incomplete rather than accepting the unit result.
- Polled the latest desktop process output. It contained no visible manifest-save failure in the returned tail, but thousands of repeated ResizeObserver warnings dominated/truncated the log, so continue diagnosis through deterministic tests and lifecycle source rather than log absence.
- Reconciled the route lifecycle: persistence subscribes before asynchronous hydration, so the first hook fix should have handled the normal hydration transition.
- Triggered a real window blur after the extracted state remained visible. The hook's blur path flushes immediately rather than waiting for layout quiescence; the next disk read will distinguish debounce starvation from a missing dirty/RPC state.
- The manifest remained 12/4 after the app-switch attempt. Classified this as inconclusive because the CUA shortcut did not expose whether the renderer received `blur`, and the running Fast Refresh session may have retained pre-fix hook state.
- Fully stopped desktop session `48772`; Electrobun shut down gracefully and the Vite sibling exited on the second interrupt. The disk fixture is still ready for a clean restart against the fixed bundle.
- Started a clean desktop process in session `83457` from the still-unextracted 12/4 manifest using the rebuilt fixed bundle. Electrobun launched successfully; Vite startup was still completing when the first process snapshot was captured.
- Confirmed the clean process rendered the rebuilt bundled view (`views://mainview/index.html`) with 12 nodes and Folder count 4. This avoids Fast Refresh state retention and is the authoritative desktop retest environment.
- Two separate click calls were not recognized as a double-click in the bundled view. Retried with the documented `clickCount: 2` option and entered the Folder successfully; no canvas data changed during the failed attempt.
- On the clean rebuilt process, opened the migrated child menu and executed `Move Out` as the first user layout mutation. UI again reached 13 top-level nodes and Folder count 3.
- Waited past the debounce and re-read disk; it still showed 12/4. Ruled out Fast Refresh state retention as the explanation and kept the persistence defect open.
- Observed that Folder isolation remains active after extraction. Next discriminator: close that layer, allow measurements to settle, and see whether the pending debounce finally saves.
- Pressed Escape to close Folder isolation and waited another full debounce interval with the normal top-level canvas visible.
- After Folder isolation closed, the manifest saved successfully as 13/3 and preserved the extracted node as the same Checklist extension reference.
- Reloaded the rebuilt bundled renderer. It restored 13 nodes, Folder count 3, and the exact extracted Checklist title/item, completing Phase 10 desktop acceptance without type or data loss.
- Advanced the active plan to Phase 11, Extension Gap-Closure T6. The Search-result navigation observation is carried forward as D1 evidence, not broadened into D0.
- Read the complete gap-closure plan's T6 requirements, current private search mappings, shared built-in ID module, and direct tests.
- Selected a boundary-safe centralization: shared literal mapping helpers beside the stable IDs, direct exhaustive tests there, and unchanged Bun search-result types/semantics at the consumer.
- Added red direct expectations for every built-in search kind, all Productivity widget kinds, and unknown third-party fallback.
- Running that file returned `No test files found`: current Vitest config excludes `src/shared`. Paused implementation to reconcile test collection rather than leave a non-executing regression file.
- Audited all shared tests and Vitest configuration. Found nine existing pure shared-extension suites; selected a small include/coverage-glob update so these tests are actually enforced.
- Extended Vitest test and coverage collection to `src/shared/**` with matching shared test exclusions.
- Re-ran `builtinIds.test.ts`: its two existing tests passed and the two new mapping cases failed because the shared helpers do not yet exist, establishing the intended T6 red state.
- Moved the two mapping helpers into `src/shared/extensions/builtinIds.ts` using an exhaustive built-in search-kind record plus a Productivity-only legacy kind record; removed the private switches from `src/bun/search.ts`.
- Focused T6 verification passed: shared mapping and Bun search suites, 2 files / 19 tests.
- Inspected RFC-1 §0/§14.1/§28, the behavior matrix, T6 completion instructions, and every current documentation link to the gap-closure plan.
- Identified the exact documentation changes: host-display mapping note, menu compatibility revision/addendum, matrix verification marker, completed-plan move, and link rewrites outside historical planning records.
- Ran all newly collected shared tests: 8 files passed; `presentation.test.ts` exposed one dormant sanitizer failure where script contents survive tag stripping.
- Classified the shared sanitizer failure as an in-scope D0 data/safety regression and paused documentation completion until the existing expected behavior is restored.
- Updated the shared Presentation sanitizer to drop script/style blocks including their contents before generic tag stripping.
- Re-ran all shared suites: 9 files / 34 tests passed.
- Strengthened the sanitizer regression with a `<style>` block in the accessibility label; the shared boundary now explicitly covers both dangerous block types.
- `bun run check` found one formatter-only wrapping difference in the new unknown-ID widget-kind assertion; no semantic/lint errors were reported.
- Applied the formatter-prescribed wrapping and strengthened the sanitizer test with a style-block case.
- Updated RFC-1's revision record, §14.1 host-display mapping rule, and §28 menu compatibility explanation; updated the behavior matrix's verification status, the gap-closure T6 checklist/evidence, PRD desktop-acceptance wording, and D0-1/D0-2 development-plan status.
- Kept the gap-closure document under `In Progress` until final automated regression is recorded; its own status now says exactly what remains.
- Repository check passed after T6/docs/sanitizer changes: 442 files checked with no fixes or errors.
- Started the full Vitest suite in session `48574`; awaiting its complete result before moving the T6 plan.
- The running suite reproduced the known SearchDialog/Node 26 localStorage setup failure (22 cases) and additionally showed router/Bun main-process timeouts while the desktop acceptance process was still running.
- Identified likely test contamination: the live desktop/Vite process occupies or probes the same dev-server/host resources exercised by `router.test.tsx` and `src/bun/index.test.ts`. Let the run finish for a complete baseline, then stop desktop session `83457` and rerun in a clean environment.
- Stopped desktop session `83457` while the full suite continued: Electrobun exited gracefully and the HMR sibling exited on the second interrupt. The disposable acceptance data remains at the verified persisted 13/3 state.
- The contaminated full run continued surfacing timeout-sensitive failures (SettingsApp, DatePicker) after the desktop process stopped, consistent with the already-started worker pool being resource-starved; route tests were skipped in that run and jsdom also emitted its known unimplemented media-load diagnostic.
- Continue waiting only for the final accounting, then discard this run as contaminated and rerun from a clean process baseline.
- Contaminated full-run final accounting: 155 files / 1381 tests passed; 6 files failed with 33 failures and 32 skipped. Failures split into the known SearchDialog setup issue plus timeouts/dev-server misdetection while the desktop process overlapped the run.
- Inspected test setup and Node's global descriptor. Confirmed Node 26's configurable `localStorage` getter returns `undefined`; selected a deterministic memory Storage in `setup-dom.ts`, followed by an isolated SearchDialog rerun and then a clean full run.
- Added the deterministic jsdom memory Storage in `src/test/setup-dom.ts`, including per-test clearing.
- Re-ran SearchDialog alone: 1 file / 22 tests passed, removing the previous Node 26 full-suite baseline blocker.
- Captured the Vite console trace: React reported an uncached `getSnapshot` in `<CanvasContextMenu>`. Traced it to the extension-node selector returning a newly allocated reference object for every Zustand snapshot.
- Added the focused-extension/global-keyboard regression test. It established the intended red state: 25 existing keyboard tests passed and the new test failed because `undoInstance` received zero calls.
- The first clean parallel full suite completed with 160/161 files and 1,445/1,446 tests passing; the only failure was the existing router hash-history test timing out under concurrent workers, while its isolated run passed 3/3.
- A serial file-level rerun with `--fileParallelism=false --maxWorkers=1` completed cleanly: 161/161 files and 1,446/1,446 tests passed. This closes the automated T6 regression gate; the parallel timeout is recorded as runner contention rather than a product failure.
- Advanced the active plan to Phase 12, D0-3 lifecycle and damaged-data regression coverage.

### Errors
| Error | Resolution |
|-------|------------|
| First desktop-findings patch had an invalid empty hunk boundary | Reapplied the same updates with valid per-file patch hunks. |
| CUA reported the app bundle changed during the first toggle attempt | Refreshed the full accessibility state, derived fresh indices, and repeated the action successfully without assuming stale UI state. |
| Checklist DetailSurface `Cmd+Z` removed the canvas node instead of undoing the item edit | Recovered the node with `Cmd+Shift+Z`; investigate `useCanvasKeyboard` active extension-instance routing and add a failing regression test before implementation. |

### Errors
| Error | Resolution |
|-------|------------|
| First plan-extension patch did not match the exact Current Phase sentence | Re-read the current plan and reapplied the patch using the actual completion text. |

## Session: 2026-09-07 — D0-3 Lifecycle Coverage

### Current Status
- **Phase:** 12 - D0-3 Lifecycle and Damaged-Data Regression in progress

### Actions Taken
- Added renderer store coverage for per-instance history isolation, opaque unknown-type state, and missing/corrupted load-error records.
- Added a per-type canvas lifecycle matrix for all seven built-in extension Canvas Types: duplicate, paste, instance-id remapping, Folder-child recursion, delete/undo/redo reference behavior, and reload hydration.
- Verified the new lifecycle suites: extension-instance store 1 file / 5 tests passed; canvas extension lifecycle passed after expanding paste/delete/reload across every built-in type.
- Added a visible failure assertion for failed extension cloning; source references remain intact and the user-facing toast is emitted.
- Added Bun coverage for malformed JSON (corrupted result) and unknown Canvas Type load/clone opacity; existing attachment hydration coverage remains green and explicit AssetNode missing-state tests cover the user-visible attachment fallback.
- Added `ExtensionNode` fallback tests for missing instances and unknown types. The missing-instance test exposed and then verified the HostShell availability fix: corrupted records now show “The original file is kept” instead of the generic newer-type message.
- Targeted D0-3 verification passed across the Bun index/instance-store, renderer lifecycle/fallback, HostShell, and AssetNode suites.
- Final serial full regression passed after D0-3 changes: 164 test files / 1,486 tests, using `--fileParallelism=false --maxWorkers=1`. Existing act/jsdom media/localStorage diagnostics remain non-failing warnings.
- Marked Phase 12 complete and advanced to Phase 13 closeout verification.
- `bun run check` passed after formatting the new lifecycle/fallback coverage: 445 files checked with no fixes or errors.

## Session: 2026-09-07 — D0 Closeout

### Current Status
- **Phase:** 13 - D0 Closeout Verification complete

### Actions Taken
- Moved the completed extension gap-closure record from `docs/features/In Progress/` to `docs/features/` and repaired direct documentation links.
- Synchronized PRD, development plan, technical specification, RFC-1, and the behavior matrix with the accepted D0-1 through D0-4 behavior and evidence.
- Confirmed `bun run check` passes for 445 files and the clean serial full suite passes 164 test files / 1,486 tests.
- Ran `git diff --check` and stale-link/status searches successfully; no old gap-closure path or unfinished D0 status remains in the tracked docs.
- Kept the known `bun run type-check` baseline separate: dependency diagnostics in `node_modules/electrobun` and the existing missing `beforeAll` import remain, with no new touched-source errors found.
- Re-ran `bun run type-check` after the final test-only assertion cleanup; the result is unchanged and contains only those known dependency/import baseline errors. The focused Checklist DetailSurface suite passes 17/17.
- Recorded the remaining Search-result click-through observation as D1 reachability work and kept public-plugin P0 outside this D0 closeout.

## Session: 2026-09-07 — D1-1/D1-2 Search Reachability

### Current Status
- **Phase:** 15 - D1-2 Folder hit-to-open navigation in progress

### Actions Taken
- Re-read the active planning skill and the D1-1 findings before continuing implementation.
- Added a shared `src/shared/searchTypes.ts` contract with explicit view, edge, node placement, Folder-child, and future unlinked content targets; renderer search types now re-export the shared definitions and Bun search re-exports the same aliases.
- Added backend and in-memory fallback target metadata while preserving existing generated result IDs. Targets distinguish top-level, Group, detached, and Folder-child placements and attach stable Note/Widget/Extension/attachment content references.
- Added red search-contract coverage for top-level/Group/detached nodes, repeated Note references, Folder Widget children, Folder-child fallback results, view/edge targets, and the unlinked target shape; focused implementation turned the first 5 failing assertions green.
- Extended backend Folder traversal to synthesize child references for Card/media/link metadata and Note sidecars, closing the previous Folder Card body-search gap without duplicating Widget/Extension store scans.
- Added route-level red tests for same-view and cross-view Folder-child targets. The navigation implementation now validates the owner/child, enters the Folder after hydration, resolves the render-only expansion node, opens focusable children with `folderId`, and leaves non-focusable legacy children visible in the Folder layer.
- Routed same-view Folder hits through the pending target state so SearchDialog no longer treats hidden children as top-level React Flow nodes; cross-view targets preserve the existing save-before-switch path.
- Updated PRD and development-plan text to record the D1-1 contract and the D1-2 navigation boundary; unlinked content remains contract-only until D1-3.
- Verification so far: focused search/route suites pass (5 files / 87 tests), the full serial suite passes (165 files / 1,494 tests), `bun run check` passes for 447 files, and `git diff --check` is clean.
- `bun run type-check` still reports only the known `node_modules/electrobun` diagnostics and the pre-existing missing `beforeAll` import in `src/mainview/routes/index.test.tsx`; no D1-1/D1-2 source error remains.

### Errors
| Error | Resolution |
|-------|------------|
| First D1-1 patch attempted multiple operations against the same file in one `apply_patch` call | Reapplied each file's hunk separately. |
| First D1-2 route test run hit `Cannot access 'folderExpansionNodes' before initialization` because the effect dependency array evaluated before the later const declaration | Moved the existing `folderExpansionNodes` memo above the pending-search effect and kept the render path using the same memo. |
| First cross-view route test used one-shot `loadCanvas` mocks and exposed a stale initial hydration race, leaving the test on the default canvas | Switched the test fixture to a view-id keyed loader and simulated the post-switch `setActiveView` boundary; SearchDialog separately covers save-before-switch and pending-target creation. |
| Type-check initially rejected the route's expanded-child predicate as `unknown` | Added an explicit `node is Node<FolderExpandedChildData>` predicate so the child data is narrowed before constructing `FocusedItem`. |
| D1-2 desktop smoke launch exited with signal 6, and the CUA reported that the Mac is locked | Kept the disposable workspace untouched; rely on the passing route/search integration tests for this turn and leave a manual desktop click-through for after the machine is unlocked. |

## Session: 2026-09-07 — D1-3 Unlinked Recovery Entry

### Current Status
- **Phase:** 16 - D1-3 Detached / Unlinked Recovery Entry in progress

### Actions Taken
- Resolved OD-2 as the conservative option: keep unlinked files out of global canvas search, and make Note Library the formal read-only browse/recovery entry.
- Reused the existing `rpcScanUnlinkedNotes` / `scanUnlinkedNotes` inventory. It covers nested Markdown, BlockNote sidecars, legacy Widget JSON, and Extension instance JSON while honoring active and trashed manifest references.
- Added an Unlinked Files section to `LibraryPopup`. Stable-note Markdown and BlockNote sidecar rows expose an explicit Place on canvas action; no-id Markdown and typed Widget/Extension rows remain visible but have no automatic conversion or deletion action.
- Stable recovery delegates to `canvasStore.createNode` with `canEnterGroup: false`, preserving a top-level Card placement and the existing manifest persistence path. BlockNote sidecars pass noteId only, so their JSON path is never interpreted as Markdown.
- Added UI regression coverage for successful and failed scans, no-id rows, typed records, Markdown recovery, and BlockNote sidecar recovery. Added the placement override to `CreateNodeOptions` so normal node creation behavior is unchanged unless recovery opts out of Group adoption.
- Updated PRD §2.8 / §7.1 / OD-2 / TODO-1/2 and the development plan D1-1/2/3 status and acceptance boundary.
- Focused verification: LibraryPopup + resolvePlacement suites pass (2 files / 20 tests), cleanup safety passes (1 file / 5 tests), and the createNode recovery placement regression passes; `bun run check` passes for all touched source/tests.
- Full serial verification passes after D1-3 changes: 165 test files / 1,499 tests with `--fileParallelism=false --maxWorkers=1`; existing React act, jsdom media/navigation, and Node localStorage diagnostics remain non-failing warnings.
- Repository-wide `bun run check` passes for 447 files. `git diff --check` is clean. `bun run type-check` still reports only the existing `node_modules/electrobun` diagnostics and the pre-existing missing `beforeAll` import in `src/mainview/routes/index.test.tsx`; no D1-3 source/type error remains.
- Phase 16 automated gate is complete. Desktop click-through remains deferred until the Mac is unlocked; no workspace or user data was mutated by the blocked launch attempt.

### Errors
| Error | Resolution |
|-------|------------|
| Initial LibraryPopup test mock replaced the whole RPC module and omitted `rpcLoadAttachment`, producing an unhandled NotePreview import error | Switched to a partial `importOriginal` mock and overrode only `rpcScanUnlinkedNotes`; the full LibraryPopup suite then passed 13/13. |
| Recovery initially used the normal Card placement rule, which could absorb a recovered note into a Group when the viewport overlapped it | Added the narrow `CreateNodeOptions.canEnterGroup` override and set it to `false` for unlinked recovery; existing placement defaults remain unchanged. |
| The first sidecar test accessed `vi.fn`'s inferred zero-argument call tuple and introduced two type-check errors | Cast the captured mock call through `unknown` to the expected three-argument shape; the remaining type-check output is back to the known dependency/import baseline. |

## Session: 2026-09-07 — D1-4 Reachability Matrix

### Current Status
- **Phase:** 17 - D1-4 Reachability Matrix automated implementation complete; desktop click-through pending until the Mac is unlocked

### Actions Taken
- Added the shared deterministic fixture at `src/test/reachabilityMatrix.ts`, covering top-level, Group, Folder child, detached, and unlinked records across Note, Sticky, Image, Asset, Link, Recording, Folder, Group, Widget, and Extension shapes.
- Recorded explicit not-applicable combinations: new Sticky/Widget/Extension nodes cannot enter Folder, while legacy Folder children remain searchable/browseable; Recording cannot be detached.
- Added backend matrix assertions for every searchable position/type, including shared content references and exact `SearchResultTarget` values. The same test writes unlinked Markdown, BlockNote sidecar, Widget, and Extension files and proves they remain excluded from global canvas search.
- Added current-view fallback assertions for all supported fallback combinations, including Folder-child targets, plus an explicit check that each not-applicable case has a reason.
- Added browse/entry assertions for `buildLibrary`, `DetachedNotesSidebar`, and `LibraryPopup`, and a fixture-driven route assertion that enters the owning Folder and focuses the real child. Stable Markdown and sidecar recovery still preserve top-level placement and typed/no-id boundaries.
- Focused matrix verification passed across 6 files / 7 selected tests. Full serial verification passed: 165 test files / 1,504 tests with `--fileParallelism=false --maxWorkers=1`.
- Synchronized PRD, development plan, and the Canvas Type behavior matrix with D1-4 automated completion and the remaining desktop-only gate. `bun run check` passed for 448 files; `git diff --check` is clean. The final `bun run type-check` baseline remains unchanged: only `node_modules/electrobun` diagnostics and the pre-existing missing `beforeAll` import in `src/mainview/routes/index.test.tsx` are reported.

### Errors
| Error | Resolution |
|-------|------------|
| The first matrix library assertion expected six Folder children, but Recording is intentionally not focusable in the library | Count only the five browseable Folder entries and keep Recording in the explicit not-applicable/unsupported coverage. |
| Fixture-driven Detached Sidebar test triggered an omitted `rpcLoadAttachment` export in its narrow mock | Added the missing no-op RPC export; the test now passes, with existing React act/media diagnostics remaining non-failing warnings. |
| Fixture-driven route target spread initially selected the unlinked target union during type-check | Narrowed the target with an explicit `target.type === 'folder-child'` guard before overriding its test view id. |

## Session: 2026-09-07 — D2-1 Synthetic Project Baseline

### Current Status
- **Phase:** 18 - D2-1 synthetic project fixture and automated baseline complete; desktop D1/D2 acceptance pending until the Mac is unlocked

### Actions Taken
- Added `src/test/projectFixture.ts` with deterministic IDs and a fresh fixture builder for two views, shared/Folder/detached/imported notes, media attachments, links, a Group, a Folder, Productivity instances, legacy Folder widget compatibility, and unlinked records.
- Added `writeD2ProjectFixture(workspacePath)` to create a disposable on-disk workspace with valid workspace/view manifests, BlockNote sidecars, imported Markdown, tiny PNG/PDF/WAV attachments, extension-instance JSON, legacy Widget JSON, and unlinked Markdown/typed records. The writer intentionally overwrites only the fixture paths in the caller-provided workspace.
- Added `src/bun/projectFixture.test.ts` to assert deterministic inventory and supported placement constraints, then exercise backend search for cross-view shared Note fan-out, imported Markdown, Folder-child typed target, detached Note, Productivity search kind, and unlinked exclusion.
- Synchronized `docs/development-plan.md` and `docs/PRD.md`: D2-1 is now recorded as an automated baseline with the fixture path and initial-state inventory; D2-2/3 and desktop acceptance remain pending.
- Focused verification passed: `src/bun/projectFixture.test.ts` 1 file / 2 tests. Full serial verification passed: 166 test files / 1506 tests with `--fileParallelism=false --maxWorkers=1`. `bun run check` passed for 450 files and `git diff --check` is clean.
- `bun run type-check` remains at the known baseline: diagnostics are confined to `node_modules/electrobun` (unknown/`three` types) and the pre-existing missing `beforeAll` import in `src/mainview/routes/index.test.tsx`; no new fixture or D2 source errors were reported.
- Phase 18's automated gate is complete. The same fixture is ready for the real desktop D1 click-through and D2 positive/failure flow after the Mac is unlocked; D2-2 export changes have not started.

### Errors
| Error | Resolution |
|-------|------------|
| Initial fixture draft contained formatter-only long literals, import ordering, and an unused expression in the unlinked writer | Applied the repository formatter's exact wrapping/order, removed the unused expression, and reran `bun run check`; no semantic issue remained. |
| Full type-check still exits non-zero | Separated the unchanged Electrobun dependency diagnostics and the existing route-test `beforeAll` import from the new D2-1 fixture; runtime tests and check remain green. |

## Session: 2026-09-07 — Desktop D1 Acceptance and D2-2 Positive Flow

### Current Status
- **Phase:** 19 - D2-2 正向项目流程与导出已验收；D2-3 故障流程待执行
- **Workspace:** disposable fixture `/private/tmp/ghostboard-d2-SJakeS`，所有操作限定在临时副本，未使用或修改用户默认 workspace

### Actions Taken
- 真实 GhostBoard 桌面门禁完成：Folder 独有关键词搜索进入正确子 Note；共享 Note 搜索显示研究/交付两个画布结果并能切换到 Delivery；Note Library 的稳定 ID Unlinked Note 放回画布后节点 7→8、unlinked 9→8，重启后内容和放回结果保持。
- 在 Research 画布创建并编辑“项目结论” Note，保存四行结论和依据；关闭详情后画布可见，重启后仍可打开并继续阅读。
- 走查本地图片 FocusedView、Folder 内 PDF 预览、Link 详情/URL、Recording 播放/暂停，以及 Delivery 画布的 Pomodoro/Reminder 画布内控件；未把 Productivity 新节点放入 Folder。
- 通过画布导出菜单生成 `D2-Research-Canvas.json`（schema `ghostboard-canvas-export/v2`）和 `D2-Delivery-Canvas.png`（2644×2132 RGBA）；通过右键生成 Markdown 导出目录，实际包含 5 篇 Note 和 `index.md`。
- 通过 Settings → Workspace 生成 `ghostboard-workspace-2026-09-07T11-20-29.zip`；文件系统 `unzip -t` 通过，压缩包包含 53 个成员，覆盖 views、content/sidecar、extension instances、legacy widgets 及 PNG/PDF/WAV attachments。
- Markdown 导出当前明确只包含 Note 文档（含 detached Note），媒体附件由 Workspace ZIP 统一备份；Canvas JSON 的可见节点数与 UI 节点数存在 detached 排除差异，属于两个导出范围的既定区别，暂不判为遗漏缺陷。

### Verification
- 自动化基线（本轮桌面操作前）：串行全量 166 files / 1506 tests；`bun run check` 450 files；`git diff --check` clean。
- `bun run type-check` 仍仅报告已知 `node_modules/electrobun` 依赖诊断和既有 `src/mainview/routes/index.test.tsx` 缺少 `beforeAll`，未发现本轮触及源码的新错误。
- 当前只完成 D2-2 正向路径；离线、缺失/损坏附件、保存失败、跨视图删除、不可写导出目录和撤销后重启仍属于 D2-3。

### Notes
- 创建 Note 菜单时曾在临时夹具中误留一张空白 Sticky；它只存在于 disposable workspace，未触碰用户数据，后续故障测试可一并忽略或重建夹具。

## Session: 2026-09-07 — D2-3 Failure-Path Audit and Title-Only Save Fix

### Current Status
- **Phase:** 20 - D2-3 故障路径收口进行中；D2 尚未整体宣称完成
- **Workspace:** 仍使用 disposable fixture `/private/tmp/ghostboard-d2-SJakeS`；本轮没有触碰默认 workspace

### Fault Injection Evidence
- 将 Folder 内 PDF 暂时移出 attachments 后，从真实 FocusedView 打开该记录，UI 明确显示 `Media file could not be loaded.`；恢复原文件后再次可读。随后把 PDF 临时替换为 ASCII 非 PDF 内容，复现 WebKit 空白 iframe；加入 `%PDF-` 签名检查后桌面同样显示明确错误，原文件已恢复。
- 删除 Delivery 画布中共享 Note 的单个引用后，磁盘只移除该 view 的引用，Research 画布仍保留同一 `note_d2_shared`；恢复 Delivery manifest 后重启，两个引用均恢复。说明跨视图共享内容不会因删除一个引用而静默丢失。
- 对 Delivery 共享 Note 做删除后立即执行 `super+z`，UI 节点和磁盘 manifest 均保留；随后完整重启仍能看到共享 Note，撤销后的重启边界通过。
- 将导出目录权限设为只读后触发 JSON 导出，UI 显示 `EACCES: permission denied, open '/private/tmp/ghostboard-d2-export-readonly/D2-Delivery-Canvas.json'`，没有错误的成功 toast，也没有伪造导出文件；权限恢复后导出路径仍可用。
- 将 Folder 内 Link URL 临时改为 `https://offline.invalid/d2/evidence` 并保存，UI 显示 `Retry preview`、`Preview unavailable` 与 `offline.invalid`，网络失败被显式保留而不是误报 ready；随后恢复夹具 URL/ready 状态。这个测试只作用于临时扩展实例。
- 以上故障均在同一副本中完成，未删除用户资料或修改默认工作区；此前创建的空白 Sticky 也只存在于该临时副本。

### Reproduced Reliability Blocker and Fix
- 桌面走查发现 BlockNote 标题只改标题、不改正文时，失焦不会进入保存队列；这是可复现的静默持久化阻断。
- `src/mainview/components/editor/BlockNoteEditor.tsx` 现在追踪 title dirty 状态：标题失焦时序列化当前 blocks/Markdown，调用 `saveDebounced` 并 `flushNow`；正文编辑仍沿用原有变更路径。
- 真实桌面回归：标题改为临时值后显示 `Saved at …`，sidecar revision 增加；将 BlockNote 目录设为不可写时显示 `Save failed` 及 `Could not save this note. We'll retry on your next edit.`，恢复权限并再次编辑后保存成功。
- 新增 `src/mainview/components/editor/BlockNoteEditor.integration.test.tsx`，锁定标题-only 失焦会提交当前 blocks/Markdown 并 flush 的行为。

### Verification
- `bun run check`：451 files checked, no errors。
- focused BlockNote regression：1 file / 1 test passed。
- clean serial full suite：167 test files / 1,508 tests passed（`--fileParallelism=false --maxWorkers=1`，140.08s）。剩余输出只有既有 React `act(...)`、jsdom media/navigation 和 Node localStorage diagnostics。
- `git diff --check`：clean。
- `bun run type-check` 仍只有 `node_modules/electrobun` 依赖诊断和既有 `routes/index.test.tsx` 缺少 `beforeAll`（exit 2）；没有新增触及源码的类型错误。

### D2-3 Closeout Notes
- 附件的可重复字节损坏测试已完成：临时 PDF 替换为 ASCII 非 PDF 内容时，WebKit 先前会出现空白预览；加入 `%PDF-` 签名检查后，桌面显示 `Media file could not be loaded.`，并以 AssetNode 回归测试固定。原 PDF 已恢复，损坏样本移出夹具保存为 `/private/tmp/ghostboard-d2-export/d2-research-report.pdf.corrupt-observed`。
- 已明确记录“本地编辑可离线保存”与“Link/AI 依赖网络时失败”的边界：BlockNote 在 `aiEnabled: false` 本地配置下仍通过 sidecar RPC 保存；`offline.invalid` Link 预览显示 `Retry preview` / `Preview unavailable`，网络请求抛错回归为 `failed`；AI 未配置时本地 `/ai/chat` 契约返回带 CORS 的 `503`。没有可用凭据，因此不宣称真实供应商流式响应行为。
- D2-3 已完成阶段验收；所有实测路径均有明确失败提示、恢复结果或引用边界，没有新的可复现阻断。结论为“不新增 D3 交互”，公开插件 P0 保持独立。

## Session: 2026-09-07 — D2-3 Boundary Record and Closeout

### Current Status
- **Phase:** 20 complete — D2 正向与故障流程均已验收；下一步只在出现新的端到端阻断时启动 D3-1，或按独立计划进入公开插件 P0。
- **Workspace:** 默认 workspace 指针已恢复为 `/Users/laogui/.ghostboard/dev/workspace`；桌面走查使用的 disposable fixture `/private/tmp/ghostboard-d2-SJakeS` 未写入默认 workspace。

### Boundary Evidence
- 本地编辑路径不依赖远程 AI：`BlockNoteEditor.integration.test.tsx` 以 `aiEnabled: false` 挂载编辑器，标题-only 失焦仍序列化 blocks/Markdown、进入 debounced save 并 flush；桌面 sidecar revision 也已确认增长。该路径使用本地 Bun RPC，不能把远程 AI 不可用误判为本地编辑失败。
- Link 网络能力失败保持显式：桌面把临时 Link 改为 `https://offline.invalid/d2/evidence` 后显示 `Retry preview`、`Preview unavailable`；`linkPreview.test.ts` 另覆盖 fetch 抛错并断言返回 `failed`。原始 URL/ready 元数据已恢复。
- AI 能力失败保持显式：`ai.test.ts` 验证 AI 未配置时本地 `/ai/chat` 返回带 CORS 的 `503`；当前环境没有供应商凭据，未伪造或宣称真实供应商超时/流式响应。

### Closeout Decision
- D2-3 的离线、缺失/损坏附件、保存失败、共享引用删除、不可写导出、撤销重启与 AI/网络边界均已记录；两项真实可靠性阻断已修复并有邻近回归测试。
- 本轮没有证据要求新增大纲、网页剪藏、引用溯源或其他 D3 交互；保持“no new feature”决策，公开插件平台继续单独排期。

### Verification
- focused boundary regression：3 files / 42 tests passed（Link preview、BlockNote title-only、Asset corrupt PDF）。
- clean serial full suite：167 test files / 1,509 tests passed（`--fileParallelism=false --maxWorkers=1`，147.82s）。
- `bun run check`：451 files checked, no errors；`git diff --check` clean。
- `bun run type-check` 仍为已知基线失败：仅 `node_modules/electrobun` 的依赖类型诊断与既有 `src/mainview/routes/index.test.tsx` 缺少 `beforeAll`；本轮触及源码未新增类型错误。
