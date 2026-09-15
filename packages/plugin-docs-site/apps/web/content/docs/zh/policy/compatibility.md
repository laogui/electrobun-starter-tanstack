---
title: "兼容策略"
description: "宿主、manifest、SDK 与脚手架版本之间的关系，宿主 major 内什么保持稳定，以及数据与更新如何保持兼容。"
section: policy
order: 10
---

本页是 GhostBoard 兼容策略的公开镜像。两者不一致时以仓库文档为准，并更新本页。

## 当前版本

| 标识 | 值 | 作用 |
| --- | --- | --- |
| GhostBoard 宿主 | `1.0.0` | 与 `engines.ghostboard` 比较的值 |
| manifest 版本 | `2` | 唯一会被加载的 manifest 契约 |
| `@ghostboard/sdk` | `0.1.1` | 作者类型、fake host、打包器、单文件参考；也是 `runtime.version` |
| `create-ghostboard-plugin` | `0.1.0` | 模板 |
| 模板默认 `engines.ghostboard` | `>=1.0.0 <2.0.0` | 新插件声明的范围 |

## 宿主版本范围

`engines.ghostboard` 必须精确为 `>=a.b.c <x.y.z`。范围外的宿主报告 `incompatible-host-api`，不执行任何代码，并保留已安装文件、启用偏好、存储、画布卡片与导入的 Notes。使用 `>=<你验证过的首个宿主> <下一个宿主 major>.0.0`；当前所有 SDK API 自宿主 `1.0.0` 起存在，因此模板声明 `>=1.0.0 <2.0.0`。宿主永远不会扩大或忽略你的范围。

## API 承诺

1. **宿主 major 内只做加法。** [SDK 参考](/zh/docs/reference/sdk/)中的一切在宿主 `1.x` 内保持签名与语义。可能出现新字段、可选参数与扩展点；已有插件继续工作。
2. **破坏性变更只随新宿主 major**，并与新 SDK major、新脚手架 major、新的默认 `engines` 范围或 manifest 版本、以及参考中的 “since host x.y” 说明一起发布。旧插件在新 major 上得到 `incompatible-host-api`，而不是半工作的加载。
3. **弃用**在参考中至少提前一个宿主 minor 宣布并给出替代，才会在下一个 major 移除。
4. **宿主提供运行时。** `@ghostboard/sdk`、`@ghostboard/sdk/react` 与 React/ReactDOM 19.2.x 来自正在运行的 GhostBoard 的 import map。npm 包只是作者工具。若使用更新宿主引入的 API，请提高下界。
5. **React major 升级是宿主破坏性变更。** 永远不要打包自己的 React。

## SDK ↔ 宿主对应表

| `@ghostboard/sdk` | 宿主 | `create-ghostboard-plugin` | 说明 |
| --- | --- | --- | --- |
| `0.1.x` | `>=1.0.0 <2.0.0` | `0.1.x` | 完整的 T1–T4 API；无 Bun 后端入口 |

`0.1.1` 是纯文档 patch：不新增任何 API，只记录既有 selection、commands 与 canvas API 在宿主自有核心节点类型（如主题）旁边的行为。模板固定的 `^0.1.0` 已接受该版本，无需改动 manifest 或 `engines` 范围。

SDK 的 patch / minor 修正类型、fake host 或参考，或与宿主同步新增 API。SDK major 随宿主 major 变化。本文档站的参考页由固定的 SDK 版本生成，页面顶部显示该版本。

## 数据与更新兼容

- **manifest v1 包**被拒绝并提示，数据保留。没有双运行时。
- **画布卡片状态**：`dataVersion` 上升时在宿主备份之后惰性迁移；降级、缺少迁移与冲突永不覆盖数据；用户可在设置中恢复最近备份。
- **存储**：没有版本迁移 API；自行给值加版本。
- **Note 事务**：revision、批次 intent 与回执由宿主拥有；历史文件格式由宿主管理，旧宿主拒绝读取更新的历史而不是部分恢复。
- **签名更新**：未签名包不能原地更新；签名更新必须版本前进并保持固定的密钥与 URL。release 文档使用 `ghostboard-plugin-release/v2`，每条 release 带 `ghostboard` 范围与 SHA-256；宿主选择最新的兼容 release。
- **代码回退**保留当前与一个上一版本，切换前重新校验；回退与数据恢复都保持插件停用。
- **卸载**只移除代码。

哪些已验证、哪些没有，见[支持平台与限制](/zh/docs/policy/support-and-limits/)。
