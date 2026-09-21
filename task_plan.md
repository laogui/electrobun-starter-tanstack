# Trusted Plugin Platform T4

## Goal

完成公开插件平台 T4：故障与启动安全模式、作者 Ed25519/TOFU 签名更新、原子更新与代码回退、数据迁移失败恢复，并以自动化测试和真实 macOS arm64 canary 验收证明坏插件、坏包、失败更新或密钥变化不会让用户失去插件管理与数据恢复入口。

## Current Phase

### Phase 1: 契约与现状盘点

**Status:** complete

- [x] 提取现行设计中 T4 的完整安全、签名、更新和恢复契约
- [x] 定位安装、启动、启停、持久化、迁移与管理 UI 的代码和测试
- [x] 将 T4 拆成可独立验证的实施批次，并确定第一批切片

### Phase 2: 第一批实现与单元/集成测试

**Status:** complete

- [x] 实现启动状态 marker、显式/自动安全模式和 ready handshake
- [x] 让 host 在安全模式下发布空 descriptor，同时保留管理入口
- [x] 在插件设置中展示安全模式、支持下次启动恢复，并补双语文案
- [x] 增补失败路径与兼容性测试
- [x] 通过相关测试、类型检查和静态检查

### Phase 3: T4 剩余批次

**Status:** complete

- [x] 完成安全模式与故障隔离
- [x] 完成作者签名、TOFU 手动更新与密钥变化拒绝
- [x] 完成更新事务、代码回退与数据迁移恢复

### Phase 4: 发行包验收与文档收口

**Status:** complete

- [x] 在真实 macOS arm64 canary 验证 T4 关键路径
- [x] 保存机器可读结果与证据文档
- [x] 更新现行平台方案和总开发计划状态

## Decisions Made

