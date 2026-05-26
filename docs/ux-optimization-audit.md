# GhostBoard 产品细节优化清单

> **审计日期**: 2026-05-26
> **审计范围**: 全部节点组件、编辑器、右键菜单、搜索、侧边栏、聚焦模式、预览层、全局样式
> **审计方法**: 逐文件代码审查 + PRD 对照

---

## 一、CardNode — 文本/清单卡片

### 1.1 `CardContent` 全部 props 为 `any` 类型

**文件**: `src/mainview/components/canvas/nodes/CardNode.tsx`

```tsx
// 当前
export const CardContent = ({ data, isFocused, onChange, readOnly = false }: any) => {

// 建议
interface CardContentProps {
  data: CardNodeData;
  isFocused?: boolean;
  onChange?: (updates: Partial<CardNodeData>) => void;
  readOnly?: boolean;
}
export const CardContent = ({ data, isFocused, onChange, readOnly = false }: CardContentProps) => {
```

**影响**: 没有类型推断、没有自动补全，调用方传错字段不报错。整个渲染层的类型安全从此处断裂。

**优先级**: P2

---

### 1.2 `data.type === 'image'` 分支是遗留的 Mock 饼图

**文件**: `src/mainview/components/canvas/nodes/CardNode.tsx` (约第 30-65 行)

**问题**: CardNode 内部有一段硬编码的 CSS `clip-path` 饼图（`polygon(50% 50%, 100% 0, ...)`），这是早期 demo 遗留物。如果卡片数据的 `type` 字段错误地变成 `'image'`，就会渲染出这个假图表而不是真实图片。

**建议**: 删除整个 `data.type === 'image'` 分支。Image 有独立的 `ImageNode` 组件，CardNode 不需要处理 image 类型。

**优先级**: P1

---

### 1.3 Checklist checkbox 颜色硬编码为黑色

**文件**: `src/mainview/components/canvas/nodes/CardNode.tsx` (checklist 分支)

```tsx
// 当前
item.checked ? 'border-black bg-black' : 'border-gray-400 group-hover:border-black'
```

**问题**: 深色主题或彩色卡片上，黑色 checkbox 不可见或极其违和。

**建议**: 根据 `isColorDark(data.color)` 动态切换 checkbox 颜色：
```tsx
const checkboxChecked = isDark ? 'border-white bg-white' : 'border-black bg-black';
const checkboxUnchecked = isDark ? 'border-white/40 group-hover:border-white' : 'border-gray-400 group-hover:border-black';
```

**优先级**: P1

---

### 1.4 Text card 不展示 tag 标签

**文件**: `src/mainview/components/canvas/nodes/CardNode.tsx` (默认 text 分支)

**问题**: Checklist 卡片显示了 `data.tag`，但默认文本卡片完全忽略了 tag，即便数据里有也不会渲染。

**建议**: 在文本卡片的标题区域上方，复用 checklist 的 tag 渲染逻辑：
```tsx
{data.tag ? (
  <span className="rounded-md px-2 py-1 font-semibold text-xs" style={colorToStyle(data.tagColor)}>
    {data.tag}
  </span>
) : null}
```

**优先级**: P2

---

### 1.5 画布态空卡片无编辑暗示

**问题**: 空卡片只显示 "Untitled"（opacity-40），没有输入框轮廓或占位图标暗示用户「这里可以写」。

**建议**: 空卡片增加淡色虚线边框或 pencil 图标，暗示可编辑状态。

**优先级**: P2

---

### 1.6 EditableCardContent blur 时清除全部 preview 元数据

**文件**: `src/mainview/components/canvas/nodes/CardNode.tsx` (`handleContentBlur`)

```tsx
onChange({
  content: text,
  previewBlocks: undefined,
  previewExcerpt: undefined,
  previewHtml: undefined,
  previewVersion: undefined,
});
```

**问题**: 如果 NoteSaver 没有及时重新生成 preview，切回画布态时卡片内容区域会短暂空白。

**建议**: 在清除旧 preview 的同时，立即用 fallback markdown 渲染一份临时预览，避免空白闪现。

**优先级**: P2

---

## 二、ImageNode — 图片卡片

