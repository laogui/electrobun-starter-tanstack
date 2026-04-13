# 技术规范文档 (Tech Spec)：Spatial Canvas

> 本文档描述 Spatial Canvas 的技术实现细节，包括架构、状态管理、渲染引擎、数据持久化、RPC 协议等。
> 产品需求与交互设计请参阅 [PRD](./PRD.md)。

---

## 1. 架构总览

### 1.1 双进程模型

```
┌─────────────────────────────────────────┐     ┌──────────────────────────────────────┐
│        React 渲染端 (src/mainview/)      │     │       Bun 主进程 (src/bun/)           │
│                                         │     │                                      │
│  canvasStore (Zustand)                  │     │  RPC handlers                        │
│    ├─ nodes / edges                     │     │    ├─ loadCanvas(viewId)             │
│    ├─ focusedNode / focusedFolder       │     │    ├─ saveManifest(viewId, data)     │
│    ├─ undo/redo 历史栈                   │     │    ├─ saveNote(noteId, ...)          │
│    └─ clipboard                         │     │    └─ createNote / deleteNote        │
│                               │         │     │         │                            │
│  useCanvasPersistence         │         │     │    文件系统 (原子写入)                  │
│    └─ debounce 2500ms ─────── ▼         │     │    workspace/                         │
│                        electrobun/view  │────▶│    ├── .spatial/views/*.canvas.json   │
│                           RPC client    │◀────│    ├── content/*.md                   │
│                                         │     │    └── attachments/                   │
│  hydrate ◀──────────── 启动时加载         │     │                                      │
│  sanitize ──────────── 写盘前过滤         │     │                                      │
└─────────────────────────────────────────┘     └──────────────────────────────────────┘
```

- **渲染端** 负责全部 UI 交互、React Flow 画布引擎、动画。
- **主进程** 负责窗口管理、文件系统读写、RPC 服务。
- 两端通过 Electrobun RPC 通信（`electrobun/view` ↔ `electrobun/bun`）。

### 1.2 技术栈

| 层级       | 技术选型                     | 说明                                                 |
| ---------- | ---------------------------- | ---------------------------------------------------- |
| 画布引擎   | @xyflow/react (React Flow)   | DOM + 硬件加速，`transform: translate(x,y) scale(z)` |
| UI 框架    | React 19 + TypeScript        | —                                                    |
| 状态管理   | Zustand                      | 画布交互状态 + undo/redo                             |
| 异步数据   | TanStack React Query         | 错误自动 toast，共享 queryClient                     |
| 路由       | TanStack Router              | 文件路由，hash history                               |
| 表单       | TanStack React Form          | —                                                    |
| 样式       | Tailwind CSS v4              | `@tailwindcss/vite` 插件，无独立配置文件             |
| 动画       | motion/react (Framer Motion) | 弹簧物理 + FLIP 过渡                                 |
| 国际化     | Paraglide / Inlang           | en / zh 双语                                         |
| Toast      | Sonner                       | 通过 queryClient 统一错误提示                        |
| 构建工具   | Vite + Bun                   | —                                                    |
| 桌面运行时 | Electrobun                   | TypeScript 全栈，~14MB，Bun 原生集成                 |

### 1.3 桌面运行时选型

| 方案               | 优势                                         | 劣势                                   | 状态      |
| ------------------ | -------------------------------------------- | -------------------------------------- | --------- |
| Electrobun（当前） | TS 全栈，体积小，启动快，与 Bun 生态原生集成 | 生态较年轻，部分能力仍在完善           | ✅ 已采用 |
| Tauri v2           | 生态成熟、文件系统能力稳定                   | 需 Rust toolchain，与 Bun 工具链不统一 | 备选      |
| Electron           | 最成熟生态                                   | 包体积大（~150MB），内存占用高         | 不考虑    |

---

## 2. 目录结构与模块职责

