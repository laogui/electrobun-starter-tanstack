# 画布卡片缩略图重构方案

## 背景与目标

当前画布上各类节点卡片（AssetNode、ImageNode、LinkNode 等）展示了大量文件元信息（文件名、大小、时长、MIME 类型、波形图、文件列表等），导致卡片视觉信息过载。

**目标：** 简化缩略图卡片展示，让画布整体更干净；详细信息改为鼠标悬浮时才展示。

---

## 设计原则

1. **画布卡片只展示最关键的视觉信息**：缩略图 + 文件类型标识
2. **详细信息通过 hover tooltip/popover 展示**：文件名、大小、时长、MIME 类型等
3. **每种文件类型有辨识度高的缩略图**：即使无预览图也能快速识别文件类型
4. **保持 focused（聚焦/展开）视图不变**：详细信息在打开查看时仍完整展示

---

## 各类型节点重构方案

### 1. 视频节点 (Video)

| 当前 | 重构后 |
|------|--------|
| 视频缩略帧 + Play 按钮 + 时长标签 + 标题 + 文件大小 | 视频缩略帧 + Play 按钮 + 左上角类型标识 "VIDEO" |

- **卡片面**：保留视频缩略帧（已有 `createVideoThumbnail` 支持），叠加半透明 Play 图标，左上角小型 badge 显示 "VIDEO"
- **Hover 展示**：文件名、时长、文件大小、MIME 类型
- **无缩略图时**：深色背景 + FileVideo 图标 + "VIDEO" badge

### 2. 音频节点 (Audio)

| 当前 | 重构后 |
|------|--------|
| 波形图 + 时长 + 文件图标 + 标题 + 大小 | 简化波形条纹背景 + "AUDIO" 类型标识 |

- **卡片面**：保留简化版波形作为背景装饰（只作为视觉纹理，不需要精确），居中 FileAudio 图标 + "AUDIO" badge
- **Hover 展示**：文件名、时长、文件大小
- **备选方案**：如觉得波形仍复杂，可去掉波形只保留图标和类型标签

### 3. PDF 文档

| 当前 | 重构后 |
|------|--------|
| 折角纸页图形 + "PDF" badge + "PDF document" 文字 + 标题 | 缩略图区域 + "PDF" 类型标识 |

- **卡片面**：保留现有 FilePageGlyph 折角纸页样式（辨识度高），只显示 "PDF" badge，去掉底部 "PDF document" 文字和标题
- **缩略图方案探索**：
  - 方案 A：使用 `pdf.js` 渲染第一页为 canvas 截图（依赖较重，约 300KB）
  - 方案 B：在 bun 侧调用系统工具 `pdftoppm` 或 `sips`（macOS）生成首页预览
  - 方案 C（推荐先期）：保持当前折角纸页占位图，后续迭代增加真实预览
- **Hover 展示**：文件名、页数（如可获取）、文件大小

### 4. Word/Office 文档

| 当前 | 重构后 |
|------|--------|
| 通用文件卡片 + 文件名 + 扩展名 badge | 文档图形 + 扩展名 badge |

- **卡片面**：复用 FilePageGlyph 折角纸页 + 扩展名 badge（DOC/DOCX/XLS/PPT 等），不同文档类型用不同颜色的 badge
- **缩略图方案探索**：
  - 方案 A：使用 `libreoffice --headless --convert-to png` 在 bun 侧生成预览
  - 方案 B：解压 OOXML 取内嵌缩略图（docx/pptx 的 `docProps/thumbnail.jpeg`）
  - 方案 C（推荐先期）：保持折角纸页占位，badge 颜色区分类型（Word=蓝色、Excel=绿色、PPT=橙色）
- **Hover 展示**：文件名、文件大小、文件类型

### 5. 图片节点 (Image)

| 当前 | 重构后 |
|------|--------|
| 图片缩略图占满卡片 + 底部渐变标题 | 图片缩略图占满卡片（无变化） |

- **卡片面**：图片类型本身就是最好的缩略图，保持不变。去掉底部标题叠加层
- **Hover 展示**：文件名、尺寸（宽×高）、文件大小
- **说明**：ImageNode 当前方案已经很简洁，基本无需大改

