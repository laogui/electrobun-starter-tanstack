# 产品需求文档 (PRD)：GhostBoard 自由画布知识库

> **相关文档**
>
> - [技术规范文档](./tech-spec.md) — 架构、技术栈、目录结构、状态管理、渲染动画、性能预算、数据持久化、RPC 协议、编码约定
>
> **最近同步**：已按 2026-06-15 至 2026-07-16 的提交记录更新本 PRD。除画布交互、文件/录音节点、导入导出、设置入口、搜索与持久化外，补齐 **widget 小组件**（checklist / pomodoro / reminder）、Folder **waterfall** 展开、FocusedView **从卡片 morph**、画布 **minimap 开关** 与 **cream** 背景，并与 [tech-spec](./tech-spec.md) 对齐。

## 1. 产品概述

- **产品定位**：一款面向思考者、设计师和研究人员的视觉化个人知识库。
- **核心痛点**：解决传统线性笔记（如备忘录、文档）带来的信息碎片化和认知负担。让用户像在白板上一样，通过空间位置、距离和组合来建立知识的关联。
- **核心亮点**：无限缩放平移、所见即所得的卡片编辑、以及极致平滑的沉浸式层级切换动效。

## 2. 核心功能模块与交互逻辑

### 2.1 无限自由画布 (Infinite Canvas)

- **功能描述**：一个没有边界的 2D 空间，用户可以在任意位置放置内容节点。
- **交互逻辑**：
  - **平移 (Panning)**：支持触控板双指滑动或鼠标中键拖拽，实现画布的无级平移。
  - **缩放 (Zooming)**：支持触控板捏合、`Ctrl/Cmd + 滚轮` 以及 `Cmd/Ctrl + +/-/0` 缩放。节点在所有缩放等级保持同一套真实内容与视觉结构，不在固定阈值批量切换 placeholder / skeleton；Image / Asset 继续使用既有缩略图和摘要数据控制媒体成本。低缩放专用 LOD 只有在实际 Profiler 数据证明必要后才重新引入。
  - **选择与聚焦 (Selection & Focus)**：
    - 当前采用"单击打开 + 显式选择"模型（✅ 已实现）——普通单击可聚焦节点直接进入 FocusedView，普通单击 Folder 进入 drill-down；Sticky 的普通单击直接进入原地编辑。选择主要通过框选、`Shift/Cmd/Ctrl+Click`、方向键导航、右键菜单同步选择来完成。
    - 多选集合支持批量拖拽、删除、复制/剪切/粘贴、重复、分组、锁定/解锁、改色、编辑标签、移动到其他画布，以及拖入 Group/Folder。
    - 为避免误触发，拖拽、连线和框选判定优先于单击打开；普通节点点击产生的 React Flow 纯 selection change 会被抑制，避免"打开同时残留选中"。
  - **框选 (Marquee Selection)**：桌面端在画布空白处左键拖拽绘制选择框，按部分相交规则选中多个节点。当前 `selectionOnDrag` 在普通画布状态启用；按住空格进入平移模式或处于文本/输入编辑态时临时关闭，避免与平移和编辑冲突。进入聚焦模式或 Folder drill-down 后，框选仅作用于当前上下文，不影响背景画布。

### 2.2 多模态信息卡片 (Content Cards)

- **功能描述**：画板上的基本元素，支持不同类型的数据载体。
- **卡片类型**：
  - **图文卡片**：包含图片和文本（如演示中的 Target audience 饼图卡片）。
  - **长文本/文档 (Note Card)**：承载长篇幅的文章。在聚焦模式下使用 **BlockNote 块编辑器**进行 Notion 风格的所见即所得编辑，支持标题、列表、任务列表、引用、代码块、行内代码、粗斜体、删除线、链接、图片、分割线等常用块。BlockNote 文档以无损 JSON sidecar (`content/.ghostboard/blocknote/<noteId>.json`) 作为 canonical source；Markdown 只作为 legacy/import fallback 与按需导出格式，保存时不再维护同步 `.md` 副本。
  - **小组件 (Widget)**：独立于 Card 的节点类别，React Flow `type: "widget"`，用 `kind` 区分具体种类。**内容不写入 canvas manifest**，而是存放在 `.ghostboard/widgets/<widgetId>.json`；manifest 只保留 `{ widgetId, kind }` 引用。当前支持三种：
    - **待办列表 (Checklist)**：画布上可直接勾选与在列表末尾添加条目，不改变全局交互状态（保持 `idle` / `selected`），不触发 `inline-editing`；完整编辑可进入 FocusedView。内容字段为带稳定 `id` 的 items 数组；编辑走 `widgetStore`，不经 `commitNodeData` 写回 manifest。
    - **番茄钟 (Pomodoro)**：专注 / 短休 / 长休计时器，画布上直接操作。运行中 tick **不**每秒写盘，仅在 start / pause / complete 等状态转换时保存；加载时若 `running` 已超时则按完成结算。
    - **提醒 (Reminder)**：截止时间与状态（scheduled / snoozed / done / missed）。第一版仅在 app 打开时做应用内提示，`repeat` 只实现 `'none'`；系统通知与重复提醒后置。
    - **生命周期**：删除画布上的 widget 节点只删引用，不删 widget 文件；duplicate / 粘贴会 **克隆** widget 文件并重映射 `widgetId`。内容编辑的撤销由 **per-widget undo 栈**承担，与画布布局 undo 分离（焦点在 widget 内时 `Cmd+Z` 路由到 widget）。
    - **Checklist 迁移**：旧版 `type: "card"` + `data.type: "checklist"` 在 `loadCanvas` 时懒迁移为 widget；标签 key 从 `note_*` 同步为 `widget_*`。
  - **图片卡片**：支持拖拽上传、粘贴、或从文件选择器导入图片。导入时按图片自然宽高自动计算卡片尺寸，并生成轻量缩略图；画布态优先显示缩略图，聚焦模式下懒加载原图。支持图片替换二次确认、缺失图片重试、标题重命名和标签管理。
  - **本地文件卡片 (Asset)**：支持从文件选择器、拖拽和粘贴导入本地文件，文件内容保存到 `attachments/`。导入流程优先使用原生路径拷贝或本地 HTTP 流式上传，避免大文件走 data URL；保留 25 MB data URL 限制仅作为 legacy 路径。画布态以预览为主：视频 poster、音频 waveform、图片缩略图、PDF/普通文件纸张图标、文本/JSON 摘要、压缩包条目摘要；文件名、大小、时长、路径等细节进入 hover 信息面板。FocusedView 中视频/音频可播放，图片、文本和 PDF 可预览，普通文件提供 `Open file`。支持替换文件、在 Finder 中显示、标题重命名和标签管理。PDF 已有基础内嵌预览，但页面级缩略图、页码导航和批注仍属后续增强。
  - **录音卡片 (Recording)**：支持通过创建菜单或画布右键启动麦克风录音。录音弹窗自动请求权限并展示实时 waveform 与计时，停止后以用户可读的 `recording-N.<ext>` 作为显示文件名，实际音频通过统一附件链路保存到 `attachments/audio_<id>.<ext>`，并生成 duration / waveform / stream URL。Recording 在画布上以语音备忘录样式展示，可直接播放、暂停、重命名、标记标签、改变颜色、锁定和删除；它可以进入 Group/Folder，但当前不进入 FocusedView。
  - **链接卡片 (Link)**：支持从创建菜单输入 URL，或粘贴/拖拽 URL 到画布后自动创建 Link 节点。系统通过本地 HTTP 服务器进行链接预览（unfurling），抓取网页标题、描述、站点名、favicon/image 元数据；画布 UI 展示富媒体卡片样式，支持打开链接、复制 URL、重新抓取预览和编辑 URL。URL 创建路径只接受安全的 http(s) 链接，打开外部链接时限制为 http/https/mailto。
  - **便签 (Sticky Note)**：轻量级的彩色便签，支持快速记录短文本。可自由调整大小，提供多种预设颜色。便签默认可拖拽；普通单击进入原地编辑，`Enter` 可对已选中便签启动编辑，失焦后自动保存。便签以纯文本写入 manifest，粘贴时剥离富文本格式；装饰采用 CSS pushpin，pushpin 渐变会根据便签颜色自动派生。便签**不支持**聚焦放大模式（FocusedView），所有编辑均在画布上原地完成。
- **卡片通用能力**：
  - **画布预览渲染**：普通文本卡片在画布态（非聚焦态）优先渲染 sidecar 中缓存的 `previewHtml` / `previewExcerpt`；legacy Markdown 卡片通过 **markdown-it** 将正文渲染为安全的 HTML 预览，并经 **DOMPurify** 清理后展示。预览层仅渲染摘要级别内容（标题、段落、列表、代码块等），不挂载完整的编辑器实例，保证首屏性能。Checklist widget 在画布上保持独立的结构化 items 交互（数据在 `widgetStore`）。
  - **自由调整大小 (Resize)**：所有卡片均支持拖拽边角/边缘来调整宽高，不再固定为 350×450。调整时保持内容自适应重排。
  - **复制/粘贴 / 剪切 / 重复**：支持 `Cmd/Ctrl+C`、`Cmd/Ctrl+V`、`Cmd/Ctrl+X`、`Cmd/Ctrl+D`；复制时保留选中集合内部的连线，粘贴和重复会分配新的 `nodeId` 并保持 parent / extent 约束。**Widget 额外克隆内容文件**并重映射 `widgetId`，避免多个节点共享同一 widget 文件。
  - **聚焦入口约定**：普通单击 Card / Image / Asset / Link / Checklist widget 进入聚焦模式（FocusedView），已选中节点按 `Enter` 也可进入；Checklist 仍可在画布上直接勾选和添加条目。Pomodoro / Reminder 以画布内交互为主；Recording 与 Sticky 不进入 FocusedView。
  - **创建流程**：底部 `ViewSwitcher` 右侧 `+` 是主创建入口，常用区提供 Note / Sticky / Link / Image，More 区提供 **Checklist / Pomodoro / Reminder** / Folder / Group / File / Recording，并提供 Markdown 导入和文库笔记入口；画布右键菜单提供同一套创建能力，并以右键位置作为新节点锚点。Image / File 会先打开系统文件选择器；Link 会打开 URL 表单；Recording 会打开麦克风录音弹窗；创建 widget 时先 RPC 写入 widget 文件再放置节点。

