# 画布扩展化收尾开发计划(RFC-1 Gap Closure)

> 状态:实施中（T0–T2 完成，下一步 T3）
> 前置:`canvas-extension-platform-refactor.md`(RFC-1,Phase 0–6 已落地)
> 背景:验收走查发现 RFC-1 有四处缺口——三处用户可感知的功能回归、一处架构债。本计划将其拆为可独立交付的任务,按优先级排序。

## 1. 背景:验收发现的缺口

对照 RFC-1 §23 验收标准逐条检查,当前分支未达成的部分:

| # | 缺口 | 违反的验收标准 | 严重度 |
| --- | --- | --- | --- |
| G1 | 扩展节点右键菜单统一落到 `getWidgetItems`(仅复制/锁定/删除),link/image/asset/recording 迁移后丢失全部类型专属动作和宿主通用动作(换色、标签、聚焦、移到资料库等) | §23-1 精神;RFC 第 67 行将"上下文菜单按类型写死"列为待解决问题但未给出目标设计 | P0,功能回归 |
| G2 | `buildAIContext` 仍按旧 `node.type` switch,extension 节点返回 `null`——AI 总结完全忽略迁移后的节点,工具条也不出现 | §23-8、§14.2 | P0,功能回归 |
| G3 | `detachNoteFromCanvas` 守卫和 `DetachedNotesSidebar` 只认旧类型,迁移后只有 card 能移入资料库侧栏 | 行为回归(行为矩阵未覆盖,但旧功能被静默移除) | P1,功能回归 |
| G4 | `FocusedView` 硬编码 `IMAGE_CANVAS_TYPE_ID`/`FILE_CANVAS_TYPE_ID` 双路径而非走 `DetailSurface`;`bun/search.ts` 把内置 canvasTypeId 映射回旧 search kind | §23-1"新增类型不修改 Host 类型分支" | P1,架构债 |

**不在本计划范围内(确认为有意设计,不要"修复"):**

- 惰性迁移带来的双读路径:bun 端旧类型 hydrate、`search.ts` 扫 manifest 旧节点、`FolderChildPreview` 的旧 `widget`/`link`/`image`/`asset`/`recording` 分支、`ContextMenu.tsx` 的旧菜单 builder。未打开的旧画布仍是旧格式,这些分支必须保留。
- `LEGACY_MIGRATION_ENABLED` 开关、`widgets.ts` 旧数据读取、`canvasNodeRegistry` 中旧类型 spec(v1 导入还在用)。
- 内部 key 重命名(`card`→`note` 等),RFC §3.2 明确排除。

## 2. 关键事实(动手前必读)

- **颜色已迁入实例 state**:`LinkState`/`ImageState`/`FileState`/`RecordingState` 都有 `color` 字段(`src/shared/extensions/web/link.ts`、`media/state.ts`)。换色必须走 `host.instance.updateState`,不能写 node data。
- **标签没有丢**:标签存在 workspace 级 node-metadata sidecar,按 `nodeId`(非 card)或 `noteId`(card)索引(见 `src/mainview/components/card/useNodeTagEditing.tsx`)。迁移保留 node id,所以数据完好,缺的只是扩展节点上的编辑入口和 tag chip 展示。
- **`persistableExtensionNode` 会丢弃 data 中除 `{canvasTypeId, instanceId}` 外的所有字段**(`src/shared/extensions/migrateNodes.ts`)。给扩展节点新增 node 级字段(如 `detached`)时,确认序列化路径(`canvasNodeSerialization.ts`、bun `saveManifest`)保留它——回滚验证文档已确认未知字段可 round-trip。
- **协议可序列化约束**:RFC §28 要求 Host API 与类型声明的方法形状可序列化,为 RFC-2 沙箱化预留。新增菜单/动作机制时,label 用 i18n key、icon 用组件引用(内置受信任,RFC-2 时再桥接)、handler 收 `(state, host)`,不得直接 import canvasStore/bridge(已有 lint 强制)。
- **旧菜单动作清单(对齐基准)**,来自 `src/mainview/components/canvas/ContextMenu.tsx` 的旧 builder:
  - link:focus、open-link、copy-url、refetch-link、edit-url、copy、change-color、edit-tag、lock、detach-from-canvas、delete
  - image:focus、replace-image、copy-image-address、reveal-in-finder、rename-asset、copy、change-color、edit-tag、lock、delete
  - asset:focus、reveal-in-finder、replace-file、rename-asset、copy、change-color、edit-tag、lock、detach-from-canvas、delete
  - recording:reveal-in-finder、rename-asset、copy、change-color、edit-tag、lock、delete(无 focus,canvas only)
  - widget(checklist/pomodoro/reminder):copy、lock、delete(现状即平级,无回归)

