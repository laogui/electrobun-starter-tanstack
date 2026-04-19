# AI 融合方案计划 v2

## 1. 产品判断

结合当前项目现状，这个应用更像是一个 **可操作的空间化思考工具**，不是传统意义上的“笔记 + 聊天框”。

所以 AI 的目标不该是单纯提供一个问答入口，而应该是：

1. **读懂当前画布上下文**
2. **生成结构化建议**
3. **以可预览、可确认、可撤销的方式修改画布**

一句话概括：

> 这个项目最适合做的不是 “chat with AI”，而是 “AI as a canvas operator”。

---

## 2. v2 相比 v1 的关键升级

### 2.1 从“侧边栏功能”升级为“AI action pipeline”

v1 更像是在现有应用里塞一个 AI 侧边栏。

v2 更强调一条完整链路：

**收集上下文 → 生成结构化结果 → 预览 → 应用到画布 → 走现有持久化与撤销机制**

### 2.2 Provider 层只负责模型能力，不负责业务语义

v1 中把 `summarizeNodes()`、`generateCanvasFromPrompt()`、`clusterNodes()` 这类业务方法放进 provider abstraction 里，耦合有点重。

更合理的分层应该是：

- **provider 层**：只暴露模型能力
  - `generateText()`
  - `generateObject()`
  - `embed()`
  - `analyzeImage()`
- **service 层**：负责具体产品能力
  - `summarizeSelection()`
  - `generateBoard()`
  - `organizeSelection()`
  - `searchWorkspace()`

这样后续切换供应商时，不会把产品逻辑一并绑死。

### 2.3 AI 不直接写 store / manifest，而是返回 suggestion

这是 v2 最重要的设计点之一。

当前项目已经有：

- `useCanvasStore` 管理节点 / 边 / undo redo
- renderer 侧的节点创建、更新、聚焦逻辑
- Bun 主进程负责持久化

因此 **AI 最好不要直接在 Bun 里改 manifest**，而应该：

1. Bun 负责调用模型并返回结构化结果
2. Renderer 负责展示 preview
3. 用户确认后，由 renderer 调用现有 store action 应用更改
4. 现有持久化逻辑自动落盘

这样能自然复用：

- undo / redo
- 现有 UI 状态
- 节点创建与更新逻辑
- manifest / markdown note 持久化链路

### 2.4 API Key 不能放进 workspace settings

当前设置文件位于 workspace 的 `.ghostboard/settings.json`。

如果直接把 API key 存进去，会有明显风险：

- 可能被误提交到 git
- 多人共享项目目录时泄露
- 不适合作为长期 secrets 存储

v2 建议：

- **workspace settings**：只存非敏感项
  - provider
  - model
  - baseUrl
  - 默认功能开关
- **secret storage**：单独存放
  - 优先系统 Keychain / 用户级配置目录
  - 其次支持环境变量

### 2.5 搜索 / 检索单独作为一条演进路线

“总结”和“生成”可以先做，但“问这个主题在哪几张卡里”真正好用，通常需要：

- 关键词检索
- embedding 检索
- 增量索引
- 结果重排

所以 v2 建议把检索从“顺手加一个能力”提升为 **独立 phase**，不要和第一批生成能力混在一起做。

### 2.6 从一开始就考虑 schema、取消、超时、usage

不是所有模型都稳定输出结构化数据，所以 v2 需要从第一版就考虑：

- `zod` / schema validation
- request timeout
- cancel / abort
- usage / latency 统计
- provider capability flags

这些不是锦上添花，是后面不返工的基础。

---

## 3. 设计原则

1. **Action first**：优先让 AI 产出“可执行操作”，而不是长篇文字。
2. **Preview before apply**：先预览，再应用，默认不自动改画布。
3. **One AI action = one undo snapshot**：一次 AI 应用应能一键撤销。
4. **Local-first**：尽量复用本地已有数据与现有持久化能力。
5. **Stable schema over raw prompt**：上下文和输出都要结构化。
6. **Small context before huge context**：先做相关上下文，不要默认把全画布全塞给模型。
7. **Feature by feature**：先做一条非常稳的闭环，再扩展。