### 2.3 沉浸式聚焦模式 (Focused View / Modal Expansion)

- **功能描述**：当用户需要深度阅读、编辑或预览某一张卡片时，提供无干扰的阅读/编辑环境。聚焦模式下，长文本/文档类卡片使用 **BlockNote 块编辑器**进行 Notion 风格的所见即所得编辑；图片卡片进入大图浏览模式；Checklist widget 进入结构化列表编辑模式（数据写 `widgetStore`）；Asset 根据文件类型进入媒体播放器、图片/PDF/文本预览或文件详情视图；Link 进入链接详情/URL 编辑视图。
- **交互逻辑**：
  - 普通单击可聚焦节点、已选中节点按 `Enter`，或右键菜单 `Open Focused` 进入聚焦模式。全屏 shell 以源卡片屏幕矩形为起点 **morph 放大**到主视图（FLIP 风格：`transformOrigin` 取卡片中心，scale 从卡片相对视口比例过渡到 1）；退出时反向收缩。背景画布被半透明遮罩覆盖。点击遮罩、返回按钮或按 `Escape` 退回画布。
  - BlockNote 与 note 加载态共用 `NoteEditorLoading` 占位，避免聚焦闪白。
  - **不可聚焦的节点类型**：Sticky（便签）不支持聚焦模式，普通单击进入原地编辑；Recording 当前不进入 FocusedView，在画布卡片上直接播放和管理；Pomodoro / Reminder 以画布内控件为主。

### 2.4 节点连线 (Edges / Connections)

- **功能描述**：卡片之间可以建立有向连线，表达知识的关联、依赖或流转关系。
- **交互逻辑**：
  - 鼠标悬停卡片边缘出现连接点 (Handle)，从连接点拖拽到另一卡片即可建立连线。
  - 每个可连线节点提供四个方向（上/右/下/左）的连接点；连接模式为 loose，拖拽半径内命中目标 handle 即可连接。
  - 连线使用自定义 `labeledEdge`，默认 `bezier` 曲线，可在右键菜单中切换 `bezier` / `smoothstep`，并支持 `animated` 流动动画。
  - 连线可添加文本标签，用于标注关系类型；双击 label 或右键 `Edit Label` 可行内编辑。
  - **连线颜色**：右键菜单 `Cycle Color` 在默认色与红/橙/绿/蓝/紫之间循环，颜色写入 `edge.data.color` 并随 manifest 持久化；选中态仍以加粗描边表达。
  - **浮动端点与连接预览**：正式边和拖拽中的 `ConnectionPreviewLine` 都会根据源/目标节点相对位置计算"面向对方"的一侧作为端点，减少固定 handle 带来的绕路和折返。释放时若命中目标卡片的 Handle，则建立正式 Edge；若未命中，则预览线消失，不创建无效连接。
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
  - **排斥与碰撞**：拖拽单个内容节点或 Folder 时，与邻近顶层内容节点存在实时 gentle repulsion（柔和排斥）机制。被推开的节点会基于拖拽起点反复求解，随压力消失回流，避免级联漂移；Group / Folder / locked 节点作为不可移动障碍，子节点不单独参与求解。悬停到 Group 或 Folder drop target 时暂停排斥并恢复已推开节点，避免为即将被收纳的节点腾出无意义空间。同时提供**碰撞检测与放置解析**能力：释放节点时若检测到与 Group 区域重叠，系统会自动判断是"纳入 Group"还是"放在 Group 旁边"，确保放置意图明确。

#### 2.5.2 Folder 堆叠式文件夹 (Folder Stack)

- **功能描述**：在二维画布上引入第三个维度（Z轴层级）。Folder 是**内容集合 / 资料夹**，用于把多个相关内容节点收纳为一个视觉上的"堆叠实体"，子节点**隐藏**。它不是万能容器，也不是可自由布局的子画布。
- **交互逻辑**：
  - **外观**：在画布上表现为一个带有标签的堆叠卡片组（如演示中的 "3 items - The really great ideas..."）。
  - **封面渲染原则**：Folder 封面只表达摘要，不渲染完整的内部小画布。封面信息优先级为：标题 / item 数量 / 主要类型分布 / 最近的 2–4 个代表性缩略图或类型图标。没有图片时使用类型图标组合和数量文案兜底，避免每新增一种节点类型都重写封面布局。
  - **进入图层 (Drill-down)**：普通单击 Folder、已选中 Folder 按 `Enter`，或通过右键菜单 `Open` 触发**隔离层模式**。
    - 背景画布整体变暗或模糊（失去焦点）。
    - 文件夹内的条目从堆叠状态平滑展开到临时图层。当前实现为 **bottom-up waterfall** 自动排布（非横向 strip / 固定 grid）：最多约五列从 Folder 上方中心向上生长，宽内容自动减列，保留各子项自然尺寸；封面使用动态缩略图槽位摘要。排列顺序按 `children` 数组索引（拖入先后），**不**提供自由拖拽排序，因此不额外持久化 Folder 内部坐标。
      - 在此模式下，画布上的其他非同组元素不可见或不可交互。
  - **退出图层**：点击背景空白处或返回按钮，展开的卡片平滑收缩回堆叠状态，背景画布恢复明亮和可交互状态。
  - **允许收纳的节点类型**：Folder 可以收纳 `Card` / `Widget`（checklist / pomodoro / reminder）/ `Image` / `Asset` / `Link` / `Recording`。这些类型都被视为"内容条目"，可在 Folder 展开层中被浏览、聚焦、播放或编辑。
  - **不允许收纳的节点类型**：Folder 不收纳 `Folder` / `Group` / `Sticky`。`Folder` 嵌套会把资料夹变成递归信息架构；`Group` 带空间布局语义；`Sticky` 是画布上的临时注释，默认保留在画布层。若未来需要便签归档，应作为独立功能评估，不改变 Folder 的基本定位。
  - **成员来源**：Folder 的成员通过以下方式产生：
    1. **在 Folder 内直接新建**：在 Folder drill-down 视图中通过顶部工具栏或右键菜单的 `New Card` 新建卡片，直接追加到该 Folder 的 `children` 数组。
    2. **从画布拖入**：将允许收纳的内容节点拖到 Folder 上，节点从当前画布移除并写入该 Folder 的 `data.children`。若节点带有 Edge，当前策略会阻止/提示用户先断开连线或清理相关 Edge；需要保留外部关系时，应先连接到 Folder 封面节点。
  - **取回到主画布**：drill-down 视图中选中子卡片后，可通过顶部工具栏的 ↗ `Extract to Canvas` 按钮或右键菜单将该卡片作为新的独立画布节点放回 Folder 邻近区域。**M5 之后 Folder Card 子节点本身已拥有独立 `noteId` 和 note record（sidecar 或 legacy `.md`）**，Extract 动作仅是把 manifest 中的 `children` 引用提升为顶层节点并分配新的 `nodeId`，不再涉及内容文件创建；同一 `noteId` 可在 Extract 前后被其他画布共用。
  - **Extract 可发现性**：为降低 `Extract to Canvas` 被用户忽略的风险（仅藏在右键菜单中发现性不足），drill-down 视图顶部工具栏需提供一个显式的 ↗ `Extract to Canvas` 按钮。当用户在 drill-down 中选中一张或多张子卡片时，该按钮高亮可用；未选中时置灰。此按钮与右键菜单中的 `Extract to Canvas` 行为一致。
  - **Folder 内操作边界（MVP）**：支持在 drill-down 视图中浏览和聚焦子内容；不支持自由拖拽改变顺序，也不支持跨 Folder 边界直接建立子卡片连线。后续若需要自由布局，应升级为独立的 Sub-canvas / View 模型，单独保存 `nodes + edges + viewport`，而不是继续扩展 `data.children`。
  - **适用场景**：归档收纳、减少画布视觉噪音。空间布局、看板分区和关系可视化继续由 Group / Canvas View 承担。

### 2.6 右键菜单 / Context Menu

- **功能描述**：右键菜单是画布上的高频操作入口，避免用户频繁依赖顶部工具栏或记忆快捷键。
- **交互逻辑**：
  - **画布空白处右键**：提供新建（`note` / `checklist` / `pomodoro` / `reminder` / `sticky` / `image` / `link` / `folder` / `group` / `file` / `recording`）、粘贴、重置缩放到 100%、导入 Markdown、导出当前画布为 Markdown 等操作。
  - **卡片上右键**：提供聚焦打开、复制、Copy as Markdown（标题 + 正文写入剪贴板）、改颜色、编辑标签、锁定/解锁、移到笔记库、导出为 Markdown、删除等操作；"永久删除内容"属于显式二次确认的破坏性动作，不与普通删节点合并。
  - **Widget / Sticky / Image / Asset / Link / Recording / Group / Folder 右键**：根据节点类型提供对应能力，所有可拖拽节点的菜单中都包含 `Lock` / `Unlock` 项，锁定后该节点禁用拖拽、连线和删除，右上角显示锁定徽章；解锁后恢复默认行为。Widget 删除只移除画布引用。
  - **多选右键**：在选中集合内右键时显示批量菜单，支持 Duplicate、Group、Change Color、Edit Tags、Lock/Unlock、Move to View、Copy、Delete。批量复制会保留选中集合内部连线；含 widget 时会 clone 内容文件。Move to View 会先读取目标 manifest，复制节点/内部边并从当前画布移除。
  - **媒体节点右键**：Image 支持 Replace image、Copy image address、Reveal in Finder、Rename；Asset 支持 Reveal in Finder、Replace file、Rename；Link 支持 Open link、Copy URL、Refetch preview、Edit URL；Recording 支持 Reveal in Finder、Rename。
  - **Folder 上右键**：提供打开 Folder、重命名显示标签、在该 Folder 内新建内容、锁定/解锁、删除等操作。**注**：M5 之后 Folder 子卡片是独立 note / widget record，不再对应系统目录，因此不提供「在系统文件管理器中显示目录」入口；如需查看原始数据，可在 `content/.ghostboard/blocknote/`、`content/*.md` 或 `.ghostboard/widgets/` 按 id 查找。Folder 展开层中的子项菜单需额外提供 `Extract to Canvas`。
  - **连线上右键**：提供编辑标签、切换动画、切换曲线/折线、`Cycle Color` 循环切换连线颜色、删除连线等操作。