```
src/
  bun/                                     # Bun 主进程
    index.ts                               # 窗口创建 + RPC handler 定义
    workspace.ts                           # workspace 初始化 + 读写 workspace.json + 画布视图 CRUD (addView/removeView/renameView)
    manifest.ts                            # canvas manifest 读写 + 原子写入
    notes.ts                               # .md 文件 CRUD + frontmatter 解析/序列化
  mainview/                                # React 渲染端
    main.tsx                               # 挂载 ThemeProvider + RouterProvider
    router.tsx                             # TanStack Router 创建，注入 QueryClient
    routeTree.gen.ts                       # [生成文件] 不要手动编辑
    index.css                              # Tailwind 入口
    routes/
      __root.tsx                           # 全局 Shell：主题/语言切换、Sonner toaster、DevTools
      index.tsx                            # 主画布页面：ReactFlow + FocusedView + FolderView + ViewSwitcher + CreateMenu + ContextMenu
    store/
      canvasStore.ts                       # Zustand store：nodes/edges/UI 状态/undo-redo/clipboard/CRUD/多画布
    hooks/
      useCanvasKeyboard.ts                 # 全局快捷键：Delete/Cmd+C/V/A/N/Z/Enter/Escape
      useCanvasPersistence.ts              # 自动保存：subscribe store → debounce 2500ms → RPC saveManifest（动态 viewId）
      useContextMenu.ts                    # 右键菜单状态管理 + action 分发
      useHelperLines.ts                    # 辅助对齐线（拖拽时的 snap-to 提示）
      useNodeCreation.ts                   # 节点创建入口（CreateMenu + ContextMenu 共用）
      useNodeDrag.ts                       # 三阶段拖拽：解除 parent → 检测交叉 → 确认 drop（Group/Folder）
    components/
      canvas/
        ContextMenu.tsx                    # 右键菜单 UI（canvas/card/folder/group/sticky/image 六种上下文）
        CreateMenu.tsx                     # 右下角浮动新建按钮
        FocusedView.tsx                    # 聚焦模式：FLIP 动画 + overlay
        FolderView.tsx                     # Folder drill-down：展开子卡片 + 返回动画
        HelperLines.tsx                    # 对齐辅助线渲染
        ViewSwitcher.tsx                   # 底部画布切换器：切换/新建/重命名/删除画布
        nodes/
          CardNode.tsx                     # 图文/Checklist 卡片节点
          FolderNode.tsx                   # 堆叠式文件夹节点
          GroupNode.tsx                    # 开放式分组容器节点
          ImageNode.tsx                    # 图片卡片节点
          StickyNode.tsx                   # 便签节点
      ui/                                  # shadcn/ui 基础组件
      layout/                              # ErrorBoundary, Loader
    lib/
      canvasConstants.ts                   # 节点尺寸常量 + nodeTypes 注册表
      canvasUtils.ts                       # sortNodesByParent, isDescendant 等工具函数
      colorUtils.ts                        # 颜色常量（hex）+ colorToStyle 转换
      getHelperLines.ts                    # 辅助线计算逻辑
      queryClient.ts                       # React Query 共享客户端（错误→Sonner toast）
      rpc.ts                               # Electrobun RPC 客户端封装（非 Electrobun 环境自动降级）
      sanitize.ts                          # 写盘前过滤运行时字段
      undoRedo.ts                          # undo/redo 纯函数（快照历史栈，上限 50）
      utils.ts                             # cn() 工具
    data/
      initialNodes.ts                      # 种子数据（首次启动时使用）
```

---

## 3. 节点类型系统

### 3.1 nodeTypes 注册表

`canvasConstants.ts` 中定义了五种节点类型，直接传入 ReactFlow `nodeTypes` prop：

