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

---

## 16. 扩展点子库：基于项目独有结构的增量构想

这一节不重复 §4.2 和 §13 已有的方向，而是顺着当前项目的“独有肌肉”继续推：多视图 manifest、Folder 子画布、per-card markdown note、模板体系、`linkPreview`、`cleanup`、`search`、undo 快照、Bun RPC、本地优先。

### 16.1 利用「多视图 + Folder 子画布」结构

- **跨 view 知识连接**
  扫描所有 view 的节点，发现“主题相似但分散在不同 view”的节点，建议合并 view 或建立跨 view 引用边；是 §13.2 关系建议的 workspace 级版本。
- **View 自动起名 + 封面**
  view 内容变化到阈值时，AI 重新建议 view 名 / emoji / 封面缩略图，刷新 ViewSwitcher 的可识别度。
- **Folder 孵化建议**
  当一个 group 内 sticky 增长过多，AI 提示“是否提升为 Folder 子画布并按主题自动分簇”，复用现成的 Folder 子画布模型一键执行。
- **Inbox 分诊**
  Quick capture 出来的零散卡，由 AI 判断“应该归到哪个现有 view / folder”，给出 routing 提案而不是直接搬。

### 16.2 利用「Edge + label」的关系语义

- **Edge label 智能补全**
  用户刚连完一条 edge，AI 立即给出 3–5 个候选标签（依赖 / 因果 / 矛盾 / 派生 / 引用 / 反例），点击即贴；是 §13.2 的微交互化版本。
- **隐式边发现**
  对当前 view 做相似度 / 共现分析，建议“这两个节点也许应该连起来”，作为半透明虚影边出现、hover 才显形（贴合「创意特性候选清单」§3 的 Backlink 幽灵线思路）。
- **逻辑健康检查**
  检测 cycle、孤岛、断链、跳步推论；以 critique mode 子集呈现，但只针对 graph 层。

### 16.3 利用「per-card markdown note + Tiptap」

- **Tiptap inline AI**
  在 note 编辑器里选中段落 → 改写 / 简化 / 扩写 / 翻译 / 改语气；这是“note 层”AI，区别于“画布层”AI，高频、低成本。
- **一卡拆多卡**
  一张 note 太长时，AI 提议“拆成 3 张并自动连边、保留原文为父卡”。
- **多卡合并为长 note**
  反向操作：选中一组 sticky → AI 输出结构化 markdown，直接落到一张新 card 的 note 里。
- **Auto emoji / 颜色 / 尺寸**
  §13.6 提到 auto-title/tag/color，可再加 **emoji + 卡片尺寸建议**（重要的卡变大、辅助卡变小），强化语义化缩放体验。

### 16.4 利用「Templates 体系」（`src/bun/templates/*`）

- **模板填充器**
  用户选一个模板（kanban / sprint-retro / eisenhower），粘贴一段会议记录 / 语音转写，AI 把内容塞到模板各 slot 并保留模板布局。
- **从画布反推模板**
  用户在空白画布手工搭了某种结构后，“保存为模板”时 AI 自动抽变量、占位符、注释，沉淀到 `src/bun/templates/<id>/`。
- **模板推荐**
  根据当前画布形态（“4 列等宽 + sticky”）建议“切换到 kanban 模板的布局风格”，复用 `resolvePlacement` / `collision` 已有能力。

### 16.5 利用「Image / Attachment / linkPreview」

- **Link card AI 摘要**
  `src/bun/linkPreview.ts` 已经抓 og；AI 再补一句中文摘要 + 自动 tag + 缩略色块，让 link 卡有信息密度。
- **白板照片反推画布**
  §11 Phase 5 提了，但可以更进一步：保留原图位置布局（OCR + 区域聚类），生成的节点尽量贴合原图坐标，原图作为底图淡显。
- **图片聚类成 group**
  对一组 image 节点做视觉相似度，建议聚类并自动起 group 名。
- **截图自动入库**
  系统剪贴板里有截图时，AI 直接判断“是 UI 截图 / 论文图 / 图表”，给出对应卡类型 + 标题 + tag。

