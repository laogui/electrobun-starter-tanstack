# 插件系统整改计划（Hardening Round 1）

> 状态：H1–H6 已全部落地（`b44283e..0574079`），待人工验收
> 基线：`main @ b44283e`
> 前置：`trusted-plugin-platform.md`、`canvas-extension-platform-refactor.md`
> 背景：外部只读架构复核指出 10 项问题。本文对照代码逐条核实后，收敛为 6 个整改任务（H1–H6），按交付风险排序，每项可独立提交、独立验收。**本轮不改信任模型**：插件仍是 trusted/high-trust，沙箱、认证 capability bridge、marketplace 不在范围内。

## 1. 核实结论与范围

| # | 复核意见 | 核实结果 | 本轮处理 |
| --- | --- | --- | --- |
| 1 | 持久化 scheduler 没有到点投递 | 成立。`tickExtensionTasks()` 只在 `loadCanvas` 调一次且结果丢弃（`src/bun/index.ts:2024`）；`ReminderWidgetBody` 的 30s 定时器只更新子组件状态，不会重跑 `ReminderCanvasSurface` 的 due effect | **H1** |
| 2 | task id 跨 instance 冲突 + 并发丢写 | 成立。`scheduler.ts:202/215` 只按裸 `id` 过滤；`extensionInstanceClearType` 嵌套 `Promise.all` cancel，文件无串行队列 | **H1** |
| — | （复核未提）Reminder 用 `reminder:${fireAt}` 做 id，snooze/改期后旧任务不 cancel；repeat 任务永久残留，最终撞 `MAX_TASKS=500`；effect 每次 `normalized` 变化都写文件 | 成立 | **H1** |
| 4 | ZIP 解压限制依赖声明尺寸 | 成立。`inflateRawSync` 无 `maxOutputLength`（`zipInstall.ts:240`），ratio/总量都按 central directory 声明值 | **H2** |
| 3 | URL 安装 SSRF/下载量未约束真实行为 | 成立。仅字面 hostname 匹配，缺 IPv6 私有段、`0.0.0.0`、`100.64/10`；`arrayBuffer()` 先全读；无超时 | **H3** |
| 6 | registry/enablement/scheduler 把损坏当空 | 成立。`pluginInstall.ts:381`、`management.ts:440`、`scheduler.ts:96`；`writeEnablement` 会用空对象覆盖损坏文件 | **H4** |
| 7 | `expectedRevision` 在 renderer 无语义 | 成立。`extensionInstanceStore.updateState()` 不读该字段 | **H5** |
| 5 | installed package 内容变化被当新 generation | 事实成立，但 trusted 桌面模型下本机写权限已等价 RCE，**降为 P2**。价值在于 installed/development 语义分离 | **H6** |
| 8 | 产品版本承担 host API 兼容职责 | 设计债，无用户影响 | 下一轮 |
| 9/10 | same-realm 无故障隔离、namespace 非认证边界 | trusted 模型下不是缺陷 | 仅在决定支持 untrusted 时启动 |

**不在本轮范围（确认为有意设计）：**

- `app.tasks`（plugin SDK 内存 scheduler，文档明示重启不恢复）。H1 只针对 `host.scheduler` / `extension-tasks.json`。
- 插件 lifecycle（candidate→publish→retire、cleanup timeout、generation 保护）。复核确认成熟，不动。
- plugin storage 和 note content 的 corruption 处理，已经是 fail-closed，H4 以它们为对齐基准。

## 2. 关键事实（动手前必读）

- **通知只是 toast**：`hostApi.ts:219` 的 `notifications.show` 调 sonner。所以 fired task 最终必须到 renderer，host 侧 timer 不能独立完成"通知"。
- **host→renderer 已有消息通道**：`rpc.ts:74` 的 `messages`（如 `pluginContentChanged` → `CustomEvent`），bun 侧类型在 `index.ts:1259` `webview.messages`。新增 `extensionTaskFired` 消息沿用这个模式。
- **workspace 串行队列已有范式**：`noteTransactions.ts:242` `withNoteWorkspace()`（per-path Promise 链 + AsyncLocalStorage 重入），`management.ts:35` `enablementWrites`。scheduler 不要再发明第三种，抽一个通用 `withWorkspaceFile(path, work)` 或直接复用同构实现。
- **`wsPath` 是进程内单 workspace 闭包变量**（`index.ts`），timer 服务按 wsPath 持有即可；切换 workspace 时必须 dispose 旧 timer。
- **`canvasTypeRegistry`**（renderer）持有所有内建类型定义，与 surface 是否 mounted 无关。fired task 的处理器挂在类型定义上而不是 surface 上，才能满足"未挂载也能处理"。
- **`extensionInstanceStore.updateState` 是本地即时写 + debounce save**；fired 处理需要在 record 未加载时先 `load`，再 `updateState`。
- `withNoteWorkspace` 的 `recoverUnlocked` 是 note 专属的，scheduler 队列不要带上它。

