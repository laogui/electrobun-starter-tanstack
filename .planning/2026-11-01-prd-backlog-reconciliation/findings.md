# Findings
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
