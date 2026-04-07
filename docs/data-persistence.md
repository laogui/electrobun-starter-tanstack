# 数据持久化方案（v2 — 可执行版）

> 严格遵循 [PRD §5](./PRD.md) 的 Local-First 架构。  
> 本文档收敛了所有 schema 不一致问题，是最终实现依据。

---

## 1. 需要先解决的 Schema 统一问题

实现持久化之前，以下差异必须先收敛，否则会在读写转换层反复折腾。

### 1.1 颜色：不再持久化 Tailwind class

| 现状 | 目标 |
|---|---|
| 代码中 `CARD_COLORS` 存的是 `bg-white`, `bg-[#EAF2B8]` | 持久化层只存语义 token 或 hex |
| PRD manifest 示例里也有 `bg-[#A3E635]` | 统一改为 hex 或语义名 |

**决策**：

- 持久化文件（`.md` frontmatter / `.canvas.json`）中的 `color` 字段只存 **hex 值**（如 `#EAF2B8`）或**语义 token**（如 `white`, `blue`）
- UI 层负责 hex → Tailwind class 的映射（`canvasConstants.ts` 中建映射表）
- 这是一次性迁移，在 Step 0 完成

### 1.2 displayHint vs data.type

| 现状 | 目标 |
|---|---|
| 代码中用 `data.type = 'text' \| 'checklist' \| 'image'` | 持久化到 frontmatter 时用 `displayHint = 'note' \| 'checklist' \| 'image'` |

**决策**：

- frontmatter 使用 PRD 定义的 `displayHint`
- 运行时内存中可继续用 `data.type`，在读写时做映射（`note` ↔ `text`）
- 这个映射在 `src/bun/notes.ts` 的序列化/反序列化中处理

### 1.3 Folder children 模型

PRD 当前定义 Folder `data.children` 是**内嵌完整子卡片对象**（与代码一致）。  
评审意见建议改为只存 `noteId[]` 引用。

**MVP 决策：保持 PRD 现有的内嵌模型，不改。**

理由：
- PRD §2.5.2 明确：_"Folder 的成员通过 `data.children` 数组内嵌在 manifest 中"_
- MVP 阶段 Folder 子卡片没有独立的 .md 文件（它们是轻量条目，不是完整笔记）
- PRD 已预留后续迁移路径：_"后续引入本地文件系统持久化后，可考虑迁移为目录驱动模型"_
- 现在改会同时影响 FolderNode 组件、drill-down 逻辑、canvasStore，范围过大

### 1.4 Manifest 结构：严格对齐 React Flow

PRD §5.6 已明确 manifest 与 `@xyflow/react` 原生 Node/Edge JSON **完全一致**。

**写盘规则**：

保留的字段（白名单）：
```
id, type, position, style, parentId, extent, data
```

必须丢弃的运行时字段（黑名单）：
```
selected, dragging, measured, draggable, selectable,
width, height, isHidden, isDropTarget, internals
```

写盘前统一做 `sanitizeForPersistence()` 过滤。

---

## 2. 架构流程

```
┌─────────────────────────────────────────┐     ┌──────────────────────────────────────┐
│        React 渲染端 (mainview)           │     │       Bun 主进程                      │
│                                         │     │                                      │
│  canvasStore ──subscribe──▶ debounce    │     │  RPC handlers                        │
│  (Zustand)                              │     │    ├─ loadCanvas(viewId)             │
│    ├─ 内容变化 → 1500ms                  │     │    ├─ saveManifest(viewId, data)     │
│    └─ 布局变化 → 2500ms                  │     │    ├─ saveNote(noteId, ...)          │
│                               │         │     │    └─ createNote / deleteNote        │
│                               ▼         │     │         │                            │
│                        electrobun/view  │────▶│    文件系统 (原子写入)                  │
│                           RPC client    │◀────│    workspace/                         │
│                                         │     │    ├── .spatial/views/*.canvas.json   │
│  hydrate ◀──────────── 启动时加载         │     │    ├── content/*.md                   │
│                                         │     │    └── attachments/                   │
│  sanitize ──────────── 写盘前过滤         │     │                                      │
└─────────────────────────────────────────┘     └──────────────────────────────────────┘
```