### 2.1 画布态无加载状态指示

**文件**: `src/mainview/components/canvas/nodes/ImageNode.tsx`

**问题**: 图片 URL 存在但浏览器还在解码时，用户看到的是空白卡片——没有 spinner、没有骨架屏。

**建议**: 使用 `img` 的 `onLoad` / `onError` 事件，加载中显示 `Loader2` spinner。

**优先级**: P2

---

### 2.2 拖放新图片会静默覆盖旧图

**文件**: `src/mainview/components/canvas/nodes/ImageNode.tsx` (`handleDrop`)

**问题**: `handleDrop` 直接覆盖 `data.imageUrl`，没有「替换确认」。用户拖错文件就丢失了原图。

**建议**: 如果卡片已有图片，弹出轻量确认 toast：「Replace current image?」，提供 3 秒 undo。

**优先级**: P2

---

### 2.3 图片加载失败无重试入口

**问题**: 如果 URL 失效或文件损坏，卡片只显示 `ImagePlus` 图标 + "No image"，没有「重新选择」按钮。

**建议**: 失败状态下显示 "Image not available" + "Choose file" 按钮。

**优先级**: P2

---

### 2.4 无法从画布态编辑图片标题

**问题**: 标题只在底部 `border-t` 区域纯展示，不可点击编辑。要改标题必须进入聚焦模式。

**建议**: 让标题区域支持单击进入 inline 编辑（类似 StickyNode 的编辑模式）。

**优先级**: P2

---

## 三、AssetNode — 文件/视频/音频卡片

### 3.1 普通文件聚焦模式无内容预览

**文件**: `src/mainview/components/canvas/nodes/AssetNode.tsx` (FocusedView 分支)

**问题**: 非音视频文件的聚焦视图只显示 Type / Size / Duration / File 四格 metadata + "Open file" 按钮，没有任何文件内容预览。对 PDF 用户期望看到页面缩略图。

**建议**:
- PDF: 接入 PDF 页面预览（参见 PRD TODO-5）
- 文本文件: 显示前 N 行内容
- 其他格式: 保持当前 metadata 视图

**优先级**: P2 (PDF 为 P1)

---

### 3.2 音频 waveform 无真实数据时使用随机高度

**文件**: `src/mainview/components/canvas/nodes/AssetNode.tsx` (`AudioThumbnail`)

```tsx
Array.from({ length: 24 }, (_, index) => index)
// → Math.max(18, (0.25 + value * 0.75) * 44)
```

**问题**: 看起来是「假波形」，用户发现后会感觉被欺骗。

**建议**: 没有真实 waveform 数据时，使用均匀高度的静态条形，不做随机模拟。或改为简单的音符图标 + 时长。

**优先级**: P2

---

### 3.3 画布态视频/音频没有内联播放入口

**问题**: 必须进入聚焦模式才能播放。画布上只显示封面图 + 播放按钮图标，但点击播放按钮只会打开聚焦模式而非直接播放。

**建议**: 在画布态为视频/音频添加轻量 inline play 能力（点击封面区域直接播放，小窗模式）。

**优先级**: P3

---

## 四、LinkNode — 链接卡片

### 4.1 Unfurl 加载期间无状态反馈

**文件**: `src/mainview/components/canvas/nodes/LinkNode.tsx`

**问题**: `unfurlStatus === 'loading'` 时，卡片照样显示原始 URL + "Untitled link"。应该有 spinner 或 skeleton。

**建议**: 在标题区域显示 skeleton pulse 动画，host 区域显示 "Loading preview..."。

**优先级**: P0

---

### 4.2 Unfurl 失败后无重试机制

**问题**: `unfurlStatus === 'failed'` 只设置了错误信息，但 UI 上没有「重试」按钮。用户只能删除并重新创建链接卡片。

**建议**: 失败状态下在卡片底部显示 "Preview unavailable · Retry" 可点击链接。

**优先级**: P1

---

### 4.3 imageUrl（Open Graph 图片）在画布态不展示

**问题**: unfurl 抓取了 `imageUrl`，但 `LinkContent` 在非聚焦模式下完全不渲染它。链接卡片失去了最重要的视觉差异化能力。

