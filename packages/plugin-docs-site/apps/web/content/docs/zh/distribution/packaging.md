---
title: "打包"
description: "产出确定性的可安装归档，只包含运行时文件，用户机器上无需任何工具。"
section: distribution
order: 10
---

## 归档里放什么

只放 GhostBoard 运行时需要的：`manifest.json`、应用入口、相对模块与静态资源。作者文件（`package.json`、测试、`node_modules`、`AGENTS.md`、`README.md`、源 `.ts` / `.tsx`）不进包。生成的 `package` 脚本已经列出了正确的文件：

```jsonc
// 无构建模板
"package": "ghostboard-plugin . --output dist/yourname.hello-0.1.0.ghostboard-plugin --include manifest.json --include app.js --include ui.js"

// React 模板：打包完整的 Vite 输出
"package": "bun run build && ghostboard-plugin dist --output release/yourname.panel-0.1.0.ghostboard-plugin"
```

给无构建项目新增运行时模块或资源时，再加一个 `--include`。提升 `manifest.json` 里的 `version` 时，同步改 `--output` 的文件名。

## 运行

```sh
bun run package
```

打包器校验 manifest、检查入口存在、排序路径、写入 stored ZIP 并原子替换输出。对相同文件运行两次得到字节相同的归档，因此 GhostBoard 审阅步骤显示的 SHA-256 任何持有你源码的人都能复现。

## 像用户一样安装

打开 **设置 → 插件 → 选择插件包…**，选择归档，对照摘要与你的构建，安装、启用并逐个使用每项贡献。然后 **在此工作区停用**，确认没有残留。这是最终用户走的同一条路径，也是验证布局、持久化、原生对话框与重载行为的唯一方式；作者测试不覆盖这些。

## 分发

- **文件**：分享 `.ghostboard-plugin` 归档。用户用 **选择插件包…** 安装。
- **URL**：把归档放在公共 HTTPS 源上并分享直链。用户粘贴到 **插件包 URL** 并点击 **审阅链接**。GhostBoard 带重定向、私网、大小与内容类型检查下载，并显示同样的审阅步骤。

未签名归档适合本地使用与分享，但**不能原地更新**：安装同 ID 的更新版未签名归档会被视为新插件。要发布更新，继续阅读[签名与更新](/zh/docs/distribution/signing-and-updates/)。
