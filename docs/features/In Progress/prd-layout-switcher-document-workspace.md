# PRD：顶部布局切换与文档工作台

> 状态：Draft  
> 范围：新增一个与自由画布并列的传统文档布局，让 GhostBoard 同时支持空间化组织和线性文件编辑。  
> 相关文档：
>
> - [主 PRD](../../PRD.md)
> - [技术规范](../../tech-spec.md)
> - [多画布视图方案](./plan-multi-canvas-workspace.md)
> - [Editor & Preview 技术方案](../Review/editor-and-preview-plan.md)
> - [Note 数据模型与编辑器方案分析](../Review/note-data-model-analysis.md)

---

## 1. 背景与问题

GhostBoard 当前的核心体验是自由画布：用户通过卡片、Folder、Group、连线和多画布视图进行空间化知识组织。这个方向是产品差异化，但单一画布形态也带来几个明显问题：

- 用户在写长文、整理目录、批量管理笔记时，画布不是最高效入口。
- 画布上的 Folder 更像空间收纳，不等同于文件系统目录，无法替代传统的文件树管理。
- 当前 `content/*.md` 已经是 local-first 的知识文件，但 UI 没有把这些文件作为一等对象呈现出来。
- 对习惯 Notion / Obsidian / VS Code 侧边栏的人来说，缺少“左边找文件，右边编辑”的稳定工作台。

因此需要引入第二种顶层布局：**文档工作台布局**。它不是替代画布，而是和画布互补：

- 画布布局负责空间化思考、视觉组织、关系表达。
- 文档布局负责目录管理、线性编辑、批量维护和快速检索。

## 2. 产品目标

### 2.1 核心目标

1. 在应用顶部提供清晰的布局切换入口，让用户在“画布布局”和“文档布局”之间切换。
2. 新增文档工作台：左侧目录/文件管理，右侧 Markdown/Tiptap 文件编辑器。
3. 让同一份 note 内容在两个布局中共享：文档布局编辑的内容，会影响画布中的同一 `noteId` 卡片。
4. 保持 GhostBoard 的 local-first 原则：文件仍以 `.md` 为 canonical source of truth。
5. 为未来的 Obsidian-like 能力预留空间，如反链、标签、全文搜索、文件夹导入、外部编辑器兼容。

### 2.2 成功标准

- 用户可以不进入画布，也能完成新建笔记、浏览目录、编辑正文、重命名和删除文件。
- 用户可以从文档布局把当前笔记放到当前画布，继续用空间方式组织。
- 用户切换布局不会丢失未保存内容，也不会混淆“布局模式”和“画布 view”。
- 现有画布功能不被破坏：多画布切换、节点创建、聚焦编辑、搜索、持久化仍按当前行为工作。

## 3. 非目标

MVP 不做以下能力：

- 不做 Notion 数据库、表格视图、块级数据库属性。
- 不做 Obsidian 完整插件体系、反链面板、Graph View、Dataview 查询。
- 不做多人协作或实时同步。
- 不做移动端完整适配；当前以桌面端 Electrobun 为主。
- 不引入新的 canonical 存储格式。Tiptap/ProseMirror JSON 不作为磁盘主格式。
- 不把画布 Folder 强行映射为文件系统 Folder。两者概念独立。
- 不在 MVP 做外部文件 watcher 的完整实时同步；可以作为后续增强。

## 4. 概念定义

### 4.1 Layout Mode（布局模式）

应用顶层的工作方式，MVP 有两种：

| 模式 | 说明 | 主要对象 |
| --- | --- | --- |
| `canvas` | 现有自由画布布局 | Canvas view、node、edge |
| `document` | 新增文档工作台布局 | Note file、folder path、editor |

布局模式是应用 UI 状态，不等于 workspace，也不等于 canvas view。

### 4.2 Canvas View（画布视图）

现有多画布系统中的一个画布 manifest，例如 `default.canvas.json` 或 `view_xxx.canvas.json`。它管理节点位置、连线、viewport 等空间布局信息。

Canvas view 只在 `canvas` 布局下直接操作。文档布局可以把 note 放入当前 active canvas view，但不直接编辑画布节点位置。

### 4.3 Note File（笔记文件）

workspace 下 `content/**/*.md` 中的一篇 Markdown 笔记。核心身份是 frontmatter 中的 `id`，即 `noteId`。

