# T5 公共 HTTPS 样例与发行包探针证据

日期：2026-09-13（Asia/Singapore）  
状态：**样例发布脚本、T5 宿主路由、renderer 探针与运行器已实现并通过静态 / 单元门禁；公共 R2 上传与 macOS packaged 运行需要 R2 凭据、示例作者 key 与一台 macOS 机器，本仓 Linux 环境无法执行，结果段留空待真实运行填写。**

## 本批做了什么

T3 / T4 的下载证据只用探针专属 loopback HTTP(S)，且宿主路由显式传 `allowLoopback: true`。T5 把"公开可安装"变成真的：

1. **公共样例包**：[`scripts/upload-plugin-examples.ts`](../../../scripts/upload-plugin-examples.ts)（`bun run plugin:examples`）用 `create-ghostboard-plugin` 脚手架出四个模板，改写 manifest 的 `version` / `engines.ghostboard` / `publicKey` / `update.url`，用公开 packer `buildPluginPackage` 以项目示例作者 key（`GHOSTBOARD_EXAMPLE_SIGNING_KEY`，Ed25519 PKCS#8 PEM）签名，生成：
   - `plugins/examples/<id>/<version>/<id>-<version>.ghostboard-plugin`（`application/zip`，走 CDN 缓存）；
   - `plugins/examples/<id>/releases.json`（`ghostboard-plugin-release/v2`，必须 bypass cache）；
   - `plugins/examples/index.json`（全部归档、SHA-256、宿主范围、示例公钥、SDK 版本，bypass cache）。
   
   `example.hello` 发布 `0.1.0` 与 `0.1.1` 两个版本，其余三个（`example.react-hello`、`example.csv-importer`、`example.combined`）各一个版本。React 模板走 `bun install` + `bun run build` 产出 `dist/`，其余三个直接取模板运行时文件。复用 [upload-r2.ts](../../../scripts/upload-r2.ts) 的 S3 客户端与环境变量（`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`，前缀 `R2_EXAMPLES_KEY_PREFIX`，默认 `plugins/examples/`）。`--dry-run` 只在 `build/plugin-examples/` 生成产物并使用一次性 key（`index.json` 里 `ephemeralKey: true`），不上传。

2. **T5 宿主路由** [`src/bun/plugins/t5Host.ts`](../../../src/bun/plugins/t5Host.ts)：只在 `GHOSTBOARD_PLUGIN_T5_DIR` 存在时挂载，`/plugin-t5/config` 返回运行器写入的 `examples.json`（要求 `https://` base 且所有 URL 位于 base 之下），`/prepare-url` 与 `/prepare-update` 直接调用 `PluginManagementService.prepareFromUrl` / `prepareUpdate`，**不传 `allowLoopback`**，因此走与生产 renderer RPC 完全相同的 HTTPS / 重定向 / 私网地址 / 大小 / 内容类型 / ZIP / 签名校验。`/select` 只在脚本化 picker 模式写入 `selected.csv`；`/picker-note` 把人工 picker 步骤追加到 `picker-log.jsonl`；`/report` 写 `result-<phase>.json` 并脱敏 bearer token。安全模式 startup guard 与 T4 一样保持开启，renderer 完成后必须确认 `startup-ready`。

3. **picker 脚本化收敛** [`src/bun/plugins/probeSelection.ts`](../../../src/bun/plugins/probeSelection.ts)：把 T3 的 `selected.csv` 替代逻辑抽成纯函数。T3 目录、或 T5 目录且 `GHOSTBOARD_PLUGIN_T5_PICKER !== 'manual'` 时返回脚本化选择；其余一律走 Electrobun 原生 `openFileDialog`。目录选择从不脚本化。

4. **renderer 探针** [`src/mainview/plugins/t5/run.ts`](../../../src/mainview/plugins/t5/run.ts)（`VITE_PLUGIN_T5=1`）三阶段：
   - `install`：按 `example.hello → example.react-hello → example.csv-importer → example.combined` 顺序从公共 URL preview（要求 `signatureStatus: 'verified'`、`source.kind: 'url'`、label 以 `https://` 开头、digest 等于 `index.json` 的 SHA-256）→ commit（停用、`stored`）→ enable → running；断言每个模板恰好注册其应有贡献（hello / react-hello：1 命令 + 1 面板；csv-importer：1 导入器；combined：1 命令 + 1 面板 + 1 画布类型 + 1 导入器）；逐类操作：DOM 面板与 React 面板通过命令打开、点击计数按钮到 `Count: 1`、关闭后 DOM 清理；`example.combined/counter` 画布实例创建、放置、点击持久化为 `Counter: 1`、删除并保存 manifest；脚本化 picker 下 CSV 导入器 suggested mapping、2 条预览、commit、rollback；最后通过公共 `releases.json` 把 `example.hello` 从 `0.1.0` TOFU 更新到 `0.1.1`（preview 绑定 currentVersion / 版本 / 签名 / HTTPS 源，commit 保留 `previousVersion`），启用后命令仍可运行。
   - `restart`：同一 app-data 再启动，四包按各自版本恢复 running、贡献数不变、列表全部 `verified`、`example.hello` 仍保留 `previousVersion: 0.1.0`，面板再走一次。
   - `picker`（`--manual-picker`）：`GHOSTBOARD_PLUGIN_T5_PICKER=manual`，两次启动 CSV 导入会话：第一次真人在原生对话框中选择运行器写好的 `manual-picker-sample.csv`，探针记录选择耗时、文件名 / 大小、预览条数并取消；第二次真人按取消，探针确认会话被清空且导入器仍在运行。步骤提示由宿主写入 `picker-log.jsonl`，运行器实时转发到终端。

