# T4 固定更新、代码回退与迁移恢复证据

日期：2026-09-13（Asia/Singapore）  
状态：**T4 实现、自动化回归、macOS arm64 canary 构建与四次 packaged 启动退出验收通过。**

## 本批结果

本批把第二批已经固定的 Ed25519/TOFU 身份接到 `update.url` release descriptor，并把应用级安装 registry 从单 current 扩展为 current + 一个 previous code generation。插件画布实例的 `dataVersion` 上升现在必须先成功保存迁移前 preimage；设置页可在二次危险确认后显式恢复最新一层迁移前数据。

代码回退和数据恢复是两个按钮、两个事务。代码回退不会自动恢复数据；数据恢复不会自动启用插件。两条路径都会先清除当前工作区 enablement，避免旧代码在尚未确认兼容性时读取已迁移数据。

## 固定 release descriptor

- 只读取首次签名安装时固定的规范化 `update.url`，不接受 UI 临时替换更新源。
- descriptor 与 ZIP 共用每跳 DNS 公网地址检查、HTTPS→HTTP 降级拒绝、最多 5 次重定向、60 秒超时和流式字节预算；loopback 只在自动化测试显式打开。
- descriptor 必须是 `ghostboard-plugin-release/v2` JSON，最大 1 MiB；HTML、错误 schema、错误 plugin ID、重复版本、非 HTTPS 包 URL或不兼容 host 范围均拒绝。
- 兼容最高版本必须高于 current。下载后同时验证 selected version = manifest version、descriptor SHA-256 = ZIP digest、manifest plugin ID、包内 Ed25519 签名、TOFU public key 与固定 update URL。
- 任一检查失败都会取消 staging transaction，current registry 与工作区 enablement 不变；成功仍进入既有 preview/confirm，再由 commit 原子切换。

## current / previous 与代码回退

- 每个 plugin ID 仍只对 runtime 和设置列表暴露一个 current；更新 commit 原子写入新 current，并保留一个 previous 及其不可变目录。
- previous 回退前重新解析 manifest、验证包签名、比对 TOFU key/source、核对记录身份及完整安装树摘要。旧目录改变时 fail closed，current 不移动。
- 回退把 previous 提升为 current 并消费该 previous 指针，不删除较新目录；工作区保持停用，用户需再次审阅并启用。
- clean registry 是显式 current/previous 选择的权威。启动恢复不再无条件重放旧 `installed` journal，因此重启不会撤销用户回退；未完成 `committing` 仍按原事务恢复。
- registry 损坏时先保留损坏原件，再从磁盘验证候选目录，以 journal 时间/semver 恢复最新 current 与次新 previous。

## 迁移前备份与显式数据恢复

- 画布实例 `dataVersion` 上升时，宿主在写入新 record 之前保存 `ghostboard-plugin-migration-backup/v1` preimage，包含原完整 record 与未知 envelope 字段。备份失败会阻止迁移，live instance 保持原 revision/state。
- 插件迁移函数异常、非法 JSON/状态、缺少 migration、新数据遇到旧代码、CAS revision 冲突和实例写入失败仍沿用 T2 的 fail-closed 行为，不覆盖原数据。
- 设置列表仅在当前实例版本高于可用 preimage 时显示恢复入口。用户需二次确认“迁移后修改可能丢失”。
- 恢复前先为当前数据写 `restore-guard` 保护副本；恢复的旧 state/presentation 以 `current revision + 1` 提交，revision 不倒退。已恢复实例不再被同一 preimage 重复恢复。
- 多实例恢复是可重试、逐实例原子操作，不宣称跨所有实例的单文件系统事务；中途失败时已恢复项保持完成，未恢复项仍显示并可重试。

## 自动化与构建结果

