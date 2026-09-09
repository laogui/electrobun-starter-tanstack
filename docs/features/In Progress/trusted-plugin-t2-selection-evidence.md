# T2 第三批：笔记选区快照与 React hooks 验收

日期：2026-09-10（Asia/Singapore；机器结果内时间为 UTC）

状态：**当前画布的笔记选区快照、独立放置项查询与公开 React 选区 hooks 已通过 macOS arm64 发行包验证；不是整个 T2 退出。**

依据：[主方案 §5 / §10](trusted-plugin-platform.md)、[上一批笔记事务](trusted-plugin-t2-content-evidence.md)。完整 API 与边界见 [SDK README](../../../packages/plugin-sdk/README.md#t2-third-slice-note-selection-and-react-hooks)。

## 1. 本批实现

- `app.selection.get({ signal }?)` 在调用时固定所选 note ID，去重后通过同一个宿主队列操作读取持久化内容，返回按 note ID 排序、脱离宿主引用且冻结的笔记快照。不会把画布投影或编辑器草稿当作 canonical 内容。
- `app.selection.getPlacements()` 同步返回冻结的 `{ viewId, items }`。每项保留独立放置 ID 和可用的 note / widget / extension 内容引用，同一笔记的重复放置不会丢失；容器、图片等返回 `content: null`。
- 新增 `app.content.getMany(ids)` 作为一次性集合读取：最多 500 个 ID，按输入顺序返回，缺失为 `null`，支持空数组和重复 ID；损坏项使整次读取失败。读操作与上一批编辑器 / manifest / 插件写入共用工作区队列，不由多个独立 `get` 拼接。
- `selection.subscribe/getSnapshot` 提供稳定缓存身份和 `loading / ready / error` 状态。加载或失败时 `items` 为空；相关内容通知即使没有选择变化也重新读取。旧请求取消，晚到响应不能恢复旧选区。
- 候选 setup 的订阅不发布；失败保留旧代选区流，成功交接、停用及工作区退出清理旧代。订阅分别拥有 unsubscribe；一个监听器退订后面的监听器或停用实例时，同轮尚未调用的监听器不会继续执行。
- `@ghostboard/sdk/react` 导出 `useSelection`、`useSelectionState`、`useSelectedPlacements` 和供独立 root / 作者测试使用的 `SelectionProvider`。宿主自动在每个 React 面板的独立 root 内安装 SDK 自有 provider，hooks 用 `useSyncExternalStore`，不继承宿主 context、不使用全局“当前插件”。
- dev / 发行 import map 提供 `host-sdk-react`；独立 SDK 包包含 JS 和类型子路径。全局兼容对象新增 `sdkReact`，React 模板两种构建模式均保持共享 React 与 provider 身份。

没有新增正式界面文案，不涉及 `messages/*.json` 本地化更新。验收插件的面板文案只属于隔离 fixture。

## 2. 发行包验收方法

入口：`bun run test:plugin-t2-selection`。脚本复制仓库外无构建 JavaScript 插件，构建并解包 canary 归档，运行归档内真实 launcher。应用数据、插件目录和工作区均隔离。

| 独立进程启动 | 检查 |
| --- | --- |
| `initial` | 普通 RPC 创建三篇笔记；选中同一笔记的两个放置、另一篇笔记、文件夹和图片；公开内容快照仅含两篇去重笔记，放置项 API 保留五项；React 子路径和共享 hook 身份正确；“整理选中标题”只改两篇笔记，文件夹内未选笔记不变；内容通知更新 hooks 且不重挂 root；旧快照保持原 revision，拿它写入会明确冲突；清空选择后 hooks / API 不留旧项；缓存快照身份稳定 |
| `restart` | 实际退出后重新启动，公开选区读取已提交的 revision 2；通过持久化批次 undo，hooks 更新到 revision 3 并恢复原标题，不重挂 root；清空选择后状态正确；停用卸载面板、停止订阅，旧 selection API 以 `AbortError` 拒绝 |

选择由验收驱动操作真实宿主画布 store；不是人工鼠标 / 键盘选择流程验收。React hooks 在归档应用的独立 root 中实际渲染，不是 mock；内容查询 / 修改走公开 SDK 和普通宿主 RPC。两个独立插件 provider 不串流、候选失败与取消竞态由自动化测试覆盖。

运行平台为 WKWebView / `views://mainview/index.html`，Bun 1.3.13，darwin arm64。没有请求 Developer ID 签名或 notarization；没有 Linux / Windows 或外部真人作者验收。

原始机器结果与本次回归结果：[trusted-plugin-t2-selection-result.json](trusted-plugin-t2-selection-result.json)。本批归档 SHA-256：

`754da85cb79ac8c2af8ede539eec229fe661a841b1b1b059324eafac41342ba0`

## 3. 自动化覆盖与回归结果

| 命令 / 检查 | 最终结果 |
| --- | --- |
| `bun run test`（JSON reporter） | 204 个文件，1,777 / 1,777 项通过，0 失败、0 待运行 |
| `bun run test:plugin-t2-selection` | 两阶段发行包选区 / React hooks 验收通过 |
| `bun run test:plugin-t2-content` | 笔记事务两阶段发行回归通过 |
| `bun run test:plugin-t2-a4` | KV / 事件 / 任务四阶段发行回归通过 |
| `bun run test:plugin-t1` | 生命周期 / 跨工作区两阶段发行回归通过 |
| `bun run build:canary` | 无验收开关的普通发行构建通过 |
| `bun run type-check` | 通过；现有脚本忽略 Electrobun `node_modules` 源码的 29 项依赖诊断 |
| 变更源码 / JSON 的 Ultracite / Biome、`git diff --check` | 通过 |

回归归档 SHA-256：content `8eb9b38a8c4ea2cea080265865cd5ba2f78a1eac1c8576831cb37890eb899020`；A4 `047c6c89a6cb344732a841cc80af950d73c34861abfd19773e264161e3cf3496`；T1 `fb992cc3f69ec96ed8b483efd741cadc035c0c2d52ea136209948e4800577c6e`。均已与实际归档重新计算的摘要比对。

最终全量测试在全部发行构建、type-check 完成后串行执行。同一 checkout 的 Vite / Paraglide 生成会重写 `src/paraglide`，与 Vitest 并行会造成短暂缺失模块；复验不要并行运行这些生成步骤与全量测试。

测试重点：

- `src/bun/plugins/noteContent.test.ts`：集合读取次序、重复与缺失槽位、空数组、数量限制、损坏项整次拒绝；集合读取排在完整 writer 后，不观察其受队列保护的中间状态。
- `src/mainview/plugins/runtime/content.test.ts`：传输保留请求 ID 次序、校验响应数量和内容身份；既有身份绑定 / 取消 / 超时覆盖继续通过。
- `selection.test.ts`：调用时固定成员、去重与冻结、非笔记 / 缺失处理、候选订阅不运行、稳定缓存、晚到结果丢弃、同成员内容失效更新、错误与恢复、激活 / 调用方取消、监听器错误隔离、重复订阅独立清理、同步退订 / 停用立即停止后续调用。
- `canvasSelection.test.ts`、`hostEvents.test.ts`：可见选中节点、隐藏 / 分离节点排除、容器不递归、工作区过滤、空 hydration 状态、不能把旧工作区节点重新标为新工作区选区。
- `selectionLifecycle.test.ts`：失败候选保持旧选区、成功交接退休旧代、工作区退出清理及错误工作区更新拒绝。
- `selectionHooks.test.tsx`、`sharedRuntime.test.ts`：三个 hooks 的真实订阅、loading/error/recovery、稳定快照无循环、缺失 provider 错误、多个独立 root/provider 不串流、unmount 清理、共享模块身份。

## 4. 仍未完成的边界

1. 本批选区仅来自已 hydration 的当前画布中显式选中、可见、非 detached 的节点。文件夹 / 分组不自动展开；焦点编辑器、文件夹内行选择、正文文本范围不是额外选区来源。
2. `get()` 只返回持久化笔记；legacy Markdown revision 为 `null`，不可写。非笔记内容只提供放置引用，缺失笔记被省略；损坏笔记报错而非返回部分结果。
3. 选择成员在调用时固定，但标题 / 正文文本 / revision 来自随后的同一次宿主读取，不是点击瞬间的数据库快照。超过 500 个去重笔记拒绝，不截断；写入仍受每批最多 100 项限制。
4. 缓存依赖宿主内容通知，不监听应用外文件编辑，不是可靠日志，也没有定时错误重试。下一次选区变化或相关内容通知重新读取；需要立即确认时调用 `get()`。`useSelection()` 在加载 / 失败时都返回空数组，区分原因应使用 `useSelectionState()`。
5. 正文修改、内容创建、非笔记快照、第三方卡片及迁移 / 缺失展示、统一原生 / 画布 / 插件 undo、更多业务 hooks 仍未完成。上一批事务的恢复、历史容量与冲突 UI 限制不变。
