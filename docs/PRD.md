# 产品需求文档 (PRD)：GhostBoard 自由画布知识库

> **相关文档**
>
> - [技术规范文档](./tech-spec.md) — 架构、技术栈、目录结构、状态管理、渲染动画、性能预算、数据持久化、RPC 协议、编码约定
> - 文档模式早期设计稿：[Backlog/双布局-文档模式.md](./features/Backlog/双布局-文档模式.md)（已实现，保留以便溯源）
> - 原待决问题清单：[todo/双布局-PRD-待决问题.md](./todo/双布局-PRD-待决问题.md)（**已决策项合并到本文件 §2.12；未决项合并到 §8 Open Decisions**）

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
  - **便签 (Sticky Note)**：轻量级的彩色便签，支持快速记录短文本。可自由调整大小，提供多种预设颜色。便签默认可拖拽；双击进入原地编辑模式，失焦后自动保存。便签**不支持**聚焦放大模式（FocusedView），所有编辑均在画布上原地完成。
- **卡片通用能力**：
  - **Markdown 预览渲染**：普通文本卡片在画布态（非聚焦态）下通过 **markdown-it** 将 Markdown 正文渲染为安全的 HTML 预览，经 **DOMPurify** 清理后展示。预览层仅渲染摘要级别内容（标题、段落、列表、代码块等），不挂载完整的编辑器实例，保证首屏性能。Checklist 卡片在画布上保持独立的结构化 `data.items` 交互，不走 markdown-it 预览渲染。
  - **自由调整大小 (Resize)**：所有卡片均支持拖拽边角/边缘来调整宽高，不再固定为 350×450。调整时保持内容自适应重排。
  - **复制/粘贴**：支持 `Cmd+C` / `Cmd+V` 复制粘贴卡片。
  - **聚焦入口约定**：双击卡片或选中后按 `Enter` 进入聚焦模式（FocusedView），卡片平滑放大至屏幕中央。Checklist 卡片在画布上可直接勾选和添加条目，无需进入聚焦模式。
  - **创建流程**：画布右下角提供 `CreateMenu` 浮动按钮，支持快速新建卡片（Card）或文件夹（Folder），新节点在当前视口中心创建。后续计划支持 `Cmd/Ctrl+N` 快捷键和右键菜单创建。

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
  - **排斥与碰撞**：Group 在拖拽调整大小或移动时，与邻近节点存在** gentle repulsion（柔和排斥）**机制——当 Group 边界靠近其他节点一定阈值时，邻近节点会被轻微推开，避免视觉重叠。同时提供**碰撞检测与放置解析**能力：释放节点时若检测到与 Group 区域重叠，系统会自动判断是"纳入 Group"还是"放在 Group 旁边"，确保放置意图明确。嵌套 Group 时同样遵循此规则，并防止循环嵌套。

#### 2.5.2 Folder 堆叠式文件夹 (Folder Stack)

