# Canvas 模板库功能 · 开发进度与规划

> 状态：**P0 已完成**，临时验证路由 `/preview-test` 已搭建并通过实机验证。待进入 **P1（后端地基 + 第一个模板）**。
>
> 最后更新：在实现 P0 节点重构 + 临时预览路由之后。

---

## 一、需求概览

ViewSwitcher 底部的 **"+ New Canvas"** 变成带子菜单的悬浮触发器，两项：

1. 📄 **空白画布** → 沿用现有 `handleCreate` 流程。
2. 🎨 **选择模板…** → 跳转 `/templates` 路由页，Grid 展示模板缩略图卡片；点击卡片进入 `/templates/$templateId` 预览页，预览用**只读 ReactFlow 渲染真实模板 nodes/edges**，确认后基于模板创建新画布。

---

## 二、最终方案 v3（已确认）

| 决策点 | 最终选择 |
|--------|----------|
| 模板库入口 | **TanStack Router 新路由**（非 Dialog） |
| 路由结构 | `/templates`（列表）+ `/templates/$templateId`（预览） |
| 预览渲染 | **只读 ReactFlow（渲染真实 nodes/edges）** |
| 列表缩略图 | 先用 PNG 预生成（MVP） |
| 新画布命名 | 自动 `模板名 (N)` 后缀 |
| noteId 处理 | 方案 A：导入时重新生成 + 写入示例 md |
| 自定义模板 | v2 再做，本次不实现 |
| 首批模板 | 6 个：空白 / Kanban / Mindmap / 周计划 / 项目路线图 / 会议笔记 |

---

## 三、架构分层

```
┌─────────────────────────────────────────────────────────┐
│  UI 层 (src/mainview)                                    │
│  ├─ routes/templates/index.tsx           Grid 列表       │
│  ├─ routes/templates/$templateId.tsx     只读 ReactFlow 预览 + 使用按钮 │
│  ├─ components/canvas/ViewSwitcher.tsx   New Canvas 改为 Submenu │
│  └─ hooks/useTemplates.ts                拉取列表 / 应用模板 │
├─────────────────────────────────────────────────────────┤
│  RPC 层 (src/mainview/lib/rpc.ts)                        │
│  ├─ rpcListTemplates()                                   │
│  ├─ rpcGetTemplate(id)                                   │
│  └─ rpcCreateViewFromTemplate(name, templateId)          │
├─────────────────────────────────────────────────────────┤
│  主进程 (src/bun)                                        │
│  ├─ templates.ts (新建) 模板注册表 + 读取器              │
│  ├─ workspace.ts 扩展：addViewFromTemplate()             │
│  └─ index.ts 注册三个 RPC handler                        │
├─────────────────────────────────────────────────────────┤
│  模板数据                                                │
│  └─ src/bun/templates/<id>/                              │
│     ├─ meta.json           { id, name, description, category, tags } │
│     ├─ thumbnail.png       列表卡片缩略图                 │
│     └─ manifest.canvas.json 真正的 nodes/edges 数据       │
└─────────────────────────────────────────────────────────┘
```

### 模板数据模型

```ts
export interface TemplateMeta {
  id: string;              // 'kanban', 'mindmap', ...
  name: string;            // i18n key 或直接文本
  description: string;
  category: 'planning' | 'thinking' | 'knowledge' | 'blank';
  tags: string[];
  thumbnail: string;       // 相对路径或 data URL
}

export interface TemplateManifest {
  meta: TemplateMeta;
  nodes: Node[];           // 复用 xyflow 结构
  edges: Edge[];
  // 注意：模板里不含 noteId 指向的 content/*.md；
  // 导入时需为每张 CardNode 生成新 noteId 并创建对应 md。
}
```

---

## 四、页面布局

### 4.1 `/templates` 列表页（全屏，复用 `__root` 顶部 titlebar）

- `[← 返回画布]` + 标题
- 搜索框 + 分类 tabs（全部 / 规划 / 思维 / 知识库 / 空白），状态同步到 `?q=` / `?category=`
- `grid-cols-2 md:3 lg:4 xl:5 gap-6 p-8` 的卡片
- 卡片 = 缩略图 + 名称 + 描述 + 标签；点击跳 `/templates/$templateId`

