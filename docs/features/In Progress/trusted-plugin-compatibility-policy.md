# 高信任插件兼容策略与支持范围

日期：2026-09-13（Asia/Singapore）。属于 [高信任插件系统改造方案 §10](trusted-plugin-platform.md#10-实施阶段与退出条件) 的 T5 交付。本文是宿主、SDK、脚手架与文档站共同引用的唯一兼容策略来源；[`scripts/trusted-plugin-t5/verify-compat-docs.ts`](../../../scripts/trusted-plugin-t5/verify-compat-docs.ts) 会校验本文列出的版本号与代码一致。英文摘要随 `@ghostboard/sdk` 的 `AI_REFERENCE.md` 与 README 的 “Compatibility” 节发布，文档站 Policy 页镜像本文。

## 1. 当前版本标识

| 标识 | 当前值 | 来源 | 作用 |
| --- | --- | --- | --- |
| 宿主版本 | `1.0.0` | 根 `package.json` `version`，经 `GHOSTBOARD_VERSION` 暴露 | `engines.ghostboard` 范围检查的被比较值 |
| manifest 版本 | `2` | `PLUGIN_MANIFEST_VERSION` | 唯一被加载的 manifest 契约 |
| SDK npm 版本 | `0.1.0` | `packages/plugin-sdk/package.json`，运行时 `runtime.version` | 作者类型、fake host、packer 与单文件参考 |
| 脚手架版本 | `0.1.0` | `packages/create-plugin/package.json` | `create-ghostboard-plugin` 模板 |
| 模板默认 `engines.ghostboard` | `>=1.0.0 <2.0.0` | 四个模板的 `manifest.json` | 新插件默认宣称的宿主范围 |

## 2. 宿主版本范围（`engines.ghostboard`）

- 字段必填，且必须精确写成 `>=a.b.c <x.y.z` 两段闭合形式；不接受 `^`、`~`、`*`、单边或多段范围。下界必须小于上界。
- 宿主在加载前比较自身版本：不在范围内的包返回 `incompatible-host-api`，不执行任何插件代码，在设置页显示原因，保留安装目录、启用偏好、KV、卡片实例与导入产生的普通资料。
- 推荐作者使用 `>=<首次验证的宿主版本> <下一个宿主 major>.0.0`。当前所有公开 SDK 能力在宿主 `1.0.0` 起可用，因此模板默认 `>=1.0.0 <2.0.0`。
- 宿主不会为了“兼容”静默扩大或忽略作者声明的范围；作者也不应把上界写成远超已验证版本的值来规避检查。

## 3. 宿主 API 兼容承诺

1. **同一宿主 major 内只做加法。** `AI_REFERENCE.md` 列出的 `definePlugin`、commands、panels、storage / events / tasks、content、selection 与 React hooks、canvas types、files、importers、testing、packaging 各节的签名与语义在宿主 `1.x` 内保持可用；新增字段、可选参数与新扩展点不会破坏已发布插件。
2. **破坏性变更只随宿主 major 发生**，并同时发布：新的 `manifestVersion` 或新的默认 `engines` 范围、新 SDK major、新脚手架 major，以及在 `AI_REFERENCE.md` 中标注 “since host x.y” 的迁移说明。旧 major 的插件在新宿主上收到 `incompatible-host-api`，不会被半兼容地加载。
3. **弃用流程。** 计划移除的 API 先在 `AI_REFERENCE.md` 与 SDK README 标注 deprecated 并给出替代，至少经过一个宿主 minor 后才能在下一个 major 移除。
4. **运行时由宿主提供。** import map 解析的 `@ghostboard/sdk`、`@ghostboard/sdk/react`、`react`、`react-dom`、`react-dom/client`、`react/jsx-runtime` 来自当前宿主；npm 上的 `@ghostboard/sdk` 只提供类型、fake host、参考与 packer。作者若使用比 `engines` 下界宿主更新的 API，应同步提高下界；宿主不做运行时 polyfill。
5. **React 版本。** 宿主共享 React / ReactDOM `19.2.x`。插件不得打包第二个 React 实例；React major 升级视为宿主破坏性变更。

## 4. SDK 与宿主版本对应

| `@ghostboard/sdk` | 宿主范围 | `create-ghostboard-plugin` | 说明 |
| --- | --- | --- | --- |
| `0.1.x` | `>=1.0.0 <2.0.0` | `0.1.x` | T1–T4 冻结的全部公开 API；无 Bun 后端入口 |

SDK 的 patch / minor 只修正类型、fake host、参考文本或增加与宿主同步的新 API；SDK major 与宿主 major 一起变化。文档站参考页随 SDK npm 版本同步，页面顶部显示来源版本。

## 5. 数据与更新兼容

- **manifest v1 包**：一律拒绝加载，列表标注“旧契约，需重新安装 v2 版本”，保留其用户数据与画布内容；不存在双运行时。
- **自定义画布类型数据**：`dataVersion` 上升时对当前加载实例做带旧 revision 的惰性迁移；迁移前保存 preimage，备份失败则不迁移；降级、无迁移或冲突不覆盖原数据；设置页可显式恢复最近一层 preimage。
- **持久 KV**：`storage.app` / `storage.workspace` 目前没有版本迁移 API；插件必须在自己的值里携带版本并自行兼容旧值。这是已知限制。
- **笔记内容事务**：revision 校验、批次 intent 与回执由宿主拥有；历史文件格式（v2 / v3）由宿主管理，旧宿主拒绝读取更新的历史而不是部分恢复。
- **签名与更新**：未签名包可安装但不接受原地更新；已签名包首次安装固定 `publicKey` 与规范化 `update.url`，之后同 ID 更新必须版本前进、同 key、同来源，否则拒绝并提示“作者密钥已变更”。release 文档 schema 为 `ghostboard-plugin-release/v2`，每条记录带 `version`、`url`、`sha256` 与该版本适用的 `ghostboard` 范围，最多 50 条、1 MiB；宿主只选择与自身版本兼容的最高版本。
- **代码回退**：registry 原子保存 current + 一个 previous；回退前重验旧代码，回退与数据恢复都保持插件停用。
- **卸载**：默认只移除代码，不删除卡片内容、KV、导入结果或已修改的普通资料；永久删除是独立确认操作。

## 6. 支持范围

| 项目 | 状态 | 依据 |
| --- | --- | --- |
| macOS arm64 | 支持：T0–T4 发行包证据，T5 探针按 [T5 计划](trusted-plugin-t5-evidence.md) 运行 | §10 各批记录 |
| macOS x64 | 待验证：由 `release.yml` `macos-13` 产出 canary 并运行 T3 exit / T4 / T5 探针后才宣称支持；Rosetta 与 Intel 真机分别记录 | [T5 平台证据](trusted-plugin-t5-platform-evidence.md) |
| Windows x64 | 不支持插件系统：应用可构建，但装载、import map、宿主服务、安装与恢复未在 Windows 验证 | 本文 |
| Linux | 不支持：无发行矩阵 | 本文 |
| URL 安装来源 | 仅公共 HTTPS；拒绝 loopback、私网解析地址、非 ZIP 内容、超限响应与不安全重定向 | `urlInstall.ts` |
| 原生文件 / 目录选择 | 由 Electrobun 原生 picker 提供；自动化通过证据专用路由；真人选择 / 取消在 T5 证据中记录 | T3 exit 边界 2 |
| 高信任代码副作用 | 插件对挂载点以外 DOM、外部系统或直接 `fetch` 的副作用不保证可撤销，需要时提示重新加载窗口 | PRD §2.14.4 |
| 应用内 Plugin Guide、市场、Bun Worker 后端 | 不在首版 | 追加 1 §6、§10 T6+ |

未列出的平台或来源一律视为未支持；文档站不得把“可构建”写成“已验证”。

## 7. 变更流程

1. 任何版本号、范围、平台状态或 API 冻结面的变化先改本文与代码，再更新 `AI_REFERENCE.md` / README 的 Compatibility 节，最后同步文档站 Policy 页。
2. 运行 `bun scripts/trusted-plugin-t5/verify-compat-docs.ts`：校验本文 §1 的版本值与根 `package.json`、SDK、脚手架、模板 manifest 一致，模板范围包含当前宿主版本，并且 `AI_REFERENCE.md` 与 README 声明的 SDK 版本与范围相同。`publish-sdk.yml` 在发布前执行同一检查。
3. 对外承诺只写已运行的证据；未运行的平台或来源在本文 §6 标注“待验证 / 不支持”。
