# 技术规范文档 (Tech Spec)：GhostBoard

> 本文档描述 GhostBoard 的技术实现细节，包括架构、状态管理、渲染引擎、数据持久化、RPC 协议等。
> 产品需求与交互设计请参阅 [PRD](./PRD.md)。
>
> **2026-11-05 删除**：Checklist / Pomodoro / Reminder / Recording 卡片、legacy widget 体系（`widgetStore`、`WidgetNode`、widget RPC）、扩展定时调度（scheduler）、许可证（`license.ts`）与画布类型启用开关。本文中描述它们的章节为历史记录。现状：`src/bun/extensions/migration.ts` 在 `loadCanvas` 时把旧清单转为笔记卡（GFM 任务列表）、旧录音转为文件卡，番茄钟/提醒保留为未知类型占位；`src/bun/widgets.ts` 只剩只读加载供迁移使用。
>
> 最近同步：2026-10 对照源码补上 Canvas Type 行为、本地 HTTP 端点、许可证、诊断、发布和 BlockNote AI 配置（§12–§17）。更早的正文仍以 2026-06 至 2026-07 的 sidecar、附件、widget、Folder waterfall 与 FocusedView 为主；和代码冲突时以源码为准。

---

## 1. 架构总览

### 1.1 双进程模型

```
┌─────────────────────────────────────────┐     ┌──────────────────────────────────────┐
│        React 渲染端 (src/mainview/)      │     │       Bun 主进程 (src/bun/)           │
│                                         │     │                                      │
│  canvasStore (Zustand)                  │     │  RPC / HTTP handlers                 │
│    ├─ nodes / edges / viewport          │     │    ├─ loadCanvas / saveManifest      │
│    ├─ focusedNode / focusedFolder       │     │    ├─ loadBlockNote / saveBlockNote  │
│    ├─ undo/redo / clipboard             │     │    ├─ create/clone/save Widget       │
│    └─ library / search / tag UI state   │     │    ├─ attachment upload / stream     │
│  widgetStore (Zustand)                  │     │    └─ views / settings / exports     │
│    └─ widget records + per-id undo      │     │         │                            │
│  useCanvasPersistence         │         │     │    文件系统 (原子写入)                  │
│    └─ debounce 2500ms ─────── ▼         │     │    workspace/                         │
│                        electrobun/view  │────▶│    ├── .ghostboard/views/*.canvas.json│
│                           RPC client    │◀────│    ├── .ghostboard/widgets/*.json    │
│                                         │     │    ├── content/.ghostboard/blocknote/ │
│  uploadAttachmentBlob ───── HTTP POST ───────▶│    ├── content/*.md (legacy/import)   │
│  hydrate ◀──────────── 启动时加载         │     │    └── attachments/                   │
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
| 路由       | TanStack Router              | 文件路由；非 http(s) 环境使用 hash history           |
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
    index.ts                               # 薄启动层：诊断初始化、workspace/本地 HTTP 启动、组装 RPC handler、创建窗口
    appState.ts                            # 进程级可变状态（mainWindow / mainRpc / diagnostics / localHttpServer / AI key 缓存）
    settings.ts                            # AppSettings 规范化 + settings.json 读写（getCachedSettings）
    aiConfig.ts                            # 按当前设置 + 凭据组装 AIServerConfig
    appLifecycle.ts                        # 应用菜单、版本信息、更新检查、切换 workspace
    mainView.ts                            # 渲染端入口 URL（dev server 探测）
    canvasHydration.ts                     # loadCanvas/saveManifest 的节点水合 / 序列化 / checklist→widget 迁移辅助
    exportHelpers.ts                       # 导出文件名清洗、附件拷贝、workspace zip 归档
    rpc/
      types.ts                             # CanvasRPC schema + RpcRequestHandlers<K> 辅助类型
      context.ts                           # RpcContext：handler 工厂共享的 workspace 级服务
      writeParamSchemas.ts                 # 写入类 RPC 的 zod 参数校验（withRpcWriteValidation）
      handlers/<domain>.ts                 # 按业务域拆分的 handler 工厂：canvas / widgets / extensions / notes / attachments / export / settings / diagnostics / ai / trash / app / views / metadata / templates / license
    workspace.ts                           # workspace 初始化 + 读写 workspace.json + 画布视图 CRUD (addView/removeView/renameView)
    manifest.ts                            # canvas manifest 读写 + 原子写入
    notes.ts                               # legacy .md 文件 CRUD + frontmatter 解析/序列化
    noteStore.ts                           # sidecar-first note record 读取抽象，合并 legacy .md 索引
    attachments.ts                         # attachments/ 附件保存、streaming upload、读取、打开/Reveal 与路径校验
    localHttpServer.ts                     # localhost HTTP bridge：附件上传、附件 byte range stream、AI proxy、链接预览
    localHttpAuth.ts                       # 本地 HTTP 凭据：主渲染端 / 媒体 token
    blocknote.ts                           # BlockNote JSON sidecar 读写、schema 校验、revision 管理
    thumbnail.ts                           # 文本 excerpt / archive summary 元数据生成（saveAttachment 后调用）
    linkPreview.ts                         # Link unfurl：抓取网页 title/description/icon/image
    search.ts                              # workspace 搜索索引与匹配评分
    templates.ts                           # 内置模板 registry + manifest/meta 加载
    nodeMetadata.ts                        # 节点标签元数据（tag / tagColor / tags）持久化、批量重命名/删除标签
    widgets.ts                             # widget JSON CRUD：create/load/save/clone/delete + schema 校验
    templates/                             # 内置 demo / kanban 模板数据
  mainview/                                # React 渲染端
    main.tsx                               # 挂载 ThemeProvider + RouterProvider
    router.ts                              # TanStack Router 创建，注入 QueryClient
    routeTree.gen.ts                       # [生成文件] 不要手动编辑
    index.css                              # Tailwind 入口
    routes/
      __root.tsx                           # 全局 Shell：SettingsDialog、Sonner toaster、DevTools
      index.tsx                            # 主画布：ReactFlow + CanvasToolbar + CanvasViewportChrome + FocusedView + ViewSwitcher + ContextMenu + RecordingRecorder
      templates/
        index.tsx                          # 模板库列表
        $templateId.tsx                    # 模板只读预览 + 从模板创建画布
    store/
      canvasStore.ts                       # Zustand store：nodes/edges/UI 状态/undo-redo/clipboard/CRUD/多画布/布局模式
      widgetStore.ts                       # 独立 widget 内容 store：records + per-widget undo 栈 + debounce 落盘
    hooks/
      useCanvasKeyboard.ts                # 全局快捷键：Delete/Cmd+C/V/A/N/Z/Enter/Escape/Tab/F2（widget 焦点时路由到 widget undo；Tab/F2 与 Enter 的 Topic 语义见 §3.1）
      useCanvasPersistence.ts             # 自动保存：subscribe store → debounce → RPC saveManifest（动态 viewId）
      useContextMenu.ts                   # 右键菜单状态管理 + action 分发（含 Folder child / widget）
      useHelperLines.ts                   # 辅助对齐线（拖拽时的 snap-to 提示）
      useNodeCreation.ts                  # 节点创建入口（ViewSwitcher + ContextMenu 共用；widget 走 createWidget RPC）
      useNodeDrag.ts                      # 三阶段拖拽：解除 parent → 检测交叉 → 确认 drop（Group/Folder）；拖动 Topic 时整条分支随行
      useNodeMetadata.ts                  # 节点标签元数据查询 + 乐观更新 mutation
      useNoteSaver.ts                     # legacy Markdown note debounce 保存
      useSearch.ts                        # SearchDialog 数据源：后端搜索 + 当前画布内存结果合并
      useTags.ts                          # workspace 标签聚合查询（TagSidebar 数据源）
      useTemplates.ts                     # 模板列表/详情 query hooks
    components/
      canvas/
        CanvasToolbar.tsx                 # 左上角浮动工具栏：Library / Tag Sidebar / Settings
        CanvasViewportChrome.tsx          # 右下角 minimap + zoom controls 合一 frosted 面板
        ContextMenu.tsx                   # 右键菜单 UI（canvas/card/widget/folder/group/sticky/topic/image/asset/link/recording）
        FocusedView.tsx                   # 聚焦模式：从源卡片 morph 展开 + overlay
        FolderView.tsx                    # Folder drill-down 辅助层（返回动画等）
        HelperLines.tsx                   # 对齐辅助线渲染
        RecordingRecorder.tsx             # 麦克风录音 overlay
        ViewSwitcher.tsx                  # 底部画布切换器 + 新建/导入/导出/重命名/删除画布
        nodes/
          CardNode.tsx                    # 图文 Card 节点（普通 note；checklist 已迁出）
          WidgetNode.tsx                  # 统一 widget 外壳：按 kind 分发 checklist / pomodoro / reminder
          FolderNode.tsx                  # 堆叠式文件夹 + waterfall 展开子节点
          FolderExpandedChildNode.tsx     # Folder 展开层子项渲染
          GroupNode.tsx                   # 开放式分组容器节点
          ImageNode.tsx                   # 图片卡片节点
          AssetNode.tsx                   # 本地文件/视频/音频节点
          LinkNode.tsx                    # URL 链接节点
          RecordingNode.tsx               # 录音节点（音频附件 + waveform + 播放控件）
          StickyNode.tsx                  # 便签节点
          TopicNode.tsx                   # 主题节点：纯文本标题原地编辑 + 按标题自适应尺寸
          readOnlyNodes.tsx               # 模板预览等只读节点变体
        edges/
          LabeledEdge.tsx                 # 支持 label / pathType / floating endpoints 的自定义边；`data.kind: 'topic-child'` 的树边由宿主约束渲染与交互
      card/
        NodeTagChips.tsx                  # 节点标签展示组件（主标签 + 次要标签 chips）
        TagEditor.tsx                     # 标签编辑 Popover（输入/颜色/自动补全）
        useNodeTagEditing.tsx             # 标签编辑 Hook（状态管理 + RPC 调用）
      editor/
        BlockNoteEditor.tsx               # BlockNote 块编辑器（聚焦模式使用）
        NoteEditorLoading.tsx             # note / BlockNote 加载占位（FocusedView 与编辑器共享）
        blocknoteAttachments.ts           # BlockNote 附件上传/URL 解析
        useBlockNoteSaver.ts              # BlockNote sidecar 保存逻辑（debounce + revision 管理）
      tags/
        DeleteTagConfirmDialog.tsx        # 删除标签二次确认弹窗
        TagSidebar.tsx                    # 标签侧边栏（列表/筛选/重命名/删除）
      library/
        LibraryPopup.tsx                  # 画布内笔记/资产库弹窗
      search/
        SearchDialog.tsx                  # 全局搜索弹窗
      settings/
        SettingsApp.tsx                   # 设置内容面板（被 SettingsDialog 嵌入）
        SettingsDialog.tsx                # 内嵌设置弹窗：General / Workspace / AI / Shortcuts / About
      ui/                                 # shadcn/ui 基础组件
      layout/                             # ErrorBoundary, Loader
    lib/
      canvasConstants.ts                   # 节点尺寸常量 + nodeTypes 注册表
      canvasNodeRegistry.ts                # 节点规格单一 registry（默认尺寸、data、Folder/Group 能力；widget kinds）
      canvasNodePredicates.ts              # 节点能力谓词（可聚焦、可进 Folder/Group 等）
      contentTypes.ts                      # CanvasNodeKind、Asset/Link/Recording 数据结构、文件分类、URL helper
      widgetTypes.ts                       # WidgetKind / WidgetRecord 前端类型与 load-error 判别
      folderExpansion.ts                   # Folder 封面缩略图布局 + bottom-up waterfall 展开坐标
      canvasBackground.ts                  # 画布背景 token（default/paper/cream/mono）→ CSS 变量
      canvasUtils.ts                       # sortNodesByParent, isDescendant 等工具函数
      topicTree.ts                         # Topic 树纯函数：由 nodes + `topic-child` 边推导索引、遍历分支、检测环/多父/跨容器、锁定阻断、导出大纲投影
      topicLayout.ts                       # Topic 向右树布局纯函数：父节点在子树中垂直居中，只重算受影响子树；`layoutTopicTreeAvoiding` 叠加避让层（收集非本树障碍物、有界偏移搜索、Group 硬边界与锁定校验，软避让无解仍提交并提示）
      nodeQuota.ts                         # 免费额度共享门禁：`card`/`sticky`/`topic` 同一计数，支持批量预检 additionalCounted
      topicMeasure.ts                      # 按纯文本标题测量 Topic 尺寸（与渲染同一套字体度量）
      topicColors.ts                       # Topic 颜色 token → 节点样式与派生树边颜色
      colorUtils.ts                        # 颜色常量（hex）+ colorToStyle 转换
      assetFiles.ts                        # 前端文件导入：streaming upload、生成缩略图/waveform
      canvasExport.ts                      # 当前画布 JSON 与 2x PNG screenshot export
      getHelperLines.ts                    # 辅助线计算逻辑
      recordingFiles.ts                    # 录音 Blob → 附件保存 + RecordingNodeData
      queryClient.ts                       # React Query 共享客户端（错误→Sonner toast）
      rpc.ts                               # Electrobun RPC 客户端封装（非 Electrobun 环境自动降级）
      canvasNodeSerialization.ts           # 写盘前过滤运行时字段（含 widget 仅保留 widgetId/kind）
      undoRedo.ts                          # 画布 undo/redo 纯函数（快照历史栈，上限 50）
      utils.ts                             # cn() 工具
    data/
      initialNodes.ts                      # 种子数据（纯前端 fallback / 测试；checklist 走 widget）
  shared/                                  # 主进程与渲染端共用的纯模块
    canvasEdgeFields.ts                    # 边的 effective-field 投影：宿主派生值优先于持久化 data（树边用）
    topic.ts                               # Topic 节点/树边数据模型、颜色 token、运行期校验与 buildTopicChildEdge
    topicMarkdownExport.ts                 # 主题大纲 → 嵌套 Markdown 列表（纯文本转义、迭代遍历）
    searchTypes.ts                         # 搜索结果 kind / target 契约
    ai/                                    # AI 上下文与 provider 共享类型
    markdown/                              # Markdown 解析/渲染共享 helper
    extensions/                            # Canvas Type 共享契约
    contentEvents.ts                       # 笔记保存后主进程推给渲染端的变更事件（画布同步标题/颜色/正文）
```

