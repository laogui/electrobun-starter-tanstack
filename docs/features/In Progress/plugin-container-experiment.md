# P0 运行容器实验：当前候选未通过

日期：2026-09-08。范围：macOS 26.6.2 arm64、Electrobun 1.18.1。GhostBoard 产品配置仍为 native WKWebView、`bundleCEF: false`。独立探针应用在同一 Electrobun 版本下额外打包 CEF Chromium 147.0.7727.118。桌面应用携带 Bun 1.3.13，本机 CLI 为 Bun 1.3.14。

## 结论与实施决定

**WebKit 视图、CEF 视图和旧 Worker/VM 均不能接入不可信第三方插件。独立 launcher 进程原型在未打包 CEF 时完成过进程边界 canary，但它携带的 native WebKit 仍可访问网络并暴露底层桥；打包 CEF 后，第二次 launcher 会并入已有 Chromium 会话，进程身份 canary 失败。不经过 Electrobun 的 macOS WKWebView helper 不再出现 bunBridge；去掉 `network.client` 的 App Sandbox 无法启动 WebContent。带 `WKContentRuleList` 全拦截的 helper 在对照可联网的前提下挡住了 loopback fetch/WebSocket，这是宿主策略，不是操作系统拒绝网络。QuickJS WASM 逻辑候选通过本机边界探针。P0 仍保持实施中，公开安装和 P1 正式外部运行不启动。**

1. 原生 `sandbox: true` 不阻止普通 fetch。测试 loopback 服务器实际收到了 `/forbidden/native-fetch`，不能将这个配置当作网络权限隔离。
2. `sandbox: true` 的原生窗口内再放置 `sandbox="allow-scripts"` iframe，并不能隔离原生桥。子框架通过 `window.webkit.messageHandlers.bunBridge.postMessage` 调用了仅供实验的 `containerCanary`。宿主记录两次调用，分别对应打开与重开。没有向子框架显式注入这个接口，没有使用正式应用 RPC 或用户数据。
3. 旧 Worker + VM 的上下文包含宿主创建的 `module` 对象。可信测试源通过 `module.constructor.constructor` 取得宿主函数构造器，能观察到 `process` 与 `Bun`。Worker 可终止性不等于能力隔离，不能在这个上下文执行下载包。命令入口现已切换到每次调用创建独立 QuickJS WASM module 的实现；QuickJS 探针确认宿主全局不可见、显式 JSON host-call 可用、BigInt/循环引用拒绝、循环/未决 Promise 超时、内存上限生效且不同调用不共享全局。
4. 独立 launcher 进程可以创建自己的窗口并以不同 PID 完成报告，说明进程生命周期可以单独回收；但子进程中的 native WebKit 仍然能访问 loopback 网络，页面仍看到 `bunBridge`/`internalBridge` 对象。进程分离本身不能替代桥和网络策略，因此该候选仍被拒绝。
5. 探针打包 CEF 后，`renderer: "cef"` 且 `sandbox: true` 的窗口实际使用 Chrome/147 user agent，但 Electrobun 创建日志写的是 `sandbox: NO`。页面没有 `webkit.messageHandlers`，却有 `__electrobunBunBridge` 对象；在注册了实验 RPC 时，宿主收到 21 次 `containerCanary`（1 次探测 + 20 次风暴）。loopback fetch、WebSocket、blob Worker、localStorage 和 navigationRules 之外的 iframe 导航均成功。不注册应用 RPC 并不能去掉该桥对象。
6. 同一探针在已有 CEF 会话时再启动 launcher 子进程，子进程打印 `Opening in existing browser session.`，没有报告独立窗口身份。这不能推翻此前 native-only 的进程生命周期 canary，但说明 CEF 单例会话使该路径失效。
7. 独立 Swift helper 创建 WKWebView，从不调用 `WKUserContentController.add(_:name:)`，也不链接 Electrobun。页面上 `window.webkit`、`bunBridge`、`__electrobunBunBridge` 均为 undefined，canary 未发出。未沙箱和“沙箱但允许 `network.client`”的对照仍能 fetch/WebSocket 打到 loopback 服务器。
8. App Sandbox 去掉 `network.client` 后，WebContent 进程立即终止，页面结果为空。补 `allow-unsigned-executable-memory` 并关掉 hardened runtime 同样失败。该路径不能承载插件视图，不能把它写成网络隔离通过。
9. 同一 helper 在保留 `network.client` 的沙箱里编译 `url-filter: .*` 的 `WKContentRuleList` 后，loopback fetch、WebSocket 和导航请求均未到达测试服务器，页面报告 `network/websocket` 为 false。对照运行证明拿掉这条规则后网络立刻恢复，因此这是宿主策略，不是操作系统拒绝网络。

