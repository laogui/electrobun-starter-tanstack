---
title: "命令"
description: "注册带可选快捷键的菜单项，把行为放在一个函数里，并尊重激活生命周期。"
section: guides
order: 10
---

命令是最小的插件：一个 `manifest.json` 加一个 JavaScript 文件。

```js
import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  setup(app) {
    app.commands.register({
      id: 'tidy-titles',
      title: 'Tidy selected titles',
      shortcut: 'Mod+Shift+T',
      enabled: () => !app.signal.aborted,
      run: () => tidyTitles(app),
    });
  },
});
```

## 经验法则

- **ID 是插件本地的 kebab-case。** 宿主按插件 ID 加命名空间，两个插件都可以有 `open-summary`。
- **宿主快捷键优先。** 文本编辑与内置快捷键优先于插件快捷键；把快捷键当作便利，而不是唯一入口。输入法组合、按键重复以及当前焦点上下文已占用的按键都不会到达你的命令，其中包括作用于选中核心节点的画布按键——例如主题（Topic）被选中或正在编辑标题时的 `Tab`、`Enter` 与 `F2`——所以优先使用带 `Mod` 的组合键，并始终保留菜单入口。
- **一个行为一个函数。** 把真正的工作放进函数，再从命令、面板按钮和测试里调用。
- **注册是暂存的。** `setup` 里的所有注册只在 `setup` 成功后发布。重载失败时旧命令继续可用。
- **清理自己的资源。** `app.commands.register` 返回 disposer，也可以用 `app.onCleanup` 添加任意清理。清理在插件重载、停用或工作区关闭时按逆序执行且只执行一次。
- **尊重 `app.signal`。** 把它传给 `fetch`、存储与内容调用，让长操作在激活退役时停止。

## 一条修改 Notes 的命令

```js
async function tidyTitles(app) {
  const selected = await app.selection.get({ signal: app.signal });
  const updates = selected
    .filter((note) => note.revision !== null)
    .map((note) => ({
      id: note.id,
      expectedRevision: note.revision,
      changes: { title: note.title.trim().replace(/\s+/g, ' ') },
    }));
  if (updates.length === 0) return;
  await app.content.updateMany(updates, {
    label: 'Tidy titles',
    operationId: `tidy-${Date.now()}`,
    signal: app.signal,
  });
}
```

`app.selection.get()` 只返回选区背后的 Notes，因此当选区里还有主题、Folder 或图片时，返回的条目会少于用户实际选中的数量。需要告诉用户哪些被跳过时，使用 `getPlacements()`。

更新按 `expectedRevision` 做 compare-and-swap：如果用户在此期间编辑了某条 Note，该项会可见地失败而不是覆盖。批次记录在工作区历史里，用户在画布视图激活时可用普通撤销快捷键撤销，插件也可以之后调用 `app.content.undo(batchId)`。见[笔记、存储与事件](/zh/docs/guides/content-and-storage/)。

## 测试

```js
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';

const fake = createFakeHost({ pluginId: 'yourname.tidy', workspaceId: 'w1' });
await plugin.setup(fake.app);
await fake.harness.behavior.runCommand('tidy-titles');
await fake.harness.lifecycle.dispose();
```