文件路径可以变化，`noteId` 不应变化。画布节点应以 `noteId` 识别内容，`file` 只作为可更新的路径缓存。

### 4.4 Directory（目录）

文档布局中的左侧文件树，来源于 `content/` 下的文件夹结构。

目录是文件系统概念，不等同于画布上的 `folder` 节点：

- 文件系统目录用于管理 Markdown 文件路径。
- 画布 Folder 用于空间收纳和 drill-down 展示。

## 5. 用户画像与使用场景

### 5.1 目标用户

延续主 PRD 中的定位：思考者、研究人员、设计师和知识工作者。典型使用方式是长期积累本地知识库，在写作、研究、项目策划和创意整理之间切换。

### 5.2 关键场景

#### 场景 A：从线性写作开始

用户打开应用后进入文档布局，在左侧 `Projects/Product Ideas` 下创建一篇新笔记，右侧直接写正文。写到一半发现这篇笔记需要和几个已有想法建立关系，于是点击顶部切到画布布局，把这篇 note 放到当前画布中继续组织。

#### 场景 B：整理混乱的内容库

用户有几十篇散落的 note。文档布局左侧显示目录、未放置笔记和最近编辑。用户可以批量重命名、移动文件到不同目录、删除无用草稿，而不需要在画布上一个个找卡片。

#### 场景 C：画布与文档双向流转

用户在画布中双击卡片进入 focused view 做快速编辑。需要更长时间写作时，用户可以选择“在文档布局中打开”，切换到文档工作台并定位到同一篇 note。

## 6. 信息架构

### 6.1 顶层 Shell

新增一个全局应用 Shell，包住现有画布和新增文档工作台。

```
┌──────────────────────────────────────────────────────────────┐
│ Workspace name     [  Canvas  |  Documents  ]      Search ... │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│        active layout content                                │
│        - Canvas layout: ReactFlow canvas                     │
│        - Document layout: sidebar + editor                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

顶部栏职责：

- 显示当前 workspace 名称。
- 提供布局模式切换：`Canvas` / `Documents`。
- 提供全局搜索入口。
- 提供设置入口。
- 后续可扩展 workspace 切换入口。

重要原则：

- 顶部布局切换器只切换 layout mode。
- 现有多画布 ViewSwitcher 不和布局切换器合并。
- 画布 view 切换仍是 canvas layout 内部的二级切换能力。

### 6.2 Canvas Layout

Canvas layout 继承当前全屏 ReactFlow 体验，但需要为顶部栏预留高度。

MVP 处理方式：

- 顶部栏固定高度，例如 `48px`。
- ReactFlow 容器高度改为 `calc(100vh - topbarHeight)`。
- 底部 `ViewSwitcher` 可以暂时保留，作为“当前画布 view 切换 + 新建节点”入口。

后续可评估把画布 view 切换器从底部迁移到顶部二级栏，但这不是本 PRD 的 MVP 要求。

### 6.3 Document Layout

文档工作台由左侧文件栏和右侧编辑区组成。

```
┌──────────────────────────────────────────────────────────────┐
│ Topbar: Workspace    [ Canvas | Documents ]       Search ...  │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────────────────┐ ┌────────────────────────────────┐ │
│ │ File Sidebar           │ │ Editor Header                  │ │
│ │ - New note             │ │ Breadcrumb / title / actions   │ │
│ │ - Search/filter        │ ├────────────────────────────────┤ │
│ │ - Favorites (later)    │ │                                │ │
│ │ - Recent               │ │ Tiptap / Markdown editor       │ │
│ │ - Unplaced notes       │ │                                │ │
│ │ - content tree         │ │                                │ │
│ └────────────────────────┘ └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

默认布局：

- 左侧 sidebar 宽度：`280px`。
- 可调整宽度范围：`220px` 到 `420px`。
- 右侧编辑区占满剩余空间。
- sidebar 宽度、折叠状态、最后打开的 note 可持久化为 UI preference。

## 7. 功能需求

### 7.1 顶部布局切换

#### 功能描述

用户可以在顶部栏通过 segmented control 在 `Canvas` 与 `Documents` 两种布局之间切换。

#### 交互规则

- 点击 `Canvas`：显示现有画布布局，恢复上一次 active canvas view 和 viewport。
- 点击 `Documents`：显示文档工作台，恢复上一次 active note；若没有 active note，显示空状态。
- 切换前必须 flush 当前布局的 pending save：
  - 从 canvas 切到 documents：保存当前 canvas manifest。
  - 从 documents 切到 canvas：保存当前 note。
