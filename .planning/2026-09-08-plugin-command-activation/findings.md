# Findings & Decisions

## Requirements
- User asked to continue immediately after the workspace package-management UI was completed.
- The next increment must advance the extension system, not add another cosmetic installation control.
- The user now directs this follow-up in strict order: remove the test suite's accidental sibling-repository dependency; perform a real desktop acceptance of `title-tools`; then record the evidence and product status. Third-party panels remain out of scope until the WebRTC/network-isolation finding is closed.

## Research Findings
- `runPluginCommand` already runs a declared command in a fresh QuickJS WASM
  module. Its only current host methods are `content.readSelection` and
  `content.applyBatch`, and both pass through the session permission broker.
- Installed packages can be reloaded from their validated package directory by
  `loadPluginDirectory`; the renderer never needs the directory path.
- The existing title command already uses the same `ContentBatchStore` and
  probe host needed for this first dynamic-command vertical slice. It provides
  selection freezing, revision/token validation, and undo/redo journalling.
- The native app menu can send a main-to-renderer RPC message, and the canvas
  store already has a title-batch projection/undo path. This provides a real
  product entry point without exposing the runtime to the renderer.
- PRD permission grants must not travel with a copied workspace. Therefore
  command activation and grants must be held under app-local data, keyed to a
  digest of the resolved current workspace path rather than inside `.ghostboard`.
- The installer keeps the unpacked runtime directory, not the original ZIP.
  Activation therefore stores an app-local SHA-256 fingerprint of the loaded
  manifest and every executable source. Every list, menu-refresh, and run
  recomputes it; a changed package becomes unavailable until reviewed and
  enabled again.

## Decisions
| Decision | Rationale |
| --- | --- |
| Start with command-only activation if feasible | The command runtime has a constrained QuickJS design, unlike third-party panels whose containment has not passed P0 evidence. |
| Leave non-command contributions stored but unavailable | A package can declare multiple contribution kinds, but unsupported surfaces must not become executable as a side effect of command activation. |
| Persist enabled command grants in app-local storage keyed by a SHA-256 workspace-path digest | A copied or moved workspace cannot inherit authorization; a move requires explicit reauthorization, which is conservative and safe. |
| Grant only declared required permissions during the explicit activation confirmation | Optional permissions remain ungranted, and the renderer receives neither filesystem paths nor a capability handle. |
| Reuse the title-batch runtime for the first command host | The current safe host supports title batch edits only, so dynamic commands execute through its existing selection, conflict, and undo guarantees. |
| Bind grants to a loaded-source fingerprint as well as package metadata | The installed ZIP is not retained at runtime; recomputing the source fingerprint prevents a modified unpacked directory from continuing to use a prior app-local grant. |

## Issues Encountered
| Issue | Resolution |
| --- | --- |
| Repository-wide index/full test suite cannot register its RPC handlers when the neighboring `ghostboard-plugin-samples` setup is absent | This is the pre-existing sample-fixture environmental block already recorded for the package-management slice. The new host, RPC, settings, and keyboard focused tests pass independently. |

## Current Investigation
- Desktop acceptance exposed an installer idempotency gap: selecting the same ZIP again while an identical `ready-to-commit` journal exists created a second failed journal and surfaced `pending-transaction`. The installer now reuses the readable staged transaction when plugin id, version, digest, and staged root match; different digests still fail closed.
- `fixtures/plugins/title-tools` already contains the title-tools source needed by the command, ZIP, URL-install, content-batch, and host tests. The current resolver nevertheless defaults only to a neighboring `ghostboard-plugin-samples` directory.
- The existing out-of-repo panel test requires a separate `notes-panel` source, so the controlled fixture needs to cover that package too or the test should be deliberately split into an external-contract-only lane.
- The original in-repository `title-tools` fixture was an older preview-only package. It could load and produce a preview but did not request write permission or call `content.applyBatch`, so it was not equivalent to the installed command package used by the current product flow.
- `main()` waited for plugin package recovery before it defined canvas RPC. That storage I/O made the test's short microtask-only wait unreliable and is also inappropriate on the first-paint path; recovery can run in the background before a menu refresh.
- The generic QuickJS probe host also lacked an `applyBatch` implementation. Updating the fixture correctly exposed that old test helper was only valid for preview-only commands; it now records a safe no-op batch acknowledgement, while the batch-specific tests continue to use `ContentBatchStore` for persistence semantics.
- After plugin tests passed, the full suite had one remaining timeout: `router.test.tsx` changed global jsdom `location` to emulate a non-HTTP scheme. Under the full concurrent suite that mutation triggered jsdom's unsupported navigation path. Router construction can be a pure factory accepting a protocol string, so the test now exercises that decision without mutating browser global state.
- The first router-factory revision still dynamically re-imported the module after `vi.resetModules`; in the full 186-file run that import stalls for the test timeout. The test can import the mocked router once and call the pure factory repeatedly, eliminating both global-location and module-cache mutation.

## Desktop Acceptance Evidence (2026-09-09)
- The real `community.example.title-tools` package installed through Settings in `/tmp/ghostboard-plugin-desktop-dZuv0i`, then required an explicit second confirmation before its read/write command grant became active.
- The native `Plugins` menu executed against the focused Note even after React Flow selection was cleared; the renderer fallback used the focused note ID. The sidecar changed from padded/multiple-space title to `Hello world`, and the batch journal recorded the operation.
- The in-app command Undo and native Edit Redo correctly toggled the sidecar between revisions 6 and 7; after restarting the original workspace, the grant and native menu remained available.
- Disabling commands removed the executable menu item and direct `runEnabledCommand` returned `invalid-state`. Copying the workspace copied the package and content but not the app-local grant; switching back restored the original grant.
- The full gate now passes with 186 files / 1,637 tests. `bun run type-check`, `bun run check`, and `git diff --check` pass. The focused editor now synchronizes external plugin title updates, preventing the stale-revision save failure observed during the first desktop pass. The only remaining scope block is the unaccepted third-party panel container because WebRTC/STUN direct UDP traffic bypassed URL network rules.