上面的树停在 2026-07。内置扩展的现行代码在 `src/mainview/extensions/`、`src/shared/extensions/`、`src/bun/extensions/`，行为见 §12。插件系统已删除（§13 末尾）。

---

## 3. 节点类型系统

### 3.1 nodeTypes 注册表

`canvasConstants.ts` 中注册所有 React Flow 节点类型；节点规格的单一来源是 `canvasNodeRegistry.ts`：

| kind / type | 组件            | 持久化方式                                                    | 可聚焦        | 可 Resize                    |
| ----------- | --------------- | ------------------------------------------------------------- | ------------- | ---------------------------- |
| `card`      | `CardNode`      | manifest 轻引用 `noteId`；内容源优先 sidecar JSON，legacy `.md` 只作迁移/导入 fallback | ✅            | ✅ (150~800 × 150~900)       |
| `checklist` | `WidgetNode`    | 创建 kind；`node.type = widget`，`data = { widgetId, kind }`；内容在 `.ghostboard/widgets/` | ✅            | ✅                            |
| `pomodoro`  | `WidgetNode`    | 同上，`kind: 'pomodoro'`                                      | ❌ 画布内操作 | ✅                            |
| `reminder`  | `WidgetNode`    | 同上，`kind: 'reminder'`                                      | ❌ 画布内操作 | ✅                            |
| `image`     | `ImageNode`     | `attachments/img_<id>.<ext>` 原图 + 可选 thumbnail，manifest 存相对路径 | ✅            | ✅ (150~800 × 150~900)       |
| `asset`     | `AssetNode`     | `attachments/{video|audio|file}_<id>.<ext>` + 可选 thumbnail/waveform/metadata | ✅            | ✅                           |
| `link`      | `LinkNode`      | manifest `data.url` + unfurl 元数据                           | ✅            | ✅                           |
| `recording` | `RecordingNode` | `attachments/audio_<id>.<ext>` + `recordingNumber` + waveform/duration | ❌            | ✅ (默认 380×150)            |
| `folder`    | `FolderNode`    | manifest `data.children` 引用子节点/子笔记                    | ✅ drill-down | ✅ (250~600 × 250~600)       |
| `group`     | `GroupNode`     | manifest `data.label` + `data.color`                          | ❌            | ✅ NodeResizer (min 300×200) |
| `sticky`    | `StickyNode`    | manifest `data.content` + `data.color` 内嵌；可选 `data.pinned` 钉住当前位置 | ❌ 原地编辑（锁定时不可编辑） | ✅ (120~500 × 120~500；锁定时无手柄。钉住仍可缩放) |
| `topic`     | `TopicNode`     | manifest `data.title` + `data.color` + `data.topicVersion` 内嵌；层级只在 `topic-child` 边上 | ❌ 原地编辑标题 | ❌ 按标题自动测量尺寸 |

> 上表的 `widget` 路径描述 legacy 兼容模型。当前三个内置 Productivity 类型通过 Canvas Type 注册为 `extension` 节点：Checklist 声明 `openBehavior: 'detail'`，Pomodoro / Reminder 声明 `openBehavior: 'none'`；三者均可进入 Group、不可新进入 Folder。已存在于 Folder 中的 legacy `widget` 或迁移后 `extension` 子项仍须可读取并无损 Extract。

### 3.2 TypeScript 类型定义

> 以下为设计目标类型。实际代码中部分字段使用宽松 `any`/`Record<string, unknown>`，后续逐步收敛。