---

## 3. 文件结构（与 PRD §5.3 一致）

```
workspace/
├── .spatial/
│   ├── workspace.json
│   └── views/
│       └── default.canvas.json
├── content/
│   ├── who-spatial-is-for.md
│   ├── prio-before-launch.md
│   └── alpha-feedback.md
└── attachments/
    └── a1b2c3d4-chart.png
```

---

## 4. 文件格式

### 4.1 Markdown 笔记（PRD §5.4）

```markdown
---
id: "note_a1b2c3d4"
title: "Prio before launch"
displayHint: "checklist"
color: "#EAF2B8"
tags: ["Inbox"]
createdAt: 2026-04-01T10:00:00Z
updatedAt: 2026-04-03T14:30:00Z
---

## Lingering bugs

- [x] Dragging should not let stickies become too small
- [ ] Drop area on desktop reported by some
```

### 4.2 Canvas Manifest（PRD §5.6，React Flow 原生结构）

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
      "data": { "noteId": "note_a1b2c3d4", "file": "content/prio-before-launch.md" }
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
        "subtitle": "The really great ideas",
        "children": [
          { "id": "child_1", "type": "card", "data": { "type": "text", "content": "Floating notes idea", "color": "#A3E635" } },
          { "id": "child_2", "type": "card", "data": { "type": "text", "content": "Drop in anything", "color": "#FFFFFF" } }
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

---

## 5. 改动文件清单

### Bun 主进程

| 文件 | 改动 |
|---|---|
| `src/bun/index.ts` | 定义 RPCSchema，注册 handlers，传入 `BrowserWindow({ rpc })` |
| `src/bun/workspace.ts`（新建） | 初始化目录结构、读写 `workspace.json` |
| `src/bun/manifest.ts`（新建） | Canvas manifest 读写 + 原子写入 |
| `src/bun/notes.ts`（新建） | .md 文件 CRUD：frontmatter 解析/序列化，`displayHint` ↔ `data.type` 映射 |

### 渲染端

| 文件 | 改动 |
|---|---|
| `src/mainview/main.tsx` | 初始化 Electroview + RPC |
| `src/mainview/store/canvasStore.ts` | 初始数据改为空；新增 `hydrate(nodes, edges)` action |
| `src/mainview/hooks/useCanvasPersistence.ts`（新建） | subscribe store → 分类 debounce → 调用 RPC |
| `src/mainview/lib/canvasConstants.ts` | 颜色映射：hex ↔ Tailwind class 转换表 |
| `src/mainview/lib/sanitize.ts`（新建） | `sanitizeForPersistence()`：写盘前过滤运行时字段 |

---

## 6. RPC Schema

```typescript
type CanvasRPC = {
  bun: {
    requests: {
      // 画布加载：读取 manifest + 批量读取关联 .md → 组装完整 Node[]
      loadCanvas: {
        params: { viewId: string };
        response: {
          nodes: CanvasNode[];
          edges: CanvasEdge[];
          viewport?: { x: number; y: number; zoom: number };
        } | null;
      };

      // 布局保存：manifest 整体写入（原子写）
      saveManifest: {
        params: {
          viewId: string;
          nodes: CanvasNode[];   // 已 sanitize
          edges: CanvasEdge[];
          viewport?: { x: number; y: number; zoom: number };
        };
        response: { success: boolean };
      };

      // 单个笔记内容保存
      saveNote: {
        params: {
          noteId: string;
          frontmatter: Record<string, unknown>;
          body: string;
        };
        response: { success: boolean };
      };

      // 创建笔记
      createNote: {
        params: { id: string; title: string; displayHint: string };
        response: { noteId: string; file: string };
      };

      // 删除笔记
      deleteNote: {
        params: { noteId: string };
        response: { success: boolean };
      };
    };
    messages: {};   // watcher 推送在 Phase 2 再加
  };
  webview: {
    requests: {};
    messages: {};
  };
};
```

---

## 7. 保存策略

### 7.1 Debounce（PRD §5.8）

| 操作类型 | Debounce | 写入目标 |
|---|---|---|
| 内容编辑（标题、正文、checklist） | 1500ms trailing | `content/*.md`（通过 `saveNote`） |
| 布局变化（拖拽、resize、增删节点、连线） | 2500ms trailing | `.canvas.json`（通过 `saveManifest`） |
| 窗口失焦 / 应用关闭 | 立即 flush | 所有 pending |

### 7.2 原子写入

所有文件写入采用 write-then-rename 模式：

```typescript
// src/bun/manifest.ts
async function atomicWrite(filePath: string, data: string) {
  const tmp = `${filePath}.tmp`;
  await Bun.write(tmp, data);
  const fs = await import("fs/promises");
  await fs.rename(tmp, filePath);
}
```

避免崩溃/断电导致文件损坏。

### 7.3 写盘前 Sanitize

```typescript
// src/mainview/lib/sanitize.ts
const RUNTIME_KEYS = new Set([
  'selected', 'dragging', 'measured', 'draggable',
  'selectable', 'width', 'height', 'internals',
]);

const RUNTIME_DATA_KEYS = new Set([
  'isHidden', 'isDropTarget',
]);

function sanitizeNode(node: Node): Node {
  const clean: any = {};
  for (const [k, v] of Object.entries(node)) {
    if (!RUNTIME_KEYS.has(k)) clean[k] = v;
  }
  if (clean.data) {
    const cleanData: any = {};
    for (const [k, v] of Object.entries(clean.data)) {
      if (!RUNTIME_DATA_KEYS.has(k)) cleanData[k] = v;
    }
    clean.data = cleanData;
  }
  return clean;
}
```

---

## 8. 启动加载流程

```
1. Bun 进程启动
2. 读取 workspace/.spatial/workspace.json → activeViewId
3. 读取 .spatial/views/{activeViewId}.canvas.json → manifest
4. 遍历 manifest.nodes：
   - type=card 且有 noteId → 读取 content/{file}.md → 解析 frontmatter
     → 将 frontmatter 字段合并到 node.data（displayHint→type, title, tags 等）
   - type=sticky/group → 直接使用 manifest 中的 data
   - type=folder → children 已内嵌，直接使用
5. RPC 返回完整 { nodes, edges, viewport }
6. 渲染端 canvasStore.hydrate(nodes, edges)
```

### 首次启动 / 无 workspace

- 若目录不存在 → 创建 `.spatial/`、`content/`、`attachments/` 目录结构
- 将 `initialNodes` 拆分写入：card 类型 → 生成 .md 文件，全部 → 生成 default.canvas.json
- 这是一次性的 seed 操作

---

## 9. 实现步骤

| Step | 内容 | 依赖 |
|---|---|---|
| **0** | Schema 统一：颜色从 Tailwind class 改为 hex，更新 `canvasConstants.ts` 添加映射表 | 无 |
| **1** | Bun 侧文件读写（`workspace.ts`, `manifest.ts`, `notes.ts`） | Step 0 |
| **2** | RPC 定义 + `BrowserWindow({ rpc })`，渲染端初始化 Electroview | Step 1 |
| **3** | 启动加载：`loadCanvas` → `canvasStore.hydrate()` | Step 2 |
| **4** | 自动保存：`useCanvasPersistence` hook + `sanitize` | Step 3 |
| **5** | 首次启动 seed（`initialNodes` → 文件） | Step 4 |

### 明确 MVP 不做

- ❌ 文件系统 watcher（外部编辑同步）
- ❌ 多 workspace 管理 / 欢迎页
- ❌ frontmatter 无损 round-trip（MVP 接受规范化重写）
- ❌ Folder children 迁移为 noteId 引用