### 16.6 利用「Snapshot / Undo / 时间穿梭」

- **AI Diff narration**
  对比两个 manifest snapshot，用自然语言写“过去 7 天这块画布发生了什么”，作为 review 的 cover 卡。
- **Replay 旁白**
  在「时间穿梭」播放时（创意清单 §7），AI 给每段时间生成一句旁白，做成思考延时摄影的字幕轨。
- **悔棋复盘**
  连续 undo 多步后，AI 总结“你刚才尝试了什么思路，为什么撤回”，可作为一张 reflection 卡留下。

### 16.7 利用「Cmd+K + 现有 RPC」做自然语言操控

- **NL → store action**
  “把所有红色卡片靠右对齐”、“删掉 30 天没改过的 sticky”、“把含 #meeting 的卡聚成 group”——AI 输出 `AIAction[]`，复用 §10 的 apply pipeline，但绑到 Command Palette。
- **宏录制**
  用户连做一串操作后，AI 识别为可复用 macro，命名后存为 workspace 命令。
- **危险操作守门**
  破坏性 NL 指令（删多张卡、清空 view）默认进入 dry-run 预览，强制走 §3 的 “preview before apply”。

### 16.8 Workspace 健康度（结合 `cleanup.ts` / `search.ts`）

- **重复 / 近似卡合并向导**
  对整个 workspace 做相似度扫描，输出 side-by-side diff，让用户决定是否合并 + 保留哪个 noteId。
- **低信息节点检测**
  识别 “todo”、“测试”、“hahaha” 这类几乎无内容的卡，提示批量清理或补全；天然嫁接到现有 cleanup pipeline。
- **孤岛笔记复活**
  没有任何引用 / edge 的 note，AI 给出“建议挂到哪个 view 的哪个 group”。

### 16.9 输出 / 演示场景

- **演示路径自动编排**
  和「创意清单」§8 演示模式联动：选一个起点节点，AI 推荐一条逻辑顺序 edge 链，自动生成 slideshow。
- **画布 → 长文导出**
  选中一组节点 + edges → AI 把空间布局压平成线性 markdown / Notion 文档，连边变成段落过渡词。
- **会议纪要导出**
  选中带 `#meeting` 的所有节点 → 标准纪要 markdown（参与者 / 决议 / 行动项），落到一张新 card。

### 16.10 个性化 & 风格化

- **风格学习**
  AI 记住用户偏好（标题口吻、emoji 习惯、颜色编码体系），后续生成自然贴合，而不是每次都让用户改回去。
- **知识画像**
  workspace 级“主题热力图”：最近 30 天最活跃话题、被忽略的旧主题，作为 dashboard view。
- **画布提醒**
  “下周三和 X 聊”、“3 天内回复邮件”——AI 在 sticky 里识别时间意图，挂上提醒徽标。

### 16.11 隐私 & 成本（贴合 local-first）

- **本地 / 云 双层路由**
  取标题、起 emoji、auto-tag 这类高频小任务走本地小模型；总结、生成画布才走云。`AIProvider` 层多一个 `tier: 'fast' | 'smart'`。
- **外发脱敏**
  prompt 出本机前，本地正则 + 小模型先脱敏人名 / 邮箱 / token，返回再回填。settings 里加开关。
- **预算面板**
  右下角 mini widget 显示本周 AI 花费 + 哪类 task 最贵 + 命中缓存率，反向引导用户用对 tier。

### 16.12 元能力 / Self-improving

- **Prompt Studio**
  各 task 的 system prompt 当成可编辑、可版本化的 workspace 资源，进 settings window；可 fork / 分享 prompt 包。
- **Reject → few-shot**
  用户拒掉某个 AI 结果时可填一句“为什么不好”，下次同 task 自动作为 negative example，效果累积。
- **本地偏好数据集**
  accept / reject 沉淀成本地 jsonl，未来可拿来微调本地小模型，做“我自己的 GhostBoard 风格”。

### 16.13 跨应用 / MCP（与「创意清单」§4 的 MCP server 联动）

