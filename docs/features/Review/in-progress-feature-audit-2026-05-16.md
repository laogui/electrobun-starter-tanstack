# In Progress 功能实现审阅（2026-05-16）

## 范围

本次审阅覆盖 `docs/features/In Progress/` 下的 5 份文档：

- `multi-type-canvas-preview-pipeline.md`
- `plan-canvas-template-library.md`
- `plan-multi-canvas-workspace.md`
- `prd-layout-switcher-document-workspace.md`
- `search-feature-plan.md`

审阅方式是对照当前源码静态检查，没有启动应用做交互验收，也没有跑全量测试。下面的“已实现”表示代码主链路存在；“待验证”表示还需要运行应用或补测试确认体验与边界。

## 总览

| 文档 | 当前判断 | 主要结论 |
| --- | --- | --- |
| `multi-type-canvas-preview-pipeline.md` | 主链路大体已实现，仍有边界缺口 | Asset、Link、视频/音频缩略图、拖拽/粘贴、序列化、搜索接入等核心链路已落地；大文件导入、文件夹内搜索、富链接卡片、PDF 预览、安全硬化仍需补。 |
| `plan-canvas-template-library.md` | MVP 已实现，P5 未完成 | 模板 registry、预览页、从模板创建画布、ViewSwitcher 快捷入口已实现；模板数量、缩略图、i18n、URL query、临时预览路由清理未完成。 |
| `plan-multi-canvas-workspace.md` | 多画布基本已实现，多 Workspace 未实现 | 单 workspace 内多 canvas 已落地；多 workspace/app config/switch workspace 还没有实现。建议拆成两个独立文档处理。 |
| `prd-layout-switcher-document-workspace.md` | 有实现，但和 PRD 核心方向不一致 | 顶部布局切换与 DocumentView 已实现；当前是“当前画布派生的文档列表”，不是 PRD 要求的“filesystem-first 文档工作区”。这是最需要决策的部分。 |
| `search-feature-plan.md` | 搜索 MVP 已实现，存在关键覆盖缺口 | `Cmd/Ctrl+K`、跨画布搜索、定位节点/边、Markdown 内容搜索已实现；文件夹子项、未引用 Markdown、部分字段与刷新策略需要决策/补齐。 |

## 优先待决策事项

1. Document Workspace 的方向：继续当前“canvas-derived 文档视图”，还是回到 PRD 的“content 目录 filesystem-first 文档工作区”。
2. 多 Workspace 是否近期要做：当前只实现了单 workspace 内的多 canvas，建议把 multi-workspace 单独移到 Backlog 或新的 In Progress 文档。
3. 搜索范围：是否必须搜索文件夹子项与所有 `content/*.md` 未引用文件。如果要把文档工作区做成 filesystem-first，这个缺口会变成 P0。
4. Asset 大文件导入策略：当前 UI 主要走 data URL，视频/大文件有 25 MB 限制风险；是否要优先接入 native path copy。
5. Document mode 删除语义：删除 canvas 引用、删除 folder child，还是删除真实 Markdown 文件。当前实现偏“移除画布引用”。
6. Template Library 是否算 MVP 完成：如果接受只有 `demo`/`kanban` 两个模板，可把 P5 拆出去；否则继续留在 In Progress。
7. Asset/Link 是否允许进入 Folder：代码已经允许，需要产品上确认这个规则。
8. Link/PDF 预览深度：Link 已可 unfurl，但 UI 没用 favicon/image 做富卡片；PDF 仍是普通文件。
9. app-level settings 与 workspace-level settings：multi-workspace 前最好先确定设置归属，避免之后迁移。

## 1. Multi-type Canvas Preview Pipeline

对应文档：`multi-type-canvas-preview-pipeline.md`

### 已实现

