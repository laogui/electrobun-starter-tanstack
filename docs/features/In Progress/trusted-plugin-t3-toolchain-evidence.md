# T3 第五批：作者打包与模板工具链

日期：2026-09-12（Asia/Singapore）。

状态：**实现与自动化门禁已通过。** 本批交付可安装包构建命令、独立 importer 模板、四贡献组合模板和单文件 AI SDK 参考，并让既有 T3 发行 fixture 使用同一公开 packer。它不把公共外网 HTTPS、人工原生 picker、Windows / Linux、外部真人作者试用或 T4 签名标记为完成，因此不是 T3 整阶段退出证据。

## 作者路径

`plugin:create` 保持原有默认 JavaScript 与 `--react` 调用兼容，并新增两个互斥模式：

```sh
bun run plugin:create ../hello-plugin
bun run plugin:create ../react-plugin --react
bun run plugin:create ../csv-importer --importer
bun run plugin:create ../combined-plugin --combined
```

四种模板均包含本地 SDK 副本、无应用作者测试、`AGENTS.md` 和 `bun run package`。默认 JavaScript / React 模板继续覆盖 command + panel；importer 模板覆盖宿主字段映射、单批与 101–5,000 条显式分段；combined 模板在一个无构建包中同时注册 command、panel、canvas type 和 importer。

## 可安装包命令

`@ghostboard/sdk` 新增自包含 `package-plugin.js`，根仓命令为 `bun run plugin:pack -- <runtime-directory> ...`，外部模板直接通过复制的 SDK 执行。命令接收完整 runtime 目录；当无构建源码与作者文件共处根目录时，也可使用重复 `--include` 明确 runtime 文件。

构建器行为：

1. 只读取普通文件，不执行插件入口、依赖安装或 lifecycle script；拒绝 symlink、越界 / 绝对 / NUL / 反斜杠路径和非普通文件，UTF-8 文件名使用 ZIP UTF-8 标志保留。
2. 文件名使用稳定字节序排序，写入无压缩、零时间字段的确定性 ZIP；相同 runtime 字节连续两次产生相同 archive SHA-256。
3. 与当前安装器对齐最多 256 个文件和 8 MiB uncompressed 限制；要求根级 `manifest.json` 为 v2 且打包集合包含其 `entrypoints.app`。
4. 输出仅接受 `.ghostboard-plugin` / `.zip`，先写同目录临时文件再 rename；完整目录模式禁止把输出放回输入目录，显式 include 模式允许模板写入根下 `dist/`。
5. 输出明确标记 `unsigned (T4 signing is not implemented)`。签名、作者密钥和 TOFU 更新没有偷偷并入 T3。

现有 `scripts/trusted-plugin-t3/verify-fixture.ts` 已移除对系统 `zip` / `unzip` 的依赖，改为调用公开 SDK packer，并用生产 `loadPluginFromZip` 检查最终三文件包。

## 单文件 AI 参考

`packages/plugin-sdk/AI_REFERENCE.md` 随 SDK 发布并复制到每个模板的 `sdk/`。它无需外链即可读取完整的信任模型、manifest/package 约定、activation 生命周期、commands、panels、storage/events/tasks/workers、content、selection/React hooks、canvas types、files、importers、testing、packaging 和交付 checklist；每个主要扩展点包含类型签名与最小示例。

模板根级 `AGENTS.md` 明确指向这份文件和相邻 `.d.ts`，区分 runtime 与 author-only 文件，并要求新增模块 / 资产同步更新 package include。A6 的 SDK / 模板侧单文件交付已具备；文档站镜像与“外部作者仅凭该参考在 15 分钟内完成首个插件”的真人试用仍属于 T5，不能以模板自动化代替。

## 自动化证据

| 门禁 | 结果 | 覆盖 |
| --- | --- | --- |
| `bun run test:plugin-templates` | 4 种模板全部通过 | create、作者依赖 `--ignore-scripts` 安装、无应用测试、React type-check/build、连续两次确定性打包、生产 ZIP loader 解析、精确 runtime-only 文件清单、模板 AGENTS → AI reference 路由 |
| `bun run test:plugin-t3-fixture` | 通过；7,564 bytes，SHA-256 `8189a6bd48a27ac08d57cd3836994452783341ef03d4b519c2239629de9c9cd0`，只含 `app.js`、`csv.js`、`manifest.json` | 既有四贡献独立 fixture 的作者测试与公开 packer / 生产 loader 组合 |
| `bun run type-check` | 通过 | 根脚本、模板 verifier 与现有项目类型；依赖中的 29 条诊断仍由仓库 runner 按既有规则忽略 |
| `bun run check` | 通过；702 files，无修复 | Ultracite / Biome 全仓静态检查 |
| `bun run test -- --maxWorkers=1` | 220 files / 2,011 tests 通过 | 全量串行 Vitest 回归；jsdom 的 navigation / media `not implemented` 输出为既有非失败噪声 |

模板构建器对连续相同输入产生以下稳定结果：

| 模板 | Runtime 文件 | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| JavaScript | `app.js`, `manifest.json`, `ui.js` | 2,520 | `605aa4482daa0c68ef094132936a5efe665addb7c054aab60ebb25b44b73b34f` |
| React | `app.js`, `app.js.map`, `manifest.json` | 5,599 | `9e5aa5c7a5587273598cddaf89f976b4d001eed9671d4b2158ab37b79026ef15` |
| Importer | `app.js`, `csv.js`, `manifest.json` | 5,700 | `dffeeed461482872e784e85d8ebc45adb88dfa1ef492c898a25663ea8143b0cd` |
| Combined | `app.js`, `manifest.json` | 6,801 | `9abca983b696e39fc0977f8dcfccaa7b1df093e81f400280fb7842b49d8bc8bf` |

这些 hash 是当前模板的可重复性证据，不是签名或作者身份。修改模板 runtime 字节会按预期改变 hash。

## 明确保留边界

1. packer 做快速结构检查；最终兼容范围仍由安装器的完整 closed-schema manifest 解析决定。自动化使用生产 loader 验证所有生成包。
2. Stored ZIP 优先确定性与零依赖，不承诺压缩率；当前 8 MiB uncompressed 上限使最坏包体仍有明确边界。
3. 模板测试 fake host 不提供真实 RPC、磁盘事务、原生 picker、WebView 或多插件仲裁；这些仍由发行包证据负责。
4. 当前 T3 本机证据是 macOS arm64；Windows / Linux 尚未运行。模板 packer 不依赖系统 zip，但这不等于两个平台已验收。
5. 公共外网 HTTPS 生产来源尚未验证。既有回环 HTTP 只由探针显式允许，正常产品路径仍要求公共 HTTPS。
6. 后续 [T3 退出验收](trusted-plugin-t3-exit-evidence.md) 已使用本公开工具链完成命令、面板、CSV importer、canvas type 四个独立安装包的最终用户验证；公共 HTTPS / picker / 平台边界保持显式，不回写成本批当时已经覆盖。
7. `AI_REFERENCE.md` 已可作为文档站的单文件来源，但本仓当前未包含文档站发布流水线；镜像发布状态继续由 T5 验收记录确认。
