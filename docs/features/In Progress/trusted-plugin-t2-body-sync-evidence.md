# T2 第五批：宿主正文同步

日期：2026-09-10（Asia/Singapore；机器结果为 UTC）。

状态：**干净编辑器与画布正文同步已通过 macOS arm64 发行包验证。T2 尚未整体完成。**本批覆盖第四批“不自动重载正文”的限制。

## 行为变化

- 正文修改通知触发队列内的 canonical 读取，返回 blocks、纯文本与派生预览。读取请求和编辑器注册均绑定工作区；旧工作区、断开连接、较旧请求及版本不匹配的结果不会替换当前内容。
- 干净状态下，刷新重复画布放置、文件夹子项及焦点数据，并在原编辑器实例中替换 blocks。插件 undo / redo 同步刷新当前富文档，无需关闭重开，也不自动保存一次外部替换。
- 正文读取尚未完成时收到后续 metadata-only 事件，会保留最初放置版本作为基线，读取最新版本，避免旧正文配上新标题。
- 有正文草稿、正在编辑标题、本地标题 / 颜色冲突或进行中的保存时，该笔记的编辑器与放置视图保留现状，不更新草稿 revision。后续陈旧保存继续由宿主拒绝。
- 用户输入在异步 Markdown 序列化前立即标记为脏；序列化尚未完成时不误写上一次 payload，较旧的序列化结果不能覆盖较新输入。

无新增公开 SDK 接口和本地化文案。使用说明见 [SDK README](../../../packages/plugin-sdk/README.md#t2-fifth-slice-live-host-body-reconciliation)。

## 发行包验证

命令：`bun run test:plugin-t2-content`。驱动在隔离数据目录构建并解包 canary，运行归档 launcher，加载正式插件 SDK，同时挂载真正的 `BlockNoteEditor`。这是打包应用内自动化验证，不冒充人工键鼠验收。

- `initial`：原有元数据、画布、文件夹、搜索和正文事务矩阵继续通过；挂载真实编辑器，插件替换正文后，实际编辑器 DOM 出现新正文，画布放置 revision 与 previewExcerpt 更新。
- `restart`：重新启动后挂载真实编辑器；undo 后 DOM 恢复原富文本正文和 h2，redo 后正文再次更新；持久化历史与停用检查继续通过。

机器结果：[trusted-plugin-t2-body-sync-result.json](trusted-plugin-t2-body-sync-result.json)。归档 SHA-256：`578e6c5dd090863c6461a03bbd81b60d5f785f320d630c85168eb558346c0314`。

平台：darwin arm64、Bun 1.3.13、WKWebView、`views://mainview/index.html`。未请求 Developer ID 签名 / notarization，未验证 Windows / Linux。

## 自动化覆盖

- 正文协调器：重复放置、文件夹、焦点同步；读取期间变脏；reset 后晚到响应；错误工作区；旧编辑器同名笔记隔离；连续正文 / 元数据更新；失败或版本不匹配读取保留原状态。
- 编辑器集成：干净正文替换与保存版本更新；本地标题草稿保护；输入立即标脏和乱序序列化结果丢弃。
- Saver：本地元数据冲突保护、序列化前不误写旧 payload；原有冲突后保留草稿、连续保存及 metadata-only 合并回归继续覆盖。
- Bun RPC：拒绝指向旧工作区的正文读取；既有 sidecar / legacy 导入读取测试继续通过。

验证结果：全量 `bun run test` 为 **205 个文件、1,794 / 1,794 通过，0 失败、0 待运行**；`bun run type-check`、`bun run check`、`git diff --check` 均通过。类型检查沿用仓库规则忽略 node_modules 中 29 条诊断。全量测试在发行构建结束后串行执行。

## 保留边界

1. 冲突时保留草稿和旧版本，不自动合并或丢弃；合并 / 放弃 / 重载交互仍待实现。关闭重开前应自行保留需要的草稿。
2. 此同步依赖宿主内容通知，不监听应用外文件修改。读取失败保留原界面，后续事件可重试。
3. 放置数据须具备匹配版本且元数据无冲突。未知或不连续的缓存不会被猜测性覆盖。画布 content 缓存采用纯文本，富文档仍保存在 sidecar，预览由 blocks 派生。
4. 内容创建已在后续的[第六批证据](trusted-plugin-t2-creation-evidence.md)中完成当前范围验收。富文档编辑 API、自定义卡片 / 迁移 / 缺失展示、统一原生 / 插件 undo 及冲突恢复 UI 仍属后续 T2 工作。
