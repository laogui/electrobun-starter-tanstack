# 高信任插件 T0：macOS 发行包验收

日期：2026-09-09。依据：[现行方案](trusted-plugin-platform.md) §4、§9.1、§10。

## 结论

**T0 的 macOS arm64 装载门槛通过。** 使用 `electrobun build --env=canary` 生成的真实发行归档，解包后运行归档内的原生 launcher、内置 Bun 和 WKWebView。不是 Vite 开发页、浏览器模拟或内存运行器。插件样例复制到仓库外、应用 bundle 外的临时目录后原样运行，没有插件构建或依赖安装。

本次应用未签名、未公证，证明运行机制，不证明 Gatekeeper、安装器交互或公开分发资格。没有声称通过 Linux / Windows 验收，也没有启动 T1 正式 SDK。

## 环境与复现

- macOS 27.0（26A5416b），arm64。
- Electrobun 1.18.1，发行包内 Bun 1.3.13；构建用 Bun 1.3.14。
- React / ReactDOM 19.2.5，Vite 8.0.9。
- 页面地址：`views://mainview/index.html`，macOS 原生 WKWebView，`bundleCEF: false`。

```sh
bun run test:plugin-t0
```

要求 Bun、Node、macOS 打包工具和 `tar` 所用的 `zstd` 在 PATH 中。脚本：

1. 创建新的临时目录及独立 `GHOSTBOARD_DATA_DIR`，不使用用户工作区；复制两个外部插件和只用于拒绝验证的 v1 记录。
2. 以 `VITE_PLUGIN_T0=1` 构建宿主，检查 import map 出现在所有模块之前，检查七个稳定模块文件存在。
3. 将 canary 产物写入 `build/plugin-t0-artifacts/`，避免 Electrobun 重建默认 `artifacts/` 时覆盖其他文件。
4. 解开发行归档并启动其中的 `.app/Contents/MacOS/launcher`，用真实本地 HTTP 与文件系统执行验证。
5. 收集页面检查、包 SHA-256、运行时路径，自动关闭此次测试进程。失败或无报告时返回非零，不推进 SDK。

终端输出证据目录。其 `result.json` 是宿主收到的 renderer 检查，`package-evidence.json` 记录包指纹和运行路径，`index.html`、`vite.log`、`package.log`、`app.log` 用于复核。报告使用原子写入；等待文件时不复用会缓存“不存在”结果的 `Bun.file()` 实例。

## 真实应用结果

| 检查 | 结果与证据 |
| --- | --- |
| 本地 HTTP `import()` | PASS；插件读到同一个 `document`，不是另一个 realm |
| 相对模块 | PASS；入口加载 `./label.js`，继承带 token 的目录前缀 |
| 无构建 JS 命令 | PASS；从 `@ghostboard/sdk` 导入 `definePlugin`，命令返回预期结果 |
| import map | PASS；`react`、`react-dom`、`react-dom/client`、`react/jsx-runtime`、`@ghostboard/sdk`、`@ghostboard/sdk/react` 均实际被导入 |
| React 单实例 | PASS；插件与宿主的 `useState`、`flushSync`、`createRoot` 引用相等，插件按钮从 `count:0` 更新到 `count:1` |
| SDK 单实例 | PASS；插件的 `definePlugin` 与宿主引用相等，插件调用到宿主已配置的传输实例 |
| 独立 root | PASS；面板使用独立 `createRoot`，卸载后容器为空且 effect disposer 已调用，宿主画布仍挂载 |
| `net.fetch` 宿主代理 | PASS；发行包 Bun 请求 `https://example.com/`，HTTP 200，正文包含 `Example Domain` |
| `files` 读写 | PASS；插件经宿主写入并读回 UTF-8 文本 `GhostBoard T0 file roundtrip ✓` |
| v1 拒绝与提示 | PASS；真实宿主目录加载器拒绝 v1，管理列表返回 `legacy`、未启用和“旧契约，需重新安装 v2 版本” |
| 旧数据保留 | PASS；v1 fixture 的用户数据和画布内容标记未改变 |

机读结果见 [trusted-plugin-t0-result.json](trusted-plugin-t0-result.json)，运行时间为 2026-09-09 14:45:24–25 UTC；发行归档 SHA-256 为 `232cb11f9feb23b0516c3497fb7db52795b7a0776d619f0f2602013ffaf68699`。T0 临时接口仅在显式构建开关和运行环境变量下使用，不是对外发布的 SDK 契约。

补充回归：`bun run type-check`、`bun run check`、普通 canary 构建均通过；串行 `bun run test` 为 **181 个测试文件、1614 个测试全部通过**。普通构建的 renderer 不包含 T0 SDK 模块。

## 落地细节

- `import()` 不能附加 Authorization header，入口的 query token 不会传给相对 import。因此先在方案 §4.1 明确 `/plugins/<launch-token>/<id>/<version>/` 静态挂载前缀。宿主服务仍使用 Authorization header。token 不代表插件权限，静态响应设置 `Referrer-Policy: no-referrer`。
- Vite 使用稳定入口和 `host-react-runtime.js` 手工分块，宿主与插件门面引用相同实现。React 是 CommonJS 包，`export *` 无法让 Rolldown 枚举其对外导出，门面必须显式导出公开符号。
- 普通构建不注入 T0 测试 SDK/import map 项或自动运行测试。`files` / `net` 实验桥没有路径或域名白名单；安装路径校验和静态目录防穿越仍保留，属于可靠性而非权限沙箱。

## 第一批旧代码处置

已删除方案 §9.1 指定的旧运行器、权限/session/host-call 信封、容器实验脚本与旧样例；去掉直接 `quickjs-emscripten` 依赖及 wasm 拷贝。锁文件中的 `@tootallnate/quickjs-emscripten@0.23.0` 是 Electrobun → proxy-agent → pac-proxy-agent 的间接依赖，不是插件运行时，本轮不修改第三方 Electrobun 的依赖图。

保留安装事务、ZIP/HTTPS 下载与摘要、manifest/ID/版本校验、内容批次、管理页和本地服务。管理页现在展示高信任确认、能力自述、签名未验证和更新来源；安装改为应用级，启用配置按工作区保存，旧授权不迁移。T4 前拒绝同 ID 的版本替换，避免未经签名校验的更新路径。

**尚未完成：** T1 激活/注册清理和正式 SDK；T2 通用内容接口；T4 签名、更新恢复和安全模式。设置页明确提示“启用”目前只保存配置。现有 `contentBatch` 保留冲突、Undo/Redo 和 journal 行为，但不能据此宣称写入中途故障的全批次原子回滚或并发提交串行化已通过。

## 平台差异与后续门槛

| 平台 | 本次状态 | 仍需验证 |
| --- | --- | --- |
| macOS arm64 / WKWebView | 本机发行包通过 | 支持范围内的更早 macOS、签名/公证、实际安装器流程 |
| Linux / WebKitGTK（配置未捆绑 CEF） | 未运行，不宣称支持 | 系统 WebKitGTK 版本的 import map、自定义 scheme 到 HTTP 的 CORS、模块 MIME、完整代理与生命周期 |
| Windows / WebView2（配置未捆绑 CEF） | 未运行，不宣称支持 | WebView2 版本、自定义 scheme/本地 HTTP 装载、import map、文件路径和完整生命周期 |

后续任一平台若实测否定装载机制，先修订方案 §12，不引入隐藏 fallback、隔离容器或兼容旧运行器。
