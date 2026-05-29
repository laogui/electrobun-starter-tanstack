# Markdown 存储整改总方案

- 状态：Draft
- 日期：2026-05-29
- 关联决策：`docs/decisions/0002-json-sot-markdown-export.md`
- 关联计划：
  - `docs/features/Planned/preview-from-blocknote-json.md`
  - `docs/features/Planned/markdown-write-only.md`（需废弃或改写为 markdown-export-only）
  - `docs/features/Planned/node-metadata-sidecar.md`

## 1. 背景

GhostBoard 早期选择 Markdown 作为本地笔记文件格式，初衷是：

- 降低用户心理负担，内容以 `.md` 文件可见、可备份、可迁移。
- 避免用户担心数据被锁进私有数据库。
- 便于用 Finder、VS Code、Obsidian 等外部工具查看。

但编辑器迁移到 BlockNote 后，实际能力边界发生了变化：

- BlockNote 的真实编辑模型是结构化 blocks JSON。
- Markdown 只能表达其中一部分内容，当前序列化使用 `blocksToMarkdownLossy`，天然有损。
- 画布卡片不是传统文档列表，卡片可拖动、缩放、嵌套到 folder，预览需要的是结构化摘要而不是完整 Markdown 渲染。
- 当前代码已经形成 `.md` + BlockNote sidecar JSON 的双存储，需要 hash、revision、冲突检测、恢复路径来协调，复杂度持续上升。

因此需要明确：Markdown 是否仍然作为主存储、同步 mirror，还是只保留为按需导出能力。

## 2. 结论

**放弃 Markdown 主存储，也放弃自动同步生成 Markdown mirror。BlockNote JSON 作为笔记内容的 source of truth，Markdown 只作为用户主动触发的导出格式。**

这不是放弃本地优先，也不是放弃用户数据可控，而是把“用户可读、可导出”和“应用内部无损编辑模型”分开：

| 诉求 | 方案 |
|---|---|
| 应用内无损编辑 | BlockNote JSON |
| 卡片预览 | 从 BlockNote JSON 派生 preview model |
| 本地可见 / 可备份 | 工作区文件夹 + JSON pretty print + 应用内导出 |
| 外部查看 | 用户主动导出的 `.md` 文件 |
| 外部编辑 | 不作为核心工作流；如需要，做显式 Markdown import |
| 导出 / 迁移 | 单篇 Markdown 导出、批量 Markdown 导出、JSON export |

## 3. 当前问题诊断

### 3.1 双主源带来持续复杂度

当前链路大致是：

```text
FocusedView / BlockNoteEditor
  -> saveBlockNote RPC
    -> 写 content/.ghostboard/blocknote/<noteId>.json
    -> blocksToMarkdownLossy 生成 markdown
    -> 写 content/<note>.md
    -> 在 frontmatter 写 blocknoteHash / markdownHash / revision

loadBlockNote RPC
  -> 读取 .md
  -> 读取 sidecar JSON
  -> 对比 markdownHash / blocknoteRevision
  -> use-sidecar / reimport-markdown / conflict / recover-from-markdown
```

这意味着应用同时维护两个可变内容源。每次字段、预览、导入、保存逻辑变化，都会牵涉 reconcile。

### 3.2 Markdown 限制 BlockNote 能力

Markdown 不适合作为 BlockNote 的主模型：

- 嵌套 blocks、富文本 marks、自定义块、附件块、未来 callout/table/embed 都可能有损。
- Markdown body 很难表达画布特有状态，例如卡片尺寸适配预览、folder child 引用、节点级 metadata。
- 如果继续要求 Markdown 可被无损读回，BlockNote 的产品能力会被 Markdown 语义约束。

### 3.3 卡片预览不应该依赖 Markdown HTML

卡片预览有自己的约束：

