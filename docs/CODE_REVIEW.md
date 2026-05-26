# Code Review Standards & Process — GhostBoard

> **Why this exists**: 代码质量参差不齐是最常见的团队痛点。这份文档不是"教你怎么写代码"，而是**提供一套可执行的审查检查清单和工作流**，让每行进入 `main` 的代码都经过统一标准检验。

---

## 1. 审查前自动化检查（CI Gate）

所有 PR 必须通过以下自动化检查，**不通过不进入人工审查**：

| Check | Command | 阻塞级别 |
|-------|---------|----------|
| TypeScript 类型检查 | `bun run type-check` | 🔴 Blocker |
| Lint / 静态规则检查 | `bun run check` (Ultracite/Biome 只读检查) | 🔴 Blocker |
| 单元测试 | `bun run test` | 🔴 Blocker |
| 测试覆盖率不下降 | `bun run test:coverage` | 🟡 Warning |

> **linter 放宽的规则需人工关注**：本项目在 `biome.jsonc` 中关闭了 `noExplicitAny`、`noArrayIndexKey`、`useKeyWithClickEvents` 等若干规则。审查时这些仍需**人工判断是否合理**，尤其是 a11y 相关项。
>
> **命令边界**：`bun run ci` 当前会并发运行 `type-check`、`lint --fix` 和 `format --write`，适合作为本地整理命令；CI gate 应优先使用只读检查命令，避免在 CI 中改写工作区。

---

## 2. 审查检查清单（Checklist）

### 🔴 Blocker — 必须修复才能合并

#### 安全性

- [ ] **路径遍历**：附件路径是否经过了 `assertWorkspaceAttachmentPath`？非附件 workspace 路径是否有对应领域的 allowlist、manifest entry 或 normalized relative path 约束？不允许将用户输入直接拼入 `join()`。
- [ ] **内容注入**：用户生成的 Markdown/HTML 是否正确使用了 `sanitize-html`/`DOMPurify`？尤其是 `dangerouslySetInnerHTML`。
- [ ] **IPC 边界**：从 renderer → bun 的 RPC 调用，参数是否在 handler 边界做了运行时防御或规范化？如果该接口已有 Zod/schema 体系，schema 是否与实际数据匹配？
- [ ] **敏感数据**：是否有 token、密码、API key 硬编码在代码中？
- [ ] **文件系统操作**：workspace config、canvas manifest、note markdown、settings 等结构化状态写入是否走 `atomicWrite`？附件、导出、模板缩略图等二进制/用户选择路径写入是否有清晰的路径边界、失败处理和必要的替换策略？

> **本项目特定关注点**：`src/bun/attachments.ts` 的 `assertWorkspaceAttachmentPath` 是 `attachments/` 目录的最后防线。其他文件 I/O 场景也必须有同等级别的领域约束，但不应错误复用附件专用 helper。

#### 正确性

- [ ] **空的 catch 块**：`catch {}` 除非有注释说明为什么忽略错误且确实安全，否则必须处理或至少 `console.error`。
- [ ] **竞态条件**：异步操作是否处理了组件卸载后的回调？使用了 `cancelled` flag 或 `AbortController`？
- [ ] **Undo/Redo 一致性**：离散、可撤销的用户操作是否在第一次修改 `nodes`/`edges` 前创建一次 `saveSnapshot()`？拖拽/resize、selection、hydration、远程 metadata 更新等高频或非用户编辑路径不应每次 mutation 都入 undo stack。
- [ ] **Null/Undefined 检查**：TypeScript `strict: true` 已启用，但 `(n.data as any).children` 这类绕过类型的模式必须做防御性 `?? []` 降级。
- [ ] **React Key**：列表渲染的 key 是否稳定且唯一？`noArrayIndexKey` 虽已关闭，但动态列表仍需避免 index key。

#### API & 数据契约

- [ ] **Schema 版本兼容**：修改 `CanvasManifest` / `WorkspaceConfig` 等持久化结构，schema 版本号（如 `ghostboard-canvas/v1`、`ghostboard-workspace/v1`）是否需要升级？
- [ ] **Electrobun RPC 签名**：renderer 调用的 RPC 方法与 `src/bun/index.ts` 中注册的方法签名一致；新增危险字段是否在 handler 内校验或规范化。

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
- [ ] **N+1 查询**：改动搜索索引时，是否保持 manifest 一次遍历 + note 一次扫描，避免同一 note 被重复读取？
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

**Fix**: 如果这是附件路径，使用 `assertWorkspaceAttachmentPath(wsPath, sanitizedPath)`；如果是其他 workspace 路径，先映射到受控 manifest entry 或 allowlist，再 resolve。
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

审查时注意：新增 action 是否正确选择了模式？离散用户操作应在 mutation 边界创建一次 snapshot；拖拽、resize、selection、hydration、远程 metadata 刷新等高频或非用户编辑路径不应该每次更新都触发 `saveSnapshot()`。

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

本项目有多类文件写入，审查时先确认写入场景，再检查对应边界：

- workspace config、canvas manifest、note markdown、settings 等结构化状态：使用 `atomicWrite`，避免半写入文件。
- `attachments/`：使用 `assertWorkspaceAttachmentPath` 约束相对路径，再按内容类型使用 `Bun.write` 等二进制写入方式。
- 用户选择的导出路径：路径必须来自受控文件选择流程，文件名需要规范化，不能把任意输入当目标目录。
- dev-only 模板缩略图写入：必须限制在已注册 template id 和可确认的 repo root 下。

```typescript
// ✅ 结构化状态写入使用 atomicWrite
await atomicWrite(configPath, JSON.stringify(data, null, 2));

// ✅ 附件路径使用 attachments/ 专用边界
const { fullPath, relativePath } = assertWorkspaceAttachmentPath(
  wsPath,
  input.existingFile
);
```

---

## 5. 工具与集成

### 5.1 Pre-commit Hook（已配置）

```yaml
# lefthook.yml — 每次 commit 自动运行
pre-commit:
  jobs:
    - run: bunx ultracite fix {staged_files}
      glob:
        - "**/*.js"
        - "**/*.jsx"
        - "**/*.ts"
        - "**/*.tsx"
        - "**/*.json"
        - "**/*.jsonc"
        - "**/*.css"
      stage_fixed: true
```

这意味着提交前 staged JS/TS/JSON/CSS 文件的 lint 问题会自动修复，人工审查可以专注于逻辑问题。当前 hook 不覆盖 Markdown；修改 `docs/*.md` 时需要手动检查格式，或另行扩展 lefthook glob。

### 5.2 审查辅助命令

```bash
# 查看某次提交的完整 diff
git diff main...feature-branch

# 查看测试覆盖率变化
bun run test:coverage

# 只读 lint / 静态规则检查
bun run check

# 本地自动修复（会改写文件，不作为 CI gate）
bun run fix

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
│   □ 附件路径用 `assertWorkspaceAttachmentPath`？        │
│   □ 其他文件路径有 allowlist / manifest 约束？          │
│   □ 用户输入 sanitize 了？（sanitize-html / DOMPurify） │
│   □ RPC 边界有运行时防御/校验？                         │
│   □ 空的 catch {} 处理了？                            │
│   □ 异步操作有 cancelled flag？                       │
│   □ 可撤销操作在边界 saveSnapshot()？                  │
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