| Decision | Rationale |
|---|---|
| 本计划中的 T4 以 `trusted-plugin-platform.md` §10 为准 | 仓库中另有画布扩展 gap-closure 的同名 T4，但开发总计划明确指向公开插件安全、签名与更新阶段 |
| 先做契约/代码盘点，再确定第一批实现切片 | T4 涉及启动、持久化、安全与恢复，需避免在未理解现有 T0–T3 不变量时引入不可恢复状态 |
| T4 分为四批：启动安全模式；签名/TOFU 手动更新；更新描述/事务回退；迁移恢复与发行验收 | 每批都能形成端到端失败路径证据，并复用现有安装 journal 与不可变 runtime generation |
| 第一批以 host-side session marker + renderer ready handshake 实现自动安全模式，并保留显式 `--safe-mode` / `GHOSTBOARD_SAFE_MODE=1` 入口 | 单纯 renderer 开关不能阻止第三方代码发布；上次启动未完成 marker 可在插件导致崩溃/挂死后的下一次启动自动恢复管理入口 |
| 签名树摘要排除根 `ghostboard-signature.json`，安装 tree digest 仍覆盖全部文件 | 避免包内签名自引用，同时保留安装后对 envelope 在内的完整落盘防篡改 |
| 手动签名升级继续维持每 ID 单活动 registry 条目，commit 原子替换条目但保留旧目录 | 不破坏现有管理/enablement 单版本假设，并为下一批显式 previous/code rollback 留出恢复材料 |
| registry 保存 current + 一个 previous；正常 registry 是权威状态，完成态 journal 只补缺项 | 支持原子、显式代码回退，并防止重启恢复把已回退的较新版本再次设为 current |
| descriptor 更新复用 ZIP 下载的 DNS/重定向/大小策略，且将 selected version + ZIP SHA + manifest + TOFU 签名四层绑定 | 固定来源本身不足以防止错误或被替换的 release 记录；每一层都必须在用户确认前一致 |
| 代码回退后保持工作区停用，不自动回退数据 | 旧代码未必能读取已经迁移的数据；先保存数据并阻止自动执行，再单独实现显式迁移备份恢复 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| None | 0 | — |
| 更新 findings/progress 时补丁上下文少了一个空格，未应用 | 1 | 读取文件尾部后使用精确上下文重新应用，未重复原失败补丁 |
| UI/RPC/文案组合补丁的 header 空白上下文不匹配，整批未应用 | 1 | 拆成小补丁，先修改类型、imports、state 与函数，再按实际 JSX 上下文插入 UI |
| 六文件聚合 Vitest 超过 2 分钟无输出 | 1 | 中止聚合进程并改用 verbose 逐文件运行；safeMode 与 hostController 共 16 tests 已快速通过，继续定位具体挂起文件 |
| PluginsPanel 定向测试 2 项失败：恢复成功文案重复、旧签名待办断言过期 | 1 | 成功状态只在安全模式 banner 展示一次，并同步测试到新的“后续 T4 批次”文案 |
| Biome 定向检查报告 8 项格式/排序和 1 项不必要的 `role=status` | 1 | 移除 section 上的冗余 ARIA role，并用 Biome safe write 处理机械格式与排序 |
| 搜索 package-plugin 测试时 zsh 将空 glob 当作错误 | 1 | 后续只用 `rg --glob` 或先 `rg --files`，不再把可能为空的 glob 直接交给 shell |
| 签名模块首轮测试 3 项在测试 key fixture 构造时失败 | 1 | `generateKeyPairSync()` 已返回 KeyObject；移除重复 `createPrivateKey/createPublicKey` 包装并直接使用返回值 |
| packer 子进程测试 3 项因局部变量 `process` 遮蔽全局而失败 | 1 | 将局部句柄改名为 `subprocess`，消除 `process.execPath` 的 TDZ |
| 记录 packer 测试错误的首个组合补丁 hunk 格式无效 | 1 | 拆除多余 hunk 标记并用有效的分文件补丁重新应用 |
| packer 异步子进程测试 60 秒无用例输出 | 1 | 中止聚合测试；命令行单独探针证明 CLI/密钥权限正常，测试改用显式 `Bun.which('bun')` + `spawnSync` 避免管道生命周期挂起 |
| 首次中止测试的 `write_stdin` 工具参数引号拼写错误 | 1 | 修正结构化参数后发送 Ctrl-C，测试进程以 130 退出 |
| packer 同步子进程测试使用了 Vitest Bun 全局未暴露的 `Bun.which` | 2 | CLI 探针确认 `process.execPath` 是 Bun；保留 `spawnSync`，改用不再被局部变量遮蔽的 `process.execPath` |
| packer 同步子进程测试确认 Vitest Bun 全局也未暴露 `spawnSync` | 3 | 停止改写子进程夹具；直接导入 packer 的公开函数做 host 交叉测试，真实 CLI 已由独立 Bun 命令探针覆盖 |
| 将 packer 测试改为直接导入的首个补丁因 import 上下文漏掉 `mkdir` 未应用 | 1 | 读取实际文件头后按精确 imports 和函数体拆分应用 |
| SDK 与四模板文档组合补丁因 JavaScript 模板句子上下文不完整而整批未应用 | 1 | 读取四份模板实际段落后用精确完整句重新应用 |
| 签名批首次 type-check 报 4 项：2 个 Buffer 类型不兼容、2 个 T3 旧状态字面量 | 1 | 密码学/测试边界显式转 `Uint8Array`，T3 探针从 `unverified` 同步为 `unsigned` |
| 首次修复 type-check 的组合补丁误写 T3 比较运算符上下文，整批未应用 | 1 | 读取四处实际代码，按现有 `===` 精确替换 |
| 签名批首次 `bun run check` 报 11 项机械格式/排序/简化与顶层正则问题 | 1 | 手动提升两个正则到模块顶层，其余使用 Biome safe write 修复后重跑 |
| 更新恢复补丁格式化时 Biome 报 4 个未显式类型的 `let`（8 条诊断） | 1 | 为 try/catch 外使用的 loaded 与 signature 显式声明 `LoadedPluginDirectory` / `VerifiedPluginSignature` 类型 |
| 迁移恢复 UI 测试的函数内正则触发 Biome `useTopLevelRegex` | 1 | 该断言不需要模式匹配，改为完整警告文案的精确文本断言 |
| management 迁移集成测试调用 instance store 时通用 Node 测试 shim 的 `Bun.file()` 返回 undefined | 1 | 在该测试文件的 beforeEach 中把 `Bun.file` / `Bun.write` 接到临时目录的真实 Node 文件读写，保持生产原子写路径不变 |
| 首次真实 `Bun.write` 测试 shim 未创建原子临时文件的父目录，迁移集成测试 ENOENT | 1 | shim 在 write 前递归创建 `dirname(filePath)`，与 Bun.write 对已有生产目录的行为保持一致 |
| 最终 type-check 认为测试 shim 的 BunFile→Uint8Array 断言类型不重叠 | 1 | 仅在测试适配边界按 TypeScript 建议先转 unknown，再构造 Uint8Array；生产路径不受影响 |
| 首次 T4 packaged 运行的 HTTPS fixture 将 `releases.json` 直接与包文件名拼接，更新请求返回 404 | 1 | 将 descriptor URL 与包下载 base URL 分离；重跑四次启动序列全部通过 |

## Exit Evidence

`bun run test:plugin-t4` 已在 macOS arm64 canary 解包 launcher 上连续完成 `safe-mode`、`safe-recovery`、`update`、`migration` 四次启动退出，共 34 项检查通过。机器结果与包摘要见 `build/plugin-t4-artifacts/t4-evidence.json` 和 `docs/features/In Progress/trusted-plugin-t4-result.json`；T4 已退出，下一阶段为 T5 支持平台与外部作者验收。

## 2026-09-18 — Canvas drag performance

- [x] Trace drag updates, subscriptions, and node identity.
- [x] Reproduce avoidable updates and benchmark collision work.
- [x] Fix confirmed hot paths while preserving existing uncommitted drag changes.
- [x] Run regression tests, type checking, lint and browser validation when available.

## Next Step

Canvas drag performance work complete; report is in docs/features/canvas-drag-performance.md.
