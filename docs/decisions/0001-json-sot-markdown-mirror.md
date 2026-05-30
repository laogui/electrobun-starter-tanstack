# ADR 0001 — JSON 是 source of truth，Markdown 是 mirror

- 状态：Superseded（被 `docs/decisions/0002-json-sot-markdown-export.md` 取代）
- 日期：2026-05-28
- 决策者：项目维护者
- 取代：本仓库 README / PRD / `blocknote-ai-migration-plan.md` 中所有"Markdown 是主数据"或"Markdown-first"的表述

> ⚠️ 已被 ADR 0002 取代：本 ADR 仍保留“每次 save 同步写 Markdown mirror”的设计。
> ADR 0002 决定 **不再自动写 Markdown mirror**，Markdown 仅作为用户主动触发的导出格式。
> JSON 作为 SoT 的核心结论不变；下文中关于“每次 save 同步写出 `.md`”“四态冲突判定”
> 的部分以 ADR 0002 与 `docs/markdown-storage-remediation-plan.md` 为准。

## 上下文

笔记编辑器从 Tiptap 迁到 BlockNote 之后（参见 `docs/features/Review/blocknote-ai-migration-plan.md`），实际架构已经是：

- 编辑无损源：`content/.ghostboard/blocknote/<noteId>.json`（BlockNote document 序列化）
- 用户可读 mirror：`content/<note>.md`（lossy 投影）
- 同步：每次 save 都重写两边，frontmatter 中存 `blocknoteHash` + `markdownHash`，加载时做四态冲突判定

但代码里仍残留几处把 Markdown 当 SoT 的设计：

1. `cardDataToNote()` / `NoteFrontmatter` 把节点元数据（`tag` / `tagColor` / `tags[]`）写进 frontmatter
2. `writeNoteWithPreview()` 从 Markdown body 派生 `previewHtml` / `previewExcerpt`，对 BlockNote 高级块降级
3. `detectExternalMarkdownChange()` + conflict copy 维护了一套复杂的双向 reconcile

这些设计随着 BlockNote 的引入产生了不必要的复杂度，并在向"全节点 tag"扩展时产生了直接阻塞（非 card 节点没有 `.md`，frontmatter 不存在）。

## 决策

确立单一立场：**BlockNote JSON 是编辑无损 SoT；Markdown 是 export，不是输入**。

具体含义：

| 数据 | 写入位置 | 读取来源 |
|---|---|---|
| 编辑内容（blocks） | `content/.ghostboard/blocknote/<noteId>.json` | sidecar JSON |
| 用户可见 markdown | `content/<note>.md`（每次 save 同步写出） | 永远不读回（除非 sidecar 损坏 + 用户显式触发恢复） |
| 节点元数据（tag/tagColor/tags） | `.ghostboard/node-metadata.json` | 同左 |
| 卡片 preview | sidecar JSON 派生 | 不再走 markdown |

## 后果

### 正面

- 解锁所有节点类型的 tag（sticky / image / link / asset 没有 `.md`，但都有 nodeId）
- preview 渲染回归无损
- 删除 `markdownHash` / `detectExternalMarkdownChange` / 冲突副本逻辑，persistence 层显著瘦身
- 写盘顺序解耦：JSON 写完就算 save 成功，Markdown 失败不影响数据完整性

### 负面

- 用户对 `.md` 文件做编辑后，不会被应用回读（提供菜单项"从 Markdown 重新导入"作为逃生口）
- Markdown mirror 含 lossy 转换，用户对它的预期需要在 UI/文档明示
- 已上线前的开发数据需要清理（pre-launch，用户可接受）

### 中性

- 用户能用 Finder / Obsidian / VS Code 浏览 `.md` 的体验保留
- 备份 / git diff 视角的可读性保留

## 不在本 ADR 范围

- AI / provider 配置（见 `blocknote-ai-migration-plan.md` Phase 3/4，保留计划）
- BlockNote 自定义块（继续用内置块）
- Yjs / 协作

## 实施 phases

详见：

- `docs/features/Planned/node-metadata-sidecar.md`（Phase 1 — tag/node 元数据 sidecar，正在实施）
- `docs/features/Planned/preview-from-blocknote-json.md`（Phase 2 — preview 改从 JSON 派生）
- `docs/features/Planned/markdown-write-only.md`（Phase 3 — 删除冲突检测，markdown 变只写）

## 参考

- `docs/features/Review/blocknote-ai-migration-plan.md`
- `docs/features/Planned/tag-feature-improvement.md`
- `src/bun/notes.ts`
- `src/bun/blocknote.ts`
- `src/bun/preview.ts`
