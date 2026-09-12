# Task Plan: T3 importer and installable distribution

## Goal
Define and deliver the smallest honest T3 slice that lets an independently packaged high-trust plugin register a file importer, preview and commit imported notes without duplicate or hidden writes, and reach the same runnable package through final-user ZIP / HTTPS installation in the packaged macOS arm64 app.

## Next Step
Freeze and implement the next T3 batch: complete file-service primitives, segmented import recovery, generic mapping/target configuration and a general author packaging command.

## Current Phase
Complete (T3 first slice)

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
- [x] Implement the minimum retained-installer adaptation for manifest v2 application packages
- [x] Implement SDK files and importer registration/runtime plumbing
- [x] Implement host-owned select / preview / confirm / cancel flow
- [x] Provide an independent combined plugin package and SDK testing support required by this slice
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Add unit and integration regressions for installer and importer contracts
- [x] Run type checking, style checks and focused tests
- [x] Build and run packaged ZIP / HTTPS / importer acceptance probes
- [x] Run the full serial regression suite
- **Status:** complete

### Phase 5: Delivery
- [x] Update SDK, platform and development documentation with exact supported boundaries
- [x] Review the final diff and working-tree state
- [x] Record remaining T3 work or advance the platform phase honestly
- **Status:** complete

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
| First confirmation-focused test command used Vitest's unsupported `--runInBand` option | Use the repository's supported serial flags: `--fileParallelism=false --maxWorkers=1`. |
| First confirmation test run reached the real endpoint lookup because the session test supplied only a fetch mock | Add the same explicit local endpoint fixture used by content transport tests; keep production code unchanged. |
| First Workbench type-check widened success booleans in file mocks and rejected an inline `typeof fetch` implementation | Preserve literal success types and configure a separately declared `vi.fn<typeof fetch>()`, matching established test patterns. |
| First Workbench Ultracite command used a mistyped working directory and did not start | Rerun the unchanged check from the repository root. |
| First real Workbench Ultracite pass found only formatter output plus one test-local operation-ID regex | Promote the regex to module scope and apply the reported safe formatting to the three affected files. |
| Two A5/template inventory wrappers were malformed before tool execution | Reissue one validated `exec_command` call and avoid composing wrappers incrementally. |
| Template inspection targeted `src/plugin.tsx`, but the React template entry is `src/app.tsx` | Follow the enumerated template tree and use `src/app.tsx`; no missing source file needs creation. |
| Vitest config search passed a shell glob that zsh rejected when no `.js` variant existed | Use the known exact `vitest.config.ts` path; avoid unmatched shell globs. |
| The SDK export patch hit stale context after its intended package/export files were already present | Verify each target on disk and do not repeat the patch; proceed with tests against the resulting state. |
| First A5 Ultracite pass found only layout, array shorthand, two default-parameter-order diagnostics and the intentional async setup `void` union | Preserve optional API semantics with internal defaults, add the same narrow declaration ignore used by `PluginDefinition`, and apply safe formatting. |
| The first A5 safe-fix pass showed the `void` suppression was attached to `reload` instead of its `factory` parameter | Move the narrow suppression directly above `factory`, the node that owns the union diagnostic. |
| Parameter-level suppression still did not bind to the nested async setup union | Name the callback as `FakeHostFactory` and suppress the exported alias directly, matching the SDK's named `PluginDefinition` pattern. |
| Alias-level suppression also did not bind because the diagnostic is specifically on `Promise<void | Disposer>` | After three placement attempts, adopt Ultracite's `Promise<undefined | Disposer>` form and verify real no-return async callbacks through template type-checking. |
| Ultracite then flagged the remaining top-level `void` in the callback return union | Use `undefined` for both no-cleanup branches; TypeScript 5.1+ supports fallthrough callbacks contextually returning `undefined`, and the generated template will verify it. |
| First generated-template run passed both Bun tests but React `tsc` could not resolve `bun:test` declarations | Add `@types/bun` to the React template's dev dependencies, then regenerate rather than patching the temporary copy. |
| Installing `@types/bun` alone did not expose `bun:test` under the template's Bundler module resolution | Add `types: ["bun"]`; an explicit `tsc --types bun` probe against the generated project passed. |
| First combined-package Ultracite pass found four formatter-only files and one test cleanup `delete` | Assign the optional global probe to `undefined`, then apply the safe formatter output. |
| First retained-installer integration assertion expected `LoadedPluginDirectory.sources` to contain every package file | Assert the complete installed filesystem tree separately; `sources` intentionally exposes only the entry source while relative modules remain served from the installed directory. |
| First repeatable template-verifier command used a mistyped non-existent working directory and did not launch | Reissue the unchanged script from the repository root. |
| The first attempt to log that command error used a mistyped progress-table context and the patch was rejected | Append against the exact current table tail; no repository content changed in the rejected attempt. |
| Phase 3 closing Ultracite pass found formatter-only layout in the template verifier and installer test | Apply the safe formatter to those two files, then rerun the same scoped check. |
| First Workbench test missed the transient `committing` label because its fetch mock resolved synchronously | Hold the mocked response behind a deferred promise, assert the visible in-flight state, then resolve it and assert close-on-receipt. |
| First T3 host-controller regression imported the real application-path module and attempted to start Electrobun RPC under Vitest | Add the same hoisted app-path mock used by the existing host/management tests and supply the atomic-write Bun stub. |
| First packaged restart probe required redo results to preserve the separately queried Library array order | Treat the content contract correctly: verify the same ID set and revision values; the durable history showed both original IDs restored in a different valid order. |
| One evidence-inspection wrapper contained an invalid JavaScript object property and two scratch shell commands contained mistyped globs | Reissue the read-only inspection with a valid wrapper and exact quoted path; none of the malformed calls changed repository state. |
| Two final-run wrappers omitted `exec_command.cmd`, and a later inspection wrapper referenced an undefined output-budget identifier | Reissue literal, validated tool arguments; all three failures occurred before shell execution. |
