# 高信任插件 T1：命令、面板与追加 A1–A3 验收

日期：2026-09-09。依据：[主方案](trusted-plugin-platform.md) §5.5、§10 和 [追加 1](trusted-plugin-platform-addendum-1.md) §1–3、§8。

## 结论与重载语义

**T1 命令/面板闭环及追加 A1–A3 在 macOS arm64 的真实发行包通过。** 已采用确认后的语义：候选 `setup` 失败时，旧实例原样继续运行，不 abort、不卸载、不重新激活，保留同一 React root 及其状态。

原追加文本同时要求“先销毁旧实例”和“失败时保留旧实例”，两者无法同时实现。追加 §2 已修订为：候选 import/setup 期间暂存宿主注册，成功后才 abort/清理旧实例并发布新注册。两代代码可能短暂同时运行，但宿主只有一代已发布注册。候选失败只清理候选。

这不是对任意 JavaScript 的事务或沙箱。插件直接修改 DOM/全局状态、写文件、请求网络、自建 Worker 等副作用不能通用回滚；超时 cleanup 也不能强制停止任意异步代码。后续 SDK 异步服务的 signal 绑定随各阶段交付，不借 T1 宣称 T2/T3 已实现。

## 复现方式与保真范围

```sh
bun run test:plugin-t1
```

脚本要求 macOS arm64、Bun、Node 及打包工具在 PATH 中。它依次：

1. 创建仓库外的插件目录、独立应用数据目录；连接/启用不使用真实用户工作区。
2. 通过 `plugin:create --react` 生成独立作者项目，安装公开依赖和本地 SDK 副本，独立执行 type-check、默认构建与可选 global shim 构建。
3. 以 `VITE_PLUGIN_T1=1` 构建 canary 归档，产物写入专用 `build/plugin-t1-artifacts/`，不重建默认 `artifacts/`。
4. 解包真实 `.app.tar.zst`，运行归档内的原生 launcher、Bun 1.3.13 和 WKWebView。页面为 `views://mainview/index.html`，不是 Vite 页面或浏览器内存模拟。
5. 通过真实管理服务、renderer RPC、HTTP 模块路由和生产 `PluginRuntime` 验证命令、面板、修改源文件后的自动重载与停用。
6. 保留一个工作区的启用配置，退出测试应用、选择第二工作区后重启同一归档，验证应用级开发目录仍在但启用/执行不串工作区。

测试专用 `/plugin-t1/prepare` 仅将白名单 fixture 的已批准路径交给真实目录审阅服务，替代手动点击原生文件夹选择器；提交/启用/停用走真实 RPC。**没有自动化点击原生目录选择器**，其 RPC 接线由单元测试覆盖。正常构建不会自动运行这些验收脚本。

本次未请求签名或公证，不证明 Gatekeeper 或公开安装器流程。Linux、Windows 未运行，不宣称通过。

## 真实应用检查

| 领域 | 结果 |
| --- | --- |
| 连接、信任与旧包 | 审阅/连接不执行代码；启用后执行；v1 开发目录被拒绝 |
| JS 与 React | 无构建 JS 命令和 DOM 面板；React hooks、独立 root、关闭/重新打开、错误边界与恢复均通过 |
| import 失败 | 旧实例 signal 未 abort，同一按钮 DOM 与 `react:1` 状态不变，旧图仍 HTTP 200 |
| setup 失败 | 候选命令/面板/打开关闭请求未生效；旧命令继续可用；只 abort/清理候选，旧 root/state 不变 |
| 延迟相对 import | 失败候选之后，原实例第一次执行 `import('./lazy.js')` 仍读取原快照 |
| 成功交接 | 新候选成功后旧 signal abort；异步 cleanup 按逆序完成且没有重复；旧 root 移除，新命令发布，旧图经 release 后变为 404 |
| generation | 原实例为 1；import 失败消耗 2；setup 失败候选为 3；成功接管为 4，旧实例不被重建 |
| 取消与停用 | 延迟 setup 停用时收到 abort，晚到注册不会复活；运行实例停用也收到 abort；真实已登记 Worker 停止发送 ticks |
| 自动/手动重载 | 修改相对模块使整个图更新；手动重载取得新图；无重复命令；快捷键不拦截输入框编辑 |
| A1 | 15 个 `--gb-*` 名称/角色冻结在 SDK README；模板自带可编辑 Button/Input/Surface 源码；真实面板主题变量随 light/dark 变化 |
| A3 | 全局对象冻结，五个 native 模块 namespace 与 import-map 导入严格相等；独立作者项目的默认构建及 global shim 构建均可点击 React 计数器 |
| 跨工作区重启 | 五个应用级开发目录保留，第二工作区不继承启用，也没有执行插件代码 |

机读结果见 [trusted-plugin-t1-result.json](trusted-plugin-t1-result.json)，保留归档 SHA-256、运行路径及各检查结果。2026-09-09 最终生命周期检查为 15:45:49–15:46:01 UTC，跨工作区重启为 15:46:02–04 UTC。归档 SHA-256：`95c795185f4eb88817875aabd13f6a49a8f0050c1baaab7aafd93524f7dce18f`。

## 最终回归

- `bun run test`：**190 个测试文件、1676 个测试全部通过**，包括 abort 回调同步触发停用/销毁/工作区切换时，不被外层旧重载请求覆盖的重入回归。
- `bun run type-check`、`bun run check`、`git diff HEAD --check`：通过；类型检查继续按仓库既有规则忽略 29 个 Electrobun 依赖源码诊断。
- `GHOSTBOARD_BUILD_ARTIFACT_DIR=build/plugin-normal-artifacts bun run build:canary`：普通非探针构建通过。
- `bun run test:plugin-t0`：原始装载、React/SDK 单实例、真实 HTTPS 代理、文件读写及 v1 数据保留回归通过。此次 T0 回归为 15:41:21–22 UTC，归档 SHA-256 为 `69defa8c8bfb0e31b611c6aaf443867437e1ca6deef1943ebdd4ff6e6a3ec65e`。
- 上述构建、Paraglide 生成与 Vitest 串行执行；最终生成的 `src/paraglide/runtime.js` 与 HEAD 无净差异。

## 实现边界与后续阶段

- 独立 SDK 位于 `packages/plugin-sdk/`，源码可复制或本地安装，不表示已发布 npm。T1 导出命令、面板、cleanup、Worker 跟踪、generation 和 signal；不导出宿主私有 store/UI 组件。
- 主进程按 UUID 保留不可变模块图，renderer 清理后用 bearer 认证的 `/plugins/release` 释放，失败通知可重试。与 `PluginContext.generation` 的数字计数不同。
- 失败候选保留 descriptor/digest 记录，避免轮询重复执行坏代码；代码变化或手动重载才产生新候选。失效 manifest 保留启用偏好，用户仍可明确停用旧实例。
- 单元测试补充覆盖无法在重启后的同一个 JS realm 观察的工作区取消竞态，以及候选被取代、交接 cleanup 中停用、cleanup 抛错/超时、release 重试、非法 release、损坏 manifest 和静态目录路径校验。
- A4 的 KV/事件/任务归 T2；A5 testing 子包归 T3/T5；A6 单文件完整参考和外部作者试用归 T5。完整文件服务、内容事务、画布类型、签名更新和安全模式不计入本次结果。