---

## 4. 推荐的用户体验形态

### 4.1 AI 不应只有侧边栏一个入口

侧边栏适合作为“主控制台”，但空间化产品里更高频的入口通常是 **上下文触发**。

推荐同时规划 3 个入口：

1. **AI 侧边栏**
   - 输入自由指令
   - 查看历史结果
   - 预览和应用建议

2. **选中节点后的快捷操作条**
   - 总结
   - 整理
   - 拆分
   - 生成待办

3. **右键菜单 / Command Palette**
   - 对单节点、folder、group 做快速 AI 操作

### 4.2 重点场景

第一批最值得做的不是通用聊天，而是以下几个高价值场景：

1. **总结选中节点**
2. **一句话生成画布草稿**
3. **自动整理选区**
4. **从图片 / 截图提取要点生成卡片**
5. **搜索“相关内容在哪些卡片里”**

---

## 5. 总体架构

### 5.1 Renderer 负责什么

Renderer 侧更适合处理：

- 当前选中状态
- 当前聚焦节点 / folder
- 当前 viewport
- 预览 AI 建议
- 应用 AI 结果到 `useCanvasStore`
- 触发一次统一的 undo snapshot

### 5.2 Bun 主进程负责什么

Bun 侧更适合处理：

- provider 选择与模型调用
- API key / local model 配置
- 访问 workspace notes / attachments
- 上下文 enrich
- 缓存、限流、日志、统计

### 5.3 为什么应用动作最好放在 Renderer

因为当前项目已经有很明确的前端状态流：

- 节点在 renderer 中编辑
- store 已集成 undo/redo
- persistence hook 会把状态落盘

如果 AI 直接在 Bun 修改 manifest，会带来几个问题：

- UI preview 不自然
- undo/redo 边界不清晰
- renderer 状态和磁盘状态更容易不同步

所以 v2 的核心原则是：

> Bun 负责“想”，Renderer 负责“改”。

---

## 6. 建议目录结构

```txt
src/
  shared/
    ai/
      types.ts
      tasks.ts
      actions.ts
      schema.ts

  bun/
    ai/
      providers/
        base.ts
        openai.ts
        openrouter.ts
        ollama.ts
      prompts/
        summarizeSelection.ts
        generateBoard.ts
        organizeSelection.ts
        searchWorkspace.ts
      services/
        summarizeSelection.ts
        generateBoard.ts
        organizeSelection.ts
        searchWorkspace.ts
      context/
        enrichContext.ts
      registry.ts
      settings.ts

  mainview/
    components/
      ai/
        AIPanel.tsx
        AIResultPreview.tsx
        AIActionBar.tsx
    lib/
      ai/
        buildAIContext.ts
        applyAIActions.ts
        normalizeAIResult.ts
```

如果暂时不想引入 `src/shared/`，也可以先放在 `src/mainview/lib/ai/` 和 `src/bun/ai/`，但类型最好尽快共享，不然 RPC 类型会开始重复。

---

## 7. 核心数据契约

### 7.1 Provider 层接口

```ts
type AIProviderCapabilities = {
  json: boolean;
  streaming: boolean;
  vision: boolean;
  embeddings: boolean;
};

type AIProvider = {
  id: 'openai' | 'openrouter' | 'ollama';
  capabilities: AIProviderCapabilities;
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  generateObject<T>(input: GenerateObjectInput<T>): Promise<T>;
  embed?(input: string[]): Promise<number[][]>;
  analyzeImage?(input: AnalyzeImageInput): Promise<AnalyzeImageResult>;
};
```

### 7.2 任务层接口

```ts
type AITaskType =
  | 'summarize_selection'
  | 'generate_board'
  | 'organize_selection'
  | 'search_workspace'
  | 'extract_image_notes';

type AITaskResult = {
  answer: string;
  actions: AIAction[];
  warnings?: string[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
    model?: string;
  };
};
```

### 7.3 Action 层接口