- **功能描述**：在二维画布上引入第三个维度（Z轴层级）。将多个相关的卡片收纳为一个视觉上的"堆叠实体"（Folder），子节点**隐藏**。
- **交互逻辑**：
  - **外观**：在画布上表现为一个带有标签的堆叠卡片组（如演示中的 "3 items - The really great ideas..."）。
  - **进入图层 (Drill-down)**：选中文件夹后双击、按 `Enter`，或通过右键菜单 `Open` 触发**隔离层模式**。
    - 背景画布整体变暗或模糊（失去焦点）。
    - 文件夹内的卡片从堆叠状态平滑展开（散开）到当前的临时图层上，供用户浏览或编辑。MVP 采用确定性的自动排布（横向 strip 或 grid），排列顺序按 `children` 数组索引（即拖入先后顺序），不提供自由拖拽排序，因此不额外持久化 Folder 内部坐标。
      - 在此模式下，画布上的其他非同组元素不可见或不可交互。
  - **退出图层**：点击背景空白处或返回按钮，展开的卡片平滑收缩回堆叠状态，背景画布恢复明亮和可交互状态。
  - **成员来源**：Folder 的成员通过以下两种方式产生：
    1. **在 Folder 内直接新建**：在 Folder drill-down 视图中通过顶部工具栏或右键菜单的 `New Card` 新建卡片，直接追加到该 Folder 的 `children` 数组。
    2. **从画布提取 (Extract to Canvas) 的逆操作**：不支持直接将画布上已有卡片拖入 Folder（MVP 阶段为避免连线悬空和身份转换复杂度，该操作已移除）。如需将画布内容收纳进 Folder，建议先复制内容，再在 Folder 内新建卡片粘贴。
  - **取回到主画布**：drill-down 视图中选中子卡片后，可通过顶部工具栏的 ↗ `Extract to Canvas` 按钮或右键菜单将该卡片作为新的独立画布节点放回 Folder 邻近区域。**M5 之后 Folder Card 子节点本身已拥有独立 `.md` 和 `noteId`**，Extract 动作仅是把 manifest 中的 `children` 引用提升为顶层节点并分配新的 `nodeId`，不再涉及文件创建；`.md` 文件保留不动（同一 `noteId` 可在 Extract 前后被其他画布共用）。
  - **Extract 可发现性**：为降低 `Extract to Canvas` 被用户忽略的风险（仅藏在右键菜单中发现性不足），drill-down 视图顶部工具栏需提供一个显式的 ↗ `Extract to Canvas` 按钮。当用户在 drill-down 中选中一张或多张子卡片时，该按钮高亮可用；未选中时置灰。此按钮与右键菜单中的 `Extract to Canvas` 行为一致。
  - **Folder 内操作边界（MVP）**：支持在 drill-down 视图中浏览和聚焦子卡片；不支持自由拖拽改变卡片顺序，也不支持跨 Folder 边界直接建立子卡片连线。后续若需要自由布局，将升级为子画布模型单独设计。
  - **适用场景**：归档收纳、减少画布视觉噪音。

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
  - **新建画布**：通过切换器右侧的 `+` 按钮或弹出菜单底部的 `New Canvas` 创建空画布，自动命名为 `Canvas N` 并切换过去。
  - **重命名**：在弹出菜单中点击铅笔图标进入行内编辑模式，`Enter` 确认、`Escape` 取消。
  - **删除画布**：在弹出菜单中点击删除图标。至少保留一个画布，删除最后一个时操作被拒绝。删除当前画布时自动切换到列表中的第一个画布。
  - **数据隔离**：每个画布对应独立的 `.ghostboard/views/{viewId}.canvas.json` manifest 文件。`content/*.md` 笔记文件在所有画布间共享（通过 `noteId` 引用）。
- **限制（当前版本）**：
  - 不支持跨画布拖拽节点。
  - 不支持画布间的 noteId 引用关系可视化。

### 2.8 搜索 (Search)

- **功能描述**：全局搜索 workspace 中的所有内容，包括画布上的卡片标题、正文、待办事项文本，以及暂时未被任何画布引用的 `unplaced notes`。
- **交互逻辑**：
  - 通过 `Cmd+F` 或顶部搜索图标唤起搜索面板。
  - 输入关键词后，实时高亮匹配的卡片，未匹配的卡片降低透明度。
  - 点击搜索结果项，若该内容已有画布实例，则自动平移缩放至对应卡片位置；若该内容当前没有任何节点实例，则提供“放回当前画布”操作，在视口中心创建新节点。
  - **排序规则（MVP）**：标题匹配优先于正文匹配；同等匹配度下按 `updatedAt` 降序排列。Folder 内的子卡片内容纳入搜索范围。后续可引入相关性评分。
  - **文档模式下的搜索行为**：在文档模式下 `Cmd+F` 仍然唤起同一个搜索面板，命中后直接写入 `selectedDocumentId`（含 `child:<folderId>:<childId>` 形式的子卡片），右侧编辑器立即打开匹配笔记，而不是在画布上 fitView。
  - **Detached notes 的可见性**：文档模式下新建的笔记 (`createDetachedNote`) 以及用户主动从画布分离的笔记 (`detachNoteFromCanvas`) 会变成 **detached notes**（`data.detached: true`，`position: {x:0,y:0}` 占位），不在画布上渲染，但仍参与搜索和文档模式左栏的 All Notes / Inbox。画布模式通过 `CreateMenu` 中的「Library Note / 文库笔记」入口打开 `DetachedNotesSidebar` 浏览这些游离笔记，拖入画布时通过 `pinNoteToCanvas` 赋予真实坐标。这套机制替代了早期规划中的 `unplaced notes` 概念——内容永远可被找回，不再存在「零引用隐性丢失」。