不得以隐藏全局变量、前端代理函数、删除对象属性或再包一层 iframe 关闭上述问题。未修复的 native message handler 或宿主对象仍可成为入口；改动后必须重跑原始 canary。把 content blocker 从 helper 里拿掉也必须视为候选失败，需要重跑 canary。

## 证据

原始桌面结果：[webkit.json](./plugin-container-evidence/2026-09-08/webkit.json)，追加的无 RPC 对照：[webkit-no-rpc.json](./plugin-container-evidence/2026-09-08/webkit-no-rpc.json)，补充资源矩阵：[webkit-resource-matrix.json](./plugin-container-evidence/2026-09-08/webkit-resource-matrix.json)。旧逻辑失败结果：[本机 Bun](./plugin-container-evidence/2026-09-08/logic.json)、[应用携带 Bun](./plugin-container-evidence/2026-09-08/logic-bundled.json)。QuickJS 结果：[本机](./plugin-container-evidence/2026-09-08/quickjs.json)、[打包应用](./plugin-container-evidence/2026-09-08/quickjs-bundled.json)。独立进程结果：[isolated-view-process.json](./plugin-container-evidence/2026-09-08/isolated-view-process.json)。CEF 结果：[cef.json](./plugin-container-evidence/2026-09-08/cef.json)，完整一次运行：[cef-run.json](./plugin-container-evidence/2026-09-08/cef-run.json)，CEF 子进程失败：[isolated-cef-view-process.json](./plugin-container-evidence/2026-09-08/isolated-cef-view-process.json)。操作系统级 WKWebView helper：[os-webview.json](./plugin-container-evidence/2026-09-08/os-webview.json)。销毁/重建与内存：[os-webview-lifecycle.json](./plugin-container-evidence/2026-09-08/os-webview-lifecycle.json)。仓库外样例：[out-of-repo-samples.json](./plugin-container-evidence/2026-09-08/out-of-repo-samples.json)。探针源码和复现步骤：[README](../../../scripts/plugin-container-probe/README.md)。

