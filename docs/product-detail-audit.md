# GhostBoard 产品细节体验审计

> **审计日期**: 2026-05-26
> **审计范围**: Canvas 节点缩略图、Tiptap 编辑器、FocusedView、Library 弹窗、Search、Settings、ViewSwitcher、ContextMenu、视觉一致性、i18n / a11y
> **审计方法**: 逐文件代码审查（read-only），按"用户能感知到的差距"组织。所有引用都带文件路径与位置。

本文聚焦**用户可感知的产品细节缺失**（比如缩略图缺失、编辑器功能不全、菜单缺常用项）。代码质量类问题见 `ux-optimization-audit.md`、`code-redundancy-analysis.md`。

---

## A. Canvas 卡片：缩略图与预览大面积缺失

### A1. AssetNode：PDF / 文本 / Archive 没有任何缩略图（P0）

`AssetThumbnail` 只在 `kind === 'video' | 'audio'` 时返回内容，其它一律 `return null`。PDF、`.txt/.md/.json`、`.zip`、Office、设计稿源文件**在画布上看起来完全一样**，只能靠文件名分辨。

文件：`src/mainview/components/canvas/nodes/AssetNode.tsx:240-254`

```tsx
function AssetThumbnail({ asset, title }) {
  if (asset.kind === 'video') return <VideoThumbnail ... />;
  if (asset.kind === 'audio') return <AudioThumbnail asset={asset} />;
  return null; // ← PDF / 文本 / archive 都掉这里
}
```

建议：
- **PDF**：bun 侧用 pdfjs 渲第一页位图 → 写入 `thumbnailFile`（PRD 自己写了"暂不提供页面级预览"，可从首页缩图起步）。
- **文本类** (`text/*`、`application/json`、`.md`)：bun 侧读前 ~500 字 → 写入 `previewExcerpt`，卡片当"文档卡"渲染。
- **archive**：列出 top-level 条目数量与前几个文件名。
- **图片类 asset**（被识别成 `kind: 'file'` 的边界情况）也应当像 ImageNode 一样生成缩略图。
- `docs/tech-spec.md` 写了 `src/bun/thumbnail.ts`，**仓库里不存在**。要么补，要么把文档去掉。

### A2. LinkNode：抓到的 OG image / favicon 完全没用（P0）

`rpcUnfurlLink` 把 `imageUrl`、`faviconUrl`、`siteName` 都存进了 `data`，但 `LinkContent` **完全没渲染**——卡片上仍是通用 `Globe2` 图标 + 标题 + URL。

文件：`src/mainview/components/canvas/nodes/LinkNode.tsx:229-261, 132-193`

```tsx
updateNodeData(id, {
  ...(meta.imageUrl ? { imageUrl: meta.imageUrl } : {}),    // 存了
  ...(meta.faviconUrl ? { faviconUrl: meta.faviconUrl } : {}), // 存了
}); // 但 LinkContent 既没 <img src={link.imageUrl} /> 也没 favicon
```

建议：
- 卡片顶部加 OG image 横图区（Notion / Are.na 标配）。
- Header 左上的 `Globe2` 替换成 `faviconUrl`（失败时 fallback `Globe2`）。
- `siteName` 应作为副标题或角标显示。

### A3. FolderNode：永远是同一张紫色封面，看不出里面有什么（P1）

`FolderContent` 是硬编码紫色渐变 cover，缺：
- 子卡片数量徽章（"5 张笔记"）；目前只能靠 `data.subtitle`（要手动填）。
- 子卡片缩略图堆叠预览（Apple 文件夹、Things 项目分组都有）。
- 用户自定义 `color`（其它节点都支持，文件夹独缺）。
- Drop target 之外的 hover 提示（"双击进入"）。

PRD 把文件夹定位为"组织容器"，但视觉完全没有传达内含内容的信息密度。

文件：`src/mainview/components/canvas/nodes/FolderNode.tsx:35-133`