### 2.7 多画布视图 (Multi-Canvas Views) ✅

- **功能描述**：同一个 workspace 中可以创建多个独立的画布视图。同一个 note record 可以通过 `noteId` 在不同画布上多次出现（实例 `nodeId` 不同），实现同一知识库的多视角组织。
- **交互逻辑**：
  - **底部切换器**：画布底部居中显示一个浮动的 `ViewSwitcher` 面板，包含当前画布名称、节点计数、导出按钮和创建按钮。
  - **视口 chrome**：画布右下角 `CanvasViewportChrome` 将 minimap 与缩放控件合成一块 frosted 面板；设置中可关闭 minimap（仅保留缩放条）。
  - **切换画布**：点击切换器展开画布列表，点击任一画布立即切换。切换前会先保存当前画布；若保存失败则中止切换并提示，避免未保存变更被清空。切换成功后清空节点/边、聚焦模式、Folder drill-down、undo/redo 历史栈并加载目标画布；剪贴板保留，支持跨画布复制粘贴。
  - **Viewport 持久化**：每个画布视图的 ReactFlow viewport（`x` / `y` / `zoom`）随 manifest 一起持久化到 `.canvas.json` 的 `viewport` 字段。切换画布时恢复目标画布的上次 viewport；刷新页面或重启应用后 viewport 也会恢复。搜索定位、聚焦定位等程序化相机移动会短暂抑制 viewport 持久化，避免把临时跳转写成用户的长期浏览位置。
  - **活跃画布持久化**：用户当前选中的画布 `activeViewId` 持久化到 `workspace.json`，重启应用后自动恢复到上次使用的画布。
  - **新建画布**：通过切换器右侧的 `+` 按钮触发子菜单，提供两种创建方式：① **空白画布**（沿用原有 `handleCreate` 流程，自动命名为 `Canvas N` 并切换过去）；② **选择模板…**（跳转 `/templates` 路由页浏览模板库，选中模板后在只读 ReactFlow 预览页确认后基于模板创建新画布，自动为模板中的每张 Card 生成新 `noteId` 和初始 note record，首次聚焦编辑后迁移为 BlockNote sidecar；legacy checklist 在加载时懒迁移为 widget）。
  - **重命名**：在弹出菜单中点击铅笔图标进入行内编辑模式，`Enter` 确认、`Escape` 取消。名称为空、超过 80 字符或与其他画布重名时阻止提交并显示行内错误。
  - **删除画布**：在弹出菜单中点击删除图标。至少保留一个画布，删除最后一个时操作被拒绝。删除当前画布时自动切换到列表中的第一个画布。
  - **恢复画布**：删除画布后进入 workspace trash，并通过 toast 提供 Undo 恢复；设置页的 Workspace 面板也可恢复 trash 中的画布。
  - **数据隔离**：每个画布对应独立的 `.ghostboard/views/{viewId}.canvas.json` manifest 文件。Card 以 `noteId` 引用 note record；Widget 以 `widgetId` 引用 `.ghostboard/widgets/` 文件，均不随单个画布整份复制内容文件。
- **限制（当前版本）**：
  - 不支持跨画布拖拽节点。
  - 不支持画布间的 noteId / widgetId 引用关系可视化。

### 2.8 搜索 (Search) ✅ MVP / ⚠️ 覆盖范围待补

- **功能描述**：全局搜索当前 workspace 中的画布可定位内容，包括各画布视图、顶层 Card/Sticky/Folder/Group/Image/Asset/Recording/Link、Edge label，以及这些节点引用的 Markdown / BlockNote 正文。
- **交互逻辑**：
  - 通过 `Cmd/Ctrl+K`、应用菜单，或在画布空闲时直接输入任意可打印字符唤起 `SearchDialog` 并预填首字符。
  - 输入关键词后 debounce 调用 Bun 侧 `searchCanvas`；当前画布内存状态会与后端结果合并，降低未落盘编辑被漏搜的概率。
  - 点击搜索结果项，若命中当前画布节点或连线，则选中并平移缩放至对应位置；若命中其他画布，则先安全切换 `activeViewId`，待目标 manifest hydrate 后再定位。定位相机移动不会覆盖用户持久化 viewport。
  - **排序规则（MVP）**：标题/名称匹配优先于文件名、URL、标签、正文等字段匹配，再按基础相关性评分排序。后续可引入更完整的字段权重与索引。
  - **类型筛选 chips**：搜索框下方提供 `All / Notes / Folders / Links / Images` 切换按钮，仅在前端对 `result.kind` 做客户端过滤，不重发查询。`All` 会显示 Asset / Recording / Edge / View 等其他结果；`Notes` 同时覆盖 `note` 与 `card` 两种 kind。
  - **搜索历史**：查询输入为空时显示「Recent searches」分组，列出 `localStorage` 中保存的最近 8 条查询（`ghostboard:v1:search-history` 键，兼容旧键 `ghostboard:search-history`），点击回填到输入框；提供 `Clear` 一键清空与单条删除入口。历史只在用户实际选中结果时落盘，避免误触污染。
  - **Detached notes 的可见性**：用户主动从画布分离的笔记 (`detachNoteFromCanvas`) 会变成 **detached notes**（`data.detached: true`，`position: {x:0,y:0}` 占位），不在画布上渲染，但仍作为 manifest 中的节点进入搜索。画布侧提供游离笔记管理入口，可将 detached notes 拖回画布并赋予真实坐标。
- **当前限制 / 待办**：
  - 后端搜索目前主要索引 manifest 顶层节点；Folder `children` 中的 Card/Widget/Asset/Link/Image/Recording 仍可能漏搜，需作为 P0 补齐。
  - 纯粹存在于 `content/*.md`、`content/.ghostboard/blocknote/*.json` 或 `.ghostboard/widgets/*.json`、但没有任何 manifest 引用的内容不会作为一等搜索结果返回；它们目前通过设置页 Unlinked Files / cleanup 暴露，而不是通过搜索面板暴露。
  - 早期规划中的“输入时实时高亮画布匹配/未匹配节点变淡”尚未实现。
  - 对未放置内容提供“一键放回当前画布”的搜索结果操作尚未实现；当前放回路径主要是 `DetachedNotesSidebar`。

### 2.9 撤销/重做 (Undo / Redo)

- **功能描述**：对画布上的结构性与离散操作（移动、创建、删除、Resize、拖入文件夹、节点级提交等）提供撤销和重做能力。正文长文编辑不进入画布撤销栈，而是由 BlockNote（底层 ProseMirror）自身历史栈处理；**Widget 内容编辑**（checklist items、番茄钟状态等）由 `widgetStore` 的 **per-widget undo 栈**处理，不写入画布快照；标题输入框使用浏览器原生 input undo。
- **交互逻辑**：
  - 非编辑态下，`Cmd+Z` 撤销，`Cmd+Shift+Z` 重做。若编辑焦点在某个 widget 内，快捷键优先路由到该 widget 的 undo/redo；若焦点位于 `input` / `textarea` / `contenteditable` 中，则交给当前编辑控件；否则由画布 store 接管。
  - 维护一个画布快照历史栈（Snapshot History Stack），每次离散画布操作前保存当前 `{nodes, edges}` 快照；当前实现不记录 diff / command。Widget 内容栈与画布栈互不感知。
  - **栈深度上限**：画布与每个 widget 各自最多保留 **50** 步，超出后丢弃最早记录。
  - **撤销与持久化的一致性策略**：撤销/重做仅回滚内存状态，不直接触发磁盘反向写入。下一次 debounce 到期时，以当前内存状态为准覆盖磁盘文件（manifest 或 widget JSON）。
  - **生命周期**：撤销栈仅存在于内存中，关闭应用或切换 workspace 后清空，不做持久化。

### 2.10 键盘快捷键体系 (Keyboard Shortcuts)

| macOS                   | Windows / Linux           | 行为                                                                            |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `Cmd+Z` / `Cmd+Shift+Z` | `Ctrl+Z` / `Ctrl+Shift+Z` | 焦点在 widget 内 → widget undo；焦点在 input/contenteditable → 编辑控件（BlockNote / 浏览器）；否则画布快照栈 |
| `Cmd+C` / `Cmd+X` / `Cmd+V` | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | 复制 / 剪切 / 粘贴选中节点与其内部连线                                                                 |
| `Cmd+D`                 | `Ctrl+D`                  | 重复选中节点                                                                     |
| `Cmd+G` / `Cmd+Shift+G` | `Ctrl+G` / `Ctrl+Shift+G` | 将选中节点创建为 Group / 取消 Group                                             |
| `Delete` / `Backspace`  | `Delete` / `Backspace`    | 从当前画布移除选中的节点（不删除 .md 内容文件；永久删除需通过右键菜单二次确认） |
| `Cmd+K`                 | `Ctrl+K`                  | 打开搜索，命中后 fitView 到画布节点                                             |
| 任意可打印字符          | 任意可打印字符             | 画布空闲且非编辑态时打开搜索并预填该字符                                        |
| `Cmd+A` / `Cmd+Shift+A` | `Ctrl+A` / `Ctrl+Shift+A` | 全选当前上下文中的节点 / 清空选择                                                |
| `Cmd+N`                 | `Ctrl+N`                  | 打开新建卡片菜单                                                                |
| `Cmd++` / `Cmd+-` / `Cmd+0` | `Ctrl++` / `Ctrl+-` / `Ctrl+0` | 放大 / 缩小 / 重置缩放到 100%                                                   |
| `Arrow` / `Shift+Arrow` | `Arrow` / `Shift+Arrow`   | 按方向选择邻近节点；`Shift` 扩展选择，目标不在视口时平滑居中                    |
| `Enter`                 | `Enter`                   | 打开选中卡片的聚焦模式                                                          |
| `Escape`                | `Escape`                  | 关闭聚焦/文件夹视图、退出搜索/菜单                                              |

### 2.11 交互状态机 (Interaction State Machine)