```ts
type AIAction =
  | {
      type: 'create_node';
      tempId: string;
      nodeType: 'card' | 'sticky' | 'group' | 'folder';
      position: { x: number; y: number };
      data: Record<string, unknown>;
      style?: Record<string, unknown>;
    }
  | {
      type: 'update_node';
      nodeId: string;
      updates: Record<string, unknown>;
    }
  | {
      type: 'create_edge';
      source: string;
      target: string;
      label?: string;
    }
  | {
      type: 'create_group';
      label: string;
      color?: string;
      childIds: string[];
    };
```

关键点：

- 模型输出永远是 **结构化 action + 简要解释**
- renderer 根据 action 做 preview 和 apply
- apply 之前做 schema 校验

---

## 8. 上下文设计

AI 不应直接读取整个 Zustand store 原始对象。

建议分成两层：

### 8.1 Renderer 侧 `buildAIContext()`

负责从当前交互状态提取“活上下文”：

- 当前 view id
- 当前 viewport
- selected nodes
- focused node / folder
- 当前相关 edges
- 邻近节点
- 当前用户 prompt

建议结构：

```ts
type AINodeContext = {
  id: string;
  nodeType: string;
  title?: string;
  content?: string;
  tags?: string[];
  position: { x: number; y: number };
  parentId?: string;
  size?: { width?: number; height?: number };
};
```

### 8.2 Bun 侧 `enrichAIContext()`

负责补充“磁盘上下文”：

- note markdown body
- folder children
- 图片文件元信息
- 未来的 OCR 结果
- 未来的 embedding 检索结果

### 8.3 Token budget 分层

不要默认把整张画布塞给模型，建议做 3 档：

1. **Lite**：仅选中节点标题 + 简述
2. **Standard**：选中节点 + 邻近节点 + 截断正文
3. **Deep**：选中区域 + 完整 note body + 检索补充

这样既控成本，也更稳定。

---

## 9. 设置与密钥管理

### 9.1 推荐配置拆分

**Workspace settings**（可跟随项目）

- provider
- model
- baseUrl
- 是否启用本地模型
- 默认 task 配置

**User secret settings**（不可跟随项目）

- API key
- 私有 endpoint token

### 9.2 设置页建议新增

- provider selector
- model input / 下拉选择
- base URL
- API key 输入
- “测试连接”按钮
- capability badges
  - JSON
  - Vision
  - Embeddings
  - Streaming

### 9.3 安全建议

明确避免把 API key 写进 `.ghostboard/settings.json`。

如果短期内没有 Keychain 集成，至少也应该：

- 存用户级目录，而不是 workspace
- 提供环境变量 fallback
- 在 UI 上明确说明 key 的存储位置

---

## 10. RPC 设计

v1 里是按功能拆 `aiSummarizeSelection`、`aiGenerateNodes`、`aiClusterNodes`。

v2 建议改成 **通用任务入口 + 少量辅助 RPC**。

### 10.1 推荐 RPC

- `getAISettings`
- `saveAISettings`
- `testAIConnection`
- `aiRunTask`
- `aiCancelTask`

### 10.2 `aiRunTask` 的好处

```ts
type AIRunTaskParams = {
  task: AITaskType;
  prompt?: string;
  context: AIContext;
};
```

好处：

- 避免 RPC 数量膨胀
- service 层更好复用
- UI 层更容易统一 loading / 错误 / usage 展示

### 10.3 Streaming

第一版可以先同步返回完整结果。

但 RPC 消息通道最好预留 streaming 能力，例如：

- `aiTaskChunk`
- `aiTaskDone`
- `aiTaskError`

因为总结和长文本生成后面大概率会需要流式体验。

---

## 11. 推荐实施顺序

### Phase 0：基础设施

目标：搭出一个不会返工太多的 AI 底座。

包含：

1. provider registry
2. AI settings 与 secret storage 方案
3. shared AI types / schema
4. `buildAIContext()`
5. `aiRunTask` RPC
6. `AIAction` 校验与 apply pipeline

### Phase 1：选中节点总结（推荐第一闭环）

能力：

- 选中若干节点
- 触发“总结”
- AI 返回：
  - 核心主题
  - 待办项
  - 风险点
  - 下一步建议
