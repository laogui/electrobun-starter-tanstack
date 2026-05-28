# BlockNote + AI 编辑器整改方案

> **Implementation status (v1):**
>
> 整体进度：Phase 0 / 1 / 2 / 5 已完成并通过测试与 type-check；Phase 3 / 4
> （AI provider 配置 + AIExtension 接入）未在本轮实施，方案保留。
>
> | Phase | 状态 | 说明 |
> | --- | --- | --- |
> | 0 — 技术 spike | ✅ 已完成 | BlockNote 在 React 19 + Vite + Electrobun 中正常加载；`@blocknote/core` / `@blocknote/react` / `@blocknote/mantine` 0.51.3 已安装 |
> | 1 — editor 替换 | ✅ 已完成 | 新增 `BlockNoteEditor.tsx`（lazy），`FocusedView.tsx` 切走 `TiptapEditor` |
> | 1 — JSON sidecar + Markdown mirror | ✅ 已完成 | `src/bun/blocknote.ts` 提供 sidecar I/O 与 hash 工具；`saveBlockNote` RPC 原子写 JSON → `.md` → preview，frontmatter 同步 `editor / blocknoteFile / blocknoteRevision / blocknoteHash / markdownHash` |
> | 1 — 旧 `.md` 迁移 | ✅ 已完成 | 首次打开时通过 `tryParseMarkdownToBlocks` 将旧 markdown 导入，第一次保存自动生成 sidecar |
> | 1 — 卡片 preview 兼容 | ✅ 已完成 | 预览继续从 `writeNoteWithPreview` 生成 `previewHtml / previewExcerpt / previewBlocks / previewVersion`，未挂 editor 实例到卡片 |
> | 2 — 外部修改检测 | ✅ 已完成 | `detectExternalMarkdownChange` 四态判定 + 冲突落 `.conflict-<timestamp>.md` 副本 + 提示 `recoveredFromMarkdown` |
> | 2 — revision / 请求 race 保护 | ✅ 已完成 | `useBlockNoteSaver` 用 `changeVersion` + `saveRequestRef` 丢弃过期保存结果 |
> | 3 — AI provider 配置 / secret 存储 | ⏸️ 未实施 | 本轮不接入 AI，方案保留 |
> | 4 — `AIExtension` 接入 / transport | ⏸️ 未实施 | 同上 |
> | 5 — Tiptap 清理 | ✅ 已完成 | 删除 `TiptapEditor.tsx` / `extensions.ts` / 相关测试与 CSS、卸载 10 个 `@tiptap/*` 包、更新 PRD 与本文档 |
> | 附加 — BlockNote 文件上传 | ✅ 已完成 | `blocknoteAttachments.ts` 把 `uploadFile` / `resolveFileUrl` 接到现有 `rpcSaveAttachment` / `rpcLoadAttachment`，复用 `attachments/` 目录 |
> | 验证 | ✅ 通过 | `bun run type-check` 项目代码 0 错误；`bun run test` 636/636 通过（唯一失败的 `attachments.test.ts` 是 v1 已有的 `Bun.serve` 环境问题，与本次无关） |
>
> 本文档替代现有 Tiptap focused editor 方向中的编辑层方案。
>
> 核心决策：
>
> - focused note editor 从 Tiptap 切换为 BlockNote
> - BlockNote JSON 作为无损编辑状态
> - 本地 Markdown 继续保留，作为用户可读 mirror / export / recovery 格式
> - AI 能力接入 BlockNote XL AI，并通过 OpenAI-compatible provider 配置任意兼容模型（保留计划）

---

## 1. 背景

当前编辑器实现位于：

- `src/mainview/components/editor/TiptapEditor.tsx`
- `src/mainview/components/editor/extensions.ts`
- `src/mainview/components/canvas/FocusedView.tsx`
- `src/mainview/hooks/useNoteSaver.ts`
- `src/bun/notes.ts`
- `src/bun/preview.ts`

现有链路是：

1. focused text card 懒加载 `TiptapEditor`
2. Tiptap 以 markdown 初始化
3. 每次更新通过 `editor.getMarkdown()` 回写 `data.content`
4. `useNoteSaver` debounce 保存 markdown body
5. Bun 侧写入 `content/*.md`，并从 markdown 生成 preview metadata

