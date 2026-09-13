---
title: "示例安装包"
description: "用公开工具链构建的四个已签名、可安装的示例插件，通过 HTTPS 托管，用于 URL 安装与更新检查。"
section: distribution
order: 40
---

`create-ghostboard-plugin` 生成的四个模板也以已签名、可安装归档的形式发布。它们就是 GhostBoard 自身发行验证从公共 HTTPS 源安装的包，因此你可以在发布自己的插件前，用它们试验 URL 安装、更新检查与回退。

| 示例 | 贡献 | 安装包 URL |
| --- | --- | --- |
| Hello（JavaScript） | 命令 + DOM 面板 | `https://dl.ghostboard.app/plugins/examples/example.hello/0.1.0/example.hello-0.1.0.ghostboard-plugin` |
| React Hello | 命令 + React 面板 | `https://dl.ghostboard.app/plugins/examples/example.react-hello/0.1.0/example.react-hello-0.1.0.ghostboard-plugin` |
| CSV Importer | 字段映射 + 分段导入器 | `https://dl.ghostboard.app/plugins/examples/example.csv-importer/0.1.0/example.csv-importer-0.1.0.ghostboard-plugin` |
| Combined | 命令、面板、画布类型与导入器 | `https://dl.ghostboard.app/plugins/examples/example.combined/0.1.0/example.combined-0.1.0.ghostboard-plugin` |

每个示例的 release 文档位于 `https://dl.ghostboard.app/plugins/examples/<id>/releases.json`，manifest 的 `update.url` 指向那里。`example.hello` 同时发布了 `0.1.0` 与 `0.1.1`，因此安装第一个 URL 后点击检查更新即可走一次真实的签名更新。摘要列在 `https://dl.ghostboard.app/plugins/examples/index.json` 中，并与对同一 SDK 版本的未修改模板运行 `bun run package` 得到的归档一致。

## 试一试更新流程

1. 把安装包 URL 粘贴到 **设置 → 插件 → 插件包 URL** 并点击 **审阅链接**，然后安装并启用。
2. 点击 **检查更新**。存在更新的示例 release 时，GhostBoard 会用固定的示例密钥校验并交给你审阅；否则报告已是最新。
3. 更新后，**将代码回退到 …** 恢复上一个示例版本。

示例由 GhostBoard 的示例作者密钥签名。该密钥只为示例包背书；不要把它们的插件 ID 用于你自己的作品。

如果上面的 URL 返回 404，说明该版本的示例包尚未发布。每个示例的源码就是 `create-ghostboard-plugin` 包里对应的模板。
