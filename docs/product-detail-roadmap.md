# GhostBoard 产品细节落地路线图

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
| **4** | Search 升级 | 高亮 + 分组 + 空态 + 筛选 | 2-3 天 | 强烈推荐 | - |
| **5** | 编辑器收尾 | 保存指示器 + 删 EditableCardContent + 标题 input | 2 天 | 强烈推荐 | - |
| **6** | 右键 / 多选 / 拖入 | ContextMenu 完整化 + 全局 drop zone | 3-5 天 | 推荐 | - |
| **7** | FocusedView 完善 | 元信息 + 关闭按钮 + 图片缩放 | 2 天 | 推荐 | - |
| **8** | Settings 重构 | sidebar + 工作区 / 快捷键 / 关于 | 3-5 天 | 推荐 | - |
| **9** | 性能 pass | useViewport context + unfurl 视口限流 | 1-2 天 | 推荐 | - |
| **10** | 视觉 / a11y 收尾 | shadow 统一 + dark + focus ring + onboarding | 2-3 天 | 推荐 | - |

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
| A5 | StickyNode `isZoomedOut` 改成显示 `content.slice(0, 16)` + 末尾省略号 | `StickyNode.tsx:78-84` |
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

## Phase 4 · Search 升级（2-3 天）

### 任务

| ID | 改动 | 文件 |
|---|---|---|
| E1 | excerpt 关键词 `<mark>` 高亮（用 `highlight-words-core` 或 90 行的简易实现） | `SearchDialog.tsx:317`、新建 `searchResultRender.ts` |
| E2 | 结果按 `viewName` 分组，group header 折叠 | `SearchDialog.tsx:258-270` |
| E3 | 空 query → 显示最近 5 张卡片 + 3 个 canvas + ⌘N/⌘O/⌘, 提示 | 新建 `SearchEmptyState.tsx` |
| E4 | 顶部 chip：全部 / 笔记 / 链接 / 文件 / 画布（filter `result.kind`） | `SearchDialog.tsx` 顶部 |
| E5 | 标题栏触发按钮 placeholder 后显示 ⌘K kbd（Phase 0 已修 i18n） | `SearchDialog.tsx:220` 附近的 trigger |

### 验收
- 搜 `tan` 时所有结果有黄色高亮；切 chip 时计数变化；ESC + ⌘K 反复开关无卡顿。
- 5000 条结果时高亮不卡（performance budget < 100ms）。

---

## Phase 5 · 编辑器收尾（2 天）

> Phase 1 已删了 EditableCardContent，这里只剩状态指示器和标题 input。

### 任务

| ID | 改动 | 文件 |
|---|---|---|
| B6 | `useBlockNoteSaver` 暴露 `{ status: 'idle' \| 'saving' \| 'saved' \| 'error', lastSavedAt }`；FocusedView 顶栏右上加 `<SaveIndicator />` 组件，含 spinner + "已保存于 hh:mm" + 失败 toast | `src/mainview/components/editor/useBlockNoteSaver.ts:232`、新建 `SaveIndicator.tsx`、`FocusedView.tsx` |
| B5 | 标题改成 `<TextareaAutosize maxLength={120} onKeyDown={Enter→focusEditor}>` | `BlockNoteEditor.tsx:293-303` |
| B4 | 编辑器 padding 响应式：`<700: px-4`, `<1400: px-8`, `>1400: px-12 max-w-[min(72ch,80%)]` | `BlockNoteEditor.tsx:292` |

### 验收
- 人为 throttle RPC 看到 saving → saved 状态过渡。
- 故意拔网络看到 error。
- 超长标题自动换行。
- 27" 屏正文不再挤在 768px 内。

### 不做
- **B1 toolbar 自定义按钮**：BlockNote slash menu 已经覆盖，强行自定义工具栏会和后续 BlockNote 升级冲突，跳过。

---

## Phase 6 · 右键 / 多选 / 拖入（3-5 天）

> ⚠️ 启动前先 `git log --oneline -- src/mainview/components/canvas/ContextMenu.tsx src/mainview/hooks/useContextMenu.ts` 看看自核查后 G 组改动情况。

### 任务

| ID | 改动 | 文件 |
|---|---|---|
| G1 | Image 右键加：替换图片 / 复制图片地址 / 在 Finder 显示 | `ContextMenu.tsx:134-151`、`useContextMenu.ts` |
| G2 | Link 右键加：打开链接（`Bun.openExternal`）/ 复制 URL / 重新抓取（暴露 `handleRetry`） | `ContextMenu.tsx:153-172`、`LinkNode.tsx` |
| G3 | Asset 右键加：在 Finder 显示（bun 侧 `showItemInFolder`）/ 替换文件 / 重命名 | `ContextMenu.tsx:174-192`、`src/bun/attachments.ts` 新增 RPC |
| G5 | 多选时菜单分支：批量改色 / 批量加 tag / 批量移到 view / 删除 | `ContextMenu.tsx`、`useContextMenu.ts:188-212` |
| H2 | `<ReactFlow>` 上层挂一个 `useDropZone` hook → dragenter 触发全屏 backdrop + "Drop to add" 文案 | `routes/index.tsx:537-587` 新组件 |
| H1 | LinkCreateForm 挂载时 `navigator.clipboard.readText()` → 若是 URL 则预填 | `LinkCreateForm.tsx:15-17` |
| H3 | CreateMenu 加"Import markdown..."项 → bun 侧 `showOpenDialog` → 创建 BlockNote 卡片 | `ViewSwitcher.tsx`、新建 `src/bun/markdownImport.ts` |

