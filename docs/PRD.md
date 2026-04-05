# 产品需求文档 (PRD)：Spatial Canvas 自由画布知识库

## 1. 产品概述
* **产品定位**：一款面向思考者、设计师和研究人员的视觉化个人知识库。
* **核心痛点**：解决传统线性笔记（如备忘录、文档）带来的信息碎片化和认知负担。让用户像在白板上一样，通过空间位置、距离和组合来建立知识的关联。
* **核心亮点**：无限缩放平移、所见即所得的卡片编辑、以及极致平滑的沉浸式层级切换动效。

## 2. 核心功能模块与交互逻辑

### 2.1 无限自由画布 (Infinite Canvas)
* **功能描述**：一个没有边界的 2D 空间，用户可以在任意位置放置内容节点。
* **交互逻辑**：
    * **平移 (Panning)**：支持触控板双指滑动或鼠标中键拖拽，实现画布的无级平移。
    * **缩放 (Zooming)**：支持触控板捏合或 `Ctrl/Cmd + 滚轮` 缩放。采用**语义化缩放 (Semantic Zoom)**：在极小比例下只显示色块和标题，放大后逐渐显示详细文本和可交互控件。
  * **选择与聚焦 (Selection & Focus)**：当前实现中，单击卡片直接进入聚焦模式（FocusedView），单击 Folder 进入 drill-down 视图。后续迭代可引入"单击选中 → 双击/Enter 聚焦"的两步交互。`Shift+Click` 可追加/切换选中，多选集合支持批量拖拽、删除、复制粘贴、拖入 Group/Folder。
  * **框选 (Marquee Selection)**：桌面端在画布空白处左键拖拽绘制选择框，选中矩形范围内的多个节点。当前 `selectionOnDrag` 默认关闭（避免与平移手势冲突），后续视交互体验决定是否启用。进入聚焦模式或 Folder drill-down 后，框选仅作用于当前上下文，不影响背景画布。

### 2.2 多模态信息卡片 (Content Cards)
* **功能描述**：画板上的基本元素，支持不同类型的数据载体。
* **卡片类型**：
    * **图文卡片**：包含图片和文本（如演示中的 Target audience 饼图卡片）。
    * **待办列表 (Checklist)**：支持在画布上**直接无缝编辑**。用户可以双击直接在列表末尾敲击键盘添加新条目（如演示中添加 "Add great search"），无需进入特殊的编辑模式。
    * **长文本/文档**：承载长篇幅的文章。
    * **图片卡片**：支持拖拽上传、粘贴、或从文件选择器导入图片。在画布上显示图片缩略图，聚焦模式下显示原图。
    * **便签 (Sticky Note)**：轻量级的彩色便签，支持快速记录短文本。可自由调整大小，提供多种预设颜色。
* **卡片通用能力**：
    * **自由调整大小 (Resize)**：所有卡片均支持拖拽边角/边缘来调整宽高，不再固定为 350×450。调整时保持内容自适应重排。
    * **复制/粘贴**：支持 `Cmd+C` / `Cmd+V` 复制粘贴卡片。
    * **聚焦入口约定（当前实现）**：单击卡片即进入聚焦模式（FocusedView），卡片平滑放大至屏幕中央。Checklist 卡片在画布上可直接勾选和添加条目，无需进入聚焦模式。后续迭代计划将单击改为选中，聚焦改由展开按钮或 `Enter` 触发，并引入双击原地编辑。
    * **创建流程**：画布右下角提供 `CreateMenu` 浮动按钮，支持快速新建卡片（Card）或文件夹（Folder），新节点在当前视口中心创建。后续计划支持 `Cmd/Ctrl+N` 快捷键和右键菜单创建。

### 2.3 沉浸式聚焦模式 (Focused View / Modal Expansion)
* **功能描述**：当用户需要深度阅读或查看某一张卡片时，提供无干扰的阅读环境。
* **交互逻辑（当前实现）**：单击卡片即进入聚焦模式。卡片通过 FLIP 动画从画布位置平滑放大至屏幕中央，成为主视图；背景画布被一层半透明遮罩（Overlay/Dimmer）覆盖，屏蔽其他元素的干扰。点击遮罩或按 `Escape` 退回画布，卡片收缩回原位。

### 2.4 节点连线 (Edges / Connections)
* **功能描述**：卡片之间可以建立有向连线，表达知识的关联、依赖或流转关系。
* **交互逻辑**：
    * 鼠标悬停卡片边缘出现连接点 (Handle)，从连接点拖拽到另一卡片即可建立连线。
    * 每个卡片提供四个方向（上/右/下/左）的连接点。
    * 连线默认为 `smoothstep`（平滑折线）样式，支持 `animated` 流动动画。
    * 连线可添加文本标签，用于标注关系类型。

### 2.5 💡 两种分组模式 —— *核心特性*

本应用提供两种互补的卡片组织方式：

#### 2.5.1 Group 开放式分组 (Open Group)
* **功能描述**：在画布上创建一个可调整大小的彩色容器区域，子节点**直接展示**在画布上，所见即所得。
* **交互逻辑**：
    * **拖入**：将卡片拖入 Group 区域，自动成为子节点（位置转换为相对于 Group 的局部坐标）。
    * **拖出**：将卡片拖出 Group 边界，自动脱离父子关系（位置转换回画布绝对坐标）。
    * **嵌套**：Group 可嵌套 Group（需防止循环嵌套）。
    * **连线**：Group 内的子节点可以与画布上任意节点建立连线。
    * **适用场景**：主题分区、看板、思维导图分支。