| 检查 | 结果 | 可以得出的结论 |
| --- | --- | --- |
| 原生 sandbox 常规 RPC facade | 未发现 `__electrobun` | 仅说明 facade 不存在，不说明底层桥不可调用 |
| 原生 sandbox fetch | 成功，服务器收到请求 | 该配置单独不能执行网络拒绝策略 |
| 原生窗口不注册 RPC 的对照 | `__electrobun` 仍不可见，但 `bunBridge`/`internalBridge` 对象仍存在；canary 未到达本实验 handler | 删除应用 RPC handler 不能当作桥隔离，也不能解决网络访问 |
| iframe 父文档访问 | 两次均失败 | 当前 sandbox 标记下此路径被阻止 |
| iframe fetch / 临时 file fetch / localStorage | 两次均失败 | 当前测试路径被阻止；不能外推完整文件/网络隔离 |
| iframe 底层原生桥 | 宿主 canary 两次被调用 | 候选失败；不是仅根据属性存在推断 |
| iframe 生命周期 | 两次握手成功、身份更换、两条伪 nonce 被拒绝 | 实际打开/移除/重开路径可用 |
| 旧来源校验 | 合成旧 WindowProxy 消息被接收器拒绝 | 只验证接收器条件；不是迟到事件的端到端验证 |
| 独立 launcher 进程 | launcher/app worker PID 与父探针不同，子窗口正常报告并退出码为 0 | 进程生命周期边界可用；子进程 native WebKit 仍暴露底层桥且网络请求成功，候选失败 |
| native sandbox 资源矩阵 | fetch、WebSocket、blob Worker、localStorage、navigationRules 外 iframe 均成功；file URL 仍失败 | 网络/存储/子资源路径失败，不只是普通 fetch |
| CEF sandbox + 应用 RPC | Chrome/147 UA；`__electrobunBunBridge` 为 object；宿主收到 21 次 canary；fetch/WebSocket/Worker/storage/导航成功 | 切换 renderer 不能当作隔离；候选失败 |
| CEF sandbox 且不注册应用 RPC | 页面仍能对 `__electrobunBunBridge` 调用 postMessage；loopback 网络同样成功 | 删除应用 RPC 不能去掉 CEF 注入的桥 |
| CEF 创建日志 | `DEBUG CEF: ... sandbox: NO`；dev 构建监听 `127.0.0.1:9222` | 不能把 Electrobun `sandbox: true` 写成 Chromium 进程沙箱已启用 |
| CEF 下再启动 launcher 子进程 | 子进程输出 `Opening in existing browser session.`，没有身份标记 | 该进程 canary 在 CEF 单例会话下失败，不作为安全通过 |
| VM 宿主全局 canary | `process` / `Bun` 可见 | 当前逻辑容器不能执行不可信代码 |
| QuickJS WASM 宿主全局 canary | `process` / `Bun` / `require` 均不可见 | 本机与打包应用逻辑候选通过；仍需更完整的异步/资源压力矩阵 |
| QuickJS WASM JSON/资源 canary | BigInt/循环引用返回 `protocol-error`；循环和未决 Promise 返回 `timeout`；超大字符串和超过 8 次的 host-call 风暴返回 `resource-limit` | 逻辑候选具备可执行的资源和消息门槛；不等于进程级平台沙箱 |
| OS helper 零 script-message-handler | `window.webkit` / bunBridge / `__electrobunBunBridge` 均为 undefined；canary 未发出；otool 无 Electrobun | 不经过 Electrobun BrowserWindow 可以去掉底层桥 |
| OS helper 未沙箱 / 沙箱允许网络 | loopback fetch 与 WebSocket 到达测试服务器；导航 iframe 被 `WKNavigationDelegate` 取消 | 零 handler 不等于网络隔离；导航拒绝是宿主代理策略 |
| OS helper App Sandbox 拒绝 `network.client` | 沙箱已应用，但 WebContent 立即终止；补 JIT entitlement 同样失败 | 该 OS 网络拒绝方式不能承载视图 |
| OS helper 沙箱 + `WKContentRuleList` 全拦截 | 测试服务器无 fetch/ws/nav 命中；页面 `network/websocket` 为 false；对照拿掉规则后网络恢复 | 桥和 loopback canary 通过；这是宿主内容规则，不是 OS 拒绝网络；未测 WebRTC 等旁路，也未接入 GhostBoard |
| OS helper 无限循环销毁/重建 | JS `for (;;) {}` 后 `evaluateJavaScript("1+1")` 超时；UI 心跳 3→13；销毁后恢复页无 bunBridge、无 loopback 命中 | helper UI 线程不被页面死循环拖死，可丢弃 WKWebView 再挂一页 |
| OS helper 内存增长后重建 | 页面报告分配 64MiB；helper UI RSS 约 76MiB 几乎不变；销毁后再挂恢复页仍无桥/网络 | 证明 helper 进程还活着并能重建；不能把 UI RSS 写成 WebContent 堆被回收 |
| OS helper 进程 SIGTERM 重建 | 挂起 helper PID 7286 退出码 143，无残留 `OsWebViewHelper`；新 PID 8855 恢复页桥/网络通过 | 编排进程可以杀掉失控 helper 再开一个；不证明 WebKit XPC 子进程账本 |
| 仓库外命令/面板样例 | 独立目录加载 title-tools 与 notes-panel；命令预览通过；面板两次 viewSessionId 不同；无私有导入、无 instanceId | 包契约可在宿主仓库外验证；不等于公开安装或产品窗口已接入 |

整个实验只创建临时哨兵文件、本地回环服务器与独立窗口/子进程/helper；canary 只返回固定字符串，逻辑探针只检查全局变量是否存在。子进程继承 launcher 启动所需的环境变量，但不会把这些值注入页面或写入报告；探针没有读取用户工作区或凭据。OS helper 通过 stdin 接收测试 HTML，用 `evaluateJavaScript` 回收结果，页面不向宿主注册 message handler。

本轮工程回归：探针独立 TypeScript 检查仍为 0 项项目错误（过滤 1 项既有 `three` 依赖诊断）。产品隔离矩阵字段未改成 verified。未重跑全仓 Vitest。自动化通过不改变 P0 未整体验收的结论。

## 下一项工程任务

