# 小组件系统实施方案

状态：已定稿，按本文档执行。

## 目标与范围

新增「小组件」类别：checklist、番茄钟（pomodoro）、提醒（reminder）。小组件数据不进现有 canvas json，canvas 只保存引用；现有 checklist 从 card 迁移进小组件类别。

架构：单一 React Flow 节点类型 `widget`，用 `kind` 区分具体小组件；内容存独立 JSON 文件。

```diagram
╭──────────────────────╮      ╭──────────────────────────────╮
│ canvas manifest      │      │ .ghostboard/widgets/          │
│ views/*.canvas.json  │      │   widget_ab12cd34.json        │
│                      │      │   widget_ef56gh78.json        │
│ widget node:         │─────▶│                               │
│ { widgetId, kind }   │ 引用 │ WidgetRecord（完整内容）       │
╰──────────────────────╯      ╰──────────────────────────────╯
```

## 已定决策

以下决策已确定，执行时不需要再讨论：

1. 单一 `widget` node type + `WidgetKind = 'checklist' | 'pomodoro' | 'reminder'`。
2. 内容存 `.ghostboard/widgets/<widgetId>.json`，一个 widget 一个文件，用 `atomicWrite`。
3. manifest 只保存 `{ widgetId, kind }` 引用；widget 内容字段（items/timer/dueAt 等）绝不进 manifest。
4. checklist 从 card 懒迁移到 `widget.kind = 'checklist'`；widgetId 确定性生成：`widget_${noteId 去 note_ 前缀}`；旧 note 文件第一版不删除。
5. 删除画布上的 widget 节点只删引用，不删 widget 文件；未引用 widget 由 cleanup 管理。
6. **duplicate / 粘贴时克隆 widget 文件并重映射 `widgetId`**（不做共享引用）。
7. **第一版实现 per-widget undo 栈**：widget 内容编辑的撤销由 `widgetStore` 自己的历史栈承担（见「复制与撤销」节）；不把 widget 内容塞回画布快照。
8. 标签按 `widgetId` 存；迁移时把旧 checklist 的标签 key 从 `note_xxx` 重写为 `widget_xxx`。
9. Markdown 导出必须包含 checklist widget（生成 GFM 任务列表），不允许静默丢数据。
10. 番茄钟运行中不每秒写盘，只在状态转换时保存。
11. 提醒第一版只做 app 打开时的应用内提醒，`repeat` 只实现 `'none'`；系统通知与重复提醒后置。
12. 内置模板第一版保留 legacy checklist card，靠懒迁移转换；Phase 4 再支持 widget seed 并改写模板本体。
13. 创建入口第一版放在 More 区域平铺三项，第二版再收拢为「小组件」子菜单。

## 数据模型

```ts
type WidgetKind = 'checklist' | 'pomodoro' | 'reminder';

type WidgetRecord = {
  schema: 'ghostboard-widget/v1';
  id: string; // widget_${nanoid} 或迁移时的确定性 id
  kind: WidgetKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  data: ChecklistWidgetData | PomodoroWidgetData | ReminderWidgetData;
};
```

### Checklist

```ts
type ChecklistWidgetData = {
  items: Array<{
    id: string; // 必须存在；迁移时为旧 item 合成 `item_${nanoid}`
    text: string;
    checked: boolean;
    isHeader?: boolean;
    createdAt?: string;
    completedAt?: string;
  }>;
};
```

注意现状差异：当前 checklist item **没有稳定 id**——内容经 GFM 复选框 markdown 往返（`src/bun/notes.ts` 的 `serializeChecklistItems` / `parseChecklistBody`，约 330-365 行），UI key 用内容拼接（`CardNode.tsx` 的 `checklistItemKey`）。因此：

- 迁移时必须为每个旧 item 合成 `id`，不能假设旧数据里有。
- `id` / `createdAt` / `completedAt` 无法用 GFM markdown 表达。保留的旧 note 只能备份 `text` 和 `checked`；迁移后新增字段只存在于 widget JSON。

### Pomodoro

```ts
type PomodoroWidgetData = {
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
};
```

- `running` 状态通过 `startedAt + durationMs` 计算剩余时间，tick 不写盘。
- `pause` 时写入 `remainingMs`；`complete` 时递增 `completedSessions`。
- 加载时若 `running` 且已超时（`now > startedAt + durationMs`），按已完成处理：递增 `completedSessions`，timer 置 `idle`，保存一次。