5. **运行器** [`scripts/trusted-plugin-t5/run.ts`](../../../scripts/trusted-plugin-t5/run.ts)（`bun run test:plugin-t5`）：只接受 macOS `arm64` / `x64`，拒绝 loopback / 私网 base；先在运行器进程内 `fetch`（`redirect: 'error'`）公共 `index.json`、每个归档与每个 `releases.json`，比对 SHA-256 与 schema，写 `examples.json`；然后 `vite build` + `electrobun build --env=canary`（或 `--skip-build` 复用 `build/plugin-t5-artifacts/canary-macos-<arch>-GhostBoard-canary.app.tar.zst`），解包 launcher 依次跑 `install` / `restart`（/ `picker`），把 `sysctl hw.model`、`machdep.cpu.brand_string`、`sysctl.proc_translated`（Rosetta）、macOS 版本、归档 SHA-256、下载记录与各阶段报告写到 `build/plugin-t5-artifacts/t5-evidence-<arch>.json`。

## 已通过的门禁（本仓环境）

- `bun scripts/upload-plugin-examples.ts --dry-run`：四个样例、五个归档、四个 `releases.json` 与 `index.json` 生成成功；临时脚本用 `verifyPluginDirectorySignature` 逐包核对 SHA-256 与 Ed25519 签名全部通过。
- `vitest`：`src/bun/plugins/t5Host.test.ts`（inventory 校验、无 `allowLoopback` 的 prepare 调用、manual 模式禁用脚本选择、picker 记录、报告脱敏）与 `src/bun/plugins/probeSelection.test.ts` 通过。
- `bun run type-check`、`bun run check` 通过；`scripts/trusted-plugin-t5/run.ts` 与 `scripts/upload-plugin-examples.ts` 单独 `tsc --strict` 通过。

## 待真实运行填写

以下步骤需要 R2 凭据、示例作者 key 与 macOS 机器，按顺序执行后把结果写回本节：

1. 在安全位置生成并保存示例作者 key：`bun packages/plugin-sdk/package-plugin.js --generate-key ./example-author.pem`（或复用已有 key；换 key 会让已安装示例的更新被 TOFU 拒绝）。
2. `GHOSTBOARD_EXAMPLE_SIGNING_KEY=./example-author.pem R2_… bun run plugin:examples`，确认 Cloudflare Cache Rule 对 `plugins/examples/*/releases.json` 与 `plugins/examples/index.json` bypass。
3. 在 macOS arm64 上 `bun run test:plugin-t5 --manual-picker`，按终端提示完成一次选择、一次取消。
4. 记录：`index.json` 摘要与 `publicKey`、canary 归档 SHA-256、`install` / `restart` / `picker` 三份报告的检查数、人工 picker 的耗时与结果、机器型号与是否 Rosetta。
5. 同一归档在 macOS x64 上重复第 3 步（见 [T5 平台证据](trusted-plugin-t5-platform-evidence.md)）。

| 项 | 结果 |
| --- | --- |
| 公共 `index.json` URL / 生成时间 | 待填 |
| 示例作者公钥（`ed25519-spki:`） | 待填 |
| canary 归档 SHA-256（arm64） | 待填 |
| `install` 报告检查数 | 待填 |
| `restart` 报告检查数 | 待填 |
| `picker` 报告：选择耗时 / 文件 / 预览条数；取消耗时 | 待填 |
| 运行机器（`hw.model`、Rosetta） | 待填 |

## 人工原生 picker 走查（关闭 T3 保留边界 2）

走查脚本固定为以下步骤，运行器每步都会把提示打印到终端并把时间戳写入 `picker-log.jsonl`：

1. 运行器写 `manual-picker-sample.csv`（一行表头 `title,text,color` + 一条数据）到证据目录并打印路径。
2. 探针调用 `startImporterSession('example.csv-importer', 'notes-csv')`，宿主因 `GHOSTBOARD_PLUGIN_T5_PICKER=manual` 走真实 `Utils.openFileDialog`（只允许 `.csv`，起始目录 `~/Documents`）。
3. 真人在对话框中导航到证据目录并选择样例文件。探针等待会话离开 `selecting`（最多 5 分钟），断言 `file` 非空，运行 `inspectFields` → `prepare` 得到 1 条预览，记录耗时 / 文件名 / 大小后取消会话。
4. 探针再次打开导入会话，真人按 **取消**。探针断言 `importSession` 归零、导入器仍处于 running，记录耗时。
5. 两个结果写入 `result-picker.json` 的 `manualPicker.select` / `manualPicker.cancel`，随 `t5-evidence-<arch>.json` 保存。

预期结论：取消不留下残留会话或文件句柄；选择路径与脚本化路径进入同一 `inspectFields` / `parse` / preview 事务，脚本化只替换了对话框本身。

## 明确保留边界

1. **本环境未运行**：Linux 容器没有 macOS、Electrobun 原生壳、R2 凭据或示例 key，所以本文没有真实公共下载、TOFU 更新或人工 picker 结果；上表为空即表示未验收，不得据此宣称 T5-4 通过。
2. **CDN 缓存**：`releases.json` / `index.json` 若被缓存，更新检查会看到旧版本；这是部署配置，不由探针证明。
3. **示例 key 的信任范围**：示例作者 key 只为 `example.*` 四个 ID 背书；文档已提示作者不要复用这些 ID。
4. **codesign / notarization**：运行器记录是否请求签名与 notarization，但 T5 不把它们作为退出条件。
