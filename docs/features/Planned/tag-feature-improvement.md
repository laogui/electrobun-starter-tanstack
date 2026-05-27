# 标签功能完善方案

## 一、现状盘点

| 层级 | 状态 | 关键文件 |
|---|---|---|
| **数据模型** | 已定义 `tag` / `tagColor` / `tags[]` 三字段 | `src/bun/notes.ts` (NoteFrontmatter) |
| **持久化** | `cardDataToNote` 只写 `tag` / `tagColor`，**未写 `tags[]`** | `src/bun/notes.ts:374-380` |
| **渲染** | CardNode 在只读视图、zoomed-out 视图渲染单个 `tag` 徽章 | `CardNode.tsx:210-219, 403-408` |
| **搜索** | 后端 `search.ts` 同时索引 `tag` 与 `tags[]`，权重 80；前端 `useSearch` 仅查 `tag` | `src/bun/search.ts:427-455` |
| **模板** | 模板列表有 `tags[]` 字段，但只用于模板筛选，非用户标签 | `useTemplates.ts` |
| **编辑 UI** | ❌ 完全缺失 | — |
| **i18n** | `messages/*.json` 无 tag 相关 key | — |

**核心矛盾**：单 `tag` 字段（带颜色）和多 `tags[]` 字段（不带颜色）并存，语义混乱。需要先统一数据模型。

---

## 二、数据模型决策

保留**双轨**但语义明确分离：

| 字段 | 类型 | 语义 | 渲染位置 |
|---|---|---|---|
| `tag` | `string` | **主分类徽章**（单选，带 `tagColor` 醒目背景） | 卡片左上角徽章 |
| `tags` | `string[]` | **多标签集**（无色，用于筛选/搜索/聚合） | 卡片底部小字 chips + 筛选侧栏 |

> 这样兼容现有 frontmatter，又给后续"标签筛选侧栏""智能聚合视图"留空间。

---

## 三、分期实施计划

### Phase 1 — 最小可用编辑（MVP）

**目标**：用户可在 UI 上给卡片加/改/删 tag。

#### 1.1 持久化补全
- **文件**：`src/bun/notes.ts` → `cardDataToNote`
- 补写 `tags[]`（去重、过滤空字符串、限制最多 8 个、单个 ≤ 32 字符）
- 新增 `sanitizeTags()` 工具函数，并加单测 `notes.test.ts`

#### 1.2 卡片标签编辑器组件
- **新增**：`src/mainview/components/card/TagEditor.tsx`
  - 输入框 + 回车确认 / 逗号分隔；已有 tag 显示为可删除 chip
  - 受控 props：`tags: string[]`、`tag?: string`、`tagColor?: string`、`onChange(next)`
  - 复用 `Popover`（base-ui 已在用）作为弹层载体
- **集成点**：`CardNode.tsx` → `EditableCardContent`
  - 在标题下方加一行 "+ Tag" 入口，点击展开 TagEditor
  - 单 `tag` 区域 hover 时显示 ✎ 编辑、× 移除按钮
  - 颜色选择：复用 `CARD_COLORS` 调色板，做轻量 `<ColorSwatch>` 子组件

#### 1.3 右键菜单入口
- **文件**：`src/mainview/components/canvas/ContextMenu.tsx`
- 在 `getCardItems()` 中新增 `{ id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag }`（Tag 图标已 import）
- `useContextMenu.ts` 增加 `case 'edit-tag'`，将节点置入"标签编辑态"
- store 新增 `editingTagNodeId`；CardNode 监听该 id 自动打开 TagEditor 并 focus 输入框

#### 1.4 搜索联动
- `useSearch.ts` 把 `tags[]` 也加入 candidates（现仅索引 `tag`）
- CardNode 主视图下方加 `data.tags?.map(...)` 渲染为灰色小 chips（hover 显示删除）

#### 1.5 i18n
新增 key（`messages/en.json` + `messages/zh.json`）：
- `menu_edit_tag` · `tag_editor_placeholder` · `tag_editor_add`
- `tag_editor_remove` · `tag_limit_reached`

#### 1.6 测试
- `TagEditor.test.tsx`：添加/删除/键盘交互（Testing Library）
- `notes.test.ts`：`sanitizeTags` 去重、长度限制、空过滤
- `useSearch` 增加用例：`tags[]` 命中应返回 `matchField === 'tag'`

---

### Phase 2 — 标签管理与筛选

#### 2.1 全局标签索引（后端）
- **新增**：`src/bun/tags.ts`
  - `listAllTags(wsPath): Promise<TagSummary[]>` — 扫描所有 `.md` 聚合 `tag` + `tags[]`
  - 新增 RPC `rpcListTags()`