- 内容类型基础设施已存在：
  - `src/mainview/lib/contentTypes.ts` 定义了 `asset`、`link`、URL 判断、文件分类、Asset/Link 数据结构。
  - `src/mainview/lib/canvasNodeRegistry.ts` 统一维护节点规格，包含 `card`、`checklist`、`sticky`、`folder`、`group`、`image`、`asset`、`link`。
  - `src/mainview/lib/canvasNodePredicates.ts`、`canvasNodeSerialization.ts`、`canvasConstants.ts` 都已覆盖 asset/link。
- Link 节点主链路已实现：
  - `LinkNode`、`LinkCreateForm`、创建菜单 URL 入口、URL 粘贴/拖拽创建节点已存在。
  - Bun 侧有 `linkPreview.ts`，支持网页元数据抓取、超时、基础内网地址拦截。
  - `LinkNode` 可调用 `rpcUnfurlLink`，也支持打开安全的 `http(s)` URL。
- Asset 节点主链路已实现：
  - `AssetNode` 支持 focused view、open file、视频/音频播放。
  - `assetFiles.ts`、`thumbnail.ts`、`attachments.ts` 支持保存附件、生成图片/视频缩略图、音频 waveform、路径校验、打开附件。
  - 文件拖拽和文件选择入口可以创建 asset。
- 与画布系统的整合基本到位：
  - asset/link 已接入序列化、只读预览节点、分组/文件夹能力、document tree 派生、搜索类型。
  - Bun 侧 manifest load/save 会处理 asset/image 等节点运行时字段。

### 未实现或部分实现

- 大文件导入仍有明显风险：
  - `saveAssetFromPath` / `rpcSaveAttachmentFile` 这条 native path copy 路径存在，但当前文件选择和拖拽 UI 主要通过 `FileReader` 转 data URL。
  - `attachments.ts` 对 data URL 上传有 25 MB 限制，视频或大文件很容易触顶。
- PDF 目前是 generic file，没有 PDF 页面缩略图或内嵌预览。
- Link card 没有真正展示 favicon/image preview；虽然 metadata 字段存在，UI 仍偏基础。
- 搜索只覆盖顶层 asset/link；folder child 里的 asset/link 不能被后端搜索稳定命中。
- Link unfurl 安全策略有基础防护，但没有 DNS 解析后的私网 IP 拦截，仍可能有 DNS rebinding 类风险。

### 待商榷

- 是否把“asset/link 可进入 folder”作为正式产品规则。代码已经这样做，但原计划里这是待决策项。
- “视频/音频支持”是否必须包含大文件原生导入。如果是，当前还不能算完全完成。
- Link rich preview 是否是 MVP 要求，还是后续增强。
- PDF 是否进入这个 feature 的收尾范围，还是单独开功能。

### 建议

这个文档可以从 In Progress 移到 Review/Done 候选，但需要先补一个明确的剩余任务列表：大文件导入、folder child 搜索、Link 富预览、PDF 预览、安全硬化。若这些都不是 MVP，可以标记主链路完成。

## 2. Canvas Template Library

对应文档：`plan-canvas-template-library.md`

### 已实现

- 模板 registry 与 Bun RPC 已实现：
  - `src/bun/templates.ts` 注册 `demo` 与 `kanban`。
  - `rpcListTemplates`、`rpcLoadTemplate`、`rpcCreateViewFromTemplate` 已接入。
- 从模板创建画布已实现：
  - `src/bun/workspace.ts` 会为模板节点生成新的 noteId，并写入对应 Markdown 文件。
  - 首次 workspace seed 使用 `demo` 模板。
- 前端模板体验已实现：
  - `src/mainview/hooks/useTemplates.ts` 提供模板加载。
  - `/templates` 有模板列表、搜索、分类筛选、卡片网格。
  - `/templates/$templateId` 有 ReactFlow 只读预览与使用模板按钮。
  - `ViewSwitcher` 菜单里有 Blank Canvas、Kanban 快捷入口、Browse all templates。
- 只读预览节点类型已覆盖现有 node kinds。

