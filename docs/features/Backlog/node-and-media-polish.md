# 节点组件与媒体体验优化

> 迁移自 `docs/ux-optimization-audit.md`（2026-05-26 审计）
> 仅保留经代码核对后确认仍未实现的 P2/P3 打磨项

---

## ImageNode — 图片卡片

### 原生 img 加载错误兜底

**文件**: `src/mainview/components/canvas/nodes/ImageNode.tsx`
**优先级**: P2

RPC 层的 `isLazyLoading` / `lazyLoadFailed` 已覆盖了 attachment 获取流程，但 `<img>` 元素本身没有 `onLoad` / `onError` 处理器。当 data URL 合法但浏览器解码失败时，用户会看到破损图片而无恢复入口。

**建议**: 给 `<img>` 绑定原生事件，解码失败时切到 `lazyLoadFailed` 状态展示 Retry。

---

## AssetNode — 文件/视频/音频卡片

### 普通文件聚焦模式无内容预览

**文件**: `src/mainview/components/canvas/nodes/AssetNode.tsx` (FocusedView 分支)
**优先级**: P2（PDF 为 P1）

非音视频文件的聚焦视图只显示 Type / Size / Duration / File 四格 metadata + "Open file" 按钮，没有任何文件内容预览。

**建议**:
- PDF: 接入 PDF 页面预览（参见 PRD TODO-5）
- 文本文件: 显示前 N 行内容
- 其他格式: 保持当前 metadata 视图

### 音频 waveform 无真实数据时使用随机高度

**文件**: `src/mainview/components/canvas/nodes/AssetNode.tsx` (`AudioThumbnail`)
**优先级**: P2

```tsx
Array.from({ length: 24 }, (_, index) => index)
// → Math.max(18, (0.25 + value * 0.75) * 44)
```

看起来是「假波形」，用户发现后会感觉被欺骗。

**建议**: 没有真实 waveform 数据时，使用均匀高度的静态条形，或改为简单的音符图标 + 时长。

### 画布态视频/音频没有内联播放入口

**优先级**: P3

必须进入聚焦模式才能播放。画布上只显示封面图 + 播放按钮图标，但点击播放按钮只会打开聚焦模式而非直接播放。

**建议**: 在画布态为视频/音频添加轻量 inline play 能力（点击封面区域直接播放，小窗模式）。

---

## LinkNode — 链接卡片

### URL 创建后不可编辑

**优先级**: P2

没有编辑 URL 的入口。用户输错链接只能删掉重建。

**建议**: 在聚焦模式下或右键菜单中增加「Edit URL」选项。

---

## FolderNode — 文件夹

### 文件夹翻页角始终紫色

**优先级**: P2

不管用户设置什么颜色，文件夹的 tab/翻页角永远是紫色渐变。多个文件夹在视觉上缺乏区分度。

**建议**: 翻页角颜色跟随 `data.color` 变化，或至少提供 3-4 种预设色。

---

## GroupNode — 分组

### 没有子节点数量显示

**优先级**: P2

用户无法快速了解一个 Group 里有多少元素。

**建议**: 在 label 旁显示 `({childCount})` 或小 badge。

### 双击 label 编辑缺乏可发现性

**优先级**: P2

唯一的编辑入口是双击 label 文本，但没有任何视觉提示。

**建议**: hover 时在 label 旁显示小铅笔图标。

---

## StickyNode — 便签

### 纯文本，不支持任何格式

**优先级**: P3

便签只有 `contentEditable` 纯文本，不支持粗体、列表、链接。

**建议**: 至少支持 Markdown 即时渲染（输入 `**bold**` 自动变粗），或在便签底部显示格式提示。

---

## NotePreview — 画布态预览

### 预览区域不可点击进入聚焦

**优先级**: P2

用户自然会点击预览内容区域想进入编辑。需确认预览区域点击事件能冒泡到卡片层（没有 `stopPropagation` 阻断）。

### 图片最大高度 8rem 太小

**文件**: `src/mainview/index.css`
**优先级**: P2

```css
.note-preview :where(img) { max-height: 8rem; }
```

在 350px 宽的卡片里，8rem (128px) 的图片非常小。

**建议**: 提升为 `12rem` 或 `10rem`。

### 溢出渐隐无「展开」提示

**优先级**: P2

```css
mask-image: linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%);
```

内容被渐隐遮罩截断，但没有 "...read more" 暗示下面还有内容。

**建议**: 在渐隐区域叠加一行 "Read more ▸" 或双击提示文字。
