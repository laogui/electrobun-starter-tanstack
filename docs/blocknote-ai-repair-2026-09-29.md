# BlockNote AI 修复与供应商配置

本次完成此前审计中的具体接入缺陷修复。工作区 RAG、关联卡片检索和业务专用 AI 命令仍是可选新功能，不包含在本次基础修复中。

## 已完成

- 请求按 BlockNote 实际对象型工具定义校验，验证消息结构，并以宿主 AI SDK 构建工具，避免不同 SDK 副本的类型不兼容。
- 使用真实 AIExtension + 生产 handleAIChat + 本地 HTTP 模型服务进行协议回归，覆盖有效请求、工具流改写、接受、拒绝、JSON 重开及取消。
- 生成和审阅期间不序列化 AI 建议、不更新正式笔记与卡片预览；接受或拒绝关闭会话后再提交最终正文。关闭笔记时取消并回滚未接受的修改。
- 增加停止按钮；客户端取消信号传到后端及模型请求，覆盖请求尚未真正发出时的停止。编辑请求最长 120 秒，连接测试最长 30 秒。
- AI 扩展始终随编辑器实例存在，入口由后端就绪状态控制；更新配置不再重建编辑器，保留撤销历史。关闭 AI 时停止并拒绝待确认修改。
- 普通设置按顺序持久化，在保存成功后通知已打开页面；Key 变更也广播配置更新。查询 endpoint 的过期响应不覆盖较新结果。
- 按供应商分别保存模型、Base URL 和 API Key。切换时恢复各自配置，不再把另一个供应商的 URL/模型/Key 自动带入。
- 旧版单 Key 迁移到升级启动时选择的供应商。Key 文件位于应用用户目录，使用 0600 权限，写入串行化，避免并发保存丢失其他供应商的 Key。
- OpenAI 与 Anthropic 都支持显式 Base URL；自定义服务必须填写地址，不再静默回落到 Ollama。
- 新增“测试连接与工具调用”：使用当前面板中的模型和地址、该供应商已保存的 Key，验证真实流式响应和必需工具调用。只返回普通文本不会判为成功。
- 编辑器及 AI 菜单跟随中英文语言设置；提供配置、认证、模型/地址、限流、工具不支持、超时及网络错误提示，不把原始供应商响应直接显示给用户。
- 笔记标题作为上下文传入，正文仍使用官方 documentState 流程。

## 使用方法

在设置 → AI 中选择供应商，填写模型 ID，按需要填写 API 基础地址，保存该供应商的 Key，然后点击“测试连接与工具调用”。测试成功后启用 AI，在笔记中使用 `/ai`，或选中文字后点击 AI。

| 供应商 | Base URL | Key |
| --- | --- | --- |
| OpenAI | 留空使用 SDK 官方地址；也可显式填写 | 必填 |
| Anthropic | 留空使用 SDK 官方地址；也可显式填写 | 必填 |
| Ollama | 默认 `http://localhost:11434/v1` | 普通本地服务可留空 |
| 自定义 OpenAI 兼容 | 必填，例如服务商提供的 `/v1` 基础地址 | 按服务商要求填写 |

不要将 `chat/completions` 完整路由填到 Base URL。模型必须支持工具调用；模型 ID 是否可用取决于账户权限或本地安装情况。连接测试会向配置的模型发出一次真实小型请求，不要求先开启编辑器 AI。

支持供应商专用环境变量：`GHOSTBOARD_AI_OPENAI_API_KEY`、`GHOSTBOARD_AI_ANTHROPIC_API_KEY`、`GHOSTBOARD_AI_OLLAMA_API_KEY`、`GHOSTBOARD_AI_CUSTOM_API_KEY`。已保存 Key 优先。旧 `GHOSTBOARD_AI_API_KEY` 为兼容而保留，但仅绑定本次启动时的供应商，不在切换供应商时复用。清除文件中的 Key 不会删除环境变量，设置页会显示该来源。

## 验证

- 四类供应商都通过真实 SDK 对本地协议服务的测试：OpenAI Responses、Anthropic Messages、Ollama 与自定义 Chat Completions。
- 浏览器检查实际 AIPanel 的中文布局、供应商选择、字段编辑和错误提示。浏览器验证使用内存设置客户端，没有写入用户真实配置。
- 新增真实编辑器测试与生产 React 保存入口测试，覆盖未接受建议不保存，以及接受后恢复保存。
- `bun run test`：243 个文件、2296 个用例全部通过。
- `bun run type-check` 与 `bun run build:canary`：通过（构建未签名/公证，沿用本地 canary 配置）。
- 本次修改的 24 个文件通过 Biome；`git diff --check` 通过。
- `bun run check`：剩余两个既有、非 AI 文件的格式错误：`src/bun/templates/cafe/assets.json` 和 `src/mainview/components/canvas/ViewSwitcher.test.tsx`。未改动这些文件。

本次没有使用用户 Key 请求真实 OpenAI/Anthropic 服务，也没有验证某个本地 Ollama 模型已经安装。供应商协议支持已经验证；具体账户、网络和模型权限由设置中的连接测试检查。
