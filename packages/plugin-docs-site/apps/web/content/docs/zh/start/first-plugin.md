---
title: "15 分钟完成第一个插件"
description: "生成一个命令 + 面板插件，作为开发目录连接，边改边热重载，在无应用环境测试并打包。"
section: start
order: 20
---

目标：一个带一条命令和一个面板的插件，在 GhostBoard 中运行、通过测试并打包。下面的时间节点假设你已安装 GhostBoard 与 Bun。

## 1. 生成项目（2 分钟）

```sh
bunx create-ghostboard-plugin hello-plugin
cd hello-plugin
bun install
```

`bun install` 只拉取 `@ghostboard/sdk`，它提供 TypeScript 声明、单文件 `AI_REFERENCE.md`、用于测试的 fake host 以及 `ghostboard-plugin` 打包器。这些都不会交付给最终用户。

你现在有：

```text
hello-plugin/
├── manifest.json   # id、version、engines.ghostboard、入口
├── app.js          # definePlugin({ setup })，含一条命令和一个面板
├── ui.js           # 可编辑的 Button/Input/Surface 助手，使用 --gb-* 主题变量
├── app.test.js     # 基于 @ghostboard/sdk/testing 运行
├── AGENTS.md       # 指引编码代理阅读 SDK 参考
└── package.json    # bun test、bun run package
```

打开 `manifest.json`，把 `id` 改成唯一的点分形式，例如 `yourname.hello`。以 `ghostboard.` 开头的 ID 是保留的。

## 2. 在 GhostBoard 中运行（3 分钟）

1. 打开 **设置 → 插件 → 连接开发目录…**，选择 `hello-plugin/`。
2. 审阅目录身份并点击 **连接目录**，然后 **为此工作区启用** 并确认高信任说明。
3. 打开插件菜单，运行 **Open Hello panel**。面板出现并显示你的工作区 ID。

连接只是登记目录；代码在你启用时才加载。

## 3. 边改边重载（3 分钟）

修改 `app.js` 里的面板文字：

```js
import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  setup(app) {
    app.commands.register({
      id: 'open-hello',
      title: 'Open Hello panel',
      shortcut: 'Mod+Shift+H',
      run: () => app.panels.open('hello'),
    });
    app.panels.register({
      id: 'hello',
      title: 'Hello',
      mount(element) {
        const heading = document.createElement('h2');
        heading.textContent = `Hello from ${app.pluginId} in ${app.workspaceId}`;
        element.append(heading);
        return () => heading.remove();
      },
    });
  },
});
```

保存。已启用的插件自动重载：旧注册被清理，新注册被发布。如果新代码在 import 或 `setup` 中抛错，旧版本继续运行，插件菜单显示带文件与行号的错误。你注册的内容会在重载或停用时按逆序清理；在面板挂载元素之外创建的 DOM 不会。

## 4. 无需 GhostBoard 的测试（2 分钟）

```sh
bun test
```

`app.test.js` 创建一个 fake host，运行 `setup`，检查已注册的命令与面板 ID，并触发命令。fake host 不复现布局、持久化、原生对话框或平台行为；它只用于逻辑。

## 5. 打包（2 分钟）

```sh
bun run package
```

它会写出 `dist/<id>-<version>.ghostboard-plugin`，只包含 `manifest.json`、`app.js` 与 `ui.js`——即 `package` 脚本里列出的 `--include` 文件。归档是确定性的（相同输入得到相同 hash），并且从不执行你的代码。通过 **设置 → 插件 → 选择插件包…** 安装它，体验最终用户流程。

## 6. 下一步（3 分钟阅读）

- 添加 React 面板：[面板](/zh/docs/guides/panels/)，或用 `--react` 生成。
- 读写 Notes：[笔记、存储与事件](/zh/docs/guides/content-and-storage/)。
- 发布更新：[签名与更新](/zh/docs/distribution/signing-and-updates/)。
- 让编码代理继续：项目里的 `AGENTS.md` 指向 `node_modules/@ghostboard/sdk/AI_REFERENCE.md`，与 [SDK 参考](/zh/docs/reference/sdk/) 是同一份文本。
