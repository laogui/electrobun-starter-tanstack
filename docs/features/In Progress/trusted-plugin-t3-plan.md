# T3 导入器与可安装分发实施计划

日期：2026-09-11（Asia/Singapore）。

状态：**受限 CSV、完整 files 与分段导入三批均已通过相应门禁，T3 后续批次仍在实施。** T0–T2 的已验收行为不在本计划中重做；T4 的安全模式、签名、TOFU 更新、代码回退和数据迁移恢复不提前并入 T3。

## 1. 已有基线

当前代码已提供可复用的正式分发底座，而不是只支持开发目录：

- manifest v2 ZIP 支持根目录或单层包装目录，拒绝路径逃逸、重复路径、加密条目、校验和错误、资源超限和旧 v1 契约。
- 本地 `.zip` / `.ghostboard-plugin` 与 HTTPS 直链共用 prepare → preview → commit 安装事务。下载限制重定向、私网目标、响应大小和非 ZIP 页面。
- 安装包进入应用级目录，工作区仅记录 enablement；commit 后默认不运行，用户需再次确认高信任启用。
- 安装树在运行前校验 canonical digest；损坏包会被停用。中断安装、损坏 registry 和损坏 enablement 已有恢复或可见诊断。
- 已安装包与开发目录使用同一个 manifest、静态资源服务和 renderer activation runtime。候选 setup 失败不会泄漏命令、面板或画布类型注册。

因此 T3 不新建第二套安装器。第一批把“真实已安装包”接到新的 files / importer 闭环，并用发行包证明本地 ZIP 与 HTTPS 两种来源均可运行。

## 2. 第一批冻结范围：受限 CSV → detached Notes

### 2.1 文件句柄

第一批只公开完成 CSV 闭环所需的只读子集：

- `app.files.pick(...)` 调用宿主原生文件选择器。过滤器只接受明确的扩展名 / MIME 描述；第一批只允许单文件选择。
- 返回值是 opaque、不可持久化的文件句柄，公开 `id / name / size / mimeType / lastModified`，不把绝对路径交给插件。
- 句柄绑定当前 `pluginId + workspaceId + activation + app process`。跨插件、跨工作区、重载后或重启后使用必须失败。
- 用户关闭选择器返回空数组，不记录诊断；activation、workspace 或调用方 signal 中止时返回 `AbortError`。
- `app.files.readText(handle, options)` 第一批只支持严格 UTF-8，单文件最大 1 MiB；超限、无效编码、失效句柄与上下文不匹配均在解析前失败。

第一批不提供写文件、目录选择 / 列举、随机访问、二进制读取或大文件流。它们仍属于 T3 的“完整 files 流程”，必须在后续批次以流式传输、超时和取消规则补齐后才可宣称完成。

### 2.2 importer 注册与生命周期

- importer 使用与 command / panel / canvas type 一致的动态注册模式：插件在 `setup(app)` 中调用 `app.importers.register(definition)`。
- definition 至少包含插件本地 `id`、用户可见 `title`、文件过滤器和异步 `parse(file, { signal })`。同一 activation 内 ID 不得重复。
- 注册先保存在候选 activation；只有 setup 全部成功后才发布。失败 reload 保留旧 importer；成功接管、停用、工作区切换或 disposer 会移除旧注册并中止其进行中的选择 / 解析。
- importer 入口在现有 Plugin Workbench 中按所属插件显示。安装或启用本身不选择文件、不解析、更不写入资料。
- 第一批 CSV 约定首行为字段名，并识别 `title`、`text` 与可选 `color`。缺少 `title`、重复字段、格式错误、空结果或超过 100 个有效数据行会在 preview 前失败；不提供任意字段映射 UI。

插件 `parse` 返回规范化的 `NoteContentCreate[]` 与 warnings。支持契约要求 parse 阶段无 workspace 写入；高信任插件仍可绕过 SDK 直接产生副作用，宿主不会把这种行为描述成可强制隔离。

### 2.3 宿主 preview、确认与取消

