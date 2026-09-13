---
title: "不启动 GhostBoard 的测试"
description: "用内存 fake host 与 React 测试助手写作者测试，并了解哪些只能由打包后的应用验证。"
section: distribution
order: 30
---

`@ghostboard/sdk/testing` 让你的 `setup` 在内存 fake host 上运行，作者测试无需安装 GhostBoard。每个模板都附带一个这样的测试；用 `bun test` 运行。

```js
import { afterEach, expect, test } from 'bun:test';
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';

let fake;
afterEach(async () => {
  await fake?.harness.lifecycle.dispose();
  fake = undefined;
});

test('registers and runs the command', async () => {
  fake = createFakeHost({ pluginId: 'yourname.hello', workspaceId: 'test' });
  await plugin.setup(fake.app);

  expect(fake.harness.inspection.commands.map(({ id }) => id)).toEqual(['open-hello']);
  await fake.harness.behavior.runCommand('open-hello');
  expect(fake.harness.inspection.openPanels).toEqual(['hello']);
});
```

## harness 表面

| 区域 | 成员 |
| --- | --- |
| `inspection` | `commands`、`panels`、`canvasTypes`、`importers`、`tasks`、`openPanels`、`generation`、`signal`、`cleanupCount` |
| `behavior` | `runCommand`、`runTask`、`inspectImporterFields`、`parseImporter`、`emit`、`setSelection`、`abort` |
| `files` | `addText`、`addBytes`、`addDirectory`、`queuePick`、`queueDirectory` |
| `lifecycle` | `reload(factory)`（原子重载语义：失败的候选保留旧代际）与 `dispose()` |

存储、事件与任务是同一接口的内存实现，因此你可以在运行命令后断言 `app.storage.workspace.get(...)`、发出 `content.changed` 并检查响应、或用 `runTask` 推进一个 `at` 任务。

## React 面板

```tsx
import { renderPanel } from '@ghostboard/sdk/testing/react';

const { getByText } = renderPanel(definition, { context: fake.app });
```

`renderPanel` 用 Testing Library 渲染组件面板并注入 SDK hooks 的假实现，所以 `useSelectionState` 会反映 `harness.behavior.setSelection(...)`。

## fake 不做什么

fake host 不复现 GhostBoard 布局或 CSS、磁盘持久化、真实 RPC 与原生对话框、多插件仲裁、包安装与签名校验、WebView 行为或平台差异。发布前，在 GhostBoard 中安装你打包的归档，逐项使用每个贡献、停用插件并重启应用。