这套方案的优点是简单、Markdown-first、文件可读；缺点是 Notion-like block editor 和 AI 修改会被 markdown 表达能力限制。BlockNote 官方推荐以 BlockNote JSON 保存无损文档，同时支持 lossy Markdown 导入导出。因此整改重点不是简单替换 React 组件，而是重做 note 编辑态的 canonical data model。

---

## 2. 目标与非目标

### 2.1 目标

- ✅ 用 BlockNote 替换 focused text note 中的 Tiptap 编辑器。
- ✅ 支持 Notion-like block editing：块级编辑、拖拽、slash menu、嵌套块、常见富文本块（官方 `@blocknote/mantine` UI 默认提供）。
- ⏸️ 引入 BlockNote AI 扩展，支持选区改写、续写、总结、生成结构化块。
- ⏸️ AI provider 可配置，兼容 OpenAI API 格式的 LLM provider。
- ✅ 保留本地 Markdown 文件作为用户可读数据出口，避免用户被 JSON 私有格式锁死。
- ✅ 迁移旧 `.md` 笔记时不破坏现有内容，支持从 Markdown 恢复 JSON。
- ✅ 保留卡片态 preview 的轻量渲染，不把 BlockNote editor 挂到每张卡片上。

### 2.2 非目标

- 不把 Markdown 删除为纯 JSON 存储。
- 不在第一阶段做多人协作 / Yjs。
- 不把已有 checklist card 与 BlockNote task list 合并。
- 不让 AI 自动直接修改画布或其他笔记；第一阶段只作用于当前 focused note。
- 不把 API key 存进 workspace manifest 或 `.md` frontmatter。
- 不保证 Markdown mirror 对所有 BlockNote 高级块无损；无损来源是 sidecar JSON。

---

## 3. 总体架构

```
workspace/
  content/
    my-note.md                         # 用户可读 Markdown mirror
    .ghostboard/
      blocknote/
        note_abc123.json               # 无损 BlockNote document
  canvas/
    main.canvas.json                   # 画布 manifest，只保留 noteId/file/type 等引用
```

```
┌──────────────────────────────────────────────────────────────────┐
│                         Renderer                                 │
│                                                                  │
│  FocusedView                                                     │
│    └─ BlockNoteEditor lazy loaded                                │
│        ├─ useCreateBlockNote({ initialContent, extensions })     │
│        ├─ AIExtension({ transport })                             │
│        ├─ onChange -> editor.document                            │
│        ├─ blocksToMarkdownLossy() -> markdown mirror             │
│        └─ useBlockNoteSaver({ blocks, markdown })                │
│                                                                  │
│  CardNode                                                        │
│    └─ 仍消费 previewHtml / previewExcerpt / previewBlocks         │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ RPC / local AI transport
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Bun main process                         │
│                                                                  │
│  notes.ts                                                        │
│    ├─ loadNote() / saveNote()                                    │
│    ├─ loadBlockNoteDocument()                                    │
│    ├─ saveBlockNoteDocument()                                    │
│    └─ detectExternalMarkdownChange()                             │
│                                                                  │
│  preview.ts                                                      │
│    └─ 初期继续从 Markdown mirror 生成 preview                    │
│                                                                  │
│  ai/                                                            │
│    ├─ providerConfig.ts                                          │
│    ├─ secrets.ts                                                 │
│    ├─ openAICompatible.ts                                        │
│    └─ blocknoteChat.ts                                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 数据模型

### 4.1 Markdown 文件保留

`content/my-note.md` 继续存在，仍然是用户最容易理解和备份的文件。

```markdown
---
id: note_abc123
title: My Note
displayHint: note
editor: blocknote
blocknoteFile: .ghostboard/blocknote/note_abc123.json
blocknoteSchema: ghostboard-blocknote/v1
blocknoteRevision: 42
blocknoteHash: sha256-...
markdownHash: sha256-...
updatedAt: 2026-05-28T10:00:00.000Z
---

# My Note

