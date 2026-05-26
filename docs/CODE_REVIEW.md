# Code Review Standards & Process — GhostBoard

> **Why this exists**: 代码质量参差不齐是最常见的团队痛点。这份文档不是"教你怎么写代码"，而是**提供一套可执行的审查检查清单和工作流**，让每行进入 `main` 的代码都经过统一标准检验。

---

## 1. 审查前自动化检查（CI Gate）

所有 PR 必须通过以下自动化检查，**不通过不进入人工审查**：

| Check | Command | 阻塞级别 |
|-------|---------|----------|
| TypeScript 类型检查 | `bun run type-check` | 🔴 Blocker |
| Lint & Format | `bun run ci` (Biome + Ultracite) | 🔴 Blocker |
| 单元测试 | `bun run test` | 🔴 Blocker |
| 测试覆盖率不下降 | `vitest run --coverage` | 🟡 Warning |

> **linter 放宽的规则需人工关注**：本项目在 `biome.jsonc` 中关闭了 `noExplicitAny`、`noArrayIndexKey`、`useKeyWithClickEvents` 等若干规则。审查时这些仍需**人工判断是否合理**，尤其是 a11y 相关项。

---

## 2. 审查检查清单（Checklist）

### 🔴 Blocker — 必须修复才能合并

#### 安全性

- [ ] **路径遍历**：文件路径操作是否经过了 `assertWorkspaceAttachmentPath` 或类似校验？不允许将用户输入直接拼入 `join()`。
- [ ] **内容注入**：用户生成的 Markdown/HTML 是否正确使用了 `sanitize-html`/`DOMPurify`？尤其是 `dangerouslySetInnerHTML`。
- [ ] **IPC 边界**：从 renderer → bun 的 RPC 调用，参数是否经过了校验？Zod schema 是否与实际数据匹配？
- [ ] **敏感数据**：是否有 token、密码、API key 硬编码在代码中？
- [ ] **文件系统操作**：`atomicWrite` 是否被用于所有持久化写入？是否有裸 `writeFileSync` 导致数据损坏风险？

> **本项目特定关注点**：`src/bun/attachments.ts` 的 `assertWorkspaceAttachmentPath` 是路径安全的最后防线，任何新的文件 I/O 路径都**必须**复用它或实现同等校验。

#### 正确性

- [ ] **空的 catch 块**：`catch {}` 除非有注释说明为什么忽略错误且确实安全，否则必须处理或至少 `console.error`。
- [ ] **竞态条件**：异步操作是否处理了组件卸载后的回调？使用了 `cancelled` flag 或 `AbortController`？
- [ ] **Undo/Redo 一致性**：任何修改 `nodes`/`edges` 的操作是否在前调用了 `saveSnapshot()`？（参考 `canvasStore.ts` 的模式）
- [ ] **Null/Undefined 检查**：TypeScript `strict: true` 已启用，但 `(n.data as any).children` 这类绕过类型的模式必须做防御性 `?? []` 降级。
- [ ] **React Key**：列表渲染的 key 是否稳定且唯一？`noArrayIndexKey` 虽已关闭，但动态列表仍需避免 index key。

#### API & 数据契约

- [ ] **Schema 版本兼容**：修改 `CanvasManifest` / `WorkspaceConfig` 等持久化结构，schema 版本号 (`ghostboard-canvas/v1`) 是否需要升级？
- [ ] **Electrobun RPC 签名**：renderer 调用的 RPC 方法与 `src/bun/index.ts` 中注册的方法签名一致。

---

### 🟡 Suggestion — 强烈建议修复

#### 可维护性

- [ ] **大型文件拆分**：超过 500 行的普通文件考虑拆分。当前已知超标的：`routes/index.tsx` (~800行)。Zustand store 文件（如 `canvasStore.ts`）因集中管理所有 action 是其设计意图，不适用此标准，但单 action 超过 50 行时考虑提取为独立纯函数。
- [ ] **`any` 类型使用**：项目中 `noExplicitAny` 虽已关闭，但新增代码中使用 `as any` 必须有注释说明原因。**首选方案**：为 `node.data` 定义精确的类型 guard 或 discriminated union。
- [ ] **函数复杂度**：超过 50 行的函数是否有合理的职责边界？Zustand store actions 中嵌套 3 层以上的逻辑是否应该提取为纯函数？
- [ ] **重复代码**：不同 node type 的颜色切换逻辑（`changeNodeColor` 中的 if-else 链）是否可以抽象为策略映射？
- [ ] **Magic Values**：硬编码常量（颜色、尺寸、阈值）是否已提取到 `canvasConstants.ts` 或就近常量？