```typescript
// ─── ID 类型 ───
type NoteID = string; // 内容实体 ID，如 "note_a1b2c3d4"
type WidgetID = string; // 小组件内容 ID，如 "widget_ab12cd34"
type NodeID = string; // 画布实例 ID，如 "node_7f3a"
type ViewID = string;

// ─── Canvas node vocabulary (`contentTypes.ts` / registry kinds) ───
type CanvasNodeKind =
  | 'card'
  | 'checklist' // widget kind → node.type 'widget'
  | 'pomodoro'
  | 'reminder'
  | 'sticky'
  | 'folder'
  | 'group'
  | 'image'
  | 'asset'
  | 'link'
  | 'recording'
  | 'topic';

type AssetKind = 'video' | 'audio' | 'file';

interface ArchiveSummary {
  entryCount: number;
  topFiles: string[];
}

// ─── 内容层：sidecar-first note record ───
interface NoteFrontmatter {
  id: NoteID;
  title?: string;
  displayHint?: 'note' | 'image' | 'checklist'; // checklist 仅 legacy；新 checklist 是 widget
  color?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

interface NoteDocument {
  frontmatter: NoteFrontmatter;
  body: string; // legacy Markdown 正文
  file: string; // workspace-relative path
}

interface SidecarPreview {
  blocks: number;
  excerpt: string;
  html: string;
  version: number;
}

interface BlockNoteSidecar {
  schema: 'ghostboard-blocknote/v1';
  noteId: NoteID;
  revision: number;
  blocks: unknown[];
  title?: string;
  displayHint?: string;
  color?: string;
  createdAt?: string;
  updatedAt: string;
  preview?: SidecarPreview;
}

interface NoteRecord {
  noteId: NoteID;
  source: 'sidecar' | 'markdown';
  title: string;
  displayHint: string;
  color: string;
  revision: number;
  blocks: unknown[] | null;
  preview: SidecarPreview | null;
  corrupted: boolean;
  markdownFile?: string;
  markdownDoc?: NoteDocument;
}

// ─── 视图层：与 @xyflow/react 的 Node/Edge 类型对齐 ───
import type { Edge, Node } from '@xyflow/react';

interface ManifestNodeData extends Record<string, unknown> {
  noteId?: NoteID;
}

interface FolderChildEntry {
  data: Record<string, unknown>;
  id: string;
  noteId?: NoteID;
  widgetId?: string; // widget children
  type?: 'card' | 'widget' | 'image' | 'asset' | 'link' | 'recording';
}

// ─── Widget 内容层：.ghostboard/widgets/<widgetId>.json ───
type WidgetKind = 'checklist' | 'pomodoro' | 'reminder';

interface WidgetRecord {
  schema: 'ghostboard-widget/v1';
  id: string; // widget_<nanoid>
  kind: WidgetKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  data: ChecklistWidgetData | PomodoroWidgetData | ReminderWidgetData;
}

interface ChecklistWidgetData {
  items: Array<{
    id: string;
    text: string;
    checked: boolean;
    isHeader?: boolean;
    createdAt?: string;
    completedAt?: string;
  }>;
}

interface PomodoroWidgetData {
  mode: 'focus' | 'shortBreak' | 'longBreak';
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLongBreak: number;
  completedSessions: number;
  timer:
    | { state: 'idle' }
    | { state: 'running'; startedAt: string; durationMs: number }
    | { state: 'paused'; remainingMs: number };
}

interface ReminderWidgetData {
  dueAt: string;
  timezone: string;
  status: 'scheduled' | 'snoozed' | 'done' | 'missed';
  snoozedUntil?: string;
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly'; // 第一版只实现 'none'
  note?: string;
}

interface WidgetLoadError {
  error: 'missing' | 'corrupted';
  id: string;
}

interface CanvasNodeDataShapes {
  card: ManifestNodeData & {
    noteId: NoteID;
    file?: string; // legacy .md hint only; sidecar-backed records may omit it
    type?: 'text' | 'image'; // 'checklist' 已迁出为 widget；加载时懒迁移
    previewHtml?: string;
    previewExcerpt?: string;
    previewBlocks?: number;
    previewVersion?: number;
  };
  widget: {
    widgetId: string;
    kind: WidgetKind;
    // items / timer / dueAt 等完整内容在 widgetStore / 磁盘 JSON，不进 manifest
  };
  image: {
    imageFile?: string;
    imageUrl?: string; // runtime hydrated data URL
    thumbnailFile?: string;
    thumbnailUrl?: string; // runtime hydrated/generated data URL
    title?: string;
    color: string;
  };
  asset: AssetNodeData;
  link: LinkNodeData;
  recording: RecordingNodeData;
  folder: {
    title?: string;
    subtitle?: string;
    children: FolderChildEntry[];
  };
  group: {
    label?: string;
    color?: string; // semantic token: blue / green / yellow / pink / orange
  };
  sticky: {
    content: string;
    color?: string;
    /** 只固定便签在当前父坐标系中的位置。缺省或 false 表示未钉住，不渲染图钉。 */
    pinned?: boolean;
  };
  topic: {
    title: string; // 纯文本，不解析 Markdown / HTML，上限 2000 码点
    color: TopicColorToken; // token，不存具体色值；树边颜色由父主题派生
    topicVersion: number;
  };
}

interface AssetNodeData {
  archiveSummary?: ArchiveSummary;
  attachmentFile?: string;
  color: string;
  duration?: number;
  fileName: string;
  kind: AssetKind;
  mimeType: string;
  missing?: boolean; // runtime only
  previewExcerpt?: string;
  previewUrl?: string; // runtime only
  size?: number;
  thumbnailFile?: string;
  thumbnailUrl?: string; // runtime only
  title: string;
  waveform?: number[];
}

interface LinkNodeData {
  color: string;
  description?: string;
  faviconUrl?: string;
  imageUrl?: string;
  siteName?: string;
  title: string;
  unfurlError?: string;
  unfurlStatus?: 'idle' | 'loading' | 'ready' | 'failed';
  url: string;
}

interface RecordingNodeData {
  attachmentFile?: string;
  color: string;
  duration?: number;
  fileName: string; // user-facing recording-N.ext
  mimeType: string;
  missing?: boolean; // runtime only
  previewUrl?: string; // runtime only stream URL
  recordingNumber: number;
  size?: number;
  title: string;
  waveform?: number[];
}

type CanvasNode =
  | Node<CanvasNodeDataShapes['card'], 'card'>
  | Node<CanvasNodeDataShapes['widget'], 'widget'>
  | Node<CanvasNodeDataShapes['image'], 'image'>
  | Node<CanvasNodeDataShapes['asset'], 'asset'>
  | Node<CanvasNodeDataShapes['link'], 'link'>
  | Node<CanvasNodeDataShapes['recording'], 'recording'>
  | Node<CanvasNodeDataShapes['folder'], 'folder'>
  | Node<CanvasNodeDataShapes['group'], 'group'>
  | Node<CanvasNodeDataShapes['sticky'], 'sticky'>
  | Node<CanvasNodeDataShapes['topic'], 'topic'>;

type CanvasEdge = Edge<Record<string, unknown>, 'labeledEdge'>;

// 同一个 `labeledEdge` 承载两种语义，由 `data.kind` 区分。
//
// 关联边（无 kind）：用户可编辑 label / 动画 / pathType / 颜色 / 视觉反向。
// 树边（kind: 'topic-child'）：主题层级的**唯一**真源——node 上不存
// topicParentId / children / rootId，运行时索引由 nodes + edges 推导。树边归
// 宿主所有，以上通用编辑一律禁用，也不能直接删除；删除只经过带校验的拆支 /
// 删分支事务。`order` 为同级连续非负整数，插入与删除在同一事务内重排，不从
// 屏幕 y 坐标反推顺序。
interface TopicChildEdgeDataV1 {
  kind: 'topic-child';
  order: number;
  relationVersion: number;
}

interface CanvasViewManifest {
  schema: 'ghostboard-canvas/v1';
  viewId: ViewID;
  viewport?: { x: number; y: number; zoom: number };
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

interface WorkspaceConfig {
  schema: 'ghostboard-workspace/v1';
  activeViewId: ViewID;
  views: Array<{ id: ViewID; name: string; file: string }>;
  trash?: TrashEntry[];
}

interface TrashEntry {
  trashId: string;
  trashFile: string;
  deletedAt: number;
  view: { id: ViewID; name: string; file: string };
}

interface AppSettings {
  theme: string;
  locale: string;
  fontFamily: 'system' | 'serif' | 'mono';
  canvasBackground: 'default' | 'paper' | 'cream' | 'mono';
  canvasShowMinimap: boolean; // 默认 true；false 时仅显示 zoom controls
  canvasSnapToGrid: boolean;
  autoSaveInterval: 500 | 800 | 2000 | 5000;
  aiEnabled: boolean;
  aiProvider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  aiModel: string;
  aiBaseUrl: string;
}

// ─── 标签/元数据层：.ghostboard/node-metadata.json ───
interface NodeMetadata {
  tag?: string;       // 主标签（带颜色）
  tagColor?: string;  // 主标签颜色 hex
  tags?: string[];    // 次要标签
}

type NodeMetadataMap = Record<string, NodeMetadata>; // key = noteId (Card) / widgetId (Widget) / nodeId (其他)

interface NodeMetadataDocument {
  entries: NodeMetadataMap;
  schema: 'ghostboard-node-metadata/v1';
}

interface TagSummary {
  count: number;
  name: string;
}

interface TagMutationResult {
  updated: number;
}

```

### 3.3 Card `displayHint` / `data.type` 与 Widget 节点

**普通 Card（笔记）**：React Flow `node.type === 'card'`；创建 kind 与内容展示由 `displayHint` / `data.type` 区分：

| note record `displayHint` | 运行时 `data.type` | 说明 |
| ------------------------- | ------------------ | ---- |
| `note`（默认）            | `text`             | 普通 BlockNote 文档 |
| `image`                   | `image`            | legacy 显示 hint；新图片使用独立 `image` node kind |

当前 sidecar-backed note 的 `displayHint` 存在 `content/.ghostboard/blocknote/<noteId>.json`；legacy Markdown fallback 才从 frontmatter 读取。映射仍复用 `src/bun/notes.ts` 的 `displayHintToType` / `typeToDisplayHint` / `noteToCardData`，但新的读取入口是 `src/bun/noteStore.ts`。

**Widget（小组件，legacy 兼容）**：旧 React Flow 节点使用 `node.type === 'widget'`，kind 为 `checklist` / `pomodoro` / `reminder`。manifest 只保存 `{ widgetId, kind }`；完整内容在 `.ghostboard/widgets/<widgetId>.json`，运行时由 `widgetStore` 持有。当前新建内置类型使用 `node.type === 'extension'`、`{ canvasTypeId, instanceId }` 引用与 `.ghostboard/extension-instances/<instanceId>.json` 状态；旧 Widget 路径继续承担加载、搜索与取回兼容。产品语义见 [PRD](./PRD.md) §2.2 / §5。

| WidgetKind | 内容实体 | 说明 |
| ---------- | -------- | ---- |
| `checklist` | `WidgetRecord.data.items` | 待办列表；画布可直接勾选/添加；可进入 FocusedView |
| `pomodoro` | timer + session 配置 | 番茄钟；运行中 tick 不写盘，状态转换时保存 |
| `reminder` | `dueAt` + status | 提醒；第一版仅 app 内提示、`repeat: 'none'` |

**Checklist 懒迁移**：磁盘上若仍存在 legacy `type: 'card'` + `data.type: 'checklist'`（或 Folder child 等价形态），`loadCanvas` 会迁移为 `type: 'widget'`、`kind: 'checklist'`，写入确定性 `widgetId = widget_${noteId 去 note_ 前缀}` 的 widget 文件，并同步把标签 key 从 `note_*` 重写为 `widget_*`。旧 note 文件第一版不删除。

`asset`、`link` 与 `recording` 是独立 node kind，不使用 Card 的 `displayHint`。Asset / Recording 的内容实体是 `attachments/` 文件引用；Link 的内容实体是 URL 与 unfurl 元数据，均直接存放在 manifest `data` 中。

---

## 4. 状态管理

### 4.1 分层策略

| 层                | 工具                            | 职责                                                                                     |
| ----------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| 画布交互状态      | **Zustand** (`canvasStore.ts`)  | `nodes`/`edges`、`focusedNode`/`focusedFolder`、`clipboard`、undo/redo 历史栈、节点 CRUD |
| Widget 内容状态   | **Zustand** (`widgetStore.ts`)  | `records`、per-widget undo 栈、create/clone/update/save；**不**把 items/timer 写进 canvas 快照 |
| Extension 实例状态 | **Zustand** (`extensionInstanceStore.ts`) | 已迁移 Canvas Type 的 state/presentation、per-instance history 与持久化调度；**不**把业务 state 写进 canvas manifest |
| 异步/文件系统数据 | **TanStack React Query**        | 加载、缓存、重试、错误 toast                                                             |
| 局部 UI 状态      | `useState` / Hook 内部          | 右键菜单位置、拖拽 dropTarget、helper lines 等                                           |

### 4.2 canvasStore 结构