#### 2.5.2 Folder 堆叠式文件夹 (Folder Stack)
* **功能描述**：在二维画布上引入第三个维度（Z轴层级）。将多个相关的卡片收纳为一个视觉上的"堆叠实体"（Folder），子节点**隐藏**。
* **交互逻辑**：
    * **外观**：在画布上表现为一个带有标签的堆叠卡片组（如演示中的 "3 items - The really great ideas..."）。
    * **进入图层 (Drill-down)**：点击该文件夹，触发**隔离层模式**。
        * 背景画布整体变暗或模糊（失去焦点）。
      * 文件夹内的卡片从堆叠状态平滑展开（散开）到当前的临时图层上，供用户浏览或编辑。MVP 采用确定性的自动排布（横向 strip 或 grid），不提供自由拖拽排序，因此不额外持久化 Folder 内部坐标。
        * 在此模式下，画布上的其他非同组元素不可见或不可交互。
    * **退出图层**：点击背景空白处或返回按钮，展开的卡片平滑收缩回堆叠状态，背景画布恢复明亮和可交互状态。
    * **成员来源**：Folder 的成员通过 `data.children` 数组内嵌在 manifest 中。用户可将画布上的卡片拖入 Folder，卡片从画布节点列表移除并追加到该 Folder 的 `children` 数组。Folder 封面上的计数标题（如 "3 items"）为运行时根据 `children.length` 派生。后续引入本地文件系统持久化后，可考虑迁移为目录驱动模型。
    * **Folder 内操作边界（MVP）**：支持在 drill-down 视图中浏览和聚焦子卡片；不支持自由拖拽改变卡片顺序，也不支持直接从 drill-down 视图把卡片拖回主画布。后续若需要自由布局，将升级为子画布模型单独设计。
    * **适用场景**：归档收纳、减少画布视觉噪音。

### 2.6 右键菜单 / Context Menu
* **功能描述**：右键菜单是画布上的高频操作入口，避免用户频繁依赖顶部工具栏或记忆快捷键。
* **交互逻辑**：
    * **画布空白处右键**：提供新建卡片（`note` / `checklist` / `image` / `sticky`）、粘贴、新建 Group、重置缩放到 100% 等操作。
    * **卡片上右键**：提供复制、删除、改颜色、移动到 Folder、锁定/解锁、打开聚焦模式等操作。
    * **Folder 上右键**：提供打开 Folder、重命名显示标签、在该 Folder 内新建卡片、在系统文件管理器中显示目录等操作。
    * **连线上右键**：提供删除连线、编辑标签、修改样式/颜色。即使 Edge 在 MVP 早期未完全实现，菜单结构仍需提前定义，避免后续交互再重构。

### 2.7 搜索 (Search)
* **功能描述**：全局搜索画布上的所有内容，包括卡片标题、正文、待办事项文本。
* **交互逻辑**：
    * 通过 `Cmd+F` 或顶部搜索图标唤起搜索面板。
    * 输入关键词后，实时高亮匹配的卡片，未匹配的卡片降低透明度。
    * 点击搜索结果项，画布自动平移缩放至对应卡片位置。

### 2.8 撤销/重做 (Undo / Redo)
* **功能描述**：对画布上所有操作（移动、创建、删除、编辑、拖入文件夹等）提供撤销和重做能力。
* **交互逻辑**：
    * `Cmd+Z` 撤销，`Cmd+Shift+Z` 重做。
    * 维护一个操作历史栈（Operation History Stack），每次用户操作生成一个快照或差异记录。

