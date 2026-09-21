# T4 Progress

## 2026-09-12

- 接到“进入 T4 工作”。
- 读取 `planning-with-files` 技能并检查工作区；初始 `git status --short` 与 `git diff --stat` 无输出。
- 搜索仓库 T4 引用，确认当前目标为公开插件平台的故障、安全模式、签名、更新与恢复阶段。
- 创建 T4 的 `task_plan.md`、`findings.md` 与 `progress.md`；Phase 1 开始。
- 提取现行方案 §3、§8、§10–§12 的 T4 约束与退出条件，记录到 findings。
- 建立插件相关源码清单，确定 manifest、install store、management、host controller、runtime startup、settings UI 和 packer 是 T4 核心落点。
- 阅读 manifest、安装事务、管理服务、host controller 与 renderer 启动实现，记录当前单版本假设、完整性 quarantine、旧 generation 保留规则和安全模式的 host-side 时序要求。
- 核对应用启动、renderer RPC、panel error boundary 与本地化入口；确定安全模式必须在 Bun host descriptor 生成前生效，且不应破坏设置中的插件管理能力。
- Phase 1 完成；将 T4 拆为四批并进入 Phase 2 的启动安全模式实现。
- 复核 `PluginRuntime.sync()`、host controller/runtime/UI 测试结构；冻结第一批为持久 startup marker + host safe mode + renderer ready handshake + 设置恢复入口。
- 已新增 `PluginStartupGuard` 及单元测试，host controller 支持安全模式空 descriptor 和 `/plugins/startup-ready`，renderer 在初始 activation 完整 settled 后发送一次 ready handshake，并扩展相邻测试。
- 首次六文件聚合 Vitest 无输出挂起后已中止，改为逐文件定位；`safeMode.test.ts` 4/4、`hostController.test.ts` 12/12 通过。
- `startPluginRuntime.test.ts` 6/6 通过；PluginsPanel 首跑 8/10，通过输出定位并修复重复成功文案与旧断言。
- PluginsPanel 复跑 10/10 通过；renderer RPC 12/12 通过（预期的非 Electrobun/故障路径 stderr 保留）。
- 最终定向串行回归 6 files / 104 tests 通过；`bun run check` 通过（723 files）。
- 全量串行回归 `bun run test -- --fileParallelism=false --maxWorkers=1` 通过（221 files / 2019 tests）；仅输出仓库既有 jsdom navigation/media 未实现噪声，无失败。
- 最终 `bun run type-check` 与 `bun run build:canary` 通过；记录 T4 安全模式第一批证据，并将现行方案/开发计划更新为“T4 实施中，不是阶段退出”。
- 进入签名/TOFU 批次；阅读确定性 packer、runtime tree digest、manifest/install 测试并拟定包内签名 envelope 与 canonical payload。
- 最终代码后再次通过定向 6 files / 105 tests、类型检查、静态检查，以及全量串行 221 files / 2020 tests；证据数字已同步。
- 用户要求继续；恢复 Phase 3 计划与工作树，开始签名/TOFU 手动更新批次。
- 复核 manifest、release parser、确定性 packer 和安装 store；确定将作者签名摘要与安装后完整性摘要分离，避免包内 envelope 的自引用。
- 冻结手动签名升级的 registry 策略：每 ID 仍只暴露一个活动条目，签名升级原子替换 registry 条目并保留旧目录；TOFU 身份同时写入 journal 以支持崩溃恢复。
- 新增严格 public key 语法、签名 envelope/canonical payload、签名树摘要与 Ed25519 验证模块及测试；首轮测试发现测试 key fixture 重复包装 KeyObject，已按错误原因修正。
- 签名协议与 manifest 定向测试 2 files / 28 tests 通过；开始把验证身份持久化进 install journal/registry 并开放受控的同 ID 手动升级。

## 2026-09-13