### 4.2 `/templates/$templateId` 预览页

- 左侧 7 份：**只读 ReactFlow**（渲染真实 nodes/edges，禁用所有交互）
- 右侧 3 份：模板元信息 + `[使用此模板]` + `[取消]`
- 小屏上下堆叠（预览 60vh + 信息面板）
- `ESC` / `[取消]` → `navigate({ to: '/templates' })`
- `[使用此模板]` → 调 `rpcCreateViewFromTemplate` → 成功后切换到新 view 并导航回 `/`

### 4.3 只读 ReactFlow 关键配置

```tsx
<ReactFlow
  nodes={templateNodes}
  edges={templateEdges}
  nodeTypes={readOnlyNodeTypes}
  edgeTypes={edgeTypes}
  fitView
  fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
  nodesDraggable={false}
  nodesConnectable={false}
  nodesFocusable={false}
  edgesFocusable={false}
  elementsSelectable={false}
  panOnDrag={false}
  panOnScroll={false}
  zoomOnPinch={false}
  zoomOnScroll={false}
  zoomOnDoubleClick={false}
  onPaneContextMenu={(e) => e.preventDefault()}
  onNodeContextMenu={(e) => e.preventDefault()}
  proOptions={{ hideAttribution: true }}
/>
```

- 必须用**独立 `<ReactFlowProvider>`**，避免与主画布共享 fitView/viewport 状态。
- 不挂 Controls / MiniMap / ConnectionPreviewLine / HelperLines。

---

## 五、实施阶段（P0 → P5）

| 阶段 | 范围 | 验收标准 | 状态 |
|------|------|---------|------|
| **P0** | 节点重构：抽出 5 个纯展示 `XxxContent` + `readOnlyNodeTypes` | 所有节点单测绿；无 store/RPC 泄漏 | ✅ **完成** |
| **P0.5** | 临时 dev 路由 `/preview-test` 验证只读节点渲染保真度 | 真实浏览器下 5 种节点显示正常 | ✅ **完成** |
| **P1** | 后端地基：`src/bun/templates.ts` + 3 个 RPC + 第一个模板（Kanban） | `bun run test` 覆盖 `list / get / createViewFromTemplate`；可通过 DevTools 手动调 RPC 建画布 | ⏳ 待开始 |
| **P2** | ViewSwitcher 改 Submenu | 两项可点击，空白走旧流程，"选择模板"跳 `/templates` | ⏳ |
| **P3** | `/templates` 列表页 + `useTemplates` hook | Grid、搜索、分类；`?q=&category=` 深链可用 | ⏳ |
| **P4** | `/templates/$templateId` 预览页 + 使用流程 | 只读 ReactFlow 渲染；`[使用此模板]` 端到端建 view 并切换 | ⏳ |
| **P5** | 其余 5 个模板 + 缩略图 + i18n + 完整测试 + `bun run ci` 通过 | 视觉完整、CI 绿 | ⏳ |

---

## 六、✅ 已完成：P0 · 节点重构

**目标**：为只读预览场景建立"展示层 / 容器层"分离的规范，防止 store/RPC 跨组件泄漏。

### 改动文件（8 个）

- `src/mainview/components/canvas/nodes/CardNode.tsx` — `CardContent` 增加 `readOnly` prop（禁用 checklist 交互、隐藏 Add input、强制 preview-only 渲染，跳过 `EditableCardContent`）
- `src/mainview/components/canvas/nodes/StickyNode.tsx` — 抽出 `StickyContent`（纯展示：body text + 折角装饰 + zoomed-out 占位）
- `src/mainview/components/canvas/nodes/FolderNode.tsx` — 抽出 `FolderContent`（三层紫色叠层 + 封面 + 标题/副标题/页脚）
- `src/mainview/components/canvas/nodes/GroupNode.tsx` — 抽出 `GroupContent`（motion.div 容器 + label，`children` slot 供 Handle/Resizer 注入）
- `src/mainview/components/canvas/nodes/ImageNode.tsx` — 无需改（`ImageContent` 本就纯净）
- `src/mainview/components/canvas/nodes/readOnlyNodes.tsx` ★ **新文件** — 导出 5 个只读包装：`CardNodeReadOnly` / `ImageNodeReadOnly` / `StickyNodeReadOnly` / `FolderNodeReadOnly` / `GroupNodeReadOnly`（只渲染 Handle + Content，**零 store 订阅 / 零 RPC / 零 NodeResizer**）
- `src/mainview/components/canvas/nodes/CardNode.test.tsx` — 新增两组断言：checklist 在 `readOnly` 下无 input 且点击 no-op；默认 card 在 `readOnly + focused` 下强制 preview-only
- `src/mainview/components/canvas/nodes/readOnlyNodes.test.tsx` ★ **新文件** — 硬 mock：一旦只读包装意外触达 `canvasStore` 或 RPC 立即抛错
- `src/mainview/lib/canvasConstants.ts` — 新增 `readOnlyNodeTypes` 导出，映射与 `nodeTypes` 对齐