| type     | 组件         | 持久化方式                                              | 可聚焦             | 可 Resize                    |
| -------- | ------------ | ------------------------------------------------------- | ------------------ | ---------------------------- |
| `card`   | `CardNode`   | 独立 `.md` 文件（`noteId` + frontmatter）               | ✅                 | ✅ (150~800 × 150~900)       |
| `image`  | `ImageNode`  | 独立 `.md` 文件 + base64（MVP）/ `attachments/`（后续） | ✅                 | ✅ (150~800 × 150~900)       |
| `folder` | `FolderNode` | manifest `data.children` 内嵌                           | ✅ drill-down      | ✅ (250~600 × 250~600)       |
| `group`  | `GroupNode`  | manifest `data.label` + `data.color`                    | ❌                 | ✅ NodeResizer (min 300×200) |
| `sticky` | `StickyNode` | manifest `data.content` + `data.color` 内嵌             | ❌（双击原地编辑） | ✅ (120~500 × 120~500)       |

### 3.2 TypeScript 类型定义

> 以下为设计目标类型。实际代码中部分字段使用宽松 `any`/`Record<string, unknown>`，后续逐步收敛。

```typescript
// ─── ID 类型 ───
type NoteID = string; // 内容实体 ID，如 "note_a1b2c3d4"
type NodeID = string; // 画布实例 ID，如 "node_7f3a"
type ViewID = string;

// ─── 内容层：Markdown 文件 ───
interface NoteFrontmatter {
  id: NoteID;
  title?: string;
  displayHint?: 'note' | 'checklist' | 'image';
  color?: string;
  tags?: string[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

interface NoteDocument {
  frontmatter: NoteFrontmatter;
  body: string; // Markdown 正文
  file: string; // workspace-relative path
}

// ─── 视图层：与 @xyflow/react 的 Node/Edge 类型对齐 ───
import type { Node, Edge } from '@xyflow/react';

interface CardNodeData {
  noteId: NoteID;
  file: string;
  [key: string]: unknown;
}

interface FolderChildEntry {
  id: string;
  type: 'card';
  data: Record<string, unknown>;
}

interface FolderNodeData {
  label?: string;
  subtitle?: string;
  children: FolderChildEntry[];
  [key: string]: unknown;
}

interface GroupNodeData {
  label?: string;
  color?: string; // 'blue' | 'green' | 'yellow' | 'pink' | 'orange'
  [key: string]: unknown;
}

interface StickyNodeData {
  content: string;
  color?: string; // hex，如 "#FEF08A"
  [key: string]: unknown;
}

interface ImageNodeData {
  imageUrl: string;
  title?: string;
  color: string; // hex，如 "#FFFFFF"
  [key: string]: unknown;
}

type CardNode = Node<CardNodeData, 'card'>;
type ImageNode = Node<ImageNodeData, 'image'>;
type FolderNode = Node<FolderNodeData, 'folder'>;
type GroupNode = Node<GroupNodeData, 'group'>;
type StickyNode = Node<StickyNodeData, 'sticky'>;
type CanvasNode = CardNode | ImageNode | FolderNode | GroupNode | StickyNode;

type CanvasEdge = Edge;

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
  recentWorkspaces: Array<{ path: string; name: string; lastOpenedAt: string }>;
  activeWorkspace?: string;
  preferences: { theme: 'light' | 'dark' | 'system'; language: string };
}
```

### 3.3 displayHint 与 data.type 映射

持久化到 frontmatter 时使用 `displayHint`（PRD 定义），运行时内存中使用 `data.type`。映射关系：

| frontmatter `displayHint` | 运行时 `data.type` |
| ------------------------- | ------------------ |
| `note`（默认）            | `text`             |
| `checklist`               | `checklist`        |
| `image`                   | `image`            |

映射在 `src/bun/notes.ts` 的 `cardDataToNote` / `noteToCardData` 中处理。

---

## 4. 状态管理

### 4.1 分层策略

| 层                | 工具                           | 职责                                                                                     |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| 画布交互状态      | **Zustand** (`canvasStore.ts`) | `nodes`/`edges`、`focusedNode`/`focusedFolder`、`clipboard`、undo/redo 历史栈、节点 CRUD |
| 异步/文件系统数据 | **TanStack React Query**       | 加载、缓存、重试、错误 toast                                                             |
| 局部 UI 状态      | `useState` / Hook 内部         | 右键菜单位置、拖拽 dropTarget、helper lines 等                                           |

