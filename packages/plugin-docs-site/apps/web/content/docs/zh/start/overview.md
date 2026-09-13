---
title: "什么是 GhostBoard 插件"
description: "由你显式安装并启用的高信任 JavaScript，配合宿主提供的 SDK 操作笔记、画布、文件与面板。"
section: start
order: 5
---

GhostBoard 是一块本地优先的空间画布，用来整理笔记与研究资料。**插件**是普通的 JavaScript，运行在应用的渲染进程里，享有与应用相同的信任。没有沙箱、逐项权限提示或市场审核：由你决定安装哪些插件，并在阅读高信任说明后按工作区逐个启用。

## 插件可以贡献什么

| 贡献 | 用户看到的 | 模板 |
| --- | --- | --- |
| **命令** | 插件菜单里的一项，可带快捷键 | 默认 |
| **面板** | 用 DOM 或宿主共享的 React 渲染的侧边视图 | 默认、`--react` |
| **自定义画布类型** | 一种新的卡片，持久化自己的状态、可迁移数据、可搜索 | `--combined` |
| **导入器** | 宿主拥有的“选文件 → 映射字段 → 预览 → 确认”流程，产出 Notes | `--importer`、`--combined` |

所有插件还能在带 revision 校验的事务中读写 Notes，订阅内容与选区变化，按应用或按工作区保存 JSON 键值数据，在工作区激活期间调度任务，并通过宿主读写用户选定的文件与目录。

## 宿主提供什么

- 通过 import map 提供 `@ghostboard/sdk`、`@ghostboard/sdk/react`、`react`、`react-dom`、`react-dom/client` 与 `react/jsx-runtime` 的运行时。无构建插件就是一个 `manifest.json` 加若干 JavaScript 文件；用户机器上不安装、不编译任何东西。
- 公开主题变量（`--gb-*`），让你的界面无需引入宿主组件即可匹配浅色 / 深色模式。
- 已连接开发目录的自动重载；重载失败时旧版本继续运行。
- 确定性打包、Ed25519 作者签名、固定更新来源、代码回退、数据迁移备份与启动安全模式。

## 你需要什么

- **macOS 上的 GhostBoard 1.0.0 或更高版本**（Apple Silicon 有发行包证据；Intel 待验证）。Windows 与 Linux 目前不支持插件。见[支持平台与限制](/zh/docs/policy/support-and-limits/)。
- **Bun 1.2+** 用于作者工具链：`bunx create-ghostboard-plugin`、作者测试与 `bun run package`。Node 20+ 也能完成脚手架，但生成的脚本默认使用 Bun。
- 基础 Web 知识。React 可选；默认模板是纯 JavaScript。

接着阅读 [15 分钟完成第一个插件](/zh/docs/start/first-plugin/)。
