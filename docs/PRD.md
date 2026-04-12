# 产品需求文档 (PRD)：Spatial Canvas 自由画布知识库

> **相关文档**
>
> - [技术规范文档](./tech-spec.md) — 架构、技术栈、目录结构、状态管理、渲染动画、性能预算、数据持久化、RPC 协议、编码约定

## 1. 产品概述

- **产品定位**：一款面向思考者、设计师和研究人员的视觉化个人知识库。
- **核心痛点**：解决传统线性笔记（如备忘录、文档）带来的信息碎片化和认知负担。让用户像在白板上一样，通过空间位置、距离和组合来建立知识的关联。
- **核心亮点**：无限缩放平移、所见即所得的卡片编辑、以及极致平滑的沉浸式层级切换动效。

## 2. 核心功能模块与交互逻辑

### 2.1 无限自由画布 (Infinite Canvas)

- **功能描述**：一个没有边界的 2D 空间，用户可以在任意位置放置内容节点。
- **交互逻辑**：
  - **平移 (Panning)**：支持触控板双指滑动或鼠标中键拖拽，实现画布的无级平移。
  - **缩放 (Zooming)**：支持触控板捏合或 `Ctrl/Cmd + 滚轮` 缩放。采用**语义化缩放 (Semantic Zoom)**：在极小比例下只显示色块和标题，放大后逐渐显示详细文本和可交互控件。
  - **选择与聚焦 (Selection & Focus)**：
    - 采用"两步打开"模型（✅ 已实现）——单击节点进入 `selected` 状态，用于高亮、批量操作和拖拽；双击或 `Enter` 才进入聚焦模式或 Folder drill-down 视图。`Shift+Click` 可追加/切换选中，多选集合支持批量拖拽、删除、复制粘贴、拖入 Group/Folder。
    - 为避免误触发，拖拽、连线和框选判定优先于双击/打开判定；鼠标位移超过轻微阈值（默认 `4px`）后不再视为点击。
  - **框选 (Marquee Selection)**：桌面端在画布空白处左键拖拽绘制选择框，选中矩形范围内的多个节点。当前 `selectionOnDrag` 默认关闭（避免与平移手势冲突），后续视交互体验决定是否启用。进入聚焦模式或 Folder drill-down 后，框选仅作用于当前上下文，不影响背景画布。

### 2.2 多模态信息卡片 (Content Cards)

- **功能描述**：画板上的基本元素，支持不同类型的数据载体。
- **卡片类型**：
  - **图文卡片**：包含图片和文本（如演示中的 Target audience 饼图卡片）。
  - **待办列表 (Checklist)**：支持在画布上**直接无缝编辑**。用户可以双击直接在列表末尾敲击键盘添加新条目（如演示中添加 "Add great search"），无需进入特殊的编辑模式。画布上的勾选和添加条目操作不改变交互状态（保持 `idle` 或 `selected`），不触发 `inline-editing`；仅当需要完整编辑时通过聚焦模式处理。
  - **长文本/文档**：承载长篇幅的文章。
  - **图片卡片**：支持拖拽上传、粘贴、或从文件选择器导入图片。在画布上显示图片缩略图，聚焦模式下显示原图。
  - **便签 (Sticky Note)**：轻量级的彩色便签，支持快速记录短文本。可自由调整大小，提供多种预设颜色。便签默认可拖拽；双击进入原地编辑模式，失焦后自动保存。便签**不支持**聚焦放大模式（FocusedView），所有编辑均在画布上原地完成。
- **卡片通用能力**：
  - **自由调整大小 (Resize)**：所有卡片均支持拖拽边角/边缘来调整宽高，不再固定为 350×450。调整时保持内容自适应重排。
  - **复制/粘贴**：支持 `Cmd+C` / `Cmd+V` 复制粘贴卡片。
  - **聚焦入口约定**：双击卡片或选中后按 `Enter` 进入聚焦模式（FocusedView），卡片平滑放大至屏幕中央。Checklist 卡片在画布上可直接勾选和添加条目，无需进入聚焦模式。
  - **创建流程**：画布右下角提供 `CreateMenu` 浮动按钮，支持快速新建卡片（Card）或文件夹（Folder），新节点在当前视口中心创建。后续计划支持 `Cmd/Ctrl+N` 快捷键和右键菜单创建。