- 用户从 importer 入口选择文件后，宿主显示文件名、有效条数、每条 title、正文摘要、颜色和 warnings；不会自动提交。
- preview 仅保存在当前 renderer session，并绑定原 activation / workspace。注册被替换、插件停用、工作区切换或文件句柄失效会关闭 preview。
- preview 阶段的取消为零 workspace 写入；重复选择创建新的 import session，不复用旧草稿。
- 用户确认后，宿主以 importer 所属插件身份调用既有 `content.createMany`，一次提交 1–100 条 detached sidecar Notes。该批不自动放到画布，因此不引入目标画布 / 放置事务。
- 一次 import session 生成一个稳定 operation ID；确认请求结果不确定时必须以相同 ID 重试。既有内容事务回执保证相同输入不重复创建，输入不同则拒绝复用。
- 单批提交是原子的，因此本批进度只有 `0/N` 与 `N/N`，不存在诚实的中间已完成范围。失败保持 `0/N` 并保留 preview 供重试；请求发出后的 abort 不能承诺回滚已经提交的事务，宿主通过回执 / content event 对账。
- 成功结果记录 batch ID，导入器停用或卸载不删除普通 Note。批次可继续使用现有显式 SDK undo / redo；若它位于当前 mixed history 顶部，原生 canvas undo 也可撤销。

## 3. 发行包验收场景

第一批必须新增一个仓库外形态的组合插件包和可重复机器探针。探针使用真实 macOS arm64 canary 归档，不把开发目录当成最终用户安装：

1. 从本地 ZIP prepare，确认 preview 在代码执行前可见，commit 后仍未激活；显式启用后 command、panel、canvas type 与 importer 同时出现。
2. 选择有效 CSV，确认 parser 只产生 preview；取消后工作区文件、Note 查询和历史均无变化。
3. 再次选择并确认，创建确定数量的 detached Notes；标题 / 正文 / 颜色正确，搜索 / 文库可读，安装包停用后资料仍存在。
4. 对同一 import operation 模拟一次 uncertain response，再以相同 ID 确认；Note ID 与总数不变化。重启后显式 undo / redo 仍按同一 batch 工作。
5. 验证无效 UTF-8、超过 1 MiB、超过 100 行、缺少 title、解析中 workspace 切换和停用：均不得向旧 / 新工作区提交内容。
6. 在独立 app-data root 通过 loopback HTTP（仅探针显式允许）安装相同 ZIP，证明 HTTPS 下载后的包字节进入同一检查 / commit / enable / activation 路径。产品正常启动仍只允许公共 HTTPS。
7. 归档内不运行 `bun install`、`npm install`、构建脚本或包内 lifecycle script；插件 ZIP 已包含运行所需的 JavaScript 与静态资源。

## 4. 后续 T3 批次

第一批结果与机器证据见 [T3 第一批验收记录](trusted-plugin-t3-evidence.md)。第一批通过不等于整个 T3 完成。后续至少包括：

1. **完整 files 服务（已实现并通过自动化门禁）**：二进制 / 分段流式读取、目录选择与分页列举、宿主临时文件 + 最终 rename 写入、显式 release、进度 / 取消 / 资源上限与不可跨 activation / workspace / process 恢复边界。接口与证据见 [T3 files 服务验收记录](trusted-plugin-t3-files-evidence.md)。
2. **分段导入（已实现并通过 macOS arm64 发行包门禁）**：超过 100 条使用 1–100 条的显式批次；Workbench 展示已完成范围，逐批 receipt / retry 去重并从失败段继续；逆序回滚保留后来编辑或被引用的冲突段且继续清理其他范围。接口与证据见 [T3 分段导入验收记录](trusted-plugin-t3-segmented-evidence.md)。
3. **通用 importer 配置（已实现并通过 macOS arm64 发行包门禁）**：多个匹配 importer 的显式选择、宿主字段映射、目标画布 / 放置策略，以及 importer session 源文件 capability 生命周期。这里的临时源资产不是 workspace attachment；接口、边界与证据见 [T3 通用 importer 配置验收记录](trusted-plugin-t3-configuration-evidence.md)。
4. **作者工具链**：可安装包构建命令、独立 importer 模板、组合模板与单文件 AI 参考。
5. **T3 退出**：命令、面板、CSV importer、canvas type 四类独立样例均从安装包运行；再更新主方案状态为 T3 已通过。

已从后续清单移除的完成项：A5 `@ghostboard/sdk/testing`、React testing 子路径、JavaScript / React 模板无应用测试，以及组合插件作者测试已在第一批落地；完整 files 服务在第二批落地；分段导入在第三批落地；通用 importer 配置在第四批落地。fake host 不替代真实 RPC、磁盘持久化、安装器或平台验收。

## 5. 明确排除

- T4 的作者签名、TOFU 更新、自动检查、安全模式和版本 / 数据回退。
- 富文档 block 创建、附件导入、自定义导出器、持续同步和 Bun backend entry。
- 跨重启持久的 canvas + plugin 混合历史或 BlockNote 内部历史扩展。
- 对高信任 JavaScript 直接 DOM、文件、网络或外部系统副作用的通用事务 / 隔离保证。