### Reminder

```ts
type ReminderWidgetData = {
  dueAt: string;
  timezone: string;
  status: 'scheduled' | 'snoozed' | 'done' | 'missed';
  snoozedUntil?: string;
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly'; // 第一版只实现 'none'
  note?: string;
};
```

app 打开时扫描 due reminder 并在应用内提示；关闭状态下的系统通知不在本期范围。

### Manifest 节点

```ts
type CanvasWidgetNode = {
  id: string;
  type: 'widget';
  position: { x: number; y: number };
  style?: { width?: number; height?: number };
  parentId?: string;
  extent?: 'parent';
  data: {
    widgetId: string;
    kind: WidgetKind;
  };
};
```

Folder child 结构：

```ts
type FolderWidgetChildEntry = {
  id: string;
  type: 'widget';
  widgetId: string;
  data: {
    widgetId: string;
    kind: WidgetKind;
  };
};
```

## 磁盘结构

新增 `.ghostboard/widgets/`：

```text
.ghostboard/
  views/
    default.canvas.json
  widgets/
    widget_ab12cd34.json
```

- 在 workspace 初始化的目录列表（`src/bun/workspace.ts` 约 63-73 行）中加入 `widgets` 目录。
- widget 文件示例：

```json
{
  "schema": "ghostboard-widget/v1",
  "id": "widget_ab12cd34",
  "kind": "checklist",
  "title": "Launch checklist",
  "createdAt": "2026-07-08T10:00:00.000Z",
  "updatedAt": "2026-07-08T10:15:00.000Z",
  "data": {
    "items": [
      { "id": "item_1", "text": "Update landing copy", "checked": false }
    ]
  }
}
```

## Bun 层：`src/bun/widgets.ts`

```ts
createWidget(wsPath, kind, title?): Promise<WidgetRecord>
loadWidget(wsPath, widgetId): Promise<WidgetRecord | WidgetLoadError>
loadWidgets(wsPath, widgetIds): Promise<Record<string, WidgetRecord | WidgetLoadError>>
saveWidget(wsPath, widget): Promise<void>
deleteWidget(wsPath, widgetId): Promise<void>
```

约束：

- `widgetId` 校验仿照 BlockNote sidecar（`src/bun/blocknote.ts` 约 11-19 行的 `/^[A-Za-z0-9_-]+$/`），路径必须固定在 `.ghostboard/widgets/` 内，拒绝穿越（仿照 `blocknote.ts` 约 83-99 行的路径检查）。
- JSON parse 失败返回 corrupted 状态，文件缺失返回 missing 状态，不 throw、不让 `loadCanvas` 崩溃。
- 保存用 `atomicWrite`（`src/bun/atomicWrite.ts`）。
- `loadWidgets` 批量并发读，单个损坏不影响其他。

## RPC：扩展 `CanvasRPC`

```ts
type CanvasRPC = {
  bun: {
    requests: {
      loadCanvas: {
        response: {
          nodes: ManifestNode[];
          edges: ManifestEdge[];
          viewport?: Viewport;
          widgets?: Record<string, WidgetRecord | WidgetLoadError>;
        } | null;
      };
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
    };
  };
};
```

`cloneWidget` 服务于 duplicate/粘贴克隆语义：读源 widget，生成新 id，写新文件，返回新 record。

## Renderer store：`src/mainview/store/widgetStore.ts`

```ts
type WidgetStore = {
  records: Record<string, WidgetRecord | WidgetLoadError>;
  history: Record<string, { past: WidgetRecord[]; future: WidgetRecord[] }>;
  hydrate: (records: Record<string, WidgetRecord | WidgetLoadError>) => void;
  createWidget: (kind: WidgetKind, title?: string) => Promise<WidgetRecord | null>;
  cloneWidget: (widgetId: string) => Promise<WidgetRecord | null>;
  updateWidget: (widgetId: string, updater: (record: WidgetRecord) => WidgetRecord) => void;
  undoWidget: (widgetId: string) => void;
  redoWidget: (widgetId: string) => void;
  saveWidgetNow: (widgetId: string) => Promise<void>;
};
```