### 关键设计决策

1. **只 `CardContent` 需要 `readOnly`**（它有 checklist + Add input + focused 自动编辑态）；其余 Content 通过不传 `editing*` props 默认即只读，接口更精简。
2. **不引入共享 `types.ts`**：每个 Content 本地定义接口，避免不必要的抽象泄漏。
3. **`GroupContent` 用 children slot 模式**（因为 group 的 motion.div 就是整个视觉容器），其余四个用"Content 与 Handle/Resizer 同层兄弟"模式。

### 验收结果

- ✅ `bun run test src/mainview/components/canvas/nodes/`：**30/30 通过**（6 files）
- ✅ `bunx tsgo --noEmit`：涉及文件 0 错误
- ✅ `bunx ultracite check`：0 错误
- ✅ Code-reviewer 两轮通过（首轮删除孤儿 `types.ts`；次轮 hoist regex 到模块顶层）

---

## 七、✅ 已完成：P0.5 · 临时预览路由 `/preview-test`

**目标**：用 `readOnlyNodeTypes` 在真实 ReactFlow 里验证 5 种节点渲染保真度，排除"表面靠 pointer-events-none 屏蔽"的隐藏耦合。

### 新增文件

- `src/mainview/routes/preview-test.tsx`（文件头注释：**"DELETE when P0 visual verification is done"**）

### 渲染内容

- **Row 1 · 4 张 Card**：default text / checklist / pie chart / dark background
- **Row 2**：2 张 Sticky（黄/绿）· 1 个 Folder · 2 个 Image（含图/空占位）
- **Row 3**：1 个 Group + 3 个子节点（2 sticky + 1 card），验证父子 + `extent: 'parent'`
- 4 条 `labeledEdge` 串联各行，验证 edge 渲染

### 技术要点

- 自建 `<ReactFlowProvider>`，不污染主画布 store
- `nodesDraggable/Connectable/Focusable=false` + `elementsSelectable=false`
- **刻意打开** `panOnDrag / panOnScroll / zoomOnScroll`，方便拉到 zoom < 0.4 触发极简占位视觉
- 演示图用**内联 SVG data URL**（离线可用）
- 主题适配：`useTheme` 对齐 `index.tsx` 的写法（light/dark 背景 + 网格色）
- 顶部半透明 overlay：返回链接 + 使用说明

### 验收结果

- ✅ 实机浏览器验证（`vite --port 5173` + browser-use）：5 种节点 + edges 全部正常渲染，无 functional console error
- ✅ TanStack Router Vite 插件自动更新 `routeTree.gen.ts`

### ⚠️ 清理提醒

**合并 P1 前必须删除 `preview-test.tsx`，并重新生成 `routeTree.gen.ts`**（启动一次 vite 即可），否则会意外 ship 一个隐藏的 `#/preview-test`。

---

## 八、明天从这里开始（P1 实施清单）

### 8.1 后端（`src/bun/`）

- [ ] `src/bun/templates.ts`（新建）
  - [ ] `listAllTemplates(): Promise<TemplateMeta[]>` — 扫描 `src/bun/templates/*/meta.json`
  - [ ] `loadTemplate(id: string): Promise<TemplateManifest>` — 读取 `manifest.canvas.json` + meta
  - [ ] 缩略图路径解析（返回 data URL 或绝对本地路径）
