# T3 第二批：完整 files 服务

日期：2026-09-12（Asia/Singapore）。

状态：**实现与自动化门禁已通过；T3 阶段继续实施。** 本批补齐第一批明确保留的 files 能力，不把分段 importer、通用字段 / 目标配置、作者打包命令、签名更新或多平台人工验收冒充为已完成。

## 已实现契约

- `PluginFileHandle` 与 `PluginDirectoryHandle` 都是 opaque、带 `kind` 的 activation / workspace / process 句柄；renderer 与插件看不到绝对路径。`release` 可提前失效，activation 退出仍统一释放。
- `pick({ multiple })` 默认单文件，显式多选最多 16 个；`pickDirectory()` 返回一个目录或 `null`。原生选择器继续只在 Bun 控制面调用。
- `list(directory, { cursor, limit })` 按名称返回最多 100 个直接子项，不递归扫描。普通文件 / 目录获得新句柄；symlink 可见但不获得句柄，读取、进入与写入路径均不跟随它。
- `readBytes` 最多收集 16 MiB；`readText` 保留默认 1 MiB 严格 UTF-8 并允许显式提高至 16 MiB。`stream` 支持 `start / length`，每次 localhost range 请求最多 1 MiB，单 stream 最多 256 MiB。
- `write` 接受 string、Blob、ArrayBuffer / view 或 `ReadableStream<Uint8Array>`。renderer 每 1 MiB 等待宿主确认；Bun 在所选目录下写临时文件，最终成功才 rename。单次最多 256 MiB、同时最多八个 session；取消 / 失败 best-effort 删除临时文件。
- 绝对路径、空路径、`.` / `..`、越界路径、symlink 路径和默认不允许的覆盖会在 commit 前拒绝。普通相对子目录由宿主创建。进度只报告已由宿主确认的字节；未知大小 stream 在完成前以 `total: 0` 表示。

## 传输与生命周期

picker、目录分页和 release 是小型 Electrobun RPC 控制消息。二进制范围和分块写入复用已有 localhost server，并在分发给 file host 前验证每次启动随机生成的 bearer token。每个 read 请求必须带显式闭区间 Range；宿主拒绝超过 1 MiB 的范围。每个 write chunk 必须从上一次确认的 offset 继续，重复、跳跃或超过总量均拒绝。

句柄不能在 reload、workspace switch 或应用重启后恢复。当前 Electrobun 没有跨平台 security-scoped bookmark 契约，因此宿主不持久化原始绝对路径；插件需要重新请求用户选择。这个限制是正式边界，不是待实现的隐藏恢复承诺。

## 自动化证据

- `src/bun/plugins/files.test.ts`：opaque ownership、严格 UTF-8、当前大小上限、目录分页、symlink 无 handle、显式 range、顺序 chunk、最终文件、取消清理与路径逃逸拒绝。
- `src/bun/localHttpServer.test.ts`：未通过 bearer 不会分发 file data 请求。
- `src/mainview/plugins/runtime/files.test.ts`：file / directory handle object identity、分页冻结、显式 release、picker abort 与晚到结果释放。
- `src/mainview/plugins/runtime/fileTransfer.test.ts`：多块 range、partial stream abort、顺序 write / commit 和宿主确认进度。
- `src/mainview/plugins/runtime/sdkTesting.test.ts` 与独立 `t3.combined` 作者测试：fake host 的 binary / directory / list / write / release 与公开 SDK 同步。
- 独立组合包 verifier 继续生成精确三文件包；JavaScript / React 模板测试、React 类型检查与 Vite external build 均通过。
- 真实 macOS arm64 canary 的现有 T3 三轮探针在新 data plane 上再次通过 34/34 项：local 19、同 root restart 7、独立 root loopback download 8。结果见 [trusted-plugin-t3-files-result.json](trusted-plugin-t3-files-result.json)。canary 为 23,110,620 bytes，SHA-256 `f8504d77864a1ea6885db207c8c2e8bf034fb1c5b68635d7f86db868b67fe0a3`；当次三文件插件包 SHA-256 为 `20a3c67361d9d8fb3a1ec33733d2b8c2124a914ddab046af3f510cb9bfa1e7b5`。
- 类型检查、16 文件 Ultracite 检查及 8 个相关测试文件 / 130 项测试已通过；目录选择中止语义补强后的定向回归为 2 文件 / 13 项，symlink 替换等最终安全回归为 4 文件 / 31 项。最终串行全仓门禁为 220 文件 / 1,998 项测试全部通过。

## 证据边界

1. 第一批已验证的打包 CSV importer 现在通过新 localhost range data plane 执行 `readText`，并已重新通过三轮发行包探针；但本批没有自动驾驶 macOS 原生目录选择框，目录选择器的 Bun RPC 参数与后续读写由集成 / 单元测试覆盖。
2. 最终 rename 的原子替换证据来自当前 macOS / POSIX 路径；Windows 的既有目标覆盖行为及 Linux / Windows 原生选择器仍留给 T5 平台回归。
3. 高信任插件仍可绕过 SDK 直接使用浏览器 / JavaScript 能力；manifest `files` 是展示元数据，不是 OS 沙箱权限声明。
4. 分页不是目录快照；两页之间外部目录变化可能改变 offset 结果。插件应按当前页处理，不把 cursor 持久化。
5. 本批没有实现超过 100 条 Note 的分段导入、逐批 receipt / retry、冲突回滚、字段映射、目标画布放置或临时附件生命周期；这些仍是后续 T3 任务。
