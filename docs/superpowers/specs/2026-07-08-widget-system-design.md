# 小组件系统技术方案草案

状态：草案，供评审和产品取舍使用，尚未进入实现计划。

日期：2026-07-08

## 背景

GhostBoard 当前的画布 manifest 负责保存 React Flow 节点、边、视口、布局和少量引用数据。内容类数据已经有分层：

- Card 节点通过 `noteId` 引用 note 内容，正文不长期保存在 canvas json 中。
- Asset / image / recording 节点通过附件路径引用二进制或派生资源。
- Folder 的 `data.children` 目前嵌入子项引用，其中 card child 会在保存时降成 note 引用。

新需求是增加一个用户可理解的类别：小组件。小组件包括 checklist、番茄钟、提醒等效率类组件。要求是：小组件的数据不放进现有 canvas json，canvas 只保存对小组件的引用；现有 checklist 也应合并进小组件类别。

## 推荐方向

采用单一 React Flow 节点类型 `widget`，用 `widget.kind` 区分具体小组件：

- `checklist`
- `pomodoro`
- `reminder`

画布 manifest 只保存节点布局和小组件引用：

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

真实小组件数据保存为独立内容实体：

```ts
type WidgetKind = 'checklist' | 'pomodoro' | 'reminder';

type WidgetRecord = {
  schema: 'ghostboard-widget/v1';
  id: string;
  kind: WidgetKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  data: ChecklistWidgetData | PomodoroWidgetData | ReminderWidgetData;
};
```

核心原则：

1. `canvasStore.nodes` 只负责布局、选择、连线、父子关系和引用。
2. `widgetStore` 负责小组件内容状态。
3. `saveManifest` 必须把 `widget` 节点降成 `{ widgetId, kind }` 引用，不能持久化组件内部数据。

## 为什么不用其他方案

### 方案 A：每种小组件一个独立 node type

例如 `checklist`、`pomodoro`、`reminder` 都是 React Flow node type。

优点：

- 初看直观，每种组件有自己的节点。
- UI 分发较少一层。

缺点：

- Folder、Group、搜索、标签、导出、只读预览、模板都需要为每个 node type 加分支。
- 后续新增小组件会持续扩大画布节点类型表。
- 很难形成统一的小组件内容层。

结论：不推荐。

### 方案 B：保留 checklist 在 card 里，只给番茄钟和提醒做 widget

优点：

- checklist 迁移成本低。
- 初期改动少。

缺点：

- 用户看到的是统一“小组件”，代码里却一半是 `card`，一半是 `widget`。
- checklist 的数据仍通过 Markdown note 往返，不适合后续做结构化任务属性。
- 搜索、标签、模板、导出会长期背负概念不一致。

结论：不推荐作为长期架构。

### 方案 C：单一 `widget` node type，数据独立存储

优点：

- 概念干净：画布放置实例和小组件内容实体分离。
- 后续新增小组件只新增 `WidgetKind` 和对应 renderer。
- 与 card 的 `node -> noteId -> content` 模式一致，但不复用 Markdown note。
- manifest 体积稳定，不会因 checklist items 或 timer 状态膨胀。

缺点：

- 需要新增 widget 持久化、RPC、store 和 migration。
- checklist 从 card 迁移到 widget 需要兼容旧数据。

结论：推荐。

## 磁盘结构

新增 `.ghostboard/widgets/`：

```text
.ghostboard/
  views/
    default.canvas.json
  widgets/
    widget_ab12cd34.json
    widget_ef56gh78.json
```

一个 widget 一个 JSON 文件。

原因：

- 单个文件损坏不会拖垮所有小组件。
- 修改某个小组件不需要重写整个 widget 数据库。
- 与现有 `atomicWrite` 风格一致。
- 未来同步、备份、冲突处理更容易。