## 3. 任务分解

### H1 · 持久化 scheduler 重做为 host service（P1，必须一起做）

**目标**：任务按 `(instanceId, id)` 唯一；所有文件变更串行；到点由 host timer 驱动，通过消息投递到 renderer；处理器与 surface 挂载状态解耦；重启后 overdue 有明确语义。

**改动**

1. `src/bun/extensions/scheduler.ts`
   - 逻辑主键改为 `(instanceId, id)`。`scheduleExtensionTask` 替换同 key 任务；`cancelExtensionTask(wsPath, instanceId, taskId)` 必须带 owner。新增 `cancelExtensionTasksByInstance(wsPath, instanceIds[])`：一次读、一次过滤、一次写。
   - 所有 load→modify→save 包进 per-wsPath 串行队列 `withExtensionTasks(wsPath, mutator)`。`tick` 也走队列，避免 tick 的旧 snapshot 覆盖并发 schedule。
   - `loadExtensionTasks` 的 corruption 分支改为 fail-closed（细节由 H4 统一，H1 先保证不吞：抛 `ExtensionTaskFileError`，调用方记日志并暂停 arm timer）。
2. 新增 `src/bun/extensions/schedulerService.ts`
   - `createExtensionSchedulerService({ wsPath, deliver })`：持有单个 `setTimeout`，指向最近 `fireAt`；`schedule/cancel/tick` 后 re-arm；上限夹到 ~24h 以规避 `setTimeout` 溢出；`dispose()`。
   - 启动（`loadCanvas` 或 workspace 打开）时 `tick()` 一次处理 overdue，然后 arm。
   - `deliver(fired: FiredTask[])` 通过 `webview.messages.extensionTaskFired` 推送。投递失败（renderer 未就绪）时保留任务并重试：**tick 时先 consume 到内存但不落盘，收到 renderer ack 后再落盘**——这才是真正的 at-least-once。若 ack 复杂度过高，退化方案：落盘后投递，接受 renderer 崩溃窗口内的 at-most-once，并把注释改成与行为一致。选定后写进 §5 决策记录。
3. `src/bun/index.ts`
   - `extensionSchedulerSchedule/Cancel` 走 service；`extensionSchedulerCancel` 参数加 `instanceId`。
   - `extensionInstanceClearType` 改用 `cancelExtensionTasksByInstance`。
   - 删除实例（`extensionInstanceDelete` 或同类）也要级联 cancel，当前只有 clear type 有。
   - `webview.messages` 增加 `extensionTaskFired: { tasks: FiredTask[] }`；如采用 ack 方案，`bun.requests` 增加 `extensionSchedulerAck`。
4. `src/shared/extensions/protocol.ts`
   - `scheduler.cancel(taskId)` 语义不变（owner 由 host API 注入）。
   - `ScheduledTask` 保持；新增 `ScheduledTaskFiredEvent { task, lastDueAt, missedCount }`。
5. `src/mainview/extensions/types.ts` + `canvasTypeRegistry`
   - `BuiltinCanvasType` 增加可选 `onTaskFired?(event, host): Promise<void>`。host 参数用现有 `createHostApi(instanceId, canvasTypeId)` 构造。
6. `src/mainview/lib/rpc.ts` + 新 `src/mainview/extensions/taskDispatcher.ts`
   - 监听 `extensionTaskFired` → 按 `canvasTypeId` 查 registry → 确保 instance record 已 `load` → 调 `onTaskFired`。record 不存在（实例已删）则丢弃并记日志。
7. `src/mainview/extensions/builtin/productivity/reminder.tsx`
   - 删除 effect 里的 due 检查与 `schedule` 调用。
   - 任务 id 固定为 `reminder`（一个 instance 只有一个活跃任务），`fireAt` 变化时 `schedule` 覆盖即可，不再产生孤儿。
   - `schedule` 触发点改为状态提交处（`onChange` 中 `dueAt/snoozedUntil/status/repeat` 变化时），而非渲染 effect。
   - 实现 `onTaskFired`：`markReminderMissed` + `notifications.show`；`repeat !== 'none'` 时不标 missed，只通知。
   - 保留 mount 时一次 `isDueReminder` 兜底（覆盖 H1 上线前已存在、无任务登记的旧实例）。