保存策略：

- checklist / reminder 编辑走短 debounce。
- pomodoro tick 不写盘，只在 start/pause/resume/reset/complete 写盘。
- 保存失败显示 toast，保留内存 dirty 状态以便重试。
- 小组件内容保存不触发 canvas manifest 保存（节点布局变化除外）。

undo 栈规则（见「复制与撤销」节的路由说明）：

- `updateWidget` 在应用 updater 前把当前 record 压入该 widget 的 `past`，清空 `future`；栈深上限 50，超出丢最旧。
- `undoWidget` / `redoWidget` 在 `past` / `future` 间移动 record，落盘走与普通编辑相同的 debounce 路径。
- 快速连续输入（如打字）按现有编辑 commit 粒度压栈即可，不做字符级合并。
- pomodoro 的 timer 状态转换（start/pause/complete）**不压栈**——撤销一个正在走的计时器没有意义；pomodoro 只有设置项（时长、组数）编辑参与 undo。
- history 只存在于内存，不持久化；重载后栈清空。

## 引用降解：`src/bun/index.ts` 的 saveManifest RPC handler

真正的引用降解发生在 `src/bun/index.ts` 的 `saveManifest` RPC handler（约 1325-1590 行），不是 `src/bun/manifest.ts`（后者只做 `JSON.stringify` 落盘）。该 handler 是两阶段结构：Phase 1 串行预分配 `noteId`（top-level card 和 folder card-child，约 1363-1423 行），Phase 2 并行写内容并降解引用（约 1426 行起）。

已确认的有利事实：该 handler 对未知 node type **原样透传**——top-level 在 `if (node.type !== 'card') return node`（约 1537 行），folder child 在 `if (child.type !== 'card') return child`（约 1488 行），`loadCanvas` 同样透传。因此 `widget` 节点不会误入 card 的 `.md` 创建流程（`resolveCardLocation` / `persistManifestCardNote` / `createNote`）。

执行要求：

1. widget 分支同时覆盖 top-level 路径和 folder-child 路径，做防御性二次清洗：只保留 `{ widgetId, kind }`，剥掉任何混入 `data` 的运行时字段。
2. 建议先把该 handler 按节点类型拆成独立 serializer（card / attachment / image / folder / widget），再插入 widget 分支，不要在原函数里继续堆分支。
3. renderer 侧 `sanitizeForPersistence`（`src/mainview/lib/canvasNodeSerialization.ts`）同步增加 widget 数据白名单。

不变量（测试锁死）：

- `node.data.items`、`node.data.timer`、`node.data.dueAt` 不出现在 canvas manifest。
- Folder child widget 只保存引用，不写 `.md`，不触发 card note 创建。

## 加载流程

`loadCanvas(viewId)`（`src/bun/index.ts` 约 1185 行起）：

1. 读取 view manifest，正常 hydrate card、asset、image、link、recording。
2. 扫描 top-level nodes 和 folder children，收集所有 `widgetId`。
3. 用 `loadWidgets` 批量加载，返回 `nodes`、`edges`、`viewport`、`widgets`。
4. 执行 checklist 懒迁移（见下节）。

renderer：

1. `canvasStore.hydrate(nodes, edges, viewport)`。
2. `widgetStore.hydrate(widgets)`。
3. `WidgetNode` 按 `node.data.widgetId` 查 store，按 `record.kind` 分发。

缺失或损坏：widget 文件缺失渲染 missing 状态，JSON 损坏渲染 corrupted 状态，控制台记录 `widgetId` 和原因；用户可删除节点。

## Checklist 迁移（懒迁移）

当前 checklist 是 card 的数据类型（`data.type === 'checklist'`，note markdown 往返）。迁移在 `loadCanvas` 中执行：

1. hydrate card note 后，发现 `node.type === 'card' && node.data.type === 'checklist'`：
2. 生成确定性 widgetId：`const widgetId = 'widget_' + noteId.replace(/^note_/, '')`。
3. 若 widget 文件不存在，把 checklist items 写成 `WidgetRecord`（为每个 item 合成 `item_${nanoid}`）。
4. 返回节点改写为 `{ ...node, type: 'widget', data: { widgetId, kind: 'checklist' } }`。
5. folder child checklist 同样处理。
6. 下次 `saveManifest` 后 canvas json 变成 widget 引用。

