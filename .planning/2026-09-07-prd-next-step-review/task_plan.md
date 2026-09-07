# Task Plan: PRD Next-Step Review

## Goal
Define and implement the D1 search reachability slices after D0 closeout: preserve distinct view/container/content identities, make Folder-child hits open the real child, and add a conservative non-destructive recovery entry for detached/unlinked note records without prematurely expanding into public-plugin P0.

## Next Step
D2 is closed with an evidence-backed fix list and an explicit “no new feature” decision; if work continues, choose the separate public-plugin P0 track or wait for a new end-to-end workflow blocker before starting D3-1.

## Current Phase
Phase 20 (complete)

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints
- [x] Document in findings.md
- **Status:** complete

### Phase 2: Repository Reconciliation
- [x] Map PRD capabilities to current implementation
- [x] Check tests, open TODOs, and recent commits for completion evidence
- **Status:** complete

### Phase 3: Prioritization
- [x] Identify the critical path and highest-risk unknowns
- [x] Recommend one concrete next slice with acceptance criteria
- **Status:** complete

### Phase 4: Verification
- [x] Validate recommendation against PRD dependencies and repo evidence
- [x] Record confidence and assumptions
- **Status:** complete

### Phase 5: Delivery
- [x] Review outputs
- [x] Deliver to user
- **Status:** complete

### Phase 6: D0-1 Test Design
- [x] Confirm the narrow implementation seam for Checklist DetailSurface
- [x] Add failing tests for Checklist focusability/detail rendering
- [x] Add or confirm regression coverage for legacy Folder-contained widgets
- **Status:** complete

### Phase 7: D0-1 Implementation
- [x] Implement Checklist detail behavior without changing Pomodoro/Reminder
- [x] Preserve new-placement Folder prohibition and legacy data access
- [x] Update the behavior matrix and product/technical decision text
- **Status:** complete

### Phase 8: Targeted Verification
- [x] Run focused tests for registry, FocusedView, routing, migration, and Folder compatibility
- [x] Run type-check and formatting/lint checks on touched files
- **Status:** complete

### Phase 9: Full Verification and Delivery
- [x] Run the repository test suite and non-mutating checks
- [x] Review the complete diff against D0-1 scope
- [x] Report results and remaining desktop-only acceptance work
- **Status:** complete

### Phase 10: Desktop Behavior Acceptance
- [x] Identify and prepare a disposable workspace launch path
- [x] Verify Checklist detail editing, instance Undo, and reload persistence
- [x] Verify Pomodoro/Reminder remain canvas-only and all three reject new Folder placement
- [x] Verify legacy Folder-contained Productivity content can be opened/searched/extracted without type or data loss
- **Status:** complete

### Phase 11: Extension Gap-Closure T6
- [x] Reconcile the T6 plan against current search/export mappings and tests
- [x] Centralize built-in Canvas Type search-kind mapping at the shared extension boundary
- [x] Update RFC/matrix status and run the required focused regression
- **Status:** complete

### Phase 12: D0-3 Lifecycle and Damaged-Data Regression
- [x] Build a per-type lifecycle test matrix for duplicate/paste/delete/undo/reload
- [x] Add focused missing/corrupt/unknown instance and attachment regression tests
- [x] Fix only reproduced D0 regressions while preserving raw data on failure
- **Status:** complete — lifecycle, damaged-data, fallback, and attachment regression coverage is green.

### Phase 13: D0 Closeout Verification
- [x] Run non-mutating checks and the full suite with baseline failures separated
- [x] Review the total diff against D0 scope and synchronize completion evidence
- [x] Report any remaining manual acceptance or external blocker
- **Status:** complete — D0 automated and desktop evidence is synchronized; D1 search reachability and public-plugin P0 remain separate next tracks.

### Phase 14: D1-1 Search Target Contract
- [x] Add failing tests for target identity across views, top-level nodes, Folder children, repeated references, and detached/unlinked metadata
- [x] Implement a serializable shared target contract and populate backend plus in-memory fallback results without breaking existing result IDs
- [x] Document the contract and hand off Folder hit-to-open navigation to D1-2
- **Status:** complete — shared target metadata is emitted by Bun and current-view fallback; Folder navigation remains the next slice.

### Phase 15: D1-2 Folder Hit-to-Open Navigation
- [x] Add failing route/component tests for same-view and cross-view Folder-child hits, including a non-focusable legacy child
- [x] Consume `folderId`/`childId` targets to open the owning Folder and focus the matching child without treating it as a top-level node
- [x] Preserve save-before-switch, edge navigation, detached-note behavior, and clear pending targets after success or a recoverable miss
- [x] Run focused and full serial verification; record any desktop-only observation separately
- **Status:** 已验收（2026-09-07）。真实桌面中用 Folder 独有关键词命中后进入正确子 Note；跨视图共享 Note 搜索后切到 Delivery 画布，结果身份与内容均正确。

