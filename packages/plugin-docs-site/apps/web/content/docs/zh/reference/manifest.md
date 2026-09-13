---
title: "manifest.json（v2）"
description: "封闭的 manifest v2 schema 的每个字段、校验规则，以及被拒绝时的行为。"
section: reference
order: 20
---

```json
{
  "manifestVersion": 2,
  "id": "yourname.notes",
  "name": "Example Notes",
  "version": "0.1.0",
  "engines": { "ghostboard": ">=1.0.0 <2.0.0" },
  "entrypoints": { "app": "app.js" },
  "capabilities": ["files"],
  "author": "Your Name",
  "description": "Imports notes from CSV files.",
  "publicKey": "ed25519-spki:MCowBQYDK2VwAyEA...",
  "update": { "url": "https://example.com/plugins/yourname.notes/releases.json" }
}
```

schema 是**封闭的**：未知字段会被拒绝，拼写错误会立刻暴露。

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `manifestVersion` | 是 | 必须为 `2`。`1` 是已废弃的沙箱契约；这类包会以“旧契约，需重新安装 v2 版本”拒绝，数据保留。 |
| `id` | 是 | 第三方插件 ID，小写段以点分隔（例如 `yourname.notes`）。`ghostboard.*` 保留。ID 同时为画布类型、存储与命令加命名空间。 |
| `name` | 是 | 用户可见名称。 |
| `version` | 是 | Semver。同 ID 更新必须递增。 |
| `engines.ghostboard` | 是 | 精确为 `>=a.b.c <x.y.z`（两个边界，下界 < 上界）。不接受 `^`、`~`、`*` 或单边。范围外的宿主报告 `incompatible-host-api` 且不运行代码。`engines` 不得包含其他键。 |
| `entrypoints.app` | 是 | 安全的包内相对 `.js` / `.mjs` 路径，默认导出 `definePlugin(...)`。 |
| `capabilities` | 是 | `network`、`files`、`clipboard` 的数组。作为声明展示给用户；不强制执行。无则写 `[]`。 |
| `author`、`description` | 否 | 审阅步骤中显示的自由文本。 |
| `publicKey` | 否 | `ghostboard-plugin --generate-key` 打印的精确 `ed25519-spki:...` 字符串。要求打包时使用 `--sign`。 |
| `update.url` | 否 | release 文档的公共 HTTPS URL。首次安装时与 `publicKey` 一起固定。 |

## 校验在代码运行之前

GhostBoard 在审阅步骤之前从 ZIP（或已连接目录）解析并校验 manifest，并在每次激活前依据已安装文件的规范摘要再次校验。不再通过校验的包会被停用并提示“插件包文件未能继续通过验证”。

## 包布局

manifest 位于归档根目录或单层包装目录内。其余为相对模块与静态资源。限制：256 个文件、8 MiB 未压缩、无符号链接、无加密或重复条目、无路径逃逸。打包器执行同样的限制。