- [ ] `src/bun/workspace.ts`（扩展）
  - [ ] `addViewFromTemplate(name: string, templateId: string, generateNoteContents: boolean)`:
    1. 调 `loadTemplate(templateId)`
    2. 为每个 card-with-noteId 生成新 `noteId` + 创建对应 `content/<noteId>.md`（写入模板里定义的示例内容）
    3. 替换 nodes 中的 `data.noteId`
    4. 建立新的 `.canvas.json` manifest
- [ ] `src/bun/index.ts` 注册 3 个 RPC：
  - [ ] `listTemplates()`
  - [ ] `getTemplate({ id })`
  - [ ] `createViewFromTemplate({ name, templateId })`
- [ ] `src/bun/index.test.ts` + 可能的 `src/bun/templates.test.ts` / `src/bun/workspace.test.ts`
  - 覆盖 listAll / load / addViewFromTemplate（不覆盖已有 view、正确生成 md 文件）

### 8.2 第一个模板：Kanban

- [ ] 目录 `src/bun/templates/kanban/`
  - [ ] `meta.json`（id=kanban, category=planning, 英文 + 中文描述）
  - [ ] `manifest.canvas.json` —— 3 个 Group（待办 / 进行中 / 完成）+ 每组 2 张 card-checklist，外加 1 张说明 sticky
  - [ ] `thumbnail.png`（先手工或 placeholder PNG，P5 再统一精修）

### 8.3 RPC 前端

- [ ] `src/mainview/lib/rpc.ts`：新增 `rpcListTemplates` / `rpcGetTemplate` / `rpcCreateViewFromTemplate`
- [ ] `src/mainview/lib/rpc.test.ts`：补对应单测

### 8.4 验证通道（P1 不做 UI）

用浏览器 DevTools 手动调：
```js
await window.rpc.listTemplates()
await window.rpc.getTemplate({ id: 'kanban' })
await window.rpc.createViewFromTemplate({ name: 'Kanban 2025', templateId: 'kanban' })
```
确认新的 `.canvas.json` + 所需 `content/*.md` 都落地后，再进 P2。

---

## 九、测试计划（P1–P5 汇总）

- **后端**：`bun/templates.test.ts`、`bun/workspace.test.ts`、`bun/index.test.ts`
- **RPC**：`mainview/lib/rpc.test.ts`
- **UI**：
  - `routes/templates/index.test.tsx`（Grid 渲染、空态、搜索、分类）
  - `routes/templates/$templateId.test.tsx`（预览、使用按钮、错误态）
  - `components/canvas/ViewSwitcher.test.tsx`（Submenu 两项、路由跳转 mock）
- **集成**：`bun run dev:hmr` 端到端；刷新 `#/templates/kanban` 应仍进入预览

---

## 十、风险与未决事项

| 风险 | 当前应对 |
|------|---------|
| Base UI `Menu.SubmenuRoot` API 具体用法 | P2 进入时先读 Menu 组件源码确认；必要时降级为第二层 Menu.Root |
| 进入 `/templates` 时画布未保存 | 主画布组件卸载时强制 `flushPendingSave`；P4 补 e2e |
| Hash 路由下 `#/templates/kanban` 深链 | 项目已用 `createHashHistory()`，原生支持 |
| `routeTree.gen.ts` 同步 | Vite dev 插件自动生成；CI 可加一步 `bunx vite build --ssr? ` 强制生成检查 |
| 节点在极小 zoom（< 0.1）下的占位视觉 | P0 已验证；P4 预览页固定 `maxZoom: 1, fitView padding: 0.15` 避开 |
| 模板导入时的 noteId 冲突 | 方案 A 重新生成 id，与 workspace 现有命名策略一致；P1 单测覆盖 |

---

## 十一、相关资料

- 路由现状：`src/mainview/routes/__root.tsx`（固定 titlebar + Outlet）、`src/mainview/routes/index.tsx`（画布主页）
- 节点现状：`src/mainview/components/canvas/nodes/`（5 个节点 + readOnly 版）
- Canvas 常量：`src/mainview/lib/canvasConstants.ts`（`nodeTypes` / `edgeTypes` / `readOnlyNodeTypes`）
- 多画布管理基础：`docs/features/In Progress/plan-multi-canvas-workspace.md`
- 现有临时验证路由：`src/mainview/routes/preview-test.tsx`（**合并 P1 前删除**）
