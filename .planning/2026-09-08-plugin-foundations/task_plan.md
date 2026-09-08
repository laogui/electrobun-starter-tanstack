# 插件基础设计整改

## Goal
根据 PRD §7.1，保留 D0–D2 已验收成果，修正保存一致性和插件 P0 协议缺陷，并明确后续真实容器验收顺序。

## Phases
1. PRD 与实现核对 — complete
2. 实例保存/撤销/并发回包一致性修复及回归 — complete
3. 插件兼容性、能力声明和消息入口修复及回归 — complete
4. 同步 PRD、开发计划和插件方案的职责/阶段/退出条件 — complete
5. 全量测试、类型与代码检查 — complete
6. 查证实际 Electrobun 容器能力与实验设计 — complete
7. 实现独立桌面探针，实测 HTML/通道/权限/重开 — complete
8. 记录候选取舍、回归与尚缺证据 — complete
9. QuickJS WASM 逻辑原型与视图候选复核 — complete
10. 打包应用 canary、资源限制、终止恢复与独立视图进程 — complete（独立 launcher 进程 canary 完成；WebKit 能力隔离失败）
11. 同步运行时取舍和门禁证据 — complete
12. 验证 CEF 视图容器与补充资源矩阵 — complete（CEF Chromium 147 能力隔离失败；打包 CEF 后 launcher 子进程并入已有会话）
13. 验证不注入 Electrobun 桥的操作系统级独立视图容器 — complete（零 handler WKWebView 无 bunBridge；拒绝 `network.client` 时 WebContent 无法启动；WKContentRuleList 拦截通过 loopback canary，这是宿主策略不是 OS 网络拒绝）
14. 对通过桥/网络 canary 的 helper 做强制销毁/重建与内存增长 — complete（helper 内销毁挂起页并重建、进程 SIGTERM 重建均通过；JS 分配 64MiB 后恢复页仍无 bunBridge/loopback。UI RSS 不代表 WebContent 堆）
15. 仓库外最小命令/面板样例与契约冻结 — complete（独立仓库 `ghostboard-plugin-samples`；命令 QuickJS 预览通过，面板 viewSessionId 重开更换；契约见 plugin-p0-frozen-contract.md。公开安装与 applyBatch 未冻结）
16. P1 标题整理 applyBatch / Undo / 重启恢复 — complete（标题-only 批次存储：冻结令牌、全有或全无、Undo 不覆盖较新 revision、落盘重启。未接到画布 UI）
17. 把标题批次接到 sidecar Note 实体 — complete（`openNotes` 读写 JSON sidecar，标题写入提升 revision；Undo/重启走 sidecar + journal。未更新内存画布节点）
18. 把标题批次投影到画布选区节点 — complete（选区收集 noteId；同一实体多处节点/folder child 同步标题；画布 Undo 恢复节点标题。sidecar 批次仍由 `runNormalizeTitlesOnWorkspaceNotes` 执行。无命令面板、无公开安装）
19. 用 RPC 把 sidecar 标题批次和画布投影接进产品窗口 — complete（`pluginNormalizeNoteTitles` / Undo / Redo；`normalizeSelectedNoteTitles` 投影选区；画布 Undo/Redo 命中批次快照时同步 sidecar。无命令面板、无公开安装、未做桌面走查）
20. 产品窗口入口与 CUA 桌面走查 — complete（Edit 菜单 / 右键「整理标题」；隔离工作区 CUA 跑 title-tools 写入 sidecar 并重启仍在。原生 `role:undo` 截走 Cmd+Z，未在桌面完成 sidecar Undo。无公开安装、无 helper 进产品窗口）
21. 画布 Undo 接到原生菜单 — complete（去掉 `{ role: 'undo'/'redo' }`，改为 `canvasUndo`/`canvasRedo` 经 `routeUndoRedo`。CUA 同会话：Normalize 后 Edit Undo，sidecar `Hello world` rev4 回到 `  Hello   world ` rev3，journal `undone: true`）
22. ZIP 安装实验 — complete（`loadPluginFromZip` 解包校验：根目录或单层包裹、穿越拒绝、重复/缺失 manifest、加密拒绝；title-tools ZIP 可跑 normalize-titles。无产品 UI、无公开安装、无 URL 下载）
23. URL 下载安装实验 — complete（`loadPluginFromZipUrl`：默认 HTTPS；loopback HTTP 仅显式允许；拒绝 userinfo/HTML/JSON；loopback 重定向后解包 title-tools。无产品 UI、无公开安装）
24. 非公开安装事务与 journal — complete（`PluginInstallStore`：prepare/commit/cancel/fail；`packages/<id>/<version>/<digest>`；未提交 recover 取消，committing 补完。CLI 把 fixture ZIP 提交到临时根。无设置页、无公开安装、提交后不激活）
25. 发布描述 JSON 解析 — complete（`parsePluginReleaseDocument`：schema/id/https/sha256/hostApi；选当前 host 可用的最高版本；digest 与 manifest 对齐。不下载、无签名、无产品 UI）

