# Task Plan: Plugin Management and Installation UI

## Goal
Deliver a user-visible, tested extension management flow that uses real host-side ZIP and URL installation capabilities, presents installed plugin state, and supports safe enablement management without claiming that unverified third-party panels can run.

## Next Step
Deliver the completed package-management slice and use the next P0 decision to choose an executable contribution path. Do not add activation controls until a verified runtime and dynamic registry exist.

## Current Phase
Phase 4

## Phases

### Phase 1: Discovery and UI Contract
- [x] Read the installer, persistent state, RPC bindings, settings shell, and i18n conventions
- [x] Identify which install/list/enable/disable actions already have real host implementation and which must be added
- [x] Define the first visible management flow and its security/status states
- **Status:** complete

### Phase 2: Host Integration
- [x] Add the smallest typed host API for plugin list, local ZIP selection, direct HTTPS URL preparation, explicit commit, and cancellation
- [x] Persist only validated metadata and actionable status; preserve transaction recovery semantics
- [x] Add focused host tests
- **Status:** complete

### Phase 3: Renderer Experience
- [x] Add a Plugins settings panel and navigation entry
- [x] Implement local ZIP selection, URL submission, review/confirmation, loading/error feedback, and stored-package cards
- [x] Label packages as stored rather than activated; omit dishonest enablement controls until a safe runtime exists
- [x] Add English/Chinese localization and renderer behavior tests
- **Status:** complete

### Phase 4: Verification and Delivery
- [x] Run formatting, TypeScript, focused tests, and settings-shell integration tests
- [x] Attempt the full suite and record its pre-existing external-sample/jsdom limitations
- [x] Record the product boundary in the P0 contract and redesign status
- **Status:** complete with known baseline test-environment failures

## Decisions Made
| Decision | Rationale |
| --- | --- |
| Prioritize a management/install UI over more view-container research | The user explicitly redirected the work to a visible extension-system flow. The rejected WebView candidate remains a release gate for third-party panels but does not prevent truthful management of installed packages. |
| Keep third-party panel activation unavailable unless there is a verified container | The UI must not make a package look runnable when its requested contribution cannot be safely hosted. Command-only packages may be installable only when the existing host contract safely supports them. |
| Ship package inspection and explicit commit before activation controls | The existing installer validates and journals packages but there is no dynamic third-party contribution registry or safe panel runtime. A toggle would be dishonest if it claimed to execute a package. The UI will clearly distinguish stored packages from runnable contributions. |

## Errors Encountered
| Error | Resolution |
| --- | --- |
| None yet | — |
