# 技术 Plan：多画布视图切换 & 多 Workspace 管理

> 基于当前代码库状态，分析两个功能的实现路径、依赖关系和分期策略。

---

## 0. 现状分析

### 当前硬编码

| 位置 | 硬编码 | 影响 |
|------|--------|------|
| `src/mainview/routes/index.tsx` L75 | `loadCanvas('default')` | 只加载 default 画布 |
| `src/mainview/hooks/useCanvasPersistence.ts` L22 | `rpcSaveManifest('default', ...)` | 只保存到 default 画布 |
| `src/bun/index.ts` L204 | `initWorkspace()` 无参数，使用 `Utils.paths.userData` | 固定单一 workspace |
| `src/bun/workspace.ts` L18-28 | `DEFAULT_CONFIG` 只含 `default` 视图 | 无多画布注册机制 |
| `src/mainview/store/canvasStore.ts` | 无 `activeViewId` 概念 | store 不知道自己属于哪个画布 |

### 已就绪的基础

- ✅ `workspace.json` 的 `views[]` 数组已支持多画布注册
- ✅ `loadCanvas(viewId)` / `rpcSaveManifest(viewId, ...)` 的 API 签名已支持任意 viewId
- ✅ `manifest.ts` 的 `loadManifest` / `saveManifest` 按 `viewFile` 路径读写，不耦合画布名
- ✅ `hydrate(nodes, edges)` 可重新加载任意画布数据

---

## 1. 功能拆分与依赖

```
Phase 1: 多画布视图切换（P2 #15）
    ├── 1A. 渲染端：activeViewId 状态 + 画布切换逻辑
    ├── 1B. 主进程：RPC 增加 createView / deleteView / listViews
    ├── 1C. UI：画布切换器（顶部 Tab 栏或侧边栏）
    └── 1D. 持久化：useCanvasPersistence 改为动态 viewId

Phase 2: 多 Workspace 管理（P3 #16）—— 依赖 Phase 1
    ├── 2A. 应用级配置：~/.spatial-canvas/app-config.json
    ├── 2B. 主进程：switchWorkspace / createWorkspace RPC
    ├── 2C. UI：欢迎页 / Workspace 选择器
    └── 2D. 窗口重建：切换 workspace 时重建 RPC + 重新 hydrate
```

---

## 2. Phase 1：多画布视图切换

### 2.1 渲染端状态（canvasStore 改造）

**新增字段**：

```typescript
// canvasStore.ts 新增
interface CanvasState {
  // ...existing...
  activeViewId: string;                    // 当前画布 ID
  views: Array<{ id: string; name: string }>; // 画布列表（从 workspace.json 同步）
  
  // 新 actions
  setActiveView: (viewId: string) => Promise<void>;
  createView: (name: string) => Promise<void>;
  deleteView: (viewId: string) => Promise<void>;
  renameView: (viewId: string, name: string) => Promise<void>;
}
```

**切换画布流程**：

```
setActiveView(viewId)
  1. flush 当前画布的 pending saves（调用 flushNow）
  2. 清空 undo/redo 历史栈
  3. 清空 focusedNode / focusedFolder / clipboard
  4. 调用 loadCanvas(viewId) 加载新画布
  5. hydrate(newNodes, newEdges)
  6. 更新 activeViewId
  7. useCanvasPersistence 自动绑定新 viewId
```

### 2.2 主进程 RPC 新增

```typescript
// src/bun/index.ts 新增 RPC
listViews: {
  params: {};
  response: { views: Array<{ id: string; name: string; file: string }> };
};
createView: {
  params: { name: string };
  response: { viewId: string; file: string };
};
deleteView: {
  params: { viewId: string };
  response: { success: boolean };
};
renameView: {
  params: { viewId: string; name: string };
  response: { success: boolean };
};
```

**实现位置**：`src/bun/workspace.ts` 新增：

