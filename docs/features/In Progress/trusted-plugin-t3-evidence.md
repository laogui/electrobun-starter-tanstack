# T3 第一批：受限 CSV 导入器与最终用户包

日期：2026-09-12（Asia/Singapore；机器结果为 UTC）。

状态：**第一批已通过 macOS arm64 发行包验证；T3 阶段继续实施。** 完整 files、分段导入、通用配置与作者打包工具没有因本批通过而被标记完成。

## 已验收行为

- 正式 SDK 提供只读 `app.files.pick` / `readText`。句柄不暴露绝对路径，绑定 plugin、workspace、activation 与当前进程；严格 UTF-8 文本上限为 1 MiB。
- importer 与 command、panel、canvas type 一样按 activation 动态注册。候选 setup 成功前不发布；reload、停用、工作区退出或 disposer 会清理注册并中止进行中的选择 / 解析。
- Plugin Workbench 提供宿主拥有的单会话流程：文件选择、解析、1–100 条 Note preview、warnings、显式取消与确认。preview 不写 workspace；确认使用一个稳定 operation ID 调用原子 `content.createMany`。
- 确认响应不确定时保留不可变 preview 和原 operation ID。发行包探针让首次请求在宿主实际提交后返回合成传输失败，再次确认命中持久回执，Note 总数与 ID 不重复。
- 导入结果是普通 detached Notes，可在 Library 找回。插件停用不会删除资料；同一 app-data root 重启后，原 batch 的显式 SDK undo / redo 仍保留 Note ID。
- A5 `@ghostboard/sdk/testing` 与 `@ghostboard/sdk/testing/react` 已可供作者在无 GhostBoard 环境检查注册、行为、生命周期和 React 面板。模板测试与组合插件作者测试均使用复制出的独立 SDK 包。

## 独立组合包

`scripts/trusted-plugin-t3/fixture` 是仓库外形态的 manifest-v2 插件源。最终用户包只包含：

1. `app.js`
2. `csv.js`
3. `manifest.json`

包内没有 `package.json`、测试、SDK 副本、React、`node_modules`、构建脚本或生命周期脚本。安装 prepare / preview 不执行入口；commit 后仍禁用，只有用户显式信任并按工作区启用后才加载代码。组合包在一次 activation 中注册一个 command、一个 React panel、一个 canvas type 和一个 CSV importer。

## 发行包验证

命令：`bun run test:plugin-t3`。

驱动构建并解包真实 canary，随后运行三个归档 launcher 进程：

- `local`：从 `.ghostboard-plugin` 文件 prepare / preview / commit / enable；19 项检查覆盖四类贡献、Workbench preview、选择取消、无效 UTF-8、超过 1 MiB、缺 title、超过 100 行、preview 取消零写入、停用中止解析、丢失响应、同 ID retry 去重及 Library 可见性。
- `restart`：复用 local 的 app-data root；7 项检查覆盖工作区 enablement、Note 与 operation 的重启持久化、显式整批 undo、Library 移除及 redo 原 ID 恢复。
- `download`：使用独立 app-data root，从仅由探针显式开放的 loopback HTTP 下载同一插件字节；8 项检查覆盖 URL source preview、commit 后禁用、显式启用、四类贡献及 preview 取消。

结果文件：[trusted-plugin-t3-result.json](trusted-plugin-t3-result.json)。canary 归档为 23,106,932 bytes，SHA-256 `4509e6882dddbdfe6c24015d19e9dfb2f315374c6db3d3a6a8ea3cad4da42345`。三文件插件包为 2,387 bytes，SHA-256 `fa7baddfc2cbd691bfe6e54ad9618a4d1e4d812f7f9482ba8595b924bdfa7d51`。

平台：darwin arm64、打包内 Bun 1.3.13、WKWebView、`views://mainview/index.html`。未请求 Developer ID 签名 / notarization。

## 自动化覆盖

- importer/file/runtime/Workbench/installer/SDK testing 定向回归持续通过；新增 T3 控制器回归为 2 项。
- 组合包 verifier 在隔离临时目录执行作者测试，并验证最终 ZIP 精确三文件。
- JavaScript 与 React 模板 verifier 均执行无应用测试；React 模板额外通过 TypeScript 与 Vite external build。
- 根 `bun run type-check` 通过；仅报告脚本明确忽略的 29 条 Electrobun dependency diagnostics。
- 完整串行回归：219 个测试文件、1,986 项测试全部通过。

## 证据边界

1. 自动文件选择使用 `GHOSTBOARD_PLUGIN_T3_DIR` 显式证据环境下的宿主文件，不冒充人工操作 macOS 原生文件框。普通应用启动仍调用原生 picker。
2. 发行包在解析中验证了工作区停用的 cancellation；workspace ID 切换的同一 lifecycle 清理由 `importerSessions.test.ts` 覆盖，本批没有自动驾驶原生“切换工作区”目录选择框。
3. loopback HTTP 只由 T3 控制器以 `allowLoopback: true` 调用保留安装服务；公开 renderer URL 安装 RPC 不传该选项，正常产品策略仍要求公共 HTTPS。本批没有运行真实外网 HTTPS 服务。
4. 本批只支持 1–100 条的单原子事务，所以 partial completion 诚实地只有 `0/N` 或 `N/N`。超过 100 条的分段进度、逐批 retry 和冲突回滚仍未实现。
5. 没有二进制 / 流式读取、写入、目录能力、持久句柄、通用字段映射、目标画布放置或附件导入。
6. 没有 Windows / Linux、签名、更新、safe mode、外部真人作者试用或公共 HTTPS 生产证据；这些分别留在 T3 后续、T4 与 T5。
