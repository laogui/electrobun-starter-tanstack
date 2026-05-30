# Markdown 存储整改 — 后续待办（follow-ups）

- 状态：Planned
- 日期：2026-05-30
- 来源：`docs/markdown-storage-remediation-plan.md`（已实施并归档/删除）的残留项
- 决策依据：`docs/decisions/0002-json-sot-markdown-export.md`

> 主方案 Phase 0–5 的 P0/P1 核心已落地：JSON sidecar 成为 note 唯一 SoT，保存不再写
> `.md`，预览从 blocks 派生，单篇 + 当前画布 Markdown 导出可用。本文件只记录**尚未完成**
> 的 P2 / 增订 / 可选项，便于后续单独推进。

## 一、已完成（参考，无需再做）

- `saveManifest` 不再重写 BlockNote 正文（sidecar 卡片只 merge title/color）。
- 预览从 BlockNote blocks 派生（`src/bun/blocknotePreview.ts`）。
- sidecar JSON 成为 note 记录（title/color/createdAt/preview），`saveBlockNote` 不写 `.md`，
  `loadBlockNote` 只读 sidecar；`buildNoteIndex`/`loadCanvas`/`search`/`cleanup` 走
  `src/bun/noteStore.ts`。
- Markdown 导出 serializer（`src/bun/blocknoteMarkdown.ts`）+ `markdownExport.ts`
  （frontmatter / 附件收集 / `index.md`）。
- 导出 RPC：`exportNoteMarkdown`、`exportNotesMarkdown`（scope = `all` / `view` / `selected`）。
- 已接入 UI：卡片右键「导出为 Markdown…」、画布右键「导出画布为 Markdown…」。

## 二、待办

### 1. 批量导出剩余入口（§10.6，P2）

RPC `exportNotesMarkdown` 已支持 `scope: 'all' | 'selected'`，只缺 UI：

- [ ] 设置页：「导出所有笔记为 Markdown…」→ `rpcExportNotesMarkdown('all')`。
  - 注意：设置窗口是独立 `BrowserView`，导出 RPC 目前挂在主窗口 canvas RPC 上，
    需在 settings RPC 通道暴露，或由设置页向主窗口发消息触发。
- [ ] 笔记库 / 画布多选：「批量导出选中」→ `rpcExportNotesMarkdown('selected', { noteIds })`。

### 2. 显式「从 Markdown 重新导入」（§10.7，P1 收尾）

目前只有 legacy `.md`（无 sidecar）在首次打开时的**自动**一次性导入。缺显式入口：

- [ ] 新增 `recoverFromMarkdown(noteId)` / `importMarkdown` RPC：解析外部 `.md` → blocks →
      写 sidecar → invalidate。
- [ ] focused view 工具栏 / 卡片右键：「从 Markdown 重新导入」。
- [ ] 二次确认对话框：明确「会覆盖当前编辑器内容、可能丢失高级块结构」。

### 3. Phase 0 文案（P2）

- [ ] 设置页 / onboarding 文案：说明「Markdown 是按需导出格式，不会在每次保存时自动生成；
      外部 Markdown 需显式导入」。（主方案 Phase 0 第三条当时挂起未做。）

### 4. v0.2 增订项（可选 / 未来）

- [ ] **A1**：预览 HTML 中附件真正渲染（注册 `gb-asset://` 自定义 scheme，或
      `data-attachment-path` 懒解析）。当前用稳定占位 badge，未渲染真实图片。
- [ ] **A2**：sidecar `revision` 乐观锁——`saveBlockNote` 接 `expectedRevision`，
      mismatch 时拒写并提示，而非静默覆盖。（当前声明为「单窗口编辑」模型，未实现锁。）
- [ ] **A3**：`rebuildAllPreviews` 后台批量重算 preview（schema/preview version 升级用）。
- [ ] **A4**：sidecar schema 迁移——load 时识别旧 schema、in-place lazy 迁移、major bump
      时备份原文件到 `.ghostboard/backup/<timestamp>/`。（当前 loader 容忍缺字段，但无显式
      迁移/备份。）

## 三、已知遗留问题（非本方案引入）

- `StickyNode` / `ImageNode` / `LinkNode` / `AssetNode` 的测试因 `useNodeTagEditing` 使用
  `useQueryClient()` 但测试未包 `QueryClientProvider` 而失败（跨节点标签特性遗留的夹具缺口，
  11 个用例）。修法：测试 render 包一层 `QueryClientProvider`，或 mock `@/lib/rpc` /
  `useNodeTagEditing`。
- `src/bun/attachments.test.ts` 在测试环境报 `Bun.serve is not a function`（electrobun 导入
  的环境问题，主方案与增订均已注明）。
