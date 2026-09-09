# GhostBoard 第三方扩展平台（RFC-2）

> 状态：历史备忘；先由 [公开插件系统整改方案 v2](./public-plugin-platform-redesign.md)（已归档）接替，现行方案为 [高信任插件系统改造方案](../In%20Progress/trusted-plugin-platform.md)
>
> 2026-09-07 更新：用户已明确要求公开开发、URL 下载与本地压缩包安装。以下延期条件和旧范围仅保留历史背景，当前实施设计以新方案为准；本说明不表示功能已经实现。
>
> 创建日期：2026-08-19
>
> 前置依赖：`canvas-extension-platform-refactor.md`（RFC-1）全部完成
>
> 立项条件：见 §1

本文档收纳从 RFC-1 v1 草案中剥离的第三方扩展平台内容。它不是实施计划，而是立项前的问题清单和范围备忘，避免这些设计决策丢失。

## 1. 立项条件

RFC-1 的内部扩展化本身价值确定；第三方平台的价值未经验证，且是全部工作中成本最高、安全风险最大的部分。本 RFC 只有在满足以下条件后才应立项：

1. RFC-1 验收标准全部达成，内置 Canvas Type 体系稳定运行至少一个发布周期。
2. 存在真实的需求信号：有具体的外部开发者或用户场景需要安装非内置内容类型，而不是"平台化听起来正确"。
3. §4 的头号技术问题（隔离与截图）有 Spike 结论。

若始终没有需求信号，本 RFC 应保持搁置；RFC-1 的架构收益（新增内置类型不改宿主分支）不依赖本项目。

## 2. 范围

- 扩展包格式：`ghostboard.extension.json` JSON manifest、schema 校验、路径越界校验、资源大小限制。
- 安装与生命周期：本地目录安装、`<app-data>/extensions/<id>/<version>/`、启用/卸载/升级、`installed / enabled / instances` 三层分离。
- 沙箱执行：独立 HTML/JS bundle、iframe 或等价隔离容器、严格 CSP、typed message bridge、崩溃与超时隔离、circuit breaker。
- 权限系统：capability 声明的运行时授权、按 origin 的网络代理、升级新增权限重新确认、拒绝返回结构化错误。
- Snapshot 截图系统：沙箱 Surface 的只读预览缓存（内置世界用 PreviewSurface，不需要它）。
- SDK 与开发者体验：`@ghostboard/extension-sdk`、`@ghostboard/extension-testing`、`create-ghostboard-extension` 脚手架、本地开发模式、热 reload、扩展日志。
- 信任等级：`builtin / verified / local-development / untrusted`，签名与 verified publisher。
- 在线市场、支付、评论不属于本 RFC，另立项目。

## 3. 从 RFC-1 继承的兼容性保证

RFC-1 已经为本项目预留：

- Instance envelope（`ghostboard-extension-instance/v1`）、presentation、Host API 方法形状全部可序列化，可无损搬到消息桥之上。
- Surface 代码被 lint 强制不得 import 宿主 store / bridge / `src/bun/*`。
- Canvas Type 声明中的 `capabilities` 字段已存在，本 RFC 补充运行时授权。
- Availability 语义预留了扩展位：`unknown` 可细分为 `missing / incompatible / permission-required / crashed`。
- 未知类型实例的无损 round-trip、禁用不删数据、GC 宽限期等行为已在 RFC-1 落地并有测试。

因此本 RFC 的核心增量是**执行隔离**和**信任模型**，不是数据模型。

## 4. 头号技术问题：隔离与截图的矛盾

这是立项 Spike 必须首先回答的问题，其结论会反过来修改 SDK 协议设计。

矛盾：Folder、Library、搜索结果不能为每个 child 启动沙箱运行时，因此需要缓存的只读预览（Snapshot）。但在当前运行时（Electrobun + WKWebView，`bundleCEF: false`，单 webview）下：

- 宿主 DOM 截图方案（html-to-image 一类）**无法读取 cross-origin sandboxed iframe 的内容**——隔离越严格，宿主越截不到。
- 可能的出路：
  1. WKWebView 原生 `takeSnapshot` 经 Bun 桥接，再按节点区域裁剪。受遮挡、离屏、缩放影响，需要验证可靠性。
  2. 扩展自渲染位图并通过 bridge 上报（协议需增加 snapshot 上报消息；不可信内容需校验尺寸、格式和大小）。
  3. 放弃截图，第三方类型在 Folder/Library 中只显示 Presentation Card。体验降级但最简单，可作为首版兜底。

Spike 还必须给出：

- iframe 能否可靠隔离宿主 DOM 和全局对象；是否需要独立 WebView 或其他容器。
- 输入框、剪贴板、拖拽和键盘焦点在 iframe 内的行为。
- CSP 与本地资源（扩展包内文件）加载策略。
- 多实例内存开销与视口懒加载策略。
- 崩溃检测和导航逃逸拦截。

若隔离能力不满足要求，第三方平台暂停，不影响 RFC-1 成果。

## 5. 保留的设计决策（自 v1 草案）

以下决策在 v1 草案评审中确认合理，立项时直接沿用：

- Manifest 为声明式 JSON，不含可执行表达式；安装与启动时由 Bun 端校验（schema、路径、entrypoint 存在性、engine 范围、大小限制、未知字段保留）。
- `extension.id` 反向域名命名空间：`^[a-z0-9]+(?:[.-][a-z0-9]+)+$`；完整类型键 `${extensionId}/${typeId}`。
- 权限模型：默认只授予渲染上下文和自身实例状态；文件、网络（按 origin）、剪贴板、通知、调度必须声明；新增权限升级时重新确认。剪贴板 API 随权限系统一起引入（RFC-1 刻意未提供）。
- 第三方代码不进入 Bun 主进程；所有文件路径由宿主生成并校验；网络经权限代理校验 protocol、origin、重定向和响应大小。
- message payload 做 schema 校验和大小限制（单条 ≤ 256 KiB）；Surface 设 CPU、内存、消息频率和失败次数限制。
- 外部 Surface 只为视口及缓冲区内节点启动；离屏显示 Snapshot 或 Presentation Card。
- 卸载只移除代码不删实例数据；重装同 ID 兼容版本后节点自动恢复。
- 外部扩展的拖拽首版使用宿主标题栏/拖拽区，避免 iframe 吞掉 pointer event；自定义 drag region 作为后续协议。
- Scheduler 沿用 RFC-1 的 at-least-once 合并语义，不开放常驻后台 JavaScript。

## 6. 开放问题

1. 沙箱容器最终选型：iframe、独立 WebView，还是其他（依赖 §4 Spike）。
2. Snapshot 路线：原生截图桥接、扩展自报位图，还是 Presentation-only 兜底。
3. 权限确认按应用、工作区还是扩展版本存储。
4. 扩展安装包扩展名（`.ghostboard-extension`）与签名格式。
5. 外部扩展是否允许声明 Detail Surface 之外的设置 Surface。
6. SDK 兼容策略与弃用周期；`extensionApi` 版本与应用版本的映射。
7. 扩展贡献结构化 AI 上下文的受权能力设计。
8. Canvas JSON 是否打包附件（`.ghostboard-canvas` 压缩格式）。

## 7. 粗略量级（仅供参考）

按 v1 草案估算并加入评审修正：沙箱、权限、SDK、本地开发模式约 3–6 周；安全审计、性能基准、签名与分发打磨约 2–4 周。以上不含 §4 Spike（约 1 周）和市场生态治理（另立项目）。