### 4.2 canvasStore 结构

```
CanvasState
├── 核心数据: nodes, edges
├── UI 状态: focusedNode, focusedFolder, createMenuOpen, clipboard, nodeIdCounter
├── 多画布: activeViewId, views[]
├── 核心 actions: setNodes, setEdges, applyNodesChange, applyEdgesChange, addConnection, updateNodeData
├── UI actions: setFocusedNode, setFocusedFolder, setCreateMenuOpen
├── 多画布 actions: setActiveView, setViews, setActiveViewId
├── 剪贴板: copySelected, pasteClipboard
├── 节点 CRUD: createNode, deleteNodes, changeNodeColor, addFolderChild
├── Hydration: hydrate(nodes, edges), reset(), _hydrated
└── Undo/Redo: saveSnapshot, undo, redo, canUndo, canRedo (_undoRedo: UndoRedoState)
```

### 4.3 Undo/Redo 机制

- **纯函数实现**：`undoRedo.ts` 导出 `pushSnapshot` / `undo` / `redo` 纯函数，不依赖 Zustand middleware。
- **快照策略**：在破坏性操作前调用 `saveSnapshot()`（`createNode`、`deleteNodes`、`addConnection`、`pasteClipboard`、`changeNodeColor`、`addFolderChild`、`onNodeDragStart`）。
- **历史栈上限**：最多保留 **50** 步（`MAX_HISTORY = 50`）。
- **生命周期**：仅存在于内存中，关闭应用后清空。
- **与持久化的一致性**：撤销/重做仅回滚内存状态；下次 debounce 到期时以内存状态覆盖磁盘。

### 4.4 多画布视图切换

#### 状态模型

- `activeViewId: string` — 当前激活的画布 ID（默认 `'default'`）
- `views: Array<{ id: string; name: string }>` — 所有画布列表（启动时从 `workspace.json` 同步）

#### 切换流程

```
setActiveView(viewId)
  1. 若 viewId === 当前 activeViewId → 跳过
  2. flushNow() — 立即保存当前画布的 pending saves（useCanvasPersistence 监听 activeViewId 变化自动触发）
  3. 清空 UI 状态：focusedNode / focusedFolder / clipboard / undo-redo 历史栈
  4. 设置 _hydrated = false → 触发 index.tsx 中的加载 useEffect
  5. loadCanvas(viewId) → hydrate(newNodes, newEdges)
```

#### 持久化 hook 适配

`useCanvasPersistence` 通过 `useRef` 跟踪 `activeViewId`，当检测到切换时：
- 先用旧 viewId 调用 `flushNow` 保存未写入的变更
- 更新 ref 为新 viewId
- 重置 `skipHydrate` 标志，避免 hydrate 触发的 store 变更被误当作用户编辑

#### UI 组件

`ViewSwitcher.tsx` — 底部居中浮动面板：
- **触发器**：显示当前画布名称 + 节点计数 + 画布数量
- **弹出菜单**：列出所有画布，点击切换；支持行内重命名（双击或铅笔图标）、删除（至少保留 1 个）
- **快捷创建**：`+` 按钮创建新空画布，自动切换到新画布

#### 后端 workspace.ts

新增函数：`addView(wsPath, name)` / `removeView(wsPath, viewId)` / `renameView(wsPath, viewId, name)` / `saveWorkspaceConfig(wsPath, config)`。`addView` 同时创建空的 `.canvas.json` manifest；`removeView` 同时删除 manifest 文件并确保至少保留一个画布。

---

## 5. 渲染引擎与动画

### 5.1 画布引擎

- 使用 **@xyflow/react**（React Flow），DOM + 硬件加速方案。
- 整个大画布通过 `transform: translate(x, y) scale(z)` 控制，内部节点绝对定位。
- `selectionOnDrag` 默认关闭（避免与平移手势冲突）。
- `connectionMode: ConnectionMode.Loose` + `defaultEdgeOptions: { type: 'smoothstep' }`。
- 所有节点提供四向 Handle（top/right/bottom/left）。