#### 性能

- [ ] **不必要的 Re-render**：`useMemo`/`useCallback` 是否正确使用？是否存在"每次渲染都创建新对象/函数"的模式？
- [ ] **N+1 查询**：`src/bun/search.ts` 的 `scanNotes` 是否在循环中做了不必要的文件读取？
- [ ] **大文件处理**：`saveAttachmentFile` 使用了 `Bun.write(fullPath, sourceFile)` 的流式拷贝，新增文件操作是否遵循此模式？
- [ ] **Canvas 渲染**：React Flow 的 `nodesWithState` 是通过 `useMemo` 计算的，新增节点数据变换是否也做了记忆化？

#### 测试

- [ ] 新增 public API / exported function 是否有对应的测试？
- [ ] 修改了 `canvasStore` 的 action 行为，是否有对应的 store 级别测试？
- [ ] Bun 主进程的新文件操作是否有测试？（参考 `workspace.test.ts` 的 mock 模式）
- [ ] 边界情况：空数组、null、undefined、超大数据量是否覆盖？

---

### 💭 Nit — Nice to Have

- [ ] 函数/变量的命名是否清晰表达了意图？避免 `data`、`item`、`tmp` 等过于泛化的名称。
- [ ] JSDoc 注释：exported 函数是否有简要说明？复杂逻辑是否需要解释"为什么"而不仅是"是什么"？
- [ ] 中英文混用：本项目允许组件注释用中文，但 API 命名必须用英文。保持一致性即可，不强求统一语言。
- [ ] TypeScript `as const` 是否在适用场景使用？const assertions 可以提供更精确的类型推断。
- [ ] CSS/Tailwind 类名是否利用 `cn()`（clsx + tailwind-merge）处理条件类名合并？

---

## 3. 审查工作流

### 3.1 PR 生命周期

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  创建PR  │───▶│  CI 通过  │───▶│  人工审查  │───▶│  修改迭代  │───▶│  合并到   │
│          │    │  (Gate)  │    │          │    │          │    │  main    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                       │               ▲
                                       └───────────────┘
                                        Request Changes
```

### 3.2 PR 提交者责任

1. **Self-review first**：提交 PR 前，自己先过一遍 [审查检查清单](#2-审查检查清单checklist)。
2. **PR 描述**（参考 `AGENTS.md`）：
   - 用户可见的变化
   - 验证命令（如何测试这个 PR）
   - UI 变化截图/录屏
   - 关联的 issue 或设计文档
3. **小而聚焦**：每个 PR 解决一个问题。超过 400 行变更应考虑拆分。
4. **Commit 格式**：保持 `type: summary` 的 Conventional Commit 风格（`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`）。

### 3.3 审查者责任

1. **响应时间**：24 小时内给出初步反馈（approve / comments / request changes）。
2. **对事不对人**：评论指向代码，不指向开发者。
3. **分级标记**：每条 comment 使用 🔴🟡💭 优先级标记，让提交者清楚哪些必须修、哪些建议修。
4. **具体可执行**：不写"这里有问题"，写"Line 42 的 `catch {}` 会吞掉网络错误，建议至少 `console.error`，或者如果确定安全请加注释说明"。
5. **认可好的代码**：写得好就应该说好。这跟挑错一样重要。

### 3.4 Review Comment 格式规范

```markdown
🔴 **Security: 路径遍历风险**
`src/bun/new-feature.ts:42` — `join(basePath, userInput)` 未经过路径安全校验。

**Why**: 如果 `userInput` 包含 `../../etc/passwd`，可能逃逸出 workspace 目录。

**Fix**: 使用 `assertWorkspaceAttachmentPath(wsPath, sanitizedPath)` 或复现其路径约束逻辑。
```

---

## 4. 本项目特定的关注模式

### 4.1 Zustand Store Actions 模式

本项目在 `canvasStore.ts` 中建立了 "裸更新 / 带快照更新" 的配对模式：

```typescript
// 裸更新 — 用于高频操作（拖拽、resize）
updateNodeData: (nodeId, updates) => {
  set((s) => ({ nodes: s.nodes.map(n => ...) }))
}

// 带快照 — 用于离散用户操作（确认、提交）
commitNodeData: (nodeId, updates) => {
  get().saveSnapshot();
  get().updateNodeData(nodeId, updates);
}
```

审查时注意：新增 action 是否正确选择了模式？高频更新的动作不应该触发 `saveSnapshot()`。

### 4.2 类型安全边界

`node.data` 的类型因 React Flow 的设计是 `Record<string, unknown>`，导致大量 `(n.data as any).children` 模式。新增代码应优先使用：

```typescript
// ✅ 使用类型守卫 + 默认值
const children = (Array.isArray(node.data.children)
  ? node.data.children
  : []) as FolderChildEntry[];