### 2.9 撤销/重做 (Undo / Redo)

- **功能描述**：对画布上的结构性与离散操作（移动、创建、删除、Resize、拖入文件夹、节点级提交等）提供撤销和重做能力。正文长文编辑不进入画布撤销栈，而是由 Tiptap 自身历史栈处理；标题输入框使用浏览器原生 input undo。
- **交互逻辑**：
  - 非编辑态下，`Cmd+Z` 撤销，`Cmd+Shift+Z` 重做；若焦点位于 `input` / `textarea` / `contenteditable` 中，则快捷键交给当前编辑控件，不由画布 store 接管。
  - 维护一个画布快照历史栈（Snapshot History Stack），每次离散画布操作前保存当前 `{nodes, edges}` 快照；当前实现不记录 diff / command。
  - **栈深度上限**：最多保留 **50** 步操作历史，超出后丢弃最早记录，避免大画布场景下内存不可控增长。
  - **撤销与持久化的一致性策略**：撤销/重做仅回滚内存状态，不直接触发磁盘反向写入。下一次 debounce 到期时，以当前内存状态为准覆盖磁盘文件。这意味着：用户编辑 → debounce 写盘 → `Cmd+Z` 撤销 → 内存回滚 → 下次 debounce 再次以内存状态覆盖磁盘，保证内存与磁盘最终一致。
  - **生命周期**：撤销栈仅存在于内存中，关闭应用或切换 workspace 后清空，不做持久化。

### 2.10 键盘快捷键体系 (Keyboard Shortcuts)

| macOS                   | Windows / Linux           | 画布模式                                                                        | 文档模式                                                           |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `Cmd+Z` / `Cmd+Shift+Z` | `Ctrl+Z` / `Ctrl+Shift+Z` | 非编辑态下走画布快照栈；若焦点在 `input` / `textarea` / `contenteditable`，则交给当前编辑控件 | 正文由 Tiptap history 处理；标题 input 走浏览器原生 undo；均与画布栈隔离，不冒泡到 canvas store |
| `Cmd+C` / `Cmd+V`       | `Ctrl+C` / `Ctrl+V`       | 复制 / 粘贴卡片                                                                 | 按浏览器默认行为走（纯文本剪贴），不做卡片级复制                   |
| `Delete` / `Backspace`  | `Delete` / `Backspace`    | 从当前画布移除选中的节点（不删除 .md 内容文件；永久删除需通过右键菜单二次确认） | 屏蔽（左栏/NoteList 的删除通过右键菜单或工具栏显式触发）           |
| `Cmd+F`                 | `Ctrl+F`                  | 打开搜索，命中后 fitView 到画布节点                                             | 打开搜索，命中后直接打开右侧编辑器（见 §2.8）                      |
| `Cmd+A`                 | `Ctrl+A`                  | 全选当前上下文中的节点                                                          | 屏蔽（仅 Tiptap 编辑器内生效，选中正文）                           |
| `Cmd+N`                 | `Ctrl+N`                  | 打开新建卡片菜单                                                                | 屏蔽（文档模式新建走左栏 `+` 按钮，只产出 Note 类型）              |
| `Enter`                 | `Enter`                   | 打开选中卡片的聚焦模式                                                          | 屏蔽（右侧已是常驻编辑器；树上 Enter 仅作为打开当前高亮项）        |
| `Escape`                | `Escape`                  | 关闭聚焦/文件夹视图、退出搜索/菜单                                              | 仅关闭搜索 / 菜单；不退出文档（文档模式无「聚焦」可退出）          |

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

> **与布局模式的关系**：上述状态机仅描述画布模式的交互。`document` 布局模式（见 §2.12）独立于此状态机之外：进入文档模式即冻结 `idle` / `selected` / `focused` / `folder-drill-down` 等画布状态并重置其宿主（`focusedNode` / `focusedFolder` / `createMenuOpen`），避免模态语义泄漏到切回画布后的界面。

### 2.12 布局模式：画布 vs 文档 (Layout Modes) ✅

- **功能描述**：同一份数据提供两种互补的呈现方式：
  - **画布模式 (`canvas`)**：默认模式，用于发散、空间化思考。
  - **文档模式 (`document`)**：用于线性、聚焦的长文编辑与结构化浏览。