执行要求：

1. **loadCanvas 由此变成写路径**，两个副作用必须处理：
   - 节点 hydrate 是 `Promise.all` 并行的；两个共享同一 noteId 的重复 checklist card（现状 duplicate 会产生）会并发写同一个 widget 文件。确定性 widgetId + `atomicWrite` 使内容幂等，属良性竞争，但写入必须容错：写失败退回 legacy card 返回，记录 warning，不阻塞加载。
   - **版本回滚分叉**：widget 文件已建但 manifest 未保存时，旧版本 app 会继续编辑 note，与 widget 分叉。缓解：cleanup 在 widget 与 note 同时存在时不动 note；不做额外补救。
2. **标签 key 同步迁移**：现有 checklist 标签在 `.ghostboard/node-metadata.json` 按 `noteId` 存（`src/bun/nodeMetadata.ts`）。迁移 widget 时把 `note_xxx` key 重写为 `widget_xxx`（纯 key 重写，与懒迁移同步做，或仿照 `migrateLegacyTagsFromNotes` 在启动时定向迁移一次）。否则用户已有 checklist 标签在 UI 上全部丢失。
3. **首次运行种子**：`src/mainview/data/initialNodes.ts`（约 38、140 行）含两个 legacy checklist，改为直接生成 widget（初始化时由 Bun 侧写 seed widget 文件，manifest 直接引用），不让新 workspace 依赖迁移路径。
4. 迁移失败保留原 card 节点返回，不删旧 note，记录 warning。

## 复制与撤销

### duplicate / 粘贴：克隆 widget

`canvasStore` 的 `duplicateSelected` / `pasteClipboard`（约 1469-1510 行）是通用逻辑，只换 node id、不重映射 `data` 内引用。不改的话，Cmd+D 一个 widget 会得到两个共享同一 widget 文件的节点。

执行要求：在 duplicate/粘贴路径识别 widget 节点，调 `cloneWidget` 克隆文件并把新节点的 `data.widgetId` 指向新 id。跨 workspace 粘贴时源 widget 文件不存在则粘贴为 missing 状态节点。

### undo/redo：per-widget undo 栈（第一版实现）

现状 checklist items 在 `node.data` 里，画布快照（`saveSnapshot` / `undo`，canvasStore 约 1896-1930 行）覆盖其编辑。迁移后 widget 内容不进快照——不把 widget 内容塞回画布快照（会重新耦合两个 store），改由 `widgetStore` 的 per-widget undo 栈承担（栈规则见「Renderer store」节）。

Cmd+Z 路由规则：

- **编辑焦点在某个 widget 内**（inline 编辑中，或 focused view 打开的是 widget）：Cmd+Z / Shift+Cmd+Z 路由到 `undoWidget(widgetId)` / `redoWidget(widgetId)`，不触发画布 undo。
- **其他情况**：走现有画布 undo（节点增删、移动、连线等布局操作仍由画布快照覆盖）。
- 实现位置：在现有画布快捷键处理处加一层前置判断（当前 focused/editing widget 存在则拦截）；focused view 的 widget 编辑器内同样绑定。
- 两个栈互不感知：widget 内容撤销不回滚画布布局，画布撤销不回滚 widget 内容。删除 widget 节点后画布 undo 恢复的是**引用**——widget 文件未删（决策 5），恢复后内容完好，语义自洽。

## 渲染

### WidgetNode（统一外壳）

```tsx
function WidgetNode({ id, data }) {
  const record = useWidgetStore((s) => s.records[data.widgetId]);

  if (!record) return <MissingWidgetCard />;
  if ('error' in record) return <BrokenWidgetCard error={record.error} />;

  switch (record.kind) {
    case 'checklist':
      return <ChecklistWidget nodeId={id} widget={record} />;
    case 'pomodoro':
      return <PomodoroWidget nodeId={id} widget={record} />;
    case 'reminder':
      return <ReminderWidget nodeId={id} widget={record} />;
    default: {
      const _exhaustive: never = record.kind;
      return _exhaustive;
    }
  }
}
```

工作区规则 `typescript-exhaustive-switch`：所有分发 `record.kind` / `node.data.kind` / `CanvasNodeKind` 的 switch（renderer、search、export、read-only）都带 `never` 默认分支。