QuickJS WASM 逻辑入口已经在本机和打包探针复测通过。native WebKit、CEF Chromium 147 和独立 Electrobun launcher 都没有通过视图能力隔离。macOS 上不经过 Electrobun 的 WKWebView helper 已经通过桥 canary；拒绝 `network.client` 的 App Sandbox 不能启动 WebContent。当前可运行的视图候选是 **独立 helper + 零 script-message-handler + 宿主 `WKContentRuleList` 拦截 + 导航代理拒绝**。该 helper 已通过无限循环销毁/重建、进程杀掉重建，以及 64MiB JS 分配后的恢复页 canary。仓库外样例已验证命令和面板包，最小契约见 [plugin-p0-frozen-contract.md](./plugin-p0-frozen-contract.md)。不能把 content blocker 写成操作系统网络沙箱，不能把 helper UI RSS 写成 WebContent 内存上限，也不能把它接到 GhostBoard 产品窗口里冒充已验收。P1 标题-only `applyBatch` 已写入 sidecar Note（提升 revision）。2026-09-08 CUA：隔离工作区 Edit「Normalize Titles」把 `  Hello   world ` 写成 `Hello world` 并重启仍在；随后自定义 Edit Undo 把 sidecar 拉回原标题。宿主 `loadPluginFromZip` / `loadPluginFromZipUrl` 可从 ZIP 或显式允许的 loopback URL 加载 title-tools；公开安装仍关闭。

逻辑入口继续保持宿主全局、JSON、资源上限、终止恢复和跨调用状态 canary；视图入口仍必须通过原生桥 canary、网络、文件和生命周期矩阵。两条门槛分别记录，不能用逻辑候选的通过替代视图隔离。

任何必要的宿主通信只有专用、可校验、可撤销的通道，按进程/视图真实来源绑定会话，而不是相信消息自报 ID。当前 native WebKit 和 CEF 都有底层 bridge 和网络失败证据，不得接入公开面板。GhostBoard 产品继续保持 `bundleCEF: false`；CEF 和 OS helper 都只存在于探针证据中。

逻辑路径采用 QuickJS WASM 的显式句柄边界；若后续改为独立进程，文件、网络和子进程权限还需由平台约束验证。仅把现有 VM 搬到另一 Bun 进程不能满足要求。QuickJS 的同进程优势是可控 API 和资源终止，剩余风险由打包应用 canary、依赖升级锁定和必要的进程级隔离继续验证。

WebSocket、Worker、导航 iframe 和 canary 风暴已在失败的 WebKit/CEF 候选上测过，结果同样拒绝。OS helper 的内容规则候选挡住了 fetch/WebSocket，也把 blob Worker 一起挡住；导航由 `WKNavigationDelegate` 取消。无限循环时 helper UI 仍心跳，销毁 WKWebView 后可再挂恢复页；编排侧 SIGTERM 可杀掉 helper 再开。64MiB 分配后恢复页仍无桥/网络，但 helper UI RSS 几乎不动，WebContent 堆没有独立计量。尚未测量 WebRTC、跨工作区恢复。IME、焦点、剪贴板、实际旧 epoch 投递、Windows/Linux，以及 GhostBoard 编辑保存/撤销/重启桌面回归仍待完成。本轮没有这些项目的通过证据。

## 文档与实现核对

- [Electrobun BrowserWindow 文档](https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/browser-window.mdx) 描述 sandbox 与导航选项；实验使用仓库实际安装的 1.18.1 接口 `electrobun/bun`。
- 本地 `BrowserView.ts` / `index-sandboxed.ts` 说明 sandbox preload 移除常规 RPC；不能据此替代原生 handler 的运行测试。
- 本地 `proc/native.ts` 的 `bunBridgePostmessageHandler` 将原始消息转给对应 webview 的 RPC handler；canary 用实际调用检查这条路径。
- [Electrobun bundling CEF 文档](https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/bundling-cef.mdx) 说明 `bundleCEF` 与 `renderer: "cef"`；探针仅在独立应用启用，产品配置未改。
- CEF `OnContextCreated` 会预先设置桥对象，sandbox preload 里的 `window.__electrobunBunBridge = window.__electrobunBunBridge || ...` 会保留它。运行结果与该顺序一致。
- Apple `WKUserContentController.add(_:name:)` 只会在调用后安装 `window.webkit.messageHandlers.<name>.postMessage`；helper 从不调用该方法。`WKWebsiteDataStore.nonPersistent()` 只保证不落盘，不隔离网络。
- `WKContentRuleList` 全拦截与 `WKNavigationDelegate` 取消是宿主策略。对照在同一 entitlement 下不加载规则时 loopback 仍然成功，因此不能写成 App Sandbox 拒绝了网络。
- 当前 SDK 标注 `WKProcessPool` 多实例不再有效；helper 靠销毁 `WKWebView` 和杀掉 helper 进程恢复，不以进程池当隔离。
- 当前发布门槛仍是 [整改方案 §11 / §19](./public-plugin-platform-redesign.md)，不因局部可运行而降低。