### 5.2 语义缩放（两档）

| 缩放范围     | 状态        | 渲染内容               |
| ------------ | ----------- | ---------------------- |
| `zoom < 0.4` | `thumbnail` | 仅色块、标题、占位线条 |
| `zoom ≥ 0.4` | `full`      | 完整内容和交互控件     |

各节点组件内通过 `useViewport()` 获取 `zoom` 值，`const isZoomedOut = zoom < 0.4` 条件渲染。

> **后续规划**：可引入第三档 `summary`（0.4 ≤ zoom < 0.8），渲染标题 + 内容摘要、Checklist 仅前 2 条，不挂载交互控件。

### 5.3 FLIP 动画与独立动画层

- 聚焦（FocusedView）和 Folder drill-down 使用 **FLIP (First, Last, Invert, Play)** 技术。
- 借助 `motion/react`（Framer Motion）处理弹簧物理动画和共享元素过渡。
- React Flow 持有节点 transform 状态，不能直接承担过渡动画。进入聚焦/drill-down 时：
  1. 记录源节点屏幕坐标（`BoundingClientRect` + viewport transform）
  2. 把视觉副本挂到独立 overlay animation layer（`AnimatePresence` 容器）
  3. 同时隐藏源节点（`data.isHidden = true`）
  4. 动画完成后挂载目标视图
- `BoundingClientRect` 读取仅在进入/退出过渡时执行一次，不进入持续平移、缩放、拖拽的热路径。

### 5.4 层级隔离（文件夹视图）

进入 Folder drill-down 时：

- 挂载全屏 `Backdrop`（半透明遮罩）与独立 drill-down 容器。
- 背景 React Flow 保持冻结但不销毁，维持空间连续性和返回动画所需的原始坐标。
- 子卡片从堆叠状态展开至自动排布位置（横向 strip / grid，按 `children` 数组顺序）。

---

## 6. 性能预算与降级策略

| 规模          | 目标体验                     | 策略                                                         |
| ------------- | ---------------------------- | ------------------------------------------------------------ |
| ≤ 500 节点    | 画布编辑 60fps               | `onlyRenderVisibleElements` + 三档语义缩放 + 轻量节点 DOM    |
| 500–1000 节点 | 平移缩放流畅，编辑延迟可接受 | 低缩放仅 `thumbnail`/`summary` 态；富编辑器仅选中/聚焦时挂载 |
| > 1000 节点   | 不承诺 MVP 全量流畅          | 后续引入虚拟化、SQLite 索引或 Canvas/WebGL 降级              |

**MVP 性能目标**：单画布 500 节点 + 1000 条边的日常编辑场景。

**前提约束**：上述预算建立在"未聚焦节点保持展示型 DOM、富编辑器只在选中/聚焦时挂载、FLIP 只在模态进出时读取布局"的前提下。

---

## 7. 数据持久化

> 严格遵循 [PRD §5](./PRD.md) 的 Local-First 架构。

### 7.1 Workspace 文件结构

```
workspace/
├── .spatial/
│   ├── workspace.json              # activeViewId + views 列表
│   └── views/
│       └── default.canvas.json     # 画布 manifest（节点/边/viewport）
├── content/
│   ├── who-spatial-is-for.md       # 笔记文件（frontmatter + markdown body）
│   ├── prio-before-launch.md
│   └── alpha-feedback.md
└── attachments/
    └── a1b2c3d4-chart.png          # 附件（后续）
```

- `workspace.ts` 负责初始化目录结构、读写 `workspace.json`，并提供 `atomicWrite()` 工具函数。
- `manifest.ts` 负责 canvas manifest 的序列化/反序列化。
- `notes.ts` 负责 `.md` 文件 CRUD、frontmatter 解析/序列化、`displayHint` ↔ `data.type` 映射。

### 7.2 文件格式

#### Markdown 笔记（PRD §5.4）