**建议**: 在画布态卡片标题上方，展示 OG 图片缩略图（类似 AssetNode 的 VideoThumbnail）。

**优先级**: P1

---

### 4.4 faviconUrl 被抓取但从未使用

**问题**: 数据里有 `faviconUrl`，但画布和聚焦模式都用的是 `Globe2` Lucide 图标。

**建议**: 在 host 名称旁展示真实 favicon，加载失败时 fallback 到 Globe2 图标。

**优先级**: P2

---

### 4.5 URL 创建后不可编辑

**问题**: 没有编辑 URL 的入口。用户输错链接只能删掉重建。

**建议**: 在聚焦模式下或右键菜单中增加「Edit URL」选项。

**优先级**: P2

---

## 五、StickyNode — 便签

### 5.1 长文本溢出无滚动

**文件**: `src/mainview/components/canvas/nodes/StickyNode.tsx` (`StickyContent`)

```tsx
<div className="wrap-break-word flex-1 whitespace-pre-wrap text-sm/relaxed">
```

**问题**: 没有 `overflow-y: auto`。文本超出便签高度后会被裁切，无法滚动查看。

**建议**: 添加 `overflow-y-auto custom-scrollbar`。

**优先级**: P1

---

### 5.2 编辑态无视觉区分

**问题**: 进入编辑模式后，除了光标出现外没有任何视觉变化（无边框高亮、无阴影变化）。

**建议**: 编辑态增加 `ring-2 ring-blue-400/30` 或轻微 `shadow-lg` 变化。

**优先级**: P1

---

### 5.3 纯文本，不支持任何格式

**问题**: 便签只有 `contentEditable` 纯文本，不支持粗体、列表、链接。

**建议**: 至少支持 Markdown 即时渲染（输入 `**bold**` 自动变粗），或在便签底部显示格式提示。

**优先级**: P3

---

## 六、FolderNode — 文件夹

### 6.1 三个点图标是纯装饰，没有绑定事件

**文件**: `src/mainview/components/canvas/nodes/FolderNode.tsx`

```tsx
<div aria-hidden="true" className="grid size-7 shrink-0 place-items-center ...">
  <span className="-mt-0.5 text-lg leading-none">⋮</span>
</div>
```

**问题**: 用户会自然点击这三个点，但什么都不会发生。这是一个**交互欺骗**。

**建议**: 绑定 `onClick` 事件，弹出文件夹上下文菜单（打开、重命名、新建子卡片、删除）。

**优先级**: P0

---

### 6.2 没有子项数量 badge

**问题**: PRD 要求封面显示 "3 items"，但 FolderNode 只显示 title + subtitle + footer，没有 item count。

**建议**: 在 title 旁显示 `{children.length} items` badge，或在文件夹翻页角区域显示数字。

**优先级**: P1

---

### 6.3 文件夹翻页角始终紫色

**问题**: 不管用户设置什么颜色，文件夹的 tab/翻页角永远是紫色渐变。多个文件夹在视觉上缺乏区分度。

**建议**: 翻页角颜色跟随 `data.color` 变化，或至少提供 3-4 种预设色。

**优先级**: P2

---

### 6.4 subtitle 超长被截断无 tooltip

```tsx
<p className="mt-2 truncate font-medium text-sm text-white/92">{data.subtitle}</p>
```

**建议**: 添加 `title={data.subtitle}` 原生 tooltip。

**优先级**: P2

---

## 七、GroupNode — 分组

### 7.1 拖拽手柄 "⋮⋮" 始终显示

**文件**: `src/mainview/components/canvas/nodes/GroupNode.tsx`

```tsx
<span className="text-gray-300 text-xs">⋮⋮</span>
```

**问题**: 应该只在 hover 或 selected 状态下显示，平时是视觉噪音。

**建议**: 包裹在 `opacity-0 group-hover:opacity-100 transition-opacity` 中。

**优先级**: P1

---

### 7.2 没有子节点数量显示

**问题**: 用户无法快速了解一个 Group 里有多少元素。

**建议**: 在 label 旁显示 `({childCount})` 或小 badge。

**优先级**: P2

---