- **切换器**：顶部的 `LayoutSwitcher` 提供「画布 / 文档」两档 Segmented Control；底部 `ViewSwitcher` 维持不动，两个切换器职责不同（布局 vs 多画布）。切换布局不卸载 store，数据互通。
- **文档模式布局**：
  - **左栏 `LeftRail`**：All Notes / Inbox / Archive / Folders / Views / Types 分区树，支持展开折叠和新建 Folder。其中 **Types** 分组下当前提供 `Images` 类型条目（带数量徽标），点击进入瀑布流图片库视图（详见下文「类型视图：Images 图片库」）。
  - **中栏 `NoteList`**：当前分区下的笔记列表，默认按 `updatedAt` 倒序（排序按钮可切换）。
  - **右栏 `DocumentEditor`**：常驻 Tiptap 编辑器，从 `FocusedView` 模态升格为面板形态。
- **文档模式可见节点类型**：仅渲染 `Card` / `Folder` / `Image`。`Sticky` / `Group` / `Edge` 仍保留在 store，但文档模式下不渲染；切回画布模式仍可见。首次切到文档模式时弹一次 toast 提示“便签、分组、连线已保留但不在文档模式展示”（待 OD-1 确认是否继续保留 sticky 计数入口）。

#### 类型视图：Images 图片库 ✅

- **入口**：左栏 `LeftRail` 的 `Types` 分组（默认折叠）下的 `Images` 条目。`documentSection` 取值为 `type:image`，与 `all` / `inbox` / `archive` / `folder:${id}` 并列。
- **数量徽标**：聚合所有顶层 `image` 节点 + 所有 `folder` 节点的 `image` 类型 children，实时显示总数。
- **布局变化**：选中 `Images` 时，文档模式右侧从默认的 `[220px, 320px, 1fr]`（LeftRail / NoteList / Editor）切换为 `[220px, 1fr]`（LeftRail / ImageGallery），中栏与右栏合并为单一图片库面板。
- **瀑布流呈现**：使用 CSS multi-column 实现自适应瀑布流，按视窗宽度 `2 / 3 / 4 / 5` 列阶梯切换；每张图片懒加载（`loading="lazy"`），按原始宽高比铺排，悬浮时轻微放大并加深阴影。
- **数据来源**：与左栏徽标一致——遍历 store 中所有节点，收集顶层 `image` 节点和 `folder` children 中 `type === 'image'` 的条目，过滤掉 `imageUrl` 为空的占位图。条目 `id` 沿用文档选择 token 形式（`node:<id>` / `child:<folderId>:<childId>`），方便后续与 `selectedDocumentId` 打通。
- **空状态**：无任何图片时显示居中的 `ImageOff` 图标 + 「暂无图片 / No images yet」文案。
- **点击放大（Lightbox）**：点击任意缩略图打开全屏 lightbox，带 `motion/react` 淡入 + 缩放动效；
  - 退出方式：点击背景遮罩、点击右上角关闭按钮、按 `Esc`。
  - 图片本体 `object-contain`，最长边贴合视窗，保留原比例。
  - 标题以胶囊形式悬浮在底部居中。
  - 点击图片本体不触发关闭（`stopPropagation`），避免误退出。
- **国际化**：`document_type_images` / `document_image_gallery_empty` / `document_image_gallery_close`（`en` / `zh` 两套已就绪）。
- **未来扩展（暂不做）**：
  - 双击缩略图回跳画布并 fitView 到对应节点（与 `pendingSearchTarget` 复用）。
  - 网格 / 瀑布流切换、按时间或文件夹分组、批量选择与删除、原图导出。
  - 其他 `Types`（`Notes` / `Checklists` / `Folders`）平行入口。

#### Detached notes（文档 ↔ 画布 的共享笔记池）