### 6. 压缩包 (Archive)

| 当前 | 重构后 |
|------|--------|
| 文件列表 + 条目数 + 标题 + 大小 | FileArchive 图标 + "ZIP" badge |

- **卡片面**：去掉文件列表展示，只显示 FileArchive 图标 + 条目数 badge（如 "12 items"）
- **Hover 展示**：文件名、条目数、前几个文件名、解压大小

### 7. 文本文件 (Text/Code)

| 当前 | 重构后 |
|------|--------|
| 代码预览摘要 + 标题 + 大小 | 代码预览摘要（前 3-4 行）+ "TXT"/"CODE" badge |

- **卡片面**：保留少量代码/文本预览行（作为视觉缩略），但减少行数，左上角显示类型 badge
- **Hover 展示**：文件名、MIME 类型、文件大小

### 8. 通用文件 (Unknown)

| 当前 | 重构后 |
|------|--------|
| 折角纸页 + 扩展名 badge + 标题 + 大小 | 折角纸页 + 扩展名 badge |

- **卡片面**：保留 FilePageGlyph + 扩展名 badge，去掉标题和文件大小
- **Hover 展示**：文件名、MIME 类型、文件大小

---

## Hover 信息面板设计

使用统一的 `AssetHoverCard` 组件（基于 Radix Tooltip 或自定义 Popover）：

```
┌─────────────────────────────┐
│ 📄 project-report.pdf       │
│ ─────────────────────────── │
│ 类型：PDF                    │
│ 大小：2.4 MB                 │
│ 时长：3:42（仅媒体）          │
│ 路径：attachments/xxx.pdf    │
└─────────────────────────────┘
```

- 延迟 300ms 后显示，避免快速划过时闪烁
- 在节点上方或下方弹出，自动避让画布边界
- 暗色主题适配

---

## 实施步骤

### Phase 1：简化卡片面信息（优先）

1. 修改 `AssetNode.tsx` 的 `AssetContent` 非 focused 分支：
   - 去掉标题 `<h3>` 展示
   - 去掉 MetadataGrid 在卡片面的引用
   - 各 Thumbnail 组件内去掉文字标签，只保留视觉预览 + 类型 badge
2. 修改 `ImageNode.tsx`：
   - 去掉底部标题渐变层（非 focused 时）
3. 创建统一的 `TypeBadge` 组件：左上角半透明文件类型标签

### Phase 2：Hover 信息面板

1. 创建 `AssetHoverCard` 组件
2. 在各 Node 的最外层 wrapper 上挂载 hover 事件
3. 通过 portal 渲染信息面板，确保不被 ReactFlow 的 transform 影响

### Phase 3：缩略图增强（后续迭代）

1. PDF 首页预览：bun 侧集成轻量 PDF 渲染
2. Office 文档：尝试提取内嵌缩略图（OOXML 的 thumbnail.jpeg）
3. 视频：确保 `createVideoThumbnail` 覆盖更多编码格式

---

## 涉及文件

| 文件路径 | 改动说明 |
|---------|---------|
| `src/mainview/components/canvas/nodes/AssetNode.tsx` | 简化卡片面展示逻辑，提取 Hover |
| `src/mainview/components/canvas/nodes/ImageNode.tsx` | 去除卡片面标题层 |
| `src/mainview/components/canvas/nodes/LinkNode.tsx` | 简化卡片信息 |
| `src/mainview/components/canvas/nodes/_shared/TypeBadge.tsx` | 新建：统一类型标签组件 |
| `src/mainview/components/canvas/nodes/_shared/AssetHoverCard.tsx` | 新建：Hover 信息面板 |
| `src/mainview/lib/thumbnail.ts` | 可能扩展：PDF/Office 缩略图 |
| `src/bun/preview.ts`（如存在） | 新建/扩展：bun 侧文档预览生成 |

---

## 备注

- 所有改动不影响 focused（聚焦展开）视图，仅针对画布上小卡片的缩略表现
- zoomed-out（极缩小）视图已有骨架化简化逻辑，无需额外处理
- 建议先做 Phase 1 看效果，再决定 Phase 2/3 的优先级