- **MCP 工具集扩展**
  在 `ghostboard_search` / `ghostboard_create_card` 之上加 `ghostboard_propose_actions`，让 Claude / Cursor 不能直接改画布，而是产出 v2 的 `AIAction[]`，仍走 preview/apply 安全网。
- **从外部 App 抓资料**
  节点里出现 “看一下 X 文档”，AI 提议“我去抓并生成 link card”，复用 linkPreview 管线。
- **CLI quick capture + AI**
  `ghostboard quick "..."` 时本地小模型立刻补全成结构化卡（标题 / tag / 推荐 view），不再只是裸 sticky。

---

## 17. 如果只挑 3 个补到主路线里

- **Tiptap inline AI（§16.3）**
  v2 把“画布层”动作讲透了，但漏了“note 层”AI——这是真正每天高频用的入口，且完全复用 Tiptap 现有选区。
- **NL → store action via Command Palette（§16.7）**
  和「创意清单」的 `Cmd+K` 路线天然合体；把 §10 的 `aiRunTask` + `AIAction` pipeline 复用到自然语言操控，零额外架构成本。
- **本地 / 云双 tier provider（§16.11）**
  在 §7 的 `AIProviderCapabilities` 上加 `tier`，是 “local-first 信仰落到模型层”的关键一步，也直接影响 §10 的 RPC 形态，越早定越省返工。

---

## 18. 业界对标映射 + 仍待补强的增量点子

> 这一节做两件事：(1) 把前文能力对照到 React Flow + AI 的业界做法，看哪些是成熟方向、哪些是差异化护城河；(2) 只补 §4 / §13 / §16 里**尚未覆盖或没讲透**的点，不重复已有清单。

### 18.1 先把两条路线分清

React Flow 上的 AI 产品大致两类，本项目坚定属于后者：

- **A. 节点即 AI 工作流编排**：节点 = LLM / 工具 / 逻辑步骤，边 = 数据流。代表 **Langflow、Flowise**（两者 UI 都基于 React Flow），以及 **Dify、n8n** 等同类工作流工具（不一定用 React Flow）。React Flow 官方也出了 `AI Workflow Editor` 模板（AI SDK + shadcn）。
  - **不是本项目形态**（画布是"知识容器"不是"执行图"），但有一点可借：让"边"承载可被程序消费的语义——正好支撑 §16.2 的 edge label 体系。
- **B. AI 操作 / 增强知识画布**：AI 读懂画布、生成 / 整理 / 连接 / 问答。这才是 GhostBoard 的赛道。

### 18.2 能力 ↔ 业界对标表

| 本项目能力（章节） | 业界对标 | 对方杀手锏 | 我们的差异化机会 |
|---|---|---|---|
| 一句话生成画布（§4.2 / Phase 2） | ClickUp Whiteboard Generator、FigJam AI、Jeda.ai | NL prompt 直接铺一张图 | local-first + 每卡 markdown 落盘，生成物可被外部编辑器接管 |
| 自动整理 / 聚类（Phase 3 / §16.1） | Miro `Cluster by`、Mural AI clustering、Dovetail AI clustering | 选一堆 sticky → 按主题 / 情感自动分簇 + 自动起簇名 | 复用 Group/Folder 子画布 + `collision` / `resolvePlacement`，聚类后真正落成空间布局 |
| 关系建议 / 自动连线（§13.2 / §16.2） | InfraNodus、Napkin AI、Obsidian/Logseq graph | 文本 → 关系网络 / 自动配图连线 | 已有 `LabeledEdge`（标签 / 颜色 / 动画），可做"带语义标签的连线"而非裸连线 |
| 检索问答（Phase 4） | NotebookLM、Heptabase AI、Mem | source-grounded 回答 + inline 引用 | 引用可直接定位 / 高亮回画布节点（见 18.3.3） |
| 图片 / 截图反推（Phase 5 / §16.5） | tldraw `Make Real`、Jeda.ai | 草图 / 截图 → 结构化产物 | 保留原图坐标布局，原图作底图淡显 |
| Critique / 缺口（§13.4 / §16.2） | InfraNodus content gaps | 基于图结构找"未连接的主题簇" | 升级为语义层结构洞分析（见 18.3.2），超出纯图论健康检查 |
| note 层改写（§16.3） | Notion AI、BlockNote `xl-ai`（本项目已集成） | 选段改写 / 扩写 / 翻译 | 已经有了——关键是把"note 层"和"画布层"AI 明确分双层 |

