# 产品需求文档 (PRD)：GhostBoard 自由画布知识库

> **相关文档**
>
> - [技术规范文档](./tech-spec.md) — 架构、技术栈、目录结构、状态管理、渲染动画、性能预算、数据持久化、RPC 协议、编码约定
> - 笔记库弹窗（替代旧文档模式）：[Planned/笔记库弹窗-替代文档模式.md](./features/Planned/笔记库弹窗-替代文档模式.md)

## 1. 产品概述

- **产品定位**：一款面向思考者、设计师和研究人员的视觉化个人知识库。
- **核心痛点**：解决传统线性笔记（如备忘录、文档）带来的信息碎片化和认知负担。让用户像在白板上一样，通过空间位置、距离和组合来建立知识的关联。
- **核心亮点**：无限缩放平移、所见即所得的卡片编辑、以及极致平滑的沉浸式层级切换动效。

## 2. 核心功能模块与交互逻辑

### 2.1 无限自由画布 (Infinite Canvas)

- **功能描述**：一个没有边界的 2D 空间，用户可以在任意位置放置内容节点。
- **交互逻辑**：
  - **平移 (Panning)**：支持触控板双指滑动或鼠标中键拖拽，实现画布的无级平移。
  - **缩放 (Zooming)**：支持触控板捏合或 `Ctrl/Cmd + 滚轮` 缩放。采用**语义化缩放 (Semantic Zoom)**：根据缩放级别渐进式展示内容细节。需制定独立的**语义缩放层级设计 spec**，明确定义：① 各档缩放阈值（如 `zoom < 0.3` / `0.3–0.7` / `> 0.7`）；② 每档下各元素类型（Card / Sticky / Folder / Group / Edge label）的渲染规则（色块→标题→摘要→完整内容）；③ 档位之间的过渡动画时长与缓动曲线。语义缩放做好后会成为核心差异化亮点（参考 Muse / tldraw）。
  - **选择与聚焦 (Selection & Focus)**：
    - 采用"两步打开"模型（✅ 已实现）——单击节点进入 `selected` 状态，用于高亮、批量操作和拖拽；双击或 `Enter` 才进入聚焦模式或 Folder drill-down 视图。`Shift+Click` 可追加/切换选中，多选集合支持批量拖拽、删除、复制粘贴、拖入 Group/Folder。
    - 为避免误触发，拖拽、连线和框选判定优先于双击/打开判定；鼠标位移超过轻微阈值（默认 `4px`）后不再视为点击。
  - **框选 (Marquee Selection)**：桌面端在画布空白处左键拖拽绘制选择框，选中矩形范围内的多个节点。当前 `selectionOnDrag` 默认关闭（避免与平移手势冲突），后续视交互体验决定是否启用。进入聚焦模式或 Folder drill-down 后，框选仅作用于当前上下文，不影响背景画布。

### 2.2 多模态信息卡片 (Content Cards)

- **功能描述**：画板上的基本元素，支持不同类型的数据载体。
- **卡片类型**：
  - **图文卡片**：包含图片和文本（如演示中的 Target audience 饼图卡片）。
  - **待办列表 (Checklist)**：支持在画布上**直接无缝编辑**。用户可以双击直接在列表末尾敲击键盘添加新条目（如演示中添加 "Add great search"），无需进入特殊的编辑模式。画布上的勾选和添加条目操作不改变交互状态（保持 `idle` 或 `selected`），不触发 `inline-editing`；仅当需要完整编辑时通过聚焦模式处理。
  - **长文本/文档**：承载长篇幅的文章。在聚焦模式下使用 **Tiptap 编辑器**进行所见即所得的富文本编辑，支持标题、列表、任务列表、引用、代码块、行内代码、粗斜体、删除线、链接、图片、分割线等常用 Markdown 子集。Tiptap 通过 `@tiptap/markdown` 实现 Markdown 与编辑器文档的双向序列化，保证内容以标准 Markdown 格式持久化。
  - **图片卡片**：支持拖拽上传、粘贴、或从文件选择器导入图片。在画布上显示图片缩略图，聚焦模式下显示原图。
  - **本地文件卡片 (Asset)**：支持从文件选择器或拖拽导入本地文件，文件内容保存到 `attachments/`，画布上显示文件名、类型、缩略图或 waveform。视频/音频在聚焦模式下可播放，普通文件提供打开原文件入口。当前 PDF 仍按普通文件处理，暂不提供页面级预览。
  - **链接卡片 (Link)**：支持从创建菜单输入 URL，或粘贴/拖拽 URL 到画布后自动创建 Link 节点。系统会尝试抓取网页标题、描述、站点名、favicon/image 元数据；当前画布 UI 主要展示标题/URL/描述，富媒体卡片样式仍属后续增强。
  - **便签 (Sticky Note)**：轻量级的彩色便签，支持快速记录短文本。可自由调整大小，提供多种预设颜色。便签默认可拖拽；双击进入原地编辑模式，失焦后自动保存。便签**不支持**聚焦放大模式（FocusedView），所有编辑均在画布上原地完成。
- **卡片通用能力**：
  - **Markdown 预览渲染**：普通文本卡片在画布态（非聚焦态）下通过 **markdown-it** 将 Markdown 正文渲染为安全的 HTML 预览，经 **DOMPurify** 清理后展示。预览层仅渲染摘要级别内容（标题、段落、列表、代码块等），不挂载完整的编辑器实例，保证首屏性能。Checklist 卡片在画布上保持独立的结构化 `data.items` 交互，不走 markdown-it 预览渲染。
  - **自由调整大小 (Resize)**：所有卡片均支持拖拽边角/边缘来调整宽高，不再固定为 350×450。调整时保持内容自适应重排。
  - **复制/粘贴**：支持 `Cmd+C` / `Cmd+V` 复制粘贴卡片。
  - **聚焦入口约定**：双击卡片或选中后按 `Enter` 进入聚焦模式（FocusedView），卡片平滑放大至屏幕中央。Checklist 卡片在画布上可直接勾选和添加条目，无需进入聚焦模式。
  - **创建流程**：画布右下角提供 `CreateMenu` 浮动按钮，支持快速新建 Card、Sticky、Folder、Image、Asset、Link；新节点在当前视口中心创建，或在拖拽/粘贴位置附近创建。后续计划支持更完整的右键菜单创建与命令面板入口。

### 2.3 沉浸式聚焦模式 (Focused View / Modal Expansion)

- **功能描述**：当用户需要深度阅读或编辑某一张卡片时，提供无干扰的阅读/编辑环境。聚焦模式下，长文本/文档类卡片使用 **Tiptap 编辑器**进行所见即所得的富文本编辑；图片卡片进入大图浏览模式；Checklist 卡片进入结构化列表编辑模式。
- **交互逻辑**：
  - 选中状态下通过双击、`Enter` 或右键菜单 `Open Focused` 进入聚焦模式。卡片通过 FLIP 动画从画布位置平滑放大至屏幕中央，成为主视图；背景画布被一层半透明遮罩（Overlay/Dimmer）覆盖，屏蔽其他元素的干扰。点击遮罩或按 `Escape` 退回画布，卡片收缩回原位。
  - **不可聚焦的节点类型**：Sticky（便签）不支持聚焦模式，双击进入原地编辑。

### 2.4 节点连线 (Edges / Connections)

- **功能描述**：卡片之间可以建立有向连线，表达知识的关联、依赖或流转关系。
- **交互逻辑**：
  - 鼠标悬停卡片边缘出现连接点 (Handle)，从连接点拖拽到另一卡片即可建立连线。
  - 每个卡片提供四个方向（上/右/下/左）的连接点。
  - 连线默认为 `smoothstep`（平滑折线）样式，支持 `animated` 流动动画。
  - 连线可添加文本标签，用于标注关系类型。
  - **双向绘制与连接预览**：拖拽连线时，画布实时渲染一条跟随光标的**自定义连接预览线**（`ConnectionPreviewLine`），以虚线或半透明样式提示当前拖拽路径。释放时若命中目标卡片的 Handle，则建立正式 Edge；若未命中，则预览线消失，不创建无效连接。
  - **端点边界（MVP）**：仅当前画布上可见的节点实例暴露 Handle；被收纳进 Folder 的子卡片在 drill-down 中只用于浏览与聚焦，不作为独立 Edge 端点。
  - **Folder 兼容规则（MVP）**：Folder 本体可作为一个摘要节点被连线，但系统不会在 drill-down 时自动把该连线映射到某个子卡片；需要表达外部关系时，应连到 Folder 封面节点本身。