### A4. CardNode：image 类型卡片是写死的假饼图（P0，建议直接删）

`CardContent` 里 `data.type === 'image'` 分支渲染的是一个 **mock pie chart**——硬编码 4 个 clipPath 切片，不读取任何用户数据。是 demo 残留，但还在生产代码路径里。

文件：`src/mainview/components/canvas/nodes/CardNode.tsx:26-82`

```tsx
if (data.type === 'image') {
  return (
    ...
    {/* Mock Pie Chart */}
    <div className="absolute inset-0 bg-[#555]" style={{ clipPath: ... }}/>
```

CreateMenu 没有暴露入口，但旧数据若带 `data.type === 'image'` 仍会触发。建议直接删，或实现成真实图表卡片。

### A5. StickyNode：缩略态只有两条 placeholder 横线（P1）

`isZoomedOut` 时显示两条灰 bar，**不显示任何文本预览**。其它节点（CardNode）至少在缩略态显示标题。Sticky 没有 title，但完全可以把 `content` 的前 12–16 字显示出来。

文件：`src/mainview/components/canvas/nodes/StickyNode.tsx:70-76`

### A6. ImageNode：thumbnail 缺失/迁移后没有 missing 提示（P2）

`!data.imageUrl && !data.imageFile` 时显示"Click to add image"；但**已上传后 `thumbnailFile` 丢失/迁移**（attachment missing）时，ImageNode 不像 AssetNode 那样显示红色"Missing attachment"徽章，会直接默默退回空态。`createImageThumbnail` 失败时也只是 `console.error`，没 toast。

文件：`src/mainview/components/canvas/nodes/ImageNode.tsx:88-98, 168-198`

### A7. 五处节点的 ResizeControl SVG 完全重复（P2）

CardNode / ImageNode / AssetNode / LinkNode / FolderNode 五份粘贴了同样 ~30 行 SVG resize handle。属于"细节打磨"档但非常显眼，妨碍后续统一调样。

---


## B. 编辑器（Tiptap）：toolbar 与扩展功能都太薄

### B1. Toolbar 缺失常用项（P0）

目前 toolbar 只有：Bold / Italic / Strike / 行内 Code / H1 H2 H3 / 无序列表 / 有序列表 / 任务列表。

文件：`src/mainview/components/editor/TiptapEditor.tsx:80-162`