```
CanvasState
├── 核心数据: nodes, edges
├── UI 状态: focusedNode, focusedFolder, createMenuOpen, clipboard, nodeIdCounter, searchOpen, libraryOpen, tagSidebarOpen, activeTagFilter, editingTagNodeId
├── 搜索: pendingSearchTarget
├── 多画布: activeViewId, views[]
├── 录音: RecordingRecorder 由 routes/index.tsx 管理，完成后通过 createNode('recording') 入库
├── 核心 actions: setNodes, setEdges, applyNodesChange, applyEdgesChange, addConnection, updateNodeData, commitNodeData, commitEdgeData
├── UI actions: setFocusedNode, setFocusedFolder, setCreateMenuOpen, setSearchOpen, setLibraryOpen, toggleLibrary
├── 多画布 actions: setActiveView, setViews, setActiveViewId, setPendingSearchTarget
├── 剪贴板: copySelected, pasteClipboard（widget 节点会 cloneWidget 并重映射 widgetId）
├── 节点 CRUD: createNode, deleteNodes, changeNodeColor, addFolderChild, deleteFolderChild, updateFolderChildData
├── Topic 树: beginTopicDraft, beginTopicRelativeDraft, commitTopicDraft, commitTopicTitle,
│            detachTopicBranch, deleteTopicBranch（每个动作一次事务、一条画布历史）
├── 笔记池: detachNoteFromCanvas, pinNoteToCanvas
├── Hydration: hydrate(nodes, edges), reset(), _hydrated
└── Undo/Redo: saveSnapshot, undo, redo, canUndo, canRedo (_undoRedo: UndoRedoState)
```

### 4.2.1 widgetStore

```
WidgetStore
├── records: Record<widgetId, WidgetRecord | WidgetLoadError>
├── history: Record<widgetId, { past, future }>  // 每 widget 上限 50
├── hydrate(records)           // loadCanvas 返回的 widgets map
├── createWidget(kind, title?) // RPC createWidget → 写入 records
├── cloneWidget(widgetId)      // duplicate / 粘贴
├── updateWidget(id, updater)  // 压栈 + debounce saveWidget
├── undoWidget / redoWidget
└── saveWidgetNow(id)          // flush
```

- **删除画布上的 widget 节点只删引用**，不删 `.ghostboard/widgets/` 文件；未引用 widget 由 Unlinked / cleanup 管理。
- **hydrate 副作用**：超时仍在 `running` 的 pomodoro 按完成结算；due 的 reminder 可标为 `missed` 并 toast。
- 创建路径：`createNode('checklist'|'pomodoro'|'reminder')` → RPC `createWidget` → 节点 `data` 仅 `{ widgetId, kind }`。

### 4.3 Undo/Redo 机制

- **画布**：`undoRedo.ts` 导出 `pushSnapshot` / `undo` / `redo` 纯函数，不依赖 Zustand middleware。
- **快照策略**：在破坏性操作前调用 `saveSnapshot()`（`createNode`、`deleteNodes`、`addConnection`、`pasteClipboard`、`changeNodeColor`、`addFolderChild`、`onNodeDragStart`）。
- **Topic 事务边界**：「首次标题 + 建节点 + 建树边 + 排布」「改标题 + 改尺寸 + 排布」「删 / 拆 / 移分支」各只记一条画布历史——先算出并校验完整的下一份图，再记一次快照，并在一次图更新中同时写 nodes 和 edges；撤销一个新建主题不应需要按两次。Topic 没有独立内容栈。
- **历史栈上限**：画布与每个 widget 各自最多 **50** 步。
- **历史路由**：已迁移 Canvas Type 的离散内容更新进入 per-instance history；legacy widget 编辑继续使用 `undoWidget` / `redoWidget`；其他画布操作走画布 undo。各内容历史与画布历史互不感知。
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
  2. 调用方先 flush 当前画布 pending saves（ViewSwitcher / Search 跨画布跳转会显式保存；store action 本身不直接写盘）
  3. setActiveView(viewId) 清空 UI 状态：nodes / edges / focusedNode / focusedFolder / clipboard / undo-redo 历史栈
  4. 设置 _hydrated = false → 触发 index.tsx 中的加载 useEffect
  5. loadCanvas(viewId) → hydrate(newNodes, newEdges, viewport)
```

#### 持久化 hook 适配

`useCanvasPersistence` 通过 `useRef` 跟踪 `activeViewId`，当检测到切换时：

- 先用旧 viewId 调用 `flushNow` 保存未写入的变更
- 更新 ref 为新 viewId
- 重置 `skipHydrate` 标志，避免 hydrate 触发的 store 变更被误当作用户编辑

#### UI 组件

`ViewSwitcher.tsx` — 底部居中浮动面板：

- **触发器**：显示当前画布名称 + 节点计数 + 画布数量
- **弹出菜单**：列出所有画布，点击切换；支持行内重命名（铅笔图标）、软删除（至少保留 1 个）
- **快捷创建**：`+` 按钮打开子菜单，常用区 Note / Sticky / Link / Image；More 区 **Checklist / Pomodoro / Reminder** / Folder / Group / File / Recording / Markdown import / Note Library
- **导出**：同一面板提供 PNG screenshot export 与当前画布 JSON export
- **Trash**：删除 view 时 manifest 移入 `.ghostboard/trash/`，内嵌 `SettingsDialog` 可恢复或永久清理

#### 后端 workspace.ts

关键函数：`addView(wsPath, name)` / `addViewFromTemplate(wsPath, name, templateId)` / `removeView(wsPath, viewId)` / `restoreView(wsPath, trashId)` / `purgeTrash(wsPath, trashId)` / `renameView(wsPath, viewId, name)` / `setActiveViewId(wsPath, viewId)` / `saveWorkspaceConfig(wsPath, config)`。

`addView` 只注册空 view；真正的空 manifest 会在首次保存时落盘。`addViewFromTemplate` 会复制模板 manifest，为模板 note placeholder 生成新的 `noteId` 与 legacy Markdown 文件；这些 note 在首次 BlockNote 编辑时迁移为 sidecar JSON。`removeView` 是软删除，至少保留一个画布。

---

## 5. 渲染引擎与动画

### 5.1 画布引擎

- 使用 **@xyflow/react**（React Flow），DOM + 硬件加速方案。
- 整个大画布通过 `transform: translate(x, y) scale(z)` 控制，内部节点绝对定位。
- `selectionOnDrag` 正常启用；space-pan 或可编辑控件锁定交互时关闭，避免与平移/文本编辑手势冲突。
- `connectionMode: ConnectionMode.Loose` + `defaultEdgeOptions: { type: 'labeledEdge', zIndex: 1 }`。
- 所有节点提供四向 Handle（top/right/bottom/left）。
- `LabeledEdge` 支持 edge label、`pathType` 以及 floating endpoints；路径几何参数由 edge data 驱动并在保存前 sanitize。

### 5.2 连续缩放渲染

所有节点在 `minZoom = 0.1` 到 `maxZoom = 4` 范围内保持同一套内容树，不订阅 zoom，也不在固定阈值批量卸载完整内容并挂载 placeholder。这样可保持卡片视觉与空间辨认连续，并避免跨阈值时所有节点集中重渲染。

画布态本身保持轻量：文本卡只挂载只读摘要而非 BlockNote 编辑器；Image 优先显示持久化缩略图；Asset 使用 poster / waveform / 文本摘要；Link 通过 `IntersectionObserver` 仅在视口内触发 unfurl。后续若大画布基准确认存在瓶颈，应优先测量可见元素渲染和低缩放绘制样式简化，再决定是否引入新的 LOD。

### 5.3 FocusedView morph 与动画层

- FocusedView 使用 **从源卡片 morph 展开** 的 FLIP 风格过渡：读取源节点 `BoundingClientRect`，以卡片中心为 `transformOrigin`，全屏 shell 从源矩形 scale 到 1，退出时反向收缩。
- 借助 `motion/react`（Framer Motion）+ `AnimatePresence` 处理 open/close；easing 与 Folder 展开共用同一套曲线（`ease-out-quint` 系），使「打开卡片」与「打开 Folder」手感一致。
- React Flow 持有节点 transform，不直接承担模态过渡：
  1. 记录源节点屏幕矩形
  2. 全屏 overlay 以源矩形为起点 morph 到目标布局
  3. 源节点可隐藏（`data.isHidden`）避免双影
  4. 内容区：BlockNote 经 `lazy` + `Suspense`，fallback 为共享 `NoteEditorLoading`（与编辑器内 loading 同一组件）
- `BoundingClientRect` 仅在进入/退出或跨项导航时读取，不进入平移/缩放/拖拽热路径。
- Checklist 的 FocusedView 由 Canvas Type `DetailSurface` 提供。迁移后的编辑通过 host `instance.updateState({ history: 'record' })` 写 extension instance store；legacy widget 编辑仍写 `widgetStore`。两条路径都**不**经 `commitNodeData` 把 items 写回 manifest。

### 5.4 层级隔离与 Folder waterfall 展开

进入 Folder drill-down / 展开时：

- 背景画布冻结或降权，Folder 本体仍提供封面锚点。
- 子项通过 `folderExpansion.ts` 的 **bottom-up waterfall** 排布（取代早期横向 strip / shelf）：
  - 最多约 5 列从 Folder 上方中心向外生长；宽内容会自动减列
  - 新卡片落到当前最短、偏中的列，整列向上叠放，保留各子项自然尺寸
  - 展开层使用 `folderExpandedChild` 虚拟节点类型 + `FolderExpandedChildNode`
  - 封面最多展示约 5 个动态缩略图槽位（`getFolderThumbnailSlots`），超出部分不画完整内容
  - 展开子项上限约 8 个进入 waterfall 层；其余仍在 `children` 中但可被 overflow 隐藏策略处理
- 布局坐标**不持久化**，每次打开按 `children` 顺序与当前尺寸重算。
- Folder 子项右键 / 快捷键与顶层对齐（聚焦、Extract、锁、标签等），经 `useContextMenu` 的 folder-child 分支处理。

### 5.5 画布视口 chrome 与背景

- `CanvasViewportChrome`：右下角 frosted 面板，组合 React Flow `MiniMap` + 横向 `Controls`（缩放）。
- 设置项 `canvasShowMinimap`（默认 `true`）：为 `false` 时仅保留 zoom controls。
- 画布背景 `canvasBackground`：`default` | `paper` | `cream` | `mono`；`canvasBackground.ts` 映射为 CSS 变量，设置面板提供 swatch 选择器。
- PNG 导出前仍会临时隐藏 minimap / controls / panel / attribution，再截图 `.react-flow`。

---

## 6. 性能预算与降级策略

| 规模          | 目标体验                     | 策略                                                         |
| ------------- | ---------------------------- | ------------------------------------------------------------ |
| ≤ 500 节点    | 画布编辑 60fps               | 轻量展示型 DOM、媒体缩略图、memo、视口内 Link unfurl         |
| 500–1000 节点 | 平移缩放流畅，编辑延迟可接受 | 基于 Profiler 评估 `onlyRenderVisibleElements` 与绘制样式简化 |
| > 1000 节点   | 不承诺 MVP 全量流畅          | 后续引入虚拟化、SQLite 索引或 Canvas/WebGL 降级              |

**MVP 性能目标**：单画布 500 节点 + 1000 条边的日常编辑场景。

**前提约束**：上述预算建立在"未聚焦节点保持展示型 DOM、富编辑器只在选中/聚焦时挂载、FLIP 只在模态进出时读取布局"的前提下；500 节点目标仍需用混合节点数据集完成 Profiler 验证。

---

## 7. 数据持久化

> 严格遵循 [PRD §5](./PRD.md) 的 Local-First 架构。

### 7.1 Workspace 文件结构

```
workspace/
├── .ghostboard/
│   ├── workspace.json              # activeViewId + views 列表
│   ├── settings.json               # workspace 级 UI/AI 非密钥设置
│   ├── node-metadata.json          # 标签元数据（key = noteId / widgetId / nodeId）
│   ├── widgets/                    # 小组件内容 JSON（按 widgetId）
│   │   └── widget_ab12cd34.json
│   ├── trash/                      # soft-deleted canvas manifests
│   └── views/
│       └── default.canvas.json     # 画布 manifest（节点/边/viewport；widget 仅引用）
├── content/
│   ├── imported-legacy-note.md     # legacy/import Markdown fallback，不再是新笔记主存储
│   └── .ghostboard/                # 内容辅助文件
│       └── blocknote/              # BlockNote JSON note record（按 noteId 命名）
│           └── note_a1b2c3d4.json
└── attachments/
    ├── img_a1b2c3d4.png            # 图片 / poster / thumbnail
    ├── video_b2c3d4e5.mp4          # 视频附件
    ├── audio_c3d4e5f6.m4a          # 音频 / recording 附件
    └── file_d4e5f6a7.pdf           # 其他文件附件
