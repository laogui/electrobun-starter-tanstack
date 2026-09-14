---
title: "支持平台与限制"
description: "哪些平台与安装来源经过验证，以及 GhostBoard 对高信任插件明确不承诺的行为。"
section: policy
order: 20
---

GhostBoard 只对在发行包上实际运行过的内容宣称支持。此处未列出的一律视为不支持。

## 平台

| 平台 | 插件支持 | 依据 |
| --- | --- | --- |
| macOS，Apple Silicon（arm64） | **支持。** 装载、import map、宿主服务、安装、更新、回退与安全模式已在发行包上验证。 | 发行验证 T0–T4、T5 |
| macOS，Intel（x64） | **待验证。** 发行包存在；在宣称支持前会发布插件验证记录，并说明运行在 Intel 真机还是 Rosetta 下。 | T5 平台记录 |
| Windows x64 | **不支持插件。** 应用可为 Windows 构建，但插件装载、安装与恢复未在 Windows 验证。 | — |
| Linux | **不支持。** 无发行矩阵。 | — |

## 安装来源

- **本地归档**：`.ghostboard-plugin` 或 `.zip`，通过原生文件对话框选择。
- **URL**：仅公共 `https://`。回环与私网地址（包括 DNS 解析或重定向之后）、URL 中的 userinfo、非 ZIP 响应、超大下载与 HTML 页面都会被拒绝。
- **开发目录**：通过原生目录对话框连接；启用时加载，变更时重载。
- 原生文件 / 目录对话框是 macOS 系统对话框；GhostBoard 不实现自己的选择器。

## 运行时与数据限制

| 区域 | 限制 |
| --- | --- |
| 安装包 | 256 个文件、8 MiB 未压缩、无符号链接 |
| 内容批次 | 每事务 1–100 项；`getMany` 最多 500 个 ID |
| 导入器 | 单批 1–100 条 Notes；分段 2–50 段 × 1–100 条（最多 5,000）；100 个可检查的唯一字段 |
| 文件 | `readText` 默认 1 MiB（最多 16 MiB）、`readBytes` 16 MiB、`stream` 256 MiB、写入 256 MiB、8 个并发写入、每次选择 16 个文件、目录每页 100 项 |
| release 文档 | 1 MiB、50 条 release、8 KiB notes |
| 存储 | JSON 值；除工作区磁盘外无容量保证 |

## GhostBoard 不承诺什么

- **没有沙箱。** 插件在应用渲染进程中以完全访问权限运行。声明的 capabilities 是给用户的信息，不是强制。签名证明作者身份的连续性，不证明安全或真实身份。
- **不回滚任意副作用。** 已注册的命令、面板、订阅、任务与被跟踪的 worker 在停用或重载时清理。挂载点之外的 DOM 改动、直接 `fetch`、通过 SDK 写入的文件以及任何其他外部效果都不会撤销；GhostBoard 可能提示用户重新加载窗口。
- **挂载点之外的宿主 DOM 是私有的**，任何渲染都可能改变它。修改它不受支持。
- **fake host 不是应用。** 作者测试不验证布局、持久化、对话框、安装、签名校验或平台行为。
- **旧 ES module 闭包**可能在反复的开发重载中留在内存里；内存或重复行为成问题时重新加载窗口。
- **混合撤销历史**（原生画布变化与插件批次交错）按工作区与视图存在，不跨重启；按批次 ID 的显式 `app.content.undo/redo` 可以。
- **宿主自有的画布结构没有 API。** 宿主自带的核心节点类型不对插件开放扩展。具体来说，没有任何公开方式读写主题（Topic）标题、创建子主题、改变分支父级或顺序、干预主题排布，或订阅主题结构变化；主题只会作为 `content: null` 的 placement 出现在[选区](/zh/docs/guides/content-and-storage/#没有内容记录的-placement)中，`app.content` 也始终[只覆盖 Notes](/zh/docs/guides/content-and-storage/#note-快照)。为绕过这一点去读宿主 store 或 DOM 不受支持，且可能在任何版本失效。若将来开放，会作为新 SDK 版本中的加法 API 发布，并在[参考](/docs/reference/sdk/)中标注 “since host x.y”。
- **本版本没有 Bun 或原生后端入口**、没有逐 capability 审批 UI、没有应用内插件指南、没有市场。