### 未实现或部分实现

- 模板数量不符合计划：
  - 当前只有 `demo` 和 `kanban`。
  - 文档中规划的 blank、mind map、weekly plan、roadmap、meeting notes 等还没有落地。
- 缩略图没有真正接入：
  - `kanban` 目录里有 `thumbnail.png`，但 `meta.json` 中 `thumbnail` 仍为空。
  - 模板列表实际仍显示 fallback。
- i18n 没有实现：
  - 模板名称、描述、分类是英文 metadata，不是文档里的 i18n key。
- `/templates` 的搜索和分类是组件内部 state，没有同步到 URL query。
- 从模板创建的新 canvas 命名为 `Canvas N`，不是计划里的“模板名 (N)”。
- 预览页和计划不同：
  - 当前是 full-screen ReactFlow overlay，不是 7/3 信息面板布局。
  - 仍有 pan/controls 等交互，不是完全静态预览。
- `src/mainview/routes/preview-test.tsx` 仍存在。文档里说 P1 临时调试页合并前应删除。

### 待商榷

- 现在的两个模板是否足够作为 MVP。
- 预览页是否要按原计划改成信息面板布局，还是接受当前沉浸式预览。
- 新画布命名规则是否应该使用模板名。
- 是否需要在当前阶段补 i18n 和 query 参数。

### 建议

如果产品上接受“模板库 MVP = 可浏览、预览、创建”，可以把 P0-P4 标为完成，并把 P5 拆成独立后续任务。若要按文档原目标交付，则继续留在 In Progress，优先清理 `preview-test`、接入 thumbnail、补模板数量。

## 3. Multi-canvas / Workspace

对应文档：`plan-multi-canvas-workspace.md`

### 已实现

- 单 workspace 内多 canvas 已基本实现：
  - `canvasStore` 包含 `activeViewId`、`views`、`setActiveView` 等状态。
  - `ViewSwitcher` 支持加载 view、切换 view、创建空白 canvas、从模板创建 canvas、软删除、恢复、重命名。
  - Bun 侧 workspace config 包含 `activeViewId` 与 `views`。
  - view 删除会进入 `.ghostboard/trash`，支持 restore / purge。
- 切换 canvas 时 `ViewSwitcher` 会先保存当前 manifest，再设置 active view，最后让 renderer 重置画布状态。
- 搜索跨画布定位也会在必要时切换 active view。

### 未实现或部分实现

- 多 Workspace 没有实现：
  - 没有 app-level workspace registry。
  - 没有 `listWorkspaces` / `createWorkspace` / `switchWorkspace`。
  - main process 仍使用当前默认 workspace 初始化路径。
- UI 和文档原方案不同：
  - 当前是底部 floating `ViewSwitcher` 菜单，不是浏览器式顶部 tab bar。
- 细节能力缺失：
  - 没有 duplicate/copy view。
  - 没有右键 tab 菜单。
  - `setActiveView` 本身不负责保存，调用方必须记得先 flush。
- 设置归属仍偏 workspace-level：
  - 当前有 `settings.json` 和 default layout 设置；multi-workspace 前需要明确哪些设置属于 app，哪些属于 workspace。

### 待商榷

- 是否保留底部 ViewSwitcher，而不是切到顶部 tabs。
- multi-workspace 是否仍是近期目标。
- view 切换保存是否应该由 store/action 层统一兜底，而不是依赖每个调用点。
- app config 格式、workspace list 和最近 workspace 的归属需要先定。

### 建议

建议把这份文档拆成两份：

- “Multi-canvas” 标记为 Review/Done 候选，只保留少量 UI/质量补丁。
- “Multi-workspace” 单独进入 Backlog 或新的 In Progress，等 app-level config 决策后再做。

## 4. Layout Switcher / Document Workspace

对应文档：`prd-layout-switcher-document-workspace.md`

### 已实现