### 2.9 键盘快捷键体系 (Keyboard Shortcuts)
| macOS | Windows / Linux | 操作 |
|--------|------------------|------|
| `Cmd+Z` / `Cmd+Shift+Z` | `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销 / 重做 |
| `Cmd+C` / `Cmd+V` | `Ctrl+C` / `Ctrl+V` | 复制 / 粘贴卡片 |
| `Delete` / `Backspace` | `Delete` / `Backspace` | 删除选中的卡片或文件夹 |
| `Cmd+F` | `Ctrl+F` | 打开搜索 |
| `Cmd+A` | `Ctrl+A` | 全选当前上下文中的节点 |
| `Cmd+N` | `Ctrl+N` | 打开新建卡片菜单 |
| `Enter` | `Enter` | 打开选中卡片的聚焦模式 |
| `Escape` | `Escape` | 关闭聚焦/文件夹视图、退出搜索/菜单 |

### 2.10 交互状态机 (Interaction State Machine)

| 状态 | 进入条件 | 退出条件 | 约束 |
|---|---|---|---|
| `idle` | 默认状态；点击空白处；完成操作后回落 | 选中节点、开始拖拽、打开菜单、按下快捷键 | 允许平移、缩放、框选 |
| `selected` | 单击节点（当前实现中单击直接进入 `focused`）；`Shift+Click` 追加选择 | 点击空白、`Escape`、进入其他状态 | 允许批量拖拽、删除、复制 |
| `marquee-selecting` | 在空白处左键拖拽 | 鼠标释放 | 仅桌面端启用；与中键平移互不冲突 |
| `dragging` | 拖拽一个或多个已选节点 | 鼠标释放或取消 | 暂停双击判定，避免误触发编辑 |
| `inline-editing` | 双击可编辑卡片；创建卡片后自动进入 | `Escape`、提交、点击其他区域 | 编辑期间禁用画布级快捷键，保留 `Cmd/Ctrl+Enter` 提交 |
| `focused` | 单击卡片（当前）；后续改为展开按钮或 `Enter` | 返回按钮、点击遮罩、`Escape` | 背景画布不可交互 |
| `folder-drill-down` | 点击 Folder | 返回按钮、背景空白、`Escape` | 仅当前 Folder 内容可交互；背景画布冻结 |
| `connecting` | 从 Handle 开始拖出连线 | 连接成功、取消 | 禁止进入编辑与聚焦 |

**状态优先级规则**：`dragging` 与 `connecting` 高于双击/编辑判定；`focused` 和 `folder-drill-down` 为全屏模态上下文，会冻结背景画布；`inline-editing` 期间不响应框选与节点拖拽。

---

## 3. 关键动画与动效规范 (Motion Design Specs)

这是本产品的核心灵魂，也是前端实现的重点挑战。所有动画都必须遵循**"空间连续性"**原则，即用户要清晰地感知到元素是从哪里来的，又回到了哪里。

### 3.1 缩放与平移 (Pan & Zoom)
* **动效要求**：必须达到 60fps 甚至 120fps。不能有卡顿感。
* **缓动曲线**：使用弹簧物理引擎（Spring Physics）而非简单的线性或贝塞尔曲线（如 Ease-in-out），让拖拽停止时的惯性滑动显得自然。

### 3.2 共享元素过渡动画 (Shared Element Transition) - *卡片聚焦*
* **动效要求**：当卡片从画布态切换到聚焦态时，它不是突然弹出的 Dialog，而是**当前这块卡片本身发生形变和位移**。
* **拆解过程**：
    1.  用户点击卡片。
    2.  背景迅速叠加一层黑色半透明遮罩（`opacity: 0 -> 0.6`，耗时 ~200ms）。
    3.  被点击的卡片解除在画布中的绝对定位，通过计算其在视口中的初始位置 (BoundingClientRect) 和目标位置（屏幕中央），执行放大和平移动画。
    4.  卡片内部的元素（如图片、文字）进行流式重排（Reflow）的平滑过渡。

### 3.3 文件夹展开/收起动画 (Folder Stacking & Spreading)
* **展开动效**：
    * 点击"堆叠容器"。
    * 容器消失，内部包含的 3 张卡片以容器原先的中心点为基准，向四周呈放射状（或线性排布）平滑移动至目标位置。
    * 同时，卡片的缩放比例从缩小状态恢复为 1:1，透明度从较低恢复到 1。
* **缓动推荐**：稍微带一点点弹性（Bouncy）的 Spring 曲线，增加由于"释放"带来的物理反馈感。

---

## 4. 技术实现方案 (Technical Approach)

### 4.1 渲染引擎与动画技术

1.  **渲染引擎**：使用 **@xyflow/react**（React Flow）作为画布引擎，DOM + 硬件加速方案。整个大画布通过 `transform: translate(x, y) scale(z)` 控制，内部节点绝对定位。当前 `selectionOnDrag` 默认关闭以避免与平移手势冲突；`onlyRenderVisibleElements` 按需启用以确保可见区裁剪。
2.  **语义缩放与裁剪**：当前实现为两档——`zoom < 0.4` 时切换为缩略态（仅显示色块、标题和占位线条），`zoom >= 0.4` 时渲染完整内容。后续可扩展为三档（`thumbnail` / `summary` / `full`），在中间缩放比例下省略重型交互控件。
3.  **平滑动画：FLIP 原则**：对于"文件夹展开"和"卡片聚焦"使用 **FLIP (First, Last, Invert, Play)** 动画技术，借助 `Framer Motion`（motion/react）处理弹簧物理动画和共享元素过渡。
4.  **独立动画层（Animation Layer）**：React Flow 持有节点 transform 状态，不能直接承担所有共享元素过渡。进入聚焦或 Folder drill-down 时，需要先记录源节点的屏幕坐标（`BoundingClientRect + viewport transform`），把视觉副本临时挂到独立的 overlay animation layer 中执行动画，同时隐藏源节点；动画完成后再挂载目标视图并恢复 React Flow 节点。这一层负责解决 React Flow transform 与 FLIP 过渡的兼容问题。
5.  **层级隔离（文件夹视图）**：进入文件夹层级时，挂载全屏 `Backdrop` 与独立 drill-down 容器，背景 React Flow 保持冻结但不销毁，以维持空间连续性和返回动画所需的原始坐标。

### 4.2 技术栈

| 层级 | 技术选型 |
|------|----------|
| 画布引擎 | @xyflow/react (React Flow) |
| UI 框架 | React 19 + TypeScript |
| 样式 | Tailwind CSS v4 |
| 动画 | Framer Motion (motion/react) |
| 构建工具 | Vite + Bun |
| 桌面运行时 | Electrobun |
| 国际化 | Paraglide / Inlang（en / zh） |

### 4.3 性能预算与降级策略

| 规模 | 目标体验 | 策略 |
|---|---|---|
| `<= 500` 节点 | 画布编辑保持 60fps | `onlyRenderVisibleElements` + 语义缩放 + 轻量节点 DOM |
| `500 - 1000` 节点 | 平移缩放保持流畅，编辑延迟可接受 | 低缩放时只渲染缩略态；富编辑器仅在选中/聚焦时挂载；Helper Lines 可按需降级关闭 |
| `> 1000` 节点 | 不承诺 MVP 全量流畅编辑 | 作为未来阶段引入更激进虚拟化、索引层或 Canvas/WebGL 降级的触发阈值 |

**MVP 性能目标**：稳定支持单画布 `500` 个节点、`1000` 条边以内的日常编辑场景；超过阈值时优先保证导航和查看流畅，编辑器按需加载。

---

## 5. Local-First 数据架构

### 5.1 核心原则

1. **文件即数据源（File as Source of Truth）**—— 每张卡片对应磁盘上一个 `.md` 文件，画布布局用独立的 manifest 文件管理。
2. **内容与布局解耦** —— 内容级属性（标题、标签、创建时间）存 frontmatter；视图级属性（位置、大小、层级）存 manifest。
3. **`noteId` ≠ `nodeId`** —— 内容实体 ID 和画布实例 ID 分离，同一篇笔记可在多个画布或同一画布中多次出现。

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
    { "path": "/Users/me/Documents/work-notes", "name": "Work Notes", "lastOpenedAt": "2026-04-03T10:00:00Z" },
    { "path": "/Users/me/Documents/personal-ideas", "name": "Personal Ideas", "lastOpenedAt": "2026-04-01T08:30:00Z" }
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
│   └── great-ideas/                    # 文件夹即目录
│       ├── floating-notes.md
│       └── drop-in-anything.md
└── attachments/                        # 图片和附件（文件名带哈希前缀避免冲突）
    ├── a1b2c3d4-chart.png
    └── e5f6g7h8-photo.jpg
```