### 7.3 双击 label 编辑缺乏可发现性

**问题**: 唯一的编辑入口是双击 label 文本，但没有任何视觉提示。

**建议**: hover 时在 label 旁显示小铅笔图标。

**优先级**: P2

---

## 八、TiptapEditor — 富文本编辑器

### 8.1 没有格式工具栏 ⚠️ 最高优先级

**文件**: `src/mainview/components/editor/TiptapEditor.tsx`

**问题**: 用户进入聚焦模式后看到一个几乎空白的编辑区域，没有任何格式化按钮。不知道可以用 `##` 写标题、`- [ ]` 写任务列表。

**建议** (三选一):
1. **浮动工具栏 (BubbleMenu)**: 选中文本时弹出加粗/斜体/链接/代码等按钮（推荐，最轻量）
2. **固定顶部工具栏**: 在编辑器顶部放置常驻格式栏
3. **`/` 命令面板**: 输入 `/` 弹出块类型选择（Heading, List, Code, Image...）

**优先级**: **P0**

---

### 8.2 不支持图片插入

**问题**: `@tiptap/extension-image` 已安装配置，但没有 UI 入口——没有图片按钮、不支持拖放图片到编辑器、不支持粘贴图片。

**建议**:
- 在 BubbleMenu 或 `/` 命令中添加 Image 选项
- 支持粘贴剪贴板图片
- 支持拖放图片文件到编辑器区域

**优先级**: P1

---

### 8.3 代码块没有语法高亮

```tsx
codeBlock: { HTMLAttributes: { class: 'prose-code' } }
```

**问题**: 只加了一个 CSS class，没有接入 Prism/Lowlight/Shiki 等语法高亮库。

**建议**: 安装 `lowlight` + `@tiptap/extension-code-block-lowlight`，支持常见语言高亮。

**优先级**: P2

---

### 8.4 标题是普通 `<input>`

```tsx
<input className="... font-bold text-4xl ..." placeholder="Untitled" value={titleValue} />
```

**问题**: 标题不支持多行、不支持富文本。输入长标题会被截断。

**建议**: 改为 `contentEditable` div，保持单行但允许自然展开，与正文编辑器视觉一致。

**优先级**: P2

---

### 8.5 缺少的功能清单

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 格式工具栏 | ❌ 缺失 | P0 |
| 图片插入 | ❌ 缺失（extension 已安装） | P1 |
| 表格 | ❌ 缺失（需安装 extension） | P2 |
| 代码语法高亮 | ❌ 缺失 | P2 |
| 字数/词数统计 | ❌ 缺失 | P3 |
| 查找替换 | ❌ 缺失 | P3 |
| `[[双向链接]]` | ❌ 缺失（PRD 远期） | P4 |

---

## 九、ContextMenu — 右键菜单

### 9.1 画布右键菜单缺少「新建」入口

**文件**: `src/mainview/components/canvas/ContextMenu.tsx`

```tsx
const getCanvasItems = (): MenuItem[] => [
  { id: 'paste', ... },
  { id: 'reset-zoom', ... },
];
```

**问题**: 画布空白处右键只有「粘贴」和「重置缩放」。PRD 明确要求「新建卡片/便签/Group」。

**建议**: 在画布右键菜单顶部添加「New Card」「New Sticky」「New Group」等选项。

**优先级**: **P0**

---

### 9.2 "Move to Library" 未国际化

```tsx
{ id: 'detach-from-canvas', label: 'Move to Library', icon: BookOpen },
```

**问题**: 直接硬编码英文，中文环境下不翻译。

**建议**: 使用 `m.menu_move_to_library()` 并在 `messages/en.json` 和 `messages/zh.json` 中添加对应翻译。

**优先级**: P1

---

### 9.3 不支持多选批量操作

**问题**: 可以框选多个节点，但右键菜单只对单个节点生效。没有批量删除、批量改色、批量复制。

**建议**: 当 `selectedNodes.length > 1` 时，显示批量操作菜单：Delete N items, Copy N items, Change color。

**优先级**: P2

---

### 9.4 缺少「复制为 Markdown」选项

**问题**: 无法从右键菜单把卡片内容复制为 Markdown 文本。