- 卡片尺寸可变，需要按空间裁剪和摘要。
- 预览只读，不等同完整文档渲染。
- 预览需要快速、安全、稳定，不应该挂一个完整 BlockNote editor 实例。

因此预览更适合从 blocks JSON 派生一个受控的 preview model，例如：

```ts
interface NotePreviewModel {
  version: number;
  excerpt: string;
  blocks: Array<
    | { type: 'heading'; level: number; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'check'; checked: boolean; text: string }
    | { type: 'asset'; kind: 'image' | 'video' | 'audio' | 'file'; label: string }
    | { type: 'unknown'; blockType: string }
  >;
  html?: string;
}
```

### 3.4 `saveManifest` 与 BlockNote 保存边界冲突

现在 `saveManifest` 仍会对 card 节点执行：

```text
cardDataToNote(node.data) -> writeNoteWithPreview(...)
```

这条路径仍假设 card 的正文在 `node.data.content` 中，并把它写回 `.md`。但 BlockNote 路径下，真实正文已经在 sidecar JSON 中，`node.data.content` 只是 Markdown 投影。继续让 manifest 保存参与正文写入，会制造覆盖风险和元信息丢失风险。

## 4. 目标架构

### 4.1 数据分层

```text
workspace/
  .ghostboard/
    settings.json
    node-metadata.json
  content/
    .ghostboard/
      blocknote/
        note_abcd1234.json                 # note 内容 SoT
      previews/
        note_abcd1234.json                 # 可选：卡片预览缓存
  canvases/
    main.json                              # 画布结构，只存引用和布局
```

### 4.2 写入职责

| 写入方 | 负责内容 | 不应负责 |
|---|---|---|
| `saveBlockNote` | note blocks、title、preview | canvas layout、Markdown 导出 |
| `saveManifest` | 节点位置、尺寸、边、folder child 引用 | note 正文 |
| node metadata sidecar | tags、tagColor、跨节点元数据 | note body |
| export/import | 用户主动触发的格式转换 | 自动同步、自动回读 |

### 4.3 加载优先级

```text
打开 note
  1. 根据 noteId 找 BlockNote JSON
  2. 如果 JSON 存在且 schema 支持，直接加载 JSON
  3. 如果 JSON 缺失/损坏，提示用户选择：
     - 从旧 Markdown 重新导入
     - 创建空白 JSON 并保留旧文件
     - 定位损坏文件用于手动恢复
  4. 不再自动根据 Markdown hash 做双向 reconcile
```

## 5. 分阶段整改计划

### Phase 0：冻结决策与文案

目标：统一团队和代码注释中的立场。

- [ ] 新增 `docs/decisions/0002-json-sot-markdown-export.md`，取代 ADR 0001 中 “Markdown mirror” 的连续同步策略。
- [ ] 搜索 README、PRD、技术文档中 “Markdown-first”、“Markdown 是主数据”、“Markdown mirror 自动生成” 表述并替换。
- [ ] 在设置页或 onboarding 中明确说明：
  - GhostBoard 内部使用结构化 JSON 保证无损编辑。
  - Markdown 是按需导出格式，不会在每次保存时自动生成。
  - 外部 Markdown 需要通过显式导入进入应用，不会自动同步。

验收：文档和 UI 文案不再暗示 Markdown 是主源。

### Phase 1：切断 manifest 对 note body 的写入

目标：`saveManifest` 只保存画布，不保存 BlockNote 正文。

建议改法：

- [ ] 对 `editor: 'blocknote'` 或存在 `blocknoteFile` 的 card，`saveManifest` 只保留：
  - `noteId`
  - `file`
  - `type`
  - layout/style/detached/folder child 引用
- [ ] 不再对这些 card 调用 `cardDataToNote()` 写正文。
- [ ] legacy checklist / plain text card 暂时保留旧路径，作为迁移兼容。
- [ ] 新建 card 默认创建 BlockNote sidecar，而不是只创建空 `.md`。