- **单一内容树**：所有笔记统一放在 `content/` 下，文件夹就是文件系统目录。
- **Per-view manifest**：每个画布视图独立一个 `.canvas.json`，避免单文件成为写入热点。
- **附件去重**：附件文件名使用 `{hash}-{原始名}` 格式，避免同名冲突。路径统一为 workspace-relative POSIX 路径。

### 5.4 Markdown 文件格式

用 YAML frontmatter 存储**内容级**元信息，正文是纯 Markdown：

```markdown
---
id: "note_a1b2c3d4"
title: "Prio before launch"
displayHint: "checklist"
color: "#EAF2B8"
tags: ["Inbox"]
createdAt: 2026-03-28T10:00:00Z
updatedAt: 2026-03-31T14:30:00Z
---

## Lingering bugs

- [x] Dragging should not let stickies become too small
- [x] When pasting images/webclips
- [ ] Drop area on desktop reported by some
- [ ] Highlight border around webclips isn't removed after undoing resize
```

**`displayHint` 说明**（UI 渲染提示，非互斥枚举）：

| displayHint | 代码中对应 `data.type` | 含义 | 画布上的默认渲染 | 聚焦行为 |
|---|---|---|---|---|
| `note` | `text` | 普通文本笔记（默认值） | 显示标题 + 正文摘要 | ✅ 单击进入聚焦 |
| `checklist` | `checklist` | 以待办列表为主 | 显示标题 + checkbox 列表（可直接勾选/添加） | ✅ 单击进入聚焦 |
| `image` | `image` | 以图片为主 | 显示图表/图片内容 | ✅ 单击进入聚焦 |
| `sticky` | —（未实现） | 便签，短文本 | 彩色便签，无标题栏 | ❌ 不可聚焦，仅随画布缩放 |

> **当前实现说明**：代码中使用 `data.type`（值为 `'text'` / `'checklist'` / `'image'`）作为卡片类型标识，与 PRD 定义的 `displayHint` 字段名和枚举值（`'note'`）存在差异。引入文件系统持久化时将统一为 `displayHint`。

**frontmatter 字段归属原则**：

| 放 frontmatter（内容级） | 放 manifest（视图级） |
|---|---|
| `id` (noteId) | `id` (nodeId) |
| `title`、`tags` | `position`、`style: { width, height }` |
| `createdAt`、`updatedAt` | z-order（数组顺序） |
| `color`（语义颜色） | `color`（视觉强调） |
| `displayHint` | `locked`、`parentId`、`extent` |

**颜色优先级**：渲染时使用 `manifest.data.color` 作为 per-view override；若不存在，则回退到 frontmatter 的 `color`；两者都不存在时使用组件默认色板。

### 5.5 Workspace 配置

`.spatial/workspace.json`：

```json
{
  "schema": "spatial-workspace/v1",
  "activeViewId": "default",
  "views": [
    { "id": "default", "name": "Default Canvas", "file": "views/default.canvas.json" },
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
      "data": { "noteId": "note_a1b2c3d4", "file": "content/prio-before-launch.md" }
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
          { "id": "child_1", "type": "card", "data": { "type": "text", "content": "Floating notes idea", "color": "bg-[#A3E635]" } },
          { "id": "child_2", "type": "card", "data": { "type": "text", "content": "Drop in anything", "color": "bg-white" } }
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

### 5.7 TypeScript 类型定义

```typescript
// ─── ID 类型 ───
type NoteID = string;   // 内容实体 ID，如 "note_a1b2c3d4"
type NodeID = string;   // 画布实例 ID，如 "node_7f3a"
type ViewID = string;

// ─── 内容层：Markdown 文件 ───
interface NoteFrontmatter {
  id: NoteID;
  title?: string;
  displayHint?: 'note' | 'checklist' | 'image' | 'sticky';
  color?: string;
  tags?: string[];
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}

interface NoteDocument {
  frontmatter: NoteFrontmatter;
  body: string;         // Markdown 正文
  file: string;         // workspace-relative path
}

// ─── 视图层：与 @xyflow/react 的 Node/Edge 类型对齐 ───
import type { Node, Edge } from '@xyflow/react';