### 2.5 💡 两种分组模式 —— _核心特性_

本应用提供两种互补的卡片组织方式：

#### 2.5.1 Group 开放式分组 (Open Group)

- **功能描述**：在画布上创建一个可调整大小的彩色容器区域，子节点**直接展示**在画布上，所见即所得。
- **交互逻辑**：
  - **拖入**：将卡片拖入 Group 区域，自动成为子节点（位置转换为相对于 Group 的局部坐标）。
  - **拖出**：将卡片拖出 Group 边界，自动脱离父子关系（位置转换回画布绝对坐标）。
  - **嵌套**：Group 可嵌套 Group（需防止循环嵌套）。
  - **连线**：Group 内的子节点可以与画布上任意节点建立连线。
  - **适用场景**：主题分区、看板、思维导图分支。
  - **排斥与碰撞**：Group 在拖拽调整大小或移动时，与邻近节点存在** gentle repulsion（柔和排斥）**机制——当 Group 边界靠近其他节点一定阈值时，邻近节点会被轻微推开，避免视觉重叠。同时提供**碰撞检测与放置解析**能力：释放节点时若检测到与 Group 区域重叠，系统会自动判断是"纳入 Group"还是"放在 Group 旁边"，确保放置意图明确。嵌套 Group 时同样遵循此规则，并防止循环嵌套。**Resize 排斥豁免**：当 Group 内的子节点触发 resize 排斥时，父节点（Group 本身）自动豁免——否则 Group 被推开后通过 `extent: 'parent'` 反向约束子节点，产生闪烁抖动。

#### 2.5.2 Folder 堆叠式文件夹 (Folder Stack)

- **功能描述**：在二维画布上引入第三个维度（Z轴层级）。Folder 是**内容集合 / 资料夹**，用于把多个相关内容节点收纳为一个视觉上的"堆叠实体"，子节点**隐藏**。它不是万能容器，也不是可自由布局的子画布。
- **交互逻辑**：
  - **外观**：在画布上表现为一个带有标签的堆叠卡片组（如演示中的 "3 items - The really great ideas..."）。
  - **封面渲染原则**：Folder 封面只表达摘要，不渲染完整的内部小画布。封面信息优先级为：标题 / item 数量 / 主要类型分布 / 最近的 2–4 个代表性缩略图或类型图标。没有图片时使用类型图标组合和数量文案兜底，避免每新增一种节点类型都重写封面布局。
  - **进入图层 (Drill-down)**：选中文件夹后双击、按 `Enter`，或通过右键菜单 `Open` 触发**隔离层模式**。
    - 背景画布整体变暗或模糊（失去焦点）。
    - 文件夹内的卡片从堆叠状态平滑展开（散开）到当前的临时图层上，供用户浏览或编辑。MVP 采用确定性的自动排布（横向 strip 或 grid），排列顺序按 `children` 数组索引（即拖入先后顺序），不提供自由拖拽排序，因此不额外持久化 Folder 内部坐标。
      - 在此模式下，画布上的其他非同组元素不可见或不可交互。
  - **退出图层**：点击背景空白处或返回按钮，展开的卡片平滑收缩回堆叠状态，背景画布恢复明亮和可交互状态。
  - **允许收纳的节点类型**：Folder 可以收纳 `Card` / `Checklist` / `Image` / `Asset` / `Link`。这些类型都被视为"内容条目"，可在 Folder drill-down 和笔记库弹窗中被浏览、聚焦或编辑。
  - **不允许收纳的节点类型**：Folder 不收纳 `Folder` / `Group` / `Sticky`。`Folder` 嵌套会把资料夹变成递归信息架构；`Group` 带空间布局语义；`Sticky` 是画布上的临时注释，默认保留在画布层。若未来需要便签归档，应作为独立功能评估，不改变 Folder 的基本定位。
  - **成员来源**：Folder 的成员通过以下方式产生：
    1. **在 Folder 内直接新建**：在 Folder drill-down 视图中通过顶部工具栏或右键菜单的 `New Card` 新建卡片，直接追加到该 Folder 的 `children` 数组。
    2. **从画布拖入**：将允许收纳的内容节点拖到 Folder 上，节点从当前画布移除并写入该 Folder 的 `data.children`。若节点带有 Edge，系统清理相关 Edge；需要保留外部关系时，应先连接到 Folder 封面节点。
  - **取回到主画布**：drill-down 视图中选中子卡片后，可通过顶部工具栏的 ↗ `Extract to Canvas` 按钮或右键菜单将该卡片作为新的独立画布节点放回 Folder 邻近区域。**M5 之后 Folder Card 子节点本身已拥有独立 `.md` 和 `noteId`**，Extract 动作仅是把 manifest 中的 `children` 引用提升为顶层节点并分配新的 `nodeId`，不再涉及文件创建；`.md` 文件保留不动（同一 `noteId` 可在 Extract 前后被其他画布共用）。
  - **Extract 可发现性**：为降低 `Extract to Canvas` 被用户忽略的风险（仅藏在右键菜单中发现性不足），drill-down 视图顶部工具栏需提供一个显式的 ↗ `Extract to Canvas` 按钮。当用户在 drill-down 中选中一张或多张子卡片时，该按钮高亮可用；未选中时置灰。此按钮与右键菜单中的 `Extract to Canvas` 行为一致。
  - **Folder 内操作边界（MVP）**：支持在 drill-down 视图中浏览和聚焦子内容；不支持自由拖拽改变顺序，也不支持跨 Folder 边界直接建立子卡片连线。后续若需要自由布局，应升级为独立的 Sub-canvas / View 模型，单独保存 `nodes + edges + viewport`，而不是继续扩展 `data.children`。
  - **适用场景**：归档收纳、减少画布视觉噪音。空间布局、看板分区和关系可视化继续由 Group / Canvas View 承担。

### 2.6 右键菜单 / Context Menu

- **功能描述**：右键菜单是画布上的高频操作入口，避免用户频繁依赖顶部工具栏或记忆快捷键。
- **交互逻辑**：
  - **画布空白处右键**：提供新建卡片（`note` / `checklist` / `image` / `sticky`）、粘贴、新建 Group、重置缩放到 100% 等操作。
  - **卡片上右键**：提供复制、从当前画布移除、改颜色、锁定/解锁、打开聚焦模式等操作；"永久删除内容"属于显式二次确认的破坏性动作，不与普通删节点合并。
  - **Folder 上右键**：提供打开 Folder、重命名显示标签、在该 Folder 内新建卡片等操作。**注**：M5 之后 Folder 子卡片在 `content/` 下为扁平的 `.md` 文件（见 §5.3），因此不再提供「在系统文件管理器中显示目录」入口；如需查看子笔记文件，请在 workspace 的 `content/` 根目录下按 `noteId` / 标题查找。Folder drill-down 视图中的子卡片菜单需额外提供 `Extract to Canvas`。
  - **连线上右键**：提供删除连线、编辑标签、修改样式/颜色。即使 Edge 在 MVP 早期未完全实现，菜单结构仍需提前定义，避免后续交互再重构。

### 2.7 多画布视图 (Multi-Canvas Views) ✅