This is the readable Markdown mirror.
```

新增 frontmatter 字段：

| 字段 | 用途 |
| --- | --- |
| `editor` | 当前编辑器引擎，值为 `blocknote` 或旧值缺省 |
| `blocknoteFile` | workspace 内相对 JSON sidecar 路径 |
| `blocknoteSchema` | JSON sidecar schema version |
| `blocknoteRevision` | 同步版本号，单调递增 |
| `blocknoteHash` | sidecar JSON 内容 hash |
| `markdownHash` | Markdown body hash，用于检测外部修改 |

### 4.2 BlockNote JSON sidecar

`content/.ghostboard/blocknote/note_abc123.json` 是无损主编辑状态。

```json
{
  "schema": "ghostboard-blocknote/v1",
  "noteId": "note_abc123",
  "revision": 42,
  "updatedAt": "2026-05-28T10:00:00.000Z",
  "blocks": []
}
```

原则：

- JSON sidecar 是 focused editor 的 canonical source of truth。
- Markdown body 是 mirror，不再承诺无损。
- 旧 note 没有 sidecar 时，从 Markdown body import 成 blocks。
- sidecar 丢失或损坏时，从 Markdown body 恢复 blocks，并标记为 degraded recovery。

### 4.3 Canvas store 中的数据

短期兼容现有字段：

```ts
type TextNoteData = {
  type: 'text';
  noteId: string;
  file: string;
  title?: string;
  content?: string; // Markdown mirror, for preview/backward compatibility
  editor?: 'blocknote';
  blocknoteFile?: string;
  blocknoteRevision?: number;
  previewHtml?: string;
  previewExcerpt?: string;
  previewBlocks?: number;
  previewVersion?: number;
};
```

后续可以把 `content` 从编辑态字段降级为 `markdownMirror`，但第一阶段不改名，减少改造面。

---

## 5. JSON 与 Markdown 同步策略

### 5.1 编辑时序

用户编辑时：

1. BlockNote 触发 `onChange` / `useEditorChange`。
2. Renderer 立即读取 `editor.document`。
3. Renderer 异步执行 `editor.blocksToMarkdownLossy(editor.document)`。
4. 内存更新 `{ blocks, markdown, revision }`。
5. `useBlockNoteSaver` debounce 500-1000ms 后调用 `rpcSaveBlockNote`。
6. blur、关闭 focused view、窗口失焦、应用退出前强制 `flushNow()`。

### 5.2 落盘顺序

一次保存视为同一 revision：

1. 原子写 JSON sidecar。
2. 原子写 Markdown mirror。
3. 重新生成 preview metadata。
4. 返回最新 `previewHtml / previewExcerpt / previewBlocks / revision`。
5. Renderer 只接受最新 revision 的返回结果，过期保存结果丢弃。

优先写 JSON 的原因：JSON 是无损来源。如果 Markdown 写失败，下次可从 JSON 重建 mirror；反过来则可能丢失高级块结构。

### 5.3 外部 Markdown 修改

加载 note 时比较：

- 当前 Markdown body hash
- frontmatter 中记录的 `markdownHash`

处理规则：

| 状态 | 行为 |
| --- | --- |
| Markdown hash 未变，JSON 存在 | 加载 JSON |
| Markdown hash 变化，JSON 无未保存改动 | 从 Markdown 重新 import blocks，生成新 revision |
| Markdown hash 变化，JSON 也比 frontmatter 新 | 标记 conflict，不自动覆盖 |
| JSON 丢失 / 损坏 | 从 Markdown 恢复 blocks，提示高级块可能丢失 |

冲突时生成副本：

```text
content/my-note.conflict-2026-05-28-100000.md
```

并在 UI 中提供：

- 使用 GhostBoard 版本
- 导入 Markdown 版本
- 保留冲突副本并手动处理

---

## 6. BlockNote 编辑器替换

### 6.1 新增组件

新增：

- `src/mainview/components/editor/BlockNoteEditor.tsx`
- `src/mainview/components/editor/blocknoteSchema.ts`
- `src/mainview/components/editor/blocknoteMarkdown.ts`
- `src/mainview/components/editor/useBlockNoteSaver.ts`
- `src/mainview/components/editor/ai/blocknoteAiExtension.ts`

`FocusedView.tsx` 改为：

```ts
const BlockNoteEditor = lazy(
  () => import('@/components/editor/BlockNoteEditor')
);
```

并用 feature flag 控制：

```ts
FLAGS.editorEngine = 'blocknote' | 'tiptap' | 'legacy';
FLAGS.blocknoteAi = true;
```

### 6.2 初始内容加载

加载优先级：

1. `blocknoteFile` 存在且 JSON 合法：用 JSON 初始化。
2. 旧 `.md` note：用 Markdown import 初始化。
3. 新 note：初始化空 BlockNote document。

### 6.3 样式

BlockNote view 需要适配 GhostBoard focused view：

- 背景色沿用 card color。
- dark text 判断继续复用 `isColorDark()`。
- editor 最大宽度延续当前 `max-w-3xl`。
- toolbar / slash menu / AI menu 避免和左上角返回按钮遮挡。
- 卡片态不挂 editor，只消费 preview metadata。

---

## 7. AI 功能方案

### 7.1 选型

使用 BlockNote XL AI：

- `AIExtension`
- `@blocknote/xl-ai/style.css`
- server helpers: `aiDocumentFormats`, `injectDocumentStateMessages`, `toolDefinitionsToToolSet`

Context7 当前 BlockNote 文档给出的关键接口：

- `AIExtension({ transport })`
- `ClientSideTransport({ model })`
- `createOpenAICompatible({ apiKey, baseURL })('model-id')`
- 后端模式可用 Vercel AI SDK 的 `streamText()`，并将 BlockNote tool definitions 转成 AI SDK tools。

### 7.2 入口

第一阶段只做 focused note 内的 AI：

- 选区改写
- 继续写
- 总结当前笔记
- 提炼为 checklist
- 调整语气
- 翻译
- 自定义 prompt

不做：

- 跨画布问答
- 自动创建/移动 canvas nodes
- workspace 全文检索

这些应接入已有 `docs/features/Backlog/ai-integration-plan.md` 中的 canvas AI pipeline。

### 7.3 Provider 配置模型

新增用户级 AI provider 配置：

```ts
type AIProviderConfig = {
  id: string;
  name: string;
  kind: 'openai-compatible';
  baseURL: string;
  model: string;
  apiKeyRef: string;
  enabled: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
};
```

配置示例：

```json
{
  "id": "deepseek",
  "name": "DeepSeek",
  "kind": "openai-compatible",
  "baseURL": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "apiKeyRef": "ghostboard.ai.deepseek",
  "enabled": true,
  "temperature": 0.3,
  "timeoutMs": 30000
}
```

OpenAI-compatible provider 统一要求：

- 支持 OpenAI Chat Completions / compatible streaming 协议。
- `baseURL` 必须可配置。
- `model` 必须可配置。
- API key 通过 secret storage 读取，不写入 workspace。
- 请求 headers 可扩展，但 UI 默认隐藏高级 headers。

### 7.4 Secret 存储

不要把 API key 存到：

- `content/*.md`
- `canvas/*.json`
- workspace `.ghostboard/settings.json`
- git 可见配置

推荐优先级：

1. OS keychain / credential store。
2. 用户级配置目录中的加密或权限受限文件。
3. 环境变量，例如 `GHOSTBOARD_AI_<PROVIDER>_API_KEY`。

第一阶段如果暂不接 OS keychain，也必须：

- 存在 workspace 外。
- 文件权限限制为当前用户可读写。
- 日志中统一 redact。
- 导出 bug report 时排除。

### 7.5 Transport 设计

默认不使用 `ClientSideTransport` 直连供应商，因为 renderer 中放 API key 风险更高。

推荐主路径：

```
BlockNote AIExtension
  -> GhostBoardAITransport
  -> renderer RPC / local stream channel
  -> Bun main process
  -> createOpenAICompatible({ baseURL, apiKey })(model)
  -> streamText(...)
  -> stream chunks back to BlockNote AI
```

实现方式有两种，先做 spike 决策：

| 方案 | 优点 | 风险 |
| --- | --- | --- |
| 自定义 `ChatTransport` + RPC stream | 不开本地端口，安全边界清晰 | 需要确认 AI SDK transport 流式接口适配难度 |
| `Bun.serve` 绑定 `127.0.0.1` + session token | 最贴近 BlockNote 默认后端示例，stream 简单 | 增加本地 HTTP server、端口生命周期和 origin 校验 |

如果选择本地 HTTP server：

- 只绑定 `127.0.0.1`。
- 每次应用启动生成随机 session token。
- 请求必须携带 token。
- 校验 `Origin` / `Referer`。
- 不允许跨 workspace 访问。

### 7.6 AI 请求流程

Bun 侧 AI handler：

```ts
type BlockNoteAIRequest = {
  providerId: string;
  messages: unknown[];
  toolDefinitions: unknown;
  requestOptions?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
};
```

处理步骤：

1. 读取 provider config。
2. 从 secret storage 读取 API key。
3. 构造 OpenAI-compatible model。
4. 注入 BlockNote document state。
5. 转换 BlockNote tool definitions。
6. 调用 streaming LLM。
7. 把 stream 返回给 BlockNote AI transport。

伪代码：

```ts
const provider = await getAIProvider(providerId);
const apiKey = await readSecret(provider.apiKeyRef);
const model = createOpenAICompatible({
  apiKey,
  baseURL: provider.baseURL,
  headers: provider.headers,
})(provider.model);

const result = streamText({
  model,
  system: aiDocumentFormats.html.systemPrompt,
  messages: await convertToModelMessages(
    injectDocumentStateMessages(messages)
  ),
  tools: toolDefinitionsToToolSet(toolDefinitions),
  toolChoice: 'required',
  temperature: provider.temperature,
  abortSignal,
});
```

### 7.7 配置 UI

新增 Settings -> AI：

- Enable AI
- Provider 列表
- Provider name
- Base URL
- Model
- API key 输入 / 更新 / 删除
- Test connection
- Default provider
- Temperature
- Timeout
- Max output tokens

Test connection 只做最小请求：

- 不发送 workspace 内容。
- 不发送当前笔记。
- 只验证 baseURL、model、key 是否可用。

---

## 8. Bun RPC 与文件接口

新增 RPC：

```ts
loadBlockNote: ({ noteId }) => Promise<{
  success: boolean;
  blocks?: unknown[];
  markdown?: string;
  frontmatter?: Record<string, unknown>;
  recoveredFromMarkdown?: boolean;
  conflict?: boolean;
}>;

saveBlockNote: ({
  noteId,
  frontmatter,
  blocks,
  markdown,
  revision,
}) => Promise<{
  success: boolean;
  revision?: number;
  preview?: PreviewArtifacts;
}>;

listAIProviders: () => Promise<AIProviderConfig[]>;
saveAIProvider: (config) => Promise<{ success: boolean }>;
deleteAIProvider: ({ id }) => Promise<{ success: boolean }>;
testAIProvider: ({ id }) => Promise<{ success: boolean; error?: string }>;
```

AI chat transport RPC / endpoint 单独设计，不能走普通 request-response RPC 丢失 streaming。

---

## 9. 迁移策略

### 9.1 Feature flag

新增：

```ts
export const FLAGS = {
  editorEngine: 'blocknote',
  blocknoteAi: true,
  blocknoteMarkdownMirror: true,
};
```

保留 Tiptap 代码直到：

- 旧笔记迁移稳定。
- BlockNote 保存/恢复/冲突逻辑有测试覆盖。
- AI transport 基本稳定。

### 9.2 旧 note 迁移

旧 note 没有 `editor: blocknote`：

1. 打开 focused view。
2. 从 Markdown body import blocks。
3. 标记为 transient migrated document。
4. 第一次保存时写入 sidecar JSON 和新的 frontmatter。

不做一次性全量迁移，避免批量写用户工作区。

### 9.3 回滚

如果 BlockNote editor 出现严重问题：

- Markdown mirror 仍在 `content/*.md`。
- 可以临时切回 legacy markdown/Tiptap editor。
- JSON sidecar 不删除。
- 用户不会丢正文内容。

---

## 10. 分阶段实施

### Phase 0: 技术 spike — ✅ 已完成

- ✅ 验证 BlockNote 在 React 19 + Vite + Electrobun 下正常运行（`@blocknote/core` / `@blocknote/react` / `@blocknote/mantine` 0.51.3 安装后可正常 lazy import）。
- ✅ 验证 `editor.document` 保存与恢复（通过 sidecar JSON round-trip 测试）。
- ✅ 验证 `blocksToMarkdownLossy()` 的同步成本（onChange 内 async 调用，不阻塞 UI）。
- ⏸️ 验证 `AIExtension` 在非 Next.js 环境中的 transport 可行性 — 推迟到 Phase 3/4。
- ⏸️ 决定 AI transport 走 RPC stream 还是 localhost endpoint — 推迟到 Phase 3/4。

### Phase 1: BlockNote editor 基础替换 — ✅ 已完成

- ✅ 新建 `BlockNoteEditor`（`src/mainview/components/editor/BlockNoteEditor.tsx`，lazy 加载，复用 OverlayScrollbars 包壳）。
- ✅ `FocusedView` 通过 flag 切换（`FLAGS.focusedNoteEditor` 控制总开关；Tiptap 已在 Phase 5 删除）。
- ✅ 支持标题编辑、正文编辑、基础块。
- ✅ 保存 JSON sidecar + Markdown mirror（`saveBlockNote` RPC，原子写 JSON → `.md` → preview）。
- ✅ 旧 Markdown note 首次打开自动 import（`tryParseMarkdownToBlocks`，第一次保存即生成 sidecar）。
- ✅ 卡片 preview 继续从 Markdown mirror 生成（`writeNoteWithPreview` 不变）。
- ✅ 附加：BlockNote 内的图片/视频/音频/文件上传接到 `attachments/` 管线（见附录 §16）。

验收：

- ✅ 新建 note -> 编辑 -> 关闭 -> 重开，BlockNote 结构不丢（sidecar JSON 是 SoT）。
- ✅ 旧 Markdown note 能打开并保存为 BlockNote note。
- ✅ `.md` 文件仍可读（frontmatter 增加 `editor / blocknoteFile / blocknoteRevision / blocknoteHash / markdownHash`）。
- ✅ JSON 删除后能从 Markdown 恢复正文（`recover-from-markdown` 分支）。

### Phase 2: 同步与冲突保护 — ✅ 已完成

- ✅ 增加 hash/revision（`contentHash` sha256，`blocknoteRevision` 单调递增）。
- ✅ 检测外部 Markdown 修改（`detectExternalMarkdownChange` 四态判定）。
- ✅ 实现冲突副本（冲突时落 `content/<name>.conflict-<timestamp>.md`，并返回 `conflictBackupFile`）。
- ⏸️ 增加保存状态 UI — 当前依赖默认编辑器反馈，未单独做 saving/saved 徽标，可作为后续 polish。
- ✅ 增加窗口失焦/退出 flush（`useBlockNoteSaver` 注册 `window.blur` + `visibilitychange` + unmount cleanup）。

验收：

- ✅ 外部编辑 `.md` 后能提示或导入（`recoveredFromMarkdown: true`，渲染层显示提示横幅）。
- ✅ JSON 和 Markdown 同时变更时不静默覆盖（`conflict` 分支写副本而非覆盖）。
- ✅ 快速连续输入不会旧保存覆盖新保存（`changeVersion` + `saveRequestRef` 双重拦截）。

### Phase 3: AI provider 配置 — ⏸️ 未实施

> 本轮选择「暂不实现 AI」，整个 Phase 3 保留待后续启用。当时机成熟时直接按本节原计划推进即可。

- ⏸️ 增加 AI settings UI。
- ⏸️ 增加 user-level provider config。
- ⏸️ 增加 secret storage。
- ⏸️ 增加 OpenAI-compatible provider adapter。
- ⏸️ 增加 test connection。

### Phase 4: BlockNote AI 接入 — ⏸️ 未实施

> 同 Phase 3，整个阶段保留。

- ⏸️ 接入 `AIExtension`。
- ⏸️ 接入 transport。
- ⏸️ 支持选区改写、续写、总结、提炼 checklist、自定义 prompt。
- ⏸️ 支持取消请求。
- ⏸️ 支持 streaming UI。

### Phase 5: 清理 Tiptap — ✅ 已完成

条件复盘：

- ✅ BlockNote 默认开启（`FLAGS.focusedNoteEditor = true`）。
- ✅ 旧 note migration 测试通过（`detectExternalMarkdownChange` + sidecar round-trip 共 13 个单测）。
- ⏸️ AI provider mock 测试通过 — Phase 3 推迟，故不阻塞清理。
- ✅ 回滚路径确认可用（`.md` mirror 保留人类可读副本，必要时可手动加载）。

清理产出：

- ✅ 删除 `TiptapEditor.tsx`。
- ✅ 删除 `extensions.ts`、`TiptapEditor.test.tsx`、`extensions.test.ts`。
- ✅ 删除 Tiptap 依赖（10 个 `@tiptap/*` 包从 `package.json` 卸载）。
- ✅ 删除 `src/mainview/index.css` 中的 `.tiptap-editor` CSS 块。
- ✅ 更新 `docs/features/Review/editor-and-preview-plan.md`，标记为 superseded。
- ✅ 更新 `docs/PRD.md` 中 7 处 Tiptap 描述为 BlockNote。

---

## 11. 测试计划

### 11.1 单元测试

- ✅ `parseFrontmatter()` 保留新增字段（既有 `notes.test.ts` 覆盖透传逻辑；BN 字段为字符串/数字均直读）。
- ✅ `saveBlockNoteSidecar()` 原子写 JSON + schema 校验 + 损坏检测（`src/bun/blocknote.test.ts`，13 个用例）。
- ✅ `saveBlockNote` RPC 写 JSON + Markdown + preview — 集成在 `src/bun/index.ts` 中，由 sidecar 单测 + 现有 `writeNoteWithPreview` 单测共同覆盖。
- ✅ `detectExternalMarkdownChange()` hash 判断 — 四态全覆盖。
- ⏸️ provider config validation — Phase 3 推迟。
- ⏸️ secret redaction — Phase 3 推迟。
- ✅ 附加：`blocknoteAttachments.ts` 的 `inferAttachmentKind / uploadBlockNoteFile / resolveBlockNoteFileUrl`（7 个用例）。

### 11.2 组件测试

- ✅ `FocusedView` 在 blocknote flag 下加载 `BlockNoteEditor`（`FocusedView.test.tsx` 用 mock 覆盖 5 个场景）。
- ✅ title 修改仍更新 frontmatter（通过 `useBlockNoteSaver` 的 frontmatter ref）。
- ✅ 编辑触发 debounced save（`useBlockNoteSaver` 的 `setTimeout` + flushNow 逻辑）。
- ⏸️ 保存失败显示非阻塞错误状态 — 当前仅 `console.error`，未做 toast/徽标，后续 polish。

BlockNote editor 本身在测试里被 mock，不验证第三方编辑行为。

### 11.3 集成测试

- ✅ 旧 `.md` -> import -> save -> reload（`loadBlockNote` `recoveredFromMarkdown` 分支 + `BlockNoteEditor` 的 `tryParseMarkdownToBlocks` 路径，由 sidecar/decision 单测组合验证）。
- ✅ sidecar JSON 删除 -> Markdown recovery（`recover-from-markdown` 判定 + 测试 `saveBlockNoteSidecar` round-trip 缺失态）。
- ✅ 外部 Markdown 修改 -> conflict handling（`conflict` 分支判定 + `loadBlockNote` 落 `.conflict-*.md` 副本）。
- ⏸️ mock OpenAI-compatible server -> AI request/stream/cancel — Phase 3/4 推迟。

### 11.4 手工验证（待执行）

- ⏸️ 新建笔记。
- ⏸️ 编辑标题、段落、标题块、列表、task list、图片。
- ⏸️ 查看 `.md` mirror。
- ⏸️ 重启应用。
- ⏸️ 切换 provider — Phase 3 推迟。
- ⏸️ AI rewrite selection — Phase 4 推迟。
- ⏸️ AI continue writing — Phase 4 推迟。
- ⏸️ 断网 / key 错误 / 模型错误 — Phase 4 推迟。

---

## 12. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Markdown mirror 有损 | 用户误以为 Markdown 是无损主数据 | 产品文案明确说明 JSON 保留完整块结构，Markdown 是可读副本 |
| AI transport 适配复杂 | AI 上线延期 | Phase 0 先做 transport spike，必要时先用 localhost endpoint |
| API key 泄露 | 严重安全问题 | key 不进 workspace，不进 renderer 持久化，不进日志 |
| 快速输入导致保存乱序 | 数据回滚 | revision + request id，只接受最新保存 |
| 外部编辑冲突 | 内容丢失 | hash 检测 + conflict copy，不静默覆盖 |
| 包体增大 | focused view 首次打开变慢 | editor/AI 分块懒加载，AI 样式只在 editor 打开时加载 |
| BlockNote 样式与 GhostBoard 冲突 | UI 不一致 | editor wrapper 统一主题变量和暗色适配 |

---

## 13. 产品文案建议

不要宣传为“纯 Markdown 存储”。更准确的说法：

> GhostBoard keeps every note as local Markdown, with an open JSON sidecar for lossless block editing.

中文：

> GhostBoard 会为每篇笔记保留本地 Markdown 文件，同时用开放 JSON sidecar 保存无损块编辑结构。

这既保留本地 Markdown 的信任优势，也不会对高级块编辑做错误承诺。

---

## 14. 待确认问题

- AI transport 走 RPC stream 还是 localhost endpoint。
- 第一阶段是否引入 BlockNote 官方 UI 包，还是自定义更轻的 wrapper。
- secret storage 是否第一版就接 OS keychain。
- Markdown mirror 是否每次保存都完整重写，还是支持 dirty block 增量投影。
- 图片 / 附件块是否复用现有 attachments 目录和安全校验。
- BlockNote 自定义块是否第一版就支持，还是先只用内置块。

---

## 15. 推荐执行顺序

1. Phase 0 spike，重点验证 BlockNote + AI transport。
2. 先落 BlockNote JSON sidecar + Markdown mirror，不急着接 AI。
3. 数据保存稳定后再做 provider 配置。
4. provider 配置稳定后接 AIExtension。
5. 最后删除 Tiptap。

原因：AI 建立在 editor document 和保存机制之上。如果先接 AI，再改存储，会造成重复返工。

---

## 16. 附录：BlockNote 文件/图片上传 — ✅ 已完成

> 本节为方案落地阶段补充的设计，原 §7.x / §10 未单独列出。

### 16.1 决策

- 复用现有 `attachments/` 目录与 `rpcSaveAttachment / rpcLoadAttachment / rpcSaveAttachmentFile` 管线，不为 BlockNote 引入新的存储位置。
- BlockNote 块属性中只保存 workspace 相对路径（如 `attachments/image_a1b2c3.png`），渲染时按需解析为 data URL。
- 上限沿用 attachments 25 MB data-URL 通道；超大文件后续可考虑接 `rpcSaveAttachmentFile`（需要拿到 OS 绝对路径，绕过 BlockNote `uploadFile(File)` API）。

### 16.2 实现

- `src/mainview/components/editor/blocknoteAttachments.ts`
  - `inferAttachmentKind(mimeType)` — 把 File 的 MIME 映射成 `'audio' | 'file' | 'image' | 'video'`。
  - `uploadBlockNoteFile(file)` — File → dataURL → `rpcSaveAttachment` → workspace 相对路径。
  - `resolveBlockNoteFileUrl(url)` — `http(s):/data:/blob:/file:` 直通，其余路径走 `rpcLoadAttachment` 转 dataURL。
- `BlockNoteEditor.tsx` 在 `useCreateBlockNote` 中注入这两个 callback。

### 16.3 覆盖入口

- ✅ 块菜单 / 工具栏的 Upload 按钮（image / video / audio / file 块）
- ✅ 粘贴图片到编辑器
- ✅ 拖拽文件进编辑器

### 16.4 好处

- JSON sidecar 不会被 base64 撑爆。
- Markdown mirror 会被 `blocksToMarkdownLossy` 写成 `![](attachments/...)`，离线打开 `.md` 仍可识别图片。
- 与 `ImageNode` / `AssetNode` 共用同一份 attachments 目录，未来做引用计数 / 清理 / 备份不需要区分编辑器来源。

### 16.5 测试

- `src/mainview/components/editor/blocknoteAttachments.test.ts` — 7 个用例，覆盖 kind 推断、保存成功 / 失败、URL 直通、路径解析、`rpcLoadAttachment` 失败回退。

### 16.6 待办

- ⏸️ 大文件（>25 MB）走 `rpcSaveAttachmentFile` 的拖拽分支（需要 OS 路径，无法走 BlockNote 默认 `uploadFile` API）。
- ⏸️ BlockNote 上传中的 loading / 失败 UI 复用 GhostBoard 主题（当前用 BlockNote 默认）。