### 2.3 沉浸式聚焦模式 (Focused View / Modal Expansion)

- **功能描述**：当用户需要深度阅读或查看某一张卡片时，提供无干扰的阅读环境。
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

#### 2.5.2 Folder 堆叠式文件夹 (Folder Stack)

- **功能描述**：在二维画布上引入第三个维度（Z轴层级）。将多个相关的卡片收纳为一个视觉上的"堆叠实体"（Folder），子节点**隐藏**。
- **交互逻辑**：
  - **外观**：在画布上表现为一个带有标签的堆叠卡片组（如演示中的 "3 items - The really great ideas..."）。
  - **进入图层 (Drill-down)**：选中文件夹后双击、按 `Enter`，或通过右键菜单 `Open` 触发**隔离层模式**。
    - 背景画布整体变暗或模糊（失去焦点）。
    - 文件夹内的卡片从堆叠状态平滑展开（散开）到当前的临时图层上，供用户浏览或编辑。MVP 采用确定性的自动排布（横向 strip 或 grid），排列顺序按 `children` 数组索引（即拖入先后顺序），不提供自由拖拽排序，因此不额外持久化 Folder 内部坐标。
      - 在此模式下，画布上的其他非同组元素不可见或不可交互。
  - **退出图层**：点击背景空白处或返回按钮，展开的卡片平滑收缩回堆叠状态，背景画布恢复明亮和可交互状态。
  - **成员来源**：Folder 的成员通过 `data.children` 数组内嵌在 manifest 中。用户可将画布上的卡片拖入 Folder，卡片从画布节点列表移除并追加到该 Folder 的 `children` 数组。Folder 封面上的计数标题（如 "3 items"）为运行时根据 `children.length` 派生。后续引入本地文件系统持久化后，可考虑迁移为目录驱动模型。为避免留下悬空连接，带现有 Edge 的卡片在 MVP 中不可直接拖入 Folder——拖入时系统应通过 toast 提示"请先断开该卡片的连线"并取消 drop 操作；用户需先手动断开相关连线，或创建新的无连线实例后再收纳。
  - **取回到主画布（MVP）**：drill-down 视图中仍不支持“自由拖拽穿出”回主画布，但必须提供显式 `Move to Canvas` / `Extract` 操作。执行后，会把该子卡片作为新的画布节点实例放回 Folder 邻近区域或当前视口中心，保证 Folder 不是“只进不出”的死胡同。**Extract 后的身份**：由于 Folder `children` 中的子卡片在 MVP 阶段没有独立 `.md` 文件，Extract 时需为其新建一个 `.md` 文件并分配 `noteId`，使之成为完整的独立 Card 节点（与 Sticky 不同，Sticky 保持无 `.md` 的轻量模型）。
  - **Folder 内操作边界（MVP）**：支持在 drill-down 视图中浏览和聚焦子卡片；不支持自由拖拽改变卡片顺序，也不支持跨 Folder 边界直接建立子卡片连线。后续若需要自由布局，将升级为子画布模型单独设计。
  - **适用场景**：归档收纳、减少画布视觉噪音。

### 2.6 右键菜单 / Context Menu

- **功能描述**：右键菜单是画布上的高频操作入口，避免用户频繁依赖顶部工具栏或记忆快捷键。
- **交互逻辑**：
  - **画布空白处右键**：提供新建卡片（`note` / `checklist` / `image` / `sticky`）、粘贴、新建 Group、重置缩放到 100% 等操作。
  - **卡片上右键**：提供复制、从当前画布移除、改颜色、移动到 Folder、锁定/解锁、打开聚焦模式等操作；“永久删除内容”属于显式二次确认的破坏性动作，不与普通删节点合并。
  - **Folder 上右键**：提供打开 Folder、重命名显示标签、在该 Folder 内新建卡片、在系统文件管理器中显示目录等操作。Folder drill-down 视图中的子卡片菜单需额外提供 `Extract to Canvas`。
  - **连线上右键**：提供删除连线、编辑标签、修改样式/颜色。即使 Edge 在 MVP 早期未完全实现，菜单结构仍需提前定义，避免后续交互再重构。