- **功能描述**：同一个 workspace 中可以创建多个独立的画布视图。同一篇笔记（`.md` 文件）可以通过 `noteId` 在不同画布上多次出现（实例 `nodeId` 不同），实现同一知识库的多视角组织。
- **交互逻辑**：
  - **底部切换器**：画布底部居中显示一个浮动的 `ViewSwitcher` 面板，包含当前画布名称、节点计数和画布数量。
  - **切换画布**：点击切换器展开画布列表，点击任一画布立即切换。切换时自动保存当前画布的未持久化变更（`flushNow`），然后清空 UI 状态（聚焦模式、Folder drill-down、剪贴板、undo/redo 历史栈）并加载目标画布。
  - **Viewport 持久化**：每个画布视图的 ReactFlow viewport（`x` / `y` / `zoom`）随 manifest 一起持久化到 `.canvas.json` 的 `viewport` 字段。切换画布时恢复目标画布的上次 viewport；刷新页面或重启应用后 viewport 也会恢复。
  - **活跃画布持久化**：用户当前选中的画布 `activeViewId` 持久化到 `workspace.json`，重启应用后自动恢复到上次使用的画布。
  - **新建画布**：通过切换器右侧的 `+` 按钮触发子菜单，提供两种创建方式：① **空白画布**（沿用原有 `handleCreate` 流程，自动命名为 `Canvas N` 并切换过去）；② **选择模板…**（跳转 `/templates` 路由页浏览模板库，选中模板后在只读 ReactFlow 预览页确认后基于模板创建新画布，自动为模板中的每张 Card 生成新 `noteId` + 示例 `.md` 文件）。
  - **重命名**：在弹出菜单中点击铅笔图标进入行内编辑模式，`Enter` 确认、`Escape` 取消。
  - **删除画布**：在弹出菜单中点击删除图标。至少保留一个画布，删除最后一个时操作被拒绝。删除当前画布时自动切换到列表中的第一个画布。
  - **数据隔离**：每个画布对应独立的 `.ghostboard/views/{viewId}.canvas.json` manifest 文件。`content/*.md` 笔记文件在所有画布间共享（通过 `noteId` 引用）。
- **限制（当前版本）**：
  - 不支持跨画布拖拽节点。
  - 不支持画布间的 noteId 引用关系可视化。

### 2.8 搜索 (Search) ✅ MVP / ⚠️ 覆盖范围待补

- **功能描述**：全局搜索当前 workspace 中的画布可定位内容，包括各画布视图、顶层 Card/Sticky/Folder/Group/Image/Asset/Link、Edge label，以及这些节点引用的 Markdown 正文。
- **交互逻辑**：
  - 通过 `Cmd/Ctrl+K` 或应用菜单唤起 `SearchDialog`。
  - 输入关键词后 debounce 调用 Bun 侧 `searchCanvas`；当前画布内存状态会与后端结果合并，降低未落盘编辑被漏搜的概率。
  - 点击搜索结果项，若命中当前画布节点或连线，则选中并平移缩放至对应位置；若命中其他画布，则先切换 `activeViewId`，待目标 manifest hydrate 后再定位。
  - **排序规则（MVP）**：标题/名称匹配优先于正文匹配，再按基础相关性评分和更新时间排序。后续可引入更完整的字段权重与索引。
  - **Detached notes 的可见性**：用户主动从画布分离的笔记 (`detachNoteFromCanvas`) 会变成 **detached notes**（`data.detached: true`，`position: {x:0,y:0}` 占位），不在画布上渲染，但仍作为 manifest 中的节点进入搜索。画布模式通过 `CreateMenu` 中的「Library Note / 文库笔记」入口打开 `DetachedNotesSidebar` 浏览这些游离笔记，拖入画布时通过 `pinNoteToCanvas` 赋予真实坐标。
- **当前限制 / 待办**：
  - 后端搜索目前主要索引 manifest 顶层节点；Folder `children` 中的 Card/Asset/Link/Image 仍可能漏搜，需作为 P0 补齐。
  - 纯粹存在于 `content/*.md`、但没有任何 manifest 引用的 Markdown 文件不会作为一等搜索结果返回；它们目前通过设置页的 Unlinked Files 清理工具暴露，而不是通过搜索面板暴露。
  - 早期规划中的“输入时实时高亮画布匹配/未匹配节点变淡”尚未实现。
  - 对未放置内容提供“一键放回当前画布”的搜索结果操作尚未实现；当前放回路径主要是 `DetachedNotesSidebar`。

### 2.9 撤销/重做 (Undo / Redo)

- **功能描述**：对画布上的结构性与离散操作（移动、创建、删除、Resize、拖入文件夹、节点级提交等）提供撤销和重做能力。正文长文编辑不进入画布撤销栈，而是由 Tiptap 自身历史栈处理；标题输入框使用浏览器原生 input undo。
- **交互逻辑**：
  - 非编辑态下，`Cmd+Z` 撤销，`Cmd+Shift+Z` 重做；若焦点位于 `input` / `textarea` / `contenteditable` 中，则快捷键交给当前编辑控件，不由画布 store 接管。
  - 维护一个画布快照历史栈（Snapshot History Stack），每次离散画布操作前保存当前 `{nodes, edges}` 快照；当前实现不记录 diff / command。
  - **栈深度上限**：最多保留 **50** 步操作历史，超出后丢弃最早记录，避免大画布场景下内存不可控增长。
  - **撤销与持久化的一致性策略**：撤销/重做仅回滚内存状态，不直接触发磁盘反向写入。下一次 debounce 到期时，以当前内存状态为准覆盖磁盘文件。这意味着：用户编辑 → debounce 写盘 → `Cmd+Z` 撤销 → 内存回滚 → 下次 debounce 再次以内存状态覆盖磁盘，保证内存与磁盘最终一致。
  - **生命周期**：撤销栈仅存在于内存中，关闭应用或切换 workspace 后清空，不做持久化。

### 2.10 键盘快捷键体系 (Keyboard Shortcuts)

| macOS                   | Windows / Linux           | 行为                                                                            |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `Cmd+Z` / `Cmd+Shift+Z` | `Ctrl+Z` / `Ctrl+Shift+Z` | 非编辑态下走画布快照栈；若焦点在 `input` / `textarea` / `contenteditable`，则交给当前编辑控件（Tiptap history / 浏览器原生 input undo） |
| `Cmd+C` / `Cmd+V`       | `Ctrl+C` / `Ctrl+V`       | 复制 / 粘贴卡片                                                                 |
| `Delete` / `Backspace`  | `Delete` / `Backspace`    | 从当前画布移除选中的节点（不删除 .md 内容文件；永久删除需通过右键菜单二次确认） |
| `Cmd+K`                 | `Ctrl+K`                  | 打开搜索，命中后 fitView 到画布节点                                             |
| `Cmd+A`                 | `Ctrl+A`                  | 全选当前上下文中的节点                                                          |
| `Cmd+N`                 | `Ctrl+N`                  | 打开新建卡片菜单                                                                |
| `Enter`                 | `Enter`                   | 打开选中卡片的聚焦模式                                                          |
| `Escape`                | `Escape`                  | 关闭聚焦/文件夹视图、退出搜索/菜单                                              |

### 2.11 交互状态机 (Interaction State Machine)

