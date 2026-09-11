# T2 第八批：聚焦编辑器冲突恢复

日期：2026-09-11（Asia/Singapore；机器结果为 UTC）。

状态：**本地 BlockNote 草稿与插件内容事务的 revision 冲突已提供可见、可选择、再次校验的恢复 UI，并通过 macOS arm64 发行包验证。T2 尚未整体完成。**

## 行为变化

- 普通编辑器保存收到 `conflict: true` 后进入独立的 `conflict` 状态，不再归入泛化 I/O 保存失败。宿主停止计时器、窗口失焦和再次 blur 触发的自动旧 revision 重试，保留最新序列化 blocks / Markdown、标题/颜色和编辑器内容。
- 冲突读取使用编辑器初次 canonical load 返回的 workspace ID 调用 `loadBlockNote`。宿主只接受同工作区、revision 不低于冲突响应、且同时包含合法 blocks、preview、plain text、title 与 color 的快照；失败时不清空草稿，只显示重新载入动作。
- 聚焦编辑器显示常驻 alert，包含可展开的“你的草稿 / 已保存版本”标题和正文摘要比较。`Use saved version` 不写盘：它清除本地 dirty payload，替换真实 BlockNote blocks / 标题并把 canonical revision、preview、正文和颜色投影到顶层副本、Folder child 与 focused snapshot。
- `Keep my version` 不绕过并发控制。它把仍在编辑器中的本地 payload 绑定到刚读取的 revision，再走同一个 `saveBlockNote` compare-and-swap；若正文输入后的异步序列化还没完成，该动作暂时禁用；若又有写入抢先完成，保存再次失败并载入更新版本，不静默覆盖。
- 未解决冲突时，返回按钮、背景点击和 Escape 不会直接丢弃内存草稿，而是显示带 `Close and discard` 明确动作的非阻塞提示。用户完成任一恢复动作后正常关闭。

这是宿主 BlockNote 编辑器的确定性二选一恢复，不是自动富文本合并。插件自身调用 `app.content.updateMany/undo/redo` 的冲突仍通过 `revision-conflict` 交给插件处理。

## 发行包验证

命令：`bun run test:plugin-t2-content`。现有内容事务发行包探针新增一篇独立 conflict note，避免改变正文历史、创建和重启验收的前置状态。驱动在隔离数据目录构建、解包 canary，并运行归档 launcher 两次。

- `initial`：真实 BlockNote editor 中先输入本地标题草稿，再由外部 development-directory 插件提交新标题 / 正文；插件通知不覆盖 dirty editor。失焦触发旧 revision 保存后，alert 同时显示本地与已保存标题。选择已保存版本后，编辑器和投影采用插件内容且没有新增写入。第二轮冲突选择本地版本后，以插件 revision 重新保存并递增 revision。
- `restart`：原有笔记元数据、正文、富文本 undo / redo、创建 undo / redo、整批冲突、事件和停用回归全部继续通过，证明独立冲突场景没有破坏持久历史。

机器结果：[trusted-plugin-t2-conflict-result.json](trusted-plugin-t2-conflict-result.json)。归档 SHA-256：`b3ce87d793436cf60531b1cd09c30afa49fb332dddaa22b9736ffdcee912eee5`。

平台：darwin arm64、Bun 1.3.13、WKWebView、`views://mainview/index.html`。未请求 Developer ID 签名 / notarization，未验证 Windows / Linux。应用日志只有探针有意制造的 stale manifest rejection，没有未解释的 error / fatal。

## 自动化覆盖

- Saver hook：工作区绑定读取、冲突 / 普通错误区分、自动重试暂停、读失败重试、采用 saved 不写盘、等待最新草稿序列化、保留 local 使用最新 revision、第二次竞争回到冲突、旧 note 响应失效。
- Editor / projection：alert 与两个版本可访问、真实 blocks / title 替换、显式 discard 可覆盖冲突缓存并刷新顶层、嵌套和 focused 投影。
- FocusedView：冲突状态不会只显示泛化失败 toast；关闭需要通过非阻塞提示的明确丢弃动作。
- 发行包：真实 React + BlockNote + Bun RPC + 外部插件事务完成两种选择，并回归重启持久化与既有内容历史。
- 完整串行回归：206 个测试文件、1829 个测试全部通过；类型检查与 Ultracite 检查通过。

## 保留边界与下一步

1. 比较展示宿主已拥有的标题和 plain-text 摘要，不实现 block-level diff，也不把两棵富文本树自动合并。继续在编辑器中修改后可选择保留本地版本。
2. 草稿仍是当前编辑器内存状态；本批没有跨应用重启的 draft journal。关闭前必须解决或显式选择丢弃，但进程崩溃恢复不在本批承诺内。
3. 本批只处理宿主 BlockNote editor 与 canonical note record 的冲突。外部文件直接写入、legacy Markdown、插件卡片 state 和批量插件命令各自沿用现有失败语义。
4. 原生画布快照、BlockNote 编辑器 undo、widget / extension record history 与插件持久批次历史仍相互独立。下一批先冻结统一 undo 的事件顺序、作用域、持久化 cursor、重启行为和冲突处理，再决定是否实现；不能仅把多个栈轮询拼成“全局撤销”。
