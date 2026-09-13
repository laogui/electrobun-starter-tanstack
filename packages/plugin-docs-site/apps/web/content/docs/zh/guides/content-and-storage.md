---
title: "笔记、存储与事件"
description: "在带 revision 校验、可撤销的事务中读写 Notes；按应用或工作区保存 JSON 状态；响应内容、选区与工作区事件。"
section: guides
order: 50
---

## Note 快照

`app.content` 操作的是持久化的 Note 投影，不是实时编辑器 blocks：

```ts
interface NoteContentSnapshot {
  id: string;
  kind: 'note';
  source: 'sidecar' | 'markdown';
  revision: number | null; // null = 旧版 Markdown，在此 API 中只读
  title: string;
  color: string;
  text: string;            // 纯文本，段落以换行分隔
}
```

用 `app.content.get(id)`、`getMany(ids)`（最多 500）与 `query({ text, after, limit })` 读取，后者以 `nextCursor` 分页。

## 创建、更新、撤销

```js
const created = await app.content.createMany(
  [{ title: 'Question', text: 'What changed?\nWhy?' }, { title: 'Follow-up', color: '#bfdbfe' }],
  { label: 'Create research notes', operationId: 'research-page-17' }
);

const result = await app.content.updateMany(
  [{ id, expectedRevision: revision, changes: { title: 'Renamed' } }],
  { label: 'Rename note', operationId: 'rename-42' }
);

await app.content.undo(result.operationId);
```

- 批次包含 **1–100 项**且原子：全部成功或全部失败。
- `expectedRevision` 是 compare-and-swap。期间被编辑过的 Note 会让该批次失败而不是覆盖；用户已打开的编辑器会显示冲突视图，可选“保留本地”或“采用已保存”。
- `operationId` 让重试安全：用相同 ID 与相同输入重试不确定的请求会返回原结果而不重复执行。相同 ID 不同输入会被拒绝。
- 每个批次都以批次 ID 持久化。`undo` / `redo` 可跨重启。撤销会拒绝删除此后被编辑、放到画布或被引用的已创建 Notes，不会让内容在用户眼前消失。
- 已提交的批次也进入工作区与原生画布变化共享的有序历史；画布视图激活时普通撤销快捷键按顺序回退它们。聚焦编辑器保留自己的本地历史。
- `text` 是纯文本。它不是 Markdown，也不是富文本的无损往返。

新 Notes 是 **detached** 的：出现在文库与搜索中，但除非用户放置（导入器提供单批放置）否则不在画布上。

## 选区

`app.selection.get()` 返回当前画布选区背后去重后的持久化 Notes；`getPlacements()` 暴露包括 widget 与 extension 的放置 ID；`getSnapshot()` / `subscribe()` 提供带 `loading` / `ready` / `error` 状态、生命周期绑定的缓存快照。选区覆盖活动画布中显式选中的 Notes；不展开容器。

## 存储

```js
const count = (await app.storage.workspace.get('open-count')) ?? 0;
await app.storage.workspace.set('open-count', Number(count) + 1);
const keys = await app.storage.app.list('prefs:');
```

- `storage.app` 由本插件跨工作区共享；`storage.workspace` 按插件 + 工作区隔离，永不串工作区。
- 值仅限 JSON。数据在停用、重载与卸载后保留；只有显式永久删除才会移除。
- **存储没有版本迁移 API。** 在值里存版本并自行处理旧形状。

## 事件与任务

```js
app.events.on('content.changed', ({ ids, operation, noteChanges }) => { /* ... */ }, { signal: app.signal });
app.events.on('selection.changed', ({ placementIds, viewId }) => { /* ... */ });
app.events.on('workspace.activated', ({ workspaceId }) => { /* ... */ });

app.tasks.schedule('refresh', { every: 60_000 }, () => refresh(app));
app.tasks.schedule('reminder', { at: new Date(Date.now() + 3_600_000) }, () => notify(app));
```

事件在当前工作区的宿主、插件与编辑器变化时触发。任务只在工作区激活存活期间运行；错过的 tick 不补发，停用或重载时全部停止。

## 文件（导入器之外）

任何插件都可以使用 `app.files.pick`、`pickDirectory`、`readText`、`readBytes`、`stream`、`list` 与 `write`。句柄不透明、绑定当前激活与进程，不可持久化。写入先到宿主临时文件，再 rename 进用户选择的目录；上限为 16 MiB 收集读取、256 MiB 流与写入、八个并发写入。流程结束时用 `app.files.release(...)` 释放句柄。