验收：拖动/缩放/切换 view 导致的 manifest 保存不会重写 note 内容。

### Phase 2：预览从 BlockNote JSON 派生

目标：卡片预览不再依赖 Markdown body。

执行现有计划：`docs/features/Planned/preview-from-blocknote-json.md`。

关键任务：

- [ ] 新增 `blocknotePreview` serializer，从 blocks 生成 preview model / safe HTML。
- [ ] `saveBlockNote` 写 sidecar 后，用 blocks 生成 preview。
- [ ] `NotePreview` 继续可消费 HTML，但 HTML 来源改为 JSON serializer。
- [ ] 对 image/file/video/audio/unknown block 给稳定占位。

验收：BlockNote 高级块在卡片预览中不再被 Markdown lossy 投影误伤。

### Phase 3：停止自动生成 Markdown

目标：删除保存链路中的 Markdown mirror 写入，让保存只负责 JSON SoT 和预览缓存。

> `docs/features/Planned/markdown-write-only.md` 需要废弃或改写为 “markdown-export-only”。

关键任务：

- [ ] 删除或废弃 `detectExternalMarkdownChange()`。
- [ ] 停止写 `markdownHash`、`blocknoteHash` 中与 Markdown reconcile 相关的字段。
- [ ] `loadBlockNote` 默认只加载 sidecar JSON。
- [ ] `saveBlockNote` 不再调用 `blocksToMarkdownLossy` 生成 `.md`。
- [ ] `writeNoteWithPreview` 不再承担“写 note markdown 文件”的职责，改名或拆分为 `saveNotePreview`。
- [ ] `.md` 外部变动不自动导入，不创建 conflict 副本。
- [ ] legacy `.md` 只作为一次性迁移或显式 import 的输入。

验收：编辑和保存 BlockNote 文档时，工作区不会自动生成或更新 `.md` 文件。

### Phase 4：Markdown 导出功能

目标：把 Markdown 从“保存副作用”改成“用户明确选择的导出能力”。

#### 4.1 单篇导出

入口建议：

- Focused note 右上角更多菜单：`导出为 Markdown…`
- 卡片右键菜单：`导出为 Markdown…`
- 笔记库条目菜单：`导出为 Markdown…`

行为：

- 弹出系统保存对话框，默认文件名来自 note title。
- 从 BlockNote JSON 当前 blocks 生成 Markdown。
- 可选附带 YAML frontmatter：`id/title/createdAt/updatedAt/tags`。
- 附件处理第一版采用相对链接或复制到同级 `attachments/` 目录，二选一需在导出对话框明确。

#### 4.2 批量导出

入口建议：

- 设置页：`导出所有笔记为 Markdown…`
- 笔记库：多选后 `批量导出 Markdown…`
- 画布菜单：`导出当前画布笔记为 Markdown…`

范围选项：

| 范围 | 说明 |
|---|---|
| 当前文档 | 单篇 note |
| 当前画布 | 当前 view 中引用的所有 card note |
| 选中卡片 | 多选节点对应的 notes |
| 全部笔记 | workspace note index 中所有 notes |

输出结构建议：

```text
GhostBoard Markdown Export/
  index.md
  notes/
    note-title-a1b2c3d4.md
  attachments/
    ...
```

批量导出必须生成 `index.md`，包含标题、来源画布、导出时间、文档列表和可能的失败项。

验收：应用保存时不产生 Markdown；只有用户点击导出时才产生 `.md`。

### Phase 5：清理 legacy 代码与测试

目标：降低持久层复杂度。

- [ ] 清理 `markdownHash`、conflict backup、recover banner 等遗留路径。
- [ ] 收敛 `cardDataToNote()` 的用途，只给 legacy/import/export 使用。
- [ ] 给 JSON preview serializer 补完整测试。
- [ ] 给 `saveManifest` 加回归测试，确认不会覆盖 BlockNote 内容。
- [ ] 给 Markdown import 加显式确认和快照/备份测试。