// -- Node Data 类型（放在 node.data 内的业务字段）--
interface CardNodeData {
  noteId: NoteID;
  file: string;         // workspace-relative path，冗余缓存
  [key: string]: unknown;
}

interface FolderChildEntry {
  id: string;
  type: 'card';
  data: Record<string, unknown>;
}

interface FolderNodeData {
  title: string;        // 显示标题，如 "3 items"（运行时根据 children.length 派生）
  subtitle?: string;
  children: FolderChildEntry[];
  [key: string]: unknown;
}

interface GroupNodeData {
  label?: string;
  color?: string;       // 预设颜色：'blue' | 'green' | 'yellow' | 'pink' | 'orange'
  [key: string]: unknown;
}

// -- Node 类型（完全兼容 @xyflow/react）--
type CardNode = Node<CardNodeData, 'card'>;
type FolderNode = Node<FolderNodeData, 'folder'>;
type GroupNode = Node<GroupNodeData, 'group'>;
type CanvasNode = CardNode | FolderNode | GroupNode;

// -- Edge 类型（直接使用 React Flow 原生 Edge）--
type CanvasEdge = Edge;

// -- Manifest & Config --
interface CanvasViewManifest {
  schema: 'spatial-canvas/v1';
  viewId: ViewID;
  viewport?: { x: number; y: number; zoom: number };
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

interface WorkspaceConfig {
  schema: 'spatial-workspace/v1';
  activeViewId: ViewID;
  views: Array<{ id: ViewID; name: string; file: string }>;
}

interface AppConfig {
  schema: 'spatial-app/v1';
  recentWorkspaces: Array<{
    path: string;
    name: string;
    lastOpenedAt: string;
  }>;
  activeWorkspace?: string;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    language: string;
  };
}
```

### 5.8 读写流程

> **当前状态**：持久化层尚未实现，画布数据来自内存中的 `initialNodes` 硬编码种子数据。以下为设计目标流程，将在引入 Electrobun 文件系统 API 后实现。

```
启动时:
  app-config.json → 获取 activeWorkspace
  → workspace.json → 获取 activeViewId
  → 加载对应 view manifest → 遍历 nodes
  → 按 noteId 查找（优先）或 file 路径回退 → 读取 .md
  → 解析 frontmatter → 渲染画布

编辑内容时:
  用户修改卡片内容 → 更新内存状态 → debounce 1500ms（trailing only）→ 写回 .md 文件
  （最小改写：只更新变化的 frontmatter 字段 + body，保留未知字段）

拖拽/调整大小时:
  用户拖拽卡片位置或调整大小 → 更新内存状态 → debounce 2500ms（trailing only）→ 写回 view manifest

窗口失焦/应用即将关闭时:
  立即 flush 所有待写入内容，避免丢失最近一次编辑

文件系统变化:
  watcher 检测到 .md 变化
  → 检查 pendingWrites:Set<filepath>，忽略自触发事件
  → 重新解析 frontmatter → diff → 更新内存状态 → 重新渲染
