# P0 已冻结的最小插件契约（v1，已归档）

> **归档说明（2026-09-09）**：本契约（`ghostboard.plugin.json`、`manifestVersion: 1`、QuickJS 命令会话、选区权限二次授权）属于已放弃的沙箱模型。现行契约见 [高信任插件系统改造方案](../In%20Progress/trusted-plugin-platform.md) §5；新宿主对 v1 包拒绝加载并提示重新安装。本文保留作为旧包格式与桌面验收证据的历史记录。

日期：2026-09-08。这是当时实现并经仓库外样例验证的子集，不是拟议 SDK 全文。

独立样例可由 `GHOSTBOARD_PLUGIN_SAMPLES` 指向宿主仓库外的 `ghostboard-plugin-samples`；未设置时，自动化测试使用受控的 `fixtures/plugins` 样例集，因此 CI 不依赖开发者本机相邻目录。外部样例仍用于独立包契约与桌面验收。

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

## 当前包管理入口（2026-09-08）

- 桌面产品的“设置 → 插件”可选择本地 `.zip` / `.ghostboard-plugin` 包，或提交一个直接 HTTPS ZIP URL。文件路径与包字节只由宿主进程读取；公开 URL 拒绝 userinfo、私有网段、loopback、非 HTTPS 与 HTTPS→HTTP 降级重定向。
- 宿主先解包、校验 manifest 与条目、生成 SHA-256、写入可恢复的暂存事务；界面展示脱敏来源、贡献种类、版本、兼容 API 范围与声明权限。用户必须明确点“安装插件包”才会提交。
- 已提交的包保存于工作区 `.ghostboard/plugins/`，会在列表中重新校验。含命令的包仍先显示“已保存 — 未激活”；用户须在设置页第二次确认，才会为**当前工作区**启用命令。授权记录位于应用本地，按解析后工作区路径的 SHA-256 键入，不把绝对路径写入记录；复制或移动工作区不会带走授权。
- 启用时只授予 manifest 声明的必需选区权限，绝不自动授予可选权限。应用本地记录还绑定已加载 manifest 与可执行源的指纹；指纹不匹配时，菜单条目和执行资格都会失效，需重新审阅并启用。
- 已启用命令出现在原生 `Plugins` 菜单，选中 Note 后由宿主 RPC 运行。面板、导入器和画布类型仍只会保存，不能被这条路径动态注册或执行；尚无可用的第三方面板容器。
- 因而本入口是受限的命令安装/激活闭环，不是公开插件平台发布，也不是对包作者身份、签名、更新或通用执行安全性的承诺。

## 命令运行

- 上下文种类必须是 `operation`，带宿主签发的 `operationId`。不得出现 `instanceId`。
- 每次调用新建 QuickJS WASM module。注入对象只有 `ctx.content.readSelection`、`ctx.content.applyBatch` 和 `ctx.operationId`。
- 没有 `module`、`require`、Node、Bun、HostRef 或模块加载器。
- 请求与返回都是严格 JSON；BigInt、循环引用、函数、Symbol、非有限数字为 `protocol-error`。
- `content.readSelection` 需要已授予且已声明的 `content.selection.read`。当前探针返回 `{ items: [{ token, title, revision }] }`。
- `content.applyBatch` 会出现在 `ctx` 上。P1 已实现标题-only 批次（见下文）；宿主夹具里的预览命令仍可不调用它。经过设置页二次授权的第三方命令可在产品原生 `Plugins` 菜单中运行；未授权包、可选权限与非命令贡献不会因保存而生效。
- 控制消息上限 256 KiB。超时、内存和 host-call 次数有上限；失败后会话不可复用。

## 面板运行

- 上下文种类必须是 `view`，带宿主签发的 `viewSessionId`。不得出现 `instanceId`。
- 打开/关闭/重开会更换 `viewSessionId`。
- 页面只接受宿主 `handshake`。身份以宿主签发的 session/nonce/epoch 为准，不信任自报 ID。
- 产品窗口仍未接入该面板。macOS 独立 WKWebView helper 已确认能以无桥的内存 `ghostboard-plugin:` URL 加载相对 CSS/ES module，并由 HTTP(S)/WS(S) 内容规则阻断 URL 型 loopback 请求；但 blocklist 候选仍向本机 UDP STUN 接收端发送了 2 个 WebRTC 包，说明 URL 规则没有约束该直接网络路径。它不是通过的 P0 容器，也不是已发布 SDK facade。

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
- 画布选区通过 `collectSelectedNoteIds` 收集 noteId（含 folder children，同一实体去重）。`applyNoteTitles` 把标题写到所有出现该 noteId 的节点并入画布 Undo。`normalizeSelectedNoteTitles` 经 `pluginNormalizeNoteTitles` RPC 对 sidecar 跑 title-tools，再投影到画布；已启用第三方命令经 `pluginRunCommand` 使用同一标题批次、投影和 Undo/Redo 路径。画布 Undo/Redo 在命中该快照时分别调用 `pluginUndoNoteTitles` / `pluginRedoNoteTitles`。入口是宿主 Edit 菜单、卡片右键和受控的原生 `Plugins` 菜单，不是公开命令面板。
- 2026-09-08 CUA：隔离工作区 sidecar `  Hello   world ` → `Hello world`（revision 3→4），退出再开仍在。随后把原生 `role:undo` 改成 `canvasUndo`；同会话 Edit Undo 把 sidecar 拉回 `  Hello   world `（revision 3），journal `undone: true`。证据：[p1-title-rpc-desktop.json](./plugin-container-evidence/2026-09-08/p1-title-rpc-desktop.json)、[p1-title-canvas-undo.json](./plugin-container-evidence/2026-09-08/p1-title-canvas-undo.json)。
- 2026-09-09 CUA 桌面验收：在隔离工作区通过设置页安装 `community.example.title-tools`，完成二次授权后从原生 `Plugins` 菜单运行；真实 sidecar 标题完成归一化，原生 Edit Undo/Redo 均恢复正确。停用后菜单变为禁用的 `No enabled plugin commands`，直接 RPC 返回 `invalid-state`；原工作区重启后授权保留。复制工作区包含包但显示 `Stored — not activated`，没有继承授权，切回原工作区后授权仍有效。证据：[p0-title-tools-desktop-acceptance.json](./plugin-container-evidence/2026-09-08/p0-title-tools-desktop-acceptance.json)。
- 仓库外 `title-tools` 现在读取后提交 `applyBatch`，并声明 `content.selection.write`。

未冻结：公开命令面板、第三方面板/导入器/画布类型的动态注册与激活、npm SDK、通用 schema。重启后的 journal Undo 无独立 UI。命令型第三方插件的安装、授权、原生菜单运行、撤销/重做、停用、重启持久化和复制工作区隔离已经完成桌面验收；这不等于四类第三方贡献均可运行。签名更新未实现。
