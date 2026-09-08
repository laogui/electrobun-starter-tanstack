# P0 已冻结的最小插件契约

日期：2026-09-08。这是当前实现并经仓库外样例验证的子集，不是拟议 SDK 全文。未列入的字段和方法不得当作已发布能力。

独立样例在宿主仓库外：`../ghostboard-plugin-samples`（可用 `GHOSTBOARD_PLUGIN_SAMPLES` 覆盖）。宿主仓库内的 `fixtures/plugins` 只保留自动化夹具。

## 包布局

- 根目录必须有 `ghostboard.plugin.json`。
- 命令 handler 与面板 entry 是包内相对路径，禁止绝对路径、`..` 和空段。
- 命令：`文件#导出名`，例如 `main.js#normalizeTitles`。
- 面板：`.html` / `.js` / `.mjs` 入口。`views` 与 `panels` 互斥，解析后都进入 `contributes.panels`。
- 源文件不得 `import`/`require` GhostBoard、Electrobun、`node:`、`fs`、`path`、`child_process` 或 `@/`。

## Manifest

已实现并验证：

| 字段 | 约束 |
| --- | --- |
| `manifestVersion` | `1` |
| `id` | 第三方插件 ID，至少一段点分 kebab-case，不得使用 `ghostboard.` 前缀 |
| `name`、`version` | 名称必填；版本为不含前导零的 semver |
| `engines.hostApi` | 仅 `>=x.y.z <a.b.c`，与宿主 `1.0.0` 做上下界比较 |
| `permissions.required` / `optional` | `{ id, reason }`；必需权限必须属于 `content.selection.read` / `content.selection.write` |
| `contributes.commands` | `id`、`name`、`handler`，可选 `when`（宿主公布的条件标识，不执行表达式） |
| `contributes.views` 或 `panels` | `id`、`name`、`entry`，可选 `singleton` |
| `description`、`author` | 展示文本，不证明身份 |

明确拒绝或尚未冻结：`events`、`menus`、`settings`、完整 semver range、未知必需权限、同时声明 `views` 与 `panels`、签名更新、ZIP/URL 安装字段。

## 命令运行

- 上下文种类必须是 `operation`，带宿主签发的 `operationId`。不得出现 `instanceId`。
- 每次调用新建 QuickJS WASM module。注入对象只有 `ctx.content.readSelection`、`ctx.content.applyBatch` 和 `ctx.operationId`。
- 没有 `module`、`require`、Node、Bun、HostRef 或模块加载器。
- 请求与返回都是严格 JSON；BigInt、循环引用、函数、Symbol、非有限数字为 `protocol-error`。
- `content.readSelection` 需要已授予且已声明的 `content.selection.read`。当前探针返回 `{ items: [{ token, title, revision }] }`。
- `content.applyBatch` 会出现在 `ctx` 上。P1 已实现标题-only 批次（见下文）；宿主夹具里的预览命令仍可不调用它。公开安装未开放。
- 控制消息上限 256 KiB。超时、内存和 host-call 次数有上限；失败后会话不可复用。

## 面板运行

- 上下文种类必须是 `view`，带宿主签发的 `viewSessionId`。不得出现 `instanceId`。
- 打开/关闭/重开会更换 `viewSessionId`。
- 页面只接受宿主 `handshake`。身份以宿主签发的 session/nonce/epoch 为准，不信任自报 ID。
- 产品窗口仍未接入该面板。macOS 独立 WKWebView helper 是容器探针，不是已发布 SDK facade。

## 协议常数

- `PLUGIN_PROTOCOL_VERSION = 1`
- `HOST_API_VERSION = 1.0.0`
- 信封类型：`handshake`、`handshake-ack`、`invoke-command`、`host-call`、`permission-request`、`permission-result`、`response`、`error`、`dispose`、`disposed`、`timeout`、`crash`、`runtime-restart`
- host-call 方法名已列出；除 `content.readSelection` 与会话身份外，P0 探针不提供可用实现

## 验证

- 仓库外命令：加载 `title-tools`，QuickJS 运行 `normalize-titles`，预览去掉多余空白。
- 仓库外面板：加载 `notes-panel`，视图会话打开、通信、关闭、重开，两次 `viewSessionId` 不同。
- 证据：[out-of-repo-samples.json](./plugin-container-evidence/2026-09-08/out-of-repo-samples.json)

## P1 标题批次（2026-09-08）

已实现、仅标题：

- 宿主在调用前冻结选区，签发 `plgsel_` 令牌，按内容实体去重。插件只能对冻结令牌提交。
- `applyBatch({ operationId, label?, operations: [{ ref, expectedRevision, set: { title } }] })`。`operationId` 必须等于会话签发值。标题最长 256，每批最多 100 条，全有或全无。相同 `operationId` 重放返回首次结果。
- 一次 Undo 按 operation 恢复前像；若该实体 revision 已前进则跳过，不覆盖较新写入。
- 批次 journal 可重新打开。JSON sidecar Note（`content/.ghostboard/blocknote/<noteId>.json`）是标题与 revision 的来源；plugin 标题写入会提升 sidecar revision，并保留 blocks/preview。canvas `saveManifest` 仍走 `mergeNoteMeta`，不提升 revision。
- 画布选区通过 `collectSelectedNoteIds` 收集 noteId（含 folder children，同一实体去重）。`applyNoteTitles` 把标题写到所有出现该 noteId 的节点并入画布 Undo。`normalizeSelectedNoteTitles` 经 `pluginNormalizeNoteTitles` RPC 对 sidecar 跑 title-tools，再投影到画布；画布 Undo/Redo 在命中该快照时分别调用 `pluginUndoNoteTitles` / `pluginRedoNoteTitles`。产品入口是宿主 Edit 菜单和卡片右键，不是公开命令面板。
- 2026-09-08 CUA：隔离工作区 sidecar `  Hello   world ` → `Hello world`（revision 3→4），退出再开仍在。随后把原生 `role:undo` 改成 `canvasUndo`；同会话 Edit Undo 把 sidecar 拉回 `  Hello   world `（revision 3），journal `undone: true`。证据：[p1-title-rpc-desktop.json](./plugin-container-evidence/2026-09-08/p1-title-rpc-desktop.json)、[p1-title-canvas-undo.json](./plugin-container-evidence/2026-09-08/p1-title-canvas-undo.json)。
- 仓库外 `title-tools` 现在读取后提交 `applyBatch`，并声明 `content.selection.write`。

未冻结：公开命令面板、公开安装、导入器、画布类型、npm SDK、通用 schema。重启后的 journal Undo 无独立 UI。宿主已有 ZIP 解包、URL 下载、安装事务和发布描述 JSON 解析（`loadPluginFromZip` / `loadPluginFromZipUrl` / `PluginInstallStore` / `parsePluginReleaseDocument`），不等于用户可安装或运行已提交的第三方包。签名更新未实现。