| 状态                | 进入条件                                                                               | 退出条件                                 | 约束                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`              | 默认状态；点击空白处；完成操作后回落                                                   | 选中节点、开始拖拽、打开菜单、按下快捷键 | 允许平移、缩放、框选                                                                                                                                                                                 |
| `selected`          | 单击节点；`Shift+Click` 追加选择                                                       | 点击空白、`Escape`、进入其他状态         | 允许批量拖拽、删除、复制。**Checklist 例外**：Checklist 卡片在 `selected` 状态下允许直接勾选 checkbox 和在列表末尾添加条目（局部交互），这些操作不改变交互状态，不触发 `inline-editing` 或 `focused` |
| `marquee-selecting` | 在空白处左键拖拽                                                                       | 鼠标释放                                 | 仅桌面端启用；与中键平移互不冲突                                                                                                                                                                     |
| `dragging`          | 拖拽一个或多个已选节点                                                                 | 鼠标释放或取消                           | 暂停双击判定，避免误触发编辑                                                                                                                                                                         |
| `inline-editing`    | 双击 Sticky（便签）或 Group label；创建 Sticky 后自动进入                              | `Escape`、提交、点击其他区域             | 编辑期间禁用画布级快捷键，保留 `Cmd/Ctrl+Enter` 提交。**仅适用于 Sticky 和 Group label**；Card/Image/Checklist 类型不进入此状态，而是进入 `focused`                                                  |
| `focused`           | （当前）单击 Card/Image 节点；（目标）双击已选中卡片、`Enter`、右键菜单 `Open Focused` | 返回按钮、点击遮罩、`Escape`             | 背景画布不可交互；Sticky 不可进入此状态                                                                                                                                                              |
| `folder-drill-down` | （当前）单击 Folder；（目标）双击已选中 Folder、`Enter`、右键菜单 `Open`               | 返回按钮、背景空白、`Escape`             | 仅当前 Folder 内容可交互；背景画布冻结                                                                                                                                                               |
| `connecting`        | 从 Handle 开始拖出连线                                                                 | 连接成功、取消                           | 禁止进入编辑与聚焦                                                                                                                                                                                   |

**状态优先级规则**：`dragging` 与 `connecting` 高于双击/编辑判定；`focused` 和 `folder-drill-down` 为全屏模态上下文，会冻结背景画布；`inline-editing` 期间不响应框选与节点拖拽。

### 2.12 笔记库弹窗 (Library Popup) — 已替代旧文档模式 🚧

> **状态**：旧的「画布 / 文档」双布局模式（`LayoutSwitcher` + `DocumentView` 三栏）已整体下线；替代方案是更轻量的「笔记库弹窗」，详细规格见 [`Planned/笔记库弹窗-替代文档模式.md`](./features/Planned/笔记库弹窗-替代文档模式.md)。本节只保留与画布主交互相关的最小总述。

- **入口**：画布左上角「📚 笔记库」按钮（与 React Flow Controls 同侧），点击后弹出覆盖式弹窗。
- **职责**：浏览当前画布上的所有 `Card` / `Image` / `Asset` / `Link`（按 Folder 分组 + 未分组 + 游离笔记），点击卡片即关闭弹窗 → `fitView` 飞到目标节点 → 自动打开 FocusedView。
- **角色边界**：与既有入口互补：
  - `Cmd/Ctrl+K` `SearchDialog`：关键词驱动，「我知道我要什么」，跨画布跳转。
  - 笔记库弹窗：浏览驱动，「我想看看我有什么」，仅限当前画布。
  - `DetachedNotesSidebar`：游离笔记的快捷管理与拖回画布。
- **不在首版**：弹窗内编辑、跨画布汇总、拖拽排序、批量操作；编辑统一走 FocusedView。

#### Detached notes（游离笔记池）

- **概念**：detached notes 是**有正式 `.md` 文件 + `noteId`、但尚未放置到任何画布**的笔记。它们存在于笔记库中永远可被找回，替代了早期 PRD 描述的「零引用隐性丢失」风险下的 `unplaced notes` 概念。
- **数据形态**：`position: {x:0, y:0}` 占位，`data.detached: true` 标记；不在画布上渲染。
- **创建路径**：画布模式右键菜单 > 「移出到笔记库」 → `detachNoteFromCanvas()` 保留 `.md` 和 `noteId`，但清理画布实例坐标和 edges。
- **放回画布**：画布模式 `CreateMenu` 中提供「文库笔记 / Library Note」入口，打开 `DetachedNotesSidebar`，拖入画布时通过 `screenToFlowPosition` + `pinNoteToCanvas()` 赋予真实坐标。
- **搜索可见性**：detached notes 进入全局搜索；笔记库弹窗里在「游离笔记」分组单独列出（首版仅 `card` / `image`，与 Sidebar 行为对齐）。

---

## 3. 关键动画与动效规范 (Motion Design Specs)

这是本产品的核心灵魂，也是前端实现的重点挑战。所有动画都必须遵循**"空间连续性"**原则，即用户要清晰地感知到元素是从哪里来的，又回到了哪里。

### 3.1 缩放与平移 (Pan & Zoom)

- **动效要求**：必须达到 60fps 甚至 120fps。不能有卡顿感。
- **缓动曲线**：使用弹簧物理引擎（Spring Physics）而非简单的线性或贝塞尔曲线（如 Ease-in-out），让拖拽停止时的惯性滑动显得自然。

### 3.2 共享元素过渡动画 (Shared Element Transition) - _卡片聚焦_

- **动效要求**：当卡片从画布态切换到聚焦态时，它不是突然弹出的 Dialog，而是**当前这块卡片本身发生形变和位移**。
- **拆解过程**：
  1.  用户点击卡片。
  2.  背景迅速叠加一层黑色半透明遮罩（`opacity: 0 -> 0.6`，耗时 ~200ms）。
  3.  被点击的卡片解除在画布中的绝对定位，通过计算其在视口中的初始位置 (BoundingClientRect) 和目标位置（屏幕中央），执行放大和平移动画。
  4.  卡片内部的元素（如图片、文字）进行流式重排（Reflow）的平滑过渡。

### 3.3 文件夹展开/收起动画 (Folder Stacking & Spreading)

- **展开动效**：
  - 点击"堆叠容器"。
  - 容器消失，内部包含的 3 张卡片以容器原先的中心点为基准，向四周呈放射状（或线性排布）平滑移动至目标位置。
  - 同时，卡片的缩放比例从缩小状态恢复为 1:1，透明度从较低恢复到 1。
- **缓动推荐**：稍微带一点点弹性（Bouncy）的 Spring 曲线，增加由于"释放"带来的物理反馈感。

---

## 4. 技术栈概览

| 层级       | 技术选型                      |
| ---------- | ----------------------------- |
| 画布引擎   | @xyflow/react (React Flow)    |
| UI 框架    | React 19 + TypeScript         |
| 样式       | Tailwind CSS v4               |
| 动画       | Framer Motion (motion/react)  |
| 富文本编辑 | Tiptap (ProseMirror)          |
| Markdown   | markdown-it + DOMPurify       |
| 构建工具   | Vite + Bun                    |
| 桌面运行时 | Electrobun                    |
| 国际化     | Paraglide / Inlang（en / zh） |

| 状态管理 | Zustand + TanStack React Query |

> 渲染引擎、语义缩放、FLIP 动画、性能预算与降级策略等技术实现细节请参阅 [技术规范文档](./tech-spec.md)。

---

## 5. Local-First 数据架构

### 5.1 核心原则

1. **文件即数据源（File as Source of Truth）**—— 每张 **Card 类型**卡片对应磁盘上一个 `.md` 文件，画布布局用独立的 manifest 文件管理。**Folder 的 Card 子节点今天的运行模型与顶层 Card 完全对等**：各有独立 `.md` 文件与 `noteId`，可被 Obsidian / Typora 等外部编辑器打开，可被其他画布通过 `noteId` 引用（详见 §5.6 manifest 示例与 §5.10 决策表：M5 已完成）。Sticky（便签）的内容依然内嵌在 manifest `data.content` 中，不生成独立 `.md` 文件；Folder 内的 Image 子节点依然走 `attachments/` 附件模式不分配 `noteId`。

   > **早期版本历史**：MVP 初版 Folder children 是以 `{ id, data: {...content inline} }` 内嵌在 manifest 中的「legacy」形式，仅在 GhostBoard 内可见。它们会在 `loadCanvas` 加载时被自动迁移：分配 `noteId`，下次 `saveManifest` 会将内嵌内容写入独立 `.md` 并把 manifest 吐到引用形式。
2. **内容与布局解耦** —— 内容级属性（标题、标签、创建时间）存 frontmatter；视图级属性（位置、大小、层级）存 manifest。
3. **`noteId` ≠ `nodeId`** —— 内容实体 ID 和画布实例 ID 分离，同一篇笔记可在多个画布或同一画布中多次出现。
4. **删除实例不等于删除内容** —— 删除顶层 `node` 只影响当前画布实例；当某个 `noteId` 不再被任何画布引用时，内容文件保留，直到用户显式执行永久删除或在设置页 Unlinked Files 清理工具中删除。删除 Folder 时，其 Card/Asset/Link 等 children 会被转换为 detached 节点留在笔记库，不随 Folder 一起丢失；单独删除 Folder child 时，Card child 的 `.md` 会被清理，Image/Asset 仍遵循附件模式。

### 5.2 配置文件与偏好

#### 当前实现：Workspace settings ✅

当前版本还没有多 workspace 管理；应用启动时直接打开默认 workspace。用户偏好存放在当前 workspace 内：

```
workspace/
└── .ghostboard/
    └── settings.json
