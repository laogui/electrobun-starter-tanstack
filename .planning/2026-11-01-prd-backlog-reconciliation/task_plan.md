# PRD 遗留项梳理
## Goal
对照当前代码清点 PRD 所有 OD、TODO、R 条目，合并重复项，区分实际缺陷、待验证、产品决策和可移出排期内容，更新 PRD。
## Phases
- 清点文档：complete
- 核对代码证据：complete
- 重组 PRD 与逐项处置：complete
- 检查文档覆盖与链接：complete
## Next Step
当前状态以文末的 Final closure 为准；以下各批次保留为历史实施记录，不作为当前待办。
## Errors Encountered
- 宽输出截断：改按文件和函数缩小读取范围。
- 个别猜测路径/glob 不存在：以仓库路径与 rg 结果更正；不影响结论。
- 初次 diff 检查发现 EOF 多空行：已移除。

## Implementation follow-up (2026-11-01)
用户授权实施“真正值得继续做”的工程工作，先处理第一批数据完整性问题。
- 构建 legacy 保存、批量冲突、预取竞态和写队列失败回归：complete
- 实施保存保护与共享队列：complete
- 检查保存失败提示、补队列交错回归：complete
- 完整测试、type-check/check 与 PRD 状态回写：complete

## Next Step
第一批已交付；后续按 PRD 继续 A3 标签落盘、A4 异步操作与混合撤销。R-1 跨文件事务、撤销隔离和 R-36 专门恢复入口保持开放。

## Second implementation batch (2026-11-01)
- Reproduce legacy tag resurrection and async clipboard races: complete
- Fix explicit metadata deletion, migration marker, serialized flush and quit durability: complete
- Guard clipboard by canvas generation and move snapshot to commit: complete
- Reproduce and fix native mixed-history branching, startup binding and stale focus: complete
- Full verification and PRD status update: complete
- Remaining: orphan clone recovery, desktop acceptance, A5 recovery/attachments; R-1 cross-file atomicity and content-history separation remain open.

## Third implementation batch (2026-11-01)
- Reproduce attachment collision overwrite and silent pending-backup replacement: complete
- Unify durable streamed attachment publication and collision handling: complete
- Require recovery choice; archive evidence and compare source/base; reject stale choices: complete
- Verify affected suites, full tests, type-check/check/build; update PRD: complete
- Remaining: unified recovery management UI, backup diff/merge and host recovery authorization; C3 source path authorization and cross-process races remain separate.

## A5 completion (2026-11-01)
- Disk recovery must require explicit version-bound host approval: complete
- Recovery management in Workspace settings (disk/local evidence, preview, compare, export/delete): complete
- Recover as a separate canvas without writing shared content: complete
- Validate source changes, archive collisions, stale deletion and source preservation: complete
- Browser QA, full suite, type-check/check/build and PRD update: complete
- A5 minimum delivery complete. Automatic historical body merging/version history and transaction diagnostics remain separate R-1/R-36 work.

## B1 container and navigation follow-up
- Mark delivered/partial PRD work packages: complete
- Connected-node absorption regression: reproduced
- Shared atomic folder absorption and absolute coordinates: implementing
- Verify undo/multi-selection, renderer navigation and checks: pending

## B1 delivery
- Completed status annotations and B1 implementation/verification.
- Remaining A1/A2/A4 work stays explicitly partial. No commit or publication.

## Close A1/A2/A4 instead of fragmenting delivery
- Recoverable whole-canvas file journal, rollback/crash recovery and deferred events: complete
- Layout-only conflict save, selective disk-note resolution and draft evidence: complete
- Note content outside canvas history, source-update cache and content-only history suppression: complete
- Workspace queue for widget/extension/attachment/metadata paths and transaction diagnostic/resolve UI: complete
- Owned clone receipts, reference checks, quarantine, cancel/partial cleanup and retry: complete
- Full suite 49 files / 503 tests; browser confirmation QA; type/check/build: complete
- PRD consolidated to a single current status table; A1-A5 and B1 closed.

## B2-B4 closure
- Focus conflict departures, stale sessions/navigation, transition failure cleanup: complete
- AI field/type/lock/Topic/context guards and no empty history: complete
- Invalid data isolation/evidence, diagnostic UI, structured RPC failures, search resilience, frontmatter round-trip: complete
- Verification: 54 files / 526 tests, type/check/build, isolated renderer QA: complete
- Next: C1 plugin canonical signature, ZIP ambiguity and unknown-channel probes.

## C1-C2 closure
- Canonical packer/host signatures, legacy checksum migration, ZIP structure and portable aliases, fail-closed unknown channels: complete
- Removable/archived package and development sources, shared permission revocation, pending update cancellation and crash recovery: complete
- Cross-workspace update/rollback pin clearing and failed-operation restoration: complete
- Verification: 55 files / 539 tests, type/check/build and isolated renderer uninstall/disconnect confirmation: complete
- Next: C3 file entry points, permission identity/revocation UI and destructive consent; C4 polling/documentation; D1-D3 failure contracts/performance/export/theme.

