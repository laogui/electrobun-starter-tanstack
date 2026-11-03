# Findings

## §8.5 actual closure, 2026-11-02–03
- Native legacy migration exposed tags stranded at widget IDs; extension tag UI/search use placement IDs. Copy once per placement with persistent receipts, preserve source for other placements, keep explicit clears after restart; enable checklist tags and invalidate metadata caches after lazy migration. Two new integrity regressions were red before fixes.
- Failed migration preserves legacy nodes, so their real editable/read-only renderers must remain registered. Missing widget previously became an empty React Flow default node. Native missing/corrupt fallback, raw-file preservation and repaired-record retry now pass.
- Native recovery confirmation binds current file bytes; decline and stale confirmation preserve source, fresh confirmation restores backup. Actual native evidence export produced exact damaged bytes in Downloads and the app remained usable after rebinding a transient Cua noWindowsAvailable observation.
- Topic creation/title/history/branch copy/Group/search/lock/export/normal restart and Checklist migration/failure/retry/edit/Folder extraction/search/tags/normal restart all passed in isolated arm64 data. Final stable graph/metadata equality verified; take the layout baseline after automatic avoidance settles.
- User chose ghostboard.21blog.com; current Cloudflare account owns 21blog.com. Dedicated docs Worker has no missing template app/api bindings. Public docs and 10 public sample objects deployed; archive bytes/signatures verified independently and by packaged T5.
- T5 harness needed actual React content readiness and a real 101-row segmented CSV fixture; two-note single-batch imports correctly clear sessions on completion. Fixed assumptions without relaxing assertions; full public install/restart/native picker48 checks passed. Native picker was operated by the agent under user authorization, not an outside author.
- Current final-source T3 90 and T4 34 checks pass. Native probe binaries differ by instrumentation flags; archive SHA256 values and source snapshot are retained separately. Unsigned/not-notarized acceptance does not claim an installer release.
- User explicitly deferred npm publication, Intel and external-author evidence. Those are scope decisions, not unfinished items within the accepted arm64/native/public work. R-26/R-27 and product decisions remain outside §8.5 closure.
§8.5 audit (2026-11-02): user defers Intel/outside authors. Remaining four closure receipts are native Topic, native Checklist/recovery, public npm install and docs/signed public distribution. Official registry SDK/scaffold queries404; GitHub tags/publish-workflow runs/platform-workflow runs empty. Actual /docs browser renders unrelated demo; public examples index TLS fails in two clients (inaccessibility, not proof of missing storage). Local website source clean main, vendored SDK0.1.1. Local compatibility + actual packed tarball four-template install/test/build/deterministic packaging/host ZIP checks pass. Existing T4 arm64 evidence is dated2026-09-13, predating current changes. See docs/8.5-closeout.md for scoped closure criteria. No public publish/deploy/upload or native acceptance claimed in this audit.

基线 HEAD 3cc757a。PRD 1153 行，含历史能力、OD-2 至 OD-8、TODO 和 R-1 至 R-47 的混合清单。§7 仍宣称仅剩插件/Topic 验收，与新追加 §8.5 缺陷不一致。需保留编号可追溯，并以统一处置表替代重复排期。
已核对：TODO-27/28 代码已修，统一 nodeQuota；TODO-19 的 useCanvasInit/Export/SearchNavigation 已抽出。R-44 是有意 session-only（canvas handler 明确丢弃 viewport），不是简单漏写。R-29 两端 digest 排序不一致仍存在。R-1/2/3、R-5/6/12/13/14 的代码风险路径仍存在，未动态复现。R-36 原报告「恢复在 try 外」已不准确，实际在 try/finally 内，但每次队列操作仍先恢复，冲突仍可能反复阻断。R-28 autoUpload=true，需要产品隐私选择。
一次检索使用不存在的 packages/plugin-sdk/src 导致 exit 2；已改查 packages/plugin-sdk 根目录。宽范围输出截断后已缩小到明确源文件与代码段。