**建议**: 在卡片右键菜单中添加 "Copy as Markdown"，将标题 + 正文写入剪贴板。

**优先级**: P3

---

## 十、SearchDialog — 搜索

### 10.1 搜索结果无结果总数

**问题**: 返回多个结果时，用户不知道总共有多少条匹配。

**建议**: 在结果列表顶部或底部显示 `N results for "query"`。

**优先级**: P2

---

### 10.2 没有搜索历史

**问题**: 关闭搜索后历史清空，再次打开是空白输入框。

**建议**: 用 `localStorage` 保存最近 5-10 条搜索记录，打开搜索时显示「Recent searches」。

**优先级**: P3

---

### 10.3 没有按类型筛选

**问题**: 无法「只搜文件夹」或「只搜链接」。

**建议**: 在搜索框下方添加类型过滤 chips: `All | Notes | Folders | Links | Images`。

**优先级**: P3

---

## 十一、ViewSwitcher — 画布切换器

### 11.1 模板子菜单只有 Kanban

**问题**: 其他 8 个内置模板需要跳转到 `/templates` 页面。应该在子菜单中列出全部。

**建议**: 将 `quick-start`、`brainstorm-mindmap`、`weekly-planner` 等高频模板加入子菜单。

**优先级**: P2

---

### 11.2 新建画布自动命名为 "Canvas N"

**问题**: 没有重命名弹窗，用户必须事后手动改名。

**建议**: 创建后自动进入 inline rename 模式（与画布列表中的 rename 逻辑复用）。

**优先级**: P2

---

## 十二、DetachedNotesSidebar — 游离笔记侧边栏

### 12.1 只显示 card 和 image 类型

**文件**: `src/mainview/components/canvas/DetachedNotesSidebar.tsx`

```tsx
if ((n.type === 'card' || n.type === 'image') && ...data.detached)
```

**问题**: Link、Asset 类型的游离笔记在侧边栏中不可见。

**建议**: 扩展为 `['card', 'image', 'link', 'asset'].includes(n.type)`。

**优先级**: P2

---

### 12.2 没有搜索或筛选

**问题**: 当游离笔记很多时，只能逐个滚动查找。

**建议**: 在侧边栏顶部添加简单的 filter input。

**优先级**: P3

---

## 十三、FocusedView — 聚焦模式

### 13.1 `any` 类型 props

**文件**: `src/mainview/components/canvas/FocusedView.tsx`

```tsx
export const FocusedView = ({ node, onClose }: any) => {
```

**建议**: 定义 `FocusedViewProps` 接口。

**优先级**: P2

---

### 13.2 没有「下一条/上一条」导航

**问题**: 无法用 `←` / `→` 键在相邻卡片间切换聚焦。每次都必须退出 → 选择另一张 → 再进入。

**建议**: 在返回按钮旁添加 `<` / `>` 导航按钮，或支持 `Cmd+←` / `Cmd+→` 快捷键。

**优先级**: P2

---

### 13.3 没有卡片位置面包屑

**问题**: 进入聚焦模式后，只有返回箭头。不知道当前卡片属于哪个 Group/Folder。

**建议**: 在返回按钮旁显示 `{FolderName} > {CardTitle}` 面包屑。

**优先级**: P3

---

### 13.4 点击遮罩关闭无保存确认

**问题**: 点击黑色遮罩区域直接关闭聚焦模式，如果编辑器中有未保存的修改（debounce 未到期），可能丢失。

**建议**: 检测是否有未保存修改，有则显示 "Discard changes?" 确认。

**优先级**: P2

---

## 十四、NotePreview — 画布态预览

### 14.1 预览区域不可点击进入聚焦

**问题**: 用户自然会点击预览内容区域想进入编辑，但只有卡片的外层 wrapper 有 click 事件。

**建议**: 预览区域点击事件冒泡到卡片层即可（当前已是如此，但需要确认没有 `stopPropagation` 阻断）。

**优先级**: P2

---

### 14.2 图片最大高度 8rem 太小

**文件**: `src/mainview/index.css`

```css
.note-preview :where(img) { max-height: 8rem; }
```