- **概念**：detached notes 是**有正式 `.md` 文件 + `noteId`、但尚未放置到任何画布**的笔记。它们存在于笔记库中永远可被找回，替代了早期 PRD 描述的「零引用隐性丢失」风险下的 `unplaced notes` 概念。
- **数据形态**：`position: {x:0, y:0}` 占位，`data.detached: true` 标记；不在画布上渲染。
- **创建路径**：
  - 文档模式左栏 `+` 按钮 → `createDetachedNote()` 创建 Note 类型文档（文档模式新建仅支持 Note = `data.type: 'text'`；Sticky / Checklist / Folder / Image 新建入口不在文档模式暴露）。
  - 画布模式右键菜单 > 「移出到笔记库」 → `detachNoteFromCanvas()` 保留 `.md` 和 `noteId`，但清理画布实例坐标和 edges。
- **放回画布**：画布模式 `CreateMenu` 中提供「文库笔记 / Library Note」入口，打开 `DetachedNotesSidebar` 牵引列表，拖入画布时通过 `screenToFlowPosition` + `pinNoteToCanvas()` 赋予真实坐标。
- **搜索可见性**：detached notes 进入全局搜索；文档模式的 All Notes / Inbox 自然包含。

#### 状态冻结与行为差异

| 方面 | 画布模式 | 文档模式 |
| --- | --- | --- |
| `focused` 模态 | 正常进入/退出 | **禁用**（右侧已是常驻编辑器；双击 / Enter 仅触发内联编辑） |
| `folder-drill-down` | 正常进入/退出 | **禁用**；若用户在 drill-down 时切去文档模式，自动收起（Folder 展开走左栏） |
| 创建不同类型 | `CreateMenu` 全量 Note/Checklist/Image/Sticky/Folder | 仅 Note（可能后续开 Folder）。Sticky / Checklist / Image 必须先切回画布 |
| 删除带 edge 的卡片 | 无额外提示 | **自动清理 edge 无确认弹框**（决策：文档模式用户看不到连线，添加确认框反而引入权衡负担） |
| Extract to Canvas | drill-down 右键菜单/工具栏暴露 | **不暴露**（出 folder 后坐标不确定；需要返回画布完成） |
| Undo / Redo | 画布快照栈；仅覆盖节点/边的结构性与离散操作 | 正文使用 Tiptap history，标题 input 使用浏览器原生 undo；二者都与画布栈**隔离**（Cmd+Z 不冒泡到 canvas store） |

#### 默认布局模式偏好

- 设置窗口提供 `defaultLayoutMode`（`canvas` | `document`）偏好项，存入 `~/.ghostboard/app-config.json` `preferences.defaultLayoutMode`（见 §5.2）。默认 `canvas`。
- 启动时读取 settings；设置值优先于 localStorage 中的 `ghostboard.layoutMode`。

#### 搜索集成

- `Cmd+F` 在两种模式都唤起同一个 `SearchDialog`。
- 文档模式命中时：直接写入 `selectedDocumentId`（子卡片使用 `child:<folderId>:<childId>` 形式），右侧编辑器立即打开；不触发画布 `fitView`。
- 画布模式命中时：按原行为 fitView 到节点（见 §2.8）。

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
4. **删除实例不等于删除内容** —— 删除 `node` 只影响当前画布实例；当某个 `noteId` 不再被任何画布引用时，内容文件保留为可搜索的 **detached note**（见 §2.12），直到用户显式执行永久删除。删除 Folder 时同步删除其下 Card 子节点的 `.md` 文件（流程与顶层 Card 一致）；Image 子节点的附件同样会被清理。

### 5.2 应用级配置（跨 Workspace）

应用本身的全局配置独立于任何 workspace，存放在用户目录下：

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
    "language": "zh-CN",
    "defaultLayoutMode": "canvas"
  }
}
```

> `preferences.defaultLayoutMode`（`canvas` | `document`）控制冷启动时默认进入哪种布局模式，默认 `canvas`；见 §2.12。

**启动流程**：

1. 读取 `~/.ghostboard/app-config.json`
2. 若有 `activeWorkspace` → 直接打开该 workspace
3. 若无（首次启动）→ 显示欢迎页，引导用户创建或选择 workspace 目录
4. 进入 workspace 后 → 读取 `.ghostboard/workspace.json` → 加载画布

### 5.3 Workspace 文件系统结构

```
workspace/
├── .ghostboard/                        # 应用元数据（不是用户内容）
│   ├── workspace.json                  # 全局设置、活跃视图
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
    └── e5f6g7h8-photo.jpg
