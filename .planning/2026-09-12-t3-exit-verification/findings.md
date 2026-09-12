# Findings & Decisions

## Requirements
- Use the public deterministic package toolchain delivered in `500db71` rather than bespoke ZIP assembly.
- Prove command, panel, CSV importer, and canvas type through independent installable packages and the packaged application.
- Preserve production trust boundaries; do not weaken URL validation or publish an external artifact without authorization.
- Record public HTTPS, native picker, and Windows/Linux coverage honestly rather than treating local automation as equivalent evidence.

## Research Findings
- The previous combined T3 fixture covers all four contribution classes in one archive, but the recorded exit task still calls for independent final-user packages.
- The prior slice passed four scaffold/package checks, the combined fixture, type-check, static checks, and the full 2,011-test regression; this session should reuse that toolchain and avoid re-implementing packaging.
- The authoritative T3 exit row requires four sample classes to be installed from independent packages and usable by a final user without development tools; command, panel, CSV importer, and canvas type are named explicitly.
- Existing packaged evidence uses one `t3.combined` package across local, restart, and loopback-download phases. Loopback is explicitly probe-only; normal production URL installation still requires public HTTPS.
- The current `scripts/trusted-plugin-t3/run.ts` visible at repository head still assembles the combined archive with system `zip` and inspects it with `unzip`, which conflicts with the completed toolchain record and must be reconciled before exit work builds on it.
- The existing T3 host controller has file and URL prepare routes hard-coded to `t3-combined.ghostboard-plugin`, plus deterministic CSV scenarios and report persistence. It can likely be extended or paired with a separate exit controller without weakening production URL policy.
- The previous commit migrated only `scripts/trusted-plugin-t3/verify-fixture.ts` to the public packer; the full packaged-app runner was not changed. Exit work must remove this last system `zip`/`unzip` dependency so the actual evidence consumes the public toolchain end to end.
- The package verifier already demonstrates the desired reusable pattern: copy fixture + SDK, run author install/tests, invoke `sdk/package-plugin.js`, and parse bytes with the production `loadPluginFromZip` loader.
- T3 probe activation is opt-in through `VITE_PLUGIN_T3=1` in the renderer and `GHOSTBOARD_PLUGIN_T3_DIR` in the Bun host; extending the current probe avoids introducing production-only behavior.
- Existing T1 packaged evidence establishes a useful model for multiple concurrently installed packages, direct command execution, real DOM/React panel rendering, per-plugin disable, and isolation assertions.
- Existing T2 canvas evidence shows the correct final-user canvas path: wait for namespaced type publication, create an extension instance through the store, place it through the canvas store, render and interact with the plugin component, persist, and verify summary behavior.
- The T3 probe currently substitutes a deterministic selected CSV only when its evidence environment variable is present; ordinary application launches still call the native picker. This is suitable automated package evidence but must remain explicitly distinct from a manual native-picker trial.
- `PluginRuntime` publicly exposes the exact probe operations needed: `runCommand`, `openPanel`, and per-plugin contribution snapshots. Canvas packages can be exercised through the same extension instance + placement path already used by accepted T2 evidence.
- Repository hosting configuration contains only an R2 release uploader requiring credentials and an example public base URL; no existing public `.ghostboard-plugin` endpoint is available for a non-mutating production HTTPS probe.
- The finished packaged probe proves the four independent archives through both local-file and same-byte URL download transactions. The URL phase uses a probe-only loopback allowance; it does not change or bypass the normal public-HTTPS-only renderer RPC.
- Each independent package committed in a disabled stored state, required explicit enablement, registered exactly one contribution, remained isolated when every sibling was disabled in turn, and all four restored on same-workspace restart.
- The command executed observable code; the DOM panel rendered and cleaned up; the canvas type created, rendered, edited, persisted, and cleaned up an instance/placement; the CSV importer previewed, committed, and undid a host-owned Note transaction.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Keep the existing combined fixture as breadth coverage and add independent exit artifacts rather than mutating it prematurely. | Existing evidence remains valuable while package-level isolation needs a distinct acceptance path. |
| Treat public HTTPS as a separate provenance assertion from same-byte loopback transport. | A probe-only loopback allowance proves the common download/install transaction but cannot be described as production public-network evidence. |
| Reconcile the packaged runner with the public packer before adding exit cases. | Otherwise unit fixture evidence and real-application evidence would be built through different author paths. |
| Extend the existing opt-in T3 packaged probe instead of adding a second build mode. | It already owns final-user package installation, importer scenarios, restart, and loopback transport; adding four isolated packages there yields stronger evidence with less production surface. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Active-plan recovery initially used the stored plan name as a direct path. | Resolved the name under `.planning/` and recorded the mistake in the plan. |

## Resources
- `scripts/trusted-plugin-t3/exit-fixtures/`
- `scripts/trusted-plugin-t3/verify-exit-fixtures.ts`
- `scripts/trusted-plugin-t3/run.ts`
- `src/mainview/plugins/t3/exitPackages.ts`
- `src/bun/plugins/t3Host.ts`
- `docs/features/In Progress/trusted-plugin-t3-exit-evidence.md`