### 2.7 搜索 (Search)

- **功能描述**：全局搜索 workspace 中的所有内容，包括画布上的卡片标题、正文、待办事项文本，以及暂时未被任何画布引用的 `unplaced notes`。
- **交互逻辑**：
  - 通过 `Cmd+F` 或顶部搜索图标唤起搜索面板。
  - 输入关键词后，实时高亮匹配的卡片，未匹配的卡片降低透明度。
  - 点击搜索结果项，若该内容已有画布实例，则自动平移缩放至对应卡片位置；若该内容当前没有任何节点实例，则提供“放回当前画布”操作，在视口中心创建新节点。
  - **排序规则（MVP）**：标题匹配优先于正文匹配；同等匹配度下按 `updatedAt` 降序排列。Folder 内的子卡片内容纳入搜索范围。后续可引入相关性评分。
  - **`unplaced notes` 的可见性（MVP）**：`unplaced notes` 在 MVP 阶段仅通过全局搜索可达，不提供独立的管理面板或侧边栏列表。搜索结果中会标注 `unplaced` 标签以区分。用户可通过搜索找到后"放回画布"或"永久删除"（二次确认）。专用 unplaced notes 管理面板属后续迭代。

### 2.8 撤销/重做 (Undo / Redo)

- **功能描述**：对画布上所有操作（移动、创建、删除、编辑、拖入文件夹等）提供撤销和重做能力。
- **交互逻辑**：
  - `Cmd+Z` 撤销，`Cmd+Shift+Z` 重做。
  - 维护一个操作历史栈（Operation History Stack），每次用户操作生成一个快照或差异记录。
  - **栈深度上限**：最多保留 **100** 步操作历史，超出后丢弃最早记录，避免大画布场景下内存不可控增长。
  - **撤销与持久化的一致性策略**：撤销/重做仅回滚内存状态，不直接触发磁盘反向写入。下一次 debounce 到期时，以当前内存状态为准覆盖磁盘文件。这意味着：用户编辑 → debounce 写盘 → `Cmd+Z` 撤销 → 内存回滚 → 下次 debounce 再次以内存状态覆盖磁盘，保证内存与磁盘最终一致。
  - **生命周期**：撤销栈仅存在于内存中，关闭应用或切换 workspace 后清空，不做持久化。

### 2.9 键盘快捷键体系 (Keyboard Shortcuts)