```

```json
{
  "theme": "system",
  "locale": "zh"
}
```

- `theme` 与 `locale` 会通过 settings window 保存，并向主窗口推送即时更新。
- 画布软删除 Trash 与 Unlinked Files 清理入口目前也在 settings window 中承载。

#### 目标设计：App config（多 Workspace 前置）❌ 待实现

多 workspace 管理需要一个独立于 workspace 的应用级配置，建议存放在用户目录下：

```
~/.ghostboard/
└── app-config.json
```

```json
{
  "schema": "ghostboard-app/v1",
  "recentWorkspaces": [
    {
      "path": "/Users/me/Documents/work-notes",
      "name": "Work Notes",
      "lastOpenedAt": "2026-04-03T10:00:00Z"
    },
    {
      "path": "/Users/me/Documents/personal-ideas",
      "name": "Personal Ideas",
      "lastOpenedAt": "2026-04-01T08:30:00Z"
    }
  ],
  "activeWorkspace": "/Users/me/Documents/work-notes",
  "preferences": {
    "theme": "system",
    "language": "zh-CN"
  }
}
```

**启动流程**：

1. 读取 `~/.ghostboard/app-config.json`
2. 若有 `activeWorkspace` → 直接打开该 workspace
3. 若无（首次启动）→ 显示欢迎页，引导用户创建或选择 workspace 目录
4. 进入 workspace 后 → 读取 `.ghostboard/workspace.json` 与 `.ghostboard/settings.json` → 加载画布

> 当前启动流程是固定默认 workspace：`initWorkspace()` → `seedFirstRunIfNeeded()` → `loadSettings(wsPath)` → 读取 `.ghostboard/workspace.json` 的 `activeViewId`。

### 5.3 Workspace 文件系统结构

```
workspace/
├── .ghostboard/                        # 应用元数据（不是用户内容）
│   ├── workspace.json                  # workspace 内视图列表、activeViewId、trash 记录
│   ├── settings.json                   # 当前实现的主题、语言、默认布局偏好
│   ├── trash/                          # 被软删除的 canvas manifest
│   └── views/                          # 每个画布一个 manifest
│       ├── default.canvas.json
│       └── roadmap.canvas.json
├── content/                            # 统一内容树
│   ├── who-ghostboard-is-for.md
│   ├── prio-before-launch.md
│   ├── alpha-feedback.md
│   └── great-ideas/                    # 后续迁移目标：文件夹即目录（MVP 阶段 Folder children 内嵌在 manifest 中）
│       ├── floating-notes.md
│       └── drop-in-anything.md
└── attachments/                        # 图片和附件（文件名带哈希前缀避免冲突）
    ├── a1b2c3d4-chart.png
    ├── a1b2c3d4-chart-thumbnail.jpg
    ├── f1e2d3c4-demo-video.mp4
    └── e5f6g7h8-photo.jpg
```

- **单一内容树**：所有笔记统一放在 `content/` 下（扁平结构）。**M5 之后 Folder Card 子节点同样在 `content/` 下拥有自己的 `.md` 文件**（与顶层 Card 并列，不使用子目录），manifest 通过 `children[].noteId + file` 引用。示意图中的 `great-ideas/` 子目录仅为远期「文件夹即目录」模型的占位示意，当前不启用。
- **Per-view manifest**：每个画布视图独立一个 `.canvas.json`，避免单文件成为写入热点。
- **附件去重**：附件文件名使用 `{hash}-{原始名}` 格式，避免同名冲突。路径统一为 workspace-relative POSIX 路径。Image / Asset 节点保存原始附件引用，视频/音频/图片可额外保存 thumbnail 或 waveform 元数据。

### 5.4 Markdown 文件格式

用 YAML frontmatter 存储**内容级**元信息，正文是纯 Markdown：

```markdown
---
id: 'note_a1b2c3d4'
title: 'Prio before launch'
displayHint: 'checklist'
color: '#EAF2B8'
tags: ['Inbox']
createdAt: 2026-03-28T10:00:00Z
updatedAt: 2026-03-31T14:30:00Z
---

## Lingering bugs