最终修正：TODO-29 实际已有 card→widget→extension 迁移，原 PRD 错误已纠正；JSON 拖入及 records 导出也已实现。所有 47 个 R、16 个 TODO、7 个 OD 旧编号均保留映射。§8 重组为已关闭、建议移出、工程工作包、6 项决策、验收、执行规则和历史决策映射。R-26/27 保留核验，未夸大为已复现漏洞。外部发布状态明确未查询。

实施发现：真正的 R-1 风险还包含 Promise.all 首个 reject 后 sibling 写入继续执行。改串行写入并在任何分配/写入前统一校验，避免版本冲突引起部分提交和出队后写入。冲突仍拒绝整次保存，不把它描述为完整跨文件事务。R-3 无改动 legacy 文件保持原字节；R-8 消费中的请求也受 epoch/失效控制，并等待 save barrier。配置读取不能直接套自动恢复锁，否则损坏 intent 会封死视图列表：增加失败回归后只给配置修改加外层 workspace 锁。
完整测试初跑因 sandbox 禁止 localhost 监听以及与 type-check 的 Paraglide 再生成并发而失败；已在类型生成完成后、允许 localhost 的环境运行，46 文件/456 测试通过；追加恢复可读与 legacy 多引用防覆盖、保存失败提示回归后进行最终验证。
RPC 与 prefetch 静态互引使 mock importOriginal 初始化挂起，改写路径按需加载，相关回归通过。

## Batch 2 findings
- Confirmed with failing regressions: legacy tags resurrect after deletion/restart; async paste/duplicate can append after leave-and-return; snapshots are reserved before clone success.
- Confirmed mixed-history regressions: editing another source leaves stale local redo; focus data is not refreshed by canvas undo.
- Metadata now encodes explicit deletions as null, persists a one-time migration marker with entries, serializes writes and participates in deferred quit. Failure retains state and permits retry.
- Clipboard uses a canvas generation (reset/view changes/hydration), checks hydration and delays history until commit. Canceled clone records are intentionally retained pending a safe reference-aware recovery mechanism.
- Native history starts with canvas context and adopts the first plugin workspace identity without dropping entries. All native source stores discard redo on branching. Explicit nonlinear plugin replay retains existing conservative semantics.

## Batch 3 findings
- Red tests confirmed generated attachment collisions overwrite the first file and pending backups replace disk graph without confirmation.
- All three attachment write paths now share exclusive staging, file sync and atomic publication. New paths use full UUID and link-based no-replace publication; explicit replacement uses rename. Unsupported hard-link filesystems fail safely.
- Pending backups now retain independent localStorage evidence, optional workspacePath/baseGraph, explicit restore choice and stale graph/generation guards. Legacy sources cannot be verified and require a warning/choice.
- Disk .bak recovery asks before hydration, preserving unhydrated/no-autosave state when declined. This is renderer confirmation, not a new host-side recovery authorization protocol.

## A5 completion findings
Reading a recovered manifest previously granted process-wide overwrite permission even if renderer confirmation was declined. Replaced this with opaque per-manifest recovery tickets bound to damaged bytes and the exact shown backup; explicit confirmation RPC and every corrupt-target write recheck fingerprints.
Recovery manager lists rolling/pre-Topic disk snapshots plus local pending/archive records. It reads original graphs without loadCanvas migrations. New recovered views publish their manifest before config registration, do not select the view, and never write referenced note/widget bodies. Content remains current; layout history is recovered as a separate canvas rather than auto-merged.
Distinct same-timestamp local archives are retained; raw damaged archive evidence remains exportable; deletion uses compare-before-remove. Browser QA fixture was exported and deleted, task space finished.

## B1 findings
A red regression proved that direct folder absorption silently removed connected nodes and edges. Drag also bypassed shared logic and omitted backing ids/dimensions. Centralized atomic batch absorption now rejects any connected/locked/unsupported batch, preserves identity/size and records one undo step.
Shared absolute geometry handles parent chains and legacy cycles. Backend result positions, same-view and post-hydration navigation, edge centers, focus and extraction use absolute positions. Legacy group flattening preserves world position.