| 状态                | 进入条件                                                                               | 退出条件                                 | 约束                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`              | 默认状态；点击空白处；完成操作后回落                                                   | 选中节点、开始拖拽、打开菜单、按下快捷键 | 允许平移、缩放、框选；普通单击可聚焦节点会直接进入 `focused` / `folder-drill-down`，普通单击 Sticky 进入 `inline-editing`                                                                            |
| `selected`          | 框选、`Shift/Cmd/Ctrl+Click`、方向键导航、右键单选或多选集合右键                         | 点击空白、`Escape`、进入其他状态         | 允许批量拖拽、删除、复制/剪切/粘贴、重复、分组、锁定/解锁、移动到其他画布。**Checklist widget 例外**：在 `selected` 状态下允许直接勾选 checkbox 和在列表末尾添加条目（局部交互，写 widgetStore） |
| `marquee-selecting` | 在空白处左键拖拽                                                                       | 鼠标释放                                 | 桌面端启用；与空格平移模式、输入编辑态互斥                                                                                                                                                           |
| `dragging`          | 拖拽一个或多个已选节点                                                                 | 鼠标释放或取消                           | 暂停双击判定，避免误触发编辑                                                                                                                                                                         |
| `inline-editing`    | 普通单击 Sticky、选中 Sticky 后按 `Enter`、Group label 编辑、资源/录音标题重命名          | `Escape`、提交、失焦或点击其他区域       | 编辑期间禁用画布级快捷键；Sticky 使用纯文本 textarea，媒体标题使用行内 input。Card/Image/Asset/Link 的深度编辑进入 `focused`                                                                         |
| `focused`           | 普通单击 Card/Image/Asset/Link；选中后按 `Enter`；右键菜单 `Open Focused`               | 返回按钮、点击遮罩、`Escape`             | 背景画布不可交互；Sticky / Recording 不可进入此状态                                                                                                                                                  |
| `folder-drill-down` | 普通单击 Folder；选中 Folder 后按 `Enter`；右键菜单 `Open`                             | 返回按钮、背景空白、`Escape`             | 仅当前 Folder 内容可交互；背景画布冻结                                                                                                                                                               |
| `connecting`        | 从 Handle 开始拖出连线                                                                 | 连接成功、取消                           | 禁止进入编辑与聚焦                                                                                                                                                                                   |
| `recording-capturing` | 创建 Recording 时打开麦克风弹窗                                                       | 停止保存、取消、权限失败后关闭           | 背景画布暂不交互；录音保存为附件后创建 `recording` 节点                                                                                                                                                |

**状态优先级规则**：`dragging` 与 `connecting` 高于双击/编辑判定；`focused` 和 `folder-drill-down` 为全屏模态上下文，会冻结背景画布；`inline-editing` 期间不响应框选与节点拖拽。

### 2.12 笔记库弹窗 (Library Popup) ✅

- **入口**：画布左上角 `CanvasToolbar` 中的 Library 图标，点击后弹出覆盖式弹窗。`CanvasToolbar` 同时集中承载标签筛选入口和设置入口，取代分散的左上角按钮。
- **职责**：浏览当前画布上的所有 `Card` / `Image` / `Asset` / `Link`（按 Folder 分组 + 未分组 + 游离笔记），点击卡片即关闭弹窗 → `fitView` 飞到目标节点 → 自动打开 FocusedView。
- **能力**：支持搜索筛选、排序切换（最近编辑/名称/创建时间）、`Escape` / 点击遮罩关闭。
- **角色边界**：与既有入口互补：
  - `Cmd/Ctrl+K` `SearchDialog`：关键词驱动，「我知道我要什么」，跨画布跳转。
  - 笔记库弹窗：浏览驱动，「我想看看我有什么」，仅限当前画布。
  - `DetachedNotesSidebar`：游离笔记的快捷管理与拖回画布（可从底部创建菜单的「文库笔记」入口打开）。

#### Detached notes（游离笔记池）

- **概念**：detached notes 是**有正式 `.md` 文件 + `noteId`、但尚未放置到任何画布**的笔记。它们存在于笔记库中永远可被找回。
- **数据形态**：`position: {x:0, y:0}` 占位，`data.detached: true` 标记；不在画布上渲染。
- **创建路径**：画布上右键菜单 > 「移出到笔记库」 → `detachNoteFromCanvas()` 保留 `.md` 和 `noteId`，但清理画布实例坐标和 edges。
- **放回画布**：笔记库弹窗的「游离笔记」分组中，点击 detached 卡片会弹出 toast 提示 +「放到画布」按钮，点击后 `pinNoteToCanvas()` 将笔记放到视口中心并打开 FocusedView。画布侧 `CreateMenu` 也提供「文库笔记 / Library Note」入口打开 `DetachedNotesSidebar` 进行拖拽放回。
- **搜索可见性**：detached notes 进入全局搜索；笔记库弹窗里在「游离笔记」分组单独列出（首版仅 `card` / `image`，与 Sidebar 行为对齐）。

### 2.13 标签管理 (Tag Management) ✅

- **功能描述**：为卡片、图片、附件、链接等节点提供标签标注能力，通过标签对画布内容进行分类和快速筛选。
- **标签模型**：
  - 每个节点有一个**主标签（Primary Tag）**：带颜色背景的标签，一个节点最多一个。
  - 每个节点可有**多个次要标签（Secondary Tags）**：灰色/半透明标签，用于补充分类。
  - 标签数据存储在 `.ghostboard/node-metadata.json` 中，以 `noteId`（Card）或 `nodeId`（非 Card 节点）为键。Card 节点的标签通过 `noteId` 跨画布共享；Image/Asset/Link/Sticky 节点的标签与画布实例绑定。
  - **约束**：每节点最多 8 个标签，单个标签最长 32 字符。
- **标签编辑**：
  - **右键菜单入口**：在 Card/Image/Asset/Link/Sticky 节点上右键 → `Edit Tags`，弹出 `TagEditor` 弹窗。
  - **TagEditor**：基于 `@base-ui/react` Popover 实现，提供标签输入框、颜色选择器、自动补全（基于 workspace 已有标签列表）、添加/删除/修改标签。
  - **CardNode 画布态**：卡片标题下方渲染 `NodeTagChips`，展示主标签（带颜色）和次要标签（灰色）。
  - **Image/Asset/Link/Sticky/Recording 节点**：标题区域或卡片底部同样展示 `NodeTagChips`。
  - 标签修改通过 `useSetNodeMetadata` mutation 乐观更新 React Query 缓存，失败时回滚。
- **标签侧边栏 (TagSidebar)**：
  - **入口**：画布左上角 `CanvasToolbar` 中的 Tag 图标，点击后滑出 `TagSidebar` 面板；有活跃筛选时图标显示小圆点。
  - **内容**：列出 workspace 中所有标签，按使用次数降序排列，每个标签显示节点计数。
  - **筛选**：点击标签设置 `activeTagFilter`，画布上不携带该标签的卡片自动变暗（dimmed），仅突出匹配的卡片。点击已选标签或「Clear filter」按钮清除筛选。
  - **重命名**：点击铅笔图标进入行内编辑模式，调用 `rpcRenameTag` 重命名 workspace 中所有使用该标签的节点元数据。
  - **删除**：点击删除图标，弹出 `DeleteTagConfirmDialog` 二次确认，调用 `rpcDeleteTag` 从所有节点元数据中移除该标签。
  - 标签变更后自动刷新 `['tags']` 查询缓存，侧边栏计数即时更新。
- **适用节点类型**：`card`、`image`、`asset`、`link`、`sticky`、`recording`。`folder` 和 `group` 暂不支持标签。

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
| 富文本编辑 | BlockNote (ProseMirror)       |
| Markdown   | markdown-it + DOMPurify       |
| 构建工具   | Vite + Bun                    |
| 桌面运行时 | Electrobun                    |
| 国际化     | Paraglide / Inlang（en / zh） |

| 状态管理 | Zustand + TanStack React Query |

> 渲染引擎、连续缩放渲染、FocusedView morph、Folder waterfall、性能预算与降级策略等技术实现细节请参阅 [技术规范文档](./tech-spec.md)。

---

## 5. Local-First 数据架构

### 5.1 核心原则

1. **本地文件即数据源（Local Files as Source of Truth）**—— 每张 **Card 类型**卡片对应一个以 `noteId` 标识的 note record。当前优先使用 BlockNote JSON sidecar（`content/.ghostboard/blocknote/<noteId>.json`）作为内容级 canonical source；legacy/imported `.md` 文件仍会被发现、读取、导出和迁移，但新编辑保存不再维护同步 Markdown 副本。**Widget** 内容以 `widgetId` 标识，canonical source 为 `.ghostboard/widgets/<widgetId>.json`。画布布局用独立的 manifest 文件管理。**Folder 的 Card 子节点与顶层 Card 对等**（独立 `noteId`）；**Widget 子节点与顶层 Widget 对等**（独立 `widgetId`）。Sticky 内容内嵌在 manifest `data.content`；Image / Asset / Recording 走 `attachments/`；Link 走 URL + unfurl 元数据。

   > **早期版本历史**：MVP 初版 Folder children 是以 `{ id, data: {...content inline} }` 内嵌在 manifest 中的「legacy」形式。它们会在 `loadCanvas` 加载时被自动迁移：分配 `noteId`，下次 `saveManifest` 会迁到独立 note record。Checklist 曾以 Card + `data.type: "checklist"` 存在，现已懒迁移为 Widget。
2. **内容与布局解耦** —— 内容级属性（标题、颜色、创建时间、BlockNote blocks / preview、widget items/timer）存 sidecar / widget JSON 或 legacy frontmatter；视图级属性（位置、大小、层级）存 manifest。
3. **`noteId` / `widgetId` ≠ `nodeId`** —— 内容实体 ID 和画布实例 ID 分离；同一内容可在多画布出现。Widget 的 duplicate/粘贴会克隆文件（不共享 widgetId）。
4. **删除实例不等于删除内容** —— 删除顶层 `node` 只影响当前画布实例；当某个 `noteId` / `widgetId` 不再被任何画布引用时，内容文件保留，直到用户显式永久删除或 Unlinked Files 清理。删除 Folder 时，其 children 会被转换为 detached 节点，不随 Folder 一起丢失；单独删除 Folder child 时，Card child 的 note record 清理策略与顶层一致，Widget 默认只删引用，Image/Asset/Recording 仍遵循附件 + manifest 引用模式，Link 只清理 URL 元数据。

### 5.2 配置文件与偏好

#### 当前实现：Workspace settings ✅

当前版本已有默认 workspace、设置弹窗内的 Workspace 面板、以及"选择下次启动 workspace"能力；完整的 recent list / 欢迎页 / 无重启热切换还未完成。用户偏好分为 workspace 内设置、app-level workspace 指针和 app-level 密钥三类。

Workspace 内设置存放在当前 workspace：

```
workspace/
└── .ghostboard/
    └── settings.json
