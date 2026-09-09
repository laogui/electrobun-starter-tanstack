# GhostBoard 当前开发计划：从可用组件到完整项目流程

> **状态**：D0 已完成阶段验收；D1-1 至 D1-4 已完成自动化实现与桌面验收；D2-1 合成资料基线、D2-2 正向流程与导出、D2-3 故障流程均已完成验收（故障审计修复了标题-only 保存与损坏 PDF 空白预览阻断，并记录本地编辑与 AI/网络失败边界）；D3 保持条件触发；公开插件于 2026-09-09 改为高信任模型重新实施，当前 T0 待开始，旧沙箱模型的验收不迁移。本文不代表未列阶段的新增功能已实现。
> **产品依据**：[PRD §1](./PRD.md#11-当前定位与开发对象) 与 [§7.1](./PRD.md#71-当前开发顺序与验收门槛)。
> **目标**：单人将真实素材带入画布，整理、找回、记录结论并导出；不以发布、支付或扩张节点种类为目标。

## 1. 使用方式与计划归属

- 2026-09-09 公开插件改为 [高信任插件系统改造方案](./features/In%20Progress/trusted-plugin-platform.md)：同 realm 前端、宿主 SDK 服务、签名更新，阶段为 T0–T6，单独跟踪并复用下述 D0 的数据与行为修复。2026-09-07 的 v2 沙箱方案及其 P0–P5 已归档至 `docs/features/Archive/`；本次文档更新不改变已有 D0–D3 的完成状态。
- PRD 定义产品行为与边界；本文维护 D0–D3 的任务、依赖与阶段验收；功能方案维护具体实现。不要在三处各自维护不同的完成状态。
- 当前 [扩展收尾计划](./features/canvas-extension-gap-closure.md#L1) 记录 T0–T6 的完成证据。它是 D0 的子计划，不重新实施已完成任务；后续扩展行为变化应另立任务并更新矩阵。
- 旧产品细节路线图已从主分支移除；历史迭代通过 Git 记录回查，不恢复旧文档或与本文并行排期。
- 任务状态只使用：`待开始 / 实施中 / 待验收 / 已验收 / 阻塞`。已有代码不等于已验收；标记已验收必须附测试结果和适用的桌面操作记录。
- 进入任务前检查工作区已有修改，复用当前实现；不要把别人的进行中变更重做或覆盖。
- 以下代码入口用于定位，不是要求全部修改；以开始任务时的源码为准。工作量先按独立可评审的变更批次组织，D0 核查后再估工期，不把旧计划估时重复相加。

## 2. 执行顺序

| 阶段 | 进入条件 | 交付物 | 退出条件 |
| --- | --- | --- | --- |
| D0 类型迁移与行为收口 | 当前代码可用于核查 | 对齐的行为矩阵、OD-6 决策、必要回归修复和旧存储描述同步 | 新旧数据均可访问；迁移基本操作矩阵通过，没有未解释的能力丢失 |
| D1 资料可达 | D0 的类型/容器规则已定；可提前准备测试数据 | 搜索目标链路、Folder 子内容访问、detached / unlinked 找回规则 | 各位置的资料有明确入口，命中后可到达实际内容 |
| D2 完整项目流程 | D0、D1 已验收 | 合成资料样例、实际桌面走查记录、导出与失败处理修复 | 完成本文 §6 的正向流程与故障流程，记录遗留非阻断项 |
| D3 最小体验补齐 | D2 暴露可复现的阻断点 | 每个问题一个最小方案、实现与回归证据，或“不新增功能”的结论 | 原流程不再被该问题阻断；无问题则不启动开发 |

**关键路径**：D0-1 → D0-2/3 → D0-4 → D1-1 → D1-2/3 → D1-4 → D2 → 按需 D3。

**可并行**：合成资料和失败用例准备；D0 类型规则确定后的搜索/文库代码调查。共享 `canvasStore`、搜索目标结构与 FocusedView 的任务不要在未对齐接口时并行修改。

## 2.1 当前下一步（2026-09-09）

D0–D2 的历史验收记录保留。审查新发现的实例保存回归作为基础维护修复，不重复立项整轮类型迁移，也不因过去验收通过而忽略新回归。公开插件的任务状态和工程证据统一在 [现行方案 §10](./features/In%20Progress/trusted-plugin-platform.md#10-实施阶段与退出条件) 维护。

执行顺序：

1. **T0 装载验证**：在打包后的 macOS 发行包上验证本地 HTTP 挂载插件目录并 `import()`、import map 解析共享 React / SDK、Vite 输出稳定 chunk、独立 `createRoot` 挂载与卸载、宿主代理 `net.fetch` 与 `files` 读写。任一机制不成立即回到方案 §12 修订架构。
2. **旧运行时清理**（可与 T0 并行）：按方案 §9.1 删除 QuickJS 运行时、会话协议、权限授予记录与 `scripts/plugin-container-probe/`，移除 `quickjs-emscripten` 依赖与 wasm 拷贝；保留并改造 ZIP/URL 安装、安装事务、标题批次 journal/Undo、工作区启用与设置页。宿主对 v1 包拒绝加载并提示。
3. **T1 命令与面板闭环**：manifest v2、目录加载、注册清理、SDK、模板、自动重载、诊断；仓库外作者无需修改宿主即可开发命令与面板。
4. 之后按 T2 画布类型、T3 导入器与分发、T4 安全模式与签名更新、T5 公开验收推进。2026-09-08 旧模型的容器实验与命令闭环验收见归档的 [容器实验](./features/Archive/plugin-container-experiment.md) 与 [P0 契约](./features/Archive/plugin-p0-frozen-contract.md)，不作为新模型任何阶段的完成证据。

当前不增加小组件、设置或市场功能；没有新的基础项目体验阻断点就不启动 D3。

## 3. D0：先确认迁移没有改变产品

### D0-1 行为规则与决策冻结

- **状态**：已验收（目标规则、代码、定向/全量自动回归与 Productivity 桌面矩阵均有证据；SearchDialog 的 Node 26 localStorage 环境基线单列，不计入本项失败）；前置：无。
- 对照 [类型契约](../src/mainview/extensions/types.ts#L95)、[内置注册](../src/mainview/extensions/registerBuiltins.ts#L14) 与 [行为矩阵](./features/In%20Progress/canvas-extension-behavior-matrix.md#L10)，逐项区分旧行为、当前声明、当前运行行为、目标行为。
- 覆盖 Note / Sticky / Group / Folder，以及 Image / File / Link / Recording / Checklist / Pomodoro / Reminder；新数据与未迁移旧数据分别记录。
- PRD OD-6 已冻结：Checklist 通过 Canvas Type `detail` 保留完整编辑；Pomodoro / Reminder 保持画布内操作；三者均可进入 Group，但不可新进入 Folder。历史 Folder 内的 `widget` / 已迁移 `extension` 条目继续可预览、搜索和取回，Extract 不得改变其原类型或数据。
- **交付/验收**：矩阵每个差异有“修复回归 / 有意改变且有替代路径 / 历史描述错误”的结论；未决项标阻塞，不擅自补成已决策。

### D0-2 完成已有扩展收尾任务

- **状态**：已验收（T0–T6 代码、文档、定向回归与全量串行回归均完成）；依赖：D0-1 的相关行为决策。
- 已复核 T0–T5 的菜单、AI presentation 上下文、移到文库与 DetailSurface 回归证据；T6 已集中 search-kind 映射并补齐 RFC/矩阵说明。
- 入口：[宿主菜单](../src/mainview/extensions/hostMenu.ts#L1)、[FocusedView](../src/mainview/components/canvas/FocusedView.tsx#L1)、[AI 上下文](../src/mainview/lib/ai/buildAIContext.ts#L11)、[序列化](../src/shared/extensions/migrateNodes.ts#L19)。
- **验收**：媒体/链接专属动作可用；详情遵守类型声明；AI 不读取任意实例 state；detach 标记保存重载不丢；禁用/未知类型有安全回退。保留仍承担旧数据兼容的双读路径。
- **测试入口**：现有 `ContextMenu.test.tsx`、`FocusedView.test.tsx`、`buildAIContext.test.ts`、`canvasNodeSerialization.test.ts`，以及子计划列出的测试。

### D0-3 生命周期与异常回归

- **状态**：已验收（D0 收口时 164 个测试文件 / 1486 个测试通过；当前串行全量回归 167 个文件 / 1509 个测试通过）；依赖：D0-1，与 D0-2 的相关修复配套。
- 已按七个内置 Extension Canvas Type 验证 duplicate、粘贴、跨画布引用、删除、撤销、重做与重载；复制会克隆 Instance，画布历史与实例历史保持隔离。
- 已覆盖同一实例的多画布引用语义、Folder child 递归克隆、克隆失败可见提示，以及缺失/损坏/未知类型的保留回退。
- 测试 workspace 的缺失附件路径继续保留；AssetNode 缺失状态可见且禁止打开，加载或保存不会静默删除不可解析内容。
- 入口：[canvasStore](../src/mainview/store/canvasStore.ts#L1)、[节点序列化](../src/mainview/lib/canvasNodeSerialization.ts#L1)、[manifest](../src/bun/manifest.ts#L1)。
- **验收**：内容引用与克隆规则符合矩阵；失败可见且原始数据保留；类型状态历史与画布历史不串写；每个发现的回归有邻近源码测试。

### D0-4 同步基线并关闭阶段

- **状态**：已验收；依赖：D0-1 至 D0-3。
- 已更新 PRD §2/§5、技术规范、OD-6、行为矩阵与 T6 阶段记录；扩展收尾计划已移入 `docs/features/` 并修复直接引用。
- 自动门禁：`bun run check` 通过（451 个文件）；`bun run test -- --fileParallelism=false --maxWorkers=1` 通过（167 个文件、1509 个测试）。`bun run type-check` 仍受 `node_modules/electrobun` 依赖诊断和既有 `src/mainview/routes/index.test.tsx` 缺少 `beforeAll` 阻塞，未发现本阶段新增源码错误。
- **验收**：代码、目标行为、数据兼容说明已对齐；D0 基本操作已有自动与桌面证据。后续搜索可达性与插件平台不纳入本阶段。

## 4. D1：资料放在哪里都能找回

### D1-1 定义统一的搜索目标

- **状态**：已实施；依赖：D0 的容器与类型规则已定。
- 按 `顶层 / Group 内 / Folder 内 / detached / unlinked` 建立可达性矩阵；分别记录“后端命中”“前端 fallback 命中”“定位”“打开/恢复”。
- [后端搜索](../src/bun/search.ts#L197) 已对 Widget / Extension 收集 Folder 引用，不从零重写搜索。重点核查 Note children 正文映射与结果定位信息。
- [SearchDialog](../src/mainview/components/search/SearchDialog.tsx#L471) 当前按 nodeId 定位。`src/shared/searchTypes.ts` 现在提供可序列化的 `SearchResultTarget`：视图、边、普通画布节点（含顶层 / Group / detached）、Folder child（同时携带 `folderId` 与 `childId`）以及未来 unlinked 内容引用。后端 `searchWorkspace` 与当前画布 fallback 都填充该目标；结果 ID 保持原规则，重复的 Note 引用不会被去重。
- `SearchDialog` 会把目标透传到同画布和跨画布 pending state；Folder child 的进入、展开和打开由 D1-2 完成。unlinked target 保留为未来可扩展的数据形状，但全局搜索仍不把无 manifest 文件混入普通画布结果，正式发现与恢复由 D1-3 的 Note Library 入口承担。
- **交付/验收**：搜索结果目标契约与测试样例；同一 Note 多视图引用、Folder child、detached 不会被错误去重或定位到不相关实例。不在本任务引入语义搜索或新搜索引擎。聚焦测试覆盖 Bun、fallback、SearchDialog 透传和共享类型（51 tests）。

### D1-2 补齐 Folder 命中到打开的完整链路

- **状态**：已验收（自动化 + 2026-09-07 桌面走查）；依赖：D1-1。
- 后端与前端 fallback 使用一致的范围定义；已补齐 Folder Card child 的 Note 引用、正文与 manifest 元数据命中，并保留 Widget / Extension sidecar 命中。目标身份仍由 `SearchResultTarget` 统一携带。
- 当前画布结果：Folder child 命中先进入所属 Folder，再按 `childId` 找到展开层节点；可聚焦类型进入 FocusedView，无详情视图的类型留在 Folder 展开层以显示其画布内操作，不强行聚焦。
- 跨画布结果：先安全保存/切换，等待目标数据加载，再进入容器。保存失败中止跳转，不清空当前编辑。
- **验收**：按合成资料中的独有关键词搜索标题/正文/类型可检索文本，验证结果身份与可访问内容，而不只断言结果数量。返回后保留合理上下文，不把临时搜索定位写成用户长期视口；保存失败路径仍由 SearchDialog 的跨画布测试覆盖。
- **测试**：`src/bun/search.test.ts` 覆盖 Folder Card child 正文和容器目标；`src/mainview/components/search/SearchDialog.test.tsx` 覆盖同画布目标透传；`src/mainview/routes/index.test.tsx` 覆盖同画布、跨画布、可聚焦 child 与不可聚焦 legacy child 的展开/打开行为。

### D1-3 明确 detached / unlinked 的访问与清理

- **状态**：已验收（自动化 + 2026-09-07 桌面走查）；依赖：D1-1，OD-2 已选择“可定位对象 + 文库找回入口”。
- 全局画布搜索保持 placed / detached / Folder 等可定位对象；Note Library 复用 `scanUnlinkedNotes` 展示只读 Unlinked Files 清单，不把 cleanup 作为唯一入口，也不新建另一套内容数据库。
- 带稳定 `noteId` 的 `content/**/*.md` 与 BlockNote sidecar 可通过显式 **Place on canvas** 恢复为当前画布顶层 Card；恢复时禁止新节点自动吸附到 Group，侧车路径只传 noteId，避免把 JSON 当成 Markdown。无 frontmatter id 的 Markdown 显示原因但不自动猜测身份；Widget / Extension unlinked 记录维持原类型清单，不伪装成 Card，不执行删除。
- 使用现有 [文库侧栏](../src/mainview/components/canvas/DetachedNotesSidebar.tsx#L1)、[文库数据](../src/mainview/components/library/useLibraryData.ts#L1)、[Note 索引](../src/bun/noteStore.ts#L1) 与 [cleanup](../src/bun/cleanup.ts#L1)；cleanup 的引用集合同时读取 active 与 trash manifest，恢复入口不改变其安全删除校验。
- **自动化验收**：清单扫描成功/失败、无 id 文件、typed Widget/Extension 记录、Markdown 恢复、BlockNote sidecar 恢复均有相邻 UI 回归；恢复沿用 `canvasStore.createNode` 的现有 manifest 持久化路径。桌面验收仍需验证移出→文库可见→重启→放回后内容一致；永久删除继续要求显式确认，其他画布仍有引用的内容不能被误清理。

### D1-4 可达性整体验收

- **状态**：已验收（自动化矩阵 + 2026-09-07 桌面走查）；依赖：D1-2/3 与 D0 已验收。
- `src/test/reachabilityMatrix.ts` 固定同一批合成资料，覆盖顶层、Group、Folder、detached、unlinked 及支持/不适用的类型组合；不适用项保留明确原因（例如 Sticky / Productivity 新节点不允许进入 Folder，Recording 不可 detached），不把历史兼容数据误算为新建能力。
- 矩阵回归分别断言 Bun 后端搜索、当前画布 fallback、Note Library/Detached browse、Folder child 进入与打开，以及稳定 unlinked Markdown / BlockNote sidecar 的恢复；无 id Markdown 与 typed Widget / Extension 只浏览，不强制转换为 Card。无引用材料同时断言不进入全局画布搜索。
- **自动化验收**：`src/bun/search.test.ts`、`src/mainview/hooks/useSearch.test.ts`、`src/mainview/components/library/useLibraryData.test.ts`、`src/mainview/components/canvas/DetachedNotesSidebar.test.tsx`、`src/mainview/routes/index.test.tsx` 与 `src/mainview/components/library/LibraryPopup.test.tsx` 均有矩阵用例；2026-09-07 桌面已完成“命中→进入/打开”“移出→文库→放回→重启”及真实附件/实例内容一致性走查。

## 5. D2 / D3：用真实任务决定还要做什么

### D2-1 固定验收资料与基线

- **状态**：已验收（自动化基线 + 2026-09-07 桌面门禁）；D2-2 正向流程与 D2-3 故障审计均在同一临时副本完成；资料准备可复用，D2-2 依赖 D0/D1。
- [项目夹具](../src/test/projectFixture.ts) 的 `writeD2ProjectFixture(workspacePath)` 会在临时或明确可丢弃的目录中重建固定 workspace：两张画布、三张内容各异的 Note、一份导入 Markdown、两张图片、一份 PDF、一份音频、两个链接、一个 Group、一个 Folder、三个 Productivity 实例。
- 初始状态：`d2-research` 为 active view；共享 Note 在研究画布 Group 与交付画布顶层各有一处引用；研究画布另有 Folder 内 Note、Folder 内媒体/链接、detached Note、Group 内 Checklist 与顶层 Recording；交付画布有导入 Markdown、Link、Pomodoro、Reminder。
- 无引用样例包含带稳定 id 的 Markdown、无 id Markdown、孤立 Widget 与孤立 Extension。新 Productivity Extension 不放进 Folder；Folder 中的 `widget_d2_legacy` 仅作为旧数据兼容样例，不能据此扩大新建能力。
- 附件是小型自制 PNG / 最小 PDF / 空 WAV；链接使用 `example.test` 并将 unfurl 状态固定为 ready，自动化不访问外网。文本包含 `d2-*` 独有关键词，不提交真实私人 workspace、密钥或大媒体。
- **自动化交付**：`src/bun/projectFixture.test.ts` 校验夹具确定性、文件清单、允许的容器组合、跨视图 Note 搜索、Folder child 目标、detached/imported/typed 记录及 unlinked 不进入全局搜索。桌面使用同一函数生成副本后，再执行 §6 的真实点击、重启、附件阅读与导出验收。

### D2-2 完成项目与导出

- **状态**：正向流程已验收（2026-09-07，临时 workspace `/private/tmp/ghostboard-d2-SJakeS`）；故障流程和阶段关闭由 D2-3 记录；依赖：D2-1、D0/D1 已验收。
- 按 §6 正向流程运行；先用现有编辑器写结论，不开发专门大纲 UI。
- 检查 [Markdown 导出](../src/bun/markdownExport.ts#L1) 的内容范围、附件路径与缺失项处理；验证导出文件实际可读，而不是只看成功 toast。
- 笔记导出、画布图片与 workspace 备份分别验收。JSON 没有导入恢复就不得称为可恢复备份；备份只在独立测试 workspace 中验证恢复。
- 实测结果：创建并编辑四行“项目结论” Note；图片、PDF、音频播放状态、链接详情和 Delivery 画布的 Pomodoro/Reminder 均可访问；重启后 active view 与放回画布的 Note 保持一致。Markdown 导出生成 5 篇 Note + `index.md`，JSON v2、PNG 2644×2132，workspace ZIP 通过 `unzip -t` 并包含 53 个成员及全部夹具附件。
- **验收**：正向路径中的结论与支持范围内素材可带走，导出产物可在外部文件工具中读取；JSON 仍明确不是可恢复备份，workspace ZIP 才作为备份候选。故障路径（缺失项、保存失败、不可写目录等）不在本项正向结论内，由 D2-3 验收。

### D2-3 记录阻断点并关闭阶段

- **状态**：已验收（2026-09-07）；依赖：D2-2。
- 已在同一临时副本验证离线链接预览失败、缺失/损坏 PDF、保存失败、跨视图共享删除、不可写 JSON 导出，以及删除后立即撤销/完整重启。每条路径均观察到明确的失败提示或数据边界，没有静默成功。
- 发现并修复两个真实可靠性阻断：BlockNote 标题-only 修改此前不会进入 Markdown/sidecar 保存队列；损坏 PDF 在 WebKit 中可能只显示空白 iframe。现在标题失焦会序列化当前 blocks、触发 debounced save 和 flush，并以 `BlockNoteEditor.integration.test.tsx` 固定回归；PDF data URL 在挂载 iframe 前检查 `%PDF-` 签名，损坏内容显示 `Media file could not be loaded.`，并以 `AssetNode.test.tsx` 固定回归。目录不可写时 UI 同时显示 `Save failed` 和重试提示，恢复权限后下一次编辑可继续保存。
- 已补齐“本地编辑可离线、Link/AI 网络能力失败”的边界记录：BlockNote 在 `aiEnabled: false` 的本地配置下仍通过本地 sidecar RPC 保存，标题-only 集成回归和桌面 sidecar revision 检查均通过；`offline.invalid` Link 预览显示 `Retry preview` / `Preview unavailable`，网络请求抛错也固定为 `failed`；AI 未配置时本地 `/ai/chat` 契约返回带 CORS 的 `503`。没有可用凭据，因此不宣称真实供应商返回流的行为。
- D2 中直接修复可靠性问题并复测；只把确需新增交互或能力的问题转入 D3，避免无限循环扩张范围。
- **验收**：正向及故障流程通过；本地编辑、远程 Link/AI 失败和恢复边界均有步骤、实际结果与自动/桌面证据；没有新的可复现阻断，因此不新增 D3 交互。

### D3-1 按证据选择最小改进

- **状态**：待开始（条件任务）；依赖：D2 的具体问题记录。
- 每个候选先比较现有操作、轻量调整和新模型；优先使用前两者。
- 例如：如果资料入口难找，先改入口；如果卡片布局整理费时，先验证对齐/整理操作；只有导出顺序真的阻断工作时，才提出显式章节顺序，解决 OD-7。
- 网页剪藏、摘录溯源、自动大纲、更多小组件不自动进入本阶段。每个新能力必须明确不做什么。
- **验收**：在同一项目流程中复现旧问题，改后无需原绕路步骤；没有证据则记录“不新增功能”，阶段可结束。

## 6. 桌面验收脚本

### 正向流程

1. 从 D2-1 样例创建项目，导入 Markdown、图片、文件，粘贴 URL；取消一次文件选择，不残留空节点。
2. 编辑 Note，查看图片/PDF、播放音频；从内容视图回到画布，空间上下文仍清楚。
3. 创建工作分区并放入 Group，将可收纳资料移入 Folder；复制一个实例，验证克隆内容不意外共享。
4. 将允许 detach 的内容移到文库；关闭应用再打开，确认内容、标签、布局和入口仍在。
5. 搜索 Folder 内独有关键词、切到另一视图的结果、从文库放回资料；打开正确内容。
6. 新建“项目结论”Note，手写三条结论；通过已有标题/链接手动记录所依据的材料，不假设已有自动引用。
7. 导出支持范围内的笔记和附件，在外部文本编辑器与文件查看器中打开；逐项对照内容清单，确认附件相对路径与缺失说明。
8. 回到项目继续编辑，确认导出和搜索没有破坏原内容或永久改变视口。

### 故障流程

只在合成 workspace 副本或测试 mock 中注入故障，不修改用户真实数据。

| 故障 | 预期 |
| --- | --- |
| 关闭网络后继续编辑本地内容 | 本地编辑/整理可用；链接预览和远程 AI 失败可理解，不拖垮本地操作 |
| 附件或实例缺失/损坏、未知类型 | 可识别回退；不在保存时静默删除原记录；可重新访问或按显式流程处理 |
| 保存失败后切视图/关闭详情 | 清楚显示失败，不能以成功状态清掉尚未保存的编辑；具体关闭行为需与现有保存规则一致 |
| 同一内容跨视图引用后删一个实例 | 另一处内容仍可访问；永久删除与普通移除不混淆 |
| 导出目录不可写或附件缺失 | 错误与遗漏范围明确；不报告假成功，不覆盖损坏已有成果 |
| 撤销后立即重启 | 已确认保存的最终状态与重载一致；不将仅存在内存的撤销历史误称为可跨重启恢复 |

## 7. 验证、交付与第一批任务

### 每个实现变更的完成定义

1. 先加/更新对应行为测试，再实现最小修复；测试放在源码旁。修复通用规则，不为每个类型新增宿主特例。
2. 定向测试后运行 `bun run test`、`bun run type-check`、`bun run check`，命令以 [package.json](../package.json#L6) 为准。记录基线失败与新失败，不把未运行写成通过。
3. `bun run ci` 当前包含会写文件的 lint/format，不当作只读检查替代上述命令；若使用，检查所有额外 diff，不覆盖协作者改动。
4. 涉及桌面文件、录音、重启与持久化时，用 `bun run dev:hmr` 做实际应用验收，不能只凭 renderer-only 页面或 mock 下结论。
5. UI 变更附截图/录屏；文案同步本次受影响的语言；更新产品规则、子计划及阶段证据。功能代码与对应测试尽量作为一个可评审批次，不混入无关格式化。

### 验收记录模板

| 字段 | 必填内容 |
| --- | --- |
| 任务 / 状态 | 如 D1-2 / 待验收 |
| 验收对象 | commit 或工作区基线、操作系统、应用启动方式 |
| 样例 | 合成资料版本及初始状态 |
| 步骤与结果 | 预期、实际、失败复现；自动测试与人工验证分列 |
| 证据 | 命令结果、测试文件、截图/录屏或日志链接 |
| 剩余事项 | 阻断项、非阻断项及其去向 |
| 结论 | 通过 / 未通过 / 环境阻塞；验收人和日期 |

### 第一批实际执行

1. **D1-1**：定义统一的搜索目标与可达性契约，先覆盖顶层、Group、Folder、detached 和 unlinked。
2. **D1-2**：补齐 Folder 命中到打开的导航链路，包含跨画布保存/切换和失败恢复；已通过 2026-09-07 桌面点击走查。
3. **D1-3/4**：明确 detached / unlinked 找回规则并完成 D1 可达性矩阵验收；已通过文库放回、重启与内容一致性走查。
4. **D2-2/3**：用同一夹具完成正向项目流程和导出，随后注入失败场景并记录阻断点；D2 已完成整体验收，没有证据支持新增 D3 交互。
5. 公开插件线可独立从 **T0** 装载验证与旧运行时清理开始；其装载、SDK 和恢复证据不得替代 D1/D2 的基础流程验收。

**暂停规则**：遇到需要改变内容删除语义、迁移格式或用户原有访问能力的分歧，先记录到 PRD 未决策并确认；不要借“收尾”实施未经确认的破坏性变更。阶段内发现数据丢失或内容不可达，优先修复，不继续扩张 D3 功能。
