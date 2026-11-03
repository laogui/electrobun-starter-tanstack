# Progress
2026-11-01：完成 docs/PRD.md 遗留项重组及正文联动纠偏；无应用代码修改。
验证：旧编号集合覆盖（47 R / 16 TODO / 7 OD）全部保留；Markdown fence 成对；相对文件链接存在。修正 EOF 多空行后复查 git diff --check。
未执行：桌面操作、竞态复现、外部发布状态查询、上传/发布、应用测试/构建。本轮为文档与静态证据整理，不声称修复或验收缺陷。

实施阶段：已运行红测试，确认 legacy 正文清空、frontmatter 丢失、revision 冲突前其他文件已写入、已取走预取无法失效、legacy saveNote 绕过 workspace 队列。修复后前四项定点测试通过，队列及相邻测试运行中。
测试环境缺 @total-typescript/shoehorn 实际安装，改用已有 RpcContext 测试断言而不安装依赖。原 preflight 测试首次早读误通过，已等待实际 persist 调用全部 settled 后确认红测试。

## Implementation batch 1 complete
- Added 15 data-integrity regressions: canvas persistence 10, prefetch 4, failed-save dirty/backup retention 1. Original symptoms reproduced before fixes.
- Final full suite: 46 files / 460 tests passed. Loopback HTTP tests ran with approved sandbox escalation.
- type-check passed (existing script excludes 29 vendor diagnostics); check passed on 630 files; Vite renderer build passed with chunk-size advisory; diff whitespace validation passed.
- Normal Paraglide regeneration restored the build-only runtime variant; no manual generated-code edits remain.
- PRD records the completed protections and remaining scope. Cross-file atomicity, undo snapshot separation and dedicated recovery UI remain open. Other work packages remain pending.
- No native desktop acceptance, plugin release probes, large-workspace benchmark, commit, push or release performed.
- Final documentation update through Python encountered an input encoding error; applied the exact documentation changes using apply_patch instead.

## Batch 2 delivery
Implemented A3 and the core A4 data-integrity fixes. Added 12 regressions in existing workspace, clipboard and unified-undo suites. Red runs reproduced resurrection, cross-view insertion, premature snapshots, stale redo and stale focus before fixes.
Validation: full suite 46 files / 472 tests; type-check passes (29 pre-existing vendor diagnostics filtered by repository script); check passes (631 files); Vite build passes with existing chunk advisory; diff check passes. Existing jsdom navigation log is non-fatal. No desktop manual acceptance, commit, push or release performed.
PRD records exact closure boundaries: orphan clone cleanup, nonlinear SDK replay policy, desktop plugin lifecycle checks and R-1 content snapshot isolation remain separate work.

## Batch 3 delivery
A5 attachment integrity and core recovery overwrite risks implemented. Added attachment integrity suite (4 cases); pending recovery tests cover decline, accept/archive and stale choices. Existing automatic recovery test changed to require confirmation.
Validation: full suite 47 files / 478 tests; final recovery-state adjustment verified with affected suite (10 tests); type-check, check (633 files), Vite build and diff check pass. Existing vendor diagnostics, chunk advisory and jsdom navigation log unchanged. No desktop manual QA, commit or publication.
Exact limitations recorded in PRD: recovery archives have no dedicated management UI, localStorage quota remains, old backups lack verifiable identity, host recovery authorization and diff/merge remain open. Native source-file permission boundary belongs to C3.

## A5 completion delivery
Delivered Workspace settings recovery manager, local evidence export and confirmed deletion, disk/local graph preview, node-change counts, safe recovery as new canvas, and version-bound explicit host authorization for corrupt-target writes.
Validation: 47 files / 483 tests pass; type-check/check (635 files), Vite build, diff check pass. Browser ego-browser verified the actual renderer UI, preview, export, and delete flow using a temporary fixture; fixture removed and browser task finished. Screenshot /tmp/ghostboard-a5-recovery-preview.png. Native host tested with temporary workspace integration, not destructive injection into a user workspace. No commit or publish.
A5 minimum acceptance complete; automatic body-version merge, cross-file atomicity and transaction diagnostics remain outside this delivery.

## B1 delivery
PRD marks A3/A5/B1 complete and A1/A2/A4 partial. Added four net data-integrity cases in the existing clipboard/folder suite; connected absorption failure reproduced before fixing. Full suite 47 files / 487 tests passes. Final navigation lookup uses hydrated store nodes/edges to avoid stale React Flow projection during cross-view load. Type-check, check (636 files), Vite build, diff check pass.
Browser QA: same-view search centered a legacy nested Group child within 1 px; actual pointer drag rejected connected absorption without losing edges; actual two-card drag preserved note ids/dimensions and one Cmd+Z restored both; pending edge navigation centered absolute endpoints. Browser fixture reset and task finished. Screenshot /tmp/ghostboard-b1-group-search.png. No native desktop-workspace acceptance, commit or release.