- 切换不应清空 undo/redo，除非是跨 canvas view 切换。布局切换本身不等于画布切换。
- 布局模式应持久化，下次启动恢复用户最后使用的布局。

#### 快捷键

| 快捷键 | 行为 |
| --- | --- |
| `Cmd/Ctrl + 1` | 切到 Canvas |
| `Cmd/Ctrl + 2` | 切到 Documents |
| `Cmd/Ctrl + B` | 在 Documents 布局中折叠/展开 sidebar |

### 7.2 文件 Sidebar

#### 功能描述

左侧 sidebar 是文档布局的主要导航和文件管理入口。

#### MVP 信息结构

1. 顶部操作区
   - 新建笔记
   - 新建文件夹
   - 刷新/重新扫描（可选）
2. 快捷分组
   - Recent：最近编辑的 note
   - Unplaced：未出现在任何画布 view 中的 note
   - All Notes：全部 note
3. 文件树
   - 展示 `content/` 下的文件夹和 `.md` 文件。
   - 支持展开/收起目录。
   - 当前选中的 note 高亮。

#### 文件树排序

MVP 推荐：

1. 文件夹在前，文件在后。
2. 同级按名称升序。
3. Recent 分组按 `updatedAt` 降序。
4. Unplaced 分组按 `updatedAt` 降序。

#### 文件操作

| 操作 | 入口 | MVP 要求 |
| --- | --- | --- |
| 新建 note | 顶部按钮、目录右键 | 在当前目录创建 `.md`，分配 `noteId` |
| 新建 folder | 顶部按钮、目录右键 | 在 `content/` 下创建目录 |
| 重命名 note | 右键、快捷按钮 | 改文件名；可同步更新 frontmatter `title` |
| 重命名 folder | 右键 | 移动目录路径；需要更新其下 note 的 `file` path 缓存 |
| 移动 note | 拖拽或右键 Move | MVP 可先做右键 Move，拖拽后续 |
| 删除 note | 右键 | 二次确认；需要提示会影响所有画布引用 |
| Reveal in Finder | 右键 | 调用主进程打开系统文件管理器 |
| Add to current canvas | 右键、编辑器按钮 | 在当前 active canvas view 中创建 card node |

#### 删除规则

删除 note 是破坏性操作，必须二次确认：

- 如果 note 没有任何画布引用：提示“将永久删除 Markdown 文件”。
- 如果 note 被一个或多个 canvas view 引用：提示引用数量和涉及 view，确认后删除文件并移除这些画布节点，或 MVP 中先禁止删除被引用 note。

MVP 推荐保守策略：**禁止直接删除被画布引用的 note**，提示用户先从画布移除引用。这样实现风险低，也避免隐性破坏空间布局。

### 7.3 右侧编辑器

#### 功能描述

右侧编辑器用于编辑选中的 Markdown note。它应复用当前 `TiptapEditor` 的能力，并逐步把 focused view 的编辑能力抽象成可复用的 note editor。

#### Editor Header

编辑器顶部显示：

- breadcrumb：例如 `content / Projects / Roadmap.md`
- 保存状态：`Saved` / `Saving...` / `Unsaved` / `Save failed`
- 操作按钮：
  - Add to current canvas
  - Rename
  - Reveal in Finder
  - More menu

#### Editor Body

MVP 支持：

- 标题编辑。
- Markdown 正文编辑。
- 常用富文本块：标题、段落、列表、任务列表、引用、代码块、链接、图片。
- 自动保存。
- 保存失败时通过 Sonner toast + editor header 状态提示。

#### 保存策略

- 标题和正文编辑使用 debounce save。
- 切换 note、切换 layout、关闭窗口前必须 flush。
- 保存仍写入 `.md` 文件：frontmatter + Markdown body。
- `updatedAt` 由主进程保存时更新。

#### 空状态

没有选中 note 时，右侧显示轻量空状态：

- 主文案：`Select a note to start editing`
- 次操作：`New note`
- 如果 workspace 没有任何 note，则强调新建第一篇 note。

### 7.4 文档布局与画布联动

#### Add to current canvas

文档布局中的 note 可以被放入当前 active canvas view。

行为：