### 验收
- 6 张 link 卡片选中后右键 → 批量改色生效。
- 拖 PDF 进窗口 → 全屏蒙层。
- Cmd+V 在 LinkCreateForm 自动填充。
- `bun run test` 中新增的 G3/H3 单元测试通过。

### 决策点
- **G3 "重命名"语义**：是改 attachment 真实文件名（影响 workspace 文件系统）还是仅改卡片 displayName？建议只改 displayName，避免破坏导出/同步。

---

## Phase 7 · FocusedView 完善（2 天）

### 任务

| ID | 改动 | 文件 |
|---|---|---|
| C1 | 右上加 X 按钮 + 兜底 ESC handler（document level） | `FocusedView.tsx:294-310` |
| C3 | 顶栏左侧元信息条：`createdAt` · `updatedAt` · 字数（用 BlockNote `getDocumentText` 算）· 当前 view 名 | `FocusedView.tsx` |
| C4 | 图片 focused 模式接 `react-zoom-pan-pinch` 或自写 wheel/drag handler | `ImageNode.tsx:35-221` |
| C5 | exit 前若节点不在视口 → 调 `inst.setCenter(node.x, node.y, { duration: 0 })` | `FocusedView.tsx:369-375` |

### 验收
- 滚出视口的卡片关闭动画顺滑。
- 图片支持滚轮缩放、双击重置。
- 元信息在亮/暗主题下都可读。

---

## Phase 8 · Settings 重构（3-5 天）

### 任务

| ID | 改动 | 文件 |
|---|---|---|
| I2 | SettingsApp 改成 macOS 风格左侧 sidebar + 右侧 panel；分四组：General / Workspace / Shortcuts / About | `SettingsApp.tsx` 整体重构 |
| I1 | 各组新增： <br>· **General**: 字体 / 自动保存间隔 / 画布背景 <br>· **Workspace**: 当前路径 + 切换 + "在 Finder 打开" + 导出全部（zip） + 备份 <br>· **Shortcuts**: 只读 cheatsheet（先不做自定义热键，做 readonly 表） <br>· **About**: 版本号 / 更新日志链接 / 检查更新（接 Electrobun updater） | + 多个 `src/bun/*` RPC |
| I3 | TrashSection 加：清空全部 + 按 deletedAt 排序 + `title={fullPath}` | `SettingsApp.tsx:523-597` |
| F2 | rename 校验：同名提示 + maxLength=80 | `ViewSwitcher.tsx:390-402` |
| F1 | ViewSwitcher 触发器加 `· N nodes` | `ViewSwitcher.tsx:468-482`，从 viewStore 取 |

### 验收
- 所有 Settings 改动可来回切换并持久化。
- workspace 切换后刷新加载新数据。
- Trash 清空全部带二次确认。

### 决策点
- **I1 范围**：是把列表全做还是先做 sidebar + workspace 切换 + about？后两组（字体/自动保存间隔/快捷键自定义）可以独立成 Phase 8.1。
- **更新检查**：依赖 Electrobun updater 是否实现，若没有先做占位 "Check for updates" 按钮 + 跳转 GitHub release。

---

## Phase 9 · 性能 pass（1-2 天）

### 任务

| ID | 改动 | 文件 |
|---|---|---|
| L1 | 新建 `ZoomLevelContext`（Provider 在 routes/index.tsx，每 100ms throttle 写 `isZoomedOut`），节点改读 context 不再调 `useViewport()` | 新建 `src/mainview/contexts/ZoomLevelContext.tsx` + 6 个节点 |
| L4 | LinkNode unfurl 加 `IntersectionObserver`，只在 50% 可见时触发；卸载时 abort | `LinkNode.tsx:316-365` |
| L2 | FocusedView exit 不再设 top/left/width/height，全部用 transform；进入也改成 transform-only | `FocusedView.tsx:360-393` |

### 验收
- Profiler 录 30 张卡片 + 缩放手势的 flame chart：节点 commit 数 ↓ 80%。
- 30 张 link 卡同时进入视野 → 网络面板不再瞬间 30 个并发请求。
- FocusedView 进入/退出动画在 throttled CPU 4× 下仍 60fps。

---

## Phase 10 · 视觉 / a11y 收尾（2-3 天）

### 任务

| ID | 改动 | 文件 |
|---|---|---|
| J3 | 所有菜单按钮统一 `focus-visible:ring-2 ring-blue-500/60` | `ContextMenu.tsx`、`ViewSwitcher.tsx` |
| J4 | resize handle `opacity-30 group-hover:opacity-100` 渐变 | 5 个节点（或 Phase 1 抽出的共享组件） |
| J6 | 在 `index.css` 给 BlockNote checklist + tiptap-task-item checkbox 写明确样式 | `src/mainview/index.css` |
| J7 | 空画布 onboarding：中心 placeholder + 6 个常用模板 chip + "/" 提示 | 新建 `EmptyCanvasOverlay.tsx`、`routes/index.tsx` |
| J8 | MiniMap selected 节点用 `nodeColor={(n) => n.selected ? blue : gray}` | `routes/index.tsx:712-724` |
| F4 | CreateMenu 分两栏：常用（note / sticky / link / image）+ 更多（folder / group / file / checklist） | `ViewSwitcher.tsx:55-69, 566` |

### 验收
- 键盘 Tab 走完整个 UI 全部可见 focus ring。
- 空画布有内容感。
- MiniMap 一眼看到当前选中位置。

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