## 3. 任务分解

### T0 — 行为矩阵补充菜单基准(0.5 天,P0 前置)

`canvas-extension-behavior-matrix.md` 只覆盖 open/group/folder/preview/search,没有菜单列,导致 G1 这类回归无法被矩阵拦住。

- 给矩阵加"上下文菜单动作"列,内容即 §2 的清单,注明哪些是宿主通用动作、哪些是类型专属动作。
- 后续 T1/T2 的验收以此列为准。

产出:文档 PR,`docs: add context menu column to canvas extension behavior matrix`。

### T1 — 宿主通用菜单能力(3–4 天,P0)

让扩展节点拿回**宿主拥有的**菜单动作:focus/打开详情、change-color、edit-tag、detach-from-canvas、copy、lock、delete。

方案:

1. `BuiltinCanvasType`(`src/mainview/extensions/types.ts`)新增声明块:

   ```ts
   interface CanvasTypeInteractions<TState> {
     /** 声明后宿主显示"换色",通过 updateState 写回 */
     color?: {
       get(state: TState): string;
       set(state: TState, color: string): TState;
     };
     /** 声明后宿主显示"编辑标签"(node-metadata sidecar,宿主自理) */
     supportsTags?: boolean;
     /** 声明后宿主显示"移到资料库"(实际启用依赖 T4) */
     canDetach?: boolean;
   }
   ```

   `registry.ts` 的 `assertComplete` 不强制该块,缺省即不显示对应菜单项。

2. `ContextMenu.tsx`:`extension` target 不再直接用 `getWidgetItems`,改为按 registry 声明动态组装:
   - `openBehavior === 'detail'` → focus 项(Enter 快捷键,与旧 focused view 行为一致);
   - `interactions.color` → change-color,`useContextMenu` 中的处理走 `updateState`(经 extensionInstanceStore 的现有更新通道,进实例历史,`history: 'record'`);canvasStore `cycleColor` 中扩展节点分支同步接上或明确跳过;
   - `interactions.supportsTags` → edit-tag,复用 `setEditingTagNodeId` 现有流程(sidecar 按 nodeId 索引,无需动数据层);
   - copy/lock/delete 保持现状。
3. `ExtensionHostShell.tsx` 渲染 tag chip(读 node-metadata,复用 `useNodeTagEditing`),否则标签编辑后无处可见。
4. 各内置类型补声明:link/image/file/recording 声明 `color` 与 `supportsTags`;productivity 三件套与 counter 不声明(对齐旧行为)。

涉及文件:`src/mainview/extensions/types.ts`、`registry.ts`、`ExtensionHostShell.tsx`、`builtin/**`、`components/canvas/ContextMenu.tsx`、`hooks/useContextMenu.ts`、`store/canvasStore.ts`(cycleColor)。

验收:

- 迁移后的 link/image/file/recording 节点右键出现 focus(如适用)/换色/标签/复制/锁定/删除,行为与矩阵 T0 列一致;
- 换色进实例 Undo(surface 内 Cmd+Z 可撤销),不进画布历史;
- checklist/pomodoro/reminder 菜单不变;
- Surface 代码不新增 canvasStore import(lint 全绿)。

测试:ContextMenu 按类型声明渲染的单测;换色 updateState + undo 的 store 测试;tag chip 渲染测试。

### T2 — 类型专属菜单动作(3–5 天,P0,依赖 T1)

让扩展类型能贡献自己的菜单项,恢复 link/image/asset/recording 的专属动作。

方案:

1. `BuiltinCanvasType` 新增:

   ```ts
   menuActions?: readonly {
     id: string;
     labelKey: string;          // i18n key,messages/*.json 同步补
     icon: ComponentType<IconProps>;
     danger?: boolean;
     /** 返回 false 时该项隐藏(如 unfurl 失败时无 copy-url) */
     visible?(state: TState): boolean;
     run(ctx: { state: TState; host: GhostBoardHostAPI; nodeId: string }): void | Promise<void>;
   }[];
   ```

   `ContextMenu` 在 T1 通用项之后渲染这些项;`useContextMenu` 分发到 registry。
