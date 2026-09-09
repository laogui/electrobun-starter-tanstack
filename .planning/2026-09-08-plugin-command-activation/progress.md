# Progress Log

## Session: 2026-09-08

### Current Status
- **Phase:** 4 - Verification and Delivery
- **Started:** 2026-09-08

### Actions Taken
- Began a new follow-on plan after completing the package-management UI.
- Restricted the next investigation to activating validated command contributions through existing constrained host infrastructure; panels, importers, and canvas types are explicitly out of this activation slice.
- Mapped the full stored-package → loader → QuickJS session → content batch
  path, plus the native menu and renderer command entry points.
- Established that app-local, workspace-path-digest-keyed grants are required
  to meet the PRD rule that copied workspaces never carry prior permissions.
- Added `PluginCommandGrantStore`: app-local `0600` grant file, workspace-path
  digest keys, exact package ID/version/digest matching, and loaded-source
  fingerprint matching.
- Extended `PluginManagementService` to expose command declarations/status,
  enable or revoke only required permissions, rebuild the native `Plugins`
  menu, and run enabled commands via the existing QuickJS/content-batch host.
- Added a Settings → Plugins second confirmation before command activation;
  enabled commands state their precise required-grant count. Panels, importers,
  and canvas types remain stored-only.
- Routed native plugin-menu actions to the renderer and reused title-batch
  projection plus Undo/Redo rather than creating an untracked mutation path.
- Updated the P0 contract, PRD status, and redesign status to distinguish the
  active command slice from still-unavailable contribution kinds.

### Errors
| Error | Resolution |
| --- | --- |
| Initial expected command test path did not exist | Located the runtime and content-batch coverage through the plugin source tree instead; no product issue. |
| `src/bun/index.test.ts` / full suite cannot complete in this checkout because the neighboring plugin-samples fixture setup is unavailable before RPC registration | Known pre-existing environment dependency; focused regression does not use it and passes. |

## Session: 2026-09-09

### Phase 5: Restore the Full Test Gate

- **Status:** complete
- Actions taken:
  - Reopened the completed command-activation plan for the requested full-gate and desktop-acceptance follow-up.
  - Confirmed that the full-suite block is caused by `src/bun/plugins/outOfRepoSamples.ts` resolving only an optional sibling checkout, even though a repository-controlled `fixtures/plugins/title-tools` source already exists.
  - Identified `outOfRepoSamples.test.ts` as the only test also requiring the companion panel sample.
  - First fixture-resolution attempt used one parent directory too many (`/Users/laogui/Projects/fixtures/plugins`); corrected it to the repository-root `fixtures/plugins` path before repeating tests.
  - The next run proved the fallback itself resolves; it also uncovered a stale preview-only title-tools fixture and a pre-RPC package-recovery await. Updating the controlled package and moving recovery behind first-paint/RPC startup is the corrective path.
  - Full-suite triage found two remaining command-test failures caused by the fixture now correctly invoking `content.applyBatch`. The focused probe tests are being updated to grant the declared write permission and record the safe no-op batch acknowledgement.
  - The first focused rerun left one recovery-after-crash session on its read-only grant list; updated that final session to use the declared read/write command grant before retrying.
  - The full run then reached 1,634 passing tests with one router timeout. Its test mutated jsdom's `location`, which is unstable under the concurrent suite; replaced that global mutation with an explicit router-factory protocol input.
  - Focused tests and type checking pass. The quality gate then reported a `noVoid` violation on the intentionally detached recovery promise plus formatter changes in the edited files; removed the unnecessary `void` and will format only the files changed in this follow-up.
  - A full rerun showed the router test still timing out because it dynamically re-imported after `vi.resetModules`, despite no longer mutating `location`. The test now imports the mocked module once and calls the new pure factory directly.
  - Static router import exposed Vitest mock-hoisting and the router library's narrow public TypeScript surface. Moved mock functions into `vi.hoisted` and added a local test-only presentation type so the mock configuration can be asserted safely.
  - Router-only tests and type checking passed; the final style check requested alphabetic ordering for the new test-only interface, which is corrected before the next full run.

### Phase 6: Desktop Command Acceptance