```

#### 5.8.1 状态管理建议

当前这个项目**不需要一开始就上重量级全局状态库**。更合适的分层是：

- **画布本地交互状态**（`nodes`、`edges`、选中态、聚焦态、右键菜单等）：优先放在画布路由内，用 `useState` / `useReducer` 管理。
- **跨组件但只在画布内共享的更新能力**：继续使用轻量 `Context`，避免把所有 UI 状态都抬到全局。
- **异步 / 服务端 / 文件系统状态**：继续使用现有的 **TanStack React Query**，负责加载、缓存、重试和错误提示。

如果后续因为以下需求而需要引入统一的客户端状态容器：

- 撤销 / 重做历史栈
- 画布持久化与 debounce flush
- 多视图共享同一 workspace 状态
- 搜索、选择、剪贴板等跨组件协同变复杂

则**优先推荐 `Zustand`**，而不是 Redux 一类更重的方案。原因：

1. **更贴合当前项目规模**：当前核心状态集中在单个画布页面，Redux 的模板代码和心智负担偏重。
2. **TypeScript 成本低**：`Zustand` API 更轻，适合和 React Flow 的 `nodes` / `edges` 数据直接结合。
3. **更容易扩展到持久化与撤销/重做**：后续可通过 middleware 或自定义历史栈承接 P1 / P2 的数据层需求。
4. **不会和 React Query 职责冲突**：`Zustand` 管本地交互状态，React Query 管异步数据，边界清晰。

因此建议的演进路线是：

- **MVP 当前阶段**：保持 `useState` / `useReducer` + 轻量 `Context` + React Query。
- **P1（撤销 / 重做）**：若画布状态开始分散，优先把画布交互状态收敛到 `useReducer` 或 `Zustand` store。
- **P2（数据持久化）**：实现持久化时，再把 `nodes`、`edges`、历史栈、待 flush 队列迁移到 `Zustand` 会更顺手。

一句话结论：**这个项目当前最适合“本地状态 + React Query”的分层；如果要补一个状态管理工具，首选 Zustand。**

### 5.9 导入/导出 (Import / Export)
* **导出**：
    * **JSON**：导出完整画布数据（manifest + 关联的 .md 内容），可用于备份或迁移。
    * **PNG/SVG**：将当前画布视口导出为图片（用于分享或演示）。
* **导入**：
    * 支持导入此前导出的 JSON 文件以恢复画布。
    * 支持拖拽图片文件到画布上自动创建图片卡片。
    * 支持直接将 `.md` 文件拖入画布创建笔记卡片。

### 5.10 关键架构决策

| 决策点 | 方案 | 理由 |
|---|---|---|
| ID 分离 | `noteId`（内容）+ `nodeId`（画布实例） | 同一笔记可在多画布/同画布多次出现 |
| 布局存储 | Per-view manifest，不放 frontmatter | 布局和内容解耦，避免单文件热点 |
| 内容树结构 | 统一 `content/` 目录 | 避免 `notes/` + `folders/` 双根混乱 |
| Folder 模型 | `children` 数组内嵌在 manifest 中 | 当前无持久化层，内嵌最直接；后续可迁移为目录驱动 |
| Folder 内布局 | MVP 使用自动排布，不存子坐标 | 避免过早引入子画布复杂度 |
| ID 生成 | `nanoid`，写入 frontmatter | 文件重命名不影响引用关系 |
| 文件监听 | `fs.watch` 或 `chokidar` | 外部编辑器修改 .md 后自动同步到画布 |
| 持久化策略 | 内容 1500ms、布局 2500ms，失焦时立即 flush | 平衡输入流畅度与磁盘写入频率 |
| Checklist 格式 | GFM `- [x]` 语法 | 与 Obsidian/Typora 等生态兼容 |
| 图片/附件 | `attachments/` + 哈希前缀文件名 | 避免同名冲突，标准 Markdown 引用语法 |
| manifest 格式 | 与 @xyflow/react 原生 Node/Edge JSON 一致 | 加载时零转换，直接传入组件 |
| z-order | 数组顺序（后覆盖前） | 简单直观，React Flow 原生行为 |
| 路径格式 | workspace-relative POSIX path | 跨平台一致性 |
| 颜色来源 | manifest `color` 覆盖 frontmatter `color` | 保留内容语义色与视图强调色的分层 |

### 5.11 Edge Cases & Guardrails

| 场景 | 处理策略 |
|---|---|
| 文件被外部重命名/移动 | `noteId` 为主键，watcher 检测到新文件时匹配 frontmatter ID，更新 manifest 中的 `file` 缓存 |
| manifest 指向的 .md 不存在 | 加载时标记为 "断链节点"，UI 上显示占位卡片，不静默删除 |
| watcher 自触发循环 | 写盘前将路径加入 `pendingWrites`，写入完成后延迟移除；watcher 收到事件时先检查该集合 |
| frontmatter round-trip 破坏格式 | 最小改写策略，保留未知字段，不重排 YAML 字段顺序 |
| 附件同名冲突 | 文件名使用 `{contentHash前8位}-{原始名}` 格式 |
| Edge 指向不存在的 node | 加载时 validation，静默过滤无效 edge 并 log 警告 |
| Markdown / frontmatter 解析失败 | 卡片以只读错误态渲染，展示原始文件路径和错误摘要；允许用户在外部编辑器修复后自动恢复 |
| manifest JSON 损坏 | 启动时保留坏文件副本并尝试从最近一次有效备份恢复；若恢复失败，则以空画布只读打开并提示用户手动修复 |
| displayHint 未知值 | 回退为 `note` 渲染，记录诊断日志，不阻塞加载 |
| 单个画布节点过多（>1000） | 未来可引入 SQLite 本地索引层，但初期全量加载足够 |

### 5.12 桌面运行时选型

项目当前使用 **Electrobun** 作为桌面运行时。

| 方案 | 优势 | 劣势 | 状态 |
|---|---|---|---|
| Electrobun（当前使用） | TypeScript 全栈，体积小（~14MB），启动快，与 Bun 生态原生集成 | 生态较年轻，部分桌面能力（如 `fs.watch`）仍在完善 | ✅ 已采用 |
| Tauri v2 | 生态成熟、文件系统能力稳定、生产案例多 | 需引入 Rust toolchain，编译较慢，与当前 Bun 工具链不统一 | 备选 |
| Electron | 最成熟生态，调试方便 | 包体积大（~150MB），内存占用高 | 不考虑 |
| File System Access API | 无需打包桌面应用 | 浏览器兼容性受限，无 watcher，每次需授权 | 不考虑 |

---

## 6. 隐私与安全 (Privacy & Security)
* **本地优先**：所有用户数据（笔记、图片、画布布局）仅存储在用户设备本地，不上传至任何服务器。
* **无账号体系**：MVP 阶段不需要用户注册或登录。
* **AI 功能的隐私边界**：如果后续接入 Gemini 等 AI 能力，需明确告知用户哪些数据会被发送至 API，并提供开关。

### 6.1 明确排除项 (Out of Scope for MVP)

- **实时协作**：MVP 不提供多人协作、CRDT、远程同步或 presence。冲突处理默认以单设备本地文件系统为边界，外部修改通过 watcher 同步，超出此范围不承诺一致性。
- **Folder 子画布**：MVP 不把 Folder 设计为可自由摆放节点的嵌套画布，仅提供目录级 drill-down 与自动排布。

### 6.2 无障碍基线 (Accessibility Baseline)

- **键盘可达性**：Tab 在当前上下文的可聚焦控件间移动；方向键可在选中节点之间导航；`Enter` 打开聚焦；`Escape` 返回上一级。
- **语义标注**：卡片、Folder、连接点、上下文菜单需预留 ARIA label / role，保证后续可接入屏幕阅读器。
- **视觉对比**：颜色不是唯一状态来源；选中、锁定、错误态需同时提供描边、图标或文字反馈，高对比主题作为预留能力。

---

## 7. 未实现功能清单（待迭代）

以下功能已在数据结构中预留，但当前代码尚未实现：

### 🔴 高优先级

| 功能 | 数据结构已支持 | 当前代码状态 | 说明 |
|------|---------------|-------------|------|
| **节点连线 (Edges)** | ✅ `CanvasEdge` 已定义 | ❌ 未实现 | 需要为 CardNode 添加 Handle 连接点，启用 `onConnect`，使用 `ConnectionMode.Loose` |
| **Group 开放式分组** | ✅ `GroupNode` + `parentId` 已定义 | ❌ 未实现 | 需实现 GroupNode 组件、拖入/拖出子节点逻辑（参考 mind-map-weaver 的 `onNodeDragStart/Drag/DragStop`） |
| **卡片 Resize** | ✅ `style: { width, height }` 已在 manifest 中 | ⚠️ CardNode 已有 `NodeResizeControl`（250–800 宽），FolderNode 仍固定 350×350 | CardNode resize 基本可用；FolderNode 需补充 resize 能力 |
| **数据持久化** | ✅ 完整文件系统方案已设计 | ❌ 当前使用内存 state | 需通过 Electrobun 文件系统 API 实现 |

### 🟡 中优先级

| 功能 | 数据结构已支持 | 当前代码状态 | 说明 |
|------|---------------|-------------|------|
| **Group 嵌套** | ✅ `parentId` 支持多级 | ❌ 未实现 | 需处理祖先检测防止循环嵌套（参考 mind-map-weaver 的 `isDescendant`） |
| **Group 拖拽推开外部卡片** | — | ❌ 未实现 | 拖拽 group 时自动推开重叠的非子节点卡片，避免视觉遮挡 |
| **连线动画** | ✅ `animated` 字段已定义 | ❌ 未实现 | `animated: true` 的 edge 显示流动虚线动画 |
| **连线标签** | ✅ `label` 字段已定义 | ❌ 未实现 | edge 上显示可编辑的文本标签 |
| **多画布视图** | ✅ `workspace.json` + per-view manifest | ❌ 仅有单个默认画布 | 需实现视图切换 UI 和新建/删除视图 |

### 🟢 低优先级

| 功能 | 数据结构已支持 | 当前代码状态 | 说明 |
|------|---------------|-------------|------|
| **节点锁定** | ✅ `locked` 字段已定义 | ❌ 未实现 | 锁定后不可拖拽/编辑/删除 |
| **`extent: "parent"` 约束** | ✅ 已在类型中定义 | ❌ 未实现 | 子节点限制在 group 边界内，不可拖出 |
| **多 workspace 管理** | ✅ `AppConfig` 已定义 | ❌ 未实现 | 需实现欢迎页、最近打开列表、workspace 切换 |
| **Edge 颜色/样式** | ✅ `color`、`type` 字段已定义 | ❌ 未实现 | 支持 smoothstep/bezier/straight 和自定义颜色 |

### 与 mind-map-weaver 的关键实现参考

1. **拖入/拖出 Group 的三阶段处理**：
   - `onNodeDragStart`：拖出时解除 `parentId`，将局部坐标转换为画布绝对坐标
   - `onNodeDrag`：检测与 group 的交叉（`getIntersectingNodes`），高亮目标 group
   - `onNodeDragStop`：确认 drop，设置 `parentId` + `extent`，将绝对坐标转换为 group 局部坐标

2. **祖先检测防循环**：group 拖入另一个 group 时，必须检查目标不是自己的后代节点

3. **连线模式**：使用 `ConnectionMode.Loose` + `defaultEdgeOptions={{ type: 'smoothstep' }}`

---

## 8. 迭代路线图 (Roadmap)

### ✅ 已完成

- [x] 无限画布（平移、缩放、语义化缩放两档：`zoom < 0.4` 切换为缩略态）
- [x] 卡片类型：文本（text）、待办列表（checklist）、图文（image）
- [x] 文件夹堆叠与 drill-down 展开（基于 `children` 数组，radial spread 动画）
- [x] 聚焦模式（FLIP 过渡动画，单击卡片直接进入）
- [x] 拖拽卡片入文件夹（检测重叠 → 移入 `children`，drop target 高亮）
- [x] Helper Lines 对齐辅助（拖拽时吸附）
- [x] CardNode Resize（`NodeResizeControl`，250–800 宽，300–900 高）
- [x] CreateMenu 浮动按钮（新建 Card / Folder，视口中心创建）

---

### 🔴 P0 — 核心交互完善（影响基本操作体验，最高优先级）

| # | 任务 | 复杂度 | 涉及文件 | 实现要点 |
|---|------|--------|----------|----------|
| 1 | **右键菜单 (Context Menu)** | 中 | `index.tsx`, 新建 `ContextMenu.tsx` | 三种上下文：画布空白处（新建卡片/Folder、粘贴、重置缩放）、卡片上（复制、删除、改颜色、移入 Folder、聚焦）、Folder 上（打开、重命名、新建子卡片）。可使用 `@base-ui/react` 的 Menu 组件 |
| 2 | **键盘快捷键** | 低 | `index.tsx` | `Delete`/`Backspace` 删除选中节点、`Cmd+C`/`Cmd+V` 复制粘贴卡片（偏移放置）、`Cmd+A` 全选、`Cmd+N` 打开新建菜单。需在 `focused`/`folder-drill-down` 模态中屏蔽画布级快捷键 |
| 3 | **选择模型重构** | 中 | `CardNode.tsx`, `FolderNode.tsx`, `index.tsx` | 单击→选中（描边高亮 + `selected` 状态），`Shift+Click` 追加选中，双击或 `Enter`→进入聚焦/drill-down。替代当前的单击直接进入 FocusedView 行为。多选集合支持批量拖拽和删除 |
| 4 | **节点连线 (Edges)** | 中 | `CardNode.tsx`, `index.tsx` | CardNode 四向 `Handle`（`Position.Top/Right/Bottom/Left`），启用 `onConnect` 回调、`ConnectionMode.Loose`、`defaultEdgeOptions: { type: 'smoothstep' }`。连线右键菜单预留（删除连线） |
| 5 | **FolderNode Resize** | 低 | `FolderNode.tsx` | 复用 CardNode 的 `NodeResizeControl` 模式，去掉硬编码 `w-[350px] h-[350px]`，改为 `style` 控制宽高 |

### 🟡 P1 — 核心特性（PRD 差异化亮点）

| # | 任务 | 复杂度 | 涉及文件 | 实现要点 |
|---|------|--------|----------|----------|
| 6 | **Group 开放式分组** | 高 | 新建 `GroupNode.tsx`, `index.tsx` | 可调整大小的彩色容器区域，子节点 `parentId` 指向 Group。三阶段拖拽处理：`onNodeDragStart`（拖出时解除 `parentId`，局部→绝对坐标）、`onNodeDrag`（`getIntersectingNodes` 检测交叉，高亮目标）、`onNodeDragStop`（确认 drop，设置 `parentId` + `extent: "parent"`，绝对→局部坐标）。预设颜色：blue/green/yellow/pink/orange |
| 7 | **撤销/重做 (Undo/Redo)** | 中 | `index.tsx`, 新建 `useUndoRedo.ts` | 操作历史栈，记录 nodes+edges 快照或增量 diff。`Cmd+Z` 撤销、`Cmd+Shift+Z` 重做。覆盖：节点增删、移动、resize、内容编辑、拖入 Folder、连线 |
| 8 | **便签 (Sticky Note)** | 低 | `CardNode.tsx`, `CreateMenu.tsx`, `initialNodes.ts` | 新 `displayHint: 'sticky'` 类型，轻量彩色便签（无标题栏），多种预设颜色可选，默认较小尺寸（200×200），可自由调整大小 |
| 9 | **图片卡片** | 中 | `CardNode.tsx`, `FocusedView.tsx` | 支持拖拽图片文件到画布 / `Cmd+V` 粘贴图片创建卡片。画布上显示等比缩略图，聚焦模式显示原图。图片数据 MVP 阶段存为 base64 或 blob URL，后续迁移到 `attachments/` 目录 |

### 🟢 P2 — 数据层与增强功能

| # | 任务 | 复杂度 | 涉及文件 | 实现要点 |
|---|------|--------|----------|----------|
| 10 | **数据持久化** | 高 | `src/bun/`, 新建 `src/mainview/lib/persistence.ts` | 通过 Electrobun 文件系统 API 实现 workspace 目录结构。manifest 读写（加载→渲染、拖拽/resize→debounce 2500ms 写 manifest、内容编辑→debounce 1500ms 写 .md）。窗口失焦时立即 flush。`pendingWrites` 集合防止 watcher 自触发 |
| 11 | **全局搜索** | 中 | 新建 `SearchPanel.tsx`, `index.tsx` | `Cmd+F` 唤起搜索面板，实时匹配卡片标题/正文/checklist 文本。匹配节点高亮，未匹配降低透明度。点击结果项 `fitView` 定位到对应卡片 |
| 12 | **连线标签与动画** | 低 | `index.tsx` | Edge 的 `label` 字段渲染为可编辑文本（双击编辑），`animated: true` 时显示流动虚线动画 |
| 13 | **Group 嵌套** | 中 | `GroupNode.tsx`, `index.tsx` | 多级 `parentId` 支持，Group 可嵌套 Group。拖入时执行 `isDescendant` 祖先检测，防止循环嵌套 |
| 14 | **画布导出 PNG/JSON** | 低 | 新建 `export.ts` | PNG：使用 `@xyflow/react` 的 `toObject()` + html2canvas 或 `getNodesBounds` 导出视口。JSON：序列化完整 manifest + 关联内容 |

### ⚪ P3 — 后续迭代

| # | 任务 | 复杂度 | 说明 |
|---|------|--------|------|
| 15 | **多画布视图切换** | 中 | `workspace.json` + per-view manifest，视图切换 UI，新建/删除/重命名视图 |
| 16 | **多 workspace 管理** | 中 | 欢迎页、最近打开列表、workspace 创建/切换（对应 `AppConfig`） |
| 17 | **节点锁定** | 低 | `locked` 字段生效：锁定后不可拖拽/编辑/删除，UI 显示锁定图标 |
| 18 | **框选 (Marquee Selection)** | 低 | 画布空白处左键拖拽框选多节点，需与中键平移手势互不冲突 |
| 19 | **导入 JSON / .md** | 低 | 导入此前导出的 JSON 恢复画布；拖拽 `.md` 文件到画布创建笔记卡片 |
| 20 | **移动端适配** | 高 | 触摸手势（双指平移/缩放）、响应式布局、触屏友好的交互目标尺寸 |

### 🔮 Phase 远期

- [ ] 视频卡片（.mp4 / .gif / .webm 嵌入）
- [ ] Web Clips（网页剪藏，Magazine 风格预览）
- [ ] 全局快捷键快速输入（Quick Input from anywhere）
- [ ] AI 辅助（Gemini 总结、生成、关联推荐）
- [ ] 商业化（Free + Pro 订阅）