```

```json
{
  "theme": "system",
  "locale": "zh",
  "fontFamily": "system",
  "canvasBackground": "default",
  "canvasShowMinimap": true,
  "canvasSnapToGrid": true,
  "autoSaveInterval": 800,
  "aiEnabled": false,
  "aiProvider": "openai",
  "aiModel": "gpt-4.1-mini",
  "aiBaseUrl": ""
}
```

- `theme` / `locale` / 字体 / **画布背景**（`default` | `paper` | `cream` | `mono`，设置面板 swatch 选择）/ **minimap 开关**（`canvasShowMinimap`）/ 网格吸附 / 自动保存间隔 / AI 模型配置通过 `CanvasToolbar` 的 Settings 图标打开 in-window `SettingsDialog` 保存，并向主画布即时推送更新。
- 设置弹窗包含 General / Workspace / AI / Shortcuts / About 五个 section。General 含外观与画布 chrome；Workspace 面板承载当前路径、打开 workspace 文件夹、选择下次启动 workspace、导出 workspace archive、Trash 恢复/清空、Unlinked Files 扫描/删除。
- AI API key 不写入 `.ghostboard/settings.json`，而是保存在 app-level `ai-credentials.json`。
- 当前 workspace 路径不可能放进 workspace 内设置，因此单独保存在 app-level `userprefs.json`：

```json
{
  "workspacePath": "/Users/me/Documents/work-notes"
}
```

#### 目标设计：App config（多 Workspace 前置）❌ 待实现

多 workspace 管理需要把当前 `userprefs.json` 演进为更完整的应用级配置，建议存放在 app `userData` 目录下：

```
<userData>/
├── app-config.json
├── userprefs.json
└── ai-credentials.json
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

1. 读取 app-level `app-config.json` / `userprefs.json`
2. 若有 `activeWorkspace` → 直接打开该 workspace
3. 若无（首次启动）→ 显示欢迎页，引导用户创建或选择 workspace 目录
4. 进入 workspace 后 → 读取 `.ghostboard/workspace.json` 与 `.ghostboard/settings.json` → 加载画布

> 当前启动流程是 `loadUserPrefs()` → 若 `workspacePath` 存在则使用它，否则使用 `<userData>/workspace` → `initWorkspace(wsPath)` → `seedFirstRunIfNeeded()` → `loadSettings(wsPath)` → 读取 `.ghostboard/workspace.json` 的 `activeViewId`。设置页切换 workspace 会初始化目标目录并写入 `userprefs.json`，实际切换在重启边界生效。

### 5.3 Workspace 文件系统结构

```
workspace/
├── .ghostboard/                        # 应用元数据（不是用户内容）
│   ├── workspace.json                  # workspace 内视图列表、activeViewId、trash 记录
│   ├── settings.json                   # 主题、语言、字体、画布背景/minimap、自动保存、AI 模型配置
│   ├── node-metadata.json              # 标签元数据（key = noteId / widgetId / nodeId）
│   ├── widgets/                        # 小组件内容 JSON（checklist / pomodoro / reminder）
│   │   └── widget_ab12cd34.json
│   ├── trash/                          # 被软删除的 canvas manifest
│   └── views/                          # 每个画布一个 manifest（widget 仅存引用）
│       ├── default.canvas.json
│       └── roadmap.canvas.json
├── content/                            # 统一 note 内容树
│   ├── who-ghostboard-is-for.md        # legacy / imported Markdown，或按需导出的格式
│   ├── prio-before-launch.md
│   ├── alpha-feedback.md
│   ├── .ghostboard/                    # 内容辅助文件（不污染用户可见目录）
│   │   └── blocknote/                  # BlockNote JSON sidecar 文件，按 noteId 命名
│   │       └── note_a1b2c3d4.json
│   └── great-ideas/                    # 后续迁移目标：文件夹即目录（当前不启用）
│       ├── floating-notes.md
│       └── drop-in-anything.md
└── attachments/                        # 图片、文件、视频、音频附件（类型前缀 + 短 UUID）
    ├── img_a1b2c3d4.png
    ├── img_f1e2d3c4.png                # 图片缩略图或视频 poster
    ├── video_b2c3d4e5.mp4
    ├── audio_c3d4e5f6.m4a              # Recording / audio asset
    └── file_d4e5f6a7.pdf
```

- **单一 note 内容树**：所有 note record 统一由 `noteId` 索引。当前主存储是 `content/.ghostboard/blocknote/<noteId>.json`；legacy/imported Markdown 继续位于 `content/*.md`，并可在下次聚焦编辑时迁移为 sidecar。**M5 之后 Folder Card 子节点与顶层 Card 对等**，manifest 通过 `children[].noteId` 加可选 legacy `file` 引用。示意图中的 `great-ideas/` 子目录仅为远期「文件夹即目录」模型的占位示意，当前不启用。
- **Widget 内容树**：独立于 note，按 `widgetId` 存放在 `.ghostboard/widgets/`；manifest 与 Folder children 只保存引用。
- **Per-view manifest**：每个画布视图独立一个 `.canvas.json`，避免单文件成为写入热点。
- **附件命名**：附件文件名使用 `{kind}_{uuid8}.{ext}` 格式（`img_` / `video_` / `audio_` / `file_`），避免同名冲突。路径统一为 workspace-relative POSIX 路径。Image / Asset / Recording 节点保存原始附件引用；视频/图片可额外保存 `thumbnailFile`，音频/录音可额外保存 `waveform` / `duration`，文本与压缩包可保存 `previewExcerpt` / `archiveSummary`。

### 5.4 Markdown 文件格式（Legacy / Import / Export）

Markdown 不再是 BlockNote 卡片的主存储格式。它仍用于 legacy notes、外部 `.md` 导入和按需导出；当没有 sidecar 时，系统会用 YAML frontmatter + 正文作为一次性导入/恢复来源：

```markdown
---
id: 'note_a1b2c3d4'
title: 'Prio before launch'
displayHint: 'note'
color: '#EAF2B8'
tags: ['Inbox']
createdAt: 2026-03-28T10:00:00Z
updatedAt: 2026-03-31T14:30:00Z
---

## Lingering bugs

Body text stored in BlockNote sidecar (or legacy Markdown body).
```

**`displayHint` 说明**（legacy Markdown / 导出 frontmatter 中的 UI 渲染提示，仅用于 **Card / note**）：

| displayHint | 代码中对应 `data.type` | 含义                   | 画布上的默认渲染                            | 聚焦行为      |
| ----------- | ---------------------- | ---------------------- | ------------------------------------------- | ------------- |
| `note`      | `text`                 | 普通文本笔记（默认值） | 显示标题 + 正文摘要                         | ✅ 可进入聚焦 |
| `image`     | `image`                | 以图片为主（legacy）   | 显示图表/图片内容                           | ✅ 可进入聚焦 |

> **Checklist 不再使用 Card `displayHint`**：待办列表是 **Widget**（`type: "widget"`, `kind: "checklist"`），内容在 `.ghostboard/widgets/`。导出 Markdown 时 checklist widget 会序列化为 GFM 任务列表。磁盘上若仍存在 legacy `displayHint: 'checklist'` 的 Card，加载时会懒迁移为 widget。

> **Sticky / Widget / Asset / Link / Recording 不属于 Card 的 `displayHint` 枚举**：Sticky 内嵌 `data.content`；Widget 用 `widgetId` + `kind`；Asset / Link / Recording 引用附件或 URL 元数据。

> **当前实现说明**：Card 仍使用 `data.type`（`'text'` / `'image'`）作为运行时标识，与 PRD 的 `displayHint: 'note'` 存在命名差异；长期目标是统一字段名。

**frontmatter / sidecar 字段归属原则**：

| 放 sidecar / legacy frontmatter（内容级） | 放 manifest（视图级）                  |
| ----------------------------------------- | -------------------------------------- |
| `id` (noteId)                             | `id` (nodeId)                          |
| `title`、`createdAt`、`updatedAt`         | `position`、`style: { width, height }` |
| `color`（内容默认颜色）                   | z-order（数组顺序）                    |
| `displayHint` / `type`                    | `color`（per-view 视觉覆盖，可选）     |
| BlockNote `blocks`、cached `preview`      | `locked`、`parentId`、`extent`         |