1. 用户在文件树或 editor header 点击 `Add to current canvas`。
2. 系统检查当前 active canvas view 是否已经有该 `noteId` 的 node。
3. 如果没有，创建一个 `card` node，位置为当前 canvas viewport 中心。
4. 如果已有，提示用户：
   - `Focus existing card`
   - `Create another instance`
5. 操作完成后可以保持在 Documents 布局，也可以提供 `Go to canvas` toast action。

#### Open in Documents

画布中的 card/focused view 应增加入口：`Open in Documents`。

行为：

1. flush 当前 card/note 编辑内容。
2. 切到 Documents 布局。
3. sidebar 选中对应 note。
4. 右侧编辑器打开该 note。

MVP 可先在 focused view 或右键菜单中提供，后续再加到 card hover 操作。

#### 内容同步

同一 `noteId` 的内容必须保持一致：

- 文档布局保存 note 后，当前内存中的 canvas node 若引用同一 `noteId`，应更新 title、preview、color 等可见数据。
- 如果当前未打开 canvas layout，至少保证切回 canvas 时重新 hydrate 或刷新相关 node。
- 搜索结果应以 note 文件为主，能定位到所有引用该 note 的 canvas node。

### 7.5 Sidebar 搜索/过滤

MVP 在 sidebar 中提供轻量过滤输入：

- 只过滤当前文件树和快捷分组。
- 匹配 note title、文件名、tag。
- 不替代全局搜索弹窗。

全局搜索仍负责跨 view、正文、node、edge 的完整搜索。

## 8. 数据与持久化需求

### 8.1 Workspace UI State

新增 workspace 级 UI 状态文件，避免把 UI 偏好塞进 canvas manifest：

```
.ghostboard/
├── workspace.json
├── ui-state.json
└── views/
    └── *.canvas.json
```

建议结构：

```json
{
  "schema": "ghostboard-ui-state/v1",
  "activeLayoutMode": "canvas",
  "documentLayout": {
    "activeNoteId": "note_xxx",
    "sidebarCollapsed": false,
    "sidebarWidth": 280,
    "expandedFolders": ["content/Projects"]
  }
}
```

这些状态是体验恢复信息，不属于用户知识内容。

### 8.2 Note 文件路径与 noteId

当前系统里 card node data 可能同时有 `noteId` 和 `file`。新文档布局引入重命名/移动后，必须明确优先级：

1. `noteId` 是稳定身份。
2. `file` 是路径缓存。
3. 加载 note 时应优先通过 `noteId -> file` index 找文件。
4. 如果 manifest 中的 `file` 过期，应在下一次保存 manifest 时修正。

### 8.3 content 目录结构

MVP 从当前扁平 `content/*.md` 兼容升级到嵌套结构：

```
content/
├── Inbox/
│   └── quick-idea-note_abcd1234.md
├── Projects/
│   └── ghostboard-roadmap-note_efgh5678.md
└── reading-list-note_ijkl9012.md
```

约束：

- 只管理 `content/` 内的 `.md` 文件。
- 附件仍在 `attachments/` 下，不在 sidebar 文件树中混排。
- 文件名变更不改变 frontmatter `id`。

### 8.4 后端 RPC 需求

建议新增或扩展以下 RPC：

```ts
listNotes: {
  params: {};
  response: {
    notes: Array<{
      noteId: string;
      file: string;
      title: string;
      displayHint?: string;
      tags?: string[];
      createdAt?: string;
      updatedAt?: string;
      referencedBy: Array<{ viewId: string; nodeId: string }>;
    }>;
    tree: FileTreeNode[];
  };
};

loadNoteById: {
  params: { noteId: string };
  response: NoteDocument | null;
};

createNoteInFolder: {
  params: { folderPath: string; title?: string; displayHint?: string };
  response: { noteId: string; file: string; title: string };
};

createFolder: {
  params: { parentPath: string; name: string };
  response: { path: string };
};

renameNote: {
  params: { noteId: string; name: string; updateTitle?: boolean };
  response: { noteId: string; file: string; title?: string };
};

moveNote: {
  params: { noteId: string; targetFolderPath: string };
  response: { noteId: string; file: string };
};

deleteNoteFile: {
  params: { noteId: string };
  response: { success: boolean; reason?: 'referenced' | 'not-found' };
};

saveUiState: {
  params: { state: WorkspaceUiState };
  response: { success: boolean };
};
```