验收：persistence 代码更少，保存路径职责清晰，测试能覆盖核心风险。

## 6. 迁移策略

### 6.1 现有数据

加载旧 note 时按以下规则：

| 状态 | 行为 |
|---|---|
| 有 sidecar JSON | 加载 JSON，不读取 Markdown |
| 无 sidecar，有旧 Markdown | 首次打开时提示一次性导入为 JSON，之后以 JSON 为准 |
| sidecar 损坏，有 Markdown | 提示用户从 Markdown 恢复或保留损坏文件 |
| sidecar 与旧 Markdown 不一致 | 不自动判冲突，以 JSON 为准，旧 Markdown 只可显式导入 |

### 6.2 版本字段

建议在 sidecar JSON 中保留：

```json
{
  "schema": "ghostboard-blocknote/v1",
  "noteId": "note_xxx",
  "revision": 12,
  "updatedAt": "2026-05-29T00:00:00.000Z",
  "blocks": [],
  "preview": {
    "version": 1,
    "excerpt": "...",
    "blocks": []
  }
}
```

导出的 Markdown frontmatter 只保留用户可读和迁移需要的信息：

```yaml
---
id: note_xxx
title: Example
source: ghostboard
exportedAt: 2026-05-29T00:00:00.000Z
updatedAt: 2026-05-29T00:00:00.000Z
---
```

内部 JSON 不再保留 `markdownHash`。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 用户找不到 `.md` 文件 | onboarding / 设置页说明 Markdown 通过导出生成 |
| Markdown 导出失败 | 不影响 JSON 保存，导出报告列出失败项 |
| JSON 损坏 | 提供显式 Markdown import、自动 sidecar backup、schema migration |
| 预览 serializer 漏块 | unknown block 占位 + schema 测试 fixtures |
| 迁移期间新旧路径混杂 | 通过 `editor: blocknote` / `blocknoteFile` 判断 legacy 数据，写测试覆盖 |
| Git diff 可读性下降 | JSON pretty print；需要可读快照时执行批量 Markdown 导出 |

## 8. 产品表述建议

不要对用户说“我们不用 Markdown 了”。更好的表达是：

> GhostBoard 使用本地文件夹保存你的数据。编辑内容以结构化 JSON 保存，保证画布、富文本和附件不丢失；当你需要迁移、备份或外部查看时，可以随时导出单篇或全部 Markdown。

对外部编辑的说明：

> Markdown 是导出格式，不是自动同步文件。若你需要把外部 Markdown 带回 GhostBoard，请使用显式导入流程，应用不会自动回读外部 `.md`，以避免覆盖结构化内容。

## 9. 推荐优先级

1. **P0：切断 `saveManifest` 对 BlockNote 正文的重写。** 这是当前最容易造成数据覆盖的边界问题。
2. **P1：预览从 BlockNote JSON 派生。** 解决卡片预览与编辑器不一致。
3. **P1：停止自动生成 Markdown。** 删除 hash/reconcile/conflict 和保存副作用。
4. **P1：单篇 Markdown 导出。** 先满足最小可用迁移和分享。
5. **P2：批量 Markdown 导出。** 支持当前画布、选中卡片、全部笔记。

## 10. 最终验收标准

- 新建和编辑 BlockNote note 时，JSON 是唯一加载源。
- 拖动画布、缩放卡片、切换 view、保存 manifest 不会改写 note body。
- 卡片预览从 JSON blocks 派生，不依赖 lossy Markdown。
- 保存时不会自动生成或更新 Markdown 文件。
- 用户可以单篇导出 Markdown。
- 用户可以批量导出当前画布、选中卡片或全部笔记的 Markdown。
- 用户可以显式从 Markdown 导入，且有二次确认。
- `bun run test` 覆盖：保存、加载、manifest、preview、Markdown export/import、legacy migration。
