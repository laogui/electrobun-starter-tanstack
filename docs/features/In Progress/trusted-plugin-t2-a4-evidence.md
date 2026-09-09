# T2 首批 A4：持久 KV、事件与任务验收

日期：2026-09-10（Asia/Singapore；运行结果内时间为 UTC）

状态：**A4 已实现并通过 macOS arm64 发行包验证；整个 T2 尚未通过。**

本页记录 A4 当批验收。后续笔记查询、元数据事务 / 恢复及可选 `noteChanges` 已见 [T2 第二批证据](trusted-plugin-t2-content-evidence.md)；下文的下一步与事件边界保留为 A4 当时范围。

依据：[主方案 §10](trusted-plugin-platform.md#10-实施阶段与退出条件)、[追加 1 §4 / §8](trusted-plugin-platform-addendum-1.md)。正式接口与完整语义见 [SDK README](../../../packages/plugin-sdk/README.md#t2-first-slice-storage-events-and-tasks-a4)。

## 1. 本批实现

- `app.storage.app` / `app.storage.workspace`：宿主 Bun 持久化 JSON KV，`get / set / delete / list(prefix)`。数据与插件安装包、模块 generation 分离。缺失返回 `undefined`，与 `null` 区分；前缀查询返回排序后的键。
- 按文件串行化读改写，原子文件替换；校验 JSON、大小、键、插件 ID 与作用域；损坏文件拒绝覆盖；键不是文件路径。相同应用根下的多个服务实例共享进程内写入队列。
- HTTP 使用既有本地服务鉴权，服务构造时绑定工作区。SDK 请求绑定激活 signal，可追加调用方 signal；默认 10 秒超时。中止不会回滚已提交写入，无法收到结果时需重新查询。
- `events.on('content.changed' | 'selection.changed' | 'workspace.activated')`：Bun 内容持久化成功后经 RPC 推送，选区来自宿主画布订阅，激活事件在每代发布时发送。订阅错误进入诊断，不中断其他插件；每个监听器收到独立 payload。
- `tasks.schedule(id, { every } | { at }, callback)`：仅当前激活期间运行，不持久化、不补跑已错过的重启任务，不重叠执行同一回调。过期绝对时间跳过，长延迟分段以避免浏览器计时器溢出。
- 事件与任务遵循 A2：候选 setup 中的注册不生效，失败保持旧代；成功交接后才开始新代，停用 / 退出立即阻止进一步回调。KV 在候选 setup 中仍是真实操作，不属于注册交接事务。

本批没有新增界面文案，不涉及 `messages/*.json` 本地化更新。

## 2. 发行包验证

入口：`bun run test:plugin-t2-a4`。脚本将无构建 JavaScript 插件复制到仓库外临时目录，用 Vite + Electrobun 构建 canary 归档，解包后直接启动归档内 launcher。所有应用数据、工作区和插件登记均使用隔离测试目录，不触碰日常工作区。

四次独立进程启动的验证：

| 启动阶段 | 验证结果 |
| --- | --- |
| `initial` | 开发目录连接与启用；首次 KV 为空；插件命令持久化应用 / 工作区数据；null、前缀、删除语义正确 |
| `restart` | 同一工作区重启后从宿主文件读回原 JSON；应用 KV 保留 |
| `workspace` | 切换后未自动继承插件启用；显式启用后工作区 KV 为空，应用 KV 共享；写入仅属于第二工作区的键 |
| `return` | 返回原工作区后原值保留，第二工作区的专属键不可见 |

每次启动还验证：真实 `views://mainview/index.html`、激活事件、定时任务执行、过期任务不执行、真实宿主创建笔记后的内容事件推送、宿主选区事件、停用后事件 / 任务停止、旧激活的 KV 调用拒绝、重新启用后数据保留。

选区由验收驱动操作宿主画布 store 验证事件链路，不代表人工鼠标选择流程已验收。KV“重启”是实际关闭并重新启动归档应用，不是内存 mock。宿主内容变化使用现行普通 RPC 创建笔记，不通过测试代码直接向 SDK 伪造事件。

原始机器结果：[trusted-plugin-t2-a4-result.json](trusted-plugin-t2-a4-result.json)。发行包使用 WKWebView，Bun 1.3.13 / darwin arm64；构建未请求 Developer ID 签名或 notarization，不代表 T4 的插件作者签名更新已实现。

## 3. 自动化回归

- 全量 `bun run test`：196 个文件、1,720 / 1,720 项通过。
- `bun run test:plugin-t2-a4`：四阶段发行包验证通过，归档 SHA-256：`4a031307a2baef436d73c784184d06a58b303c59d99e9f4395d95ee5950106a3`。
- `bun run test:plugin-t1`：原命令 / 面板 / A1–A3 生命周期及跨工作区发行包回归通过，原始结果一并保存在机器结果的 `regressions.t1`。
- `bun run build:canary`：无验收标志的普通发行构建通过。
- `bun run type-check` 通过；仅忽略仓库既有的 Electrobun `node_modules` 源码诊断。
- 对本批变更运行 Ultracite / Biome 检查。
- 新增测试覆盖：存储并发不丢键、应用 / 工作区 / 插件隔离、损坏文件保留、写失败保留旧值、符号链接与非法输入、JSON 克隆 / 拒绝非 JSON 值、双 signal 取消、超时、晚到 endpoint 不发送写入、内容保存成功后才推送、候选失败保留旧任务 / 事件、成功交接与工作区退出清理、错误隔离、计时器溢出、HTTP 鉴权、RPC 内容推送和画布订阅断开。

完整文件位置：`src/bun/plugins/{storage,contentEvents}.test.ts`、`src/shared/plugins/storage.test.ts`、`src/mainview/plugins/runtime/{storage,activationServices,hostEvents}.test.ts`；宿主接线回归位于 `src/bun/index.test.ts` 和 `src/bun/localHttpServer.test.ts`。

## 4. 边界与 T2 下一步

**本批不是 T2 整阶段退出。** 未验收或尚未实现：

1. 通用内容查询 / 创建 / 批次修改、去重内容选区快照、`@ghostboard/sdk/react` 业务 hooks。
2. 内容事务的崩溃恢复、统一写入仲裁、单次批次撤销与冲突结果。现有 `contentBatch.ts` 只有标题批次基础，不能直接作为满足退出条件的实现：需要统一编辑器 / manifest 元数据 / 插件的写入路径，避免陈旧投影覆盖插件改动；撤销也不能复用旧 revision 或静默跳过冲突。
3. 第三方自定义卡片注册、同 realm 独立 root、可持久化编辑、迁移与缺失插件摘要展示。已有内置 extension instance / search / export 可复用，但内置注册表、ID 规则与状态保存语义仍需适配正式 SDK 和 A2。
4. Linux / Windows、外部真人作者试用、原生目录选择器人工交互。

事件是“已持久化记录发生变化”的即时失效通知，不是可靠消息队列或完整内容事务日志：不保证断线重放，不监听用户在应用外直接改文件，不包含正文与 revision；重复保存可重复通知。Markdown / sidecar 分别变化可重复通知同一 note ID，消费者不应将其当作去重后的实体事务。布局、标签和附件不在当前内容记录事件范围。

任务仅应用进程存续且插件 / 工作区激活时运行；不会在退出后运行，不承诺 cron 或精确定时。停用不能强杀已经进入插件自身的任意异步回调；插件需尊重 `app.signal`。KV 的原子替换不等于多键事务，也不承诺跨进程写入仲裁。