```typescript
export async function addView(wsPath: string, name: string) {
  const config = await loadWorkspaceConfig(wsPath);
  const id = `view_${nanoid(8)}`;
  const file = `views/${id}.canvas.json`;
  config.views.push({ id, name, file });
  config.activeViewId = id;
  await saveWorkspaceConfig(wsPath, config);
  // 写入空 manifest
  await saveManifest(wsPath, file, {
    schema: 'spatial-canvas/v1',
    viewId: id,
    nodes: [],
    edges: [],
  });
  return { viewId: id, file };
}

export async function removeView(wsPath: string, viewId: string) {
  const config = await loadWorkspaceConfig(wsPath);
  if (config.views.length <= 1) return false; // 至少保留一个画布
  config.views = config.views.filter(v => v.id !== viewId);
  if (config.activeViewId === viewId) {
    config.activeViewId = config.views[0].id;
  }
  await saveWorkspaceConfig(wsPath, config);
  // 可选：删除 .canvas.json 文件
  return true;
}
```

### 2.3 持久化 hook 改造

```typescript
// useCanvasPersistence.ts 关键改动
function flushNow(pendingTimer, viewId: string) {
  // ...
  const { nodes, edges } = useCanvasStore.getState();
  const sanitized = sanitizeForPersistence(nodes, edges);
  rpcSaveManifest(viewId, sanitized.nodes, sanitized.edges);
}

export function useCanvasPersistence() {
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  // activeViewId 变化时 → flush 旧画布 + 重置 dirty/skipHydrate
  // ...
}
```

### 2.4 UI：画布切换器

**位置**：`src/mainview/components/canvas/ViewSwitcher.tsx`

**方案**：顶部水平 Tab 栏（类似浏览器标签页）

```
┌──────────────────────────────────────────────────┐
│ [Default Canvas ✕] [Roadmap ✕] [+ New Canvas]   │
├──────────────────────────────────────────────────┤
│                                                  │
│              ReactFlow Canvas                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

- 点击 tab → `setActiveView(viewId)`
- `✕` 关闭（至少保留 1 个）
- `+` 创建新画布（弹出命名输入）
- 双击 tab 标题 → 重命名
- 右键 tab → 删除 / 重命名 / 复制画布

### 2.5 涉及文件清单

| 文件 | 改动类型 |
|------|----------|
| `src/bun/workspace.ts` | 新增 `addView` / `removeView` / `renameView` / `saveWorkspaceConfig` |
| `src/bun/index.ts` | RPC 新增 `listViews` / `createView` / `deleteView` / `renameView` |
| `src/mainview/store/canvasStore.ts` | 新增 `activeViewId` / `views` / 切换 actions |
| `src/mainview/hooks/useCanvasPersistence.ts` | 动态 viewId，切换时 flush |
| `src/mainview/routes/index.tsx` | 从 store 读 `activeViewId`，挂载 ViewSwitcher |
| `src/mainview/lib/rpc.ts` | 新增 `rpcListViews` / `rpcCreateView` / `rpcDeleteView` / `rpcRenameView` |
| `src/mainview/components/canvas/ViewSwitcher.tsx` | **新建** — Tab 栏 UI |
| `messages/en.json` / `messages/zh.json` | 新增 i18n key |

---

## 3. Phase 2：多 Workspace 管理

### 3.1 应用级配置

**位置**：`~/.spatial-canvas/app-config.json`（用户目录，跨 workspace）

```typescript
// src/bun/appConfig.ts — 新建
interface AppConfig {
  schema: 'spatial-app/v1';
  recentWorkspaces: Array<{
    path: string;
    name: string;
    lastOpenedAt: string;  // ISO 8601
  }>;
  activeWorkspace?: string;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    language: string;
  };
}
```

> **设计决策**：`theme` 和 `locale` 从当前的 per-workspace `settings.json` 上移到 app-config（应用级偏好），workspace `settings.json` 只保留 workspace 级设置（若有）。

### 3.2 主进程改造：workspace 生命周期

当前 `main()` 的 `wsPath` 是启动时确定的常量。需要改为**可切换**：

```typescript
// src/bun/index.ts 改造思路
let currentWsPath: string;  // 可变
let noteIndexCache: Map<string, string> | null = null; // 切换时清空