- 用 `useQuery(['tags'])` 缓存；写入 manifest 时通过 `queryClient.invalidateQueries(['tags'])` 失效

#### 2.2 标签筛选侧栏
- **新增**：`src/mainview/components/tags/TagSidebar.tsx`
  - 浮层（沿用 `LibraryPopup` 的 motion + 样式风格）
  - 列出所有 tag、按 count 排序；点击 → 在画布上"高亮 + 聚焦"该 tag 的所有节点
  - 复用 `canvasFocus.openFocusedById` 思路：批量获取节点 id，淡化其他节点
- store：`canvasStore` 增加 `activeTagFilter: string | null`、`setActiveTagFilter`
- CardNode 根据 `activeTagFilter` 控制透明度（参考现有 `isHidden` 机制）

#### 2.3 TagEditor 自动补全
- TagEditor 接受 `useQuery(['tags'])` 数据，输入时显示已存在 tag 下拉建议
- 减少拼写差异导致的"幽灵标签"

#### 2.4 重命名 / 删除标签（后端批量操作）
- TagSidebar item 右键菜单：Rename / Delete
- `rpcRenameTag(oldName, newName)` — 扫所有 `.md`，rewrite 后 `atomicWrite`
- `rpcDeleteTag(name)` — 同上
- 操作前弹 confirm（显示影响笔记数量）

---

### Phase 3 — 进阶（按需）

| 能力 | 说明 |
|---|---|
| **标签智能视图** | 一个 tag = 一个动态视图，自动布局所有打了该 tag 的节点 |
| **标签着色规则** | 用户可在设置里为每个 `tags[]` 项设置专属颜色，渲染到 chip 上 |
| **拖放打标签** | 把 TagSidebar 中的 tag 拖到节点上即可贴标签 |
| **批量打标签** | 多选节点 → 右键 → "为选中项添加标签" |
| **Markdown 行内 #tag 解析** | 编辑器中输入 `#hello` 自动加入 `tags[]`（参考 Obsidian） |

---

## 四、影响面 / 风险评估

| 风险 | 缓解 |
|---|---|
| `tag` vs `tags[]` 语义混淆 | 在 docs/tech-spec.md 补一节明确二者职责 |
| 既有 `.md` 文件无 `tags[]` 字段 | 加载侧已是可选字段，无需迁移 |
| 大量 tag 重命名/删除耗时 | 后端用 `listFilesRecursive` 异步遍历 + 进度 toast |
| 搜索结果重复（tag 与 tags 同名） | `search.ts:443-455` 已有互斥分支；前端 mergeResults 需保持 dedup |
| 自动补全与外部输入冲突 | 仅在 focus 时显示，Esc 关闭 |

---

## 五、文件改动清单

### Phase 1 必改
| 文件 | 类型 | 说明 |
|---|---|---|
| `src/bun/notes.ts` | 修改 | 持久化 `tags[]` + `sanitizeTags()` |
| `src/bun/notes.test.ts` | 修改 | 新增 sanitizeTags 单测 |
| `src/mainview/components/card/TagEditor.tsx` | 🆕 新增 | 标签编辑器组件 |
| `src/mainview/components/card/TagEditor.test.tsx` | 🆕 新增 | 组件测试 |
| `src/mainview/components/canvas/nodes/CardNode.tsx` | 修改 | 集成 TagEditor 入口 |
| `src/mainview/components/canvas/ContextMenu.tsx` | 修改 | 新增 edit-tag 菜单项 |
| `src/mainview/hooks/useContextMenu.ts` | 修改 | 处理 edit-tag case |
| `src/mainview/hooks/useSearch.ts` | 修改 | `tags[]` 加入索引 |
| `src/mainview/store/canvasStore.ts` | 修改 | 新增 `editingTagNodeId` |
| `messages/en.json` / `messages/zh.json` | 修改 | 新增 i18n key |

### Phase 2 新增
| 文件 | 类型 | 说明 |
|---|---|---|
| `src/bun/tags.ts` | 🆕 新增 | 全局标签索引 + RPC |
| `src/bun/index.ts` | 修改 | 注册新 RPC |
| `src/mainview/lib/rpc.ts` | 修改 | 客户端 wrapper |
| `src/mainview/hooks/useTags.ts` | 🆕 新增 | React Query hook |
| `src/mainview/components/tags/TagSidebar.tsx` | 🆕 新增 | 标签筛选侧栏 |

---

## 六、推荐执行顺序

1. **1.1 + 1.6（持久化 + 测试）** — 数据闭环安全
2. **1.2 + 1.5（编辑器 + i18n）** — 端到端跑通
3. **1.3 + 1.4（右键 + 搜索）** — 完整 MVP
4. Phase 2 视用户反馈决定优先级
