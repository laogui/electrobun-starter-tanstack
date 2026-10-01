# BlockNote AI 接入审计（2026-09-29）

> 本文保留修复前的审计发现。后续已完成具体缺陷修复，见 [修复结果与配置说明](blocknote-ai-repair-2026-09-29.md)。

结论：当前不能认定 BlockNote AI 可用。界面与官方基础接入基本齐全，但正常请求会被后端错误校验拒绝；修复这一阻断后，仍有建议持久化、取消、设置同步与模型配置等缺口。

本次仅检查并记录，没有修改应用源码，没有使用真实 API Key，也没有调用外部模型。实际安装的 `@blocknote/xl-ai` 为 0.51.4。核对范围包括官方五篇 AI 文档、项目接入代码、已安装依赖源码、真实编辑器配合模拟流的探针，以及现有测试。

## 官方文档对照

阅读来源：

- [AI 概览](https://www.blocknotejs.org/docs/features/ai)
- [Getting Started](https://www.blocknotejs.org/docs/features/ai/getting-started)
- [Backend Integration](https://www.blocknotejs.org/docs/features/ai/backend-integration)
- [Custom AI Commands](https://www.blocknotejs.org/docs/features/ai/custom-commands)
- [API Reference](https://www.blocknotejs.org/docs/features/ai/reference)

| 能力 | 项目情况 |
| --- | --- |
| AIExtension、样式、DefaultChatTransport | 已接入 |
| 选区工具栏 AI 按钮、`/ai` 菜单 | 已接入 |
| 续写、摘要、行动项、自定义提示词 | 默认菜单已提供，受请求阻断影响 |
| 润色、拼写修正、翻译、简化 | 默认选区菜单已提供，受请求阻断影响 |
| 流式工具执行、AI 光标与修改提示 | 官方扩展已提供，真实模型链路未通过 |
| 接受、拒绝、错误重试、同一会话继续要求修改 | 官方组件已提供；与应用持久化的结合不完整 |
| OpenAI、Anthropic、Ollama、兼容 API | 有模型适配代码；不等于任意模型均支持所需工具调用 |
| 自定义命令、应用专用提示、工作区检索/RAG、持久会话 | 编辑器链路未实现；属于可选扩展能力 |

官方当前仍将 AI 标注为 early preview。文档中的不同后端方式是替代方案，不需要同时实现；现有 Bun 本地后端本身是合理架构。

## P1：正常 AI 请求被错误校验直接拒绝（已复现）

位置：`src/bun/ai.ts:70`。

代码要求 `Array.isArray(toolDefinitions)`，而安装版本的真实 AIExtension 发送对象映射：

```json
{"toolDefinitions":{"applyDocumentOperations":{"inputSchema":{},"outputSchema":{}}}}
```

上述示意省略 schema 内容。依赖源码 `src/streamTool/vercelAiSdk/util/toolDefinitions.ts` 明确定义 `ToolDefinitions = Record<string, ToolDefinition>`，并使用 `Object.fromEntries` 构造。

探针从真实 AIExtension 截获完整请求体，再直接交给生产 `handleAIChat`，得到 `400 Invalid AI chat request`。处理器在调用任何 provider 之前返回，因此该问题与 Key、网络、模型选择无关。凡使用当前这条默认编辑器链路的命令都会受影响。

建议：按官方对象结构做运行时校验，验证工具定义的 schema，移除掩盖契约错误的 `as never`；增加真实扩展请求体到 handler 的协议契约测试。

## P1：待确认建议被当作正式正文保存（真实扩展模拟流已复现）

位置：`src/mainview/components/editor/BlockNoteEditor.tsx:582`；`src/mainview/components/editor/useBlockNoteSaver.ts:388`。

`handleChange` 对每次正文变化都序列化并安排保存，没有区分 thinking、ai-writing、user-reviewing 与接受后的最终状态。失焦、页面隐藏、卸载也有 flush 路径。

为隔离上一项阻断，探针给真实 AIExtension 返回合法的本地模拟 `applyDocumentOperations` 流：将 `Original` 改写为 `Rewritten by AI`。结果：

1. 扩展进入 `user-reviewing`。
2. 此时 `editor.document` 和 Markdown 输出均为 `OriginalRewritten by AI`，删除/插入建议标记没有保留在 BlockNote JSON 中。
3. 在原编辑器中 reject 恢复为 `Original`。
4. 用第 2 步 JSON 创建新编辑器，再 reject，仍为 `OriginalRewritten by AI`。

因此不能把流式编辑中的 `editor.document` 直接当作已提交笔记。现有防抖在用户停留于审阅阶段时会保存这种中间态；关闭后重开也失去拒绝所需的建议信息。该风险是在请求阻断修好后需要立即处理的潜在问题。

建议：建立 AI 事务边界，保存原始快照；待审阅期间暂停正式正文、卡片预览与索引的更新，accept 后保存最终稿，reject 恢复原稿。覆盖关闭笔记、切换工作区、开关 AI 和异常退出路径。也可单独持久化可恢复的提案，但不能混入正式正文。

## P2：停止与生命周期管理不完整

项目只渲染默认 AIMenuController。0.51.4 默认菜单在 thinking/ai-writing 时只有 loader、禁用的输入框，没有停止按钮；其 dismiss 在忙碌时也没有启用。API Reference 与安装包提供 `abort()`，项目没有调用。

`src/bun/ai.ts:74` 没有将 `req.signal` 作为 `abortSignal` 传给 `streamText`，也没有应用层超时策略。因此不能保证用户离开编辑器时上游模型请求随之终止。未用真实 provider 验证其断连行为。

建议：增加明确停止入口，接上前后端取消链；编辑器卸载和配置变化时收尾，并明确停止后保留审阅还是回滚，不能假设 abort 自动恢复全部正文。

## P2：配置更新与编辑器可用状态不同步

位置：`src/mainview/components/settings/panels/AIPanel.tsx:64`、`src/mainview/components/settings/SettingsApp.tsx:186`、`src/mainview/components/editor/BlockNoteEditor.tsx:294`。

- API Key 保存/清除只改变设置面板局部状态和后端缓存，没有触发编辑器监听的 `settings-updated`。先打开笔记、再配置 Key 后，现有编辑器可能仍没有 AI 入口；清除 Key 后旧入口可能仍在。
- 普通设置先 `onSettingsChange` 发刷新事件，然后才发 `saveSettings` RPC。编辑器重新查询 endpoint 可能读到旧设置，成功保存后没有补发刷新。
- AI 可用状态变化会通过 React key 重建编辑器，会丢失现有撤销栈与 AI 会话；待确认建议若经 JSON 重建，还会触发前述元数据丢失。

前两项由代码路径确认；RPC 时序的具体表现没有在桌面 UI 中另做端到端复现。

建议：后端成功持久化设置/凭证后统一发布 AI 配置更新事件；生成、审阅期间为编辑器重建定义明确策略。

## P2：provider/model/base URL/key 缺少组合校验

位置：`src/bun/ai.ts:22`、`src/mainview/components/settings/panels/AIPanel.tsx:102`。

- 更换 provider 只改 provider 字段，不匹配模型或独立凭证；例如切 Anthropic 后仍保留 OpenAI 模型名和 Key。
- 从 custom/Ollama 切 OpenAI 后，Base URL 输入框隐藏，但后端仍使用旧 `aiBaseUrl`，请求可能继续发往旧地址。
- custom 没填 URL 时静默回落到 Ollama 的 `http://localhost:11434/v1`。
- 无连接测试，也不验证所选模型是否支持工具调用及 `toolChoice: required`。

建议：按 provider 分别保存设置，切换时明确模型/URL/key；custom 缺 URL 时阻止启用；增加包含工具调用的能力探测。

## P2：错误说明与中文体验不足

位置：`src/mainview/components/editor/BlockNoteEditor.tsx:460`、`src/bun/ai.ts:84`。

编辑器固定使用 `en` 与 `aiEn`，未跟随应用语言切换。默认 AI 菜单提供通用 error 状态与重试，但没有呈现 Key 错误、模型不存在、429、工具调用不支持等可操作的分类。后端同步异常也仅返回通用 `AI request failed`。

建议：接入现有 locale 与官方 zh 字典；用可控错误码给出针对性提示与设置入口，避免暴露原始敏感响应。

## 可选产品扩展

编辑器目前没有 GhostBoard 专用命令，例如提取任务卡、与关联笔记联动、基于工作区检索回答。笔记标题位于独立 textarea，默认 documentState 仅来自正文，也没有显式注入标题、关联卡片、附件正文等上下文。

官方的自定义命令、documentStateBuilder、chatRequestOptions、自定义工具与 RAG 扩展点可以支持这些能力。它们应排在基础可用性和保存可靠性之后，不是官方基础接入的必选项。

## 验证与覆盖缺口

- 相关定向测试：5 文件、58 用例通过，涉及本地 HTTP、凭证、编辑器、保存器、设置。
- 全量 `bun run test`：239 文件通过、1 文件失败；2254 用例通过、27 失败，37 条未处理错误。失败集中在 `src/mainview/routes/index.test.tsx`，报错指向其 Paraglide mock 缺少 `settings_canvas_minimap_label`。本次未修改应用代码，未修复这个无关问题。
- 编辑器 integration test 将 AIExtension、菜单、工具栏全部 mock，并设置 `aiEnabled: false`；`src/bun/ai.test.ts` 主要覆盖 HTTP 鉴权、非法请求和附件，没有合法 BlockNote 工具请求到成功编辑的验证。
- 原调查探针的结果保存在 `.planning/2026-09-29-blocknote-ai-audit/stream-probe-output.txt`；探针已提升为 `src/mainview/components/editor/aiEditorSession.test.ts` 中的正式回归测试。探针使用真实编辑器和生产 handler，但模型流是模拟数据，不代表真实云模型兼容性验证。
- 未做真实模型逐 provider 冒烟、桌面窗口交互验收、长文档/表格/多块选区/附件上下文的完整矩阵验证。

建议实施顺序：修请求契约 → 建立建议提交/回滚与保存边界 → 补停止和设置同步 → 模型能力探测、错误与本地化 → 自定义命令和工作区上下文。