### Phase 16: D1-3 Detached / Unlinked Recovery Entry
- [x] Record the OD-2 choice: keep unlinked files out of global canvas search, but expose a formal, non-destructive recovery section in the Note Library
- [x] Add a read-only unlinked-file inventory and explicit recovery affordance for note records with a stable identity; keep widget/extension records typed and non-destructive when no canvas reference exists
- [x] Add regression coverage for scan failures, no-id files, sidecar notes, and recovery persistence without allowing cleanup to delete referenced data
- [x] Run focused/full verification; defer desktop click-through until the Mac is unlocked
- **Status:** 已验收（2026-09-07）。Note Library 的稳定 ID Unlinked Note 可放回当前画布，节点数 7→8、unlinked 数量 9→8，重启后仍在画布且正文一致；无 id Markdown 与 typed Widget/Extension 仍保持浏览边界。

### Phase 17: D1-4 Reachability Matrix
- [x] Define one deterministic synthetic workspace fixture spanning top-level, Group, Folder, detached, and unlinked records with supported/unsupported type annotations
- [x] Add matrix assertions for backend search, current-view fallback, Library/Detached browse, Folder child opening, and stable unlinked recovery; record explicit not-applicable combinations
- [x] Close any reproduced “search hit but cannot open/recover” gaps without widening the OD-2 boundary or coercing typed records
- [x] Run focused/full verification; desktop click-through remains pending until the Mac is unlocked
- **Status:** 已验收（2026-09-07）。同一临时夹具完成搜索命中→Folder/FocusedView、跨视图切换、文库放回、重启恢复和媒体/实例内容走查；位置×类型矩阵与桌面结果一致。

### Phase 18: D2-1 Synthetic Project Baseline
- [x] Define a deterministic two-view fixture with shared, Folder, detached, imported, and unlinked records plus supported media/Productivity placements
- [x] Add a disposable workspace writer with valid manifests, sidecars, typed instance records, legacy compatibility data, and small local attachment files
- [x] Add structural and backend search assertions for the expected inventory, cross-view reuse, Folder-child targets, detached/imported records, and unlinked exclusion
- [x] Synchronize PRD/development-plan status and record the fixture's initial state and rebuild boundary
- [x] Run the full serial regression and type-check baseline; use the fixture for desktop D1/D2 acceptance
- **Status:** 已验收（2026-09-07）。夹具自动基线为 166 files / 1506 tests；同一副本已完成 D1 桌面门禁并进入 D2-2 正向流程，type-check 仍只有既有 Electrobun 依赖诊断和 `routes/index.test.tsx` 缺少 `beforeAll`。

### Phase 19: D2-2 Positive Project Flow & Export
- [x] 在临时 D2 workspace 中创建并编辑“项目结论” Note，保存多行结论和依据
- [x] 走查图片、PDF、音频、链接和 Delivery 画布中的 Productivity 内容；确认 Folder 新建准入边界未被绕过
- [x] 重启应用并确认当前画布、恢复后的 Note 和编辑内容保持一致
- [x] 实际导出 Markdown、JSON、PNG 与 workspace ZIP，并从文件系统检查内容可读性和附件成员
- **Status:** 正向流程已验收（2026-09-07）。Markdown 生成 5 篇 Note 与 `index.md`；JSON 使用 v2 schema；PNG 为 2644×2132 RGBA；workspace ZIP 通过 `unzip -t`，包含 53 个成员及 PNG/PDF/WAV 附件。D2-3 仍需注入故障并记录阻断点。