## 9. 状态设计

### 9.1 Document Layout 状态

| 状态 | 用户看到什么 | 操作 |
| --- | --- | --- |
| Loading | sidebar skeleton + editor loading | 等待 note tree |
| Empty workspace | sidebar 空树，editor 引导新建 | New note |
| No note selected | 文件树可用，editor 空状态 | 选择 note / 新建 note |
| Note loading | editor skeleton | 等待内容加载 |
| Editing | editor 可输入，状态显示 Saved/Unsaved | 自动保存 |
| Save failed | header 显示错误，toast 提供 retry | Retry / Reveal file |
| Referenced delete blocked | 删除确认弹窗说明被引用 | View references / Cancel |
| File missing | noteId 索引失效或外部删除 | Remove stale entry / Rescan |

### 9.2 Layout Switch 状态

切换布局时需要处理：

- pending canvas save。
- pending note save。
- active focused view。
- active context menu/search dialog。

推荐规则：

- 切换 layout 前关闭 context menu。
- 若 focused view 正在编辑，先 flush note，再关闭 focused view 或将同一 note 迁移到 document editor。
- 搜索弹窗作为全局 overlay，可以保留或关闭；MVP 建议关闭，避免状态交叉。

## 10. 交互细节

### 10.1 Sidebar 行为

- 单击 note：打开到右侧 editor。
- 双击 note：MVP 与单击相同，不引入额外行为。
- 右键 note：打开上下文菜单。
- 单击 folder chevron：展开/收起。
- 单击 folder label：选中 folder，但右侧不打开编辑器。
- 右键 folder：新建 note、新建 folder、重命名、删除空 folder、Reveal in Finder。

### 10.2 Editor 行为

- `Cmd/Ctrl + S`：立即 flush 当前 note。
- `Cmd/Ctrl + N`：在 Documents 布局中新建 note；在 Canvas 布局沿用当前新建节点菜单。
- `Escape`：如果 sidebar filter 聚焦则清空/失焦；如果 editor 内无弹层则不关闭文档。
- 点击另一个 note：flush 当前 note 后加载目标 note。

### 10.3 Add to Canvas 反馈

成功后 toast：

- 文案：`Added to {canvasName}`
- Action：`Go to canvas`

如果当前 canvas 已存在该 note：

- 默认不重复创建。
- 弹出轻量菜单让用户选择定位已有卡片或创建另一个实例。

## 11. 视觉与体验方向

文档工作台应该像知识库工具，而不是营销页或内容展示页。设计方向：

- 安静、稳定、高密度。
- 左侧 sidebar 强调快速扫描，不做大卡片。
- 右侧 editor 保持阅读和写作舒适，正文列宽控制在合理范围。
- 顶部 layout switch 是全局导航，不要抢走内容注意力。
- 保持当前产品已有的浅/深色主题能力。

具体 UI 原则：

- 使用图标按钮表达常见操作，如新建、折叠、搜索、更多。
- 文件树行高保持紧凑，但触控目标不能过小。
- 当前 note 高亮要清楚，但不能像选中卡片一样强烈。
- 空状态要直接给出行动入口，不写长说明。
- 不使用卡片套卡片的页面结构；document layout 是工作台，不是 dashboard。

## 12. 实施阶段

### Phase 1：全局 Shell 与布局切换

目标：先建立正确的产品骨架。

交付：

- 新增 `layoutMode` 状态。
- 新增顶部 app shell。
- Canvas layout 被包进 shell 后仍能正常渲染和交互。
- 顶部 segmented control 可在 Canvas/Documents 间切换。
- Documents layout 先显示占位状态。
- 持久化 `activeLayoutMode`。

验收：

- 切换布局不影响当前 canvas view。
- 切回 canvas 后节点、viewport、ViewSwitcher 行为正常。
- 测试覆盖 layout mode 状态和 shell 基础渲染。

### Phase 2：Note Tree 与基础编辑

目标：让 Documents layout 成为可用的文件编辑入口。

交付：

- Bun 侧 `listNotes` / `loadNoteById`。
- 左侧 sidebar 展示 `content/**/*.md`。
- 右侧 editor 加载和保存 note。
- 支持新建 note。
- 支持保存状态显示。

验收：