### 只读渲染

- `WidgetNodeReadOnly` 不触发 store 写入。
- 模板预览和 PNG 导出用只读 record 快照；拿不到 record 显示 compact fallback。

### Focused view（高危点）

`FocusedView.tsx` 现按 `data.type === 'checklist'` 路由到 `ChecklistFocusedView`（约 277-284 行），且 `commitFocusedData` 会把 `{ items }` 写回 `node.data`（folder child 走 `commitFolderChildData`）。**只改路由不改 commit 路径会直接违反「items 不进 manifest」不变量。**

执行要求：widget 的 focused 编辑按 node type + `kind` 路由，编辑写 `widgetStore`，不经过 `commitNodeData` / `commitFolderChildData`。

## 受影响分支清单（全部要改）

动工前先全量 grep `'checklist'` / node type / `CanvasNodeKind` 分支，对照本清单逐一处理。两件牵动全局的事：新增 `widget` node type；把 `checklist` 的 `nodeType` 从 `'card'` 改为 `'widget'`。

- `src/mainview/lib/contentTypes.ts`：`CanvasNodeKind` 调整。
- `src/mainview/lib/canvasNodeRegistry.ts`：`checklist` 条目 `nodeType` 改 `widget`，新增 `pomodoro` / `reminder`；`widget` spec 设 `canEnterGroup: true`、`canEnterFolder: true`。
- `src/mainview/lib/canvasNodePredicates.ts` / `canvasNodeSerialization.ts` / `canvasConstants.ts`：按 node type / kind 的判定与序列化；`nodeTypes` / `readOnlyNodeTypes` 注册 `WidgetNode` / `WidgetNodeReadOnly`。
- `src/bun/index.ts`：`loadCanvas` hydrate 分支（top-level + folder-child）、`saveManifest` 降解分支（top-level + folder-child）、新增 widget RPC。
- `src/bun/notes.ts`：`serializeChecklistItems` / `parseChecklistBody` 保留用于迁移读取和 Markdown 导出，`type === 'checklist'` 的保存分支在迁移完成后不再被新数据触发。
- `src/mainview/components/canvas/nodes/CardNode.tsx`：删除 `data.type === 'checklist'` 渲染分支，逻辑移入 `ChecklistWidget`。
- `src/mainview/components/canvas/FocusedView.tsx`：路由 + commit 路径（见上节，高危）。
- `src/mainview/components/canvas/ChecklistFocusedView.tsx`：改为 widget 数据源。
- `src/mainview/components/canvas/nodes/readOnlyNodes.tsx`：只读渲染分发。
- `src/mainview/components/library/LibraryCard.tsx` 及 library 视图：现按 `type === 'card' && data.type === 'checklist'` 选图标（约 37 行），摘要依赖 note `previewExcerpt`。widget 无 preview 基础设施——为 checklist widget 从 items 生成 excerpt，保证迁移后 checklist 不从 library 消失。
- `src/mainview/data/initialNodes.ts`：种子改为 widget（见迁移节）。
- `src/mainview/lib/creatableNodes.ts`：`checklist` 条目（约 64 行）指向 widget 创建流程，新增 `pomodoro` / `reminder` action。
- `src/mainview/store/canvasStore.ts`：duplicate/粘贴克隆逻辑（见上节）。
- `src/bun/search.ts` / `src/bun/cleanup.ts` / `src/bun/templates.ts` / `src/bun/markdownExport.ts`：见下面各节。
- `messages/*.json`：新增「小组件」「清单」「番茄钟」「提醒」等文案的本地化。

原则：所有 switch/if 链收敛成对 `CanvasNodeKind` / `WidgetKind` 的穷尽 switch（带 `never` 默认分支）。

## 创建入口

流程：

1. 用户在创建菜单选择小组件类型（第一版 More 区域平铺 Checklist / Pomodoro / Reminder）。
2. renderer 调 `rpcCreateWidget({ kind })`。
3. Bun 创建 widget 文件并返回 record。
4. renderer 将 record 放入 `widgetStore`，创建 `type: 'widget'` 节点，`data` 只放 `{ widgetId, kind }`。
5. canvas autosave 保存引用。

用户文案：顶层「小组件」，子项「清单」「番茄钟」「提醒」（更新 `messages/*.json`）。