**测试**

- `scheduler.test.ts`：同 id 不同 instance 共存；A cancel 不影响 B；100 次并发 schedule/cancel/tick 无 lost update（最终文件 = 顺序执行结果）；tick 与 schedule 并发时新任务不丢。
- `schedulerService.test.ts`（fake timers）：注册 50ms 后到期任务，不触发任何其他调用，`deliver` 被调用一次；cancel 后不投递；repeat 任务投递后 re-arm 到下一周期；启动时 overdue 立即投递且 `missedCount` 正确；`dispose` 后不再触发；（若 ack 方案）未 ack 的任务在下次 tick 仍存在。
- `taskDispatcher.test.ts`：surface 未挂载、record 未加载时也能调用 `onTaskFired`；实例已删除时丢弃；类型未注册时不抛。
- `reminder.test.tsx`：snooze 两次后 `list()` 只有一个任务；`onTaskFired` 一次性→missed+toast；repeat→仅 toast、状态不变。
- `index` 级集成：clear type 后 `listExtensionTasks(wsPath)` 无该类型任务。

**验收**：应用开着、画布静止、Reminder 未挂载，到点必须弹 toast 并且状态变为 missed。

### H2 · ZIP 解压硬上限（P1，成本最低，先做）

**改动** `src/bun/plugins/zipInstall.ts`

- `inflateRawSync(entry.compressed, { maxOutputLength: remainingBudget })`，`remainingBudget = min(PLUGIN_ZIP_MAX_UNCOMPRESSED - actualTotal, entry.uncompressedSize)`；捕获 `ERR_BUFFER_TOO_LARGE`/`RangeError` 映射为 `resource-limit`。
- `unpackPluginZip` 的 `uncompressedTotal` 改按**实际输出**累计。
- 校验 CRC32（central directory 有值）；拒绝 normalized path 重复。
- central/local header 的 `compressedSize`/`compression` 不一致 → `invalid-zip`。

**测试** `zipInstall.test.ts`

- 伪造 central directory 声明 1KiB、实际 deflate 输出 > 限额：必须在预算处 `resource-limit`，而不是解压完再报。用 `zlib.deflateRawSync(Buffer.alloc(N))` 生成高压缩比流并手工写 header。
- 多个小 entry 累计超总预算按实际字节触发。
- CRC 错误、重复路径各一条。

### H3 · URL 下载器约束真实网络行为（P1）

**改动** `src/bun/plugins/urlInstall.ts`

- 新增 `src/bun/net/outboundPolicy.ts`：`assertPublicAddress(ip)` 覆盖 IPv4 loopback/private/link-local/`0.0.0.0/8`/`100.64/10`/multicast/broadcast，IPv6 `::1`/`fc00::/7`/`fe80::/10`/`::ffff:x.x.x.x` mapped/`::`/multicast。`isPrivateV4Host` 替换为它。
- 每跳 fetch 前 `dns.lookup(hostname, { all: true })`，任一地址不通过即 `forbidden-target`；字面 IP 也走同一函数。**不做连接绑定**（Bun `fetch` 无 `lookup` hook，直连 IP 会破坏 SNI/证书校验），接受解析与连接之间的 TOCTOU 窗口，写入 §5 决策记录。
- `fetch` 加 `AbortSignal.timeout(PLUGIN_DOWNLOAD_TIMEOUT_MS)`（建议 60s）。
- body 改 streaming：`response.body.getReader()` 累计字节，超 `PLUGIN_DOWNLOAD_MAX_BYTES` 立即 `reader.cancel()` + `resource-limit`。`Content-Length` 仅作快速拒绝。
- redirect 保持每跳完整校验；重定向到字面 IP 同样校验。

**测试** `urlInstall.test.ts`（用 `Bun.serve` 本地起服务 + mock `dns.lookup`）

- hostname→`127.0.0.1` / RFC1918 / `fd00::1` / `fe80::1` / `::ffff:10.0.0.1` 各拒绝。
- public→private redirect 拒绝。
- chunked 无 `Content-Length` 且 body 超限：在预算处中止，进程 RSS 不随 body 增长（断言读取字节数 ≤ 限额 + 一块 chunk）。
- 服务端 hang：超时抛 `download-failed`。
- `allowLoopback` 开发路径不回归。