| macOS                   | Windows / Linux           | 操作                                                                            |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `Cmd+Z` / `Cmd+Shift+Z` | `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销 / 重做                                                                     |
| `Cmd+C` / `Cmd+V`       | `Ctrl+C` / `Ctrl+V`       | 复制 / 粘贴卡片                                                                 |
| `Delete` / `Backspace`  | `Delete` / `Backspace`    | 从当前画布移除选中的节点（不删除 .md 内容文件；永久删除需通过右键菜单二次确认） |
| `Cmd+F`                 | `Ctrl+F`                  | 打开搜索                                                                        |
| `Cmd+A`                 | `Ctrl+A`                  | 全选当前上下文中的节点                                                          |
| `Cmd+N`                 | `Ctrl+N`                  | 打开新建卡片菜单                                                                |
| `Enter`                 | `Enter`                   | 打开选中卡片的聚焦模式                                                          |
| `Escape`                | `Escape`                  | 关闭聚焦/文件夹视图、退出搜索/菜单                                              |

### 2.10 交互状态机 (Interaction State Machine)

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
| 构建工具   | Vite + Bun                    |
| 桌面运行时 | Electrobun                    |
| 国际化     | Paraglide / Inlang（en / zh） |

| 状态管理 | Zustand + TanStack React Query |

> 渲染引擎、语义缩放、FLIP 动画、性能预算与降级策略等技术实现细节请参阅 [技术规范文档](./tech-spec.md)。

---

## 5. Local-First 数据架构

### 5.1 核心原则

1. **文件即数据源（File as Source of Truth）**—— 每张 **Card 类型**卡片对应磁盘上一个 `.md` 文件，画布布局用独立的 manifest 文件管理。Sticky（便签）的内容直接内嵌在 manifest `data.content` 中，不生成独立 `.md` 文件；Folder `children` 中的子卡片在 MVP 阶段同样内嵌在 manifest 中（参见 §5.10 Folder 模型决策）。**⚠️ MVP 降级定位**：Folder 子卡片属于"草稿 / 闪念暂存"性质，其内容**仅在 Spatial Canvas 内可见**，无法通过 Obsidian、Typora 等外部编辑器打开或编辑，也不具备独立 `noteId`，不可被其他画布复用。UI 上需在 Folder drill-down 视图中标注"仅画布内可见"提示。用户若需将子卡片提升为正式笔记，应通过 `Extract to Canvas` 操作（Extract 时自动创建 `.md` 并分配 `noteId`）。后续迭代将把 Folder children 迁移为 `noteId` 引用 + 独立 `.md` 文件模型。
2. **内容与布局解耦** —— 内容级属性（标题、标签、创建时间）存 frontmatter；视图级属性（位置、大小、层级）存 manifest。
3. **`noteId` ≠ `nodeId`** —— 内容实体 ID 和画布实例 ID 分离，同一篇笔记可在多个画布或同一画布中多次出现。
4. **删除实例不等于删除内容** —— 删除 `node` 只影响当前画布实例；当某个 `noteId` 不再被任何画布引用时，内容文件保留为可搜索的 `unplaced note`，直到用户显式执行永久删除。

### 5.2 应用级配置（跨 Workspace）

应用本身的全局配置独立于任何 workspace，存放在用户目录下：

```
~/.spatial-canvas/
└── app-config.json
```

```json
{
  "schema": "spatial-app/v1",
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

1. 读取 `~/.spatial-canvas/app-config.json`
2. 若有 `activeWorkspace` → 直接打开该 workspace
3. 若无（首次启动）→ 显示欢迎页，引导用户创建或选择 workspace 目录
4. 进入 workspace 后 → 读取 `.spatial/workspace.json` → 加载画布

### 5.3 Workspace 文件系统结构

```
workspace/
├── .spatial/                           # 应用元数据（不是用户内容）
│   ├── workspace.json                  # 全局设置、活跃视图
│   └── views/                          # 每个画布一个 manifest
│       ├── default.canvas.json
│       └── roadmap.canvas.json
├── content/                            # 统一内容树
│   ├── who-spatial-is-for.md
│   ├── prio-before-launch.md
│   ├── alpha-feedback.md
│   └── great-ideas/                    # 后续迁移目标：文件夹即目录（MVP 阶段 Folder children 内嵌在 manifest 中）
│       ├── floating-notes.md
│       └── drop-in-anything.md
└── attachments/                        # 图片和附件（文件名带哈希前缀避免冲突）
    ├── a1b2c3d4-chart.png
    └── e5f6g7h8-photo.jpg
```

- **单一内容树**：所有笔记统一放在 `content/` 下。MVP 阶段 Folder 子卡片内嵌在 manifest 的 `children` 数组中，不生成独立子目录；后续持久化迭代可迁移为"文件夹即目录"模型（参见 §5.10）。
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

`.spatial/workspace.json`：

```json
{
  "schema": "spatial-workspace/v1",
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

`.spatial/views/default.canvas.json`（与 @xyflow/react 原生 Node/Edge JSON 完全一致）：

```json
{
  "schema": "spatial-canvas/v1",
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
            "type": "card",
            "data": {
              "type": "text",
              "content": "Floating notes idea",
              "color": "#A3E635"
            }
          },
          {
            "id": "child_2",
            "type": "card",
            "data": {
              "type": "text",
              "content": "Drop in anything",
              "color": "#FFFFFF"
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
- **⚠️ MVP 限制**：Folder 子卡片内嵌在 manifest 中，无独立 `.md` 文件和 `noteId`，仅在 Spatial Canvas 内可见，外部编辑器无法访问。后续迭代将迁移为 `noteId` 引用模型。

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
| 内容生命周期       | 删 `node` 只删实例；零引用 `note` 保留为 `unplaced`                             | 避免误删共享内容，也避免内容文件无入口可找回                               |
| Folder 模型        | `children` 数组内嵌在 manifest 中（⚠️ 子卡片仅画布内可见，定位为草稿/闪念暂存） | 当前无持久化层，内嵌最直接；后续迁移为 `noteId` 引用 + 独立 `.md` 文件模型 |
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
- **语义标注**：卡片、Folder、连接点、上下文菜单需预留 ARIA label / role，保证后续可接入屏幕阅读器。
- **视觉对比**：颜色不是唯一状态来源；选中、锁定、错误态需同时提供描边、图标或文字反馈，高对比主题作为预留能力。

---

## 7. 迭代路线图 (Roadmap)

> 各任务的涉及文件、实现要点和关键算法请参阅 [技术规范文档](./tech-spec.md)。

### 🔴 P0 — 核心交互完善

| #   | 任务                                                      | 复杂度 | 状态      |
| --- | --------------------------------------------------------- | ------ | --------- |
| 1   | **右键菜单 (Context Menu)** — 画布/卡片/Folder 三种上下文 | 中     | ✅ 已完成 |
| 2   | **键盘快捷键** — Delete/Cmd+C/V/A/N/Z、模态屏蔽           | 低     | ✅ 已完成 |
| 3   | **节点连线 (Edges)** — 四向 Handle + smoothstep           | 中     | ✅ 已完成 |
| 4   | **选择模型重构** — 单击=选中，双击/Enter=聚焦             | 中     | ✅ 已完成 |
| 5   | **FolderNode Resize** — NodeResizeControl                 | 低     | ✅ 已完成 |

### 🟡 P1 — 核心特性（差异化亮点）

| #   | 任务                                              | 复杂度 | 状态      |
| --- | ------------------------------------------------- | ------ | --------- |
| 6   | **Group 开放式分组** — 三阶段拖拽 + 预设颜色      | 高     | ✅ 已完成 |
| 7   | **撤销/重做 (Undo/Redo)** — 快照历史栈            | 中     | ✅ 已完成 |
| 8   | **便签 (Sticky Note)** — 双击原地编辑，不进入聚焦 | 低     | ✅ 已完成 |
| 9   | **图片卡片** — 拖拽/粘贴上传，缩略图/原图切换     | 中     | ✅ 已完成 |

### 🟢 P2 — 数据层与增强功能

| #   | 任务                                                               | 复杂度 | 状态      |
| --- | ------------------------------------------------------------------ | ------ | --------- |
| 10  | **数据持久化** — 端到端链路（manifest + .md 拆分 + RPC + hydrate） | 高     | ✅ 已完成 |
| 11  | **全局搜索** — Cmd+F，匹配高亮，fitView 定位                       | 中     | ❌ 待实现 |
| 12  | **连线标签与动画** — 可编辑 label + 流动虚线                       | 低     | ✅ 已完成 |
| 13  | **Group 嵌套** — 多级 parentId + 防循环                            | 中     | ✅ 已完成 |
| 14  | **画布导出 PNG/JSON**                                              | 低     | ❌ 待实现 |

### ⚪ P3 — 后续迭代

| #   | 任务                         | 复杂度 | 状态      |
| --- | ---------------------------- | ------ | --------- |
| 15  | **多画布视图切换**           | 中     | ❌ 待实现 |
| 16  | **多 workspace 管理**        | 中     | ❌ 待实现 |
| 17  | **节点锁定**                 | 低     | ❌ 待实现 |
| 18  | **框选 (Marquee Selection)** | 低     | ❌ 待实现 |
| 19  | **导入 JSON / .md**          | 低     | ❌ 待实现 |
| 20  | **移动端适配**               | 高     | ❌ 待实现 |
| 21  | **Group 拖拽推开**           | 中     | ✅ 已完成 |
| 22  | **`extent: "parent"` 约束**  | 低     | ❌ 待实现 |
| 23  | **Edge 颜色/样式**           | 低     | ❌ 待实现 |

### 🔮 远期

| #   | 任务                   | 说明                        |
| --- | ---------------------- | --------------------------- |
| 24  | **视频卡片**           | .mp4 / .gif / .webm 嵌入    |
| 25  | **Web Clips**          | 网页剪藏，Magazine 风格预览 |
| 26  | **全局快捷键快速输入** | Quick Input from anywhere   |
| 27  | **AI 辅助**            | Gemini 总结、生成、关联推荐 |
| 28  | **商业化**             | Free + Pro 订阅             |