2. 各类型实现(动作语义对齐 §2 清单):
   - **link**(`builtin/web/link.tsx`):open-link → `host.external.openUrl`;copy-url → clipboard(进程内直接 `navigator.clipboard`,RFC-2 时再收进 host);refetch-link → 复用现有 unfurl 流程写回 state;edit-url → 打开 URL 编辑(复用创建流程的 URL popover,通过 menu action 触发 renderer 侧现有组件)。
   - **image**(`builtin/media/image.tsx`):replace-image、copy-image-address、reveal-in-finder、rename-asset。
   - **file**(`builtin/media/file.tsx`):reveal-in-finder、replace-file、rename-asset。
   - **recording**(`builtin/media/recording.tsx`):reveal-in-finder、rename-asset。
3. Host API 扩容(`src/shared/extensions/protocol.ts` + renderer `hostApi.ts` + bun 端 RPC):
   - `assets.reveal(assetId)`(Finder 显示);
   - rename 语义确认:旧 rename-asset 改的是标题还是文件名——以旧 `useContextMenu` 处理器为准,若只改展示名则走 `updateState` 改 state.title,不加新 API。
   - 方法形状保持可序列化,capabilities 声明里补 `'assets'`。

涉及文件:`extensions/types.ts`、`builtin/**`、`ContextMenu.tsx`、`useContextMenu.ts`、`shared/extensions/protocol.ts`、`mainview/extensions/hostApi.ts`、`src/bun/index.ts`(RPC)、`messages/*.json`。

验收:四个类型的右键菜单与 T0 矩阵列完全对齐;每个动作有对应单测(mock host);i18n 全语言补齐并在 PR 描述注明。

### T3 — AI 上下文接入 presentation(1–2 天,P0,可与 T1 并行)

方案:

1. `buildAIContext.ts`:`nodeToAIContext`/`buildSelectionContext`/`hasSummarizableSelection` 接受可选 `extensionInstances: Record<string, ExtensionInstanceRecord>`;`extension` 节点从 `data.instanceId` 取 record,产出 `{ title: presentation.title, content: presentation.plainText }`。**只用 presentation,不读 state**(RFC §14.2:结构化 AI 上下文属于 RFC-2 受权能力)。
2. record 缺失或类型禁用时,退化为 presentation 的最后持久化值(instance store 里始终有),仍可总结。
3. 调用方(AI 总结工具条、`runAISummarize`、`aiPanelStore`)从 `useExtensionInstanceStore` 取 records 传入。

涉及文件:`src/mainview/lib/ai/buildAIContext.ts`、`runAISummarize.ts`、`store/aiPanelStore.ts`、工具条组件。

验收:选中迁移后的 link/image/file/recording/widget 节点,AI 总结工具条出现,上下文含 presentation 的 title/plainText;混合选区(card + extension)正常;禁用类型节点仍可被总结(用最后的 presentation)。

测试:`buildAIContext.test.ts` 补 extension 用例(有 record、无 record、禁用类型三种)。

### T4 — 移到资料库恢复(2–3 天,P1,依赖 T1 的 `canDetach`)

方案:

1. `canvasStore.detachNoteFromCanvas` 守卫改为:`card`,或 `extension` 且 registry 声明 `canDetach`。detach 时在 node data 写 `detached: true`(`ExtensionNodeData` 有 index signature,序列化路径已确认保留未知字段——补一条 round-trip 测试)。
2. `DetachedNotesSidebar`:
   - 入口过滤补 `extension` + `data.detached`;
   - 条目 title/preview 从 instance record 的 presentation 取(title/subtitle/plainText),不再读 `data.url`/`data.fileName`;
   - 缩略图用 `ExtensionNodeReadOnly`(PreviewSurface),对齐 `FolderChildPreview` 的做法;
   - `pinNoteToCanvas` 恢复扩展节点回画布。
3. `canDetach` 声明:link/image/file 为 true(对齐旧守卫),recording 为 false(旧菜单无 detach)。T0 矩阵同步记录。

涉及文件:`store/canvasStore.ts`、`components/canvas/DetachedNotesSidebar.tsx`、`builtin/**` 声明。

验收:link/image/file 扩展节点可移入侧栏、正常展示预览、可 pin 回画布;detach 状态经保存/重载/回滚版本 round-trip 不丢。

### T5 — FocusedView 走 DetailSurface(3–5 天,P1)

方案:

1. 为 link/image/file 实现 `DetailSurface`(复用 `LinkContent`/`ImageContent`/`AssetContent` 的聚焦态渲染,image 含 lightbox 全分辨率加载逻辑);`openBehavior: 'detail'` 已在 surface 配置中。
2. `FocusedView.tsx` 删除对 `IMAGE_CANVAS_TYPE_ID`/`FILE_CANVAS_TYPE_ID`/link 的硬编码分支,`extension` 节点统一渲染类型的 `DetailSurface`(经 `ExtensionHostShell` 提供 `surface: 'detail'` 的 render context 和 host);card 路径不动。
3. 未迁移旧节点(双读)仍走旧分支,保留。

涉及文件:`builtin/web/link.tsx`、`builtin/media/image.tsx`、`builtin/media/file.tsx`、`components/canvas/FocusedView.tsx`、`extensions/ExtensionHostShell.tsx`。

验收:双击/Enter/菜单 focus 打开的详情视图与迁移前视觉与交互一致;`FocusedView` 不再 import 任何 `*_CANVAS_TYPE_ID`;§23-1 抽查——新增一个假内置类型不需要改 FocusedView。

风险:FocusedView 是大组件,改动面控制在 extension 分支内,不做顺手重构(react-doctor 豁免注释保持)。

### T6 — 收尾与文档(1–2 天,P2)

1. `bun/search.ts` 的 `searchKindForCanvasType`/`widgetKindForCanvasType` 内置映射表:迁到 `shared/extensions/builtinIds.ts` 旁集中维护,并在 RFC §14.1 补一句"内置类型的 search kind 映射是宿主侧展示层适配,新增内置类型需同步"。不引入协议字段(展示层适配,不值得进 manifest)。
2. RFC-1 修订记录补一条:上下文菜单机制(T1/T2)的目标设计与 RFC-2 兼容性说明。
3. 行为矩阵状态更新;本文档移入 `docs/features/`(完成后)。
4. 全量回归:`bun run ci` + `bun run test`,人工过一遍矩阵行为。

## 4. 实施顺序与 PR 切分

依赖关系:T0 → T1 → {T2, T4};T3 独立可并行;T5 独立可并行(建议在 T1 后做,复用 host shell 改动);T6 最后。

建议 PR 序列(标题即 Conventional Commit):

1. `docs: add context menu column to canvas extension behavior matrix`(T0)
2. `feat: add host-generic context menu for extension nodes`(T1,含 interactions 协议 + ContextMenu 组装 + tag chip)
3. `feat: let canvas types contribute context menu actions`(T2 框架 + link 动作)
4. `feat: restore media context menu actions via host api`(T2 image/file/recording + `assets.reveal`)
5. `fix: include extension nodes in AI selection context`(T3)
6. `fix: restore move-to-library for extension nodes`(T4)
7. `refactor: route extension focused view through DetailSurface`(T5)
8. `docs: close out RFC-1 gap list`(T6)

单人串行约 2.5–4 周;T3、T5 可分给第二人并行,可压缩到 ~2 周。每个 PR 独立可发布、不留半态(菜单框架 PR 落地时至少带一个类型的完整动作,避免空协议)。

## 5. 每个 PR 的完成定义

- `bun run test`、`bun run type-check`、`bun run ci` 全绿;新行为有伴随测试(与源文件同目录)。
- 不修改 `routeTree.gen.ts` 等生成文件;`messages/*.json` 改动在 PR 描述中注明。
- Surface/builtin 代码不 import canvasStore、bridge、`src/bun/*`(lint 强制,不得加豁免)。
- 涉及菜单/详情视图的 PR 附截图或录屏,并对照行为矩阵自查。
- 不删除双读路径与迁移开关(§1"范围外"清单)。

## 6. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 菜单机制设计与 RFC-2 沙箱冲突 | 动作 handler 只依赖 `(state, host, nodeId)`,label/icon 声明式;T6 在 RFC 补兼容性说明,评审时按 §28 检查 |
| 换色写实例 state 与画布 Undo 语义混淆 | 明确:换色进实例历史(与其他 state 变更一致),矩阵记录;不做跨层时间线 |
| FocusedView 改动波及 card 聚焦 | card 分支零改动;FocusedView 现有测试全保留,extension 分支新增测试 |
| `detached` 字段在旧版本回滚时的表现 | 旧版本按未知字段 round-trip(Phase 0 已验证),补一条针对 `detached` 的序列化测试 |
| rename/reveal 等旧动作语义还原不准 | 以旧 `useContextMenu` 处理器实现为唯一基准,动手前先读;拿不准的在 PR 里贴旧代码链接对照 |