## 搜索：`src/bun/search.ts`

现状每次 query 重读 manifest 与 note，无索引。扩展：

- 扫描 manifest 时收集 `widgetId`（top-level + folder children），用 `loadWidgets` **批量并发**加载，不逐个 await；单个 widget 损坏跳过，不中断整次搜索。
- checklist 搜 title + item text；pomodoro 搜 title；reminder 搜 title、note、dueAt。

结果结构：

```ts
type SearchResult = {
  kind: 'widget';
  widgetKind: WidgetKind;
  widgetId: string;
  nodeId: string;
  viewId: string;
  title: string;
  excerpt: string;
};
```

## 标签

- widget 标签按 `widgetId` 作为 node-metadata key 存（card 按 `noteId`、非 card 按 `node.id` 的现状不变）。
- 存量迁移：`note_xxx` → `widget_xxx` key 重写（见迁移节）。
- 模板安装路径（`src/bun/workspace.ts` 约 444-451 行）在重映射 card noteId 时写 metadata；Phase 4 widget seed 带标签时做同样的 `widgetId` 重映射。

## 模板

第一版：kanban / demo / weekly-planner 里的 checklist card（`noteContents` 用 `displayHint: "checklist"`）保持不动，安装后由懒迁移转换。

Phase 4 widget seed：

```text
src/bun/templates/<template-id>/
  manifest.canvas.json
  widgets/
    widget_xxx.json
```

安装时复制 manifest 和 widgets，重写 widget id 避免冲突，node metadata 占位 key 同步重映射。注意模板 manifest 目前是编译期静态 import（`src/bun/templates.ts` 约 14-31 行），widget seed 文件纳入同样的打包方式。之后把三个内置模板的 checklist 改写为 widget seed。

## 导出

- **Markdown 导出（Phase 2 必做）**：`exportNotesMarkdown` 的 view scope 用 `collectViewNoteIds`（`src/bun/index.ts` 约 190-213 行）只收集 `noteId`，迁移后 checklist 不再有 note，「导出全部笔记」会静默丢清单。扩展导出收集 widget 引用，checklist widget 用 `serializeChecklistItems` 逻辑生成 GFM 任务列表 markdown 纳入导出。
- **Canvas JSON 导出（Phase 4）**：包含 manifest + 被引用的 widget records，否则导入新 workspace 后 widget 全部 missing。实现前导出 UI 明示不含小组件数据，不允许静默丢。
- **工作区 ZIP 导出无需改动**：`exportWorkspaceArchive` 打包整个目录，`.ghostboard/widgets/` 自动包含。

## 清理：`src/bun/cleanup.ts`

- **引用收集必须包含 trash**：仿照 `collectReferencedIds`（约 58-67 行）同时扫描 `config.views` 和 `config.trash` 的 manifest 收集 `widgetId`，否则会误删被已删除视图引用的 widget，破坏视图恢复。
- **删除白名单加 widgets 目录**：`deleteUnlinkedNotes` 的路径白名单（约 207-224 行）只允许 `content/*.md` 和 `content/.ghostboard/blocknote/*.json`；新增 `.ghostboard/widgets/*.json` 白名单及 widgetId 校验。
- 旧 checklist note 清理条件：note 不再被任何 manifest 引用**且**对应 widget 已存在，才可进入 unlinked 列表；widget 与 note 同时存在且 note 仍被引用时不动 note。

## 错误处理

加载：单个 widget 缺失/损坏不影响整个 canvas，节点显示 missing/corrupted，控制台记录 `widgetId` 和原因。

保存：`saveWidget` 失败显示 toast，`widgetStore` 保留 dirty 状态，下次编辑或手动 retry 再保存。

迁移：失败保留原 card 节点，不删旧 note，记录 warning。

## 测试计划

### Bun widgets.ts

- 创建 / 加载 / 保存（atomic write）widget 文件。
- 缺失返回 missing，损坏 JSON 返回 corrupted。
- 非法 widgetId 不能越出 `.ghostboard/widgets/`。
- `cloneWidget` 生成新 id、内容一致。

### loadCanvas