- 安装事务、管理 UI 与 T3 相邻回归 4 files / 50 tests 通过；preview/列表已区分 verified 与 unsigned，升级后当前工作区不会自动执行新 digest。
- 新增 packer `--generate-key` / `--sign`、私钥目录泄漏防护、manifest key 匹配和确定性 envelope，并补真实 CLI → host 安装交叉测试。
- packer 测试首跑因测试局部变量遮蔽全局 `process` 导致 3 项失败；安装/密码学其余 24 项通过，已修正测试句柄命名。
- packer 异步子进程复跑 60 秒无输出后已中止；单独 CLI 探针成功生成 mode 0600 的 Ed25519 私钥和规范化公钥。交叉测试改为显式 Bun `spawnSync`，避免 Vitest 内管道生命周期挂起。
- Vitest 的 Bun 全局不含 `which()`；同步测试启动器改用已由 CLI 探针确认的 `process.execPath`。
- Vitest 的 Bun 兼容层也不含 `spawnSync`；达到第三次夹具失败后停止子进程方案，新增 packer 函数声明并改成公开函数 → host 安装的直接交叉测试。
- packer 公开函数交叉测试 1 file / 3 tests 通过：确定性签名归档可被宿主验证安装，覆盖 key 覆盖拒绝、key 不匹配、私钥目录泄漏和缺少 `--sign`。
- 更新 SDK README、单文件 AI reference 和四类作者模板说明，公开 key 生成、签名、TOFU、key 丢失与 unsigned 边界。
- 首次 type-check 定位 4 个局部问题：Bun/Node Buffer 类型边界 2 项、T3 探针旧 `unverified` 状态 2 项；已改为 Uint8Array 与 `unsigned`。
- type-check 复跑通过（仅忽略既有 29 项 Electrobun node_modules 诊断）；首次静态检查报告 11 项机械格式/排序/简化问题，开始按 Biome 规则收口。
- Biome safe write 修复 6 个签名相关文件；全量 `bun run check` 通过（727 files）。
- 行为审查补强 registry 损坏恢复与 prepare→commit 替换窗口：重建只选择每 ID 最新已验证版本，commit 对 staging 内容变化 fail closed 并清理事务。
- 新增失败路径后定向 3 files / 29 tests 通过；Biome 另发现恢复代码 4 个 `let` 的显式类型缺失，已补类型。
- `bun run check`（727 files）与 type-check 复跑通过；增加 management service 的签名升级/重新确认执行端到端测试。
- 签名/TOFU 相关定向回归 7 files / 84 tests 通过；全量串行回归 223 files / 2037 tests 通过，仅有既有 jsdom navigation/media 噪声。
- `bun run build:canary` 与 `git diff --check` 通过；构建保留既有大 chunk、未 codesign/notarize、无 baseUrl 提示。
- Phase 3 的作者签名、TOFU 手动更新与密钥变化拒绝子项完成；下一步进入固定 release descriptor 与 current/previous 代码回退。
- 固定 release descriptor 与代码回退批完成：descriptor 和 ZIP 共用 HTTPS/SSRF/重定向/流式大小限制，选中版本必须同时匹配 release 版本、SHA-256、manifest 与 TOFU 作者身份。
- registry 现保存一个 current 与一个 previous；更新保留旧目录、清除工作区 enablement，回退前重验旧目录签名/身份/树摘要并原子切换，回退后仍停用。
- 修复恢复语义：完整 registry 为用户选择的权威状态，旧 installed journal 只补 registry 缺项，不会在重启后撤销显式回退；registry 损坏重建会恢复最新 current 与次新 previous。
- 设置 UI/RPC 增加“检查更新”和“将代码回退到上一版本”；更新仍走 preview/confirm，回退后需要重新审阅启用。
- 本批定向回归 6 files / 89 tests、全量串行 223 files / 2044 tests、`bun run check`（727 files）和 type-check 通过；全量仅有既有 jsdom navigation/media 噪声。
- 画布实例迁移现在在 `dataVersion` 上升前保存 host-owned preimage；备份失败阻止迁移且保留 live record。设置页经二次危险确认可先写 current restore guard，再以新 revision 恢复最新一层迁移前 state/presentation，并保持插件停用。
- 迁移恢复综合定向 9 files / 119 tests 通过；最终全量串行 223 files / 2048 tests 通过，仅有既有 jsdom navigation/media 噪声。
- 最终 `bun run check`（728 files）、type-check、`git diff --check` 与 macOS arm64 canary 构建通过；保存 T4 machine-readable result 与 update/recovery evidence。Phase 3 实现完成，Phase 4 packaged 多次启动退出验收仍待执行。
- 新增 T4 专用 packaged runner 与 renderer probe：使用公开 packer 生成同 key 的 1.0.0/1.1.0/1.2.0 包及换 key 包，实际启动 canary launcher 四次覆盖 safe-mode、safe-recovery、update、migration。首次运行发现测试 HTTPS server 错把 releases.json 当目录导致 404，修正为独立 base URL 后重跑通过。
- T4 packaged 退出验收通过：四次 macOS arm64 启动、34 项检查全通过，证明显式安全模式与下一次正常恢复、同 key descriptor 更新、换 key/坏摘要拒绝、current/previous 代码回退、迁移 revision-conflict 失败保持 live data、迁移 preimage 显式恢复和停用边界。机器报告见 `build/plugin-t4-artifacts/t4-evidence.json`；Phase 3/4 已收口，T4 退出，下一步为 T5。

## 2026-09-18 — Canvas drag performance

- Inspected route, store, drag/snapping hooks, repulsion, extension rendering and persistence. Existing edits preserved.

- Implemented no-op identity preservation in repulsion/group highlighting/store, awake-pair traversal, render-data reuse, coordinate-insensitive content memo, shared Topic index, peripheral memo boundary and closed-panel subscription gating.
- 244 targeted tests passed; 77 route/library/search tests passed including closed-panel React Profiler checks and fresh data when reopening.
- Type-check passed after correcting Topic test fixture to spread typed data into a Record. Initial full lint passed.
- Validation errors: attempted HMR startup found existing port 5173; reused running server. Browser instrumentation was reset by HMR during edits, so repeated after edits. Search test insertion initially used wrong describe casing; corrected exact marker. A shell glob matched no styles files; narrowed rg to source tree.
- Full suite running; browser pointer measurement pending.

- Full regression: 237 files / 2255 tests passed. Final type check, lint (764 files), and diff whitespace checks passed.
- Browser: exact Vite module URL was needed to inspect the live store; unversioned imports created a separate diagnostic store. Initial demo dragging intersected a group, so the final smoke test used two isolated cards. Mouse drag produced progressively updated coordinates, release grid-snapped to (24,168), dragging=false; remote card stayed at (1200,100). No redundant repulsion coordinate updates during movement; release still publishes cleanup updates.
- Removed the generated Paraglide runtime change caused by type-check compilation. Original user edits preserved.
- Added docs/features/canvas-drag-performance.md with findings, benchmark methodology, validation and limits. All phases complete.