- **Status:** complete
- Actions taken:
  - Restored the regression gate: `src/bun/index.test.ts` and the sample-dependent plugin tests pass, then the full suite passes with 186 files / 1,637 tests.
  - `bun run type-check`, `bun run check`, and `git diff --check` pass. (The full jsdom run still prints pre-existing unsupported navigation/media-load warnings, but has a zero exit status.)
  - Completed the user-requested GUI-driven command-plugin acceptance in a disposable workspace.
  - Created and switched to `/tmp/ghostboard-plugin-desktop-dZuv0i`, then restarted GhostBoard. The fresh workspace loaded its default canvas, confirming the workspace switch took effect.
  - Created one note with the stored title value `  Hello   world ` and opened Settings → Plugins. Installed the real `community.example.title-tools-1.0.0.zip`; its displayed SHA-256 is `1f3b8f19dbcbd858a9010678c6acb367db5f9de249722f8b5880647d78f7f29f`, and it declares one command plus the two expected read/write permissions.
  - Diagnosed the reported `pending-transaction` error from the disposable workspace journals: `plginx_819601715cf64036` is valid `ready-to-commit`; the later `plginx_4d4ed7ab237746ef` is a failed duplicate prepare. The installer now reuses identical pending digest/version transactions and cleans up only the redundant staging attempt.
  - Explicitly granted the two required permissions, ran the native `Plugins` command against the focused Note, and verified sidecar title normalization plus the plugin batch journal.
  - Verified the command's Undo button and native Edit Redo: the sidecar moved from revision 6 padded title → revision 7 normalized title → revision 6 padded title → revision 7 normalized title, with the journal `undone` flag tracking the transitions.
  - Disabled commands and verified both the disabled native menu state and direct RPC `invalid-state` refusal; restarted the original workspace and verified the grant/menu persisted.
  - Copied the workspace to `/tmp/ghostboard-plugin-desktop-copy-dZuv0i`, switched to it through Settings, and verified the package copied without its app-local grant; switching back restored the original grant.
  - Fixed focused-editor external title synchronization so a native plugin batch update cannot leave a stale title input; the integration regression and rebuilt dev app now show the sidecar and focused input changing together.
  - Wrote durable evidence to `docs/features/In Progress/plugin-container-evidence/2026-09-08/p0-title-tools-desktop-acceptance.json` and updated the P0 contract, PRD, and redesign status. Third-party panels remain blocked by the WebRTC/STUN direct-UDP finding.
- Files created/modified:
  - `src/bun/plugins/outOfRepoSamples.ts`
  - `fixtures/plugins/{title-tools,probe-panel}`
  - `src/bun/plugins/{probeHost.ts,outOfRepoSamples.test.ts,titleTools.test.ts,isolation.test.ts}`
  - `src/bun/index.ts`
  - `src/mainview/{router.ts,router.test.tsx}`
- Files created/modified:
  - `.planning/2026-09-08-plugin-command-activation/{task_plan.md,findings.md,progress.md}`

### Phase 7: Evidence and Product Status

- **Status:** complete
- Updated the P0 evidence JSON, frozen-contract note, PRD status, and public-platform redesign table with the command-only desktop result and the remaining panel-isolation block.
- Re-ran the focused editor test, full Vitest suite, type-check, Ultracite check, and diff check after the final renderer synchronization fix.

### Test Results
| Test | Expected | Actual | Status |
| --- | --- | --- | --- |
| `bunx vitest run src/bun/plugins/commandEnablement.test.ts src/bun/plugins/management.test.ts src/mainview/lib/rpc.test.ts src/mainview/components/settings/panels/PluginsPanel.test.tsx src/mainview/hooks/useCanvasKeyboard.test.tsx` | New activation path passes | 5 files / 47 tests passed | pass |
| `bun run type-check` | Type-safe renderer + Bun host changes | Passed; normal 29 Electrobun dependency diagnostics filtered | pass |
| `bun run check` | Formatting/lint clean | 541 files checked, no fixes required | pass |
| `git diff --check` | No whitespace errors | Passed | pass |
| `bun run test` | Full regression suite | 186 files / 1,637 tests passed; pre-existing jsdom navigation/media-load warnings only | pass |