- [x] Dragging should not let stickies become too small
- [x] When pasting images/webclips
- [ ] Drop area on desktop reported by some
- [ ] Highlight border around webclips isn't removed after undoing resize
```

**`displayHint` 说明**（UI 渲染提示，互斥枚举——每张卡片有且仅有一个值）：

| displayHint | 代码中对应 `data.type` | 含义                   | 画布上的默认渲染                            | 聚焦行为      |
| ----------- | ---------------------- | ---------------------- | ------------------------------------------- | ------------- |
| `note`      | `text`                 | 普通文本笔记（默认值） | 显示标题 + 正文摘要                         | ✅ 可进入聚焦 |
| `checklist` | `checklist`            | 以待办列表为主         | 显示标题 + checkbox 列表（可直接勾选/添加） | ✅ 可进入聚焦 |
| `image`     | `image`                | 以图片为主             | 显示图表/图片内容                           | ✅ 可进入聚焦 |

> **Sticky 不属于 `displayHint` 枚举**：Sticky（便签）是独立的节点类型（manifest 中 `type: "sticky"`），其内容直接内嵌在 manifest `data.content` 中，不对应独立的 `.md` 文件，因此不使用 frontmatter 的 `displayHint` 字段。

> **当前实现说明**：代码中使用 `data.type`（值为 `'text'` / `'checklist'` / `'image'`）作为卡片类型标识，与 PRD 定义的 `displayHint` 字段名和枚举值（`'note'`）存在差异。引入文件系统持久化时将统一为 `displayHint`。

**frontmatter 字段归属原则**：

| 放 frontmatter（内容级） | 放 manifest（视图级）                  |
| ------------------------ | -------------------------------------- |
| `id` (noteId)            | `id` (nodeId)                          |
| `title`、`tags`          | `position`、`style: { width, height }` |
| `createdAt`、`updatedAt` | z-order（数组顺序）                    |
| `color`（内容默认颜色）  | `color`（per-view 视觉覆盖，可选）     |
| `displayHint`            | `locked`、`parentId`、`extent`         |

**颜色优先级**（三层回退）：`manifest.data.color`（per-view override）→ `frontmatter.color`（内容默认）→ 组件默认色板。当同一笔记出现在多个画布中时，每个画布可通过 manifest `color` 独立覆盖颜色，而不影响内容文件本身的默认颜色。**Sticky 例外**：Sticky 无 frontmatter，仅走两层回退——`manifest.data.color` → 组件默认色板。

### 5.5 Workspace 配置

`.ghostboard/workspace.json`：

```json
{
  "schema": "ghostboard-workspace/v1",
  "activeViewId": "default",
  "views": [
    {
      "id": "default",
      "name": "Default Canvas",
      "file": "views/default.canvas.json"
    },
    { "id": "roadmap", "name": "Roadmap", "file": "views/roadmap.canvas.json" }
  ]
}
```

- **`activeViewId` 持久化**：用户切换画布时，`activeViewId` 实时写入 `workspace.json`，确保应用重启后自动恢复到上次使用的画布。

### 5.6 Canvas View Manifest

`.ghostboard/views/default.canvas.json`（与 @xyflow/react 原生 Node/Edge JSON 完全一致）：

```json
{
  "schema": "ghostboard-canvas/v1",
  "viewId": "default",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    {
      "id": "node_7f3a",
      "type": "card",
      "position": { "x": 900, "y": 100 },
      "data": {
        "noteId": "note_a1b2c3d4",
        "file": "content/prio-before-launch.md"
      }
    },
    {
      "id": "node_group1",
      "type": "group",
      "position": { "x": 60, "y": 60 },
      "data": { "label": "Strategy", "color": "blue" },
      "style": { "width": 760, "height": 420 }
    },
    {
      "id": "node_card_in_group",
      "type": "card",
      "position": { "x": 30, "y": 50 },
      "parentId": "node_group1",
      "extent": "parent",
      "data": { "noteId": "note_moat", "file": "content/new-moat-analysis.md" }
    },
    {
      "id": "node_folder1",
      "type": "folder",
      "position": { "x": 900, "y": 600 },
      "style": { "width": 350, "height": 350 },
      "data": {
        "label": "Great Ideas",
        "subtitle": "The really great ideas...",
        "children": [
          {
            "id": "child_1",
            "noteId": "note_abc12345",
            "type": "card",
            "data": {
              "noteId": "note_abc12345",
              "file": "content/floating-notes.md",
              "type": "text"
            }
          },
          {
            "id": "child_2",
            "noteId": "note_def67890",
            "type": "card",
            "data": {
              "noteId": "note_def67890",
              "file": "content/drop-in-anything.md",
              "type": "text"
            }
          }
        ]
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_7f3a",
      "target": "node_card_in_group",
      "sourceHandle": "right",
      "targetHandle": "left",
      "type": "smoothstep"
    }
  ]
}
```

**设计说明**：

- 所有字段（`position`、`data`、`style`、`parentId`、`extent`、`source`/`target`、`sourceHandle`/`targetHandle`）均为 React Flow 原生字段，加载时可直接传入 `<ReactFlow nodes={} edges={} />` 无需转换。
- 业务自定义字段（`noteId`、`file`、`label`、`color`、`children` 等）统一放在 `data` 对象内。
- 节点 `type` 使用 `'card'` / `'image'` / `'asset'` / `'link'` / `'sticky'` / `'folder'` / `'group'`，与代码中 `nodeTypes` 一致。
- 节点在数组中的顺序即为 z-order（后面的覆盖前面的）。
- Folder 的 `data.children` 存放被收纳的内容条目；当前允许的 child 类型为 `card` / `image` / `asset` / `link`（Checklist 以 `type: "card"` + `data.type: "checklist"` 表达）。`folder` / `group` / `sticky` 不进入 Folder。
- Folder 封面上的计数标题（如 `"3 items"`）为运行时根据 `children.length` 派生；封面只渲染摘要信息，不渲染内部完整小画布。
- Folder `children` 在 drill-down 中只用于浏览、聚焦和 `Extract to Canvas`，不作为独立 Edge 端点；需要对外表达关系时，应连到 Folder 封面节点。
- **Folder Card 子节点的水化与落盘**（M5 ✅）：加载时 `loadCanvas` 按 `noteId + file` 读取 `.md` frontmatter 与正文，通过 `noteToCardData()` 水化回 `title` / `content` / `color` 等字段填充到 `data` 中；保存时 `saveManifest` 调用 `writeNoteWithPreview()` 将正文写入子笔记的 `.md`，并把 manifest 吐到 `{ id, noteId, type, data: { noteId, file, type } }` 的引用形式（不写正文、不写 preview 元数据）。Legacy 内嵌 children 在加载时自动 stamp 一个 `noteId`，下次 save 时内容迁到 `.md`。
- **Image 子节点例外**：Folder 中的 Image 子节点继续使用 `imageFile` 附件指针模式，不分配 `noteId`，不生成 `.md`。
- **Asset / Link 节点**：Asset 使用 `attachmentFile`、`thumbnailFile`、`waveform`、`mimeType`、`kind` 等字段描述本地附件；Link 使用 `url`、`title`、`description`、`siteName`、`faviconUrl`、`imageUrl` 等字段描述网页链接。Asset/Link 可以作为顶层节点，也可以作为 Folder children，长期产品语义为"资料夹中的内容条目"。
- **Viewport 持久化**：`viewport` 字段（`x` / `y` / `zoom`）随 manifest 一起持久化。切换画布时保存当前 viewport 到源 manifest、从目标 manifest 恢复 viewport；应用重启后通过 `hydrate` 回写 ReactFlow，确保用户回到上次浏览位置。

### 5.7 TypeScript 类型定义

> 完整的 TypeScript 类型定义（`NoteFrontmatter`、各节点 Data 接口、`CanvasViewManifest`、`WorkspaceConfig`、`AppConfig` 等）已迁移至 [技术规范文档 §3.2](./tech-spec.md#32-typescript-类型定义)。

### 5.8 读写流程与状态管理

> 读写流程、debounce 策略、原子写入、RPC 协议等技术实现细节请参阅 [技术规范文档 §7](./tech-spec.md#7-数据持久化)。
> 状态管理分层（Zustand + React Query）、canvasStore 结构、undo/redo 机制请参阅 [技术规范文档 §4](./tech-spec.md#4-状态管理)。

### 5.9 导入/导出 (Import / Export)

- **导出**：
  - **JSON**：导出完整画布数据（manifest + 关联的 .md 内容），可用于备份或迁移。
  - **PNG/SVG**：将当前画布视口导出为图片（用于分享或演示）。
- **导入**：
  - 支持导入此前导出的 JSON 文件以恢复画布。
  - 支持拖拽图片文件到画布上自动创建图片卡片。
  - 支持直接将 `.md` 文件拖入画布创建笔记卡片。

### 5.10 关键架构决策

| 决策点             | 方案                                                                            | 理由                                                                       |
| ------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ID 分离            | `noteId`（内容）+ `nodeId`（画布实例）                                          | 同一笔记可在多画布/同画布多次出现                                          |
| 布局存储           | Per-view manifest，不放 frontmatter                                             | 布局和内容解耦，避免单文件热点                                             |
| 内容树结构         | 统一 `content/` 目录                                                            | 避免 `notes/` + `folders/` 双根混乱                                        |
| 内容生命周期       | 删 `node` 只删实例；零引用 `note` 保留为 **detached note**（见 §2.12）                             | 避免误删共享内容，也避免内容文件无入口可找回                               |
| Folder 范围        | Folder 是内容集合，不是万能容器；可收纳 Card/Checklist/Image/Asset/Link，不收纳 Folder/Group/Sticky | 保持 Folder 的资料夹语义，避免递归层级、空间布局和临时便签混进同一个模型 |
| Folder Card 子节点  | 与顶层 Card 对等：独立 `.md` + `noteId`；manifest 仅保留 `{ id, noteId, type, data: { noteId, file, type } }` 引用（M5 ✅）       | 外部编辑器可见、可跨画布复用 noteId；消除早期「仅画布内可见」降级定位       |
| Folder Image 子节点 | 继续使用 `attachments/` + `imageFile` 指针，不分配 `noteId`                                       | Image 没有文本正文概念，附件模式已足够；保持与顶层 Image 节点一致                                 |
| Asset / Link 节点 | 作为独立 node kind，不并入 `image` 或 `card`；Asset 走 `attachments/`，Link 走 URL + unfurl 元数据 | 避免把本地文件、网页链接和 Markdown 文档混成一个数据模型 |
| Folder / Edge 边界 | Folder 封面可连线；`children` 不跨层暴露 Handle                                 | 避免 drill-down 时连线语义失真                                             |
| Folder 内布局      | MVP 使用自动排布，不存子坐标                                                    | 避免过早引入子画布复杂度                                                   |
| ID 生成            | `nanoid`，写入 frontmatter                                                      | 文件重命名不影响引用关系                                                   |
| 文件监听           | `fs.watch` 或 `chokidar`                                                        | 外部编辑器修改 .md 后自动同步到画布                                        |
| 持久化策略         | 内容 1500ms、布局 2500ms，失焦时立即 flush                                      | 平衡输入流畅度与磁盘写入频率                                               |
| 写入协调           | 分 debounce + 单串行写入队列 + 原子写                                           | 降低内容/布局竞态与文件损坏风险                                            |
| Checklist 格式     | GFM `- [x]` 语法                                                                | 与 Obsidian/Typora 等生态兼容                                              |
| 图片/附件          | `attachments/` + 哈希前缀文件名                                                 | 避免同名冲突，标准 Markdown 引用语法                                       |
| manifest 格式      | 与 @xyflow/react 原生 Node/Edge JSON 一致                                       | 加载时零转换，直接传入组件                                                 |
| z-order            | 数组顺序（后覆盖前）                                                            | 简单直观，React Flow 原生行为                                              |
| 路径格式           | workspace-relative POSIX path                                                   | 跨平台一致性                                                               |
| 颜色来源           | manifest `color` 覆盖 frontmatter `color`                                       | 保留内容语义色与视图强调色的分层                                           |
| Viewport 持久化    | Per-view `viewport` 字段写入 `.canvas.json`，切换画布/重启后恢复                  | 用户回到上次浏览位置，避免每次打开从原点开始                             |
| 活跃画布持久化     | `activeViewId` 实时写入 `workspace.json`                                          | 重启后恢复到上次使用的画布                                               |

### 5.11 Edge Cases & Guardrails

> 完整的 edge case 处理策略表格（文件断链、watcher 循环、frontmatter 解析失败、manifest 损坏等）已迁移至 [技术规范文档 §9](./tech-spec.md#9-edge-cases--guardrails)。

> 桌面运行时选型对比（Electrobun / Tauri / Electron）已迁移至 [技术规范文档 §1.3](./tech-spec.md#13-桌面运行时选型)。

---

## 6. 隐私与安全 (Privacy & Security)

- **本地优先**：所有用户数据（笔记、图片、画布布局）仅存储在用户设备本地，不上传至任何服务器。
- **无账号体系**：MVP 阶段不需要用户注册或登录。
- **AI 功能的隐私边界**：如果后续接入 Gemini 等 AI 能力，需明确告知用户哪些数据会被发送至 API，并提供开关。

### 6.1 明确排除项 (Out of Scope for MVP)

- **实时协作**：MVP 不提供多人协作、CRDT、远程同步或 presence。冲突处理默认以单设备本地文件系统为边界，外部修改通过 watcher 同步，超出此范围不承诺一致性。
- **Folder 子画布 / 万能容器**：MVP 不把 Folder 设计为可自由摆放节点的嵌套画布，也不允许它收纳所有节点类型。完整空间结构继续由 Group / Canvas View 承担；若未来需要 Sub-canvas，应作为独立模型设计。

### 6.2 无障碍基线 (Accessibility Baseline)

- **键盘可达性**：Tab 在当前上下文的可聚焦控件间移动；方向键可在选中节点之间导航；`Enter` 打开聚焦；`Escape` 返回上一级。
- **语义标注**：卡片、Folder、连接点、上下文菜单需预留 ARIA label / role，保证后续可接入屏幕阅读器。
- **视觉对比**：颜色不是唯一状态来源；选中、锁定、错误态需同时提供描边、图标或文字反馈，高对比主题作为预留能力。

---

## 7. 迭代路线图 (Roadmap)

> 各任务的涉及文件、实现要点和关键算法请参阅 [技术规范文档](./tech-spec.md)。

### 🔴 P0 — 核心交互完善

| #   | 任务                                                      | 复杂度 | 状态      |
| --- | --------------------------------------------------------- | ------ | --------- |
| 1   | **右键菜单 (Context Menu)** — 画布/卡片/Folder/Group/Sticky/Edge 六种上下文 | 中     | ✅ 已完成 |
| 2   | **键盘快捷键** — Delete/Cmd+C/V/A/N/Z、模态屏蔽           | 低     | ✅ 已完成 |
| 3   | **节点连线 (Edges)** — 四向 Handle + smoothstep + 双向绘制 + 连接预览线 | 中     | ✅ 已完成 |
| 4   | **选择模型重构** — 单击=选中，双击/Enter=聚焦             | 中     | ✅ 已完成 |
| 5   | **FolderNode Resize** — NodeResizeControl                 | 低     | ✅ 已完成 |
| 5.1 | **碰撞检测与放置解析** — Group/Folder 拖拽时的排斥与自动归属判定 | 中     | ✅ 已完成 |

### 🟡 P1 — 核心特性（差异化亮点）

| #   | 任务                                              | 复杂度 | 状态      |
| --- | ------------------------------------------------- | ------ | --------- |
| 6   | **Group 开放式分组** — 三阶段拖拽 + 预设颜色 + 排斥力学 | 高     | ✅ 已完成 |
| 7   | **撤销/重做 (Undo/Redo)** — 快照历史栈            | 中     | ✅ 已完成 |
| 8   | **便签 (Sticky Note)** — 双击原地编辑，不进入聚焦 | 低     | ✅ 已完成 |
| 9   | **图片卡片** — 拖拽/粘贴上传，缩略图/原图切换     | 中     | ✅ 已完成 |
| 9.1 | **Tiptap 富文本编辑器** — 聚焦模式 Markdown 编辑，支持标题/列表/任务/代码块等 | 中     | ✅ 已完成 |
| 9.2 | **Markdown 预览渲染** — 画布态 markdown-it + DOMPurify 安全预览 | 低     | ✅ 已完成 |

### 🟢 P2 — 数据层与增强功能

| #    | 任务                                                               | 复杂度 | 状态      |
| ---  | ------------------------------------------------------------------ | ------ | --------- |
| 10   | **数据持久化** — 端到端链路（manifest + .md 拆分 + RPC + hydrate） | 高     | ✅ 已完成 |
| 11   | **全局搜索** — Cmd/Ctrl+K，跨画布搜索与定位；Folder children / unreferenced Markdown 覆盖待补 | 中     | ✅ MVP 已完成 / ⚠️ 覆盖待补 |
| 12   | **连线标签与动画** — 可编辑 label + 流动虚线 + Marker 端点           | 低     | ✅ 已完成 |
| 13   | **Group 嵌套** — 多级 parentId + 防循环                            | 中     | ✅ 已完成 |
| 13.1 | **画布标题栏模糊** — 顶部工具栏背景模糊效果                          | 低     | ✅ 已完成 |
| 14   | **画布导出 PNG/JSON**                                              | 低     | ✅ 已完成 |
| 14.1 | **~~文档模式（Document Layout）~~** — 已下线，替代方案：笔记库弹窗（§2.12）       | —     | ⛔ 已移除 |
| 14.2 | **Folder Card 子节点迁移 noteId + 独立 .md**（M5）                     | 中     | ✅ 已完成 |
| 14.3 | **设置窗口（theme / locale / trash / unlinked cleanup）**            | 低     | ✅ 已完成 |
| 14.4 | **~~文档模式 i18n~~** — 已随 §2.12 下线                              | —     | ⛔ 已移除 |
| 14.5 | **Canvas 模板库** — ViewSwitcher「+」按钮子菜单、`/templates` 列表、`/templates/$templateId` 只读预览、基于模板创建新画布 | 高     | ✅ MVP 已完成 / ⚠️ P5 收尾待补 |
| 14.6 | **Per-view Viewport 持久化** — 每个画布的 ReactFlow viewport（x/y/zoom）随 `.canvas.json` 持久化，切换画布/重启后恢复 | 低     | ✅ 已完成 |
| 14.7 | **活跃画布持久化** — `activeViewId` 写入 `workspace.json`，重启后恢复到上次使用的画布 | 低     | ✅ 已完成 |
| 14.8 | **Asset / Link 多模态节点** — 本地文件、视频/音频预览、链接创建与 unfurl、Document 类型视图接入 | 高 | ✅ MVP 已完成 / ⚠️ 大文件、PDF、富链接待补 |

### ⚪ P3 — 后续迭代

| #    | 任务                         | 复杂度 | 状态      |
| ---  | ---------------------------- | ------ | --------- |
| 15   | **多画布视图切换**           | 中     | ✅ 已完成 |
| 16   | **多 workspace 管理**        | 中     | ❌ 待实现 |
| 17   | **节点锁定**                 | 低     | ❌ 待实现 |
| 18   | **框选 (Marquee Selection)** | 低     | ✅ 已完成（React Flow 内置框选 + 自定义选框样式） |
| 19   | **导入 JSON / .md**          | 低     | ❌ 待实现 |
| 20   | **移动端适配**               | 高     | ❌ 待实现 |
| 21   | **Group 拖拽推开**           | 中     | ✅ 已完成 |
| 22   | **`extent: "parent"` 约束**  | 低     | ❌ 待实现 |
| 23   | **Edge 颜色/样式**           | 低     | ❌ 待实现 |
| 23.1 | **桌面应用图标** — 多尺寸 icns/ico | 低     | ✅ 已完成 |

### 🔮 远期

| #   | 任务                     | 说明                                                                                                                                                                                             |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 24  | **高级视频/PDF 卡片**    | Asset MVP 已支持视频/音频播放；后续补大文件原生导入、PDF 页面预览、视频转码/封面编辑                                                                                                                                 |
| 25  | **富 Web Clips**         | Link MVP 已支持 URL 节点和基础 unfurl；后续补 favicon/image 展示、网页剪藏、Magazine 风格预览                                                                                                                                 |
| 26  | **全局快捷键快速输入**   | Quick Input from anywhere                                                                                                                                                                        |
| 27  | **AI 辅助**              | Gemini 总结、生成、关联推荐                                                                                                                                                                      |
| 28  | **商业化**               | Free + Pro 订阅                                                                                                                                                                                  |
| 29  | **双向链接 (Backlinks)** | 支持 `[[note]]` 语法在笔记正文中引用其他笔记，自动建立反向链接索引。与 Edge 系统互补——Edge 是画布上显式的视觉关系，Backlink 是内容层隐式的语义关系。侧边栏或聚焦模式底部展示"被哪些笔记引用"列表 |

---

## 8. 项目待办与未决策 (Backlog & Open Decisions)

> 本章节是产品层面的待办与未决策总表。决策落地后，把对应行从本表删除或改为“已决策”，并同步回写正文对应小节，保持本 PRD 与 [技术规范文档](./tech-spec.md) 为唯一事实源。

### 8.1 架构级未决策

| ID | 题目 | 背景与选项 | 状态 |
| --- | --- | --- | --- |
| OD-1 | **Document Workspace 信息架构** | 当前实现是 canvas-derived：从 active canvas manifest 派生 All/Folders/Types。早期 PRD 目标是 filesystem-first：直接浏览 `content/**/*.md` 文件树。选项：① 接受当前方向并将功能命名为 Canvas Document Mode；② 回到 filesystem-first，新增真实文件树、目录 CRUD、文件移动/重命名、引用保护和 Add to Canvas。 | 待决 |
| OD-2 | **搜索范围** | 当前搜索 MVP 覆盖画布可定位对象和其 Markdown 正文，但 Folder children 与未被 manifest 引用的 `.md` 仍可能漏搜。选项：① 只承诺 canvas-addressable 搜索；② 搜索整个 workspace 文档库；③ 搜索结果区分 placed / detached / unlinked。 | 待决 |
| OD-3 | **多 Workspace 管理** | 当前固定打开默认 workspace；多 workspace 需要欢迎页、recentWorkspaces、activeWorkspace、workspace switch、app-level config。 | 待实现 |
| OD-4 | **app-level vs workspace-level settings** | 当前设置在 `.ghostboard/settings.json`；多 workspace 目标需要 `~/.ghostboard/app-config.json`。需要决定 theme/locale/trash cleanup 等设置的归属。 | 待决 |
| OD-5 | **Folder / Detached 删除语义** | 当前顶层删除移除 canvas node，Folder child 删除会清理 child note，删除 Folder 会把 children 转为 detached 节点。若转向 filesystem-first，需要重新定义"删除引用"与"删除真实文件"的确认流程。 | 待决 |

### 8.2 产品体验未决策

| ID | 题目 | 背景与选项 | 状态 |
| --- | --- | --- | --- |
| ~~OD-6~~ | ~~Sticky 在文档模式的曝光~~ | 随旧文档模式下线；Sticky 仍仅在画布渲染。 | ⛔ 已关闭 |
| ~~OD-8~~ | ~~layoutMode 的作用域~~ | 旧文档模式整体下线，不再需要 per-view layoutMode 持久化。 | ⛔ 已关闭 |
| ~~OD-9~~ | ~~模式切换时的 viewport / 编辑态细节~~ | 不再有「模式切换」概念。 | ⛔ 已关闭 |
| ~~OD-10~~ | ~~导出 PNG/SVG 在文档模式的语义~~ | 画布模式导出语义即唯一语义。 | ⛔ 已关闭 |
| ~~OD-11~~ | ~~Image / Asset / Link 在文档模式的编辑性~~ | 这些类型的编辑统一收敛到 FocusedView。 | ⛔ 已关闭 |
| ~~OD-12~~ | ~~Checklist 在文档模式的形态~~ | Checklist 仅在画布/FocusedView 内编辑，沿用结构化 `data.items`。 | ⛔ 已关闭 |
| ~~OD-13~~ | ~~左栏 ARIA tree role 规范~~ | LeftRail 随文档模式下线，无需 ARIA tree 规范。 | ⛔ 已关闭 |

### 8.3 已知待办

| ID | 事项 | 目标 | 优先级 |
| --- | --- | --- | --- |
| TODO-1 | **补 Folder children 搜索** | 后端和前端 fallback 都应索引 Folder children 中的 Card/Asset/Link/Image，使其能被全局搜索命中并定位回画布。 | P0 |
| TODO-2 | **明确 unlinked Markdown 策略** | 决定 `content/*.md` 中无 manifest 引用的文件是进入搜索结果，还是只留在设置页清理工具。 | P0 |
| TODO-3 | **Asset 大文件导入** | 文件选择/拖拽不要只走 data URL；接入 native path copy，避免视频/大文件触发 25 MB data URL 限制。 | P1 |
| TODO-4 | **Link 富预览与安全硬化** | UI 展示 favicon/image preview；unfurl 增加 DNS 解析后的私网 IP 防护，降低 DNS rebinding 风险。 | P1 |
| TODO-5 | **PDF 预览** | Asset 中 PDF 从普通文件升级为页面缩略图/内嵌预览。 | P2 |
| TODO-6 | **模板库 P5 收尾** | 补模板数量，接入 thumbnail，删除 `preview-test` 路由，决定从模板创建的画布命名规则，考虑 URL query 同步与 i18n metadata。 | P1 |
| TODO-7 | **Multi-workspace** | 欢迎页、创建/打开/切换 workspace、recent list、app config、settings 迁移策略。 | P2 |
| TODO-8 | **独立 saveNote debounce** | 当前正文修改主要经 manifest 保存链路写回；若后续编辑场景变重，需要独立内容保存队列。 | P2 |

### 8.4 已落地的关键决策映射（供回查）

| 决策摘要 | 落地位置 |
| --- | --- |
| 双布局（画布 + 文档）整体下线，替代方案为笔记库弹窗 | §2.12、[`Planned/笔记库弹窗-替代文档模式.md`](./features/Planned/笔记库弹窗-替代文档模式.md) |
| Folder Card 子节点强制 `noteId + .md`（M5） | §5.1、§5.6、§5.10 |
| Folder 是内容集合，不是万能容器；允许 Card/Checklist/Image/Asset/Link，不允许 Folder/Group/Sticky | §2.5.2、§5.6、§5.10 |
| Detached notes 取代早期 `unplaced notes` 概念 | §2.8、§2.12 |
| Tiptap 与画布 undo/redo 栈隔离 | §2.10 |
