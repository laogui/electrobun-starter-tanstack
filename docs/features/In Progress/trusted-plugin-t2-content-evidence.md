# T2 第二批：笔记元数据事务与恢复验收

日期：2026-09-10（Asia/Singapore；机器结果内时间为 UTC）

状态：**笔记查询、标题 / 颜色批次和持久化撤销 / 重做已通过 macOS arm64 发行包验证；整个 T2 尚未通过。**

本页保留第二批当时的验收范围；后续笔记选区快照、`getMany` 与 React 选区 hooks 见 [第三批证据](trusted-plugin-t2-selection-evidence.md)。

依据：[主方案 §10](trusted-plugin-platform.md#10-实施阶段与退出条件)。完整公开契约见 [SDK README](../../../packages/plugin-sdk/README.md#t2-second-slice-note-metadata-transactions)，前一批服务见 [A4 证据](trusted-plugin-t2-a4-evidence.md)。

## 1. 本批实现

- 正式 `app.content.get/query/updateMany/undo/redo`。查询返回笔记标题、颜色、可搜索文本、来源和 revision；legacy Markdown 可读但 revision 为 `null`，不能通过本批 API 写入。
- `updateMany` 仅允许 sidecar 笔记的标题 / 颜色，每批 1–100 个不重复 note ID，每项必须带 `expectedRevision`。所有项先校验，再提交；任一冲突则整批拒绝。保留正文 blocks、preview 和未知 sidecar 字段。
- 宿主编辑器、manifest 元数据和插件写入共用进程内工作区队列，将读取、revision 检查与写入放在同一操作中。普通编辑器提交和实际元数据修改也检查旧 revision；旧画布保存不能覆盖新笔记元数据。
- 每个实际修改、undo 和 redo 使用新的递增 revision。撤销针对原始批次，按插件 / 工作区隔离；任一成员已经被编辑则整批拒绝，不静默跳过，也不恢复旧 revision。
- 持久化操作回执支持相同 `operationId`、相同输入的幂等重试；不同输入复用 ID 报错。回执是原始结果，不是当前快照：撤销后重试原 update 不会重新应用。全 no-op 批次保留回执，不增 revision、不通知、不创建可撤销批次。
- 批次先持久化包含数据和历史 before / after 的 intent，再写入各文件。后续受队列保护的操作先完成恢复。恢复向前完成已记录事务；若当前文件既非 before 也非 after，保留 intent 与独立修改，返回 `recovery-conflict`，不覆盖外部改动。
- 一次批次完成后发送包含 `noteChanges` 的聚合内容通知。宿主更新重复画布放置、文件夹、分离节点和焦点元数据，不重挂编辑器、不覆盖待保存正文。
- 编辑器仅在 revision 连续、已证明为 metadata-only 且本地元数据无冲突时更新私有 revision / frontmatter。正文变化、revision 缺口、本地标题冲突均保留草稿并拒绝覆盖。重新打开编辑器时将加载的 canonical 元数据与同次读取的 revision 配对。

本批没有新增界面文案，不涉及 `messages/*.json` 本地化更新。旧 `contentBatch.ts` 保留为历史实现，不是此次正式 SDK 的事务路径。

## 2. 发行包验证

入口：`bun run test:plugin-t2-content`。脚本将无构建 JavaScript 插件复制到仓库外目录，构建、解包 canary 归档，直接运行归档内 launcher。应用数据、插件目录与工作区全部隔离；插件通过公开 SDK 注册 normalize / undo / redo 命令，不直接导入宿主内容实现。

| 独立进程启动 | 实际验证 |
| --- | --- |
| `initial` | 普通 RPC 创建两篇 revision 1 笔记；公开查询返回正文文本；真实画布 manifest 保存；一次命令批量修改两篇标题 / 颜色；画布与文件夹投影更新；搜索命中新标题；陈旧 manifest 被拒绝且不能覆盖新值；一次 undo 恢复整批；redo 使用新 revision；内容事件带元数据 |
| `restart` | 实际退出后重新启动，同一工作区保留 revision 4 的新元数据；已持久化历史可撤销至 revision 5；普通编辑器 RPC 提交正文至 revision 6；随后 redo 因用户编辑而整批冲突；停用后旧激活的 content API 返回 `AbortError` |

两次均使用 `views://mainview/index.html`、WKWebView、Bun 1.3.13 / darwin arm64。宿主报告的 arm64 为判定依据，不以 WKWebView 的 Intel 兼容 User-Agent 判断架构。

画布 / 文件夹引用由验收驱动操作宿主 store，正文写入经普通 RPC；不代表人工鼠标操作或真实编辑器输入交互全部验收。待保存草稿、连续保存和私有标题冲突另由 renderer 自动化测试覆盖。中断恢复使用注入 I/O 失败与重建服务验证，没有在发行应用某个精确事务指令处强杀进程，也没有声称完成断电 / fsync 故障验证。

原始机器结果及回归结果：[trusted-plugin-t2-content-result.json](trusted-plugin-t2-content-result.json)。本批归档 SHA-256：

`e4c40297243469a37a0aed7b49c3247cb822a70e6fdffdeb8717a2da144177b8`

构建没有请求 Developer ID 签名或 notarization，不构成 T4 签名更新验收。

## 3. 自动化与发行回归

| 命令 / 检查 | 结果 |
| --- | --- |
| `bun run test`（JSON reporter） | 200 个文件，1,752 / 1,752 项通过，0 失败、0 待运行 |
| `bun run test:plugin-t2-content` | 上述两次实际发行应用启动通过 |
| `bun run test:plugin-t2-a4` | 首次、重启、第二工作区、返回原工作区四阶段通过 |
| `bun run test:plugin-t1` | 生命周期及跨工作区两阶段通过，含 A1–A3 回归 |
| `bun run build:canary` | 无验收开关的普通发行构建通过 |
| `bun run type-check` | 通过；脚本忽略 Electrobun `node_modules` 源码中的 29 项依赖诊断 |
| 变更源码 / JSON 的 Ultracite / Biome | 通过 |

本次 A4 回归归档 SHA-256：`dde9e8d1a86b80849ee7bc9775d0a4210e0a6020fbf2ab4576922a58f68aa420`。

本次 T1 回归归档 SHA-256：`a31757d278acfafd294295d4d7a595bbb27d257cf96045de73a8cefff65c9253`。

自动化重点覆盖：

- `src/bun/plugins/noteContent.test.ts`：文本查询 / 分页、批次预检、全 no-op、重复 / 不支持字段拒绝、未知 sidecar 数据保留、幂等回执、跨插件隔离、重建服务后 undo / redo、整批冲突、编辑器 / 插件竞争和陈旧 manifest 元数据拒绝。
- 同文件注入 note 与 history 写入失败：返回 `commit-pending`、保留 intent、下一次读取 / 服务重建完成恢复、同 ID 重试不重复应用；独立外部改动阻止恢复且保留文件与 intent。
- `src/mainview/plugins/runtime/content.test.ts`：固定激活身份、操作 ID、服务错误、双 signal、超时，以及取消 endpoint 等待后不晚发写入。
- `src/mainview/lib/noteMetadataProjection.test.ts`、`src/mainview/plugins/runtime/hostEvents.test.ts`：重复放置、分离节点、嵌套 / 平铺文件夹、焦点、旧事件 / 跨工作区过滤、本地元数据冲突、正文数据不变。
- `src/mainview/components/editor/useBlockNoteSaver.test.ts`、`BlockNoteEditor.integration.test.tsx`：待保存正文保留、metadata-only revision 更新、正文变化 / 缺口 / 标题冲突拒绝覆盖、连续保存消化最新确认 revision、打开时 canonical 元数据配对。

## 4. 边界与后续

**本批不是 T2 整阶段退出。**

1. 未实现公开 SDK 正文修改 / 内容创建、内容选区快照和 React 业务 hooks；不支持通过此 API 修改 widget 或 extension instance。
2. 未完成第三方自定义卡片、可持久化编辑、迁移和缺失插件摘要展示。
3. 插件 undo / redo 是显式 SDK / 插件命令，不是统一的原生 Ctrl/Cmd+Z 时间线。旧画布布局快照仍可能显示旧元数据，但其旧 revision 阻止覆盖 canonical 内容；重新打开笔记加载 canonical 元数据。统一历史与冲突恢复 UI 仍待实施。
4. 查询分页不是跨请求冻结快照；事件不是持久日志，不保证重放或监听外部文件改动。取消 / 超时不回滚已提交 intent，应使用同 ID、同输入重试并查询现态。
5. 队列仅在单宿主进程内仲裁，不提供跨进程锁或外部读者的文件系统快照。使用已有原子文件替换，不承诺断电持久性。独立外部编辑只能在恢复检查观察到时报告冲突，不能以此代替跨进程仲裁。
6. intent 上限 32 MiB；历史 / 回执上限 8 MiB，未做自动裁剪。历史满时新变更在写内容前以 `history-limit` 拒绝；历史归档策略待补。
7. 未验收 Linux / Windows、外部真人作者试用、原生目录选择器人工交互。
