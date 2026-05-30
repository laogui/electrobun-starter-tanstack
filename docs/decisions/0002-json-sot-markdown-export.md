# ADR 0002 — JSON 是 source of truth，Markdown 是按需导出格式

- 状态：Accepted
- 日期：2026-05-29
- 取代：`docs/decisions/0001-json-sot-markdown-mirror.md` 中 “每次保存同步写 Markdown mirror” 的策略
- 相关方案：`docs/markdown-storage-remediation-plan.md`、`docs/markdown-storage-remediation-plan.v0.2-addendum.md`

> 实施补充（来自 v0.2 增订 A7）：note 自身属性（`title`、`color`、`createdAt`、
> `updatedAt`、`editor`、`blocknoteFile`、`preview`）落在 note sidecar JSON；
> `tag`/`tagColor`/`tags` 落在 `node-metadata.json`；`position`/尺寸/`parentId`
> 落在 canvas manifest。编辑模型按 A2 声明为单窗口编辑，`revision` 作为写入保护。

## 上下文

ADR 0001 已经确认 BlockNote JSON 是编辑内容的 source of truth，Markdown 不是输入源。但 ADR 0001 仍保留了“每次 save 同步写出 Markdown mirror”的设计。

进一步分析后，连续生成 Markdown mirror 仍然带来不必要复杂度：

- 保存路径仍要执行 `blocksToMarkdownLossy`，保存成功和导出失败的边界不清晰。
- 工作区里仍会长期存在 `.md` 文件，用户容易误以为它们是可编辑同步文件。
- Markdown mirror 会制造“外部编辑是否应该回读”的产品预期。
- 卡片预览、搜索和恢复都可以直接基于 JSON/preview index，不需要 Markdown 常驻文件。

## 决策

**GhostBoard 内部不再自动同步生成 Markdown mirror。Markdown 只作为用户主动触发的导出格式。**

具体含义：

| 数据/能力 | 决策 |
|---|---|
| 编辑内容 | BlockNote JSON 是唯一 source of truth |
| 保存 | 只保存 JSON、preview 缓存、画布引用和元数据 |
| Markdown | 不在每次保存时生成，不作为常驻 mirror |
| 单篇导出 | 用户点击“导出为 Markdown…”时生成 `.md` |
| 批量导出 | 用户选择范围后生成导出目录和 `index.md` |
| 外部 Markdown 修改 | 不自动回读；如需要，通过显式 import |
| legacy `.md` | 仅用于一次性迁移或显式导入 |

## 后果

### 正面

- 保存链路更短：编辑保存不再承担 lossy Markdown 转换。
- 用户心智更清晰：JSON 是应用数据，Markdown 是导出结果。
- 避免外部 `.md` 修改造成同步预期和冲突处理。
- 批量导出可以做成完整产物，包括 `index.md`、附件目录、失败报告。

### 负面

- 工作区不再天然有一份随时可读的 `.md` 快照。
- 依赖 Git diff 阅读 Markdown 的用户需要主动执行导出。
- 需要新增单篇导出和批量导出功能，作为可迁移性的产品承诺。

### 中性

- 本地优先仍成立：JSON、画布、附件都在本地工作区。
- 数据可迁移仍成立：通过显式 Markdown/JSON export 实现。

## 实施要求

1. `saveBlockNote` 不再生成 `.md`。
2. `saveManifest` 不写 note body。
3. `loadBlockNote` 不读取 Markdown 做自动 reconcile。
4. 新增单篇 Markdown export RPC/UI。
5. 新增批量 Markdown export RPC/UI。
6. legacy `.md` import 必须显式触发，并有二次确认。

## 验收标准

- 编辑并保存 note 后，工作区不会新增或更新 `.md` 文件。
- 单篇导出能从 BlockNote JSON 生成 Markdown 文件。
- 批量导出能导出当前画布、选中卡片或全部笔记，并生成 `index.md`。
- 外部 Markdown 不会自动影响应用内内容。
- 测试覆盖保存、加载、单篇导出、批量导出、legacy import。
