# Progress Log

## Session: 2026-09-11

### Current Status
- **Phase:** Complete
- **Started:** 2026-09-11
- **Completed:** 2026-09-11

### Actions Taken
- Recovered the active completed custom-canvas plan, verified its next step, current HEAD, and a clean working tree.
- Created and activated this isolated plan for the T2 conflict-resolution UI slice.
- Confirmed from the platform and SDK status that conflict recovery precedes the unified undo boundary.
- Mapped the current dirty-editor protection, body-sync veto, host save response, revision checks, focused editor ownership, and existing regression coverage.
- Froze an inline, accessible two-version recovery flow with explicit discard/keep actions, a failed-load retry state, and compare-and-swap semantics for intentional overwrite.
- Implemented the saver conflict state machine, workspace-bound canonical reload, automatic-retry pause, explicit keep/discard actions, canonical projection replacement, localized conflict banner, and distinct save indicator state.
- Added saver, real editor integration, and projection regressions. The first focused run exposed four test expectation/fixture mismatches; after correcting those, 3 files / 27 tests passed.
- Added a second-race regression and protected unresolved drafts on focused-view close with an explicit toast action. Type checking, style checks, and 4 files / 46 focused tests pass.
- Packaged attempt 1 reached every pre-conflict content check and confirmed the dirty draft survived the plugin refresh, but timed out before the banner because the probe dispatched a synthetic `blur` event that did not trigger React's delegated `onBlur`. Updated the probe to focus the real textarea and invoke its native `blur()` method.
- Packaged attempt 2 passed both conflict choices but reused the existing body-history fixture, so the intentional local overwrite changed the restart expectation. Moved the recovery scenario to its own sidecar note to keep prior body undo/redo evidence independent.
- Final packaged run passed initial conflict recovery and the complete restart regression. After the final draft-serialization guard, the canary archive was rebuilt and reverified; its SHA-256 is `b3ce87d793436cf60531b1cd09c30afa49fb332dddaa22b9736ffdcee912eee5`.
- Full serial regression passed on the final source: 206 files / 1829 tests. The two jsdom not-implemented messages are existing navigation/media warnings; Vitest reported zero failures.
- Updated the SDK reference, platform/development status, prior canvas forward link, human-readable evidence, and machine-readable package result. Documented unified undo as the next design boundary rather than claiming multiple independent stacks are already global history.
- Reviewed the final source and added a serialization guard so `Keep my version` cannot consume an older payload while a newer BlockNote change is still converting to Markdown; focused coverage now includes both the state transition and disabled UI.

### Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Initial focused conflict regression | New recovery behavior passes | First run: 4 assertion/fixture mismatches | corrected |
| Focused conflict regression after corrections | No failures | 3 files / 27 tests passed | pass |
| Final focused regression | Conflict state, draft serialization guard, editor integration, close protection and projections pass | 4 files / 48 tests passed | pass |
| Packaged content/conflict attempt 1 | Reach conflict recovery actions | Pre-conflict checks passed; synthetic blur did not trigger the save | retrying |
| Packaged content/conflict final | Both explicit conflict choices and prior restart behavior pass | Initial and restart phases passed | pass |
| Type checking | No project diagnostics | Passed; only the documented 29 dependency diagnostics were ignored | pass |
| Ultracite | No errors | 638 files checked | pass |
| Full serial Vitest regression | No failures | 206 files / 1829 tests passed | pass |

### Errors
| Error | Resolution |
|-------|------------|
| First focused test run had four failures from a generic-error expectation changed accidentally, an old conflict fixture without `conflict: true`, the new workspace argument, and an intentionally duplicated comparison title | Restored the generic error expectation, made the conflict fixture match the host response, updated the call assertion, and used a plural text query. No production defect was involved. |
| Running type-check and focused tests concurrently briefly exposed a missing generated Paraglide runtime import | Re-ran them sequentially; generation and all focused tests passed. These two commands both touch/read generated localization output and must remain sequential. |
| Initial close protection used native `confirm`, rejected by the repository's `noAlert` rule | Replaced it with a non-blocking Sonner warning containing an explicit “Close and discard” action and added a regression. |
| Packaged attempt 1 timed out waiting for the conflict banner | The probe used a constructed `blur` event, while React delegates `onBlur` through the real focus transition. Focus the textarea and call native `blur()` on retry. |
| Packaged attempt 2 changed the old body fixture, causing its restart persistence assertion to fail after all new conflict checks passed | Isolated conflict recovery in a dedicated note/editor so existing body history and the new recovery history do not interfere. |
| Final Ultracite pass found the new banner props out of repository sort order | Reordered the two JSX attributes and reran the check successfully; no behavior changed. |