### Phase 20: D2-3 Failure-Path Closure
- [x] 在同一临时 workspace 注入离线、缺失/损坏附件、保存失败、跨视图删除和不可写导出目录等故障
- [x] 记录每个故障的预期/实际、严重度、截图或日志，并只修复可复现的可靠性阻断
- [x] 验证撤销后重启和失败恢复边界，决定是否需要 D3 最小体验改动
- **Status:** 已验收（2026-09-07）。离线链接、缺失/损坏 PDF、保存失败、跨视图共享删除、不可写 JSON 导出、删除后立即撤销/完整重启均有明确故障或数据边界；本地 BlockNote 编辑在 AI 未配置时仍走本地 sidecar RPC，Link 网络请求失败和 AI 未配置 `503` 契约均有回归证据。标题-only Note 保存和损坏 PDF 空白预览两个真实阻断已修复并加回归测试；没有新的可复现阻断，因此不新增 D3 交互。

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use repository evidence, not PRD checkboxes alone | The PRD may lag implementation or contain aspirational sections. |
| Recommend one primary next slice, then a short follow-on order | The user asked what to do next, so the answer should be actionable rather than a broad backlog restatement. |
| First implementation decision: D0-1 before deeper feature work | It is the first item on the core critical path, is bounded, and prevents unsettled access/container behavior from leaking into lifecycle tests and plugin P1. |
| Proposed OD-6 target: Checklist detail; Pomodoro/Reminder canvas-only; no new Productivity placement in Folder | Checklist has a richer existing full editor that is currently unreachable; timers/reminders are designed for direct canvas interaction; Folder prohibition predates the extension migration. |
| Preserve and test legacy Folder-contained widgets | Existing data may predate the prohibition, so intentional prevention of new placement must not make old content inaccessible or destructive. |
| Plugin P0 may proceed as a separate experiment after the docs change is isolated | Its container/security feasibility is high risk but independent of D1-D3; it should not be mixed with the current uncommitted product-document update. |
| Implement D0-1 test-first as a narrow slice | Repository guidelines require behavior tests for changes; the existing legacy Checklist editor makes the desired surface reusable without redesigning all Productivity types. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Referenced `/Users/laogui/.codex/RTK.md` does not exist | Searched the configured Codex directories; no RTK file was found, so continue with the repository guidelines available in the prompt. |
| Focused test command failed with `vitest: command not found`; first locked install hit sandbox tempdir denial | Confirmed `node_modules` was absent; reran `bun install --frozen-lockfile` with the required permission and restored the exact locked toolchain. |
| Full `bun run type-check` is blocked by errors in `node_modules/electrobun` plus an existing missing `beforeAll` import in `src/mainview/routes/index.test.tsx` | Keep unrelated baseline files unchanged; verify the touched code through lint/check and focused/full runtime tests, and report the type-check baseline separately. |
| First continuation-plan patch expected the previous Current Phase text to be `Phase 9` | Re-read the plan, found the actual completion sentence, and applied the continuation phases against the current content. |
| A diagnostic glob targeted the nonexistent `.ghostboard/extensions/instances` path | Used the manifest inventory to identify the correct `.ghostboard/extension-instances` directory; the failed read was non-mutating. |
| First desktop Search click passed an object where the driver requires an integer element index | Retried with the fresh integer index; Search opened and the failed call changed no state. |
| The CUA app driver has no `doubleClick` method | Issued two immediate `click` calls against the fresh Folder element; the app recognized its double-click interaction and entered the Folder layer. |
| On the clean bundled restart, two separate click calls no longer registered as a double-click | Used the documented `click(index, { clickCount: 2 })` option, which reliably entered the Folder without changing persisted data. |
| The CUA app driver has no `rightClick` convenience method, and the first retry used unsupported option name `button` | Refreshed the driver documentation and identified the exact supported form: `click(index, { mouseButton: 'right' })`; the mistaken left click only reopened the already-verified detail surface. |
| First-mutation persistence regression failed with zero manifest saves | This is the intended red test proving `skipHydrate` suppresses a real user mutation when the hook mounts after hydration; fix the flag's initial value without weakening pre-hydration/view-switch protection. |
| Desktop dev console emitted repeated `ResizeObserver loop completed with undelivered notifications` warnings during the expanded Folder/detail layout | HMR still completed and the app remained usable without entering its error boundary; record as noisy baseline behavior and keep the D0 persistence retest focused on observable state/disk results. |
| Phase-completion patch expected the `Current Phase` block after the phase list | Re-read the plan, found the block near the top, and applied the same status update with exact hunks. |
| Direct shared mapping test returned `No test files found` | Vitest currently collects only renderer/Bun paths; inspect shared-test inventory and either extend the include safely or relocate the regression to a collected boundary before implementation. |
| Collected shared mapping test failed because both new helpers were undefined | This is the intended T6 red state after fixing collection; implement the centralized mappings and replace the private Bun functions. |
| Newly collected shared suite exposed `sanitizePresentation` retaining script contents | Keep shared collection enabled; fix the sanitizer to remove dangerous element blocks before generic markup stripping, then rerun all nine shared suites. |
| Repository check requested multiline wrapping for the unknown-ID mapping assertion | Apply the exact formatter layout with `apply_patch`, then rerun check after documentation edits. |
| First full test run overlapped the live desktop process and failed 6 files | Stop the desktop process, fix only the independently reproduced Node 26 localStorage setup issue, and rerun from a clean baseline before classifying any timeout as a product regression. |
| A parallel clean full run timed out in the existing router test, while the same file passed in isolation | Re-ran the complete suite with Vitest file parallelism disabled and one worker; all 161 files and 1,446 tests passed. Treat the parallel timeout as test-run contention/flakiness, not a D0 product regression. |
| The first low-concurrency command used unsupported Vitest option `--minWorkers` | Re-ran with the supported `--fileParallelism=false --maxWorkers=1` flags; no repository files were changed by the failed command. |
| First damaged-attachment assertion expected runtime fields to survive extension migration in the canvas node | Re-read `persistableExtensionNode`: extension nodes intentionally persist only `canvasTypeId`/`instanceId`; reverted the over-specific assertion and retained the existing legacy attachment-runtime regression. |
| Missing-instance fallback rendered as the generic unknown-type message | Added an explicit `corrupted` HostShell availability and regression coverage so the original-file-kept message is visible while preserving the source record. |