async function switchWorkspace(newPath: string) {
  // 1. flush 当前所有 pending writes
  // 2. 更新 app-config.json 的 activeWorkspace
  // 3. initWorkspace(newPath)
  // 4. currentWsPath = newPath
  // 5. noteIndexCache = null
  // 6. 通知渲染端重新 hydrate
}
```

**新增 RPC**：

```typescript
listWorkspaces: {
  params: {};
  response: { workspaces: AppConfig['recentWorkspaces']; active?: string };
};
createWorkspace: {
  params: { path: string; name: string };
  response: { success: boolean };
};
openWorkspace: {
  params: { path: string };
  response: { success: boolean };
};
browseForWorkspace: {
  params: {};
  response: { path: string | null };  // 系统文件夹选择对话框
};
```

### 3.3 渲染端：Workspace 选择器

**方案 A（推荐 MVP）**：侧边栏 / 下拉菜单入口

```
┌─ [📂 Work Notes ▾] ──────────── [Tab1] [Tab2] [+] ─┐
│  ┌───────────────────┐                               │
│  │ 📁 Work Notes    ✓│                               │
│  │ 📁 Personal Ideas │                               │
│  │ ─────────────────  │                               │
│  │ + New Workspace    │                               │
│  │ 📂 Open Folder...  │                               │
│  └───────────────────┘                               │
└──────────────────────────────────────────────────────┘
```

**方案 B（后续）**：首次启动或无 workspace 时显示全屏欢迎页

### 3.4 切换流程

```
用户选择另一个 workspace
  → 渲染端调用 rpcOpenWorkspace(path)
  → 主进程 switchWorkspace(path)
    → flush → initWorkspace → loadWorkspaceConfig
    → 发送 message: workspaceChanged { views, activeViewId }
  → 渲染端收到 message
    → canvasStore.reset()（清空 nodes/edges/undo/clipboard）
    → 更新 views 列表
    → loadCanvas(activeViewId)
    → hydrate
```

### 3.5 涉及文件清单

| 文件 | 改动类型 |
|------|----------|
| `src/bun/appConfig.ts` | **新建** — app-config 读写 |
| `src/bun/index.ts` | RPC 新增 workspace 管理；`wsPath` 改为可变 |
| `src/bun/workspace.ts` | 当前 settings 逻辑可能迁移到 appConfig |
| `src/mainview/store/canvasStore.ts` | 新增 `reset()` action |
| `src/mainview/lib/rpc.ts` | 新增 workspace RPC 封装 + `workspaceChanged` message handler |
| `src/mainview/components/canvas/WorkspaceSwitcher.tsx` | **新建** — Workspace 选择器 UI |
| `src/mainview/routes/index.tsx` | 挂载 WorkspaceSwitcher |

---

## 4. 实施顺序

```
Phase 1（多画布）—— 预估 4-6 个子任务
  ┌─ 1A. workspace.ts: addView / removeView / saveWorkspaceConfig
  ├─ 1B. index.ts (bun): 注册 listViews / createView / deleteView RPC
  ├─ 1C. rpc.ts: 新增 RPC 客户端封装
  ├─ 1D. canvasStore.ts: activeViewId + views + setActiveView
  ├─ 1E. useCanvasPersistence.ts: 动态 viewId
  ├─ 1F. ViewSwitcher.tsx: Tab 栏 UI
  └─ 1G. routes/index.tsx: 集成 ViewSwitcher + 启动加载 listViews

Phase 2（多 Workspace）—— 依赖 Phase 1 完成
  ┌─ 2A. appConfig.ts: app-config 读写
  ├─ 2B. index.ts (bun): switchWorkspace + workspace RPC
  ├─ 2C. canvasStore.ts: reset() action
  ├─ 2D. rpc.ts: workspace RPC + workspaceChanged message
  ├─ 2E. WorkspaceSwitcher.tsx: UI
  └─ 2F. 欢迎页（可选，后续迭代）
```

### 关键风险

| 风险 | 缓解措施 |
|------|----------|
| 切换画布时丢失未保存数据 | `setActiveView` 开头强制 `flushNow` |
| 多画布共享同一 noteId 的并发写冲突 | 当前 `saveManifest` 已串行化，且 card `.md` 写入通过同一 RPC 队列 |
| workspace 路径包含特殊字符 | 所有路径使用 `path.join`，不拼接字符串 |
| Electrobun 无原生文件夹选择对话框 | Phase 2 可先用手动输入路径，后续接入系统对话框 |
| undo/redo 栈跨画布残留 | 切换画布时调用 `createUndoRedoState()` 清空 |

---

## 5. 不做的事（Out of Scope）

- ❌ 跨画布拖拽节点（需要额外的传输协议）
- ❌ 画布间的 noteId 引用关系可视化
- ❌ workspace 云同步 / 多设备
- ❌ workspace 内搜索跨画布结果（依赖 #11 全局搜索先完成）