- 顶部布局切换已实现：
  - `src/mainview/routes/__root.tsx` 有 Canvas / Document / Both 切换器。
  - UI 位于固定 titlebar，显示当前 layout mode。
- `canvasStore` 已有 `layoutMode`，进入 document mode 会清理 focused node 与 create menu。
- 设置里有 `defaultLayoutMode`，路由侧会按 view 读取 localStorage，并 fallback 到 workspace settings。
- `DocumentView` 已实现三栏布局：
  - 左侧 rail 有 All / Archive / Folders / Types。
  - 中间列表从当前 canvas nodes 和 folder children 派生文档项。
  - 右侧 editor 支持编辑 note/checklist/card/sticky/folder child 文本，asset/link/image 显示对应 focused 内容。
- 有 detached note 机制：
  - document mode 可创建 detached note。
  - canvas 侧有 `DetachedNotesSidebar`，可以把 detached note pin 回 canvas。

### 未实现或与 PRD 不一致

- 最大差异：当前实现不是 filesystem-first。
  - PRD 要求 Document Workspace 直接面向 `content/**/*.md` 的目录树。
  - 当前 `DocumentView` 是从 active canvas manifest 派生列表：顶层节点 + folder children。
  - 未引用的 Markdown 文件不会自然出现在文档工作区。
- 文件 API 缺失：
  - 没有 PRD 中的 `listNotes`、`loadNoteById`、目录 CRUD、move、rename、reveal in Finder、删除引用保护等完整文档 API。
- Sidebar 不是真实文件树：
  - All / Archive / Folders / Types 更像 canvas-derived filter。
  - Archive 目前是空状态，不是实际 archive 目录或状态。
- 新建 note 语义不同：
  - 当前创建 detached note 或 canvas/folder child，最终再通过保存链路落到 content。
  - PRD 期望在当前 filesystem directory 直接创建 Markdown 文件。
- 删除语义不同：
  - 当前 top-level 删除是 `deleteNodes`，更像删除 canvas reference，通常会留下 `.md`。
  - folder child 删除是删除 folder child 引用。
  - PRD 期望对真实 Markdown 文件删除做引用检查和确认。
- 缺少 PRD 交互：
  - 右侧没有 “Add to current canvas” 主按钮。
  - canvas focused card 没有明确的 “Open in Documents” action。
  - sidebar width/collapse 没有持久化。
  - 缺少 `Cmd/Ctrl+B`、`Cmd/Ctrl+1/2` 等快捷键。
- 状态持久化位置不同：
  - PRD 建议独立 workspace/app store 与 `.ghostboard/ui-state.json`。
  - 当前 layout mode 使用 canvas store + localStorage + workspace settings。

### 待商榷

这是目前最需要产品决策的文档：

- 如果目标是“文档模式服务当前画布”，当前实现方向是合理的，但 PRD 应重写，避免继续承诺 filesystem-first。
- 如果目标是“真正的文档工作区”，当前实现只能算 layout shell 和部分编辑能力，核心信息架构需要返工。
- 删除 Markdown 文件 vs 删除 canvas 引用必须明确，否则后续会出现数据丢失预期不一致。
- detached note、unplaced note、archive、folder tree 之间的概念需要重新命名或合并。

### 建议

不要直接把这份 PRD 标记完成。建议先做一个决策：

- 方案 A：接受当前方向，把文档改名为“Canvas Document Mode”，将 filesystem-first 文件树移出范围。
- 方案 B：保留 PRD 原方向，把当前实现视为 shell/MVP，新增 filesystem-first API、真实文件树、引用保护和 Add to canvas 流程。

## 5. Search Feature

对应文档：`search-feature-plan.md`

### 已实现

- Bun 后端搜索已实现：
  - `src/bun/search.ts` 会读取 workspace config、canvas manifest、note content。
  - 支持类型包括 `note`、`sticky`、`folder`、`group`、`image`、`card`、`asset`、`link`、`edge`、`view`。
  - 支持 Markdown 清洗、标题摘取、snippet、基础匹配评分。
