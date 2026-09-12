# 高信任插件方案 · 追加 1：借鉴 bb 插件系统的六项补充

日期：2026-09-09

性质：**追加，不修改主方案已采纳内容。** 主方案 [trusted-plugin-platform.md](./trusted-plugin-platform.md) 中已完成的 T0 与旧运行时清理不受影响；本文所有条目都以“新增要求”或“收窄口径”的形式落在 T1 及之后的阶段。与主方案冲突之处以本文为准，冲突点在 §7 逐条列出。

来源：对 [get-bb/bb](https://github.com/get-bb/bb) `packages/plugin-sdk` v0.4.50 的 README、`backend-contract.ts`、`app-contract.ts` 与示例插件的源码核查（2026-09-09）。

## 0. 对进行中工作的影响

| 编号 | 内容 | 落在哪个阶段 | 是否触碰已完成的 T0 / 清理 | 对当前 T1 代码的动作 |
| --- | --- | --- | --- | --- |
| A1 | 不把宿主组件作为共享 API | T1 起生效 | 否 | 保持 React shim；冻结 `--gb-*` 主题变量并随模板提供可编辑组件源码 |
| A2 | `PluginContext` 增加 `generation` 与 `signal`；重载失败保留旧版本 | T1 | 否 | 上下文增字段，运行时增加候选注册暂存与成功交接，主进程保留/释放模块图 |
| A3 | 运行时同时挂到 `globalThis.__ghostboardPluginRuntime` | T1 | 否（import map 保持主路径） | 启动时初始化冻结对象，保持共享依赖身份，提供打包器 shim 示例 |
| A4 | SDK 明确提供持久 KV、定时任务、内容变化推送 | T2 | 否 | T2 设计 SDK 时纳入，不改 T1 范围 |
| A5 | 发布 `@ghostboard/sdk/testing` | T3 完成、T5 验收 | 否 | 新增子包，不改现有导出 |
| A6 | SDK 参考以单文件 Markdown 发布，便于 AI agent 消费 | T5 | 否 | 文档任务 |

## 1. A1：不共享宿主组件，只共享主题变量与 hooks

主方案 §4.2 写了“提供主题变量、基础组件和宿主 hooks”。bb 的 `app-contract.ts` 注释记录了他们的教训：曾冻结 65 个组件 prop 类型作为 SDK 面，结果“每次宿主组件改动都成了插件破坏性变更”，2026-07 起整体移除，改为让插件 vendor 组件源码自己拥有。

**收窄后的规则：**

- 宿主对插件共享的稳定面只有三类：React 单实例（已实现）、`@ghostboard/sdk` 及其 hooks、主题 CSS 变量（`--gb-*` 命名，T1 冻结列表）。
- 宿主 UI 组件（按钮、输入、菜单、对话框等）**不**经 import map 或 SDK 导出。插件模板附带一套可复制、可修改的基础组件源码，作者拥有它们；宿主升级不影响。
- 与宿主视觉一致性靠主题变量达成，不靠共用组件实现。
- 如日后确有必须共享的组件（例如必须与宿主行为一致的画布卡片外壳），单独以 `experimental_` 前缀导出并注明可能破坏。

对主方案 §4.2 第 4 条的“基础组件”三字，按本条理解为“模板内可复制的组件源码”。

## 2. A2：生命周期补 generation、AbortSignal 与原子重载

借鉴 bb 的 `{ pluginId, generation, signal }`，GhostBoard 的重载以**失败时旧实例原样继续运行**为优先约束（2026-09-09 确认）。不能先销毁旧实例再尝试新 `setup`，也不能用重新激活旧模块冒充保留旧实例。采用候选准备、成功交接两阶段；cleanup 逆序、恰好一次。

**追加到 `PluginContext`（仅新增字段，不改动现有字段）：**

```ts
export interface PluginContext {
  // ...现有字段不变
  /** 本次激活的代数；每次重载递增。用于日志与竞态判断。 */
  readonly generation: number;
  /** 停用、成功替换、候选失败/取消或工作区退出时 abort。重载准备不 abort 旧实例。 */
  readonly signal: AbortSignal;
}
```

**运行时语义：**

1. 同一插件同一时刻只有一代**已发布、可调用的宿主注册**。先导入候选模块并执行候选 `setup`；命令、快捷键、面板注册与打开请求暂存，不对宿主生效。此期间旧实例的 signal、注册、已打开面板及其状态保持不变，旧命令继续可用。候选 `setup` 成功后，才 abort 旧 signal、撤下旧注册并等待有界 cleanup，随后发布候选注册并执行暂存的面板打开请求。
2. **原子重载**：候选模块加载或 `setup` 失败时报告诊断，仅 abort 并清理候选；**不**卸载、abort 或重新激活旧实例。旧模块图继续可访问，包括延迟相对 import，直到成功交接、明确停用或退出工作区。失败候选不会因轮询反复重试，下一次代码变化或手动重载才重试。没有旧实例时显示激活失败。
3. cleanup 按登记顺序逆序等待、每个登记的 disposer 至多调用一次；提前释放后不重复调用。disposer 自身抛错或超时记为诊断，不阻断其他 disposer；超时不等于任意异步代码已被强制停止。停用、候选被更新候选取代、工作区退出时，相关实例先 abort，并阻止晚到的异步结果重新发布注册。
4. SDK 内所有接受异步的 API（`net.fetch`、`files.*`、事件订阅）默认绑定 `app.signal`；作者传入自己的 signal 时以两者任一 abort 为准。这些 API 在所属阶段实现，不提前扩大 T1。
5. `generation` 是本次 renderer 生命周期内按插件递增的数字，每次候选激活尝试都递增，失败不回退；与模块 URL 中用于缓存失效的 UUID 不同。旧实例在失败候选之后仍保留自己的原 generation。`signal` 在所属实例被停用、成功替换、候选取消/失败或工作区退出时 abort，**不是一开始尝试重载就 abort 旧实例**。
6. “原子”仅指宿主管理的注册交接，不是同 realm JavaScript 的执行隔离。候选准备期间两代代码可同时运行；插件自行创建的 Worker、网络/文件写入、全局 DOM 修改等不能通用回滚。作者应使 `setup` 以注册为主，自有资源登记 cleanup 并尊重 signal；不要假设暂存会阻止这些副作用。

实现需要候选注册暂存、独立 AbortController 以及主进程模块图保留/释放协作，不是只给 `Activation.cancel / cancelled` 加字段。import map 与已完成 T0 保持不变。

## 3. A3：运行时同时暴露在 `globalThis`

主方案以 import map 为共享依赖的唯一机制。bb 的做法是构建时把 `@get-bb/plugin-sdk/app` 与 React shim 到 `globalThis.__bbPluginRuntime`。两种机制不冲突；把运行时同时挂到全局，可以在两种情况下兜底：

- 某平台 WebView 的 import map 行为异常时，有构建的插件仍可通过打包器 external 配置 shim 到全局对象继续工作，不阻塞该平台验收。
- 插件作者使用的打包器不方便配 external 到裸模块名时，可 shim 到全局。

**要求：**

- `startPluginRuntime` 在 import map 生效的同一时机执行 `globalThis.__ghostboardPluginRuntime = { react, reactDom, reactDomClient, jsxRuntime, sdk, version }`，对象冻结。
- import map 仍是文档中推荐且唯一支持无构建 JS 的路径；全局对象在文档中标为“打包器 shim 目标”，不承诺其字段以外的内容。
- 插件模板的构建配置默认走 import map external；提供一段可选的 shim 配置示例。

## 4. A4：SDK 必须覆盖持久 KV、定时任务与内容变化推送

bb 后端 `BbPluginApi` 中作者最常用的三块是 `storage`（KV + 每插件 sqlite）、`background.schedule`（cron）与 `realtime.publish`。我们首版没有后端，因此这三项必须由宿主服务在前端 SDK 里提供，否则会提前逼出 T6 的后端需求。

对主方案 §6 表格的对应行做如下**细化**（不是新行）：

| 接口领域 | 追加要求 |
| --- | --- |
| settings / storage | `storage` 拆为 `app.storage.app`（应用级）与 `app.storage.workspace`（工作区级）两个 KV，方法 `get / set / delete / list(prefix)`，值为 JSON；由宿主持久化，不走 `localStorage`。首版不提供 SQL。 |
| events / tasks | `events.on('content.changed' \| 'selection.changed' \| 'workspace.activated' \| ...)` 由宿主推送、可传 signal；`tasks.schedule(id, { every: ms } \| { at: Date }, fn)` 仅在应用运行且工作区激活时触发，重启后按“错过即跳过”处理，不承诺 cron 表达式。 |

这些能力均以宿主进程权限执行，不是隔离边界，与主方案 §3.2 一致。

## 5. A5：发布 `@ghostboard/sdk/testing`

bb 的 SDK 自带 `testing`（fake host）与 `testing/app`（jsdom 渲染 slot、模拟 RPC/realtime），并明确写出 fidelity 边界。这让作者不启动应用就能跑单元测试，对“15 分钟做出第一个插件”和外部作者独立迭代作用很大。

**要求（T3 实现，T5 验收）：**

实现状态（2026-09-12）：`@ghostboard/sdk/testing` 与 `@ghostboard/sdk/testing/react` 已随 T3 第一批实现，JavaScript / React 模板的无应用测试及组合插件作者测试均通过。真实 RPC、持久化、安装与平台差异继续由发行包探针验证；外部作者试用仍属于 T5。

- `@ghostboard/sdk/testing` 导出 `createFakeHost({ pluginId, workspaceId })`，返回 `{ app, harness }`：`app` 是可传给 `setup` 的 `PluginContext` 实现；`harness.inspection` 暴露已注册的命令、面板、cleanup 数量；`harness.behavior` 可触发命令、发事件、推进 `signal`；`harness.lifecycle.reload(factory)` 复现 A2 的原子重载语义。
- `@ghostboard/sdk/testing/react` 提供 `renderPanel(definition, { context })`，基于 Testing Library 渲染面板组件并注入 SDK hooks 的假实现。
- 文档写明**不**复现的部分：宿主布局与 CSS、持久化、真实 RPC、多插件仲裁、平台差异；这些仍需真实应用验收。
- 插件模板默认带一个使用该子包的测试。

## 6. A6：面向 AI agent 的 SDK 参考

bb 在应用内提供 Plugin Guide：按 surface 编号的线框图，每张卡标注 SDK 符号，并有“Copy for agent”把描述贴给 agent。我们首版不做应用内 Guide，但要求：

实现状态（2026-09-12）：单文件 `packages/plugin-sdk/AI_REFERENCE.md` 已随 T3 作者工具链加入 SDK 发布文件，并复制到默认 JavaScript、React、独立 importer 与四贡献 combined 模板；四种模板的 `AGENTS.md` 均指向该参考并区分 runtime / author-only 目录。自动化已验证文件存在和路由。文档站镜像发布，以及外部真人作者仅凭参考完成首个插件的效果与耗时仍归 T5 验收；应用内 Guide 仍不在首版。

- SDK 参考以**单文件 Markdown**发布（随 `@ghostboard/sdk` 包和文档站各一份），按扩展点组织，每节给出类型签名与最小示例，无外链依赖即可读完。
- 插件模板包含一份 `AGENTS.md`，指向该参考并说明目录约定，作者可直接用 AI 工具续写插件。
- 应用内 Guide 作为 T5 之后的候选，不进入首版验收。

## 7. 与主方案的对应关系

| 主方案位置 | 本文条目 | 关系 |
| --- | --- | --- |
| §4.1 前端装载 | A3 | 追加：全局对象作为 shim 目标；import map 仍为主路径 |
| §4.2 第 4 条“基础组件” | A1 | 收窄：理解为模板内可复制源码，不作为共享 API |
| §4.4 生命周期与工作区 | A2 | 追加：generation / signal / 原子重载 |
| §5.4 工具链 | A5、A6 | 追加：测试子包、单文件参考、模板内 `AGENTS.md` |
| §6 SDK 表 settings/storage、events/tasks 行 | A4 | 细化：明确 KV 分级、事件名与任务语义 |
| §10 T1 | A2、A3 | 追加到 T1 退出条件 |
| §10 T2 | A4 | 追加到 T2 退出条件 |
| §10 T3 / T5 | A5、A6 | 追加到 T3 交付与 T5 退出条件 |
| §12 取舍表 | A1 | “公共接口”一行按 A1 理解 |

## 8. 追加验收项

- T1：候选 import / setup 失败时，旧 signal 未 abort、旧命令可用、同一已打开 React root 及其状态不变且有诊断，旧相对模块可延迟加载；成功交接后旧 signal abort、逆序恰好一次清理，然后发布新注册；候选取消、停用与工作区退出均 abort 对应 signal，晚到结果不复活；宿主不会发布两代注册；数字 generation 递增；`globalThis.__ghostboardPluginRuntime` 存在、冻结且与 import map 的导出同一实例。
- T2：插件通过 `storage.workspace` 写入的数据在重启后可读且不串工作区；`events.on('content.changed')` 在宿主内容变化时触发；`tasks.schedule` 在工作区未激活时不触发。**2026-09-10 首批 A4 已通过 macOS arm64 发行包验证**，范围与限制见 [A4 验收记录](trusted-plugin-t2-a4-evidence.md)；不等于内容事务或自定义卡片已验收。
- T3：模板自带测试使用 `@ghostboard/sdk/testing` 在无应用环境下通过。
- T5：外部作者仅凭单文件参考与模板完成第一个插件，过程有记录；插件未使用任何宿主组件仍与宿主视觉一致。

## 9. 明确不因 bb 而改动的部分

- 不采用 `package.json#bb` 式 manifest；保留独立 `manifest.json` v2，以支持无构建插件。
- 不引入 Bun 后端入口；bb 的后端能力清单只用于确定 A4 的 SDK 覆盖面。
- 不放弃 TOFU 签名；bb 走 catalog 分发，我们接受任意 URL/ZIP，签名是必要的。
- 不复制 bb 的 slot 枚举；扩展点仍围绕画布、面板、导入器、命令定义。