- top-level 和 folder-child widget 返回 widgets map。
- widget missing 不影响其他节点。
- legacy checklist card / folder checklist child 迁移成 widget。
- 并发加载共享同一 noteId 的两个 checklist card 时，widget 写入幂等且不报错。
- 迁移写入失败退回 legacy card，不阻塞加载。
- 迁移同步重写标签 key（`note_xxx` → `widget_xxx`），迁移后标签在 UI 可见。

### saveManifest

- top-level / folder-child widget 只保存 `{ widgetId, kind }`。
- widget runtime data 不进 manifest。
- widget 节点不触发 `createNote` / `persistManifestCardNote`。

### Renderer store

- `hydrate` 合并 records；`updateWidget` 只更新 widgetStore，不改 `canvasStore.nodes`。
- checklist 更新 debounce 保存；pomodoro tick 不保存，start/pause/complete 保存。
- `updateWidget` 压栈、清空 future；`undoWidget` / `redoWidget` 正确往返且触发 debounce 保存。
- 栈深上限 50 生效，超出丢最旧。
- pomodoro timer 状态转换不压栈；设置项编辑压栈。
- `hydrate` / 重载后 history 为空。

### UI

- `WidgetNode` 正确分发三种 kind；missing/corrupted 有兜底态。
- read-only widget 不触发写入。
- focused view 编辑 widget 只写 `widgetStore`，不把 `items` 写回 `node.data`。
- 删除 widget node 只删画布引用。
- 编辑焦点在 widget 内时 Cmd+Z 路由到 `undoWidget`，不触发画布 undo；焦点在画布时走画布 undo。
- 画布 undo 恢复被删的 widget 节点后，内容完好（widget 文件未删）。

### 复制

- duplicate / 粘贴 widget 节点克隆文件并重映射 `widgetId`。
- 跨画布粘贴不产生悬空 `widgetId`。

### 导出与清理

- view scope Markdown 导出包含 checklist widget 的 GFM 输出。
- cleanup 不删除被 trash 视图引用的 widget。
- cleanup 可删真正未引用的 widget，路径校验拒绝 `.ghostboard/widgets/` 之外的路径。

## 分阶段落地

### Phase 1：基础设施 + 最小链路

- `WidgetKind` / `WidgetRecord` 类型；`src/bun/widgets.ts` + 测试。
- workspace 初始化加 `widgets/` 目录。
- RPC：`createWidget` / `cloneWidget` / `saveWidget` / `deleteWidget`；`loadCanvas` 返回 widgets map。
- `widgetStore`（含 per-widget undo 栈）+ 测试；`WidgetNode` shell + missing/corrupted 兜底。
- Cmd+Z 路由：焦点在 widget 内走 `undoWidget`，否则走画布 undo。
- `widget` node spec、`nodeTypes` / `readOnlyNodeTypes` 注册。
- `saveManifest` handler 的 widget 降解分支（建议先按节点类型拆 serializer）。
- duplicate/粘贴克隆逻辑。
- 先实现最小 checklist widget 验证创建→渲染→编辑→保存→重载全链路。

### Phase 2：Checklist 迁移

- `loadCanvas` 懒迁移（含并发容错、失败回退）。
- 标签 key 迁移（`note_xxx` → `widget_xxx`）。
- 删除 `CardNode` checklist 分支，`ChecklistWidget` 接管；items 合成稳定 id。
- `FocusedView` 路由 + commit 路径改造；`ChecklistFocusedView` 接 widgetStore。
- `initialNodes.ts` 种子改 widget；`LibraryCard` / library 视图、`creatableNodes` 更新。
- Markdown 导出包含 checklist widget（GFM）。
- 验证 checklist 全部编辑路径（inline + focused view）接入 per-widget undo。
- 保留旧 note 文件。

### Phase 3：番茄钟和提醒

- Pomodoro：start/pause/resume/reset/complete，超时恢复逻辑。
- Reminder：dueAt / snooze / done，app 打开时扫描 due reminder，应用内提示。
- 创建菜单加入两个新 kind + 本地化文案。

### Phase 4：生态补齐

- 搜索 widget 内容（批量加载、容错）。
- 模板 widget seed 支持 + 三个内置模板改写。
- Canvas JSON 导入导出包含 widget records。
- cleanup 支持未引用 widget（含 trash 引用保护、路径白名单）。
- 旧 checklist note 的 cleanup 回收。