## A1/A2/A4 closure
Implemented a write-ahead undo journal around whole canvas saves. Original bytes are durable before each file replacement, committed marker selects forward completion vs rollback after interruption, external mismatches block recovery, content events defer until commit. Layout fallback records conflict ids and preserves drafts; selective resolution archives local state before replacing only conflicting note sources.
Note content lives outside structural history; title/color/revision/body are stripped from snapshots and current sources restored on undo, including source-change notifications.
Widget/extension read-modify-write and attachment/metadata IO now use workspace ownership. Malformed/conflicting journal or note intent can be inspected/exported/retried/quarantined with matching token; both Settings and load-error screen expose controls.
Clone cleanup requires process-issued operation receipts, unchanged bytes and absence of references from live memory/history/clipboard/local backups and active/trash manifests plus disk backups. Only newly owned clones move to recovery quarantine; forged receipts, referenced records and modified clones are retained. Failure offers retry.
# Final implementation findings (2026-11-02)

- Plugin grants need stable source identity as well as plugin ID; revocation must invalidate pending native answers. Both paths are now implemented and regression-tested.
- Unchanged plugin polling can reuse a bounded byte snapshot while metadata checks, forced max age and explicit activation preserve verification. Restored mtime alone is not a safe cache key; ctime/inode/path/symlink checks are included.
- JSON-backed editor input previously converted full Markdown and wrote the canvas every key. Input now captures blocks and defers save; export explicitly reads canonical content, and quit/export waits for pending note writes before canvas flush.
- Export must guard its canvas session across the saving await. Two new red regressions reproduced JSON/PNG export proceeding after leave-and-return; generation and view checks prevent mismatched graph/name exports.
- Long-note fixture: 500 paragraphs (~101,890 chars), 10 typed chars: canvas updates fell from 10 to 1 save acknowledgement. RAF observations were unstable and did not show a verified latency improvement; retain that limitation.
- D3 portable exports use a fresh directory per request and await attachment copies. Empty/unknown scopes do not expand to all notes. Missing/unsafe attachment paths are failures with evidence instead of successful incomplete exports.
- Browser acceptance resumed after the user's next continue instruction in one replacement space 7. Real input, menus and theme cases completed; space 7 finished once with keep:[].
- Real editor CPU evidence: five warmups plus ten paired samples, block capture + JSON serialization median 0.2ms versus full Markdown conversion median 5.2ms. Actual 10-character input produced one load, one save and one canvas acknowledgement. Do not turn this into an end-to-end frame latency claim.
- Theme QA exposed inherited black text on dark Counter/Checklist, light Group label on a pastel Group, and app-dark text on custom white Link/media fills. Shell foreground, Checklist states, dark Group tokens and explicit per-surface tone now fix the real registered surfaces. Light app with dark custom Link and its detail also verified.
- RPC export preparation must protect the entire await chain: right-click single-note export now flushes latest JSON, and batch wrapper validates generation/view after its own flush and client initialization. Two red integrity regressions now pass. Sonner offsets reserve canvas controls' space; actual warning screenshot confirms feedback remains visible.
- All A/B/C/D engineering packages now closed in the PRD. Separate R-26/R-27 investigations, product choices and external/native release evidence are retained explicitly.
# PRD consolidation — 2026-11-03

- The old PRD still marked Topic unaccepted, Markdown all/selected UI absent, source-path file import public, and native history sources unaware of one another despite completed implementation/acceptance. The old public-plugin scope decision had already been answered by native/public execution and explicit npm/Intel/author deferrals.
- Removed completed historical P0–P3 tasks, D0–D2 execution plans, closed TODO/OD/R ledgers, A–D delivery table, completed native/public closeout table and duplicate decision mapping from the PRD. Existing acceptance/closeout/planning evidence remains intact.
- Integrated current Topic/Checklist behavior, focused conflict handling, async copy isolation, unified history/body separation, tags, plugin principal/revocation/uninstall/package checks, AI/licensing, website deployment, transaction saves, exports, recovery and theme contrast into feature/data/security sections.
- Remaining scope: two safety investigations, conditional ideas, four explicit deferral groups, five scope decisions. No unapproved product decision was silently implemented or marked complete.
- Corrected the tech-spec link to the renamed PRD §8. Local deployment receipt was reused; no remote-state claims required fresh network work.