示例 widget 文件：

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
      {
        "id": "item_1",
        "text": "Update landing copy",
        "checked": false
      }
    ]
  }
}
```

对应 manifest 节点：

```json
{
  "id": "node_7f3a",
  "type": "widget",
  "position": { "x": 900, "y": 100 },
  "style": { "width": 350, "height": 300 },
  "data": {
    "widgetId": "widget_ab12cd34",
    "kind": "checklist"
  }
}
```

## 数据模型

### Checklist

```ts
type ChecklistWidgetData = {
  items: Array<{
    id: string;
    text: string;
    checked: boolean;
    isHeader?: boolean;
    createdAt?: string;
    completedAt?: string;
  }>;
};
```

说明：

- `id` 必须存在，避免继续用 index 作为 React key。
- `completedAt` 允许后续做完成时间、统计和排序。
- `isHeader` 保留现有 checklist 的 header 能力。

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

说明：

- 运行中不每秒写盘。
- `running` 状态通过 `startedAt + durationMs` 计算剩余时间。
- `pause` 时才写入 `remainingMs`。
- `complete` 时递增 `completedSessions`。

### Reminder

```ts
type ReminderWidgetData = {
  dueAt: string;
  timezone: string;
  status: 'scheduled' | 'snoozed' | 'done' | 'missed';
  snoozedUntil?: string;
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
  note?: string;
};
```

第一版建议只实现 `repeat: 'none'`，重复提醒后置。

提醒边界：

- 第一版只保证 app 打开时提醒。
- 如果需要 app 关闭后也弹系统通知，需要 main/Bun 层做调度或启动时扫描过期提醒，并另行设计 OS notification 权限和降级策略。

## 代码结构

建议新增或修改：

```text
src/bun/widgets.ts
src/bun/widgets.test.ts
src/mainview/store/widgetStore.ts
src/mainview/store/widgetStore.test.ts
src/mainview/components/canvas/nodes/WidgetNode.tsx
src/mainview/components/canvas/nodes/WidgetNode.test.tsx
src/mainview/components/canvas/nodes/readOnlyNodes.tsx
src/mainview/lib/contentTypes.ts
src/mainview/lib/canvasNodeRegistry.ts
src/mainview/lib/canvasConstants.ts
src/mainview/lib/canvasNodePredicates.ts
src/mainview/lib/canvasNodeSerialization.ts
src/mainview/lib/rpc.ts
src/bun/index.ts
```

### Bun 层

`src/bun/widgets.ts` 提供：

```ts
createWidget(wsPath, kind): Promise<WidgetRecord>
loadWidget(wsPath, widgetId): Promise<WidgetRecord | WidgetLoadError>
loadWidgets(wsPath, widgetIds): Promise<Record<string, WidgetRecord | WidgetLoadError>>
saveWidget(wsPath, widget): Promise<void>
deleteWidget(wsPath, widgetId): Promise<void>
```

约束：

- `widgetId` 必须是相对安全 id，例如 `widget_${nanoid}`。
- 文件路径必须固定在 `.ghostboard/widgets/` 内。
- JSON parse 失败不能让 `loadCanvas` 崩溃，应返回 corrupted/missing 状态。
- 保存使用 `atomicWrite`。

### RPC

扩展 `CanvasRPC`：

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

### Renderer store

新增 `widgetStore`：

```ts
type WidgetStore = {
  records: Record<string, WidgetRecord | WidgetLoadError>;
  hydrate: (records: Record<string, WidgetRecord | WidgetLoadError>) => void;
  createWidget: (kind: WidgetKind, title?: string) => Promise<WidgetRecord | null>;
  updateWidget: (widgetId: string, updater: (record: WidgetRecord) => WidgetRecord) => void;
  saveWidgetNow: (widgetId: string) => Promise<void>;
};
```

保存策略：

- checklist 编辑和 reminder 编辑走短 debounce。
- pomodoro 的 tick 不写盘，只在 start/pause/resume/reset/complete 写盘。
- 保存失败显示 toast，并保留内存状态以便重试。

## 加载流程

`loadCanvas(viewId)`：

1. 读取 view manifest。
2. 正常 hydrate card、asset、image、link、recording。
3. 扫描 top-level nodes 和 folder children，收集所有 `widgetId`。
4. 批量加载 `.ghostboard/widgets/*.json`。
5. 返回 `nodes`、`edges`、`viewport`、`widgets`。

renderer：

1. `canvasStore.hydrate(nodes, edges, viewport)`。
2. `widgetStore.hydrate(widgets)`。
3. `WidgetNode` 根据 `node.data.widgetId` 查询 `widgetStore`。
4. `WidgetNode` 根据 `record.kind` 分发到对应组件。

缺失或损坏：

- widget 文件缺失时，节点仍渲染为 missing 状态。
- widget JSON 损坏时，节点显示 corrupted 状态。
- 用户可以删除该节点或后续增加 repair 操作。

## 保存流程

画布变化：

1. `useCanvasPersistence` 继续监听 `canvasStore.nodes` / `edges` / `viewport`。
2. `sanitizeForPersistence` 清理运行时字段。
3. Bun `saveManifest` 对 `widget` 节点二次清洗，只保留 `widgetId` 和 `kind`。

小组件内容变化：

1. 小组件 UI 更新 `widgetStore`。
2. `widgetStore` debounce 调 `rpcSaveWidget`。
3. Bun `saveWidget` atomic write 到 `.ghostboard/widgets/<widgetId>.json`。

不变量：

- `node.data.items`、`node.data.timer`、`node.data.dueAt` 不能写入 canvas manifest。
- Folder child widget 也只能保存引用。
- 小组件内容保存不应触发 canvas manifest 保存，除非改变了节点布局。

## Folder 和 Group 行为

Group：

- `widget` 可以进入 Group。
- `CANVAS_NODE_SPECS.widget.canEnterGroup = true`。

Folder：

- `widget` 可以进入 Folder。
- Folder child 结构建议：

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

保存时：

- Bun `saveManifest` 处理 folder children 时，遇到 `type: 'widget'` 只保留引用。
- 不写 `.md`。
- 不触发 card note 创建。

删除时：

- 删除画布上的 widget node 默认只移除引用，不删除 widget 文件。
- 删除 folder child widget 也默认只移除引用。
- 是否删除未引用 widget 文件应由 cleanup 功能处理，避免误删同一 widget 的其他引用。

## Checklist 迁移

当前 checklist 是 `card` 的一种数据类型：

```json
{
  "type": "card",
  "data": {
    "noteId": "note_xxx",
    "type": "checklist"
  }
}
```

迁移策略：懒迁移，保留旧 note 作为安全备份。

加载时：

1. `loadCanvas` hydrate card note 后，如果发现 `node.type === 'card' && node.data.type === 'checklist'`。
2. 生成稳定 widgetId：

```ts
const widgetId = `widget_${noteId.replace(/^note_/, '')}`;
```

3. 如果 widget 文件不存在，则把 checklist items 写成 `WidgetRecord`。
4. 返回给 renderer 的节点改成：

```ts
{
  ...node,
  type: 'widget',
  data: {
    widgetId,
    kind: 'checklist'
  }
}
```

5. 下次 `saveManifest` 后，canvas json 变成 widget 引用。

Folder child 同样处理：

```json
{
  "id": "child_1",
  "type": "widget",
  "widgetId": "widget_xxx",
  "data": {
    "widgetId": "widget_xxx",
    "kind": "checklist"
  }
}
```

旧 note 文件处理：

- 第一版不删除。
- 后续 cleanup 可以检测：note 不再被任何 manifest 引用，并且对应 widget 已存在，再移动到 trash 或 unlinked cleanup。

## 创建入口

用户文案：

- 顶层类别：小组件
- 子项：Checklist、Pomodoro、Reminder，中文本地化可以是“清单”“番茄钟”“提醒”

技术入口：

```ts
createWidgetNode(kind: WidgetKind, options?: CreateNodeOptions)
```

流程：

1. 用户选择小组件类型。
2. renderer 调 `rpcCreateWidget({ kind })`。
3. Bun 创建 widget 文件并返回 record。
4. renderer 将 record 放入 `widgetStore`。
5. renderer 创建 `type: 'widget'` 节点，`data` 只放 `widgetId` 和 `kind`。
6. canvas autosave 保存引用。

菜单形式：

第一版可先放在 More 区域，避免复杂嵌套菜单：

```text
More
  Checklist
  Pomodoro
  Reminder
```

第二版再收拢成：

```text
Small Widget
  Checklist
  Pomodoro
  Reminder
```

## 渲染结构

`WidgetNode` 是统一外壳：

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
  }
}
```

只读渲染：

- `WidgetNodeReadOnly` 不应触发 store 写入。
- 模板预览和 PNG 导出可以使用只读 record 快照。
- 如果只读环境拿不到 widget record，显示 compact fallback。

## 搜索、标签、模板和导出

### 搜索

`searchCanvas` 扫描 manifest 时：

- 遇到 `widgetId` 加载 widget record。
- checklist 搜 title 和 item text。
- pomodoro 搜 title。
- reminder 搜 title、note、dueAt。

搜索结果建议：

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

### 标签

现状中，card 标签按 `noteId`，非 card 标签按 `nodeId`。

widget 建议按 `widgetId` 存标签，因为 widget 是内容实体，不只是画布实例。这样同一个 widget 如果将来被多个画布引用，标签会跟随内容。

### 模板

模板需要支持 widget seed：

```text
src/bun/templates/<template-id>/
  manifest.canvas.json
  widgets/
    widget_xxx.json
```

模板安装时：

- 复制 manifest。
- 复制 widgets。
- 必要时重写 widget ids，避免与现有 workspace 冲突。

### 导出

Canvas JSON 导出应包含：

- manifest
- 被引用的 widget records

否则导入到新 workspace 后 widget 节点会全部 missing。

第一版可以先明确：导出小组件完整数据是后续任务；实现前至少不要让导出静默丢数据。

## 错误处理

加载错误：

- 单个 widget 缺失或损坏不影响整个 canvas。
- 节点显示 missing/corrupted 状态。
- 控制台记录具体 `widgetId` 和错误原因。

保存错误：

- `saveWidget` 失败显示 toast。
- `widgetStore` 保留 dirty 状态。
- 下一次编辑或手动 retry 可以再次保存。

迁移错误：

- checklist 迁移失败时保留原 card 节点返回。
- 不删除旧 note。
- 记录 warning。

## 测试计划

### Bun widget store

- 创建 widget 文件。
- 加载 widget 文件。
- 保存 widget 文件使用 atomic write。
- 缺失 widget 返回 missing 状态。
- 损坏 JSON 返回 corrupted 状态。
- 非法 widgetId 不能越过 `.ghostboard/widgets/`。

### `loadCanvas`

- 加载 top-level widget nodes 并返回 widgets map。
- 加载 folder child widget 并返回 widgets map。
- widget missing 不影响其他节点。
- legacy checklist card 迁移成 widget node。
- legacy folder checklist child 迁移成 widget child。

### `saveManifest`

- top-level widget node 只保存 `{ widgetId, kind }`。
- folder child widget 只保存引用。
- widget runtime data 不会进入 manifest。
- widget 节点不会触发 `createNote` 或 `persistManifestCardNote`。

### Renderer store

- `widgetStore.hydrate` 合并 records。
- `updateWidget` 只更新 widgetStore，不改 canvasStore.nodes。
- checklist 更新 debounce 保存。
- pomodoro tick 不触发保存。
- pomodoro start/pause/complete 触发保存。

### UI

- `WidgetNode` 正确分发 checklist / pomodoro / reminder。
- missing/corrupted widget 有兜底态。
- read-only widget 不触发写入。
- 删除 widget node 只删除画布引用。

## 分阶段落地

### Phase 1：基础设施和一个最小小组件

- 新增 `WidgetKind`、`WidgetRecord`。
- 新增 Bun `widgets.ts`。
- 新增 RPC：`createWidget`、`saveWidget`。
- 新增 `widgetStore`。
- 新增 `WidgetNode` shell。
- 新增 `widget` node spec 和 nodeTypes 注册。
- 先实现一个最小 checklist 或 pomodoro，以验证链路。

### Phase 2：Checklist 迁移

- 把现有 checklist card 懒迁移为 widget checklist。
- 替换 `CardNode` 中 checklist 分支。
- 调整 focused view 路由，checklist 使用 widget focused/editing path。
- 保留旧 note 文件。

### Phase 3：番茄钟和提醒

- 实现 Pomodoro start/pause/reset/complete。
- 实现 Reminder dueAt/snooze/done。
- app 打开时扫描 due reminder。
- 系统通知和重复提醒作为后续设计。

### Phase 4：生态补齐

- 搜索 widget 内容。
- 标签支持 `widgetId`。
- 模板支持 widget seed。
- Canvas JSON 导入导出包含 widget records。
- cleanup 支持未引用 widget。

## 需要进一步确认的问题

1. 小组件是否允许同一个 `widgetId` 出现在多个画布位置？
   - 推荐允许，但第一版 UI 不暴露复制引用，只保留架构可能性。

2. 删除小组件节点是否删除 widget 内容？
   - 推荐第一版只删引用，不删内容，由 cleanup 管理未引用 widget。

3. checklist 是否需要继续支持 Markdown 导出？
   - 推荐需要，但作为导出层功能，不再作为存储源。

4. Reminder 第一版是否需要系统通知？
   - 推荐先只做 app 内提醒，系统通知后置。

5. 模板是否第一版就必须支持 widget seed？
   - 如果 checklist 模板要迁移，则必须支持。否则模板中的 checklist 可暂时保留 legacy card，由 loadCanvas 懒迁移。

## 推荐决策

采用：

- 单一 `widget` React Flow node type。
- 独立 `.ghostboard/widgets/*.json` 小组件内容存储。
- manifest 只保存 `widgetId + kind` 引用。
- checklist 从 card 懒迁移到 `widget.kind = 'checklist'`。
- 第一版删除节点只删除引用，不删除 widget 文件。
- 番茄钟运行中不每秒写盘，只保存状态转换。
- 提醒第一版只保证 app 打开时提醒。

这条路线能把“小组件”做成一个独立内容层，同时保持画布 manifest 的职责清晰。它的初始改动比“直接塞进 card”更大，但后续新增效率组件的边际成本会低很多。