## C3-C4 closure
- Removed renderer arbitrary OS-source copy bridge; File uploads preserve native file selection capability; scoped picker caller validation: complete
- Identity-bound durable grants, serialized mutation, revoke/prompt race protection, settings revoke UI and all plugin deletion consent: complete
- Metadata-aware bounded directory snapshot cache, fresh activation/reload, unchanged polling without repeated byte reads, stable/development polling cadence: complete
- TOFU/T4/SDK documentation and localization: complete
- Verification: 56 files / 547 tests, type/check/build; actual permission UI revoke sends correct principal/permission and clears grant: complete
- D1 request/process timeouts: implemented; D2 shared RPC generic and measured editor update reduction in progress; D3 export/theme remains.

## Final closure (2026-11-02)
- A1–A5, B1–B4, C1–C4: complete, prior intermediate gaps retired.
- D1 finite request/process timeouts, visible uncertain completion, no write replay, thumbnail kill/cleanup: complete.
- D2 shared CanvasRPC generic, typed renderer init, no per-key Markdown mirror, latest JSON flush before quit/export and stale acknowledgement protection: complete; real-editor CPU/input evidence recorded below.
- D3 all/view/selected Markdown UI, source-format help, portable attachments/failure reporting, canonical JSON export and dark text fixes: complete; actual renderer menu/theme acceptance recorded below.
- Additional export race: JSON/PNG callback crossing a view session can mix old identity with new graph; two regressions failed before fix. Capture generation before async flush; abort on generation/view mismatch, including leave-and-return. Positive latest-graph export retained.
- D2 evidence: 500 paragraphs / 101,890 characters, 10 actual typed characters, 1 load / 1 debounced save / 1 acknowledgement canvas update. Five warmups + 10 paired samples: capture + JSON median 0.2 ms, Markdown conversion median 5.2 ms. Claim avoided CPU work, not a verified end-to-end frame latency improvement.
- D3 acceptance: actual all/view/selected clicks, Group + Folder descendants and shared-note dedupe, empty selection no request, canceled response no new toasts, partial failure count/path/index feedback, Settings source-format copy, and actual eight built-in extension surfaces. Fixed newly demonstrated Group fill, Counter/Checklist text, custom-fill Link/media theme mismatches, and toast/control overlap.
- User continued after the replacement question; one replacement browser space 7 was created and reused. It completed and was finished once with keep:[]; no browser blocker remains.
- Additional export integrity regressions: single-note right-click must flush latest JSON; batch wrapper must revalidate after its own flush. Both failed before fix and now pass.
- Final status: all A/B/C/D engineering packages closed. R-26/R-27 safety investigation, product decisions and external/native release evidence retain explicitly separate scope.
- Final build/type/check/test logs and PRD coverage audit recorded in progress.md. Product decisions (§8.4), native release/external-author evidence (§8.5), R-26 and R-27 safety verification retain their own scope.

## §8.5 closure audit (2026-11-02)
- User asked how to close §8.5 and explicitly excluded Intel and external authors for this round.
- Audit local package/publishing/probe tools and actual remote npm/GitHub/docs/example endpoints: complete.
- Run compatibility check and actual tarball/four-template verification: complete, passed.
- Define four concrete receipts (Topic native, Checklist/recovery native, npm registry installation, public docs/signed distribution): complete in docs/8.5-closeout.md.
- Reconcile PRD scope and replace unqueried external-state claims with observed facts: complete.
- No package publish, site deployment, example upload, tag push, remote workflow trigger, Intel run or author contact performed. Full native/public acceptance execution is the next implementation phase; this turn requested the closure assessment.

## §8.5 execution (authorized 2026-11-02)
- User accepted the proposed sequence. Scope: native arm64 Topic + Checklist/recovery acceptance, then fixed candidate/npm/docs/public signed distribution; Intel and outside authors deferred.
- Build current canary and establish isolated native app/data directory: complete (unsigned/not notarized, arm64).
- Native Topic and Checklist/recovery workflows with restart/disk/export evidence: complete. Final normal quit/relaunch preserves exact stable manifests and metadata, edited checklist state, recovery body and deterministic instance count.
- Fix/reverify demonstrated defects: complete. Copy legacy widget tags to every placement once, retain explicit clears, refresh caches, enable checklist tag UI; restore legacy renderers when migration fails; correct declined-recovery wording.
- Website route/deployment and public signed distribution: complete at ghostboard.21blog.com. Public T5 install32/restart9/native picker7 checks all pass; real select/cancel performed by agent through native UI with user authorization. T3/T4 rerun on final source pass.
- npm publication: user explicitly deferred; no login or publish pending. Intel/outside authors remain user-deferred.
- Receipts/screenshots, PRD and closeout report, final generated-code/type/whitespace checks and task cleanup: complete. Evidence archived under docs/acceptance/2026-11-02; final website version31a380ad-5c58-481b-b65e-196139d82341. Final acceptance app/workspace retained, superseded owned copies and test download removed; temporary driver processes stopped.

## Next Step
No remaining action within the approved §8.5 scope. Report the completed native/public acceptance and the three explicit user deferrals.

## PRD consolidation (2026-11-03)
- Remove completed backlog/delivery/history tables and stale task references: complete
- Integrate durable product behavior into the feature/data/security sections: complete
- Retain only open safety checks, undecided scope, explicit deferrals and conditional ideas: complete
- Audit links, section references, Markdown and the final diff: complete

## Next Step
No remaining action for this documentation cleanup. Current PRD separates product behavior from open scope; prior evidence is retained in the existing closeout/planning records.
