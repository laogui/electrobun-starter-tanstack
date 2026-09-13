# T5 支持平台回归证据（macOS x64）

日期：2026-09-13（Asia/Singapore）  
状态：**x64 回归通道已实现（探针改为 arch 感知、新增 `plugin-platform-regression.yml`、`release.yml` x64 job 迁移到 `macos-15-intel`）；真实 x64 运行需要在 GitHub Actions 或一台 Intel / Rosetta Mac 上手动触发，本仓 Linux 环境无法执行，结果表待填。**

## 支持平台声明

| 平台 | 插件系统 | 依据 |
| --- | --- | --- |
| macOS arm64 | 支持 | T0–T4 packaged 证据；T5 探针 |
| macOS x64 | 待本文结果表填写后宣称支持；Intel 真机与 Rosetta 分别记录，不混称 | 本文 |
| Windows x64 | **不支持插件系统**。`release.yml` 继续构建应用，但装载、import map、宿主服务、安装、更新与恢复未在 Windows 验证 | [兼容策略 §6](trusted-plugin-compatibility-policy.md)、PRD §2.14.5 |
| Linux | **不支持**。无发行矩阵，`release.yml` 不加 Linux job | 同上 |

同一措辞已写入 PRD §2.14.5"支持平台"、[兼容策略 §6](trusted-plugin-compatibility-policy.md)、SDK README / `AI_REFERENCE.md` Compatibility 节与文档站 Policy → Supported platforms 页。

## 本批改动

1. **探针 arch 感知**：[`scripts/trusted-plugin-t3/run.ts`](../../../scripts/trusted-plugin-t3/run.ts)、[`scripts/trusted-plugin-t4/run.ts`](../../../scripts/trusted-plugin-t4/run.ts) 与 [`scripts/trusted-plugin-t5/run.ts`](../../../scripts/trusted-plugin-t5/run.ts) 现在接受 macOS `arm64` / `x64`，按 `process.arch` 定位 `canary-macos-<arch>-GhostBoard-canary.app.tar.zst`，并在证据里写 `arch`。T3 额外把证据复制到 `build/plugin-t3-artifacts/t3-evidence-<arch>.json`，T4 同时写 `t4-evidence.json`（保持既有引用）与 `t4-evidence-<arch>.json`，T5 写 `t5-evidence-<arch>.json` 并记录 `hw.model`、`machdep.cpu.brand_string`、`sysctl.proc_translated`（Rosetta 时为 `1`）与 macOS 版本。
2. **`macos-13` 已退役**：GitHub 于 2025-12 关闭 `macos-13` 镜像；仍引用它的 job 会直接失败。[`release.yml`](../../../.github/workflows/release.yml) 的 x64 job 改为 `macos-15-intel`（GitHub 最后一代 x86_64 hosted runner，可用至 2027-08）。`release.yml` 头部注释写明插件系统只在 macOS arm64 / x64 验证、Windows 只发应用、不加 Linux。
3. **新增 [`plugin-platform-regression.yml`](../../../.github/workflows/plugin-platform-regression.yml)**（`workflow_dispatch`）：`plan` job 根据输入 `arch`（`both` / `arm64` / `x64`）生成矩阵；`probes` job 在 `macos-14`（arm64）与 `macos-15-intel`（x64）上依次跑 `test:plugin-t3-exit-fixtures` → `test:plugin-t3` → `test:plugin-t4` → `test:plugin-t5 --base-url=<examples_base_url>`（可用 `run_t5=false` 跳过），先用 `sysctl` 记录机器型号 / CPU / `proc_translated` 到 `machine.txt`，最后把 `build/plugin-t*-artifacts/*.json`、各阶段 app 日志与 `picker-log.jsonl` 打包为 artifact `plugin-platform-evidence-<arch>`（保留 90 天）。每个探针自行构建带探针 renderer 的 canary，因此这些构建永不发布。

为什么不"下载 release.yml 的 x64 归档再跑探针"：release 构建的 renderer 没有 `VITE_PLUGIN_T*` 探针入口，也不应该有；探针必须由自己的 `vite build` 注入。因此 x64 证据来自与 arm64 完全相同的探针流水线在 Intel runner 上重跑，而非发布产物本身。发布产物的 x64 可安装性仍由 `release.yml` 的 x64 job 覆盖。

## 运行步骤

1. GitHub → Actions → **Plugin platform regression** → Run workflow：`arch=x64`（或 `both`），`examples_base_url` 指向已发布样例（T5-4），样例未发布时 `run_t5=false`。
2. 下载 artifact `plugin-platform-evidence-x64`，从 `machine.txt` 抄录 `hw.model` / `cpu` / `proc_translated`，从 `t3-evidence-x64.json`、`t4-evidence-x64.json`、`t5-evidence-x64.json` 抄录归档 SHA-256 与各阶段 `checks` 数。
3. 若在本地 Intel Mac 或 Apple Silicon 上的 Rosetta 终端（`arch -x86_64 zsh`，Bun 需为 x64 版本）运行，命令相同：`bun run test:plugin-t3 && bun run test:plugin-t4 && bun run test:plugin-t5 --manual-picker`，并把 `proc_translated=1` 如实记为 Rosetta。
4. 结果写入下表并同步 [兼容策略 §6](trusted-plugin-compatibility-policy.md) 与文档站 Policy 页的 x64 状态。

## 结果

| 项 | macOS x64 |
| --- | --- |
| 运行方式（GitHub `macos-15-intel` / 本地 Intel 真机 / Rosetta） | 待填 |
| `hw.model` / CPU / `proc_translated` / macOS 版本 | 待填 |
| canary x64 归档 SHA-256 | 待填 |
| T3 exit：local / restart / download 检查数 | 待填 |
| T4：safe-mode / safe-recovery / update / migration 检查数 | 待填 |
| T5：install / restart 检查数（picker 阶段仅本地人工） | 待填 |
| 与 arm64 结果的差异 | 待填 |

## 明确保留边界

1. **未运行即未支持**：结果表为空时，兼容策略与文档站必须继续写"macOS x64 待验证"，不得因为 CI 配置存在而宣称支持。
2. **Rosetta ≠ Intel 真机**：GitHub `macos-15-intel` 是 Intel 硬件；本地 Apple Silicon 上的 Rosetta 运行只证明 x64 二进制在翻译层可用，需在表中单列。
3. **Windows / Linux**：本阶段不做任何插件验证，也不改 `release.yml` 的 Windows job 行为；两者在所有公开文档中固定为"未验证、不支持插件系统"。
4. **GitHub x86_64 退役**：`macos-15-intel` 于 2027-08 退役后，x64 回归需要自托管 Intel runner 或降级为"不再验证"，届时需重新评估支持声明。
