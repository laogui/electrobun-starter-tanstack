# T3 退出：四类独立最终用户包

日期：2026-09-12（Asia/Singapore）。

状态：**T3 现行退出条件已在 macOS arm64 canary 发行包通过。** 命令、面板、canvas type 和 CSV importer 分别来自四个独立 `.ghostboard-plugin` 包；最终用户运行路径不读取作者源码、SDK 副本、测试、`package.json`、`node_modules` 或构建工具。公共外网 HTTPS、人工原生 picker 与 Windows / Linux 没有被本记录冒充为已验证，具体边界见下文。

## 四个独立包

所有包均由 `packages/plugin-sdk/package-plugin.js` 公开工具构建，相同输入连续打包两次字节一致，并由生产 `loadPluginFromZip` 解析。最终包只包含运行期文件：

| 包 | 唯一贡献 | Runtime 文件 | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `t3.exit.command` | command `record` | `app.js`, `manifest.json` | 820 | `9fb0399104dd4301be669dc25c1ad3ea63c5f1f522c529fc01da32877434b68f` |
| `t3.exit.panel` | panel `status` | `app.js`, `manifest.json` | 1,013 | `b6e8f7d5ef5f276877eb834a6e9440ea03e321f0d6fd880f279d4ab72b184212` |
| `t3.exit.canvas` | canvas type `counter` | `app.js`, `manifest.json` | 1,551 | `9029e9bfa0e1e66afc66847fcdf469d261f42d0f1dc9ce8be7578915efa4ec65` |
| `t3.exit.importer` | importer `notes-csv` | `app.js`, `csv.js`, `manifest.json` | 2,434 | `1c5f6bfcccd337790250740ecc4f651e03f39684f281ee9673656ff7a94e810a` |

`bun run test:plugin-t3-exit-fixtures` 对每个源码目录执行 `bun install --ignore-scripts` 与无应用作者测试，之后才生成最终包。安装依赖只用于作者测试，不进入 archive。每个 fake host 测试还断言该样例没有注册其余三类贡献。

## 发行包最终用户路径

`bun run test:plugin-t3` 构建并解开真实 canary 应用，然后启动其中的 `GhostBoard-canary.app/Contents/MacOS/launcher`。canary 归档为 `build/plugin-t3-artifacts/canary-macos-arm64-GhostBoard-canary.app.tar.zst`，SHA-256 为 `88933890f4d565be5321fd4a5dc7da4fa553ec14fc47258896228f094224e231`；本轮未请求签名或 notarization。

四包在应用中的共同验收：

1. 从包执行 prepare / preview，核对插件 ID、来源、未验证签名状态与 manifest capability；preview 阶段不执行入口。
2. commit 后包处于 `stored` 且禁用；只有显式 enable 后才激活。
3. 四个插件同时运行，每个插件恰好发布自己的一类贡献，其余三类计数为零。
4. 逐个 disable command、panel、canvas、importer；目标贡献退出时另外三包保持注册。随后逐个 re-enable，证明包级生命周期隔离。
5. 同一 workspace / app-data root 重启后，四包重新激活，命令与面板仍可执行；组合 importer 创建的 Notes 与持久 undo / redo 同时回归通过。

具体用户行为均在真实 WebView / 宿主 RPC / 磁盘路径完成：

| 类型 | 发行包验证 |
| --- | --- |
| Command | 运行 `t3.exit.command/record`，插件可观察计数只增加一次。 |
| Panel | 直接打开 `t3.exit.panel/status`，真实 DOM panel 显示 `Independent panel is running`；close 后挂载内容清理。 |
| Canvas type | 发布规范 ID `t3.exit.canvas/counter`；宿主创建 instance 和 placement，React 卡片渲染并从 0 点击到 1，保存后摘要为 `Independent count: 1`，最后清理 placement。 |
| CSV importer | 通过宿主文件 handle 预览一条 CSV Note，确认后进入内容服务；再用同一 operation ID 撤销，Note 被移除。 |

## 三阶段结果

| 阶段 | App-data | 结果 | 覆盖 |
| --- | --- | --- | --- |
| `local` | 独立本地 root | 49 / 49 checks PASS | 四包 file prepare / commit / enable、四类真实行为、四次隔离 disable/re-enable；继续回归组合包的无效输入、205 条分段、丢响应重试、冲突安全回滚、画布放置及解析中停用。 |
| `restart` | 与 `local` 相同 | 11 / 11 checks PASS | 四包恢复、命令 / 面板可用；组合包 Note 持久化、undo、Library 刷新与 redo。 |
| `download` | 独立下载 root | 30 / 30 checks PASS | 四包和组合包的同字节 URL prepare / commit / enable、四类行为、隔离 disable/re-enable 与 preview cancel。 |

组合回归包也改为使用公开 packer，不再依赖系统 `zip` / `unzip`。其三文件 archive 保持 7,564 bytes、SHA-256 `8189a6bd48a27ac08d57cd3836994452783341ef03d4b519c2239629de9c9cd0`。

## 门禁

| 命令 | 结果 |
| --- | --- |
| `bun run test:plugin-t3-exit-fixtures` | PASS；四个作者测试、连续两次确定性打包、生产 loader 与精确文件清单。 |
| `bun x vitest run src/bun/plugins/t3Host.test.ts` | PASS；2 tests，覆盖 allowlist 文件 / URL 路由、未知包拒绝、选择 fixture 与报告脱敏。 |
| `bun run type-check` | PASS；项目无诊断，依赖中的 29 条诊断按既有 runner 规则忽略。 |
| `bun run check` | PASS；721 files，无修复。 |
| `bun run test:plugin-t3` | PASS；真实 macOS arm64 canary 三阶段 49 + 11 + 30 checks。 |
| `bun run test -- --maxWorkers=1` | PASS；220 files / 2,011 tests，138.10 s；既有 jsdom navigation / media 输出为非失败噪声。 |

## 保留边界

1. **公共 HTTPS**：下载阶段使用只在 T3 探针环境中开启的 loopback HTTP。它证明下载所得包字节进入与生产 URL 安装相同的 prepare / preview / commit / enable / activation 事务，但不证明某个公共外网服务的 TLS、DNS、CDN 或可用性。公开 renderer RPC 不传 `allowLoopback`，正常产品路径仍只接受公共 HTTPS，并继续执行重定向、解析后私网地址、响应大小、内容类型与 ZIP 校验。本仓没有已发布的公共插件 artifact；本次没有借用 R2 凭据或擅自创建外部对象。
2. **原生 picker**：自动化通过证据专用宿主路由指定 package 与 CSV 文件，不冒充鼠标操作系统文件框。普通启动仍使用 Electrobun 原生 picker；人工选择 / 取消应在 T5 支持平台回归中留记录。
3. **平台**：发行包结果只覆盖 macOS arm64。确定性 packer 不依赖系统 zip，不能替代 Windows / Linux 的真实构建、原生 picker、路径、WebView 与安装回归；这些归 T5 支持平台验收。
4. **信任与签名**：四包仍是 `unverified` 高信任前端代码。安全模式、作者密钥、TOFU 更新、失败更新、代码回退和数据迁移恢复属于 T4，未因 T3 退出而提前完成。
5. **外部作者体验**：fixture 自动化证明公开 SDK / packer 契约，不证明新作者可在 15 分钟内完成插件。A6 文档站镜像与外部真人作者试用仍属于 T5。

在这些显式范围内，T3 表格定义的退出条件——四类样例从独立包安装、最终用户机器无需开发工具、完整 files / 大批量恢复边界公开且有证据——已经满足。下一实施阶段是 T4 故障、安全模式、签名与更新。