- 生成一张 summary card 的 preview
- 用户确认后一键插入画布
- 作为一次单独 undo snapshot

这是当前项目里最容易做出“立刻有价值”体验的一步。

### Phase 2：一句话生成画布

输入示例：

- “帮我做一个关于用户调研的脑图”
- “把这次需求讨论整理成初版画布”

输出：

- 多张 card / sticky
- 初始布局建议
- 可选 group / folder
- 可选 edges

关键要求不是“生成越多越好”，而是：

- 输出要稳定
- 结构要可预览
- 布局不能太乱

### Phase 3：自动整理选区

能力：

- 内容聚类
- 推荐 group 名称
- 建议标题 / tag / color
- 识别重复卡片
- 合并候选项

### Phase 4：检索与问答

建议分两步：

1. **先做关键词检索**
   - 标题
   - note body
   - 标签

2. **再做 embedding 检索**
   - workspace 索引
   - 增量更新
   - 结果重排

### Phase 5：图像理解

针对 image node 增加：

- OCR
- 图片摘要
- 从截图提取要点
- 转成卡片
- 从白板截图反推结构化节点

---

## 12. 推荐优先落地的最小闭环

如果只做一个最小但正确的闭环，我建议是：

1. AI 设置页扩展
2. secret storage 不进 workspace
3. 单 provider 接入（OpenAI 或 OpenRouter 二选一）
4. `buildAIContext()` 只支持 selected nodes
5. `aiRunTask('summarize_selection')`
6. AI 侧边栏 + 选中态快捷按钮
7. summary card preview
8. 一键应用 + 一键撤销

这条链路足够小，但已经能验证最关键的 4 件事：

- 上下文抽取是否靠谱
- 模型输出是否稳定
- preview/apply 机制是否顺手
- 用户是否真的会频繁使用

---

## 13. 新点子：值得考虑但不一定首发

### 13.1 Smart Paste

用户粘贴一大段会议记录、网页摘要、截图说明时，自动弹出：

- 拆成卡片
- 提取待办
- 生成 group
- 识别角色 / 时间 /主题

### 13.2 Relationship Suggestion

AI 不只生成卡片，也可以建议：

- 哪些卡片应该连边
- 边的 label 可以是什么
- 哪些点存在因果、依赖、冲突关系

### 13.3 Folder Digest

进入 folder 时，自动给出：

- 当前 folder 的主题
- 最近新增内容
- 未整理内容
- 推荐拆分方式

### 13.4 Critique Mode

不是“帮我生成”，而是“帮我挑问题”：

- 哪些结论证据不足
- 哪些卡片重复
- 哪些逻辑跳步太大
- 哪些待办没有 owner / deadline

### 13.5 Session Digest

重新打开某个 view 时，AI 提示：

- 上次工作停在什么位置
- 最近新增了什么节点
- 哪些节点值得优先整理

### 13.6 Auto-title / Auto-tag / Auto-color

这是非常轻量但高频的 AI 增益点，体验上往往比大而全的聊天更容易被反复使用。

---

## 14. 当前项目为什么很适合做这件事

当前代码结构其实已经具备不少有利条件：

- 有 canvas nodes，适合结构化输出
- card 已经和 markdown note 持久化关联
- image attachment 已经落地为文件引用
- Bun RPC 已经存在，可安全承接模型调用
- settings window 已经存在，便于挂载 AI 配置
- renderer store 已有 undo/redo，特别适合做 AI preview/apply

所以这不是“为了有 AI 而加一个聊天功能”，而是一个很适合做 **可操作 AI 层** 的桌面白板项目。

---

## 15. 最终建议

如果只保留一句实施建议，那就是：

> 先不要把 AI 当成聊天框做；先把它做成一个会产出结构化画布操作提案、并且能预览和撤销的系统。

具体落地顺序建议是：

1. 搭好 provider / settings / secret storage 底座
2. 做稳定的 context serializer
3. 做通用 `aiRunTask`
4. 先打通“总结选区 → 生成 summary card → 预览 → 应用 → 撤销”
5. 再扩展到生成画布、整理选区、检索和图像理解

这条路线更稳，也更贴合当前项目的结构优势。
