# T3 第四批：通用 importer 配置

日期：2026-09-12（Asia/Singapore）。

状态：**实现、自动化门禁与 macOS arm64 三阶段发行包验收均已通过。** 本批收口明确 importer 选择、宿主字段映射、目标画布 / 放置策略，以及 importer 会话源文件 capability 的生命周期；不把附件导入、后台画布无冲突写入、通用作者打包命令、公共 HTTPS 或 T4 签名更新标记为完成。

## 已实现契约

1. Workbench 提供工作区级 importer 选择器。即使多个插件或同一插件的多个 importer 声明相同扩展名，也不会按注册顺序自动路由；用户先明确选择带插件名称的 importer，再打开该 importer 自己的原生文件选择器。旧 importer 的 `parse(file, { signal })` 流程保持兼容。
2. importer 可选注册 `inspectFields(file, { signal })`。宿主验证 1–100 个唯一、非空、每个最多 128 字符的源字段，并只提供固定 Note 目标 `title`、`text`、`color`：`title` 必填，另外两个可不导入，同一源字段最多映射一个目标。宿主展示并要求确认建议映射，然后才以冻结的 `mapping` 调用 `parse`；inspect / parse 错误不产生 workspace 内容写入。
3. preview 后由用户明确选择“仅资料库（detached）”或目标画布；画布模式再明确选择四列网格或纵向列表。为了不在没有 manifest revision/CAS 时覆盖后台修改，宿主只向当前已打开且 hydration 完成的目标画布写入；选择其他画布时先使用既有安全切换流程。
4. 画布放置限定为单原子 Note 批次（1–100 条）。节点 ID 由 import operation ID 与行号确定，失败重试复用相同节点，不会再次创建 Note 或重复放置。布局从已有顶层内容右侧开始，网格固定四列，纵向固定一列。
5. Note 事务与 canvas manifest 不是一个跨存储事务。内容提交成功但放置保存失败时，Notes 真实保留为 detached，session 进入 `placement-failed`；用户打开目标画布后以同一 session 重试放置。宿主不会用补偿写覆盖并发画布编辑，也不会声称整批回滚。
6. 原生选择得到的 opaque 文件句柄被定义为 importer session 的临时源资产：inspect、mapping、preview、content retry 和 placement retry 期间保持有效；取消、成功完成、importer disposer、reload、disable、workspace switch 或 runtime dispose 时显式 `files.release`。句柄仍受 activation / workspace / process 边界约束，不能持久恢复。

## SDK 与作者样例

- `ImporterDefinition.inspectFields` 返回 `{ fields, suggestedMapping? }`；`parse` 的第二参数升级为 `ImporterParseOptions`，可读取完整 `mapping`。未声明 `inspectFields` 时不传 mapping，现有插件无需修改。
- `@ghostboard/sdk/testing` 增加 `harness.behavior.inspectImporterFields`，`parseImporter` 可接收 mapping，继续使用 activation 信号。
- 组合 CSV 包不再限制表头必须叫 `title` / `text` / `color`；它检查任意非空唯一表头，并按宿主传入的映射生成 Note。默认同名字段只作为建议值，仍需宿主确认。

## 自动化证据

| 门禁 | 结果 | 覆盖 |
| --- | --- | --- |
| `bun run type-check` | 通过 | SDK 新类型、runtime 状态、Workbench 与发行探针 |
| importer/runtime/canvas 聚焦 Vitest | 3 files / 167 tests 通过 | 重叠 importer 显式选择、mapping 校验与 UI、placement retry 去重、deterministic grid、句柄 lifecycle、原有分段 / rollback |
| `bun run test:plugin-t3-fixture` | 通过；最终包仅 `app.js`、`csv.js`、`manifest.json` | 独立 SDK fake host 的 inspect + mapped parse、单批 / 分段边界、包内容 |
| `bun run check` | 通过；692 files，无修复 | Ultracite / Biome 全仓静态检查 |
| `bun run test -- --maxWorkers=1` | 220 files / 2,011 tests 通过 | 全量串行 Vitest 回归；Vitest 4.1.4 不支持旧 `--minWorkers` 参数 |
| `bun run test:plugin-t3` | local / restart / download 三阶段全部通过 | macOS arm64 / `views://mainview` / WKWebView 发行包；真实 canvas placement + 持久清理、parse disable cancellation、uncertain-response retry、重启后 undo / redo |

发行包证据目录为 `/var/folders/z9/923rxv8s00v774r2w1qyxjrh0000gn/T/ghostboard-plugin-t3-UDE6Pz`。canary 归档为 `build/plugin-t3-artifacts/canary-macos-arm64-GhostBoard-canary.app.tar.zst`（SHA-256 `9045d8d0e0a5d1d476bc90e35a0307d295997b2b0616a0c4df4c421d06ecd2db`）；独立组合插件包只含 `app.js`、`csv.js`、`manifest.json`（2,826 bytes，SHA-256 `e32f85a004779fa16bb146facc93e5ffd0cf7a90e4cc9a2bf55ef6433208309c`）。本轮未请求签名或 notarization。

## 明确保留边界

1. “临时源资产”是 importer session 持有的 opaque 选择句柄，不是 workspace `attachments/` 导入。插件把图片、音视频或一般文件提升为 GhostBoard attachment、为其生成预览并在取消时清理 staging 文件，仍需要单独的附件导入契约。
2. 画布放置最多 100 条；101–5,000 条显式分段导入继续保持 detached，保留既有逐段 retry 与冲突安全 rollback，不引入虚假的跨内容 / 画布事务。
3. 目标画布必须在 renderer 中打开并完成 hydration。当前没有后台 manifest revision/CAS，因而不会静默向非活跃画布写入。
4. 文件选择发生在用户明确选择 importer 之后；宿主不会先以一个插件身份选择文件，再把 capability 转授给另一个插件。这样保留跨插件 activation ownership，而不是为“自动匹配”削弱能力边界。
5. 高信任插件仍可绕过 SDK 直接产生副作用；宿主保证的是受支持 importer 契约和 host-owned commit/placement 路径，不是进程级沙箱。
6. Windows / Linux、人工原生 picker、公共外网 HTTPS、附件 importer 与通用作者打包 CLI 仍未在本批验收。