### 18.3 §13 / §16 尚未覆盖、值得单列的点

#### 18.3.1 Ghost 建议层：把"预览"做成产品名级别的统一范式（增量重点）

§16.2 提过"半透明虚影边 hover 才显形"，建议把它**升级成所有生成类 AI 的统一空间化 preview 机制**，而不只针对边：

- AI 产出的 `AIAction[]` 一律先渲染为 **ghost 节点 / ghost 边 / ghost group**（半透明、虚线描边、`motion` 入场），叠在真实画布上。
- 支持单个 accept（点 ghost 上的 ✓）/ 批量 accept / 全部 dismiss；accept 才实体化并进 §3 的单次 undo 快照。
- 直接呼应产品名 **GhostBoard**，也是 §3 "preview before apply" 最自然的视觉表达——比侧边栏列 diff 更"空间"。

#### 18.3.2 语义结构洞分析（InfraNodus 式）（增量重点）

§16.2 的"逻辑健康检查"只做 cycle / 孤岛 / 断链（纯图论）。可再叠一层**语义层**：

- 对一张 view 的节点做 embedding，找出"语义相近但图上没有边"的成对 / 成簇节点 →"这两块也许该连起来"。
- 找出"两个话题簇之间完全没有桥接节点"的**结构洞** → 生成一句研究式提问（"X 和 Y 之间缺一个连接，你怎么看？"），落成一张 ghost sticky。
- 这正是 InfraNodus 的核心价值，天然贴合本项目的 node/edge 模型。

#### 18.3.3 引用高亮问答（NotebookLM 式）

Phase 4 只说"检索 + 重排"，但空间化产品的杀手锏是**把引用打回画布**：

- 问答答案里每个论据带 `[来源]` 角标 → 点击直接 `fitView` 聚焦并高亮对应节点（复用 `canvasFocus`）。
- "我关于 X 的想法散在哪几张卡" → 给答案的同时在画布上点亮全部命中节点，而不是返回一个列表。

#### 18.3.4 思维导图式发散（节点钻取）

§16.3 有"一卡拆多卡"（向内拆），缺"向外发散"：

- 选一张卡 →"发散"→ AI 生成 3–5 张子卡并自动连边、径向布局在母卡周围，可连续点击逐层展开。
- 经典 brainstorm / mind-map 扩展，复用 `useNodeCreation` + 力导向布局。

#### 18.3.5 语义化缩放 AI（呼应 `ZoomLevelContext`）（增量重点）

项目刚落地的 `ZoomLevelContext`（commit 2d14f72）是一个**别家没有的独有杠杆**：

- 缩小时：AI 为每个 group / 区域生成一句"区域摘要标签"，远看就能读懂整块在讲什么（语义级 LOD，而非单纯隐藏细节）。
- 放大时：才显示完整卡片内容。
- 等于给"无限画布"叠了一层 **AI 生成的语义地图**，是 Miro / Mural 都没做透的方向。

#### 18.3.6 画布区域 → 真实产物（Make Real 式）

- 框选一组节点 + edges →"生成 X"：导出为 PRD / 周报 / kanban JSON / 一段可运行代码草稿。
- 与 §16.9"画布 → 长文"互补：那是压平成文，这是**变形成另一种产物**。

### 18.4 一句话收口

本项目相对纯 prompt 类工具的最大护城河，是 **React Flow 的"空间 + 图"结构 + local-first 落盘 + 现成 undo**：能把 AI 输出做成**可被空间化预览（ghost）、可被图结构消费（edge 语义）、可被一键撤销**的提案。对标产品里没有谁同时占满这三点。