- RPC 已注册：
  - `searchCanvas` 已接入 main process。
- 前端搜索 UI 已实现：
  - `useSearch` 有 debounce、后端搜索、当前画布内存 fallback/merge。
  - `SearchDialog` 支持 `Cmd/Ctrl+K` 打开、键盘选择、同 view / 跨 view 定位。
  - 跨 view 结果会切换 canvas，并在 hydration 后选中节点/边、居中视图。
- 菜单快捷键已接入：
  - app menu 有 `CommandOrControl+K` 触发 `openSearch`。

### 未实现或部分实现

- 文件夹子项搜索缺失：
  - 后端主要扫描 manifest 顶层 `nodes`。
  - folder child 内的 note、asset、link、image 不会稳定进入搜索索引。
  - `scanNotes` 会跳过没有 manifest 引用的 Markdown；如果 folder child 没被索引到 ref，也会漏掉。
- 未引用 Markdown 搜索缺失：
  - 当前搜索偏 canvas-addressable。
  - 如果 Document Workspace 要 filesystem-first，所有 `content/*.md` 都应该可搜索。
- 文档规划的部分字段未实现：
  - 例如 `createdAt` 没有出现在当前 `SearchMatchField`。
- 搜索前保存策略不完整：
  - 当前 view 的内存 merge 能覆盖未保存 canvas state。
  - 跨 view 未保存 note 是否能被搜索命中仍依赖保存链路。
- 结果粒度有限：
  - 同一对象多个字段命中会被 dedupe 成一个结果，不一定能展示所有匹配字段。
- UI 文案目前硬编码英文，没有接入 i18n。

### 待商榷

- 搜索的产品定义到底是“搜索可定位的 canvas 对象”，还是“搜索整个 workspace 文档库”。
- folder child 是否必须作为一等搜索对象。
- 未引用 Markdown 是否应该显示为 detached/unplaced result。
- 是否需要搜索时间字段、文件路径、目录名等 filesystem 信息。

### 建议

如果以当前 canvas-first 产品为准，搜索可以算 MVP 完成，但建议先补 folder child 搜索再移动到 Done。如果要配合 filesystem-first Document Workspace，则搜索需要继续留在 In Progress，并补 workspace 文档索引。

## 建议整理动作

1. 新建 `Done` 或 `Review` 状态目录，把已完成主链路的文档移出 `In Progress`，但保留尾项清单。
2. 拆分 `plan-multi-canvas-workspace.md`：
   - `multi-canvas`：Review/Done 候选。
   - `multi-workspace`：Backlog/In Progress。
3. 重写或拆分 `prd-layout-switcher-document-workspace.md`：
   - 当前实现方向：Canvas Document Mode。
   - 原 PRD 方向：Filesystem-first Document Workspace。
4. 对 `search-feature-plan.md` 增加一个 P0 补丁项：
   - 索引 folder children。
   - 决定是否索引 unreferenced Markdown。
5. 对 `plan-canvas-template-library.md` 增加收尾项：
   - 接入 thumbnail。
   - 删除 `preview-test`。
   - 决定模板数量与命名规则。
6. 对 `multi-type-canvas-preview-pipeline.md` 增加收尾项：
   - 大文件 native path import。
   - rich link preview。
   - PDF preview。
   - link unfurl DNS/private IP hardening。

## 推荐决策顺序

1. 先决定 Document Workspace 是 filesystem-first 还是 canvas-derived。
2. 再根据这个决定搜索范围：只搜 canvas-addressable 对象，还是搜整个 `content` 文档库。
3. 然后决定 multi-workspace 是否近期推进，因为它会影响 settings、workspace registry、文档库索引和搜索范围。
4. 最后收尾模板库与 asset/link 体验，它们基本是局部增强，不应该阻塞前面三个架构性决策。

