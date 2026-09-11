# T2 第七批：自定义画布类型

日期：2026-09-10（Asia/Singapore；机器结果为 UTC）。

状态：**第三方交互卡片的注册、编辑、持久化、重启、搜索、迁移及缺失插件展示已通过 macOS arm64 发行包验证。T2 尚未整体完成。**

## 行为变化

- 正式 SDK 新增 `app.canvas.registerType(definition)`。插件只声明本地 kebab-case ID；宿主把它绑定为 `${pluginId}/${id}`，持久数据不会被另一插件冒领。定义包括 dataVersion、初始 JSON 状态、状态校验、React component、宿主摘要、可选 preview、尺寸/详情行为及可选迁移。
- 注册先保存在候选 activation 内。setup 失败时不发布任何候选卡片；成功交接时用 owner + generation 一次替换该插件的全部类型。旧代清理带 generation 检查，不会误删新代。停用插件只移除可执行 React 定义，不删除实例 JSON、画布放置或摘要。
- 卡片状态沿用现有 `.ghostboard/extension-instances/<id>.json`：opaque JSON、canvasTypeId、dataVersion、revision、时间戳和宿主净化的 presentation。记录式更新进入现有卡片撤销/重做路径、延迟持久化并递增 revision；摘要同时刷新，供搜索、可访问文本、JSON 导出及插件缺失占位使用。
- `summarize` 只产生纯文本 title/subtitle/plainText/accessibilityLabel 和受限 accentColor；宿主会去除标记并裁剪长度。状态拒绝函数、Date/Map、自定义 prototype、非有限数字、循环和 `undefined`，实例 envelope 继续受 1 MiB 限制。
- dataVersion 升级在引用卡片加载且新插件类型可用、未被工作区禁用时惰性执行。`migrateState(oldState, fromVersion)` 的结果必须通过 JSON 与类型校验，并用旧 revision 和单调增加的 dataVersion 写回；并发修改、无迁移、坏结果、新版数据遇到旧插件或写入失败时保留原状态/摘要并显示兼容迁移占位。类型被禁用时优先显示可重新启用的占位，也不执行插件迁移代码。
- memoized 画布节点、FocusedView 和创建入口订阅动态 registry。插件晚于画布加载时会从占位切换到真实卡片；停用后立即回到保存摘要占位。搜索不运行插件代码，直接索引已持久化 presentation。

接口、示例和限制见 [SDK README](../../../packages/plugin-sdk/README.md#t2-seventh-slice-custom-canvas-types)。

## 发行包验证

命令：`bun run test:plugin-t2-canvas`。驱动在隔离数据目录构建并解包 canary，安装仓库外形态的 development-directory 插件，并运行归档 launcher 两次。这是打包应用内自动化验证，不冒充人工键鼠验收。

- `initial`：注册 `t2.canvas/score-card`；创建 revision 1 实例和画布放置；真实 React 按钮把计数从 0 改为 1 并保存 revision 2 摘要；宿主搜索命中该摘要；停用插件后 registry 清理且原状态/摘要占位仍可见；重新启用后同一类型恢复。
- 两次运行之间只更新外部插件的 `version.js`，把 dataVersion 从 1 提升到 2，并提供增加 `unit: "points"` 的迁移。
- `restart`：画布放置和 revision 2 状态恢复；当前卡片以 expectedRevision 2 持久化为 dataVersion 2 / revision 3，显示迁移后的 unit 和 subtitle；搜索命中迁移摘要中的 `points`。

机器结果：[trusted-plugin-t2-canvas-result.json](trusted-plugin-t2-canvas-result.json)。归档 SHA-256：`5a0d1844b259887a905f062dce59521f4e024b20a766b18753d4a90bdc346176`。

平台：darwin arm64、Bun 1.3.13、WKWebView、`views://mainview/index.html`。未请求 Developer ID 签名 / notarization，未验证 Windows / Linux。

## 自动化覆盖

- SDK/adapter：插件命名空间、JSON 状态、摘要净化、组件 updateState、默认/详情/预览适配、旧版迁移及新版拒绝。
- runtime/registry：候选注册不泄露、失败重载保留旧定义、owner generation 原子替换、旧代清理不删新代、停用清理和订阅刷新。
- renderer/store：晚发布类型从缺失占位恢复、停用回到保存摘要、deduplicated migration、expectedRevision + dataVersion 写入、迁移展示和现有卡片 undo/redo。
- Bun：第三方 canvasTypeId 解析、opaque 数据保留、单调 dataVersion、revision 冲突和拒绝降级。
- 发行包：真实外部插件 React 卡片完成创建、点击编辑、持久化、搜索、停用/重启/重新启用与两版本迁移。
- 完整串行回归：206 个测试文件、1819 个测试全部通过；类型检查与 Ultracite 检查通过。

## 保留边界

1. 迁移是当前加载画布上的惰性迁移；未打开画布不会后台执行插件代码，打开时再迁移。插件停用、丢失或迁移失败时旧数据保持原样。
2. 首批公开 surface 只支持 immediate 创建、通用尺寸/resize、可选 detail 和 preview。没有公开宿主 UI 组件、任意创建向导、插件菜单项、编程式画布放置或编辑器内部扩展。
3. 插件代码属于高信任同 realm 代码；JSON 校验和命名空间是兼容性/可靠性约束，不是恶意代码安全边界。
4. 卡片自身的 record-history 可由焦点/选中卡片快捷键撤销，但原生笔记事务、画布布局和插件内容事务仍不是一个全局有序历史。冲突恢复 UI 已由[第八批](trusted-plugin-t2-conflict-evidence.md)补齐；富文档创建与统一 undo 仍属后续 T2 工作。
