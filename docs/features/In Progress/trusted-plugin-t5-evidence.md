# T5 公开开发验收证据（阶段汇总）

日期：2026-09-13（Asia/Singapore）  
状态：**T5 七批工程实现全部落地并通过本仓门禁；T5 尚未退出。** 退出条件（[§10](trusted-plugin-platform.md)：四类完整流程及开发体验目标有记录，限制与支持范围公开明确）中"限制与支持范围公开明确"的文字与门禁已齐备，但"有记录"依赖五个只能在本仓 Linux 环境之外完成的外部动作：npm 发布、文档站部署到真实域名、样例包上传 R2、macOS x64 运行、外部作者真人试用。每项的运行步骤与空结果表都已写在对应证据文件，填满后本文状态改为"T5 退出"。

## 批次与产物

| 批 | 交付 | 门禁（本仓已跑） | 外部待办 |
| --- | --- | --- | --- |
| T5-1 npm 发布 | `packages/create-plugin`（`create-ghostboard-plugin` 0.1.0，四模板依赖 `@ghostboard/sdk@^0.1.0`、`ghostboard-plugin` bin）；`packages/plugin-sdk/package.json` 补 `license` / `repository` / `publishConfig`；`.github/workflows/publish-sdk.yml`（`sdk-v*` tag，provenance）；`verify-templates.ts` 改为 tarball 安装门禁 | `bun run test:plugin-templates` 通过（SDK 与 create-plugin 各 `bun pm pack` → 临时目录安装 → 四模板测试 + `bun run package`）；`test:plugin-t5-compat` 通过 | 确认 npm org `@ghostboard`；打 `sdk-v0.1.0` tag |
| T5-2 兼容策略 | [trusted-plugin-compatibility-policy.md](trusted-plugin-compatibility-policy.md)；`AI_REFERENCE.md` / SDK README Compatibility 节；`scripts/trusted-plugin-t5/verify-compat-docs.ts` | 门禁通过：宿主 1.0.0、SDK 0.1.0、脚手架 0.1.0、模板范围 `>=1.0.0 <2.0.0` 一致 | — |
| T5-3 文档站 | `packages/plugin-docs-site`（Astro `docs` collection、`DocsLayout`、`[...slug]`、`sync-sdk-reference.ts`、`llms.txt` / `llms-full.txt`、en 17 页 + zh 17 页、Paraglide 键、应用到 `react-starter-kit/apps/web` 的 README） | `lib/docs.test.ts` 通过；临时 Astro harness `astro check` / `astro build` / 服务端冒烟通过 | `react-starter-kit` 私有仓不可达：按 README 应用 drop-in，填真实域名并部署 |
| T5-4 公共 HTTPS | [`scripts/upload-plugin-examples.ts`](../../../scripts/upload-plugin-examples.ts)；`T5HostController` / `probeSelection`；`src/mainview/plugins/t5/run.ts`；`scripts/trusted-plugin-t5/run.ts`；[HTTPS 证据](trusted-plugin-t5-https-evidence.md) | dry-run 生成五个签名归档 + descriptor + index 并逐包验签；`t5Host.test.ts` / `probeSelection.test.ts` 通过 | 生成示例作者 key、上传 R2、在 macOS 跑 `bun run test:plugin-t5 --manual-picker` |
| T5-5 平台回归 | 探针 arch 感知；`.github/workflows/plugin-platform-regression.yml`；`release.yml` x64 job 迁移 `macos-15-intel`；[平台证据](trusted-plugin-t5-platform-evidence.md)；PRD §2.14.5 与兼容策略 §6 的 Windows / Linux 不支持声明 | 静态 / 类型检查通过 | 触发 workflow（`arch=x64`），抄录结果 |
| T5-6 作者试用 | [试用协议](trusted-plugin-t5-author-trial.md)；[试用证据模板](trusted-plugin-t5-author-trial-evidence.md) | — | 前置条件齐备后招募 ≥ 2 名作者 |
| T5-7 收口 | 本文；§10 T5 段；development-plan §2.1；PRD §2.14.6 证据标注；追加 1 A5 / A6 状态 | — | 外部待办完成后把各表填满并改状态 |

## 本仓门禁汇总

- `bun run test:plugin-templates`、`bun run test:plugin-t5-compat`：通过。
- `vitest`：`src/bun/plugins/t5Host.test.ts`、`src/bun/plugins/probeSelection.test.ts`、`packages/plugin-docs-site/apps/web/lib/docs.test.ts` 通过；`src/bun` 全部 50 文件中仅 `index.test.ts` 一项因 Linux 容器无 `/private/tmp` 失败，为环境既有问题，与 T5 无关。
- `bun run type-check`、`bun run check`：通过；`scripts/trusted-plugin-t3|t4|t5/run.ts` 与 `scripts/upload-plugin-examples.ts` 单独 `tsc --strict` 通过。
- `bun scripts/upload-plugin-examples.ts --dry-run`：通过。

## 限制与支持范围（已公开的文字）

| 项 | 位置 |
| --- | --- |
| 宿主 / manifest / SDK / 脚手架版本与 `engines.ghostboard` 语义、API 加法承诺、数据兼容（v1 拒绝、canvas `dataVersion` 迁移 + preimage、KV 无迁移、签名 / TOFU） | 兼容策略 §1–§5；`AI_REFERENCE.md` Compatibility；SDK README Compatibility；文档站 Policy → Compatibility |
| macOS arm64 支持、x64 待验证、Windows / Linux 不支持插件系统 | 兼容策略 §6；PRD §2.14.5；文档站 Policy → Supported platforms；`release.yml` 注释 |
| 公共 HTTPS 安装要求、原生 picker、高信任副作用不可撤销、无沙箱 | 兼容策略 §6；文档站 Policy → Supported platforms and limits |
| 应用内 Plugin Guide、市场、Bun Worker 后端不进首版 | 兼容策略 §6；追加 1 §6、§9 |

## 明确保留边界

1. **未退出**：外部五项未完成前，§10、development-plan、PRD §2.14.6 与追加 1 A5 / A6 均只标"工程完成、公开验收待运行"。
2. **npm 包名**：若 `@ghostboard` org 不可用，按计划改为 `@laogui/ghostboard-sdk` 发布；运行时 import map 仍解析 `@ghostboard/sdk`，需在文档写清。
3. **文档站域名**：`react-starter-kit/apps/web` 的 `wrangler.jsonc` / `PUBLIC_APP_ORIGIN` 仍是占位；未填真实域名前"公开"只到 staging，不算 T5 退出。
4. **x64**：只能在 Rosetta 下运行时如实标注，不宣称 Intel 真机通过。
5. **Windows / Linux**、codesign / notarization 之外的项、应用内 Plugin Guide 不进入首版。