**问题**: 在 350px 宽的卡片里，8rem (128px) 的图片非常小。

**建议**: 提升为 `12rem` 或 `10rem`。

**优先级**: P2

---

### 14.3 溢出渐隐无「展开」提示

```css
mask-image: linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%);
```

**问题**: 内容被渐隐遮罩截断，但没有 "...read more" 暗示下面还有内容。

**建议**: 在渐隐区域叠加一行 "Read more ▸" 或双击提示文字。

**优先级**: P2

---

## 十五、全局/架构级问题

### 15.1 `src/bun/index.ts` 1178 行

**问题**: 所有 RPC handler 注册在一个文件里。每加一个功能都要改这个文件。

**建议**: 按业务域拆分为 `handlers/canvas.ts`、`handlers/settings.ts`、`handlers/template.ts`。

**优先级**: P2

---

### 15.2 主路由 `index.tsx` 超过 800 行

**问题**: 画布页面的全部逻辑集中在一个组件中。

**建议**: 提取 `useCanvasDragDrop`、`useCanvasExport`、`useCanvasInit` 等自定义 hooks。

**优先级**: P2

---

### 15.3 节点间 shadow 样式不统一

| 节点类型 | 默认 shadow | Hover shadow |
|----------|-------------|--------------|
| CardNode | `shadow-card` | 无 |
| ImageNode | `shadow-sm` | `shadow-xl` |
| AssetNode | `shadow-card` | `shadow-card-hover` |
| LinkNode | `shadow-card` | `shadow-card-hover` |
| StickyNode | `shadow-card` | 无 |

**建议**: 统一为 `shadow-card` → hover `shadow-card-hover`，所有节点类型一致。

**优先级**: P2

---

### 15.4 深色主题覆盖不完整

**已知不兼容区域**:
- Checklist checkbox（黑底黑字）
- Group label 文字颜色
- 部分 placeholder 文本颜色
- FolderNode 翻页角（固定紫色渐变）

**建议**: 逐组件审查 `dark:` variant 使用。

**优先级**: P2

---

### 15.5 没有 onboarding / 引导流程

**问题**: 首次打开应用 seed 了 `quick-start` 模板，但没有任何浮层引导。

**建议**: 在首次启动时显示 3-4 步引导浮层：
1. 「拖拽平移画布」
2. 「双击卡片进入编辑」
3. 「右键创建新内容」
4. 「Cmd+K 搜索」

**优先级**: P2

---

## 优先级汇总

### P0 — 必须立即修复（影响核心可用性）

| # | 问题 | 组件 |
|---|------|------|
| 8.1 | 编辑器无格式工具栏 | TiptapEditor |
| 6.1 | Folder 三点装饰不可点击（交互欺骗） | FolderNode |
| 9.1 | 画布右键菜单缺少「新建」入口 | ContextMenu |
| 4.1 | Link unfurl 加载期间无状态反馈 | LinkNode |

### P1 — 高优先级（影响产品专业度）

| # | 问题 | 组件 |
|---|------|------|
| 1.2 | Mock 饼图遗留代码 | CardNode |
| 1.3 | Checklist checkbox 深色主题不可见 | CardNode |
| 2.4 | 图片标题无法从画布编辑 | ImageNode |
| 4.2 | Link unfurl 失败无重试 | LinkNode |
| 4.3 | Link OG 图片在画布态不展示 | LinkNode |
| 5.1 | Sticky 长文本溢出无滚动 | StickyNode |
| 5.2 | Sticky 编辑态无视觉区分 | StickyNode |
| 6.2 | Folder 无子项数量 badge | FolderNode |
| 7.1 | Group 拖拽手柄始终显示 | GroupNode |
| 8.2 | 编辑器不支持图片插入 | TiptapEditor |
| 9.2 | "Move to Library" 未国际化 | ContextMenu |

### P2 — 中优先级（体验打磨）

涵盖：类型安全、dark mode 统一、shadow 统一、onboarding、搜索增强、编辑器增强、各节点细节优化等。

### P3 — 低优先级（锦上添花）

涵盖：搜索历史、类型筛选、便签格式支持、画布态视频播放、面包屑导航等。
