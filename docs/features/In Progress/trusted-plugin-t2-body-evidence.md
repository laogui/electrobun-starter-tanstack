# T2 第四批：纯文本正文替换

日期：2026-09-10（Asia/Singapore；机器结果时间为 UTC）。

状态：**已有笔记的纯文本正文批次替换已通过 macOS arm64 发行包验证。整个 T2 尚未完成。**

## 实现范围

- 正式 SDK `app.content.updateMany` 新增 `changes.text`。每篇最多 256 KiB UTF-8，CRLF / CR 规范为 LF，每行一个普通段落，空字符串生成空段落。它显式替换整个富文档，HTML / Markdown 按普通文本处理，不是无损富文本编辑接口。
- 同批可修改标题、颜色及正文。保留 revision 校验、操作回执、写入 intent 和整批冲突规则；SDK 返回值仍为元数据，通过 `get/getMany/query` 读取正文。
- 更新生成转义预览；历史保存替换前后的完整 blocks / preview。Undo 恢复原富文本结构，redo 恢复替换结果，重启后仍有效。原附件文件不因正文替换删除。
- 首次正文历史升级到 `ghostboard-content-history/v2`。当前宿主兼容读取 v1，事务恢复支持 v2；旧宿主拒绝 v2，防止仅撤销元数据。既有历史 8 MiB、请求 1 MiB、intent 32 MiB 限制仍适用，超限不开始写入。
- 正文事件使用 `metadataOnly: false`，选区订阅继续通过持久化读取刷新；本地编辑器不会把正文变化当成可安全合并的元数据变化。

SDK 用法与完整语义见 [SDK README](../../../packages/plugin-sdk/README.md#t2-fourth-slice-explicit-plain-text-body-replacement)。没有新增产品文案或本地化条目。

## 发行包证据

执行 `bun run test:plugin-t2-content`，扩展原有验收驱动，在隔离临时数据目录构建、解包 canary，运行归档中的真实 launcher 两次。

- `initial`：原有两笔记元数据 / 画布 / 文件夹 / 搜索 / 撤销矩阵继续通过；另建带加粗 heading 的笔记，经已启用插件的正式 SDK 替换为两段中英文正文；普通加载 RPC 返回字面 HTML 文本；查询命中新正文；收到非 metadata-only 事件。
- `restart`：重启后正文仍在；undo 加载到原 heading block ID 与 bold 样式；redo 后 revision 为 4；原有元数据历史、普通编辑后冲突和停用生命周期矩阵继续通过。

机器结果：[trusted-plugin-t2-body-result.json](trusted-plugin-t2-body-result.json)。归档 SHA-256：`df9b3241437afeca1d8cbc32a78e2e360abc59e8d43e38bafcc055b0f57abd0b`。

验证环境：darwin arm64、Bun 1.3.13、WKWebView、`views://mainview/index.html`。未请求 Developer ID 签名或 notarization；不声称 Windows / Linux 或 T4 已验收。此为打包应用内自动化流程，不是完整人工鼠标操作验收。

## 自动化覆盖

- 服务测试验证整批修改、UTF-8 大小和类型拒绝、HTML 转义、空正文、查询更新、回执重试、重启后原始富文本与预览恢复、revision 冲突不写入。
- I/O 注入覆盖正文文件 / 历史文件写入失败，下一次读取向前恢复，回执幂等，并能撤销回原正文；没有宣称断电或 fsync 验证。
- 编辑器 saver 测试验证正文通知不提升本地草稿 revision；保存冲突后不写入新画布数据、保持错误状态、重试仍带原草稿和原 revision。

验证结果：`bun run test` 为 204 个文件、1,782 / 1,782 通过，0 失败、0 待运行；`bun run type-check` 与 `bun run check` 通过；`git diff --check` 通过。全量测试在发行构建与类型生成结束后串行运行。类型检查按仓库既有规则忽略 node_modules 中 29 条诊断。

## 仍未完成

1. **宿主已打开编辑器和画布预览不会自动重载正文。**重新打开笔记或重载工作区读取最新内容。本地草稿保持原样，旧 revision 保存被拒绝；自动同步和冲突恢复 UI 仍待实现。
2. `text` 是明确的全文替换，格式和附件引用会从新文档移除；直接用快照 text 写回不是无损往返。新 operation ID 即使写相同文本，也生成新段落身份和 revision。
3. 内容创建、富文档编辑、非笔记快照、自定义卡片及迁移 / 缺失展示、统一原生 / 画布 / 插件 undo 尚未完成。历史容量及恢复 UI 限制继续保留。