### H4 · 统一 corruption recovery policy（P2）

**目标**：`ENOENT` = 未初始化为空；JSON/schema 损坏 = degraded，原文件保留，禁止无条件覆盖。

**改动**

- 新增 `src/bun/persistence/corruptFile.ts`：`readJsonOrEmpty(path, parse)` 返回 `{ kind: 'empty' } | { kind: 'ok', value } | { kind: 'corrupt', error, backupPath }`；corrupt 时把原文件复制为 `<name>.corrupt-<timestamp>`（幂等：已有备份不重复复制）。
- `pluginInstall.ts readRegistry`：corrupt 时尝试用 journal + `packages/` 目录树重建；重建结果写回前先确认备份已存在。重建失败则 `PluginInstallError('registry-corrupt')`，安装/卸载 fail-closed，`list` 返回空并附 diagnostic。
- `management.ts readEnablement`：corrupt → 全部视为 disabled，`writeEnablement` 在 degraded 状态拒绝写入（抛错），UI 提示。
- `scheduler.ts loadExtensionTasks`：corrupt → service 不 arm、`schedule` 抛错、`list` 返回空 + diagnostic。
- 三处 diagnostic 统一进 plugin diagnostics 列表（现有结构），带 `backupPath`。

**测试**：三个文件分别截断 JSON → 执行一次正常写操作 → 断言 `.corrupt-*` 存在且内容等于截断前文件；registry 从 journal 重建后 `listInstalled()` 正确；enablement degraded 时 `enable()` 抛错而非覆盖。

### H5 · `expectedRevision` 契约（P2）

**决策**：实现本地 CAS（比删字段便宜，且 SDK 已对外暴露）。

**改动** `src/mainview/store/extensionInstanceStore.ts updateState`：`request.expectedRevision != null && request.expectedRevision !== current.revision` → 返回当前 snapshot 并抛/返回 `conflict`（与 `instanceStore.ts:195` 的错误形状对齐）。`hostApi.ts:79` 透传。

**测试**：stale `expectedRevision` 被拒绝，state 不变；不传字段时行为不变；正确 revision 通过。

### H6 · installed / development 完整性分离（P2）

**改动**

- 安装时（`pluginInstall.ts`）除 zip digest 外记录 canonical tree digest（复用 `readPluginContents().digest` 算法）到 registry 条目。
- `management.ts resolveStoredPackage`：非 development 包重算 tree digest，不匹配 → `PluginInstallError('integrity')`，条目进 quarantine（`enablement` 中移除，diagnostic 标 `integrity-mismatch`）。
- `hostController.generation()`：`summary.development !== true` 且 digest 与 registry 不符 → 抛错，不生成新 generation；development 目录保持现有 hot reload。

**测试**：改 installed `app.js` / lazy module / 资源文件 → `resolveRuntimePackage` 抛 integrity 且插件不加载；改 development 目录 → 仍 hot reload；卸载后重装同 digest 恢复正常。

## 4. 实施顺序与提交切分

| 顺序 | 任务 | 预估 | 提交 |
| --- | --- | --- | --- |
| 1 | H2 | 0.5d | `fix(plugins): enforce hard output limit when inflating plugin zips` |
| 2 | H1 | 3–4d | 拆 3 个提交：`refactor(extensions): key scheduler tasks by instance and serialize mutations` → `feat(extensions): host-driven scheduler delivery` → `fix(reminder): move scheduling off render effect and handle fired tasks` |
| 3 | H3 | 1.5d | `fix(plugins): validate resolved addresses and stream plugin downloads with byte budget` |
| 4 | H4 | 1.5d | `fix(persistence): preserve corrupt registry/enablement/task files instead of treating as empty` |
| 5 | H5 | 0.5d | `fix(extensions): honor expectedRevision in renderer updateState` |
| 6 | H6 | 1d | `feat(plugins): fail closed on installed package integrity mismatch` |

每项提交前：`bun run test`、`bun run type-check`、`bun run check`。H1 第三个提交需附 Reminder 到点触发的录屏（`docs/features/In Progress/plugin-hardening-h1-evidence.md`）。

### 实际提交

| 任务 | commit |
| --- | --- |
| H2 | `d415ae3` |
| H1 | `8bc8cee` → `1202dd4` → `093a8e4` |
| H3 | `08b2ff5` |
| H4 | `b7b20d3` |
| H5 | `50661e4` |
| H6 | `0574079` |

