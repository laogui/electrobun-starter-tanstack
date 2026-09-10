# T2 第六批：detached 笔记创建

日期：2026-09-10（Asia/Singapore；机器结果为 UTC）。

状态：**批量创建与受保护的整批撤销已通过 macOS arm64 发行包验证。T2 尚未整体完成。**

## 行为变化

- 正式 SDK 新增 `app.content.createMany(notes, options)`。一次调用创建 1–100 条 sidecar 笔记；宿主生成 opaque `plugin_note_*` ID，作者提供标题及可选颜色和纯文本正文。正文沿用 `updateMany` 的换行归一化、literal text 行为和 256 KiB UTF-8 限制。
- 创建是 detached 内容操作：新笔记在下一次文库扫描或重新打开文库时可见，但不会自动产生画布放置。相同 `operationId` 与相同输入重试返回同一批 ID；输入不同则拒绝复用。
- 创建、历史回执和恢复 intent 在笔记工作区队列中作为一个事务提交。首次创建把历史升级到 v3；崩溃恢复不会重复分配 ID，也只在事务完成或恢复完成后发送 upsert / delete 通知。
- `undo` 删除原创建批次的全部笔记并返回 `removedIds`；`redo` 用原 ID 重建整批笔记并递增 revision。任一笔记已经修改、ID 被占用或历史不一致时，整批操作拒绝，不留下部分结果。
- 删除前保守检查当前 renderer 的 live 引用、活动与回收站画布、持久工作区内容。任一 ID 仍被引用时拒绝整批删除；引用 JSON 损坏、不可读或经过 symlink 时也拒绝。该检查用于防止官方 SDK 流程产生悬空引用，不是高信任插件的安全边界。
- 画布 manifest 保存与内容事务共用同一队列。已撤销的保留命名空间 ID 不会被陈旧画布保存重新生成为 legacy Markdown 空壳。

接口、限制与示例见 [SDK README](../../../packages/plugin-sdk/README.md#t2-sixth-slice-detached-note-creation)。

## 发行包验证

命令：`bun run test:plugin-t2-content`。驱动在隔离数据目录构建并解包 canary，运行归档 launcher，并通过正式 SDK 与真实宿主 RPC 执行两阶段验证。这是打包应用内自动化验证，不冒充人工键鼠验收。

- `initial`：创建两条笔记；相同 operation 重试保持 ID；文库扫描可发现新笔记；当前 live 放置和已保存画布分别阻止 undo；移除引用后保留创建内容供重启阶段验证。
- `restart`：创建内容跨重启存在；整批 undo 后文库移除两条记录；陈旧画布保存不能重建已删除笔记；redo 恢复原 ID 且 revision 递增；修改其中一条后后续 creation undo 拒绝整批删除。

机器结果：[trusted-plugin-t2-creation-result.json](trusted-plugin-t2-creation-result.json)。归档 SHA-256：`f7ce5584b6afab2cff2614726c8971c2ee076206b00a0f39056931f306464274`。

平台：darwin arm64、Bun 1.3.13、WKWebView、`views://mainview/index.html`。未请求 Developer ID 签名 / notarization，未验证 Windows / Linux。

## 自动化覆盖

- Bun 内容服务：创建输入与大小限制、稳定回执、跨重启 undo / redo、单笔修改冲突、live / canvas / trash / backlink 引用保护、损坏 manifest、ID 占用、事务中断恢复及历史损坏保护。
- 宿主保存：陈旧 `plugin_note_*` 画布引用不会生成 legacy 内容；manifest 与笔记事务串行。
- renderer SDK：创建 transport、返回值校验、当前画布与打开编辑器 live 引用快照，以及引用解除后的重试。
- 发行包：既有元数据、正文与 live reconciliation 矩阵连同创建场景在同一归档内运行，随后重启同一隔离工作区验证持久状态。

验证结果：全量 `bun run test` 为 **205 个文件、1,807 / 1,807 通过，0 失败、0 待运行**；`bun run type-check`、`bun run check`、`git diff --check` 均通过。类型检查沿用仓库规则忽略 node_modules 中 29 条诊断。全量测试在发行构建结束后串行执行；jsdom 输出既有的 navigation / media `Not implemented` 日志，但最终 JSON 报告为 `success: true`。

## 保留边界

1. `createMany` 只创建 sidecar-backed note，不接受调用方 ID，不创建画布放置、附件或富文本 blocks；需要放置时由宿主现有画布流程显式完成。
2. 引用扫描是保守的 ID 文本匹配，可能把工作区正文中对该 opaque ID 的普通文字提及视为引用。应用外文件修改不会主动发出内容事件。
3. 文库已打开时不保证增量刷新；关闭后重新打开或下一次扫描会显示新笔记。
4. 自定义卡片及迁移 / 缺失插件展示、冲突恢复 UI、富文档创建、统一原生 / 画布 / 插件 undo 仍属后续 T2 工作。