**颜色优先级**（三层回退）：`manifest.data.color`（per-view override）→ sidecar / frontmatter `color`（内容默认）→ 组件默认色板。当同一笔记出现在多个画布中时，每个画布可通过 manifest `color` 独立覆盖颜色，而不影响内容文件本身的默认颜色。**Sticky 例外**：Sticky 无 sidecar / frontmatter，仅走两层回退——`manifest.data.color` → 组件默认色板。

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
        "type": "text"
      }
    },
    {
      "id": "node_w1",
      "type": "widget",
      "position": { "x": 300, "y": 120 },
      "data": {
        "widgetId": "widget_ab12cd34",
        "kind": "checklist"
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
      "data": { "noteId": "note_moat", "type": "text" }
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
              "type": "text"
            }
          },
          {
            "id": "child_2",
            "noteId": "note_def67890",
            "type": "card",
            "data": {
              "noteId": "note_def67890",
              "type": "text"
            }
          },
          {
            "id": "child_3",
            "type": "recording",
            "data": {
              "attachmentFile": "attachments/audio_c3d4e5f6.m4a",
              "duration": 42.3,
              "fileName": "recording-1.m4a",
              "mimeType": "audio/mp4",
              "recordingNumber": 1
            }
          }
        ]
      }
    },
    {
      "id": "node_asset1",
      "type": "asset",
      "position": { "x": 1320, "y": 260 },
      "data": {
        "attachmentFile": "attachments/video_b2c3d4e5.mp4",
        "fileName": "demo-video.mp4",
        "kind": "video",
        "mimeType": "video/mp4",
        "thumbnailFile": "attachments/img_f1e2d3c4.png",
        "title": "Demo video"
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
      "type": "labeledEdge",
      "data": { "color": "blue", "label": "supports", "pathType": "bezier" }
    }
  ]
}
```

**设计说明**：

- 所有字段（`position`、`data`、`style`、`parentId`、`extent`、`source`/`target`、`sourceHandle`/`targetHandle`）均为 React Flow 原生字段，加载时可直接传入 `<ReactFlow nodes={} edges={} />` 无需转换。
- 业务自定义字段（`noteId`、`widgetId`、`file`、`label`、`color`、`children` 等）统一放在 `data` 对象内。
- 节点 `type` 使用 `'card'` / `'widget'` / `'image'` / `'asset'` / `'link'` / `'recording'` / `'sticky'` / `'folder'` / `'group'`，与代码中 `nodeTypes` 一致。
- 节点在数组中的顺序即为 z-order（后面的覆盖前面的）。
- Edge 使用自定义 `labeledEdge`，曲线类型放在 `edge.data.pathType`（默认 `bezier`，可切换 `smoothstep`），label / color / animated 等显示属性也随 `data` 持久化。
- Folder 的 `data.children` 存放被收纳的内容条目；允许的 child 类型为 `card` / `widget` / `image` / `asset` / `link` / `recording`。`folder` / `group` / `sticky` 不进入 Folder。
- Folder 封面上的计数标题（如 `"3 items"`）为运行时根据 `children.length` 派生；封面只渲染摘要缩略图，不渲染内部完整小画布；展开层用 waterfall 自动排布且不持久化坐标。
- Folder `children` 在展开层中只用于浏览、聚焦和 `Extract to Canvas`，不作为独立 Edge 端点；需要对外表达关系时，应连到 Folder 封面节点。
- **Folder Card 子节点的水化与落盘**（M5 ✅）：加载时 `loadCanvas` 按 `noteId` 优先读取 BlockNote sidecar，缺失时回退到可选 legacy `file` 指向的 `.md`；水化回 `title` / `preview` / `content` / `color` 等字段填充到 `data` 中。保存时 `saveManifest` 对 sidecar-backed note 只合并 title/color 等元数据，不重写 blocks 或 Markdown；legacy Markdown note 继续 round-trip `.md`，直到下次聚焦编辑迁移为 sidecar。manifest 保留 `{ id, noteId, type, data: { noteId, type, file? } }` 的薄引用形式（不写正文、不写 preview 元数据）。Legacy 内嵌 children 在加载时自动 stamp 一个 `noteId`，下次 save 时迁到 note record。
- **Folder Widget 子节点**：`{ id, type: "widget", widgetId, data: { widgetId, kind } }`；内容由 `loadWidgets` 批量加载进 `widgetStore`。
- **非 Card 子节点例外**：Folder 中的 Image / Asset / Recording / Link 子节点不分配 `noteId`，不生成 `.md`；Image/Asset/Recording 使用附件指针，Link 使用 URL + unfurl 元数据。
- **Asset / Link / Recording 节点**：Asset 使用 `attachmentFile`、`thumbnailFile`、`waveform`、`mimeType`、`kind`、`previewExcerpt`、`archiveSummary` 等字段描述本地附件；Link 使用 `url`、`title`、`description`、`siteName`、`faviconUrl`、`imageUrl` 等字段描述网页链接；Recording 使用 `attachmentFile`、`fileName`、`mimeType`、`recordingNumber`、`duration`、`waveform` 描述录音。三者可以作为顶层节点，也可以作为 Folder children，长期产品语义为"资料夹中的内容条目"。
- **Viewport 持久化**：`viewport` 字段（`x` / `y` / `zoom`）随 manifest 一起持久化。切换画布时保存当前 viewport 到源 manifest、从目标 manifest 恢复 viewport；应用重启后通过 `hydrate` 回写 ReactFlow，确保用户回到上次浏览位置。搜索定位、聚焦定位、导出临时 fitView 等程序化相机移动会抑制或恢复 viewport，避免污染用户最后浏览位置。

### 5.7 TypeScript 类型定义

> 完整的 TypeScript 类型定义（`NoteFrontmatter`、各节点 Data 接口、`CanvasViewManifest`、`WorkspaceConfig`、`AppConfig` 等）已迁移至 [技术规范文档 §3.2](./tech-spec.md#32-typescript-类型定义)。

### 5.8 读写流程与状态管理

> 读写流程、debounce 策略、原子写入、RPC 协议等技术实现细节请参阅 [技术规范文档 §7](./tech-spec.md#7-数据持久化)。
> 状态管理分层（Zustand + React Query）、canvasStore 结构、undo/redo 机制请参阅 [技术规范文档 §4](./tech-spec.md#4-状态管理)。

### 5.9 导入/导出 (Import / Export)

- **导出**：
  - **Markdown**：单篇笔记导出（卡片右键 →「导出为 Markdown…」）、当前画布批量导出（画布右键 →「导出画布为 Markdown…」）。
    - 导出内容包含 frontmatter + 正文 + 附件收集 + `index.md`；**checklist widget** 会生成 GFM 任务列表，避免静默丢清单。
    - RPC `exportNoteMarkdown` / `exportNotesMarkdown` 已实现，`scope` 支持 `'view'`（当前画布）/ `'all'`（全部画布）/ `'selected'`（自选）。
    - ⚠️ `scope: 'all'` 和 `'selected'` 的 UI 入口尚未实现（见 TODO-23）。
  - **JSON**：导出当前画布的 self-contained JSON（`ghostboard-canvas-export/v1`），直接从内存中的可见 nodes / edges / viewport 生成，并清理运行时 URL、hidden / detached 节点和不可持久化字段。当前实现是导出能力，尚未提供 JSON 导入恢复；widget 完整 records 是否纳入 JSON 导出仍属后续增强（workspace ZIP 已含 `.ghostboard/widgets/`）。
  - **PNG**：导出当前画布的 2x screenshot-style PNG。导出时先临时 `fitView` 全部可见节点、等待浏览器 repaint、隐藏 minimap/controls/panel/attribution，再截图 `.react-flow` 容器，最后恢复导出前 viewport。当前没有 SVG 导出。
- **导入**：
  - 支持通过底部创建菜单或画布右键显式选择多个 Markdown 文件，解析 frontmatter / 标题 / 正文后创建新的 Note 卡片。
  - 支持拖拽/粘贴图片、文件、URL 到画布，分别创建 Image / Asset / Link 节点；文件导入优先 native path copy 或本地 HTTP 流式上传，data URL 仅作为 fallback。
  - ⚠️ JSON 导入恢复尚未实现。
  - ⚠️ 显式「从 Markdown 重新导入到当前笔记」（解析外部 .md → blocks → 写 sidecar，覆盖当前内容）尚未实现（见 TODO-24）。

### 5.10 关键架构决策

| 决策点             | 方案                                                                            | 理由                                                                       |
| ------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ID 分离            | `noteId`（内容）+ `nodeId`（画布实例）                                          | 同一笔记可在多画布/同画布多次出现                                          |
| 布局存储           | Per-view manifest，不放 frontmatter                                             | 布局和内容解耦，避免单文件热点                                             |
| 内容树结构         | 统一 `content/` 目录                                                            | 避免 `notes/` + `folders/` 双根混乱                                        |
| 内容生命周期       | 删 `node` 只删实例；零引用 `note` 保留为 **detached note**，可在笔记库中找回                             | 避免误删共享内容，也避免内容文件无入口可找回                               |
| Folder 范围        | Folder 是内容集合，不是万能容器；可收纳 Card/Widget/Image/Asset/Link/Recording，不收纳 Folder/Group/Sticky | 保持 Folder 的资料夹语义，避免递归层级、空间布局和临时便签混进同一个模型 |
| Folder Card 子节点  | 与顶层 Card 对等：独立 `noteId` + note record（sidecar 或 legacy `.md`）；manifest 仅保留薄引用（M5 ✅） | 可跨画布复用 noteId；消除早期「仅画布内可见」降级定位 |
| Folder Widget 子节点 | 与顶层 Widget 对等：独立 `widgetId` + `.ghostboard/widgets/` JSON；manifest 仅 `{ widgetId, kind }` | items/timer 不进 canvas json，避免布局文件膨胀 |
| Folder Image 子节点 | 继续使用 `attachments/` + `imageFile` 指针，不分配 `noteId`                                       | Image 没有文本正文概念，附件模式已足够；保持与顶层 Image 节点一致                                 |
| Asset / Link / Recording 节点 | 作为独立 node kind，不并入 `image` 或 `card`；Asset/Recording 走 `attachments/`，Link 走 URL + unfurl 元数据 | 避免把本地文件、网页链接、录音和 Markdown 文档混成一个数据模型 |
| Widget 节点        | 单一 `type: "widget"` + `kind`；内容独立 JSON；duplicate 克隆文件；per-widget undo 栈 | 可交互小工具与笔记解耦，checklist 从 card 迁出 |
| Folder / Edge 边界 | Folder 封面可连线；`children` 不跨层暴露 Handle                                 | 避免 drill-down 时连线语义失真                                             |
| Folder 内布局      | 打开时 bottom-up waterfall 自动排布，不存子坐标                                 | 避免过早引入子画布复杂度                                                   |
| ID 生成            | note / widget 使用 nanoid 风格 id，写入各自内容文件                             | 文件重命名不影响引用关系                                                   |
| 文件监听           | 暂不承诺持续 watcher；当前通过 load/search/export 按需读取 sidecar / widget / legacy `.md`，未来如做外部编辑器实时同步再引入 `fs.watch` / `chokidar` | 避免 watcher 循环、跨 workspace 切换 teardown 和 JSON 冲突过早复杂化 |
| 持久化策略         | manifest/layout 约 2500ms debounce，viewport 约 500ms debounce，widget 内容独立 debounce，视图切换/失焦/隐藏时立即 flush | 平衡输入流畅度与磁盘写入频率 |
| 写入协调           | 分 debounce + 单串行写入队列 + 原子写                                           | 降低内容/布局竞态与文件损坏风险                                            |
| Checklist 导出     | Markdown 导出生成 GFM `- [x]` 任务列表                                          | 与 Obsidian/Typora 等生态兼容                                              |
| 图片/附件          | `attachments/` + `{kind}_{uuid8}.{ext}` 文件名，媒体流通过本地 token-auth HTTP 服务读取，视频/音频支持 byte range | 避免同名冲突，支持大文件导入和播放器 seek                                 |
| manifest 格式      | 与 @xyflow/react 原生 Node/Edge JSON 一致                                       | 加载时零转换，直接传入组件                                                 |
| z-order            | 数组顺序（后覆盖前）                                                            | 简单直观，React Flow 原生行为                                              |
| 路径格式           | workspace-relative POSIX path                                                   | 跨平台一致性                                                               |
| 颜色来源           | manifest `color` 覆盖 sidecar / legacy frontmatter `color`                      | 保留内容语义色与视图强调色的分层                                           |
| Viewport 持久化    | Per-view `viewport` 字段写入 `.canvas.json`，切换画布/重启后恢复                  | 用户回到上次浏览位置，避免每次打开从原点开始                             |
| 活跃画布持久化     | `activeViewId` 实时写入 `workspace.json`                                          | 重启后恢复到上次使用的画布                                               |
| 画布 chrome        | `canvasShowMinimap` + `CanvasViewportChrome`；背景 `default/paper/cream/mono`   | 视口导航可配置，主题色板含 cream                                         |
| 设置归属           | Workspace settings 存 `.ghostboard/settings.json`；当前 workspace 指针存 app-level `userprefs.json`；AI key 存 app-level credentials | workspace 可移植，同时避免把绝对路径和密钥写进可共享目录 |

### 5.11 Edge Cases & Guardrails

> 完整的 edge case 处理策略表格（文件断链、watcher 循环、frontmatter 解析失败、sidecar 损坏、manifest 损坏等）已迁移至 [技术规范文档 §9](./tech-spec.md#9-edge-cases--guardrails)。

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
| 1   | **右键菜单 (Context Menu)** — 画布、单节点、媒体节点、多选、Folder/Group/Sticky/Edge 上下文 | 中     | ✅ 已完成 |
| 2   | **键盘快捷键** — Delete/Cut/Copy/Paste/Duplicate/Group/Search/Zoom/方向键选择、模态屏蔽 | 低     | ✅ 已完成 |
| 3   | **节点连线 (Edges)** — 四向 Handle + `labeledEdge` + bezier/smoothstep + 浮动端点 + 连接预览线 | 中     | ✅ 已完成 |
| 4   | **选择模型重构** — 普通单击打开，框选/修饰键/右键/方向键显式选择 | 中     | ✅ 已完成 |
| 5   | **FolderNode Resize** — NodeResizeControl                 | 低     | ✅ 已完成 |
| 5.1 | **碰撞检测与放置解析** — Group/Folder 拖拽时的排斥与自动归属判定 | 中     | ✅ 已完成 |

### 🟡 P1 — 核心特性（差异化亮点）

| #   | 任务                                              | 复杂度 | 状态      |
| --- | ------------------------------------------------- | ------ | --------- |
| 6   | **Group 开放式分组** — 三阶段拖拽 + 预设颜色 + 排斥力学 | 高     | ✅ 已完成 |
| 7   | **撤销/重做 (Undo/Redo)** — 快照历史栈            | 中     | ✅ 已完成 |
| 8   | **便签 (Sticky Note)** — 单击原地编辑、CSS pushpin、纯文本保存、不进入聚焦 | 低     | ✅ 已完成 |
| 9   | **图片卡片** — 拖拽/粘贴/选择器导入，缩略图生成，聚焦懒加载原图，替换与缺失重试 | 中     | ✅ 已完成 |
| 9.1 | **BlockNote 块编辑器** — 聚焦模式块级编辑，JSON sidecar canonical source，支持标题/列表/任务/代码块等，Markdown 按需导出 | 中     | ✅ 已完成（取代旧 Tiptap 方案） |
| 9.2 | **画布预览渲染** — sidecar cached preview + legacy markdown-it / DOMPurify 安全预览 | 低     | ✅ 已完成 |

### 🟢 P2 — 数据层与增强功能

| #    | 任务                                                               | 复杂度 | 状态      |
| ---  | ------------------------------------------------------------------ | ------ | --------- |
| 10   | **数据持久化** — 端到端链路（manifest + .md 拆分 + RPC + hydrate） | 高     | ✅ 已完成 |
| 11   | **全局搜索** — Cmd/Ctrl+K，跨画布搜索与定位；Folder children / unreferenced Markdown 覆盖待补 | 中     | ✅ MVP 已完成 / ⚠️ 覆盖待补 |
| 12   | **连线标签与动画** — 可编辑 label + 流动虚线 + Marker 端点           | 低     | ✅ 已完成 |
| 13   | **Group 嵌套** — 多级 parentId + 防循环                            | 中     | ✅ 已完成 |
| 13.1 | **画布标题栏模糊** — 顶部工具栏背景模糊效果                          | 低     | ✅ 已完成 |
| 14   | **画布导出 PNG/JSON**                                              | 低     | ✅ 已完成 |
| 14.2 | **Folder Card 子节点迁移 noteId + 独立 note record**（M5）                     | 中     | ✅ 已完成 |
| 14.3 | **设置弹窗（General / Workspace / AI / Shortcuts / About）**            | 低     | ✅ 已完成 |
| 14.5 | **Canvas 模板库** — ViewSwitcher「+」按钮子菜单、`/templates` 列表、`/templates/$templateId` 只读预览、基于模板创建新画布 | 高     | ✅ MVP 已完成 / ⚠️ P5 收尾待补 |
| 14.6 | **Per-view Viewport 持久化** — 每个画布的 ReactFlow viewport（x/y/zoom）随 `.canvas.json` 持久化，切换画布/重启后恢复 | 低     | ✅ 已完成 |
| 14.7 | **活跃画布持久化** — `activeViewId` 写入 `workspace.json`，重启后恢复到上次使用的画布 | 低     | ✅ 已完成 |
| 14.8 | **Asset / Link 多模态节点** — 本地文件、视频/音频/文本/压缩包预览、链接创建与 unfurl、Document 类型视图接入 | 高 | ✅ MVP 已完成 / ⚠️ PDF 页级预览、视频转码、网页剪藏待补 |
| 14.9 | **标签管理** — TagEditor、TagSidebar、node-metadata.json、标签筛选与重命名/删除 | 中 | ✅ 已完成 |
| 14.10 | **Recording 录音节点** — 麦克风录制、实时 waveform、附件保存、画布播放、Folder/Group 收纳 | 中 | ✅ 已完成 |
| 14.11 | **Markdown 文件导入** — 多文件选择导入为新 Note，创建卡片并保留 frontmatter / 正文 | 低 | ✅ 已完成 |
| 14.12 | **Widget 系统** — `type: widget` + checklist/pomodoro/reminder；独立 JSON；懒迁移 checklist；per-widget undo；Folder 收纳 | 高 | ✅ MVP 已完成 |
| 14.13 | **Folder waterfall 展开** — bottom-up 多列排布、动态封面缩略图、展开层子项右键 | 中 | ✅ 已完成 |
| 14.14 | **FocusedView morph + 共享 loading** — 从源卡片 scale 展开；`NoteEditorLoading` | 中 | ✅ 已完成 |
| 14.15 | **画布 viewport chrome** — minimap + zoom 合一面板；`canvasShowMinimap` 设置 | 低 | ✅ 已完成 |
| 14.16 | **Cream 画布背景** — settings swatch；`default/paper/cream/mono` | 低 | ✅ 已完成 |

### ⚪ P3 — 后续迭代

| #    | 任务                         | 复杂度 | 状态      |
| ---  | ---------------------------- | ------ | --------- |
| 15   | **多画布视图切换**           | 中     | ✅ 已完成 |
| 16   | **多 workspace 管理**        | 中     | ❌ 待实现 |
| 17   | **节点锁定**                 | 低     | ✅ 已完成（节点右键 Lock/Unlock，data.locked 持久化，锁定时禁用 drag/connect/delete 并显示右上角锁定徽章） |
| 18   | **框选 (Marquee Selection)** | 低     | ✅ 已完成（React Flow 内置框选 + 自定义选框样式） |
| 19   | **导入 JSON / Markdown 覆盖重新导入** | 低     | ❌ 待实现 |
| 20   | **移动端适配**               | 高     | ❌ 待实现 |
| 21   | **Group 拖拽推开**           | 中     | ✅ 已完成 |
| 22   | **`extent: "parent"` 约束**  | 低     | ✅ 已完成（createNode / useNodeDrag / clipboard paste / initialNodes 均已在写入 parentId 时附带 extent: 'parent'，normalizeCanvasParenting 保留） |
| 23   | **Edge 颜色/样式**           | 低     | ✅ 已完成（边右键菜单 Cycle Color，LabeledEdge 读取 data.color） |
| 23.1 | **桌面应用图标** — 多尺寸 icns/ico | 低     | ✅ 已完成 |

### 🔮 远期

| #   | 任务                     | 说明                                                                                                                                                                                             |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 24  | **高级视频/PDF 卡片**    | Asset MVP 已支持大文件原生导入、视频/音频播放、音频 waveform、视频 poster 和基础 PDF 预览；后续补 PDF 页级缩略图/导航/批注、视频转码/封面编辑                                                                                                                                 |
| 25  | **富 Web Clips**         | Link MVP 已支持 URL 节点、基础 unfurl、favicon/image 元数据与富媒体卡片样式；后续补网页剪藏、离线快照、Magazine 风格预览                                                                                                                                 |
| 26  | **全局快捷键快速输入**   | Quick Input from anywhere                                                                                                                                                                        |
| 27  | **AI 辅助**              | ✅ 基础架构已实现 — 本地 HTTP 服务器支持 AI 流式传输，集成 Gemini 等 AI 能力进行内容总结、生成和关联推荐。后续需完善 UI 入口和用户体验。                                                                 |
| 28  | **商业化**               | ✅ 许可证管理系统已实现 — 硬件绑定 + 本地加密存储，后端 API 支持签发/激活/验证/撤销，未激活用户限制 100 张卡片，激活用户无限制。后续需完善支付集成和订阅管理。                                                                 |
| 29  | **双向链接 (Backlinks)** | 支持 `[[note]]` 语法在笔记正文中引用其他笔记，自动建立反向链接索引。与 Edge 系统互补——Edge 是画布上显式的视觉关系，Backlink 是内容层隐式的语义关系。侧边栏或聚焦模式底部展示"被哪些笔记引用"列表 |

---

## 8. 项目待办与未决策 (Backlog & Open Decisions)

> 本章节是产品层面的待办与未决策总表。决策落地后，把对应行从本表删除或改为“已决策”，并同步回写正文对应小节，保持本 PRD 与 [技术规范文档](./tech-spec.md) 为唯一事实源。

### 8.1 架构级未决策

| ID | 题目 | 背景与选项 | 状态 |
| --- | --- | --- | --- |
| OD-2 | **搜索范围** | 当前搜索 MVP 覆盖画布可定位对象和其 note record 正文，但 Folder children 与未被 manifest 引用的 sidecar / `.md` 仍可能漏搜。选项：① 只承诺 canvas-addressable 搜索；② 搜索整个 workspace 文档库；③ 搜索结果区分 placed / detached / unlinked。 | 待决 |
| OD-3 | **多 Workspace 管理** | 当前可在设置页选择下次启动 workspace，并把路径写入 app-level `userprefs.json`；完整多 workspace 仍需要欢迎页、recentWorkspaces、activeWorkspace、无重启 workspace switch、app-level config。 | 待实现 |
| OD-4 | **app-level vs workspace-level settings** | 当前 workspace 内设置在 `.ghostboard/settings.json`，workspace path 在 app-level `userprefs.json`，AI key 在 app-level credentials。仍需决定 theme/locale/trash cleanup/AI 模型等在多 workspace 目标下的归属。 | 待决 |
| OD-5 | **Folder / Detached 删除语义** | 当前顶层删除移除 canvas node，Folder child 删除会清理 child note，删除 Folder 会把 children 转为 detached 节点；Image/Asset/Recording 附件与 Link 元数据仍按 manifest/附件模式处理。若转向 filesystem-first，需要重新定义"删除引用"与"删除真实文件"的确认流程。 | 待决 |

### 8.2 产品体验未决策

> 暂无。

### 8.3 已知待办

| ID | 事项 | 目标 | 优先级 |
| --- | --- | --- | --- |
| TODO-1 | **补 Folder children 搜索** | 后端和前端 fallback 都应索引 Folder children 中的 Card/Widget/Asset/Link/Image/Recording，使其能被全局搜索命中并定位回画布。 | P0 |
| TODO-2 | **明确 unlinked note record 策略** | 决定无 manifest 引用的 legacy `.md` 和 BlockNote sidecar 是进入搜索结果，还是只留在设置页 Unlinked Files 清理工具。 | P0 |
| TODO-3 | **Asset 大文件导入** | ✅ 已实现 — 文件选择优先 native path copy，拖拽/粘贴走本地 HTTP 流式上传；25 MB data URL 限制仅保留为 legacy fallback。 | ~~P1~~ ✅ |
| TODO-4 | **Link 富预览与安全硬化** | ✅ 已实现 — UI 展示 favicon/image preview；unfurl 已增加 DNS 解析后的私网 IP 防护，降低 DNS rebinding 风险。 | ~~P1~~ ✅ |
| TODO-5 | **PDF 页级预览** | 基础内嵌 PDF 预览已实现；后续补页面缩略图、页码导航、批注和更稳定的失败兜底。 | P2 |
| TODO-6 | **模板库 P5 收尾** | 补模板数量，接入 thumbnail，删除 `preview-test` 路由，决定从模板创建的画布命名规则，考虑 URL query 同步与 i18n metadata。 | P1 |
| TODO-7 | **Multi-workspace** | 欢迎页、创建/打开/切换 workspace、recent list、app config、settings 迁移策略。 | P2 |
| TODO-8 | **独立 saveNote debounce** | ✅ 已实现 — BlockNote 走 `useBlockNoteSaver` + `rpcSaveBlockNote` 独立 debounce；legacy Markdown 走 `useNoteSaver` + `rpcSaveNote`，均支持 blur / hidden / unmount flush。 | ~~P2~~ ✅ |
| TODO-9 | **ContextMenu 多选批量操作** | ✅ 已实现 — 多选右键菜单支持 Duplicate、Group、Change Color、Edit Tags、Lock/Unlock、Move to View、Copy、Delete，并保留选中集合内部连线。来源：原 UX 审计 8.2.1。 | ~~P2~~ ✅ |
| TODO-10 | **FocusedView 遮罩关闭保存确认** | 检测 BlockNote 是否有未 flush 的修改，有则弹出 "Discard changes?" 确认。当前点击黑色遮罩直接 `onClose()`（[FocusedView.tsx#L291](./../src/mainview/components/canvas/FocusedView.tsx)），debounce 未到期的编辑可能丢失。来源：原 UX 审计 8.5.3。 | P2 |
| TODO-12 | **FocusedView 卡片位置面包屑** | 在返回按钮旁显示 `{FolderName} > {CardTitle}`，让聚焦中的卡片有归属感（尤其是 Folder child）。来源：原 UX 审计 8.5.2。 | P3 |
| TODO-16b | **BlockNote 选区字数统计** | FocusedView 当前已展示整篇正文字数/字符数（基于 markdown 文本剥离格式后统计）。后续可在 BlockNote 选区变化时给出选中文本的字数统计。来源：原 UX 审计 8.1。 | P3 |
| TODO-17 | **BlockNote 查找替换** | 当前 BlockNote 无内置 find/replace；接入或自研一个轻量查找替换面板，至少支持 `Cmd+F` 高亮匹配。来源：原 UX 审计 8.1。 | P3 |
| TODO-23 | **Markdown 批量导出 UI 入口** | 设置页添加「导出所有笔记为 Markdown…」按钮；画布多选后提供「批量导出选中」入口。RPC `exportNotesMarkdown` 已支持 `scope: 'all' \| 'selected'`，只缺前端入口；当前 Settings 已是主窗口内 Dialog，可直接复用现有 renderer/RPC 通道。 | P2 |
| TODO-24 | **显式「从 Markdown 重新导入」** | 当前已支持选择多个外部 `.md` 文件导入为新 Note；仍缺"覆盖当前笔记内容"路径。新增 RPC（解析外部 `.md` → blocks → 写 sidecar → invalidate）；focused view 工具栏 / 卡片右键提供入口；二次确认对话框说明「会覆盖当前编辑器内容、可能丢失高级块结构」。 | P1 |
| TODO-25 | **Phase 0 文案** | 设置页 / onboarding 添加说明：「Markdown 是按需导出格式，不会在每次保存时自动生成；外部 Markdown 需显式导入」。 | P2 |
| TODO-26 | **Markdown 预览附件渲染** | 预览 HTML 中附件真正渲染（注册自定义 scheme 或懒解析），当前用稳定占位 badge 未渲染真实图片。 | P3 |
| TODO-18 | **`src/bun/index.ts` 单文件过长** | 所有 RPC handler 注册在一个文件里（当前约 2841 行），每加一个功能都要改这个文件。建议按业务域拆分为 `handlers/canvas.ts`、`handlers/settings.ts`、`handlers/template.ts`、`handlers/assets.ts`。来源：原架构审计。 | P2 |
| TODO-19 | **主路由 `index.tsx` 过长** | 画布页面的全部逻辑集中在一个组件中（当前约 1584 行）。建议继续提取 `useCanvasDragDrop`、`useCanvasExport`、`useCanvasInit`、`useCanvasSearchNavigation` 等自定义 hooks。来源：原架构审计。 | P2 |
| TODO-20 | **深色主题覆盖不完整** | 近期 design tokens / accent 色已有改善，但 Group label、部分 placeholder、媒体卡片 hover 信息等仍需逐组件审查深色主题适配。来源：原架构审计。 | P2 |
| TODO-22 | **Onboarding 引导流程** | 首次打开应用 seed 了 `quick-start` 模板，但没有任何浮层引导。建议在首次启动时显示 3-4 步引导浮层：1.「拖拽平移画布」2.「点击卡片打开，框选/修饰键选择」3.「右键或 + 创建新内容」4.「Cmd+K 搜索」。来源：原架构审计。 | P2 |

### 8.4 已落地的关键决策映射（供回查）

| 决策摘要 | 落地位置 |
| --- | --- |
| Folder Card 子节点强制 `noteId + note record`（M5） | §5.1、§5.6、§5.10 |
| Widget 独立于 Card；checklist 懒迁移；内容不进 manifest | §2.2、§5.1、§5.3、§5.10；[tech-spec](./tech-spec.md) §3.3 / §4.2.1 / §7 |
| Folder 展开用 waterfall，不持久化子坐标 | §2.5.2、§5.10 |
| FocusedView 从源卡片 morph | §2.3 |
| canvasShowMinimap + cream 背景 | §5.2 |
| Folder 是内容集合，不是万能容器；允许 Card/Widget/Image/Asset/Link/Recording，不允许 Folder/Group/Sticky | §2.5.2、§5.6、§5.10 |
| Detached notes 取代早期 `unplaced notes` 概念 | §2.8、§2.12 |
| BlockNote 与画布 undo/redo 栈隔离 | §2.10 |
| TagEditor + TagSidebar + node-metadata.json | §2.13、§5.3 |
| BlockNote JSON sidecar (`content/.ghostboard/blocknote/`) | §2.2、§5.3 |
| 旧 `.md` 同步副本退役，Markdown 变为 legacy/import fallback 与按需导出格式 | §2.2、§5.4、§5.9、§5.10 |
| Asset / Link / Recording 作为独立 node kind，不混入 Card frontmatter | §2.2、§5.1、§5.6、§5.10 |
| Settings 从独立窗口入口收敛到主窗口内 `SettingsDialog`，workspace 指针拆到 app-level `userprefs.json` | §2.12、§5.2、§5.10 |
| PNG / JSON 导出已落地；JSON 导入和 Markdown 覆盖重新导入仍待补 | §5.9、§7、§8.3 |