```

- **单一内容树**：所有笔记统一放在 `content/` 下（扁平结构）。**M5 之后 Folder Card 子节点同样在 `content/` 下拥有自己的 `.md` 文件**（与顶层 Card 并列，不使用子目录），manifest 通过 `children[].noteId + file` 引用。示意图中的 `great-ideas/` 子目录仅为远期「文件夹即目录」模型的占位示意，当前不启用。
- **Per-view manifest**：每个画布视图独立一个 `.canvas.json`，避免单文件成为写入热点。
- **附件去重**：附件文件名使用 `{hash}-{原始名}` 格式，避免同名冲突。路径统一为 workspace-relative POSIX 路径。

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
- 节点 `type` 使用 `'card'`/`'folder'`/`'group'`，与代码中 `nodeTypes` 一致。
- 节点在数组中的顺序即为 z-order（后面的覆盖前面的）。
- Folder 的 `data.children` 存放被收纳的子卡片；封面上的计数标题（如 `"3 items"`）为运行时根据 `children.length` 派生。
- Folder `children` 在 drill-down 中只用于浏览、聚焦和 `Extract to Canvas`，不作为独立 Edge 端点；需要对外表达关系时，应连到 Folder 封面节点。
- **Folder Card 子节点的水化与落盘**（M5 ✅）：加载时 `loadCanvas` 按 `noteId + file` 读取 `.md` frontmatter 与正文，通过 `noteToCardData()` 水化回 `title` / `content` / `color` 等字段填充到 `data` 中；保存时 `saveManifest` 调用 `writeNoteWithPreview()` 将正文写入子笔记的 `.md`，并把 manifest 吐到 `{ id, noteId, type, data: { noteId, file, type } }` 的引用形式（不写正文、不写 preview 元数据）。Legacy 内嵌 children 在加载时自动 stamp 一个 `noteId`，下次 save 时内容迁到 `.md`。
- **Image 子节点例外**：Folder 中的 Image 子节点继续使用 `imageFile` 附件指针模式，不分配 `noteId`，不生成 `.md`。

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
| Folder Card 子节点  | 与顶层 Card 对等：独立 `.md` + `noteId`；manifest 仅保留 `{ id, noteId, type, data: { noteId, file, type } }` 引用（M5 ✅）       | 外部编辑器可见、可跨画布复用 noteId；消除早期「仅画布内可见」降级定位       |
| Folder Image 子节点 | 继续使用 `attachments/` + `imageFile` 指针，不分配 `noteId`                                       | Image 没有文本正文概念，附件模式已足够；保持与顶层 Image 节点一致                                 |
| 默认布局模式       | `settings.json` `preferences.defaultLayoutMode`（默认 `canvas`）；启动时覆盖 localStorage                    | 用户个人偏好，各工作区一致；避免首次安装后仍落回画布                                                         |
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
- **Folder 子画布**：MVP 不把 Folder 设计为可自由摆放节点的嵌套画布，仅提供目录级 drill-down 与自动排布。

### 6.2 无障碍基线 (Accessibility Baseline)

- **键盘可达性**：Tab 在当前上下文的可聚焦控件间移动；方向键可在选中节点之间导航；`Enter` 打开聚焦；`Escape` 返回上一级。
- **语义标注**：卡片、Folder、连接点、上下文菜单需预留 ARIA label / role，保证后续可接入屏幕阅读器。文档模式左栏 `LeftRail` 的分区树目前仅是通用可聚焦列表，ARIA `tree` role + roving tabindex 的正式规范待补充（见 §8 OD-7）。
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
| 11   | **全局搜索** — Cmd+F，匹配高亮，fitView 定位（含跨画布跳转 + 文档模式直接打开右侧）         | 中     | ✅ 已完成 |
| 12   | **连线标签与动画** — 可编辑 label + 流动虚线 + Marker 端点           | 低     | ✅ 已完成 |
| 13   | **Group 嵌套** — 多级 parentId + 防循环                            | 中     | ✅ 已完成 |
| 13.1 | **画布标题栏模糊** — 顶部工具栏背景模糊效果                          | 低     | ✅ 已完成 |
| 14   | **画布导出 PNG/JSON**（文档模式下的导出语义见 §8 OD-6）                                              | 低     | ❌ 待实现 |
| 14.1 | **文档模式（Document Layout）** — LayoutSwitcher + LeftRail/NoteList/Editor 三栏 + Detached Notes       | 高     | ✅ 已完成 |
| 14.2 | **Folder Card 子节点迁移 noteId + 独立 .md**（M5）                     | 中     | ✅ 已完成 |
| 14.3 | **设置窗口与 `defaultLayoutMode` 偏好**                            | 低     | ✅ 已完成 |
| 14.4 | **文档模式 i18n（zh / en）** — LeftRail / NoteList / DocumentEditor / EditorToolbar 文案走 paraglide | 低     | ⏳ 待实施（决策已确定，见 §8 OD-8） |

### ⚪ P3 — 后续迭代

| #    | 任务                         | 复杂度 | 状态      |
| ---  | ---------------------------- | ------ | --------- |
| 15   | **多画布视图切换**           | 中     | ✅ 已完成 |
| 16   | **多 workspace 管理**        | 中     | ❌ 待实现 |
| 17   | **节点锁定**                 | 低     | ❌ 待实现 |
| 18   | **框选 (Marquee Selection)** | 低     | ❌ 待实现 |
| 19   | **导入 JSON / .md**          | 低     | ❌ 待实现 |
| 20   | **移动端适配**               | 高     | ❌ 待实现 |
| 21   | **Group 拖拽推开**           | 中     | ✅ 已完成 |
| 22   | **`extent: "parent"` 约束**  | 低     | ❌ 待实现 |
| 23   | **Edge 颜色/样式**           | 低     | ❌ 待实现 |
| 23.1 | **桌面应用图标** — 多尺寸 icns/ico | 低     | ✅ 已完成 |

### 🔮 远期

| #   | 任务                     | 说明                                                                                                                                                                                             |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 24  | **视频卡片**             | .mp4 / .gif / .webm 嵌入                                                                                                                                                                         |
| 25  | **Web Clips**            | 网页剪藏，Magazine 风格预览                                                                                                                                                                      |
| 26  | **全局快捷键快速输入**   | Quick Input from anywhere                                                                                                                                                                        |
| 27  | **AI 辅助**              | Gemini 总结、生成、关联推荐                                                                                                                                                                      |
| 28  | **商业化**               | Free + Pro 订阅                                                                                                                                                                                  |
| 29  | **双向链接 (Backlinks)** | 支持 `[[note]]` 语法在笔记正文中引用其他笔记，自动建立反向链接索引。与 Edge 系统互补——Edge 是画布上显式的视觉关系，Backlink 是内容层隐式的语义关系。侧边栏或聚焦模式底部展示"被哪些笔记引用"列表 |

---

## 8. 布局模式待决决策 (Open Decisions)

> 本章节汇总所有与**文档模式 / 布局切换**相关但尚未决策的问题。原始出处 [todo/双布局-PRD-待决问题.md](./todo/双布局-PRD-待决问题.md)——已决策项已合并到 §2.8 / §2.10 / §2.11 / §2.12 / §5.1 / §5.2 / §5.6 / §5.10；此处仅保留待决项。
>
> **迭代流程**：决策落地后请把对应行**从本表删除**，同时把内容写进正文对应小节，保持本 PRD 作为唯一事实源。

| ID    | 题目                                  | 背景与选项                                                                                                                                                                                                                                                                                                                       | 状态 |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| OD-1  | **Sticky 在文档模式的曝光**           | Sticky 今天在文档模式完全不渲染。选项：① 保持隐藏；② 左栏底部加只读的 `📌 Stickies (n)` 计数入口，点击跳回画布；③ 未来做独立的「便签收件箱」面板。影响：习惯用 Sticky 快速捕获的用户进文档模式后会失去视觉锚点。                                                                                                                                   | 待决 |
| OD-2  | **Image 在文档模式的可编辑性**        | 文档模式点击图片进入「只读预览」。选项：① 完全只读，引导切回画布改 alt / 换图；② 复用 ImageNode 右键菜单提供基础编辑（换图、改 alt、删除）。影响 Tiptap 侧图片节点的行为边界。                                                                                                                                                                  | 待决 |
| OD-3  | **Checklist 在文档模式的形态**        | 选项：① 右侧面板嵌入原 ChecklistNode（`data.items` 结构，与画布对齐）；② 在右侧转换为 Tiptap task list（需做 `data.items` ↔ Tiptap doc 双向序列化，且 PRD §2.2 明确 Checklist 不走 markdown-it）。影响：是否需要新增序列化层，以及 checklist 作为 note 文件的磁盘格式。                                                                                          | 待决 |
| OD-4  | **layoutMode 的作用域**               | 当前实现：全局（localStorage + `settings.defaultLayoutMode`）。选项：① per-view 持久化到每个 `.canvas.json`（Roadmap 视图=文档、Brainstorm=画布）；② per-workspace；③ 维持全局。同时要决定新建 View 时默认 layoutMode 是否继承当前。                                                                                                                         | 待决 |
| OD-5  | **模式切换时的 viewport / 编辑态细节** | 切到文档模式时：① 当前 Tiptap 草稿是否强制 flush（目前走 1500ms debounce，切换不主动 flush）？切回画布模式：② 默认恢复上次 viewport，还是 fitView 到当前选中的文档？                                                                                                                           | 待决 |
| OD-6  | **导出 PNG/SVG 在文档模式的语义**     | 画布模式导出的是视口截图。文档模式下选项：① 禁用导出按钮（引导切回画布）；② 替换为「导出 Markdown」（当前选中文档或整棵树）。与路线图 #14 耦合。                                                                                                                                                                                                       | 待决 |
| OD-7  | **左栏 ARIA tree role 规范**          | 目前 LeftRail 仅是通用可聚焦列表。需确定：① 使用 ARIA `tree` + `treeitem` + roving tabindex 的正式实现；② 展开/折叠使用 `aria-expanded`；③ 与 `NoteList` 组成 `tree` + `tabpanel` 还是并列 region。这比 §6.2 的「键盘可达」更具体，落地后回写 §6.2。                                                                                                                        | 待决 |
| OD-8  | **文档模式 i18n（zh / en）**          | **决策已确定**（需补 zh / en 两套），**待实施**：`messages/{en,zh}.json` 增 ~17 个 `document.*` key；替换 LeftRail、NoteList、DocumentEditor、EditorToolbar 中硬编码英文字符串为 paraglide 调用；路线图 #14.4 跟踪。                                                                                                                                                | 待实施 |

### 8.1 已落地的决策映射（供回查）

| 原 TODO 编号 | 决策摘要                                               | 落地位置                       |
| ------------ | ------------------------------------------------------ | ------------------------------ |
| 决策 1 / 2   | 文档模式新建仅 Note 类型，通过 `createDetachedNote`    | §2.12「Detached notes」        |
| 决策 3       | Folder 子卡片强制 `noteId + .md`（M5）                 | §5.1、§5.6、§5.10 决策表       |
| 决策 7       | 文档模式禁用 folder drill-down，切换时自动收起         | §2.12「状态冻结与行为差异」表  |
| 决策 8       | 文档模式禁用 `focused`，双击/Enter → 内联编辑          | §2.12「状态冻结与行为差异」表  |
| 决策 9       | 文档模式不暴露 Extract to Canvas                       | §2.12「状态冻结与行为差异」表  |
| 决策 11      | Detached notes 取代 `unplaced notes`                   | §2.8、§2.12「Detached notes」  |
| 决策 12      | document 模式冻结画布所有状态                          | §2.11 末尾的「与布局模式的关系」|
| 决策 13      | 快捷键差异化（画布 vs 文档）                           | §2.10 快捷键表新增文档模式列   |
| 决策 14      | Tiptap 与画布 undo/redo 栈隔离                         | §2.10、§2.12 行为差异表        |
| 决策 15      | 删除带 edge 的卡片自动清理不提示                       | §2.12 行为差异表               |
| 决策 16      | `defaultLayoutMode` 偏好（默认 canvas）                | §2.12、§5.2、§5.10             |
| 决策 18      | LayoutSwitcher 置顶，ViewSwitcher 保持底部             | §2.12「切换器」                |
| 决策 19      | 默认按 `updatedAt` 倒序排序                            | §2.12「文档模式布局」          |
| 决策 20      | 文档模式 `Cmd+F` 命中后直接打开右侧编辑器              | §2.8、§2.12「搜索集成」        |

> **表中未列出的 TODO 决策编号（4、5、6、10、17、21、22、23）均仍在 §8 上方的 OD-1..OD-8 待决表中，未来决策落地后再回填本表。**