```

- `workspace.ts` 负责初始化目录结构（含 `widgets/`）、读写 `workspace.json`，并提供 `atomicWrite()` 工具函数。
- `manifest.ts` 负责 canvas manifest 的序列化/反序列化。
- `noteStore.ts` 是 note record 的读取入口：优先 sidecar JSON，缺失时 fallback 到 legacy `.md`。
- `notes.ts` 负责 legacy Markdown CRUD、frontmatter 解析/序列化、`displayHint` ↔ `data.type` 映射。
- `blocknote.ts` 负责 sidecar JSON 路径校验、schema 校验、atomic write、revision 与 preview 字段。
- `widgets.ts` 负责 widget JSON 路径校验、schema 校验、atomic write、create/clone/load/save/delete。
- `attachments.ts` 负责附件写入、streaming upload、读取、打开/reveal 和 workspace-relative 路径校验。
- `.ghostboard/settings.json` 是 workspace-level 设置；`<userData>/userprefs.json` 保存 active workspace；`<userData>/ai-credentials.json` 保存 AI API key，不写入 workspace。

### 7.2 文件格式

#### BlockNote sidecar note record（PRD §5.4）

```json
{
  "schema": "ghostboard-blocknote/v1",
  "noteId": "note_a1b2c3d4",
  "revision": 12,
  "createdAt": "2026-04-01T10:00:00.000Z",
  "updatedAt": "2026-07-07T09:30:00.000Z",
  "title": "Prio before launch",
  "displayHint": "note",
  "color": "#EAF2B8",
  "preview": {
    "html": "<p>Lingering bugs</p>",
    "excerpt": "Lingering bugs",
    "blocks": 3,
    "version": 1
  },
  "blocks": []
}
```

Legacy Markdown (`content/*.md`) 仍会被 `noteStore.ts` 发现并可在 `loadBlockNote` 时作为一次性导入来源；`saveBlockNote` 不再写 Markdown 副本。模板创建仍可能产生 legacy `.md` note stub，这些 note 在首次聚焦编辑保存后迁移为 sidecar JSON。

#### Widget record（`.ghostboard/widgets/<widgetId>.json`）

```json
{
  "schema": "ghostboard-widget/v1",
  "id": "widget_ab12cd34",
  "kind": "checklist",
  "title": "Launch checklist",
  "createdAt": "2026-07-08T10:00:00.000Z",
  "updatedAt": "2026-07-16T09:30:00.000Z",
  "data": {
    "items": [
      { "id": "item_1", "text": "Update landing copy", "checked": false }
    ]
  }
}
```

#### Canvas Manifest（PRD §5.6，React Flow 原生结构）

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
      "style": { "width": 350, "height": 450 },
      "data": {
        "noteId": "note_a1b2c3d4",
        "type": "text"
      }
    },
    {
      "id": "node_w1",
      "type": "widget",
      "position": { "x": 300, "y": 120 },
      "style": { "width": 280, "height": 320 },
      "data": {
        "widgetId": "widget_ab12cd34",
        "kind": "checklist"
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
            "noteId": "note_floating",
            "type": "card",
            "data": {
              "noteId": "note_floating",
              "type": "text",
              "color": "#A3E635"
            }
          },
          {
            "id": "child_widget",
            "type": "widget",
            "widgetId": "widget_ab12cd34",
            "data": {
              "widgetId": "widget_ab12cd34",
              "kind": "checklist"
            }
          },
          {
            "id": "child_2",
            "type": "asset",
            "data": {
              "attachmentFile": "attachments/demo-video.mp4",
              "fileName": "demo-video.mp4",
              "kind": "video",
              "mimeType": "video/mp4",
              "thumbnailFile": "attachments/demo-video-thumbnail.jpg",
              "title": "Demo video",
              "color": "#FFFFFF"
            }
          },
          {
            "id": "child_recording",
            "type": "recording",
            "data": {
              "attachmentFile": "attachments/audio_c3d4e5f6.m4a",
              "fileName": "recording-2.m4a",
              "mimeType": "audio/mp4",
              "recordingNumber": 2,
              "title": "",
              "color": "#FFFFFF",
              "waveform": [0.1, 0.5, 0.25],
              "duration": 8120
            }
          }
        ]
      }
    },
    {
      "id": "node_link1",
      "type": "link",
      "position": { "x": 1320, "y": 140 },
      "style": { "width": 320, "height": 180 },
      "data": {
        "url": "https://example.com/",
        "title": "Example Domain",
        "description": "Example site",
        "siteName": "example.com",
        "color": "#FFFFFF"
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_7f3a",
      "target": "node_s1",
      "type": "labeledEdge",
      "data": {
        "label": "depends on",
        "pathType": "bezier"
      }
    }
  ]
}
```

**Manifest 写盘规则**（与 `canvasNodeSerialization.ts` / `sanitizeForPersistence` 一致）：

- 保留的字段（白名单）：`id`, `type`, `position`, `style`, `parentId`, `extent`, `data`
- 必须丢弃的运行时字段：`selected`, `dragging`, `resizing`, `measured`, `draggable`, `selectable`, `deletable`, `focusable`, `width`, `height`, `internals`
- data 内丢弃：`isHidden`, `isDropTarget`, `missing`, `previewUrl`, `thumbnailUrl`, `unfurlError`，以及 loading/idle 状态的 `unfurlStatus`
- **Widget 节点**：`data` 只保留 `{ widgetId, kind }`；items / timer / dueAt 等绝不进 manifest（顶层与 Folder child 均如此）
- Bun 侧 `saveManifest` 对 Image 额外调用 `serializeImageDataForManifest()`，将 data URL 写入 `attachments/img_<id>.<ext>` 后只保留 `imageFile` / `thumbnailFile`；Asset/Recording 额外调用 `stripAttachmentRuntimeData()`。
- Edge 丢弃：`selected`
- Markdown 导出收集 checklist widget，生成 GFM 任务列表，避免静默丢清单

### 7.3 RPC 协议

渲染端通过 `src/mainview/lib/rpc.ts` 封装 Electrobun RPC 客户端。非 Electrobun 环境（纯 Vite 开发）自动降级，持久化静默禁用。

```typescript
type CanvasRPC = {
  bun: {
    requests: {
      // Canvas manifest
      loadCanvas: {
        params: { viewId: string };
        response: {
          nodes: ManifestNode[];
          edges: ManifestEdge[];
          viewport?: { x: number; y: number; zoom: number };
          widgets?: Record<string, WidgetRecord | WidgetLoadError>;
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

      // Widgets（内容独立于 manifest）
      createWidget: {
        params: { kind: WidgetKind; title?: string };
        response: { success: true; widget: WidgetRecord } | { success: false };
      };
      cloneWidget: {
        params: { widgetId: string };
        response: { success: true; widget: WidgetRecord } | { success: false };
      };
      saveWidget: {
        params: { widget: WidgetRecord };
        response: { success: boolean };
      };
      deleteWidget: {
        params: { widgetId: string };
        response: { success: boolean };
      };

      // Note records
      createNote: {
        params: { id: string; title: string; displayHint: string };
        response: { noteId: string; file: string };
      };
      saveNote: {
        params: {
          noteId: string;
          frontmatter: Record<string, unknown>;
          body: string;
        };
        response: { preview?: PreviewArtifacts; success: boolean };
      };
      deleteNote: {
        params: { noteId: string };
        response: { success: boolean };
      };
      loadBlockNote: {
        params: { noteId: string };
        response: {
          success: boolean;
          blocks?: unknown[];
          markdown?: string; // present only for one-time legacy import
          frontmatter?: Record<string, unknown>;
          revision?: number;
          recoveredFromMarkdown?: boolean;
        };
      };
      saveBlockNote: {
        params: {
          noteId: string;
          frontmatter: Record<string, unknown>;
          blocks: unknown[];
          markdown: string; // accepted by RPC shape; not written as mirror
          revision?: number;
        };
        response: {
          success: boolean;
          revision?: number;
          preview?: PreviewArtifacts;
          blocknoteFile?: string;
        };
      };

      // Attachments, media, links
      saveAttachment: {
        params: {
          dataUrl: string;
          existingFile?: string;
          kind?: 'audio' | 'file' | 'image' | 'video';
          mimeType?: string;
          suggestedName?: string;
        };
        response: {
          archiveSummary?: ArchiveSummary;
          filePath: string;
          previewExcerpt?: string;
        };
      };
      generateVideoThumbnail: {
        params: { attachmentFile: string };
        response: { thumbnailFile?: string };
      };
      loadAttachment: {
        params: { filePath: string };
        response: { dataUrl: string } | null;
      };
      openAttachment: {
        params: { filePath: string };
        response: { success: boolean };
      };
      revealAttachment: {
        params: { filePath: string };
        response: { success: boolean };
      };
      unfurlLink: {
        params: { url: string };
        response: UnfurlResult;
      };
      openExternalUrl: {
        params: { url: string };
        response: { success: boolean };
      };
      importMarkdownFiles: {
        params: Record<string, unknown>;
        response: {
          canceled?: boolean;
          failedCount?: number;
          notes: Array<{ noteId: string; title: string; content?: string }>;
        };
      };

      // Export
      exportPng: {
        params: { dataUrl: string; fileName: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      exportJson: {
        params: { fileName: string; json: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      exportNoteMarkdown: {
        params: { noteId: string; includeFrontmatter?: boolean };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      // 主题大纲导出：Markdown 在渲染端由 shared/topicMarkdownExport.ts 生成，
      // 主进程只负责保存对话框与落盘；空 markdown 被拒绝。
      exportTopicOutline: {
        params: { fileName: string; markdown: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      exportNotesMarkdown: {
        params: {
          scope: 'all' | 'selected' | 'view';
          viewId?: string;
          noteIds?: string[];
          includeFrontmatter?: boolean;
        };
        response: {
          canceled?: boolean;
          exported?: number;
          failed?: number;
          filePath?: string;
          success: boolean;
        };
      };

      // Views / templates / trash
      listViews: {
        params: Record<string, unknown>;
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
        response: {
          success: boolean;
          activeViewId?: string;
          trashId?: string;
        };
      };
      restoreTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      purgeTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      clearAllTrash: {
        params: Record<string, unknown>;
        response: { purged: number; success: boolean };
      };
      listTemplates: {
        params: Record<string, unknown>;
        response: TemplateMeta[];
      };
      getTemplate: {
        params: { id: string };
        response: TemplateManifest | null;
      };
      createViewFromTemplate: {
        params: { name: string; templateId: string };
        response: { id: string; name: string; file: string };
      };

      // Settings / workspace / app info
      getSettings: {
        params: Record<string, unknown>;
        response: AppSettings;
      };
      saveSettings: {
        params: AppSettings;
        response: { success: boolean };
      };
      getAICredentialStatus: {
        params: Record<string, unknown>;
        response: { hasApiKey: boolean };
      };
      setAIApiKey: {
        params: { apiKey: string | null };
        response: { success: boolean };
      };
      getWorkspaceInfo: {
        params: Record<string, unknown>;
        response: { isDefault: boolean; path: string };
      };
      switchWorkspace: {
        params: Record<string, unknown>;
        response: { canceled?: boolean; path?: string; success: boolean };
      };
      exportWorkspaceArchive: {
        params: Record<string, unknown>;
        response: { canceled?: boolean; filePath?: string; size?: number; success: boolean };
      };
      getLocalHttpEndpoint: {
        params: Record<string, unknown>;
        // token: 主渲染端 token，只能放 Authorization 头；mediaToken: 只读媒体 token，可放 query
        response: { aiEnabled: boolean; baseUrl: string; mediaToken: string; token: string };
      };

      // Search / tags
      searchCanvas: {
        params: { query: string; viewId?: string; limit?: number };
        response: SearchResult[];
      };
      listTags: {
        params: Record<string, unknown>;
        response: TagSummary[];
      };
      renameTag: {
        params: { oldName: string; newName: string };
        response: TagMutationResult;
      };
      deleteTag: {
        params: { name: string };
        response: TagMutationResult;
      };
      loadNodeMetadata: {
        params: Record<string, unknown>;
        response: NodeMetadataMap;
      };
      setNodeMetadata: {
        params: { id: string; metadata: NodeMetadata };
        response: { success: boolean };
      };
      deleteNodeMetadata: {
        params: { id: string };
        response: { success: boolean };
      };
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: {
      openSearch: Record<never, unknown>;
      settingsUpdated: AppSettings;
      trashUpdated: Record<never, unknown>;
      viewsUpdated: Record<never, unknown>;
    };
  };
};
```

### 7.4 保存策略

#### Debounce

| 操作类型                                 | Debounce        | 写入目标                              | 实现状态                     |
| ---------------------------------------- | --------------- | ------------------------------------- | ---------------------------- |
| 布局变化（拖拽、resize、增删节点、连线） | 2500ms trailing | `.canvas.json`（通过 `saveManifest`） | ✅ `useCanvasPersistence.ts` |
| viewport 变化                            | 500ms trailing  | `.canvas.json.viewport`               | ✅ `useCanvasPersistence.ts` |
| BlockNote 内容编辑                       | 800ms trailing  | `content/.ghostboard/blocknote/<noteId>.json` | ✅ `useBlockNoteSaver.ts` |
| legacy Markdown 内容编辑                 | 800ms trailing  | 既有 `content/*.md`                   | ✅ `useNoteSaver.ts`（只写已有 legacy 文件） |
| 窗口失焦                                 | 立即 flush      | 所有 pending manifest                 | ✅ `window blur` 事件        |
| 页面隐藏 / unload                        | 立即 flush 或 local backup | manifest / pending flush backup | ✅ `visibilitychange` / `beforeunload` |

`useCanvasPersistence` 只负责 manifest / viewport 保存。Bun 侧 `saveManifest` 会把 Card 及 Folder Card children 序列化为轻引用，并根据 note record 类型处理内容字段：

- sidecar-backed note：只通过 `mergeNoteMeta()` 合并 title/color 等元数据，不碰 blocks，也不写 Markdown。
- legacy Markdown note：继续通过 `persistManifestCardNote()` round-trip `.md`，直到下一次 BlockNote 聚焦编辑保存迁移为 sidecar。
- 新 card note：若 manifest 中出现未知 `noteId`，`saveManifest` 会先创建 legacy Markdown stub，保证轻引用有落点。

#### 原子写入

所有文件写入采用 write-then-rename 模式（`workspace.ts` 中的 `atomicWrite`）：

```typescript
export async function atomicWrite(filePath: string, data: string) {
  const tmp = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await Bun.write(tmp, data);
  await rename(tmp, filePath);
}
```

#### 写盘前 Sanitize

`canvasNodeSerialization.ts` 在调用 RPC 前过滤运行时字段：

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

const RUNTIME_DATA_KEYS = new Set([
  'isHidden',
  'isDropTarget',
  'missing',
  'previewUrl',
  'thumbnailUrl',
  'unfurlError',
]);
```

Edge 剥离 `selected`。

### 7.5 启动加载流程

```
1. Bun 主进程启动 → initWorkspace() 确保目录结构存在（含 .ghostboard/widgets/）
2. 读取 workspace/.ghostboard/workspace.json → activeViewId
3. 读取 .ghostboard/views/{activeViewId}.canvas.json → manifest
4. 遍历 manifest.nodes：
   - 先 buildNoteIndex(wsPath)：sidecar JSON + legacy .md 按 noteId 建索引
   - type=card 且有 noteId → loadNoteRecord(wsPath, noteId, data.file?)
     → noteRecordToCardData() 将 sidecar preview 或 legacy Markdown 合并到 node.data
   - type=card + data.type=checklist（legacy）→ 懒迁移为 type=widget + kind=checklist，收集 widgetId
   - type=widget → 收集 widgetId；不把 items 等塞进 node.data
   - type=image → 通过 imageFile / thumbnailFile hydrate runtime data URL，缺失时保留占位状态
   - type=asset → 通过 attachmentFile / thumbnailFile hydrate previewUrl / thumbnailUrl，缺失时标记 missing
   - type=recording → 通过 attachmentFile hydrate previewUrl，保留 waveform/duration/recordingNumber，缺失时标记 missing
   - type=link → 直接使用 manifest 中的 URL 与 unfurl metadata
   - type=sticky/group/topic → 直接使用 manifest 中的 data（Topic 层级随后由 nodes + `topic-child` 边推导出运行时索引）
   - type=folder → 遍历 children；Card / widget / Image / Asset / Recording / Link 同上；legacy checklist child 同样懒迁移
5. loadWidgets(wsPath, widgetIds) → widgets map（单个缺失/损坏不影响整画布）
6. 若发生迁移，把引用写回磁盘 manifest（仅 patch 迁移节点）
7. RPC 返回 { nodes, edges, viewport, widgets }
8. 渲染端 canvasStore.hydrate(nodes, edges, viewport)；widgetStore.hydrate(widgets)
```

**首次启动 / 无 workspace**：

Bun 侧 `seedFirstRunIfNeeded()` 在 `.ghostboard/workspace.json` 不存在时写入默认 config，并用内置 `demo` 模板填充默认画布。显式创建的空白画布不会自动 seed。模板中若仍含 legacy checklist card，靠下次 loadCanvas 懒迁移。

### 7.6 Folder children 模型

Folder 的子项通过 `data.children` 数组保存在 manifest 中，但 Card child 已升级为与顶层 Card 对等的 `noteId` 轻引用；legacy Widget child 为 `widgetId` 轻引用，迁移后的 Canvas Type child 为 extension instance 轻引用：

- Card child：`{ id, noteId, type: "card", data: { noteId, file?, type } }`，加载时通过 `noteStore.ts` hydrate；sidecar-backed child 保存时只 merge metadata，legacy child 才写回 `.md`。
- Widget child（legacy）：`{ id, type: "widget", widgetId, data: { widgetId, kind } }`，内容在 `widgetStore` / `.ghostboard/widgets/`。
- Extension child：`{ id, type: "extension", data: { canvasTypeId, instanceId } }`，内容在 `extensionInstanceStore` / `.ghostboard/extension-instances/`。
- Image child：继续走 `imageFile` / `thumbnailFile` 附件模式，不分配 `noteId`。
- Asset child：走 `attachmentFile` / `thumbnailFile` / `waveform` 附件模式。
- Link child：保存 URL 与 unfurl metadata。
- Recording child：走 `attachmentFile` / `waveform` / `duration` / `recordingNumber` 附件模式。
- **新准入不允许** Folder / Group / Sticky / Topic 作为 Folder child；当前 Checklist / Pomodoro / Reminder 的 Canvas Type 也声明 `canEnterFolder: false`。历史上已存入的 Widget / Extension child 是兼容数据，展开、搜索或 Extract 时必须保留其原 runtime type、引用和业务数据，不能因当前准入规则转成 Card。

当前 Folder children 仍不是独立子画布：不持久化内部自由坐标（打开时用 waterfall 重算），不暴露跨层 Edge handle。需要表达外部关系时，仍连到 Folder 封面节点。

### 7.7 BlockNote JSON Sidecar

BlockNote 编辑器将文档结构保存为 JSON sidecar 文件（`content/.ghostboard/blocknote/<noteId>.json`）。这是当前 note record 的 source of truth；Markdown 只作为 legacy/import/export 格式存在，不再作为同步副本。

**保存流程**：
1. 编辑器失焦、隐藏、卸载或 debounce 到期 → `useBlockNoteSaver` 调用 `rpcSaveBlockNote(noteId, frontmatter, blocks, markdown, revision)`。
2. Bun 端 `saveBlockNote` handler 读取现有 sidecar，计算 `nextRevision`，从 blocks 生成 `preview`。
3. `saveBlockNoteSidecar()` 原子写入 JSON：`blocks`、`revision`、title/color/displayHint/timestamps、derived preview。
4. 若发现 pre-v0.2 同步副本时代遗留的 `.md` 文件，best-effort 删除 legacy Markdown 副本；sidecar 写入失败不会被 Markdown fallback 掩盖。
5. RPC 返回 `revision`、`preview`、`blocknoteFile`，前端把 preview metadata patch 回 node data。

**加载与迁移**（`loadBlockNote` handler）：
1. sidecar 存在且 schema 正常 → 返回 blocks + revision。
2. sidecar 缺失或损坏但 `noteStore.ts` 能找到 legacy `.md` → 返回 `markdown` + `frontmatter` + `recoveredFromMarkdown: true`，由编辑器完成一次性导入。
3. sidecar 与 legacy Markdown 都不存在 → 返回空 blocks，首次保存创建 sidecar。

当前不做外部 Markdown diff/reconcile，也不使用旧的 Markdown 哈希/修订字段作为冲突协议；sidecar JSON 是唯一可编辑真源。

### 7.8 标签系统与 Node Metadata

标签数据存储在 `.ghostboard/node-metadata.json`，独立于 manifest、sidecar 和 legacy Markdown frontmatter。这是一个 key-value 映射文件，key 为 `noteId`（Card 节点）或 `nodeId`（非 Card 节点：Image/Asset/Link/Sticky/Recording），value 包含 `tag`、`tagColor`、`tags` 字段。

**存储文件格式**：
```json
{
  "schema": "ghostboard-node-metadata/v1",
  "entries": {
    "note_a1b2c3d4": { "tag": "Inbox", "tagColor": "#EAF2B8", "tags": ["design", "ux"] },
    "node_img_7f3a": { "tag": "Reference", "tagColor": "#A3E635" }
  }
}
```

**内存管理**：Bun 端 `nodeMetadata.ts` 维护 `Map<wsPath, WorkspaceState>`，包含 `entries` 内存缓存 + `flushTimer`（500ms debounce）。所有读写操作先更新内存，再 debounce 写入磁盘。

**批量操作**：
- `renameTagEverywhere(oldName, newName)` — 遍历所有 entries，将匹配的 `tag` 和 `tags[]` 中的值替换为新名称
- `deleteTagEverywhere(name)` — 从所有 entries 中移除匹配的主标签和次要标签
- `listAllTagsFromMetadata()` — 聚合所有标签名称并计数，按次数降序返回 `TagSummary[]`

**前端集成**：
- `useNodeMetadata()` — React Query 查询，缓存 5 分钟，返回 `map` 和 `get(id)` 方法
- `useSetNodeMetadata()` — 乐观更新 mutation：`onMutate` 立即 patch 缓存，`onError` 回滚，`onSettled` 刷新 `['tags']` 查询
- `useDeleteNodeMetadata()` — 类似乐观更新模式
- `useTags()` — 聚合标签列表查询，缓存 1 分钟

**画布上的标签筛选**：`activeTagFilter` 设置后，所有不携带该标签的节点通过 CSS 变暗（dimmed），仅匹配节点保持正常显示。清除筛选恢复全部节点。

**约束**：每节点最多 8 个标签，单个标签最长 32 字符。`tag`（主标签）和 `tags`（次要标签）可共存；主标签带颜色，次要标签为灰色 chip。

### 7.9 MVP 不做

- ❌ 文件系统 watcher（外部编辑同步）
- ❌ 无重启的多 workspace 热切换（当前可选择 workspace 并写入 `<userData>/userprefs.json`，但需要重启生效）
- ❌ 跨画布拖拽节点
- ❌ legacy Markdown frontmatter 无损 round-trip（MVP 接受规范化重写）
- ❌ filesystem-first Document Workspace（当前 Library / Search 仍以 canvas-derived + noteStore 索引为主）
- ❌ Folder children / unlinked legacy Markdown / sidecar note record 完整搜索覆盖
- ❌ JSON import / Markdown overwrite re-import

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
- **颜色优先级**（三层回退）：`manifest.data.color` → note record `color`（sidecar 或 legacy frontmatter）→ 组件默认色板
  - Sticky / Asset / Link / Recording 无 note record，仅两层：`manifest.data.color` → 组件默认色板

### 8.3 国际化

- 消息文件：`messages/en.json`、`messages/zh.json`
- 运行时引用：`import * as m from '../../paraglide/messages.js'`，调用 `m.key_name()`
- 添加或修改 key 后运行 `bun run machine-translate`（需要机器翻译时）；`bun run type-check` 会先重新生成 Paraglide 输出和声明，再做 TypeScript 检查。
- `src/paraglide/` 为生成目录，不手动编辑

### 8.4 生成文件

以下文件为自动生成，不要手动编辑：

- `src/mainview/routeTree.gen.ts`（TanStack Router 插件生成）
- `src/paraglide/`（Paraglide 编译输出）

---

## 9. Edge Cases & Guardrails

> 产品层面的 edge case 处理策略。

| 场景                             | 处理策略                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| 文件被外部重命名/移动            | 当前未实现 watcher；sidecar-backed note 以 `noteId` 文件名为主键，legacy `.md` 通过 frontmatter `id` 建索引 |
| manifest 指向的 note record 不存在 | 加载时保留 manifest 节点并显示占位/缺失状态，不静默删除                                         |
| `noteId` 零引用                  | 不自动删除 sidecar / legacy `.md`；当前通过 `SettingsDialog` 的 Unlinked Files 扫描/清理暴露，是否纳入全局搜索待决 |
| watcher 自触发循环               | watcher 实现时，写盘前加入 `pendingWrites` 集合，watcher 检查后忽略                             |
| legacy frontmatter round-trip 破坏格式 | 最小改写策略，保留未知字段，不重排 YAML 字段顺序                                          |
| 附件同名冲突                     | 使用 `{kind}_{uuid8}.{ext}` 稳定相对路径，`existingFile` 更新时仍校验 workspace 边界              |
| 带 Edge 的卡片拖入 Folder        | MVP 阻止并 toast 提示先断开连线                                                                 |
| Edge 指向不存在的 node           | 加载时静默过滤 + log 警告                                                                       |
| legacy Markdown / frontmatter 解析失败 | 对该 legacy note 做 fallback/跳过；sidecar 损坏时标记 corrupted 并避免静默导出空内容       |
| 窗口失焦/关闭时有 pending writes | blur / visibility hidden 立即 flush；beforeunload 写 pending flush backup，下次 RPC ready 后恢复 |
| manifest JSON 损坏               | 保留坏文件副本，尝试从备份恢复                                                                  |
| displayHint 未知值               | 回退 `note` 渲染 + 诊断日志                                                                     |
| 切换画布时有未保存变更           | 调用方（ViewSwitcher / Search 跨画布跳转）先保存旧画布，再调用 `setActiveView` 清空 UI 并加载目标 view |
| 删除当前激活的画布               | 自动切换到 `views[0]`，后端更新 `workspace.json` 的 `activeViewId`                              |
| 删除最后一个画布                 | 后端拒绝（`removeView` 返回 `false`），至少保留一个画布                                         |
| 删除画布                         | 软删除：manifest 移入 `.ghostboard/trash/`，`SettingsDialog` 可恢复或 purge                     |
| Link unfurl SSRF                 | 当前阻止 localhost / 私网字面 IP / 非 http(s) scheme；DNS 解析后的私网 IP 防护待补               |
| Asset data URL 超限              | `saveAttachment` 兼容路径有 25MB 限制；前端文件/录音主路径走 `/attachment/upload` streaming bridge |
| 附件播放 / 预览大文件            | 本地 HTTP `/attachment` 支持 byte ranges；Asset/Recording 运行时只保留 `previewUrl` stream URL   |
| Template thumbnail 缺失          | 模板列表 fallback 到占位样式；P5 需要接入 meta.thumbnail 和实际 thumbnail 文件                   |
| BlockNote sidecar 损坏/缺失      | sidecar 损坏时标记 corrupted；若存在 legacy `.md` fallback，则 `loadBlockNote` 以 `recoveredFromMarkdown: true` 通知 UI |
| 外部 Markdown 修改               | 当前不做 sidecar/Markdown diff reconcile；legacy `.md` 只在无 sidecar 或导入时参与读取             |
| 标签数量/长度超限                | TagEditor 阻止添加超过 8 个标签或超过 32 字符；后端 `nodeMetadata.ts` 同样校验                     |
| node-metadata.json 损坏          | 加载时校验 schema 和类型，损坏时返回空 map，下次保存覆盖                                          |
| 标签重命名/删除冲突              | 后端 `renameTagEverywhere` / `deleteTagEverywhere` 遍历所有 entries 原子操作；前端乐观更新后 refresh tags 查询 |

---

## 10. 关键实现参考

### 10.1 拖入/拖出 Group 的三阶段处理

（`useNodeDrag.ts`）

1. **`onNodeDragStart`**：若节点有 `parentId`，解除父子关系，将局部坐标转换为画布绝对坐标。
2. **`onNodeDrag`**：
   - 内容节点（card/image/asset/link/recording/sticky/topic）：`getIntersectingNodes` 检测 Group 交叉 → 高亮目标 Group；同时检测 Folder 重叠 → 设置 dropTarget。Topic 只能整棵树进出 Group，且始终被 Folder 拒绝。
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

data 内丢弃：`isHidden`, `isDropTarget`, `missing`, `previewUrl`, `thumbnailUrl`, `unfurlError`，以及 loading/idle 状态的 `unfurlStatus`

---

## 11. 技术待办与未决策

> 产品层面的完整列表见 [PRD §8](./PRD.md#8-待核验候选与未决事项)。本节只保留会影响技术架构或数据模型的事项。

| ID | 事项 | 技术影响 |
| --- | --- | --- |
| T-1 | **Workspace 内容浏览是否 filesystem-first** | 若未来要在画布之外再开一个真正的文件树/笔记库（不局限于当前画布），需要新增 `listNotes` / `loadNoteById` / folder CRUD / move / rename / reveal in Finder / reference guard 等能力。目前的笔记库弹窗仅 canvas-derived。 |
| T-2 | **搜索索引范围** | 若搜索整个 workspace，需要索引 Folder children、unreferenced legacy Markdown 与 sidecar note records，并区分 placed / detached / unlinked 结果。当前 `search.ts` 主要索引顶层 manifest nodes + note records。 |
| T-3 | **多 Workspace 热切换** | 当前 `switchWorkspace` 写 `<userData>/userprefs.json` 后要求重启；若要进程内切换，需要重建 wsPath、RPC handler、manifest cache、query cache、store reset 与本地 HTTP endpoint。 |
| T-4 | **Native path / streaming import 一致性** | 前端文件/录音已走 `/attachment/upload` streaming bridge；仍需统一 native path、拖拽、剪贴板、Markdown/BlockNote 附件上传的错误模型和进度 UI。 |
| T-5 | **Link unfurl hardening** | 当前有 scheme/localhost/private literal host 防护；需要 DNS resolve 后再次拦截私网 IP，降低 SSRF/DNS rebinding 风险。 |
| T-6 | **Template P5** | 需要接入 thumbnail、补模板数量、决定模板 metadata i18n 与列表 query 参数同步，并决定模板 noteContents 是否直接生成 sidecar 而不是 legacy `.md` stub。 |
| T-7 | **跨 note 保存冲突策略** | `useBlockNoteSaver` 与 legacy `useNoteSaver` 已独立于 manifest；未来 Library / Sub-canvas 承担重编辑场景时，需要跨视图编辑同一 note 的串行队列、dirty 指示和冲突处理。 |

---

## 12. 画布类型行为

容器资格的代码来源是 `src/mainview/lib/canvasNodeRegistry.ts` 的 `canEnterGroup` / `canEnterFolder`。打开方式以各内置 Canvas Type 的 `openBehavior` 为准：Checklist 是 `detail`，Pomodoro 与 Reminder 是 `none`，Image / File / Link 有详情，Recording 留在画布上。

| 种类 | React Flow `node.type` | 可进 Group | 可新进 Folder |
| --- | --- | --- | --- |
| Note (`card`) | `card` | 是 | 是 |
| Checklist / Pomodoro / Reminder | `widget`（新数据走 `extension`） | 是 | 否 |
| Sticky / Topic | `sticky` / `topic` | 是 | 否 |
| Folder | `folder` | 是 | 否 |
| Group | `group` | 否 | 否 |
| Image / File / Link / Recording | `image` / `asset` / `link` / `recording` | 是 | 是 |

`Folder: 否` 只限制新建放入。已经在 Folder 里的 legacy `widget` 和迁移后的 `extension` 仍可预览、搜索和取出，取出不得改写其类型和数据。

Topic 是宿主核心类型，不是扩展。层级只存在于 `data.kind: 'topic-child'` 的边上，节点上不存父级。整棵树必须留在同一画布、同一个直接 Group 里；拖拽和进出 Group 移动整支，分支内有锁定节点则整支不动。免费额度与 `card`、`sticky` 共用 `FREE_NODE_LIMIT = 100`（`src/mainview/lib/nodeQuota.ts`）。

第三方 `extension` 节点是否可进 Group / Folder、如何打开，读该 Canvas Type 自己的声明，默认不进 Folder。右键菜单由 `ContextMenu.tsx` 与 `src/mainview/extensions/hostMenu.ts` 按宿主动作和类型动作拼出。

## 13. 本地 HTTP 端点

主进程在 `127.0.0.1` 随机端口起一个 HTTP 服务（`src/bun/localHttpServer.ts`），处理不适合走 Electrobun RPC 的请求：AI 流式对话、链接预览、附件上传与播放、YouTube 嵌入。凭据在 `src/bun/localHttpAuth.ts`，每次启动在内存中随机生成，不落盘：

| 凭据 | 携带方式 | 可访问 |
| --- | --- | --- |
| 主渲染端 token（`getLocalHttpEndpoint().token`） | 仅 `Authorization: Bearer` 头；query 中出现一律 401 | 全部路由：`/ai/chat`、`/attachment*`、`/unfurl`、`/youtube` |
| 媒体 token（`mediaToken`） | `?token=`，仅 GET/HEAD（`<video src>`、iframe 无法带头） | 只读：`GET/HEAD /attachment`、`GET /youtube` |

CORS 只回显应用自己的来源（`views://mainview`、开发服务器 5173），CORS 是第二道防线，鉴权以 token 为准。

> 插件系统已于 2026-11-05 删除（减法版），包括运行时、SDK、脚手架、签名与授权、探针脚本。旧版本留在应用数据目录的 `plugins/`、`plugin-data/`、`plugin-permissions.json` 不再读取，可手动删除。之前由插件运行时顺带承担的“主进程笔记变更同步到画布”改由 `src/mainview/lib/noteChangeSync.ts` 负责。

## 14. 许可证

一次性买断。未激活时 `card`、`sticky`、`topic` 合计最多 100 个（`FREE_NODE_LIMIT`）。激活后不限制。门禁在 `src/mainview/lib/nodeQuota.ts` 的 `hasNodeQuota`，创建、主题提交、粘贴、复制和 JSON 导入都会走它。校验失败时放行，避免离线把用户锁死。

主进程是 `src/bun/license.ts`，渲染进程经 `src/mainview/lib/rpc-license.ts` 调用。许可证文件是应用数据目录里的 `license.dat`，不是工作区里的文件。密钥格式 `GHOST-XXXX-XXXX-XXXX-XXXX`，段字符为 `A-Z0-9`。设备指纹是平台、主机名、CPU 型号和内存总量的哈希。文件用指纹做 XOR 混淆，跨机复制对不上指纹。`USE_ONLINE_LICENSE=true` 才访问 `LICENSE_API_URL`；该变量没有内置默认值，且必须是 https（仅本机回环地址允许 http，用于开发），未配置或不合规时跳过在线校验。密钥生成器不随产品打包。这是混淆，不是密码学强度的防破解。

设置页 General 里的 License 卡片负责激活。后端签发服务不在本仓库。

## 15. 反馈与崩溃诊断

设置里的反馈提交 bug、想法或其他，可选邮箱和日志。失败重试沿用同一个 `reportId`。诊断目录在应用数据根下的 `diagnostics/`，可用 `GHOSTBOARD_DATA_DIR` 改数据根，因此不随工作区切换。

`src/bun/diagnostics.ts` 写 `app.log`（约 512 KiB 后轮转一份），权限 0600。附带日志最多 128 KiB（`MAX_DIAGNOSTICS_BYTES`）。待上传崩溃最多 20 份，超过 14 天删除。同一错误一分钟内去重。主进程未捕获异常和渲染进程的 error / unhandledrejection / React 错误边界会落盘；下次启动补传。正常退出删除当前会话文件，遗留会话记为 `UncleanExit`。Electrobun 没有把原生崩溃转储交给应用。

开发渠道默认把报告发到 `http://localhost:8787/api/v1`。其他渠道没有默认地址，构建时通过 `GHOSTBOARD_SUPPORT_API_URL` 写入，运行时环境变量可以覆盖；线上地址必须是 HTTPS。请求体形状在 `src/shared/support/reports.ts`：反馈正文最多 8000 字符。接收 API 和管理后台在仓库外。

## 16. 打包与应用更新

`electrobun build --env=<channel>` 只为当前操作系统和架构产出 `artifacts/`，文件名 `{channel}-{os}-{arch}-*`，其中 `update.json` 由 Electrobun 生成。`scripts/upload-r2.ts` 把该目录上传到 R2。已安装客户端走 `src/bun/index.ts` 里的 `Updater.checkForUpdate()`。

渠道：`dev` 不签名、不参与更新；`canary` 与 `stable` 走发布。本地命令是 `bun run release:canary` 和 `bun run release:stable`。跨平台发布在 `.github/workflows/release.yml`，矩阵包含 macOS arm64、`macos-15-intel` 和 Windows x64。Windows 构建不签名。

R2 公开地址、账号和 Apple 签名变量见 `.env.example` 与该 workflow。`*-update.json` 需要绕过或缩短 CDN 缓存，否则客户端会读到旧版本信息。版本号同时改 `electrobun.config.ts` 的 `app.version` 和根 `package.json` 的 `version`。

## 17. BlockNote AI 配置

笔记 AI 走 BlockNote 的 AI 扩展，宿主在 `src/bun/ai.ts` 按供应商转发。供应商是 `openai`、`anthropic`、`ollama`、`custom`。模型、Base URL 和 Key 按供应商分开保存；Key 文件在应用用户目录，权限 0600。环境变量是 `GHOSTBOARD_AI_<PROVIDER>_API_KEY`，已保存的 Key 优先。旧的 `GHOSTBOARD_AI_API_KEY` 只绑本次启动时的供应商。

OpenAI 与 Anthropic 的 Base URL 可空，空则用 SDK 默认地址。Ollama 默认 `http://localhost:11434/v1`。自定义供应商必须填写 Base URL，不要把 `chat/completions` 整段路径填进去。设置页的连接测试要求模型真正返回工具调用，只回文本不算成功。

生成过程中的建议不写入笔记；接受或拒绝之后才保存最终正文。关闭笔记会取消未接受的修改。工作区 RAG、跨卡片检索和业务专用命令没有实现。画布级 AI 任务仍是 `src/bun/aiTasks.ts` 里的另一层，产品方案在 `docs/features/Backlog/ai-integration-plan.md`，不要把它当成已经交付的操作器。
