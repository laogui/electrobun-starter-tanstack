# T3 第三批：分段导入

日期：2026-09-12（Asia/Singapore）。

状态：**实现、自动化门禁与 macOS arm64 发行包验收均已通过；T3 阶段继续实施。** 本批只收口超过 100 条 Note 的显式分段、逐段恢复与冲突安全回滚，不把通用字段映射、目标画布 / 放置、临时资产、一般作者打包命令、公共 HTTPS 或 T4 签名更新标记为完成。

## 已实现契约

- 原有 `{ notes, warnings }` 保持 1–100 条单原子批次，不改变已有 importer 的确认、失败重试与成功关闭行为。
- 大批量 importer 显式返回 `{ segments: [{ notes }], warnings }`。每段 1–100 条，共 2–50 段、101–5,000 条；规范化 title / color / body 文本合计最多 16 MiB。宿主不会暗中把单批结果拆段。
- Plugin Workbench 冻结完整 preview，但最多渲染前 100 条 Note，并列出每个一基区间及 `pending / committing / completed / failed / rolling-back / rolled-back / rollback-conflict / rollback-failed` 状态。
- 确认按区间顺序串行调用既有 `content.createMany`。每段从 import session ID 确定性派生 operation ID；失败停在当前段，已完成区间与条数保持可见。重试复用失败段 ID，命中持久 receipt 后继续后续区间。
- 分段导入不是整体原子事务。后段失败时，前段已经是普通 detached Notes；用户可保留并关闭，或发起逆序回滚。

## 冲突安全回滚

回滚复用既有创建批次 undo，不增加第二条内容写入协议。每段 undo 使用稳定的独立 retry ID。宿主原有 v3 内容 journal 会逐个比较当前文档与导入时精确字节，并在删除前检查当前界面、画布、回收站与工作区内容引用。

确定性的 `revision-conflict`、引用、缺失或损坏冲突会完整保留该段，不覆盖后来编辑，并继续回滚其他干净段。传输或未知错误具有不确定结果，因此暂停在当前段；重试复用同一 rollback ID，再决定是否继续更早区间。冲突粒度是作者声明的一个 segment，不是单条 Note。

分段 session、进度和冲突列表只属于当前 renderer session；关闭、reload、停用、工作区切换或应用重启后不会恢复这块 UI。已创建 Note 与每段内容 history / receipt 仍按既有宿主持久化。session 退出不自动删除资料。

## 自动化与发行包证据

- `importerSessions.test.ts` 覆盖显式段验证、一基范围、逐段顺序、第二段失败、同 ID 继续、逆序回滚、冲突段保留及冲突重试。
- `PluginRuntime.test.tsx` 覆盖 Workbench 区间、前 100 条预览上限、完成与回滚控件；旧单批 UI / 标签行为继续回归。
- `t3Host.test.ts` 与独立组合插件作者测试覆盖 205 条拆为 `100 / 100 / 5`，并拒绝超过 5,000 条。
- 类型检查通过；相关定向回归为 3 文件 / 44 项。独立组合包 source test 与精确三文件 ZIP verifier 通过。
- `bun run test:plugin-t3` 重新构建并解包真实 canary，三轮 launcher 共 38/38：local 23、同 root restart 7、独立 root loopback download 8。local 轮真实提交 205 条，在第二段宿主提交后合成丢失响应；retry 没有重复并继续第三段。随后修改第 101 条，逆序回滚删除首尾 105 条，只保留含用户编辑的中间 100 条。
- 机器摘要见 [trusted-plugin-t3-segmented-result.json](trusted-plugin-t3-segmented-result.json)。canary 为 23,111,056 bytes，SHA-256 `93ae677dc259a4ab0081ba08e66561ad3d7fe3abed28177a99fc61d04ec63341`；三文件插件包为 2,484 bytes，SHA-256 `0b1e41ba8b9e53496b1770a5e2c50e0a4af6e222cf2e63a7092d984e8e9f06bc`。
- 最终串行全仓门禁为 220 文件 / 2,006 项测试全部通过。

## 证据边界

1. 本批证明分段状态与宿主内容事务组合正确，不声称整个大导入原子。进程在若干段后退出时，已确认段保留；它们可通过持久 batch history 单独撤销，但 Workbench session 不跨重启恢复。
2. 一个冲突会保留整个显式段。作者可用更小段降低冲突范围，但每次 host transaction 仍至少一条、最多 100 条；本批不提供逐条强制回滚。
3. 8 MiB 内容 history 与 32 MiB durable intent 上限仍生效。即使 preview 不超过 16 MiB，后续某段也可能因持久历史已满而失败；UI 会如实停在该段。
4. 完成或部分完成后的 reload / 停用只清理 session，不自动撤销已导入内容。对高信任插件在 `parse` 内绕过 SDK 产生的副作用仍没有通用事务保证。
5. 发行包在 macOS arm64 / WKWebView 运行；Windows / Linux、公共外网 HTTPS、人工原生 picker、字段映射、目标画布放置与临时附件生命周期仍未验收。