- 新建 note 后磁盘生成 `.md` 文件。
- 编辑 title/body 后内容保存到磁盘。
- 重新启动应用后能恢复 note 列表和最后打开 note。
- 现有画布加载不受影响。

### Phase 3：文件管理与画布联动

目标：打通文档工作台和画布。

交付：

- 新建/重命名 folder。
- 重命名/move note。
- 删除未引用 note。
- Add to current canvas。
- Open in Documents。
- noteId 优先解析，修复 stale file path。

验收：

- 从文档布局添加 note 到当前 canvas 后，切到 canvas 能看到对应卡片。
- 从画布卡片打开 Documents，能定位到同一 note。
- 移动/重命名 note 后，画布仍能加载该 note。

### Phase 4：完善体验与边界状态

目标：让功能达到长期可用质量。

交付：

- sidebar filter。
- Recent / Unplaced 快捷分组。
- 删除引用保护。
- 保存失败 retry。
- sidebar 宽度和展开状态持久化。
- i18n 完整补齐。

验收：

- 无 note、无选中、保存失败、文件缺失等状态都有明确 UI。
- `bun run test` 通过。
- `bun run type-check` 通过。

## 13. 技术改造建议

### 13.1 Renderer 目录建议

```txt
src/mainview/
  components/
    app/
      AppShell.tsx
      LayoutModeSwitcher.tsx
    documents/
      DocumentWorkspace.tsx
      DocumentSidebar.tsx
      DocumentTree.tsx
      DocumentEditor.tsx
      DocumentEditorHeader.tsx
      DocumentEmptyState.tsx
  hooks/
    useDocumentWorkspace.ts
    useWorkspaceUiState.ts
  store/
    workspaceStore.ts
```

说明：

- `canvasStore` 继续只负责画布。
- 文档布局和顶层 layout mode 不建议塞进 `canvasStore`。
- 新增 `workspaceStore` 或 `appStore` 管理 layout mode、active note、note tree、UI state。

### 13.2 Bun 侧目录建议

```txt
src/bun/
  notes.ts          # 扩展 note CRUD、note index、move/rename
  workspace.ts      # 扩展 ui-state 读写
  fileTree.ts       # 可选：文件树构建与路径校验
```

路径安全要求：

- 所有文件操作必须限制在 workspace `content/` 内。
- 禁止 `../` 路径逃逸。
- 文件/目录重命名需要处理重名冲突。

### 13.3 测试要求

新增或修改逻辑需要测试：

- `src/bun/notes.test.ts`
  - nested note list
  - create note in folder
  - rename/move note keeps noteId
  - delete referenced note blocked
- `src/bun/workspace.test.ts`
  - ui-state load/save fallback
- `src/mainview/components/documents/*.test.tsx`
  - sidebar render
  - note selection
  - empty state
  - add to canvas action
- `src/mainview/store/workspaceStore.test.ts`
  - layout mode switch
  - active note persistence state

## 14. 验收清单

- 顶部有 `Canvas / Documents` 布局切换入口。
- 默认进入上次使用的布局。
- Canvas 布局在顶部栏下正常显示，不丢失现有能力。
- Documents 布局左侧显示目录树和快捷分组。
- Documents 布局右侧可以编辑 Markdown note。
- 新建 note 能写入 `content/`。
- 编辑 note 后磁盘 `.md` 更新。
- 从 Documents 可把 note 放入当前 canvas。
- 从 Canvas 可打开同一 note 到 Documents。
- note 重命名/移动不破坏画布引用。
- 删除被引用 note 有保护策略。
- 保存失败、空 workspace、无选中 note 有明确状态。
- 中英文 i18n key 补齐。
- `bun run test` 通过。
- `bun run type-check` 通过。

## 15. 待确认问题

1. 顶部栏是否要使用系统原生 titlebar 区域，还是只在 webview 内容内实现？
2. Documents 布局首版是否需要支持拖拽移动文件，还是先用右键 Move？
3. 删除被引用 note 的 MVP 策略是否接受“禁止删除”，还是要一次性实现“删除 note 并清理所有 canvas 引用”？
4. `Canvas / Documents` 的中文命名使用“画布 / 文档”，还是“空间 / 文件”？
5. 从 Documents 点击 `Add to current canvas` 后，是否默认自动跳转到 Canvas，还是只给 toast action？
6. 是否要把现有底部 ViewSwitcher 在后续移动到顶部二级栏？MVP 建议暂不移动。