三条命令每次提交前均通过，唯一失败项 `src/mainview/lib/routeUndoRedo.test.ts > routes a committed plugin batch through native undo and redo` 在基线 `b44283e` 上即已失败，与本轮无关。H1 的录屏未产出，需人工补。

## 5. 决策记录

- [x] **H1 投递语义：ack 后落盘（at-least-once）。** 理由：漏掉一次提醒是用户可感知的数据丢失，重复通知只是打扰。`createExtensionSchedulerService` 里 `collectDue()` 读出到期任务但不写盘，任务留在 `pending` 直到 renderer 回 `extensionSchedulerAck`；未 ack 的任务随后续每次投递重发，`reArm` 在有 pending 时把定时器压到 `ACK_RETRY_MS = 30s`。ack 落盘时只结算 `fireAt` 仍等于投递时 `firedFireAt` 的任务，投递后被重新排期的任务保持新时间。`taskDispatcher` 在 handler 抛错或 canvas type 缺失时也会 ack，避免坏插件造成无限重投。
- [x] **H1 repeat 任务 fired 时不改 Reminder state，只通知。** `onTaskFired` 仅对 `repeat === 'none'` 的任务写一次 `markReminderMissed`；重复任务的下一次 `fireAt` 由宿主推进，state 不动。
- [x] **H3 接受 DNS TOCTOU 窗口，不做连接绑定。** 每个重定向 hop 都用 `lookup(host, { all: true })` 校验全部解析地址，但不把连接钉到已校验的 IP：Bun 的 `fetch` 没有 `lookup` 钩子，直接拨 IP 会破坏 SNI 与证书校验。信任模型下（插件本身即 trusted）这个窗口不是本轮的关键风险。
- [x] **H4 registry 重建以 `packages/` 目录树为准，journal 只补元数据。** 目录树是「磁盘上真实存在什么」的唯一可信来源；journal 用来回填 `name` / `source` / `installedAt`，没有对应 journal 时退化成 pluginId + `{ kind: 'zip' }`。重建结果**不**写 `treeDigest`——凭空采信当前文件属于 trust-on-first-use，集中放在 `verifyStoredTree()` 一处（`adoptTreeDigest`），不在重建里再开一个口子。
- [x] **H6 quarantine 沿用现有 diagnostics 面板，不新增状态。** 完整性不符时把插件从 enablement 移除并让该行以 `status: 'invalid'` + `validationError` 呈现，与既有 manifest 损坏、legacy 包共用同一套 UI；`registry.json` / enablement 自身损坏则以合成的 `ghostboard.diagnostic/*` 行出现在同一列表里。

### 实施中新增的决策

- **完整性校验的成本分摊。** renderer 每秒轮询 `/plugins/runtime`，而 `readPluginContents()` 会读整棵已安装目录。因此 `verifyStoredTree()` 按 `PluginManagementService` 实例对每个目录只算一次；持续校验交给 `hostController.generation()`——它本来就为构建 generation 读了整棵树，只需多比一次 `summary.treeDigest`。运行期被改动时由 host controller 调 `reportIntegrityMismatch()` 清缓存并 quarantine，同时丢弃上一代 generation（普通加载错误仍保留上一代）。
- **H5 冲突以异常形式返回。** `updateState` 的返回类型是 snapshot，无法同时表达冲突，因此新增 `ExtensionRevisionConflictError`（`message` 与宿主 `instanceStore.ts` 的 `'revision-conflict'` 一致），并在 `snapshot` 字段上带回当前状态供调用方 rebase。现有调用方都不传 `expectedRevision`，行为不变。
- **H2 的 `crc32` 放在 `zipInstall.ts` 并由测试夹具复用。** 为避免自证，另有一条用标准检查值（`"123456789"` → `0xCBF43926`）的测试守住实现漂移。

## 6. 下一轮候选（本轮不做）

- host API / SDK API / runtime protocol 版本独立（复核 #8）。
- uninstall、package/version GC、崩溃后临时 generation 清理、结构化 diagnostics（timestamp、generation、digest、correlation id）。
- 若产品决定支持 untrusted/public 插件：Worker 或独立 WebView 沙箱 + 服务端派生 plugin identity + host-side capability enforcement。在此之前不把声明式 capabilities 包装成权限系统，不做 marketplace / auto-update。