## Decisions
- 不重写工作区格式，不扩张四类插件既定首版范围。
- 本批完成基础整改；真实 Web 容器、跨平台隔离、安装及内容批次事务保留明确退出门槛，不虚报已完成。
- Undo 内容与持久化 revision 分离；同实例写请求串行，执行时取最新内容，回包不得覆盖更新的本地编辑。

## Next Step
ZIP/URL 事务和发布描述 JSON 解析都已在宿主侧就绪。下一步不要接公开安装或设置页；可停在这里，或等视图容器过 canary 后再谈激活。签名更新仍属 P4。

## Errors
- 两次工具编排字符串语法错误，均在执行前失败；拆为 apply_patch 和独立脚本后完成，无文件部分写入。
- 一次 rg 路径通配无匹配；已用实际源码路径定位，未影响实现。
- 全仓 check 初次发现 HEAD 已有 workspace.ts import 被函数隔开；归拢 imports，无行为改动，复跑通过。
- 实验 launcher 加载固定 index.js，main.ts 构建产物未被启动；改为 index.ts。只终止本实验创建的挂起进程。
- 内联函数含 script 结束标签，导致脚本截断；转义后运行。loadHTML 路径还出现一次超时，改用 loopback HTTP 页面获得稳定报告。
- WebKit 不支持该页面的 crypto.randomUUID，改用 Bun 宿主签发身份；已销毁 WindowProxy 不能作为 MessageEvent source 构造，旧来源测试明确标为合成接收器调用。
- 一次原生 CUA 获取实验应用状态超时；未声称人工视觉/输入法验收。
- 打包 CEF 后再 spawn 同一 launcher，子进程输出 `Opening in existing browser session.`，没有身份标记。保留该失败，不把它写成进程隔离通过，也不回滚 native-only 的既有进程 canary。
- OS helper 第一次把页面结果写在 fetch 之前，原生侧提前收走不完整 JSON；改为等 `network` 字段后再采集。
- App Sandbox 去掉 `network.client` 后 WebContent 立即退出；补 JIT entitlement、关掉 hardened runtime 同样失败。记录为该路径不能承载视图，不写成网络隔离通过。
- 生命周期 hang 页第一次未调用 IIFE（无参数时少了 `()`），`__STARTED__` 未设置；补上调用后 `for (;;) {}` 使 `evaluateJavaScript` 超时。WKWebView 把 JS 布尔值收成 NSNumber，检测改为 truthy。
- `WKProcessPool` 在 macOS 12+ 已无隔离效果，已从 helper 删除，不以进程池作为恢复手段。
- 在样例目录执行 `git init` 时误用了宿主仓库 cwd，触发一次宿主提交；已 `git reset --mixed HEAD~1` 撤销。样例仓库随后在 `../ghostboard-plugin-samples` 单独初始化。