```

### 4.3 异步操作取消模式

审查异步 effects 时，检查是否处理了组件卸载/重渲染的竞态：

```typescript
// ✅ 当前代码中的正确模式 (routes/index.tsx 中 loadCanvas 相关 effect)
useEffect(() => {
  let cancelled = false;
  loadCanvas(activeViewId).then(async (data) => {
    if (cancelled) return;
    // ... use data
  });
  return () => { cancelled = true; };
}, [activeViewId]);
```

### 4.4 文件 I/O 安全模式

```typescript
// ✅ 所有持久化写入必须走 atomicWrite
await atomicWrite(configPath, JSON.stringify(data, null, 2));

// ✅ 所有文件路径必须经过 assertWorkspaceAttachmentPath
const { fullPath, relativePath } = assertWorkspaceAttachmentPath(wsPath, input.existingFile);
```

---

## 5. 工具与集成

### 5.1 Pre-commit Hook（已配置）

```yaml
# lefthook.yml — 每次 commit 自动运行
pre-commit:
  jobs:
    - run: bunx ultracite fix {staged_files}
      stage_fixed: true
```

这意味着提交前 lint 问题是自动修复的，人工审查可以专注于逻辑问题。

### 5.2 审查辅助命令

```bash
# 查看某次提交的完整 diff
git diff main...feature-branch

# 查看测试覆盖率变化
bun run test:coverage

# 在浏览器中查看覆盖率报告
open coverage/index.html

# 类型检查（使用 tsgo 原生编译器，比 tsc 快）
bun run type-check
```

### 5.3 Code Review Graph（已集成）

本项目已集成 `code-review-graph` MCP 工具，可以用于：
- `detect_changes`：快速分析变更的风险等级
- `get_impact_radius`：了解变更的影响范围
- `get_affected_flows`：查看哪些执行路径受影响

---

## 6. 审查文化

### 审查者的心态

> "我审查你的代码，不是因为我比你强，而是因为两双眼睛总比一双好。"

- **教育而非指责**：解释为什么不这样写，而不只是说"改掉"。
- **假设善意**：代码写成这样一定是有原因的。不理解时先询问，不直接判定为错误。
- **对事不对人**：评论针对代码，不针对人。"这里有个 bug"而非"你写了个 bug"。

### 提交者的心态

> "审查意见是对代码的反馈，不是对人的否定。"

- **不要把审查意见当成人身攻击**。它只是关于代码的。
- **不要防御**。审查者可能误解了你的意图 — 解释清楚就好，但不要变成争论。
- **有疑问就问**。如果审查意见不清楚，请求澄清。

### 时间分配建议

| PR 规模 | 建议审查时间 | 重点关注 |
|---------|-------------|---------|
| < 50 行 | 10-15 分钟 | 全面审查 |
| 50-200 行 | 20-30 分钟 | 安全 + 正确性 + 设计模式 |
| 200-400 行 | 30-45 分钟 | 安全 + 正确性 + 关键路径 |
| > 400 行 | 建议作者拆分 PR | — |

---

## 7. 快速参考卡片

打印或保存这张卡片，每次审查时快速过一遍：

```
┌─────────────────────────────────────────────────────┐
│              GhostBoard Code Review                  │
├─────────────────────────────────────────────────────┤
│ 🔴 BLOCKERS (必须修)                                 │
│   □ 路径遍历？有 `assertWorkspaceAttachmentPath`？     │
│   □ 用户输入 sanitize 了？（sanitize-html / DOMPurify） │
│   □ RPC 参数校验了？（Zod schema）                    │
│   □ 空的 catch {} 处理了？                            │
│   □ 异步操作有 cancelled flag？                       │
│   □ 修改 nodes/edges 前调了 saveSnapshot()？          │
│   □ `as any` 有防御性降级？                           │
│                                                      │
│ 🟡 SUGGESTIONS (建议修)                              │
│   □ 新代码有没有新增 `as any`（且未注释说明）？         │
│   □ 超过 500 行的普通文件考虑拆分了？                   │
│   □ 新增 exported function 有测试？                   │
│   □ useMemo / useCallback 正确使用？                  │
│                                                      │
│ 💭 NITS (锦上添花)                                   │
│   □ 命名清晰？                                        │
│   □ 复杂逻辑有注释说明"为什么"？                       │
└─────────────────────────────────────────────────────┘
```

---

*最后更新: 2026-05-26 · 随项目演进持续迭代*