- 更新/回退第一轮定向：6 files / 89 tests 通过。
- 更新、回退、迁移恢复综合定向：9 files / 119 tests 通过。
- 全量串行：223 files / 2048 tests 通过；仅输出仓库既有 jsdom navigation/media 未实现提示。
- 迁移前备份覆盖：成功迁移、迁移后编辑、显式恢复、restore guard、单调 revision、备份写盘失败保留 live data。
- `bun run check`：728 files 通过。
- `bun run type-check`：通过；只忽略仓库既有 29 项 Electrobun `node_modules` 诊断。
- `git diff --check`：通过。
- `bun run build:canary`：通过；arm64 app tar.zst 为 23,125,597 bytes / SHA-256 `d515d03a057e4ed327894bc5b2b315f8f70d987dca1c65cd934bc8973ed81254`，DMG 为 23,698,936 bytes / SHA-256 `b71f5b5d0eb9a9a7ce8ec2cf71bf3196e789a96167afde7931939c6f114c393e`。
- 机器可读结果见 [trusted-plugin-t4-result.json](trusted-plugin-t4-result.json)。

## Packaged macOS arm64 退出验收

`bun run test:plugin-t4` 使用公开 `package-plugin.js` 生成同一作者 key 的 `1.0.0` / `1.1.0` / `1.2.0` 包，以及换 key 的 `1.2.0` 包；启动从 canary 解出的 launcher 四次，每次读取 renderer 通过受保护本地 host 写出的报告。四次均在 macOS arm64、Bun 1.3.13、`views://mainview/index.html` 下通过，共 34 项检查：

- `safe-mode`：显式 `GHOSTBOARD_SAFE_MODE=1` 在第三方 descriptor 发布前返回空 runtime，管理 RPC 可用，准备下次正常启动成功。
- `safe-recovery`：复用同一 app-data 的下一次启动进入 normal，安全模式标记清除，runtime 仍无插件且没有加载旧代码。
- `update`：签名本地包 preview/commit/enable 后运行 `1.0.0`；同 key HTTPS descriptor 的 `1.1.0` preview 绑定版本、SHA、manifest 和 TOFU 后更新并运行；换 key 包返回 `author key changed` 且 current 不变；显式 rollback 恢复 `1.0.0`、消费 previous 并保持停用；切换到错误 SHA descriptor 被拒绝且 rollback target 不变。
- `migration`：先以 revision-conflict 注入失败迁移，确认 live record 仍为 revision 1 / dataVersion 1；随后实例升到 revision 2 / dataVersion 2 时生成 host-owned preimage；列表显示 1 个可恢复备份；显式恢复写入 revision 3、还原旧 state/presentation、消费 migration backup、保留插件停用状态。

原始 packaged 报告、每阶段 stdout/stderr 与包摘要保存在构建产物 [t4-evidence.json](../../../build/plugin-t4-artifacts/t4-evidence.json)，其中 canary app tar.zst 为 23,125,597 bytes / SHA-256 `d515d03a057e4ed327894bc5b2b315f8f70d987dca1c65cd934bc8973ed81254`，DMG 为 23,698,936 bytes / SHA-256 `b71f5b5d0eb9a9a7ce8ec2cf71bf3196e789a96167afde7931939c6f114c393e`。运行器使用本机自签 loopback HTTPS 与 `NODE_TLS_REJECT_UNAUTHORIZED=0`，只用于测试 descriptor，不代表公共 CA / 外网 TLS 验收。

## 明确保留边界

- 本轮已完成 macOS arm64 packaged 多次启动序列；codesign/notarization、Electrobun patch `baseUrl`、Windows/Linux、公共外网 HTTPS 和真人外部作者验收仍未由本批覆盖。
- 数据备份当前覆盖公开插件自定义画布实例的 `dataVersion` 迁移。A4 通用 KV 没有 schemaVersion/migration API，不在本恢复按钮中；插件代码自行解释 KV 的兼容性仍是公开限制。
- 恢复入口恢复最新一层迁移 preimage，不自动推断任意旧代码能读取哪一版数据；代码保持停用是最终兼容门禁。