```markdown
---
id: 'note_a1b2c3d4'
title: 'Prio before launch'
displayHint: 'checklist'
color: '#EAF2B8'
createdAt: 2026-04-01T10:00:00Z
updatedAt: 2026-04-03T14:30:00Z
---

## Lingering bugs

- [x] Dragging should not let stickies become too small
- [ ] Drop area on desktop reported by some
```

#### Canvas Manifest（PRD §5.6，React Flow 原生结构）

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
      "style": { "width": 350, "height": 450 },
      "data": {
        "noteId": "note_a1b2c3d4",
        "file": "content/prio-before-launch.md",
        "type": "checklist"
      }
    },
    {
      "id": "node_s1",
      "type": "sticky",
      "position": { "x": 500, "y": 600 },
      "style": { "width": 200, "height": 200 },
      "data": { "content": "Quick note!", "color": "#FEF08A" }
    },
    {
      "id": "node_g1",
      "type": "group",
      "position": { "x": 100, "y": 600 },
      "style": { "width": 800, "height": 400 },
      "data": { "label": "Design Research", "color": "blue" }
    },
    {
      "id": "node_f1",
      "type": "folder",
      "position": { "x": 900, "y": 600 },
      "style": { "width": 350, "height": 350 },
      "data": {
        "title": "3 items",
        "subtitle": "The really great ideas",
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
      "target": "node_s1",
      "type": "smoothstep"
    }
  ]
}
```

**Manifest 写盘规则**（与 `sanitize.ts` 一致）：

- 保留的字段（白名单）：`id`, `type`, `position`, `style`, `parentId`, `extent`, `data`
- 必须丢弃的运行时字段：`selected`, `dragging`, `resizing`, `measured`, `draggable`, `selectable`, `deletable`, `focusable`, `width`, `height`, `internals`
- data 内丢弃：`isHidden`, `isDropTarget`
- Edge 丢弃：`selected`

### 7.3 RPC 协议

渲染端通过 `src/mainview/lib/rpc.ts` 封装 Electrobun RPC 客户端。非 Electrobun 环境（纯 Vite 开发）自动降级，持久化静默禁用。

```typescript
type CanvasRPC = {
  bun: {
    requests: {
      loadCanvas: {
        params: { viewId: string };
        response: {
          nodes: ManifestNode[];
          edges: ManifestEdge[];
          viewport?: { x: number; y: number; zoom: number };
        } | null;
      };
      saveManifest: {
        params: {
          viewId: string;
          nodes: ManifestNode[];
          edges: ManifestEdge[];
          viewport?: { x: number; y: number; zoom: number };
        };
        response: { success: boolean };
      };
      saveNote: {
        params: {
          noteId: string;
          frontmatter: Record<string, unknown>;
          body: string;
        };
        response: { success: boolean };
      };
      createNote: {
        params: { id: string; title: string; displayHint: string };
        response: { noteId: string; file: string };
      };
      deleteNote: {
        params: { noteId: string };
        response: { success: boolean };
      };
      // ── 多画布视图管理 ──
      listViews: {
        params: {};
        response: {
          views: Array<{ id: string; name: string; file: string }>;
          activeViewId: string;
        };
      };
      createView: {
        params: { name: string };
        response: { id: string; name: string; file: string };
      };
      deleteView: {
        params: { viewId: string };
        response: { success: boolean; activeViewId?: string };
      };
      renameView: {
        params: { viewId: string; name: string };
        response: { success: boolean };
      };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {};
  };
};
```

### 7.4 保存策略

#### Debounce

| 操作类型                                 | Debounce        | 写入目标                              | 实现状态                     |
| ---------------------------------------- | --------------- | ------------------------------------- | ---------------------------- |
| 布局变化（拖拽、resize、增删节点、连线） | 2500ms trailing | `.canvas.json`（通过 `saveManifest`） | ✅ `useCanvasPersistence.ts` |
| 内容编辑（标题、正文、checklist）        | 1500ms trailing | `content/*.md`（通过 `saveNote`）     | 🔲 待实现                    |
| 窗口失焦                                 | 立即 flush      | 所有 pending manifest                 | ✅ `window blur` 事件        |

> 当前 `useCanvasPersistence` 仅处理 manifest 保存（2500ms debounce + blur flush）。`saveNote` 的独立 debounce 尚未实现，content 变更随 manifest 一起落盘。

#### 原子写入

所有文件写入采用 write-then-rename 模式（`workspace.ts` 中的 `atomicWrite`）：

```typescript
export async function atomicWrite(filePath: string, data: string) {
  const tmp = `${filePath}.tmp`;
  await Bun.write(tmp, data);
  const fs = await import('fs/promises');
  await fs.rename(tmp, filePath);
}
```

#### 写盘前 Sanitize

`sanitize.ts` 在调用 RPC 前过滤运行时字段：

```typescript
const RUNTIME_NODE_KEYS = new Set([
  'selected',
  'dragging',
  'resizing',
  'measured',
  'draggable',
  'selectable',
  'deletable',
  'focusable',
  'width',
  'height',
  'internals',
]);

const RUNTIME_DATA_KEYS = new Set(['isHidden', 'isDropTarget']);
```

Edge 剥离 `selected`。

### 7.5 启动加载流程

```
1. Bun 主进程启动 → initWorkspace() 确保目录结构存在
2. 读取 workspace/.spatial/workspace.json → activeViewId
3. 读取 .spatial/views/{activeViewId}.canvas.json → manifest
4. 遍历 manifest.nodes：
   - type=card 且有 noteId → 读取 content/{file}.md → 解析 frontmatter
     → noteToCardData() 将 frontmatter + body 合并到 node.data
   - type=sticky/group/image → 直接使用 manifest 中的 data
   - type=folder → children 已内嵌，直接使用
5. RPC 返回完整 { nodes, edges, viewport }
6. 渲染端 canvasStore.hydrate(nodes, edges)
```

**首次启动 / 无 workspace**：

渲染端 `index.tsx` 检测到 `loadCanvas` 返回空数据时，将当前 `initialNodes`（种子数据）通过 `sanitizeForPersistence` + `rpcSaveManifest` 写入磁盘，完成一次性 seed 操作。

### 7.6 Folder children 模型

Folder 的子卡片通过 `data.children` 数组**内嵌在 manifest 中**，不生成独立 `.md` 文件。

理由：

- PRD §2.5.2 明确子卡片为轻量条目
- MVP 阶段无需独立文件级别管理
- 后续可迁移为目录驱动模型

### 7.7 MVP 不做

- ❌ 文件系统 watcher（外部编辑同步）
- ❌ 多 workspace 管理 / 欢迎页
- ❌ 跨画布拖拽节点
- ❌ frontmatter 无损 round-trip（MVP 接受规范化重写）
- ❌ Folder children 迁移为 noteId 引用
- ❌ 独立的 saveNote debounce（content 随 manifest 落盘）

---

## 8. 编码约定

### 8.1 路径别名

- `@/*` → `src/mainview/*`（tsconfig.json + vite resolve alias）
- shadcn/ui 组件位于 `@/components/ui`

### 8.2 颜色系统

- **持久化**：只存 hex 值（如 `#EAF2B8`）或语义 token（如 `blue`）
- **运行时**：`colorUtils.ts` 提供 `colorToStyle(color)` → 返回 `{ backgroundColor }` style 对象
- **颜色常量**：
  - `CARD_COLORS`：Card / Image 节点可选颜色（hex 数组）
  - `STICKY_COLORS`：Sticky 节点可选颜色（hex 数组）
  - `GROUP_COLORS`：Group 节点可选颜色（语义 token 数组：`blue`/`green`/`yellow`/`pink`/`orange`）
- **颜色优先级**（三层回退）：`manifest.data.color` → `frontmatter.color` → 组件默认色板
  - Sticky 无 frontmatter，仅两层：`manifest.data.color` → 组件默认色板

### 8.3 国际化

- 消息文件：`messages/en.json`、`messages/zh.json`
- 运行时引用：`import * as m from '../../paraglide/messages.js'`，调用 `m.key_name()`
- 添加新 key 后运行 `bun run machine-translate`
- `src/paraglide/` 为生成目录，不手动编辑

### 8.4 生成文件

以下文件为自动生成，不要手动编辑：

- `src/mainview/routeTree.gen.ts`（TanStack Router 插件生成）
- `src/paraglide/`（Paraglide 编译输出）

---

## 9. Edge Cases & Guardrails

> 产品层面的 edge case 处理策略。

| 场景                             | 处理策略                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| 文件被外部重命名/移动            | `noteId` 为主键，watcher 检测到新文件时匹配 frontmatter ID，更新 manifest `file` 缓存 |
| manifest 指向的 .md 不存在       | 加载时标记为"断链节点"，UI 显示占位卡片，不静默删除                                   |
| `noteId` 零引用                  | 不删除 `.md`；标记为 `unplaced`，纳入全局搜索                                         |
| watcher 自触发循环               | 写盘前加入 `pendingWrites` 集合，watcher 检查后忽略                                   |
| frontmatter round-trip 破坏格式  | 最小改写策略，保留未知字段，不重排 YAML 字段顺序                                      |
| 附件同名冲突                     | `{contentHash前8位}-{原始名}` 格式                                                    |
| 带 Edge 的卡片拖入 Folder        | MVP 阻止并 toast 提示先断开连线                                                       |
| Edge 指向不存在的 node           | 加载时静默过滤 + log 警告                                                             |
| Markdown / frontmatter 解析失败  | 卡片以只读错误态渲染，展示路径和错误摘要                                              |
| 窗口失焦/关闭时有 pending writes | 阻塞退出直至队列 drain，超 3 秒强制关闭并保留最近有效快照                             |
| manifest JSON 损坏               | 保留坏文件副本，尝试从备份恢复                                                        |
| displayHint 未知值               | 回退 `note` 渲染 + 诊断日志                                                           |
| 切换画布时有未保存变更           | `setActiveView` 先 `flushNow` 旧画布，`useCanvasPersistence` 监听 `activeViewId` 变化自动 flush |
| 删除当前激活的画布               | 自动切换到 `views[0]`，后端更新 `workspace.json` 的 `activeViewId`                       |
| 删除最后一个画布                 | 后端拒绝（`removeView` 返回 `false`），至少保留一个画布                                  |

---

## 10. 关键实现参考

### 10.1 拖入/拖出 Group 的三阶段处理

（`useNodeDrag.ts`）

1. **`onNodeDragStart`**：若节点有 `parentId`，解除父子关系，将局部坐标转换为画布绝对坐标。
2. **`onNodeDrag`**：
   - 内容节点（card/image/sticky）：`getIntersectingNodes` 检测 Group 交叉 → 高亮目标 Group；同时检测 Folder 重叠 → 设置 dropTarget。
   - Group 节点：检测与其他 Group 的交叉（`isDescendant` 防循环）；自动推开重叠的非子节点卡片（按最短轴方向，碰撞检测避免推入其他 Group）。
3. **`onNodeDragStop`**：
   - 若 drop 到 Folder → 移除画布节点，追加到 `folder.data.children`。
   - 若 drop 到 Group → 设置 `parentId` + `extent: 'parent'`，绝对坐标转局部坐标。
   - 调用 `sortNodesByParent` 保证数组中 parent 在 children 前面。

### 10.2 祖先检测防循环

`canvasUtils.ts` 的 `isDescendant(nodes, ancestorId, potentialDescendantId)`：沿 `parentId` 链向上遍历，检查是否会形成环。Group 拖入另一个 Group 时必须调用。

### 10.3 写盘前 Sanitize 白名单

保留的字段：`id`, `type`, `position`, `style`, `parentId`, `extent`, `data`

必须丢弃的运行时字段：`selected`, `dragging`, `resizing`, `measured`, `draggable`, `selectable`, `deletable`, `focusable`, `width`, `height`, `internals`

data 内丢弃：`isHidden`, `isDropTarget`
