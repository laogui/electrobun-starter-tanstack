# GhostBoard 产品细节落地路线图

> **历史文档**：本文件保留旧迭代记录，不再作为当前排期依据。当前开发顺序见 [PRD §7](./PRD.md#7-迭代路线图-roadmap)，任务与验收见 [当前开发计划](./development-plan.md)。下文估时和“从 Phase 0 起推进”仅适用于当时计划，勿重复实施已完成任务。

> **来源**：基于 [`docs/product-detail-audit.md`](./product-detail-audit.md) 的实现状态核查（核查日期 2026-06-02，覆盖审计原文 50 项）。
> **范围**：把未实现 / 部分实现项拆成可独立交付的 Phase，每个 Phase = 1 个 PR / 1 张迭代卡。
> **使用方式**：从 Phase 0 起按顺序推进，每个 Phase 都列出了任务、文件、验收标准与风险。不要把整份当成"必须全做"清单，每个 Phase 都标了**强烈推荐 / 推荐 / 可推迟**。

---

## 0. 当前完成情况速览

| 状态 | 数量 | 代表项 |
|---|---|---|
| 已实现 | 6 | A2 LinkNode OG/favicon、A4 删 mock pie chart、B2 BlockNote slash/bubble menu、C2 翻页导航、F3 软删除 Undo toast、K3 LibraryHeader 去 emoji |
| 部分实现 | 15 | A3 / A6 / B1 / B4 / B5 / B7 / C1 / D4 / E5 / F2 / G1 / G2 / I3 / J1 / J2 / J5 / K4 |
| 未实现 | 29 | A1 / A5 / A7 / B6 / C3-C5 / D1-D3 / D5 / E1-E4 / F1 / F4 / G3-G5 / H1-H4 / I1 / I2 / J3 / J4 / J6 / J7 / J8 / K1 / K2 / K5 / L1-L4 |

> ⚠️ 核查 1 周后又合入了 `2d4b8f2 feat: add link option to context menus` / `8fe017a feat: add link and file creation to canvas context menu`，G 组（ContextMenu）部分项可能已经更近一步，**开 Phase 6 前请重新跑一遍 G1-G5 状态确认**。

---

## 1. 路线总览

| Phase | 名称 | 目标 | 预估 | 优先级 | 依赖 |
|---|---|---|---|---|---|
| **0** ✅ | 死代码 + i18n 清扫 | 修 P0 漏洞、删迁移残留 | 0.5 天 | 强烈推荐 | - |
| **1** ✅ | 卡片视觉升级（前端） | 让 Folder/Sticky/Image 看起来"有内容" | 2-3 天 | 强烈推荐 | - |
| **2** ✅ | 卡片视觉升级（bun 侧） | text excerpt + archive summary + image-as-file 缩图（PDF/sharp 砍掉） | 3-5 天 | 强烈推荐 | Phase 1 |
| **3** ✅ | Library 体验 | 让 Library 用上 Phase 1+2 产出的元数据 | 2 天 | 推荐 | Phase 1, 2 |
| **4** ✅ | Search 升级 | 高亮 + 分组 + 空态 + 筛选 | 2-3 天 | 强烈推荐 | - |
| **5** ✅ | 编辑器收尾 | 保存指示器 + 删 EditableCardContent + 标题 input | 2 天 | 强烈推荐 | - |
| **6** ✅ | 右键 / 多选 / 拖入 | ContextMenu 完整化 + 全局 drop zone | 3-5 天 | 推荐 | - |
| **7** ✅ | FocusedView 完善 | 元信息 + 关闭按钮 + 图片缩放 | 2 天 | 推荐 | - |
| **8** ✅ | Settings 重构 | sidebar + 工作区 / 快捷键 / 关于 | 3-5 天 | 推荐 | - |
| **9** ✅ | 性能 pass | useViewport context + unfurl 视口限流 | 1-2 天 | 推荐 | - |
| **10** 🟡 | 视觉 / a11y 收尾 | shadow 统一 + dark + focus ring + onboarding | 2-3 天 | 推荐 | - |

合计：~24-33 个工作日 / 5-7 周（单人全职）。

---

## Phase 0 · 死代码 + i18n 清扫（0.5 天）✅ 已完成

> **已完成（2026-06-03）**。可以今天 merge 的小修复，是后续所有 PR 的"清场"。

### 任务

| 状态 | ID | 改动 | 文件 |
|---|---|---|---|
| ✅ 已完成 | K2 | `label: 'Link'` → `label: m.menu_link()` | `src/mainview/components/canvas/ViewSwitcher.tsx:65` + `messages/*.json` |
| ✅ 已完成 | K4 | "No matches" / `placeholder` 走 paraglide | `src/mainview/components/search/SearchDialog.tsx:220, 245` + `messages/*.json` |
| ✅ 已完成 | K5 | 两条 `toast.error('File ...')` 走 paraglide | `src/mainview/components/canvas/nodes/AssetNode.tsx:406, 411` + `messages/*.json` |
| ✅ 已完成 | K1 | 给 truncate 文件名加 `title={...}` | `AssetNode.tsx:490`、`LinkNode.tsx:144` |
| ✅ 已完成 | L3 | `createImageThumbnail` 失败 → `toast.error(...)` | `src/mainview/components/canvas/nodes/ImageNode.tsx:290` |

### 验收
- `bun run check && bun run test` 全绿。
- 切到 zh / en 两遍肉眼检查上述位置。
- 故意删 attachment 跑一次确认 toast 出现。

---

## Phase 1 · 卡片视觉升级 · 前端（2-3 天）✅ 已完成

> 只动 React 组件，所有数据已经在 nodeData 里。**Phase 1 不依赖 bun 侧改造**。

### 任务

| ID | 改动 | 文件 |
|---|---|---|
| A3 | FolderNode 加子卡片缩略堆叠（最多 3 张）+ 自定义 `color` 支持 + dark 适配 | `src/mainview/components/canvas/nodes/FolderNode.tsx` |
| ↩ A5 | StickyNode 低缩放摘要曾显示 `content.slice(0, 16)`；固定阈值语义缩放已于 2026-07-11 移除 | `StickyNode.tsx` |
| A6 | ImageNode 缩略图丢失时显示红色 "Missing image" 徽章（参考 AssetNode 实现） | `ImageNode.tsx:150-174` |
| A7 | 抽 `ResizeHandle.tsx` 共享组件 → 5 处节点改用 | 新建 `src/mainview/components/canvas/nodes/_shared/ResizeHandle.tsx` |
| J1 | StickyNode + FolderNode 改用 `shadow-card / shadow-card-hover` | StickyNode + FolderNode |
| J2 | FolderNode 紫色封面加 `dark:bg-[linear-gradient(...)]` 暗色变体 | FolderNode |
| B7 / J5 | 删除 `EditableCardContent`，把 FocusedView 的降级路径直接接到 BlockNote / readonly 渲染 | `CardNode.tsx:297-384`、`FocusedView.tsx:241-244, 435-441` |

### 验收
- 视觉对比 before/after 截图 4 张（folder / sticky 缩略 / missing image / dark mode folder）。
- `git grep EditableCardContent` 无结果。
- 一张 folder 内 5 张卡片 → 缩略堆叠正确显示前 3 张缩略图 / 占位。

### 决策点
- **B7 EditableCardContent 删法**：FocusedView 在 readOnly 路径上的降级，是走 BlockNote readonly 还是直接渲染 markdown？建议走 BlockNote readonly，因为 BlockNote 已经稳定，少一个分支更易维护。

---

## Phase 2 · 卡片视觉升级 · bun 侧（3-5 天）✅ 已完成

> 已完成（2026-06-04）。落地范围对原设计做了取舍——见下方"实际落地"小节。

### 实际落地

最初计划的 4 个生成器中，PDF 和 sharp 图片两条原生依赖路径被砍掉了（避免 `pdfjs-dist` 的 canvas polyfill 复杂度和 `sharp` 的原生构建坑）。最终方案：

| 计划项 | 状态 | 实际方案 |
|---|---|---|
| `generatePdfThumbnail` | ❌ 砍掉 | AssetNode 渲染 styled "PDF" 占位（红色徽章 + filename），不生成真实缩图。后续如真需要可走 macOS `qlmanage` |
| `generateImageThumbnail`（bun 侧） | ❌ 砍掉 | image-as-file 改在 renderer `saveAssetFile` 里调用现有 `createImageThumbnail`（dom canvas），保持 0 新依赖 |
| `generateTextExcerpt` | ✅ 完成 | `src/bun/thumbnail.ts`，读前 4KB → 二进制嗅探 → 规范化 + 截断到 500 字符（按词边界） |
| `generateArchiveSummary` | ✅ 完成 | 同文件，手动解析 ZIP central directory（无 `unzipper` 依赖），跳过 `__MACOSX` / `.DS_Store` / 目录条目 |

`previewExcerpt` 与 `archiveSummary` 直接持久化在 manifest 的 `AssetNodeData` 里（决策依据：与现有 link unfurl 字段一致；500 字节级别 × 几百卡片对 manifest 体积可忽略）。运行时 `thumbnailUrl` / `previewUrl` / `missing` 仍走 `serializeNodeDataForManifest` 剥离。

### 改动文件
- 新增：`src/bun/thumbnail.ts`、`src/bun/thumbnail.test.ts`（17 测试，含 ZIP 二进制构造 helper）
- 类型：`src/mainview/lib/contentTypes.ts` 加 `previewExcerpt` / `archiveSummary` / `ArchiveSummary`
- bun RPC：`src/bun/index.ts` 在 `saveAttachment` / `saveAttachmentFile` 末尾调 `generateFileMetadata`，response shape 同步扩展
- 渲染：`src/mainview/lib/rpc.ts` 暴露 `SaveAttachmentResult`；`src/mainview/lib/assetFiles.ts` 把 metadata 写入 nodeData，新增 `saveImageAssetThumbnail` 处理 image-as-file
- UI：`src/mainview/components/canvas/nodes/AssetNode.tsx` 加 `PdfThumbnail` / `TextThumbnail` / `ArchiveThumbnail` / `ImageAsFileThumbnail` 四个组件 + `AssetThumbnail` dispatcher
- 测试：`AssetNode.test.tsx` 补 6 个新分支测试（PDF 占位、text excerpt、archive summary、image-as-file 缩略图、missing 状态隐藏缩略图）
- 文档：`docs/tech-spec.md` 第 74 行 `thumbnail.ts` 描述同步修正

### 后续遗留（非阻塞）
- 真正的 PDF 第一页缩图（如果用户呼声大，可接 macOS `qlmanage -t`）。
- 真正的 image-as-file bun 侧缩图（目前依赖 renderer 拿到 dataUrl 才能生成；大文件路径 `saveAssetFromPath` 不会生成缩图——这是已知 trade-off）。
- ZIP64（>4GB 或 entry > 65535）档案的 entry 列表暂时返回 undefined，UI 自动 fallback 到通用 archive 卡。

### 验收（已通过）
- ✅ `bun run test src/bun/thumbnail.test.ts` 17/17 通过
- ✅ `bun run test src/mainview/components/canvas/nodes/AssetNode.test.tsx` 19/19 通过（含 6 个新分支测试）
- ✅ TS / lint 错误数与改动前 baseline 一致（30 lint errors / 同样 9 个 fail file，全部预先存在）
- ✅ 故意构造 binary 文件、空文件、损坏 ZIP → helper 全部静默返回 undefined，主流程无影响

### 决策点
- **PDF 缩略图实现选型**：pdfjs-dist / pdftocairo / 其他？需先 spike 验证。
- **缩略图缓存策略**：是否做 LRU 大小上限？workspace 越用越大时清理逻辑放哪？

---

## Phase 3 · Library 体验（2 天）✅ 已完成

> 已完成（2026-06-05）。全部依赖 Phase 2 输出的 `thumbnailUrl` / `previewExcerpt` 字段。

### 任务

| 状态 | ID | 改动 | 文件 |
|---|---|---|---|
| ✅ 已完成 | D1 | LibraryCard 顶部加 16:9 thumbnail 区（image / asset → `thumbnailUrl`/`previewUrl`；link → `imageUrl`，回退 `faviconUrl`；text → 3 行 excerpt） | `src/mainview/components/library/LibraryCard.tsx` |
| ✅ 已完成 | D2 | LibraryPopup 加 ↑↓ / Enter / ⌘F 键盘交互；维护 `focusedIndex` state（焦点环 + scrollIntoView，鼠标 focus 回灌同步） | `src/mainview/components/library/LibraryPopup.tsx` |
| ✅ 已完成 | D3 | 排序选择器换成项目里的 base-ui `Select.tsx` | `LibraryPopup.tsx` LibraryHeader |
| ✅ 已完成 | D4 | 空搜索（有 query 但无匹配）时加"清空搜索"按钮 + "最近访问"推荐网格 | `LibraryPopup.tsx` LibraryBody |
| ✅ 已完成 | D5 | `LibraryHeader` 标题下显示 `totalItems`（"127 items"） | `LibraryPopup.tsx` LibraryHeader |

### 实际落地

- **D1**：抽 `resolveThumb()` 把节点数据映射成 `image | favicon | excerpt | none` 四态。image/asset 优先 `thumbnailUrl`（运行时 hydrate），asset 文本回退 `previewExcerpt`；link 优先 OG `imageUrl`，回退居中 favicon；text 卡走 `previewExcerpt`/`content` 3 行截断。无可渲染内容时退回原 icon 布局（`min-h-[108px]`）。
- **D2**：`focusedIndex` + `flatItems`（跨 group 拍平）+ `indexById` map。键盘处理挂在最外层 `role="dialog"` 容器（事件冒泡），↑↓ 线性移动、Enter 打开、⌘F/Ctrl+F 聚焦搜索框。`LibraryCard` 收到 `isFocused` 时 `focus({preventScroll}) + scrollIntoView('nearest')`，并通过 `onFocus` 回灌 index 保持鼠标/Tab 同步。query 变化时在 `handleQueryChange` 里重置选择（避开 biome exhaustive-deps）。
- **D3**：复用 `@/components/ui/Select`（base-ui），label 仍走 paraglide 函数。
- **D4**：第二个 `useLibraryData({ sort: 'recent' })`（忽略 query）拍平 + 按 `updatedAt` 取前 6 条做推荐；推荐卡仅鼠标可点（不参与键盘 nav，属边缘态取舍）。
- **D5**：新增 i18n `library_item_count` / `library_clear_search` / `library_recent_heading`（en + zh），重新 `paraglide-js compile`。

### 验收（已通过）
- ✅ `bun run test` 全绿（90 files / 849 tests），含 `LibraryPopup.test.tsx` 新增 5 个分支测试（D5 计数、D1 缩略图+excerpt、D2 方向键+Enter、D2 ⌘F、D4 清空+推荐）。
- ✅ `ultracite check` 对改动文件 0 error；`tsgo --noEmit` 对 library 目录 0 error（仅 `node_modules/electrobun` 预存报错）。
- ✅ D2 的 ⌘F 仅在弹窗 keydown 内 `preventDefault`，不影响系统级。

---

## Phase 4 · Search 升级（2-3 天）✅ 已完成

> 已完成（2026-06-05）。E1/E2/E3 本次落地，E4/E5 此前已实现。
> ⚠️ E3 的快捷键提示只展示 app 真实存在的快捷键（↑↓ 切换 / ↵ 打开 / ⌘N 新建），
> roadmap 原稿里的 ⌘O / ⌘, 在当前 app 未实现，故未展示以免误导。

### 任务

| ID | 改动 | 文件 | 状态 |
|---|---|---|---|
| E1 | excerpt + 标题关键词 `<mark>` 高亮（90 行简易实现，无新依赖） | 新建 `searchResultRender.tsx`、`SearchDialog.tsx` ResultRow | ✅ |
| E2 | 结果按 `viewName` 分组，group header 可折叠（键盘导航跳过折叠行） | `SearchDialog.tsx` | ✅ |
| E3 | 空 query → 最近搜索 + 最近 5 张卡片 + 跳转画布 + 快捷键提示 | 新建 `SearchEmptyState.tsx` | ✅ |
| E4 | 顶部 chip：全部 / 笔记 / 链接 / 文件 / 画布（filter `result.kind`） | `SearchDialog.tsx` 顶部 | ✅ 此前已实现 |
| E5 | 标题栏触发按钮 placeholder 后显示 ⌘K kbd | `__root.tsx` trigger | ✅ 此前已实现 |

### 验收
- 搜 `tan` 时所有结果有黄色高亮；切 chip 时计数变化；ESC + ⌘K 反复开关无卡顿。
- 5000 条结果时高亮不卡（performance budget < 100ms）。

---

## Phase 5 · 编辑器收尾（2 天）✅ 已完成

> 已完成（2026-06-06）。Phase 1 已删了 EditableCardContent，这里只剩状态指示器和标题 input。

### 任务

| 状态 | ID | 改动 | 文件 |
|---|---|---|---|
| ✅ 已完成 | B6 | `useBlockNoteSaver` 暴露 `{ status: 'idle' \| 'saving' \| 'saved' \| 'error', lastSavedAt }`；FocusedView 顶栏右上加 `<SaveIndicator />` 组件，含 spinner + "已保存于 hh:mm" + 失败 toast | `src/mainview/components/editor/useBlockNoteSaver.ts`、新建 `SaveIndicator.tsx`、`FocusedView.tsx` |
| ✅ 已完成 | B5 | 标题改成 `<TextareaAutosize maxLength={120} onKeyDown={Enter→focusEditor}>` | `BlockNoteEditor.tsx` |
| ✅ 已完成 | B4 | 编辑器 padding 响应式：`<700: px-4`, `<1024: px-8`, `≥1024: px-12 max-w-[min(72ch,80%)]` | `BlockNoteEditor.tsx` |

### 实际落地

| 计划项 | 状态 | 实际方案 |
|---|---|---|
| B6 保存指示器 | ✅ 完成 | `useBlockNoteSaver` 新增 `onSaveStatusChange` 回调暴露 `idle / saving / saved / error` 与 `lastSavedAt`；新建 `SaveIndicator.tsx`（spinner / "Saved at hh:mm" / 红色失败徽章 + aria-live），由 `FocusedView.tsx` 顶栏右上渲染；失败时通过 sonner `toast.error` 只弹一次，避免重试风暴 |
| B5 TextareaAutosize 标题 | ✅ 完成 | `react-textarea-autosize`（`maxLength=120`，最多 4 行）；Enter 把焦点推进 BlockNote 编辑器首个 contenteditable（保留 Shift+Enter 换行） |
| B4 响应式 padding | ✅ 完成 | 容器 `max-w-[min(72ch,80%)]` + `px-4 sm:px-8 lg:px-12`（≈ <640 / <1024 / ≥1024 三档，与 tailwind 默认断点对齐；27" 屏不再挤在 768px 内） |

### 改动文件
- 新增：`src/mainview/components/editor/SaveIndicator.tsx`
- 改：`src/mainview/components/editor/useBlockNoteSaver.ts`（新增 `BlockNoteSaveStatus` 导出、`onSaveStatusChange` 参数、`status` / `lastSavedAt` 返回值；`rpc` 失败或响应 `success=false` 转 `error`；`saved` 在 preview updates 应用后才触发）
- 改：`src/mainview/components/editor/BlockNoteEditor.tsx`（引入 `react-textarea-autosize`；`onSaveStatusChange` 透传到 `FocusedView`；标题换 `TextareaAutosize`；容器 max-w/padding 响应式；Enter 跨编辑器聚焦）
- 改：`src/mainview/components/canvas/FocusedView.tsx`（`isText` 笔记在右上渲染 `<SaveIndicator />`；error 状态触发 `toast.error(m.toast_save_failed())`，去抖避免连弹）
- i18n：`messages/en.json` + `messages/zh.json` 新增 `save_status_saving` / `save_status_saved_at` / `save_status_error` / `toast_save_failed`
- 依赖：`package.json` 新增 `react-textarea-autosize@8.5.9`

### 验收（已通过）
- ✅ `tsgo --noEmit -p tsconfig.json` 剩余 27 个错误全部位于 `node_modules/electrobun`（预存）；项目源码 0 错误
- ✅ `ultracite check` 对 4 个改动文件 0 error（formatter 已自动修复）
- ✅ `vitest run` 全绿：91 文件 / 858 测试通过（含 `FocusedView.test.tsx` 7 个用例）
- ✅ 保存状态机肉眼可观察到 `saving` → `saved` 过渡；故意断网时只弹一次 error toast
- ✅ 27" 屏宽下正文居中且行宽落在 72ch 上限内
- ✅ 超长标题（>120 字符）被 maxLength 限制；自动换行到 4 行时 textarea 自动增高

### 不做
- **B1 toolbar 自定义按钮**：BlockNote slash menu 已经覆盖，强行自定义工具栏会和后续 BlockNote 升级冲突，跳过。

---

## Phase 6 · 右键 / 多选 / 拖入（3-5 天）✅ 已完成

> **状态检查（2026-06-07）**：全部已实现。

### 任务完成情况

| ID | 改动 | 文件 | 状态 |
|---|---|---|---|
| G1 | Image 右键加：替换图片 / 复制图片地址 / 在 Finder 显示 | `ContextMenu.tsx:161-190`、`useContextMenu.ts:448-493` | ✅ 完成 |
| G2 | Link 右键加：打开链接（`Bun.openExternal`）/ 复制 URL / 重新抓取（暴露 `handleRetry`） | `ContextMenu.tsx:192-215`、`useContextMenu.ts:406-446` | ✅ 完成 |
| G3 | Asset 右键加：在 Finder 显示（bun 侧 `showItemInFolder`）/ 替换文件 / 重命名 | `ContextMenu.tsx:230-256`、`useContextMenu.ts:466-506`、`src/bun/attachments.ts:242-253` | ✅ 完成 |
| G5 | 多选时菜单分支：批量改色 / 批量加 tag / 批量移到 view / 删除 | `ContextMenu.tsx:217-228`、`useContextMenu.ts:276-315` | ✅ 完成（不含移到 view） |
| H2 | `<ReactFlow>` 上层挂一个 `useDropZone` hook → dragenter 触发全屏 backdrop + "Drop to add" 文案 | `routes/index.tsx:1003-1015` | ✅ 完成 |
| H1 | LinkCreateForm 挂载时 `navigator.clipboard.readText()` → 若是 URL 则预填 | `LinkCreateForm.tsx:15-38` | ✅ 完成 |
| H3 | CreateMenu 加"Import markdown..."项 → bun 侧 `showOpenDialog` → 创建 BlockNote 卡片 | `ViewSwitcher.tsx` | ✅ 完成 |

### 已实现内容

#### Bun RPC 基建（§1）
- ✅ `revealAttachment` - 在 Finder 显示（G1/G3 共用）
- ✅ `openExternalUrl` - 打开链接（G2）
- ✅ `importMarkdownFiles` - 导入 Markdown（H3）
- ✅ 所有 RPC wrappers 已添加到 `src/mainview/lib/rpc.ts`

#### Context Menu 功能（G1/G2/G3）
- ✅ Image 右键：替换图片、复制图片地址、在 Finder 显示
- ✅ Link 右键：打开链接、复制 URL、重新抓取
- ✅ Asset 右键：在 Finder 显示、替换文件、重命名
- ✅ 所有相关 i18n key 已添加到 `messages/en.json` 和 `messages/zh.json`

#### 多选功能（G5）
- ✅ 批量改色
- ✅ 批量加 tag
- ✅ 批量删除
- ℹ️ 批量移到 view 未实现（按方案决策，不在验收标准内）

#### 其他功能
- ✅ H1 LinkCreateForm 粘贴板预填 URL
- ✅ H2 全屏 Drop zone（`routes/index.tsx` 中的拖拽蒙层与文件拖入支持）
- ✅ H3 CreateMenu 导入 Markdown（`ViewSwitcher.tsx` 中已包含菜单项与 `handleImportMarkdown` 逻辑）

### 验收状态
- ✅ 6 张 link 卡片选中后右键 → 批量改色生效
- ✅ 拖 PDF 进窗口 → 全屏蒙层（已实现）
- ✅ Cmd+V 在 LinkCreateForm 自动填充

### 决策点
- **G3 "重命名"语义**：已实现为仅改卡片 displayName（`data.title`），不动 workspace 真实文件名
- **G5 "批量移到 view"**：按方案决策未实现（不在验收标准内）

---

## Phase 7 · FocusedView 完善（2 天）✅ 已完成

> 已完成（2026-06-06）。四个任务全部落地，无新 npm 依赖。

### 任务

| 状态 | ID | 改动 | 文件 |
|---|---|---|---|
| ✅ 已完成 | C1 | 右上加 X 按钮 + 兜底 ESC handler（document capture phase） | `FocusedView.tsx` |
| ✅ 已完成 | C3 | 顶栏左侧元信息条：createdAt · updatedAt · 字数 · 当前 view 名 | `FocusedView.tsx`、新建 `src/mainview/lib/formatRelative.ts` |
| ✅ 已完成 | C4 | 图片 focused 模式自写 wheel/drag handler（zoom 1-5x，双击重置） | 新建 `useImageZoomPan.ts`、`ImageZoomPan.tsx` |
| ✅ 已完成 | C5 | exit 前若节点不在视口 → `inst.setCenter(node.x, node.y, { duration: 0 })` | `FocusedView.tsx` |

### 实际落地

| 计划项 | 状态 | 实际方案 |
|---|---|---|
| C1 X 关闭按钮 | ✅ 完成 | 右上角 `motion.button`（X icon），与 SaveIndicator 共用 top-right flex 容器；ESC 用 capture-phase `document.addEventListener('keydown', handler, true)` 兜底，与 `useCanvasKeyboard` bubble-phase 互不冲突（幂等） |
| C3 元信息条 | ✅ 完成 | `top-20 left-8` pill bar（位于 back 按钮下方），`hidden min-[500px]:flex` 避免小屏拥挤；抽 `formatRelativeTime(string|number)` 共享工具（LibraryCard 同步改用）；WordCountBadge 从右下角移除，字数信息合并到元信息条 |
| C4 图片缩放 | ✅ 完成 | 自定义 `useImageZoomPan` hook（~120 行）：wheel 缩放向光标位置、pointer 拖拽平移、双击重置；`clampPan` 限制平移不超出图像边界；`ImageZoomPan` 包装组件带 1.5s 自动隐藏的缩放百分比指示器；无新依赖 |
| C5 退出居中 | ✅ 完成 | FocusedView 直接调 `useReactFlow()`（已确认在 ReactFlowProvider 内）；`handleClose` 统一所有关闭路径（backdrop / ArrowLeft / X / ESC）；folder child 回退到父 folder 节点定位 |

### 改动文件
- 新增：`src/mainview/lib/formatRelative.ts`（从 LibraryCard 抽取，扩展支持 string | number 输入）
- 新增：`src/mainview/hooks/useImageZoomPan.ts`（自定义缩放/平移 hook，导出 `clampPan` 和 `useImageZoomPan`）
- 新增：`src/mainview/hooks/useImageZoomPan.test.ts`（5 个 clampPan 边界测试）
- 新增：`src/mainview/components/canvas/ImageZoomPan.tsx`（包装组件 + 缩放百分比指示器）
- 改：`src/mainview/components/canvas/FocusedView.tsx`（C1: X 按钮 + ESC；C3: 元信息条 + 删 WordCountBadge；C4: 接入 ImageZoomPan；C5: useReactFlow + handleClose）
- 改：`src/mainview/components/canvas/FocusedView.test.tsx`（新增 `@xyflow/react` mock、views/activeViewId mock、5 个新测试：ESC 关闭、元信息条渲染、元信息条隐藏、退出居中、可见时不居中）
- 改：`src/mainview/components/library/LibraryCard.tsx`（改用共享 `formatRelativeTime`）
- i18n：`messages/en.json` + `messages/zh.json` 新增 `focused_close` / `focused_created_at` / `focused_updated_at`

### 验收（已通过）
- ✅ `bun run test` 全绿：92 文件 / 868 测试通过（含 5 个新 FocusedView 测试 + 5 个 useImageZoomPan 测试）
- ✅ `tsgo --noEmit -p tsconfig.json` 剩余 27 个错误全部位于 `node_modules/electrobun`（预存）；项目源码 0 错误
- ✅ `ultracite check` 对 6 个改动文件 0 error
- ✅ ESC 关闭、X 按钮关闭、元信息条亮/暗主题可读、图片缩放平移双击重置、退出时自动居中

---

## Phase 8 · Settings 重构（3-5 天）✅ 已完成

> 已完成（2026-06-06）。所有任务全部落地，无新 npm 依赖。

### 任务

| 状态 | ID | 改动 | 文件 |
|---|---|---|---|
| ✅ 已完成 | I2 | SettingsApp 改成 macOS 风格左侧 sidebar + 右侧 panel；分四组：General / Workspace / Shortcuts / About | `SettingsApp.tsx` 整体重构 |
| ✅ 已完成 | I1 | 各组新增： <br>· **General**: 字体 / 自动保存间隔 / 画布背景 / 主题 / 语言 <br>· **Workspace**: 当前路径 + 切换 + "在 Finder 打开" + 导出全部（zip） + 备份 <br>· **Shortcuts**: 只读 cheatsheet <br>· **About**: 版本号 / 更新日志链接 / 检查更新 | `GeneralPanel.tsx`、`WorkspacePanel.tsx`、`ShortcutsPanel.tsx`、`AboutPanel.tsx` + 多个 RPC |
| ✅ 已完成 | I3 | TrashSection 加：清空全部 + 按 deletedAt 排序 + `title={fullPath}` | `WorkspacePanel.tsx:247-450` |
| ✅ 已完成 | F2 | rename 校验：同名提示 + maxLength=80 | `ViewSwitcher.tsx:380-418` |
| ✅ 已完成 | F1 | ViewSwitcher 触发器加 `· N nodes` | `ViewSwitcher.tsx:425-429, 500-502` |

### 实际落地

| 计划项 | 状态 | 实际方案 |
|---|---|---|
| I2 sidebar + panel | ✅ 完成 | macOS 风格左侧固定宽度 sidebar（w-44），右侧内容区可滚动；四个 section 通过 activeSection state 切换；Sidebar 组件独立，带 hover/active 状态和 [-webkit-app-region] 处理 |
| I1 General | ✅ 完成 | GeneralPanel 支持主题（system/light/dark）、语言（en/zh）、字体（system/serif/mono）、画布背景（default/paper/mono）、自动保存间隔（500/800/2000/5000ms）；所有设置通过 SettingsClient 持久化 |
| I1 Workspace | ✅ 完成 | WorkspacePanel 包含三个子 section：WorkspacePathSection（路径显示/复制/在 Finder 打开/切换/导出）、TrashSection（清空全部/按 deletedAt 排序/恢复/永久删除）、ContentCleanupSection（未链接文件清理）；所有操作带错误处理和用户反馈 |
| I1 Shortcuts | ✅ 完成 | ShortcutsPanel 只读 cheatsheet，按 View/Edit/Nav 三组分类；自动检测 Mac/Windows 显示对应修饰键（⌘ vs Ctrl）；表格布局，带 kbd 样式 |
| I1 About | ✅ 完成 | AboutPanel 显示应用名称、版本号、channel、commit hash；检查更新按钮（dev channel 禁用）；更新状态 banner（checking/available/none/error）；GitHub releases 链接 |
| I3 TrashSection | ✅ 完成 | 清空全部带二次确认对话框；条目按 deletedAt 降序排列；每个条目显示完整路径（title 属性）和删除时间；支持恢复和永久删除 |
| F2 rename 校验 | ✅ 完成 | 空名称提示、长度限制（VIEW_NAME_MAX_LENGTH=80）、同名冲突检测（大小写不敏感）；校验失败时阻止确认并显示错误提示 |
| F1 节点计数 | ✅ 完成 | ViewSwitcher 触发器显示 `· N nodes`（单复数区分）；从 canvasStore 获取当前节点数；实时更新 |

### 改动文件
- 新增：`src/mainview/components/settings/panels/GeneralPanel.tsx`（General 设置面板）
- 新增：`src/mainview/components/settings/panels/WorkspacePanel.tsx`（Workspace 设置面板，含 Trash 和 Cleanup）
- 新增：`src/mainview/components/settings/panels/ShortcutsPanel.tsx`（快捷键 cheatsheet）
- 新增：`src/mainview/components/settings/panels/AboutPanel.tsx`（About 面板）
- 改：`src/mainview/components/settings/SettingsApp.tsx`（sidebar + panel 架构重构）
- 改：`src/mainview/components/canvas/ViewSwitcher.tsx`（F1/F2 rename 校验和节点计数）
- 改：`src/mainview/settingsClient.ts`（新增 WorkspaceInfo、TrashEntry、UnlinkedFileEntry、AppInfo、UpdateCheckResult 等类型和相关 RPC）
- 改：`src/bun/index.ts`（新增 getWorkspaceInfo、switchWorkspace、exportWorkspaceArchive、getTrashEntries、restoreTrashEntry、purgeTrashEntry、clearTrash、getUnlinkedFiles、deleteUnlinkedFile、getAppInfo、checkForUpdate RPC）
- i18n：`messages/en.json` + `messages/zh.json` 新增大量 Settings 相关翻译 key

### 验收（已通过）
- ✅ 所有 Settings 改动可来回切换并持久化
- ✅ workspace 切换后刷新加载新数据
- ✅ Trash 清空全部带二次确认
- ✅ rename 校验正确拦截空名称、过长名称、同名冲突
- ✅ ViewSwitcher 正确显示节点计数
- ✅ 四个 panel 功能完整且 UI 符合 macOS 风格

### 决策点
- **I1 范围**：已全部完成，包括字体/自动保存间隔/快捷键 cheatsheet（自定义热键未做，按原计划为 readonly）
- **更新检查**：已实现 RPC 和 UI，dev channel 显示提示信息，stable channel 可检查更新

---

## Phase 9 · 性能 pass（1-2 天）✅ 已完成

> **已完成（2026-06-09）**。L4 / L2 保持有效；L1 随固定阈值语义缩放于 2026-07-11 移除。

### 任务

| 状态 | ID | 改动 | 文件 |
|---|---|---|---|
| ↩ 已移除 | L1 | 删除固定 zoom 阈值、`ZoomLevelContext` 和各节点 placeholder 分支；节点不再订阅 zoom，也不发生跨阈值批量内容树切换 | routes/index.tsx + 各 canvas node |
| ✅ 已实现（前序 PR） | L4 | LinkNode unfurl 已用 `IntersectionObserver`，只在 ≥50% 可见时触发，命中即 `disconnect()`，卸载也 `disconnect()` | `LinkNode.tsx:320-346` |
| ✅ 已实现（前序 PR） | L2 | FocusedView 已是纯 `opacity` 的 `motion.div`，不再用 top/left/width/height layout 动画 | `FocusedView.tsx:356-363` |

### L1 后续决策（2026-07-11）
- 当前没有完成 placeholder 与完整渲染的 Profiler A/B 数据，无法证明固定阈值降级的收益。
- 统一 skeleton 在低缩放下削弱节点辨识度，并在跨阈值时集中卸载/挂载各节点内容树。
- 删除 `ZoomLevelContext`、`ZoomedOutPlaceholder` 和节点 zoom 订阅；文本摘要、媒体缩略图与 Link 视口限流等既有轻量策略保持不变。

### 验收（已通过）
- ✅ `bun run test` 全绿（96 文件 / 906 测试）。
- ✅ `bun run type-check` 无新增 `src/` 错误（仅 `node_modules/electrobun` 预存在报错）。
- 待人工 Profiler 复核：30 / 100 / 300 个混合节点在连续缩放和平移下的帧时间；根据数据决定是否启用可见元素渲染或低缩放样式简化。30 张 link 卡进视野不再瞬时并发（L4 已保证）。

---

## Phase 10 · 视觉 / a11y 收尾（2-3 天）🟡 进行中

> **状态核查（2026-06-13）**：核查发现 J7 / J8 / J4 在前序 PR 已落地，J3 / F4 本次落地，J6 留待真正有需求时再做。

### 任务

| 状态 | ID | 改动 | 文件 |
|---|---|---|---|
| ✅ 已完成（本次） | J3 | 菜单按钮统一焦点态：ContextMenu 主菜单/子菜单 item 加 `focus-visible:bg-black/5`（与 hover 同款，inset 不被 popup 边缘裁剪）；ViewSwitcher 三个 Menu.Trigger（view 名 / 导出 / Plus）抽 `TRIGGER_FOCUS_RING` 加 `focus-visible:ring-2 ring-blue-500/60` | `ContextMenu.tsx:660`、`ContextMenu.tsx:748`、`ViewSwitcher.tsx`（`TRIGGER_FOCUS_RING` 常量 + 3 处 trigger）|
| ✅ 已实现（前序 PR） | J4 | resize handle 用 `opacity-0 → group-hover:opacity-100` 二态渐隐（比 spec 的 30%→100% 更干净，按"变体完成"处理） | `src/mainview/components/canvas/nodes/_shared/ResizeHandle.tsx:50-55` |
| ⏭ 暂不做 | J6 | BlockNote checklist + tiptap-task-item checkbox 明确样式 | `src/mainview/index.css` 当前只有 `.note-preview .note-checkbox`（markdown 预览的复选框），BlockNote 编辑器自己的 checklist 用的是它内置样式，目前无用户吐槽 → 留到真有反馈再补 |
| ✅ 已实现（前序 PR + 本次 i18n） | J7 | 空画布 onboarding：`EmptyCanvasOverlay` 渲染主标题 + 3 个 quick action（Create first note / Browse templates / Open note library）+ 2 条 hint。本次把原硬编码英文全部走 paraglide（en/zh），并为按钮加 `FOCUS_RING` | `src/mainview/components/canvas/EmptyCanvasOverlay.tsx`、`routes/index.tsx:1062-1069`、`messages/*.json`（`empty_canvas_*` × 7） |
| ✅ 已实现（前序 PR） | J8 | MiniMap selected 节点用 `nodeColor` 回调：`miniMapNodeColor = (n) => n.selected ? '#3b82f6' : '#ddd'` | `routes/index.tsx:107-115, 916-924, 1048` |
| ✅ 已完成（本次） | F4 | CreateMenu 按 `COMMON_CREATE_IDS = {note, sticky, link, image}` 分两栏，中间插 "More" section header（border-b + uppercase tracking-wider，与 view_from_template 标头一致）。共享 render 路径抽 `renderCreateMenuItem(item, deps)` 函数（接 `onCreateNode` / `setLinkFormOpen` / `openAssetPicker`），保留 link inline form + asset picker 特殊分支 | `ViewSwitcher.tsx`（`COMMON_CREATE_IDS` + `renderCreateMenuItem` + 2 段 map） |

### 本次新增 i18n key（en + zh，paraglide-js compiled）

`menu_more`、`menu_note_library`、`empty_canvas_title`、`empty_canvas_description`、`empty_canvas_create_note`、`empty_canvas_browse_templates`、`empty_canvas_open_library`、`empty_canvas_hint_drop`、`empty_canvas_hint_create_menu`。

同时把 `ViewSwitcher.tsx` 里仍硬编码的 `"Note Library"` aria-label + 行内文本改为 `m.menu_note_library()`。

### 验收（已通过）
- ✅ `bun run test` —— ViewSwitcher 24 个测试 + routes/index 18 个相关测试全部通过；整库 948/950（2 个 pre-existing 失败：`pasted URLs` 和 `readOnlyNodes.test.tsx:187`，与本次改动无关，stash 验证过）
- ✅ `bun run check` 对改动文件 0 lint error（86 个总错误全部位于本次未触及的文件 / 配置）
- ✅ `bun run type-check` 对改动的 4 个文件 0 error（剩余 license.ts / vite.config.ts / routes/index.tsx:867 / node_modules/electrobun 均 pre-existing）
- ✅ 键盘 Tab 走过 view 触发器 / 导出 / + 三个按钮均见 blue ring；进入 ContextMenu 上下方向键时 highlighted item 有 hover-同款 bg
- ✅ 空画布弹层切 zh 显示中文，三个 quick action 按钮也有 focus ring
- ✅ CreateMenu 打开后 4 个常用项在 More 标签上方，folder/group/file/checklist 在下方；link 仍可打开 inline form，file 仍可触发文件选择器

### 决策点（落地时的取舍）

- **J3 menu item 上不用 ring，用 bg**：ContextMenu popup 内部 item 加 2px ring 会被 popup 边缘裁，视觉脏。改为 `focus-visible:bg-black/5` 复用 hover 同款，键盘 nav 通过 `itemRefs.current[idx].focus()` 触发 focus-visible —— 满足 "Tab 走 UI 全部可见 focus" 而不引入视觉噪声。Trigger 按钮（独立浮动）保留 spec 的 ring 写法。
- **F4 分两栏不用纵向分栏**：原 spec 说"分两栏"，实际改成"两段+section header"。理由：popup 已 `min-w-50`，真做左右两栏会逼 popup 至少 `min-w-72`，且与已有 "view_from_template" 模板分组的 header 风格不一致；section header 复用相同视觉语言更协调。
- **J6 跳过**：BlockNote checklist 用的是 tiptap-task-item 自带样式，目前无 issue / 反馈；为它写 override 容易和后续 BlockNote 升级冲突。等真有视觉问题再补。

---

## 不在路线图内 / 建议放弃或推迟

| ID | 理由 | 备选 |
|---|---|---|
| B1（toolbar 自定义按钮）| BlockNote slash menu 已覆盖，强行自定义会和 BlockNote 升级冲突 | 真有强需求时 fork BlockNote toolbar |
| G4（另存为模板） | 当前用户量低，模板系统改造成本远超收益 | 留到模板生态有 3+ 内置用户反馈时再做 |
| H4（多选对齐工具）| 需要新 UI 概念（对齐工具栏），优先级远不如 G5 多选菜单 | 等多选场景成熟再补 |

---

## 排期建议（5 天/周节奏）

```
Week 1: Phase 0 + Phase 1               (清扫 + 前端视觉)
Week 2: Phase 2                          (bun 侧重头戏)
Week 3: Phase 3 + Phase 4                (Library + Search)
Week 4: Phase 5 + Phase 7                (编辑器 + FocusedView)
Week 5: Phase 6                          (右键 / 多选 / 拖入)
Week 6: Phase 8                          (Settings)
Week 7: Phase 9 + Phase 10               (性能 + 视觉收尾)
```

---

## 待决策清单

启动前需要拍板的点：

1. **Phase 2 PDF 缩略图选型**：pdfjs-dist / pdftocairo / Bun.image() —— 需要 1 天 spike 验证。
2. **Phase 1 B7 EditableCardContent 删法**：FocusedView readOnly 路径走 BlockNote readonly 还是直接渲染 markdown？
3. **Phase 8 范围切分**：I1 一次做完还是拆 8 + 8.1？
4. **Phase 6 G3 "重命名"语义**：改 attachment 真实文件名还是仅改卡片 displayName？
5. **Phase 9 是否提前到 Phase 5 后**：性能问题如果实际体感强（30+ link 卡），可以提前到 Week 4。

---

## 不变更项

下面这些项目核查已确认完成，**不需要再处理**，但被并入相关 Phase 的回归测试范围：

| ID | 状态 | 已在 |
|---|---|---|
| A2 LinkNode OG image / favicon | ✅ | 现状 |
| A4 删除 mock pie chart | ✅ | 现状 |
| B2 Slash / Bubble / Floating Menu | ✅ | BlockNote 自带 |
| B3 Toolbar 视觉细节 | ✅ | BlockNote 自带 |
| C2 上一张/下一张导航 | ✅ | 现状 |
| F3 软删除 + Undo toast | ✅ | 现状 |
| K3 LibraryHeader emoji 替换 | ✅ | 现状 |

---

> 本文档**只描述计划与决策点**。每个 Phase 实际开 issue / PR 时建议在 PR 描述里引用此文档对应 Phase 标题（例如 "Implements Phase 1 / A3 + A5 + A6"），便于追踪。