明显缺少：
- ↶ Undo / ↷ Redo（StarterKit History 已启用，没暴露按钮）。
- Blockquote 引用（StarterKit 自带，无按钮）。
- Code Block（StarterKit 自带，无按钮，用户只能靠 ` ``` ` 触发）。
- Horizontal Rule 分割线（自带，无按钮）。
- 插入 / 取消 Link（已 `linkOnPaste`，但选中文本无法转链接）。
- 插入 Image（Image extension 已装，没办法触发，只能粘贴 base64）。
- 清除格式 Clear Marks。
- Table（PRD 提"常用 Markdown 子集"，未明确表态；GFM 标配，应当明确支持或拒绝）。

### B2. 没有 Slash Command / BubbleMenu / FloatingMenu（P0）

Tiptap 生态最有差异化体验的能力：
- **BubbleMenu**：选中文字浮出格式条（Notion 标配）。当前要把鼠标拉到顶部 sticky toolbar。
- **FloatingMenu**：空行时浮出 "/" 或 "+" 按钮。
- **Slash command**：编辑器里敲 `/` 选择 H1 / 列表 / 代码块 / 任务等。

这是"编辑器太简陋"的核心来源。

### B3. Toolbar 样式不够精细（P2）

- 没有 disabled 视觉表达（只是变浅）。
- `shortcut` prop 只在 Bold / Italic / Strike / Code 上传入，其它按钮没传 tooltip。
- Heading 三档不是分段控件（segmented control），三个独立按钮容易被误以为可叠加。
- 暗色卡片下分隔线 `bg-white/10` 几乎看不到。

### B4. 编辑器内容 padding 在大小屏都不对（P2）

`max-w-3xl px-8 py-12 sm:px-12` 写死。focused view 大屏（>2000px）上文字挤在中间窄列，浪费上千像素；小屏（<900px）`px-12` 又过宽。建议响应式 padding，或交给 prose 自带 max-width。

文件：`src/mainview/components/editor/TiptapEditor.tsx:264`

### B5. 标题输入框没有任何"hint"（P2）

`<input>` 只用 `placeholder="Untitled"`，无最大长度、无跨行扩展（超长横向溢出），按 Enter 不会跳到正文。建议：Enter → focus 编辑器；超长用 `<textarea autosize>`。

文件：`src/mainview/components/editor/TiptapEditor.tsx:265-275`

### B6. 保存状态对用户不可见（P1）

`useNoteSaver` 内部 `saveNoteDebounced` 在跑，但 focused view 看不到"已保存 / 正在保存 / 保存失败"指示。一旦 RPC 挂了用户会以为内容已存。

### B7. CardNode 的 `EditableCardContent`（非 Tiptap fallback）功能比 Tiptap 还差（P1）

当 `FLAGS.tiptapEditor` 为 false 或旧数据走到这里，编辑器降级成两个 `contentEditable` div——无 toolbar、无 markdown、无快捷键。`docs/features/Review/editor-and-preview-plan.md` 已写"`EditableCardContent` 可以删除"，但还没删。建议下决心移除 fallback。

文件：`src/mainview/components/canvas/nodes/CardNode.tsx:225-281`

---

## C. FocusedView：交互细节缺失

### C1. 关闭按钮位置过远（P1）

关闭键固定在左上 `top-8 left-8`，27" 屏鼠标要走很远。常规做法：右上 X + ESC + 点遮罩。点遮罩支持，但**右上没有 X 按钮**。

文件：`src/mainview/components/canvas/FocusedView.tsx:121-137`

### C2. 没有上一张 / 下一张笔记导航（P1）

画布上 50 张笔记，用户连续浏览全靠 ESC 再找下一张。Photos / Notion 都支持 `← / →` 翻页。

### C3. 没有元信息（P2）

focused 顶部不显示：创建时间 / 更新时间 / word count / 当前 view 名称。LinkNode 和 AssetNode 头部有，TextNote 没有。

### C4. focused 视图里图片不支持缩放 / pan（P2）

ImageContent 在 focused 模式下 `object-contain`，但不支持滚轮缩放 / pinch zoom / pan，作为图床用得很受限。

文件：`src/mainview/components/canvas/nodes/ImageNode.tsx:100-133`

### C5. focused 关闭动画在节点滚出屏幕时会"飞到屏外"（P2）

`FocusedView` exit FLIP 回到节点矩形。但**节点滚出视口**时，exit 会飞到看不见的位置，体感像"窗口直接消失"。建议 exit 前 `inst.setCenter` 把节点带回视口。

文件：`src/mainview/components/canvas/FocusedView.tsx:139-172`

---

## D. Library 弹窗：弱预览

### D1. LibraryCard 没有任何 thumbnail / excerpt（P0）

画布上你最辛苦做的图与笔记，进 Library 后退化成一个 14px 图标 + 标题 + 相对时间。对图片 / 链接 / 视频卡尤其反差大。

文件：`src/mainview/components/library/LibraryCard.tsx:64-106`

建议：
- 图片 / asset 卡：`thumbnailUrl` 顶部 16:9 区。
- 链接卡：`imageUrl`（OG）顶部。
- 文本 / checklist 卡：渲染 `previewExcerpt` 2-3 行小字（数据已有，没用）。
- 文件夹组里的子卡片同规则。

### D2. 缺少键盘交互（P1）

LibraryPopup 只支持 ESC 关闭。**没有**：↑↓ 选择、Enter 确认、`⌘F` 聚焦搜索框。对比 SearchDialog 提供 keyboard nav，这里完全没有，体感非常不一致。

### D3. 排序选择器用原生 `<select>`（P2）

其它 UI 都是自定义 `Select.tsx`（base-ui），唯独这里用 `<select>`，macOS 上字号 / 字体 / 箭头都与周围不搭。

文件：`src/mainview/components/library/LibraryPopup.tsx:185-196`

### D4. 搜索无结果时给的反馈过于敷衍（P2）

只显示一句 `library_empty_search({ query })`，没有"清空搜索"按钮、没有"换个关键词"建议。

### D5. 不显示总数（P2）

LibraryHeader 不显示 "127 笔记"，用户感受不到自己的资产规模。

---


## E. SearchDialog (⌘K)：体验欠精修

### E1. 没有关键词高亮（P0）

`result.excerpt` 是纯文本插入。Notion / Linear / VSCode 都会用 `<mark>` 或 bg color 高亮搜索词，这里没有。

文件：`src/mainview/components/search/SearchDialog.tsx:266-309`

### E2. 结果没有分组（P1）

`ResultRow` 在尾巴显示 `viewName → matchField`，但不同 view 的结果是平铺的。有 5 个 canvas 时结果会乱跳；应按 view 分组（折叠 group header）或至少按 view 二级排序。

### E3. 空态过于敷衍（P1）

打开 `⌘K` 时 query 为空 → 显示空白。可以做：
- 最近打开列表（最近 5 张卡片 / 最近 3 个 canvas）。
- 建议搜索：最常访问的笔记。
- 快捷键 hint：`⌘N` 新建、`⌘O` 模板库、`⌘,` 设置。

### E4. 没有 result type 筛选（P2）

顶部应有 chip：`全部 笔记 链接 文件 画布`，让用户筛 kind。

### E5. 快捷键 hint 缺失（P2）

SearchDialog 触发按钮 / titlebar 没在 placeholder 后挂 "⌘K" 提示。`placeholder="Search notes, stickies, folders, views…"` 已经写死英文（见 K4）。

文件：`src/mainview/components/search/SearchDialog.tsx:211`

---

## F. ViewSwitcher（底部画布切换面板）

### F1. 没有节点数量 / 类型可视化（P1）

`docs/tech-spec.md` 写明 ViewSwitcher 触发器要显示"当前画布名称 + 节点计数 + 画布数量"，但 code 里只显示画布名称——**节点计数没有渲染**。

文件：`src/mainview/components/canvas/ViewSwitcher.tsx:66-200`

### F2. canvas 重命名缺少校验（P2）

没有同名去重提示（两个画布同名时切换菜单看不出谁是谁）、没有空名校验、没有长度上限。

### F3. delete 没有"软删除 N 秒撤销"toast（P1）

PRD 写了软删除 + trash 恢复，但触发删除瞬间没有 toast 撤销条（只能去 Settings/Trash 找回），用户教育成本高。

### F4. CreateMenu 9 种 type 平铺（P2）

平铺 9 种 type，但用户 90% 时间用 note / sticky，`file / group / folder` 长期低频却占同样视觉权重。可按使用频率排序或用次级菜单收纳低频项。

文件：`src/mainview/components/canvas/ViewSwitcher.tsx:50-64`

---

## G. ContextMenu：功能性遗漏

### G1. Image 右键没有"替换图片 / 复制地址 / 在 Finder 显示"（P0）

`getImageItems` 只有：focus / copy / change-color / delete。最常见的诉求"替换这张图"完全没入口（只能删了重传）。

文件：`src/mainview/components/canvas/ContextMenu.tsx:124-140`

### G2. Link 右键没有"打开链接 / 复制 URL / 重新抓取预览"（P0）

`getLinkItems` 同样只有四项。`LinkNode` 内部有 `handleRetry`，但 ContextMenu 没暴露——用户必须等卡片 unfurl 失败状态出现才能点 Retry。

文件：`src/mainview/components/canvas/ContextMenu.tsx:142-158`、`LinkNode.tsx:206-209`

### G3. Asset 右键没有"在 Finder 显示 / 替换文件 / 重命名"（P0）

即使 attachment 已在 workspace 里，也没办法从 GhostBoard 跳进文件管理器。

文件：`src/mainview/components/canvas/ContextMenu.tsx:160-176`

### G4. 缺少"另存为模板"（P2）

对一张精心做好的笔记，没有"另存为模板"——模板库现在只能装内置 9 个。

### G5. 多选无批量菜单（P1）

ContextMenu 没有针对多选的分支（批量改色 / 加入 group / 打 tag / 移到 view）。

---

## H. 拖拽 / 创建 / 导入

### H1. LinkCreateForm 缺少剪贴板自动填充（P2）

新建 link 卡时若剪贴板里恰好是 URL，应该一键填充（或 Cmd+V 直接生成）。

文件：`src/mainview/components/canvas/LinkCreateForm.tsx`

### H2. 没有全局 drop zone 蒙层（P1）

`<ReactFlow>` 应该在 dragenter 时全屏显示 "Drop to add" 蒙层，目前只有 ImageNode 自己接收 drop，用户感知不到"可以拖任何文件进来"。

文件：`src/mainview/routes/index.tsx`、`src/mainview/components/canvas/nodes/ImageNode.tsx:200-213`

### H3. 没有 markdown 文件导入（P1）

用户已写好的 `.md` 文件没有"导入为笔记卡"通道，只能复制粘贴。

### H4. 没有节点对齐 / 分布对齐（P2）

`useHelperLines` 实现了对齐辅助线，但多选后没有 align-left / distribute-horizontal 等批量操作。

---

## I. Settings：信息密度过低

### I1. 只有 Language + Theme + Trash（P1）

PRD 说要支持工作区路径切换、字体、自动保存间隔、画布背景偏好、热键定制——一个都没看到。具体缺：
- "切换工作区文件夹"按钮。
- "打开 workspace 文件夹"快捷入口。
- Keyboard shortcuts 一览。
- About / 版本号 / 检查更新。
- 数据迁移 / 备份 / 导出全部。

文件：`src/mainview/components/settings/SettingsApp.tsx:358-396`

### I2. 设置应用没有侧边栏 / 分组（P2）

所有项目堆在一个 section 里。按 macOS 风格分成左侧 sidebar（系统偏好 / 数据 / 快捷键 / 关于）会清晰得多。

### I3. Trash 区域可用性问题（P2）

需要：bulk "清空全部" 按钮、按删除时间排序、单项 hover 时显示完整路径。

---


## J. 视觉 / 微交互打磨

### J1. shadow 不统一（P2）

- CardNode：`shadow-card / shadow-card-hover`
- ImageNode：`shadow-sm` + hover `shadow-xl`
- AssetNode：`shadow-card` + hover `shadow-card-hover`
- LinkNode：`shadow-card` + hover `shadow-card-hover`
- StickyNode：`shadow-card`
- FolderNode：自定义复合 box-shadow

五种节点 hover 阴影系不一致，画布多种卡片并存时层级混乱。

### J2. 暗黑模式覆盖不一致（P2）

- TiptapEditor 用 `prose-invert` 完整覆盖。
- AssetNode focused 视图大量 `dark:bg-neutral-900`。
- **FolderNode 完全没有 dark 适配**——紫色封面在深色背景里非常刺眼。
- LibraryPopup `bg-white dark:bg-neutral-900`，但 LibraryCard 是 `bg-muted/30`（token），混搭风格。

### J3. focus ring 缺失（P2）

ContextMenu / CreateMenu 内的按钮没有 `focus-visible:ring` 样式（仅 SearchDialog 部分按钮有）。键盘用户体验差。

### J4. resize handle 必须 hover 才显示（P2）

全部节点 resize 控件 `opacity-0 group-hover:opacity-100`。在触控板用户里"必须 hover 才能看到 resize 把手"是常见 dark pattern，建议恒亮但低透明度。

### J5. `:empty` placeholder trick 在 zero-width / 纯空格时失效（P2）

CardNode 的 `EditableCardContent` 用 `empty:before:content-[attr(data-placeholder)]` 显示 placeholder，但用户输入纯空格 / 零宽字符时 `:empty` 不命中，placeholder 行为与 Tiptap Placeholder 不一致。

文件：`src/mainview/components/canvas/nodes/CardNode.tsx:259-279`

### J6. 任务列表 checkbox 样式需要确认（P2）

`tiptap-task-item` 只挂了 className，实际 CSS 是否覆盖原生 `<input type=checkbox>` 需要在 `index.css` 里核对；如果没覆盖，task list 会显示成系统原生方块，与其它 UI 风格脱节。

### J7. 空画布无 onboarding（P1）

新建 view 时画布完全空白，只有右下角 MiniMap。应有：
- 中心 placeholder："Press / Double-click anywhere to create a card"。
- 模板入口快捷链接。
- 键盘快捷键 cheatsheet。

### J8. MiniMap 没有选中态颜色（P2）

MiniMap 显示所有节点同色，没有 selected 态颜色，跳转大画布时不知道自己在哪。

文件：`src/mainview/routes/index.tsx:701-710`

---

## K. 可访问性 / 国际化

### K1. 大量 `title` / `aria-label` 缺失（P2）

CardNode / LinkNode / AssetNode 的 hover 上没有 title。文件名 `truncate` 后无法看完整——应有 `title={asset.fileName}` 或 tooltip。

### K2. CreateMenu 的 `Link` 是硬编码英文（P0，i18n 漏洞）

其它项都走 `m.menu_*()`，唯独 `label: 'Link'` 没走 paraglide：

文件：`src/mainview/components/canvas/ViewSwitcher.tsx:60`

```tsx
{ id: 'link', label: 'Link', icon: LinkIcon, enabled: true }, // ← 漏 i18n
```

### K3. LibraryHeader 标题写死 `📚` emoji（P2）

emoji 在不同系统字体下表现不一致；如果做 dark mode + 精致感产品，emoji 标题会显得儿戏。

文件：`src/mainview/components/library/LibraryPopup.tsx:172`

### K4. SearchDialog "No matches" 没走 paraglide（P1）

英文写死：

文件：`src/mainview/components/search/SearchDialog.tsx:234-238, 211`

### K5. 错误 toast 内容是英文写死（P1）

`toast.error('File could not be opened.')` / `toast.error('File has not been saved yet.')` 在 zh 语言下也是英文。

文件：`src/mainview/components/canvas/nodes/AssetNode.tsx:365-371`

---

## L. 性能 / 稳定性

### L1. `useViewport()` 触发所有节点重渲（P1）

每种节点都调 `useViewport()` 比较 `zoom < 0.4`。缩放手势时所有节点同时重渲。建议把 `isZoomedOut` 提到上层 Context broadcast，节点订阅布尔值。

### L2. focused view 动画同时改 top/left/width/height 与 transform（P2）

`FocusedView` exit 不仅用 `scaleX/scaleY`，还设置 `top/left/width/height` 静态属性，layout + composite 双开销。`AssetNode` focused 进入偶发卡顿可能源于此。

文件：`src/mainview/components/canvas/FocusedView.tsx:139-172`

### L3. ImageNode 缩略图失败静默（P2）

`createImageThumbnail` catch 里只 `console.error`，用户看不到。建议非阻塞 toast 提示"缩略图生成失败"。

文件：`src/mainview/components/canvas/nodes/ImageNode.tsx:191-193`

### L4. LinkNode unfurl 没有 in-viewport 限流（P1）

`useEffect([data.url, data.unfurlStatus, id])` 一 mount 就跑。用户在画布上瞬间滑过 30 个 link 卡，30 个 unfurl 请求并发进入。建议先做 in-viewport / IntersectionObserver 检查，可见才请求。

文件：`src/mainview/components/canvas/nodes/LinkNode.tsx:211-266`

---

## M. 优先级总表

| P | 类别 | 项目 |
| --- | --- | --- |
| **P0** | A 缩略图 | A1 PDF/文本/archive 缺缩略图；A2 link 不渲 OG image；A4 删 mock pie chart |
| **P0** | B 编辑器 | B1 toolbar 缺核心项（undo/quote/code block/link button）；B2 加 BubbleMenu / Slash command |
| **P0** | D 库 | D1 LibraryCard 不显示已有 excerpt / thumbnail |
| **P0** | E 搜索 | E1 关键词高亮 |
| **P0** | G 右键 | G1 Image 右键缺替换；G2 Link 缺打开；G3 Asset 缺 Finder |
| **P0** | K i18n | K2 `Link` 硬编码 |
| **P1** | A | A3 文件夹封面无内容感；A5 sticky 缩略态无文字 |
| **P1** | B | B6 保存状态不可见；B7 删除 CardNode fallback |
| **P1** | C | C1 关闭按钮位置；C2 翻页导航 |
| **P1** | D | D2 键盘交互 |
| **P1** | E | E2 结果分组；E3 空态 |
| **P1** | F | F1 节点计数缺失；F3 删除撤销 toast |
| **P1** | G | G5 多选批量菜单 |
| **P1** | H | H2 全局 drop zone；H3 markdown 导入 |
| **P1** | I | I1 设置项严重不足 |
| **P1** | J | J7 空画布 onboarding |
| **P1** | K | K4/K5 i18n 漏洞 |
| **P1** | L | L1 useViewport 性能；L4 unfurl 限流 |
| **P2** | A | A6 missing 提示；A7 ResizeControl 提取 |
| **P2** | B | B3 toolbar 细节；B4 padding；B5 标题 input |
| **P2** | C | C3 元信息；C4 图片缩放；C5 exit FLIP |
| **P2** | D | D3 原生 select；D4 空搜索建议；D5 总数 |
| **P2** | E | E4 type 筛选；E5 快捷键 hint |
| **P2** | F | F2 重命名校验；F4 CreateMenu 分组 |
| **P2** | G | G4 另存为模板 |
| **P2** | H | H1 剪贴板填充；H4 对齐工具 |
| **P2** | I | I2 sidebar；I3 trash |
| **P2** | J | J1-J6, J8 视觉一致性 |
| **P2** | K | K1 a11y；K3 emoji 标题 |
| **P2** | L | L2 动画双开销；L3 toast 缺失 |

---

## N. 建议的落地分组（让团队挑顺序）

1. **"卡片视觉升级包"**：A1 + A2 + A3 + A5 + D1 → 让画布与库都能识别内容。
2. **"编辑器升级包"**：B1 + B2 + B6 + B7 → 让笔记编辑达到现代产品水准。
3. **"右键 / 多选增强包"**：G1-G3 + G5 + H2 → 把"放在画布上的资产"真正能管理。
4. **"搜索 / 导航包"**：E1 + E2 + E3 + C1 + C2 + F1 → 提升导航效率。
5. **"设置 / 数据管理包"**：I1 + I2 + F3 → 让"高级用户"留得下来。
6. **"i18n / 视觉清理"**：K2 + K4 + K5 + J1 + J2 + J7 → 上线前的最后一公里。

每个包都可独立交付一次小版本（约 1-2 周），建议按 1 → 2 → 3 顺序排。

---

> 本文档**只描述现状与差距**，不包含具体实现方案。每条都标了文件路径与行号，开 issue 时直接引用即可。
