# 多类型画布内容与预览管线方案

## 1. 背景

当前画布已经支持几类基础节点：

- `card`：文本笔记 / checklist 等卡片内容
- `sticky`：便签
- `image`：图片附件
- `folder`：内容集合
- `group`：空间分组

如果继续支持视频、音频、普通文件、链接等类型，真正的难点不只是新增几个 React Flow node type，而是要建立一条稳定的 **内容识别、缩略图生成、轻量展示、放大解析、持久化与恢复** 管线。

否则每新增一种类型，都需要重复修改：

- 创建菜单
- 拖拽上传
- 节点渲染
- 聚焦视图
- folder / group 交互
- manifest 持久化
- 搜索
- 导出 / preview-only 渲染

这会让画布类型系统越来越分散。

---

## 2. 核心结论

推荐采纳“统一资源节点”的方向，但不要把所有东西都塞进同一个概念里。更稳的边界是：

1. `asset`：本地附件节点，覆盖视频、音频、PDF、普通文件等本地资源。
2. `link`：外部链接节点，覆盖网页 URL、资源链接、未来的 rich link card。

短期不强制迁移现有 `image` 节点。第一版可以让 `image` 继续工作，新类型走 `asset` / `link`。等新管线稳定后，再评估是否把 `image` 收敛成 `asset.kind = "image"`。

不推荐分别从零复制一套 `VideoNode`、`AudioNode`、`FileNode`。这些类型的上传、保存、hydrate、只读预览、导出、删除、folder / group 交互高度相似，应通过 `AssetNode` 共享。

核心原则：

> 画布上的节点是识别用的轻量预览；聚焦视图才负责完整解析和播放。

推荐的结构方向：

```txt
CreateMenu / Drop / Paste
  ↓
createNode(kind, options)
  ↓
node registry / spec map
  ↓
React Flow node component
  ↓
AssetNode / LinkNode renderer
  ↓
attachments/ local files + manifest metadata
```

开发顺序需要先补一层地基：先做 `CanvasNodeKind` / `AssetKind` / node spec map / predicates / manifest 序列化边界，让现有节点行为保持不变；再做 `link` 和 `asset.kind = "file"`，把节点模型、创建入口、持久化和 focused view 跑通；最后再接入 `video` / `audio` 播放和缩略图。

第一阶段的首个 PR 不应改变产品行为。它只负责把当前散落的节点类型、默认尺寸、创建默认数据、`card || image` 判断收敛到共享模块，为后续 `link` / `asset` 接入留出稳定接口。

---

## 3. 目标与非目标

### 3.1 目标

1. 支持把视频、音频、文件、链接放到画布上。
2. 每种内容在画布上都有可识别的缩略态。
3. 点击 / 双击放大后，能根据稳定的数据模型进入对应解析视图。
4. manifest 不保存大体积 base64，只保存文件引用、缩略图引用和元数据。
5. 新类型能复用现有 undo / redo、持久化、folder / group、搜索的架构。
6. 用 registry / spec map 收敛节点尺寸、默认数据、创建逻辑和渲染组件。
7. 用 `isContentNode()` 等工具函数替代散落的 `'card' | 'image'` 硬编码判断。
8. 在新增类型前先完成 foundation PR，确保现有 card / image / sticky / folder / group 行为不变。

### 3.2 非目标

1. MVP 不做所有文件格式的完整预览。
2. MVP 不做在线链接的强依赖抓取，链接 unfurl 失败时必须能退化显示。
3. MVP 不把每种内容做成完整编辑器。
4. MVP 不做视频转码、音频转码、OCR、字幕识别等重处理。
5. MVP 不迁移历史 `image` 节点。

---

## 4. 现状接入点

当前需要扩展的关键位置：

- `src/mainview/lib/canvasConstants.ts`
  - 注册 `nodeTypes`
  - 注册 `readOnlyNodeTypes`
  - 定义默认尺寸常量
  - 后续可从 node registry 派生这些配置，减少重复维护

- `src/mainview/store/canvasStore.ts`
  - 扩展 `createNode` 类型
  - 扩展 `buildNewNodeSpec`
  - 或将 `buildNewNodeSpec` 替换为 registry / spec map
  - 处理 folder child 转回 canvas 的节点类型
  - 处理 delete / copy / paste / undo 的数据形态

- `src/mainview/components/canvas/CreateMenu.tsx`
  - 打开当前 disabled 的 `file`
  - 增加 link 入口
  - 后续再增加 video / audio 入口，或使用统一“Add content”

- `src/mainview/hooks/useContextMenu.ts`
  - 右键创建 action 应走统一 `CanvasNodeKind`
  - 避免菜单 action 和 `createNode` 类型各维护一份 union

- `src/mainview/routes/index.tsx`
  - 扩展 React Flow `onDrop`
  - 支持外部文件拖入、链接拖入、文本 URL 拖入

- `src/mainview/components/canvas/FocusedView.tsx`
  - 新增 `AssetFocusedView`
  - 新增 `LinkFocusedView`

- `src/bun/index.ts`
  - 泛化 `saveAttachment`
  - 泛化 `loadAttachment`
  - 保存 manifest 时去掉运行时 URL，只保留文件引用
  - 加载 manifest 时只 hydrate 轻量缩略图或缺失状态，完整附件在 focused view / open action 中懒加载

- `src/mainview/lib/canvasUtils.ts`
  - 扩展 `GROUP_CHILD_TYPES`
  - 扩展 `FOLDER_CHILD_TYPES`
  - 扩展 document mode 的树结构时再纳入 asset / link
  - 抽出 `isContentNode()`、`isAssetNode()`、`isDocumentNode()` 等判断函数

- `src/mainview/lib/sanitize.ts`
  - 递归清理 `previewUrl`、`thumbnailUrl` 等运行时字段
  - folder child 中的 asset / link 也必须经过同一套 manifest 序列化边界
  - 当前实现只清理 top-level `data`，folder child 完全没经过 sanitize；Phase 0 必须补

额外散落点（与方案核心列表平级，应在 Phase 0 一起收敛，否则 `asset` / `link` 接入时仍会出现行为不一致）：

- `src/mainview/hooks/useNodeCreation.ts`
  - 复制了一份 `'card' | 'checklist' | 'image' | 'folder' | 'group' | 'sticky'` union
  - 应改为引用共享 `CanvasNodeKind`

- `src/mainview/hooks/useNodeDrag.ts`
  - 本地常量 `CONTENT_TYPES = new Set(['card', 'image', 'sticky'])`
  - 应改走 `isGroupChildNode()` / `isFolderChildNode()` / `isCanvasContentNode()`

- `src/mainview/lib/resolvePlacement.ts`
  - 重复定义了第二份 `GROUP_CHILD_TYPES`
  - 应统一从 `canvasNodePredicates` 导入，避免两份 set 漂移

- `src/mainview/lib/collision.ts`
  - 按 `node.type` switch 返回 `CARD_W` / `IMAGE_W` / `FOLDER_W` / `STICKY_W` / 默认 group 尺寸
  - 应改为消费 `getNodeSpec(type).size`，registry 是单一尺寸来源

- `src/mainview/lib/canvasUtils.ts`
  - `DocumentTreeNode.kind` 与常量 `DOC_TREE_TYPES` 都硬编码 `'folder' | 'card' | 'image'`
  - Phase 0 不扩展 document mode，但 `DOC_TREE_TYPES` 应改走 predicate；`kind` union 等到 Phase 4 再扩

- `src/mainview/lib/searchTypes.ts`
  - `SearchResultKind` 已含 `'sticky' | 'folder' | 'group' | 'image' | 'card' | 'edge' | 'view'`
  - Phase 0 不动；Phase 4 再补 `'asset'` / `'link'`

---

## 5. 数据模型

### 5.1 Asset 节点

`asset` 覆盖本地文件类内容。

```ts
type AssetKind = 'video' | 'audio' | 'file';

interface AssetNodeData {
  kind: AssetKind;
  title: string;
  fileName: string;
  mimeType: string;
  size?: number;
  duration?: number;

  // 持久化字段
  attachmentFile?: string;
  thumbnailFile?: string;

  // 运行时 hydrate 字段，不应写入 manifest
  previewUrl?: string;
  thumbnailUrl?: string;

  // 音频等类型可选元数据
  waveform?: number[];

  color: string;
}
```

说明：

- MVP 不把 `link` 放进 `AssetKind`。链接没有本地附件生命周期，应单独建模。
- MVP 也不迁移现有 `image`。图片未来可以并入 `asset.kind = "image"`，但不作为第一阶段目标。
- MVP 不把 PDF 提升为独立 `AssetKind`。PDF 先作为 `kind: "file"` + `mimeType: "application/pdf"` 处理；等要做 PDF 首页缩略图或内嵌 PDF viewer 时，再评估是否把 PDF 提升为一等类型。
- 如果后续迁移图片，应先实现兼容读取：旧 manifest 的 `type: "image"` 继续渲染，新创建的图片才逐步走 `type: "asset"`。

### 5.2 Link 节点

`link` 覆盖外部 URL。

```ts
interface LinkNodeData {
  url: string;
  title: string;
  description?: string;
  siteName?: string;
  faviconUrl?: string;
  imageUrl?: string;

  // link preview 抓取状态
  unfurlStatus?: 'idle' | 'loading' | 'ready' | 'failed';
  unfurlError?: string;

  color: string;
}
```

### 5.3 Manifest 存储原则

manifest 里只保存小而稳定的数据：

- `attachmentFile`
- `thumbnailFile`
- `mimeType`
- `fileName`
- `size`
- `duration`
- `waveform`
- `url`
- `title`
- `description`

不保存：

- 原始文件 base64
- 大图 data URL
- 视频 data URL
- 音频 data URL
- 运行时 object URL

### 5.4 CanvasNodeKind 与创建选项

建议把当前散落在 `canvasStore`、`CreateMenu`、`useNodeCreation`、`useContextMenu` 里的节点 union 收敛为共享类型。

```ts
type CanvasNodeKind =
  | 'card'
  | 'checklist'
  | 'sticky'
  | 'folder'
  | 'group'
  | 'asset'
  | 'link';

type CreateAssetOptions = {
  assetKind: AssetKind;
  file?: File;
  sourcePath?: string;
};

type CreateLinkOptions = {
  url?: string;
};
```

菜单可以继续显示 `File`、`Video`、`Audio`、`Link`，但内部创建时应收敛为：

```ts
createNode('asset', { assetKind: 'file', file });
createNode('asset', { assetKind: 'video', file });
createNode('asset', { assetKind: 'audio', file });
createNode('link', { url });
```

`file` 适合小文件和浏览器拖拽场景；`sourcePath` 是后续给主进程复制大文件预留的路径，避免 renderer 为大视频 / 音频长期持有完整 base64。

推荐的 `classifyFile()` 与 `getAssetDisplayTitle()` 签名（Phase 0 落地）：

```ts
interface ClassifyFileInput {
  name: string;
  type?: string;
  size?: number;
}

interface ClassifyFileResult {
  kind: AssetKind;
  mimeType: string;
  isPdf: boolean;
}

function classifyFile(input: File | ClassifyFileInput): ClassifyFileResult;

function getAssetDisplayTitle(
  data: Pick<AssetNodeData, 'title' | 'fileName' | 'mimeType'>
): string;
```

约定：

- `classifyFile()` 优先看 MIME，回退到扩展名；未知一律归 `file`，但保留原 MIME 字符串。
- PDF 在 MVP 不是独立 `AssetKind`，由 `isPdf` 标记，便于后续 PDF 首页缩略图分支。
- `getAssetDisplayTitle()` 的回退顺序为 `title` → `fileName` → MIME 友好名 → `'Untitled'`。

### 5.5 Node registry / spec map

当前 `buildNewNodeSpec()` 使用 switch，`nodeTypes`、`readOnlyNodeTypes`、创建菜单和右键菜单也各自维护映射。建议先做一层轻量 registry，不需要一开始做成插件系统。

```ts
interface CanvasNodeSpec {
  type: CanvasNodeKind;
  size: { width: number; height: number };
  defaultData: () => Record<string, unknown>;
  canEnterGroup: boolean;
  canEnterFolder: boolean;
}

const CANVAS_NODE_SPECS: Record<CanvasNodeKind, CanvasNodeSpec> = {
  asset: {
    type: 'asset',
    size: { width: 350, height: 260 },
    defaultData: () => ({
      kind: 'file',
      title: '',
      fileName: '',
      mimeType: 'application/octet-stream',
      color: '#FFFFFF',
    }),
    canEnterGroup: true,
    canEnterFolder: true,
  },
  // ...
};
```

第一步可以只让 `buildNewNodeSpec()` 从 registry 读取尺寸和默认数据；后续再从 registry 派生 `nodeTypes`、`readOnlyNodeTypes`、菜单项和 document mode 支持矩阵。

Phase 0 不要顺手把 `nodeTypes` / `readOnlyNodeTypes` 改成 spec 派生；这两个对象会被 React Flow 直接用作组件注册，自动派生需要再加一层稳定引用与 React.memo 配合，超出 foundation PR 的范围。

---

## 6. 内容生命周期

推荐统一为以下管线：

```txt
用户拖入 / 粘贴 / 创建
  ↓
识别内容类型
  ↓
asset: 保存原始资源到 attachments/
link: 规范化 URL，生成基础 link metadata
  ↓
提取元数据
  ↓
生成缩略图 / 预览摘要
  ↓
创建 canvas node
  ↓
manifest 保存轻量引用
  ↓
下次打开时 hydrate metadata / thumbnail / missing 状态
  ↓
画布缩略态渲染
  ↓
点击进入 focused resolver，按需懒加载完整附件
```

这个流程的关键是：**类型解析发生在创建和 hydrate 时，不要在点击放大时才猜类型**。

创建时允许先生成节点，再异步补齐 metadata / thumbnail。缩略图生成、链接 unfurl、波形提取都不能阻塞基础节点落到画布。

完整附件不应作为启动 hydrate 的默认动作。图片可以沿用现有兼容路径；新 `asset` 节点默认只在 focused view、打开文件、或生成缩略图时读取完整资源，避免画布启动时把大视频 / 音频全部读进 renderer。

---

## 7. 画布缩略态设计

### 7.1 统一卡片壳

新增通用组件：

```txt
AssetNode
  AssetThumbnail
    ImageThumbnail
    VideoThumbnail
    AudioThumbnail
    FileThumbnail
      PdfFileState

LinkNode
  LinkThumbnail
```

所有缩略态共享：

- 固定节点尺寸与最小尺寸
- 标题区域
- 类型 badge
- 轻量元信息
- 统一 selection / hover / resize / handles

不同类型只替换中间的 preview body。

### 7.2 图片缩略态

展示策略：

- 优先使用 `thumbnailUrl`
- 没有缩略图时使用 `previewUrl`
- 仍没有时展示 image placeholder

画布上使用 `object-cover`；聚焦视图使用 `object-contain`。

MVP 期间图片仍走现有 `ImageNode`。本节是未来把图片并入 `AssetNode` 时的目标形态。

### 7.3 视频缩略态

展示策略：

- 展示 `thumbnailUrl`
- 叠加播放图标
- 显示 `duration`
- 不在画布缩略态自动播放
- 不在画布缩略态加载完整播放器控件

原因：

- 大量 video controls 会影响画布性能
- 自动播放 / hover 播放容易干扰拖拽和选择
- 缩略态的目标是识别，不是消费内容

### 7.4 音频缩略态

MVP 展示策略：

- 音频图标
- 标题 / 文件名
- 时长
- 可选 `waveform` 小波形

如果实现 waveform：

- 创建时用 Web Audio 解码并抽样
- 保存为短数组，例如 48 或 96 个采样值
- 画布上用 SVG / div bars 轻量渲染

不建议在画布缩略态放完整 `<audio controls>`。

### 7.5 PDF / 文件缩略态

MVP 展示策略：

- PDF：显示 PDF 图标、文件名、大小；PDF 首页缩略图作为后续增强
- 普通文件：显示扩展名 badge、文件名、大小
- 文本类文件：可选显示前几行 excerpt

不要在 MVP 试图完整预览 Word、Excel、PPT、压缩包等格式。未知格式统一退化为文件卡。

### 7.6 链接缩略态

展示策略：

- 标题
- 域名
- favicon
- 描述
- 可选 Open Graph image

链接 unfurl 失败时：

- 标题使用 URL host 或完整 URL
- favicon / 描述为空
- 不阻塞节点创建

---

## 8. 缩略图生成方案

### 8.1 图片缩略图

推荐在 renderer 中生成：

1. 用户拖入图片。
2. 读取原图为 data URL。
3. 用 `<canvas>` 按最大边长生成缩略图。
4. 调用 RPC 保存原图和缩略图。
5. manifest 保存 `attachmentFile` 和 `thumbnailFile`。

优点：

- 不需要 Bun 侧图像处理依赖
- 浏览器 canvas 能覆盖常见图片格式
- 与现有 `ImageNode` 逻辑接近

### 8.2 视频缩略图

推荐在 renderer 中生成：

1. 用户拖入视频。
2. 创建 object URL。
3. 用 `<video preload="metadata">` 加载 metadata。
4. seek 到 `min(1s, duration * 0.1)`。
5. 等待 `seeked`。
6. 用 canvas 抓取当前帧。
7. 保存为 JPEG / WebP 缩略图。

失败兜底：

- 如果 metadata 加载失败，仍创建 video asset。
- 如果 seek 失败，显示 video placeholder。
- 缩略图生成不能阻塞节点创建太久。
- 画布缩略态不要渲染 `<video controls>`，播放器只放在 focused view。

### 8.3 音频波形

MVP 可以先不生成真实波形，只展示音频图标。

增强版：

1. 用 `AudioContext.decodeAudioData()` 解码。
2. 取第一条 channel。
3. 分桶抽样为 48 或 96 个峰值。
4. 保存 `waveform: number[]` 到 node data。

注意：

- 大文件 decode 可能较慢。
- 失败时直接退回图标。
- waveform 是小数据，可以直接保存在 manifest。

### 8.4 PDF 首页缩略图

建议作为第二阶段。

候选方式：

- 使用 PDF.js 在 renderer 中渲染第一页。
- 保存第一页缩略图为 `thumbnailFile`。

MVP 不引入 PDF.js，避免为文件节点第一版增加较大复杂度。

### 8.5 链接 unfurl

建议通过 Bun RPC 做：

```ts
unfurlLink(url): Promise<{
  title?: string;
  description?: string;
  siteName?: string;
  faviconUrl?: string;
  imageUrl?: string;
}>
```

约束：

- 超时，例如 3 秒。
- 失败返回 `failed` 状态，不抛到 UI 崩溃。
- 后续要考虑 SSRF / 本地地址安全策略。
- MVP 可以先只解析 URL host，不做网络抓取。
- link 节点创建不能依赖 unfurl 成功；先保存 URL，再异步刷新标题、描述、favicon。

---

## 9. 点击放大解析

### 9.1 不在点击时猜类型

点击放大时不应该根据文件扩展名临时判断，而应该依赖创建时写好的 discriminated union：

```ts
node.type === 'asset'
data.kind === 'video'
```

这样 focused view 只是稳定分发：

```tsx
function AssetFocusedView({ data }: { data: AssetNodeData }) {
  switch (data.kind) {
    case 'video':
      return <VideoFocusedView data={data} />;
    case 'audio':
      return <AudioFocusedView data={data} />;
    case 'file':
      return <FileFocusedView data={data} />;
  }
}
```

MVP 中图片仍由现有 `ImageNode` 处理；PDF 是 `kind: "file"` 的一个 MIME 分支，不在第一阶段作为独立 `kind` 分发。

### 9.2 聚焦视图职责

聚焦视图负责完整消费内容：

- 图片：contain 查看、标题编辑
- 视频：原生播放器、标题、元信息
- 音频：播放器、波形、标题、元信息
- PDF：MVP 打开文件 / 显示文件信息；后续内嵌 PDF viewer
- 普通文件：文件信息、打开文件、复制路径
- 链接：打开链接、显示详情、刷新 unfurl

### 9.3 打开文件

普通文件建议新增 Bun RPC：

```ts
openAttachment(filePath): Promise<{ success: boolean }>
```

由主进程调用系统默认应用打开本地附件。Renderer 不直接拼绝对路径，也不暴露 workspace 任意路径。

---

## 10. 持久化与 hydrate

### 10.1 保存

保存 manifest 时需要清理运行时字段：

- `previewUrl`
- `thumbnailUrl`
- object URL
- 大 base64 字段

对于 `asset`：

```ts
{
  id,
  type: 'asset',
  position,
  style,
  data: {
    kind,
    title,
    fileName,
    mimeType,
    size,
    duration,
    attachmentFile,
    thumbnailFile,
    waveform,
    color,
  }
}
```

对于 `link`：

```ts
{
  id,
  type: 'link',
  position,
  style,
  data: {
    url,
    title,
    description,
    siteName,
    faviconUrl,
    imageUrl,
    color,
  }
}
```

### 10.2 加载

加载 manifest 时：

- 如果 `thumbnailFile` 存在，读取为 runtime `thumbnailUrl`，供画布缩略态使用。
- 如果只有 `attachmentFile`，启动 hydrate 不默认读取完整附件；节点保留 metadata，focused view 或 open action 再按需加载。
- 如果文件不存在，保留节点但显示 missing attachment 状态。
- `previewUrl` 只代表当前会话的运行时 URL，必须可重新生成，不能作为数据源。

### 10.3 附件保存 RPC 泛化

当前 `saveAttachment` 更偏图片。建议改为：

```ts
saveAttachment({
  dataUrl,
  existingFile,
  suggestedName,
  mimeType,
  kind,
})
```

文件命名建议：

```txt
attachments/img_xxxxxxxx.png
attachments/video_xxxxxxxx.mp4
attachments/audio_xxxxxxxx.mp3
attachments/file_xxxxxxxx.pdf
attachments/thumb_xxxxxxxx.jpg
```

MVP 可以继续用 data URL 传小文件，便于复用现有 `ImageNode` 的思路；但视频 / 音频很容易超过合理内存范围，所以必须保留后续升级路径：

```ts
saveAttachmentFile({
  sourcePath,
  suggestedName,
  mimeType,
  kind,
})
```

长期目标是让大文件走主进程文件复制或二进制流，不让 renderer 长期持有完整 base64。

实现约束：

- data URL 路径只用于小文件；需要设置明确大小上限，超过上限时返回可恢复错误。
- `sourcePath` / `filePath` 必须是 workspace 内允许范围，Bun 侧拒绝绝对路径、`../`、空路径和 workspace 外路径。
- `openAttachment(filePath)` 只能打开 manifest 中保存的相对附件路径，renderer 不直接拼绝对路径。
- `mimeType` 和扩展名需要 allowlist / fallback；未知类型保存为 `file`，不尝试执行或解析。

---

## 11. Folder / Group / Document Mode

### 11.1 Group

`asset` 和 `link` 应该可以进入 group。

```ts
GROUP_CHILD_TYPES = ['card', 'image', 'sticky', 'folder', 'asset', 'link']
```

实现时不要在拖拽逻辑中继续写散落判断，建议集中为：

```ts
function isGroupChildNode(type: string | undefined): boolean;
function isCanvasContentNode(type: string | undefined): boolean;
```

### 11.2 Folder

是否允许所有 asset / link 进入 folder，是一个产品决策。

推荐：

- 允许 `asset` 进入 folder
- 允许 `link` 进入 folder
- Folder 内展示与画布缩略态一致的内容卡

```ts
FOLDER_CHILD_TYPES = ['card', 'image', 'asset', 'link']
```

对应地，`absorbCardIntoFolder()` 这类命名也应逐步改成更中性的 `absorbNodeIntoFolder()`，避免新类型继续套在 card 语义下。

### 11.3 Document Mode

MVP 可以先不让 asset / link 出现在 document mode 编辑器中，只在 canvas mode 使用。

第二阶段再扩展：

- LeftRail 增加 `Files` / `Links`
- NoteList 支持文件和链接条目
- DocumentEditor 显示对应 focused-like view

---

## 12. 搜索

MVP 搜索字段：

### Asset

- `title`
- `fileName`
- `mimeType`

### Link

- `title`
- `url`
- `description`
- `siteName`

不做：

- 视频语音转写搜索
- 图片 OCR 搜索
- PDF 正文搜索
- 音频内容搜索

这些属于后续 AI / indexing 能力。

---

## 13. MVP 分期

### Phase 0：Canvas content foundation

目标：

- 新增 `contentTypes.ts`，集中 `CanvasNodeKind`、`AssetKind`、`AssetNodeData`、`LinkNodeData`、`classifyFile()`、`getAssetDisplayTitle()`。
- 新增 `canvasNodeRegistry.ts`，用 spec map 管理节点默认尺寸、默认 data、创建语义；现有 6 类全部进 registry，`asset` / `link` 写好 spec 但不暴露创建入口。
- 新增 `canvasNodePredicates.ts`，集中 `isCanvasContentNode()`、`isFolderChildNode()`、`isGroupChildNode()`、`isFocusableNode()`。MVP 中 `isFocusableNode()` 等价于 `node.type === 'card' || node.type === 'image'`。
- 让 `canvasStore` 的 `buildNewNodeSpec()` 改为从 registry 读取，现有产品行为保持不变。
- 把 `useNodeCreation` / `useContextMenu` / `useNodeDrag` / `resolvePlacement` / `collision` / `canvasUtils` 中的散落 union 与 set 收敛到共享类型 / predicates / registry。
- 递归清理 manifest 运行时字段，覆盖 top-level nodes 和 folder children；`RUNTIME_DATA_KEYS` 增补 `previewUrl` / `thumbnailUrl`。

不在 Phase 0 范围：

- 不动 `nodeTypes` / `readOnlyNodeTypes` 的静态注册形态。
- 不扩展 `SearchResultKind`、`DocumentTreeNode.kind`。
- 不改任何附件 RPC、不接 `LinkNode` / `AssetNode` UI。

验收标准：

- 现有 `card` / `checklist` / `sticky` / `image` / `folder` / `group` 创建行为不变。
- 现有 folder / group 拖拽、copy / paste、undo / redo 行为不变。
- `classifyFile()` 能正确识别 image / video / audio / pdf / 未知 → `file`。
- `isFocusableNode()` 覆盖现有 `card` / `image`，并为 `asset` / `link` 留出 true 分支。
- `sanitizeForPersistence()` 不会把 `previewUrl` / `thumbnailUrl` 写进 top-level node 或 folder child。
- `getNodeSpec(type).size` 与 `collision.ts` 给出的尺寸完全一致（registry 是单一来源）。
- 既有 `canvasStore.test.ts` 覆盖的 image 折叠 / 还原、folder child detach 用例无需修改语义即可通过。

### Phase 1A：Link 节点基础闭环

目标：

- 新增 `link` 节点
- 支持从菜单输入 URL 创建 link
- 支持粘贴 URL / 拖入 URL 创建 link
- 支持基础 link card
- 聚焦视图可打开链接
- 暂不依赖网络 unfurl
- manifest 保存稳定 URL metadata，不保存抓取失败等 transient 状态

验收标准：

- 粘贴 URL 可以创建链接节点。
- 节点至少显示 title / host / url fallback。
- 点击聚焦后可以打开链接。
- 网络不可用时 link 节点仍完整可用。
- 旧 manifest 没有 link 节点时行为不变，新 manifest 有 link 节点时能正常 hydrate。

### Phase 1B：Asset file 基础闭环

目标：

- 新增 `asset` 节点
- 支持拖入任意文件
- 支持保存附件
- 支持 manifest 轻量保存
- 支持 hydrate metadata / missing 状态；完整附件按需加载
- 支持画布缩略态
- 支持聚焦视图展示文件信息、打开文件
- `file` 菜单项从 disabled 改为可用
- `openAttachment()` 只能打开 workspace 内相对附件路径

验收标准：

- 拖入 `.pdf` / `.zip` / `.txt` 后画布出现文件卡。
- 文件卡显示文件名、类型、大小。
- 双击后进入文件详情视图。
- 可通过系统默认应用打开文件。
- 重启应用后文件仍可定位。
- manifest 不包含大体积 data URL。
- 删除 / 移动 folder child 不会丢失 asset/link 数据，也不会写入运行时 URL。

### Phase 2：Video / Audio 支持

目标：

- `asset.kind = "video"` 支持播放
- `asset.kind = "audio"` 支持播放
- 视频首帧缩略图尽力生成
- 音频先显示图标、标题、时长
- missing attachment 状态
- focused view 才加载完整媒体；画布态不创建完整播放器

验收标准：

- 拖入 `.mp4` 后画布出现视频卡。
- 视频卡显示封面或 fallback，不渲染画布态播放器。
- 双击后进入视频播放器。
- 拖入音频后画布出现音频卡。
- 双击后进入音频播放器。
- 重启应用后视频 / 音频仍可播放。
- 启动 hydrate 不会把所有视频 / 音频完整读入 renderer。

### Phase 3：缩略图质量与 Link Unfurl

目标：

- 图片并入 AssetNode 的可行性评估
- 图片缩略图生成
- 视频首帧缩略图稳定化
- 音频 waveform 生成
- 可选 Bun RPC unfurl

验收标准：

- 大视频不会让画布缩略态加载明显卡顿。
- 大图画布态使用缩略图，聚焦态使用原图。
- 音频卡片能显示轻量波形或稳定 fallback。
- link unfurl 失败时仍能显示 URL / host。

### Phase 4：Document Mode 与搜索扩展

目标：

- Document mode 可按类型查看文件 / 链接
- 搜索覆盖 asset / link 元数据
- Folder 内的 asset / link 可移动进出

验收标准：

- 搜索文件名能定位对应节点。
- Folder 中的文件能 move out 到画布。
- Document mode 不再只认识 card / image。

---

## 14. 关键技术风险

### 14.1 大文件内存压力

风险：

- renderer 用 FileReader 读取大视频为 data URL，内存可能很高。

缓解：

- MVP 必须限制 data URL 路径的单文件大小；超过上限时提示用户稍后支持大文件导入，而不是继续读入内存。
- 后续新增二进制保存 RPC 或主进程文件复制，避免把大文件完整 base64 传给 renderer。
- 视频缩略图使用 object URL，原文件保存走更底层的文件复制能力。
- 启动 hydrate 只加载缩略图 / metadata，不默认加载完整 `attachmentFile`。

### 14.2 缩略图生成失败

风险：

- 某些视频编码无法在 webview 中 seek / decode。

缓解：

- 缩略图不是创建节点的必要条件。
- 失败时使用类型 placeholder。

### 14.3 链接 unfurl 安全

风险：

- 抓取 URL 可能访问本地网络或敏感地址。

缓解：

- MVP 不做网络 unfurl。
- 做 unfurl 时加协议白名单、超时、本地地址拦截。

### 14.4 Folder child 数据复杂化

风险：

- 当前 folder child 对 card / image 有特殊持久化逻辑，新类型加入后容易出现分支膨胀。

缓解：

- 抽出 `serializeNodeDataForManifest` / `hydrateNodeDataFromManifest`。
- 把 asset / link 的保存、hydrate 做成可注册 handler。

### 14.5 本地附件路径安全

风险：

- renderer 如果能传任意路径给 `openAttachment()` / `loadAttachment()`，就可能打开 workspace 外文件或路径穿越。

缓解：

- manifest 只保存 workspace 内相对附件路径。
- Bun 侧规范化路径后校验必须位于 workspace 的 `attachments/` 下。
- 拒绝绝对路径、`../`、空路径和符号链接逃逸。
- `openAttachment()` 不接受 URL，不执行文件，只交给系统默认应用打开已保存附件。

---

## 15. 建议代码结构

```txt
src/mainview/lib/contentTypes.ts
  CanvasNodeKind
  AssetKind
  AssetNodeData
  LinkNodeData
  CanvasContentKind
  classifyFile()
  getAssetDisplayTitle()

src/mainview/lib/canvasNodeRegistry.ts
  CANVAS_NODE_SPECS
  getNodeSpec()
  buildNewNodeSpec()

src/mainview/lib/canvasNodePredicates.ts
  isCanvasContentNode()
  isGroupChildNode()
  isFolderChildNode()
  isFocusableNode()
  isDocumentNode()

src/mainview/lib/canvasNodeSerialization.ts
  serializeNodeForManifest()
  serializeNodeDataForManifest()
  stripRuntimeAssetFields()

src/mainview/lib/thumbnail.ts
  createImageThumbnail()
  createVideoThumbnail()
  createAudioWaveform()

src/mainview/components/canvas/nodes/AssetNode.tsx
src/mainview/components/canvas/nodes/LinkNode.tsx
src/mainview/components/canvas/nodes/AssetFocusedView.tsx
src/mainview/components/canvas/nodes/LinkFocusedView.tsx

src/bun/attachments.ts
  saveAttachment()
  saveAttachmentFile()
  loadAttachment()
  openAttachment()
  assertWorkspaceAttachmentPath()

src/bun/linkPreview.ts
  unfurlLink()
```

第一阶段就建议引入 spec map；长期可以进一步形成 renderer registry：

```ts
interface CanvasContentRenderer<TData> {
  nodeType: string;
  renderThumbnail(data: TData): React.ReactNode;
  renderFocused(data: TData): React.ReactNode;
  serialize(data: TData): Record<string, unknown>;
  hydrate(data: Record<string, unknown>): Promise<TData>;
}
```

---

## 16. 测试计划

### Unit tests

- `classifyFile()` 正确识别 image / video / audio / pdf / file。
- PDF 在 MVP 中分类为 `asset.kind = "file"`，同时保留 `mimeType: "application/pdf"`。
- `CanvasNodeKind` / `AssetKind` 覆盖创建入口需要的类型。
- `CANVAS_NODE_SPECS` 能返回 asset / link 的默认尺寸与默认 data。
- `isCanvasContentNode()` / `isFolderChildNode()` 覆盖 card / image / asset / link。
- `sanitizeForPersistence()` / `serializeNodeForManifest()` 会递归移除 `previewUrl` / `thumbnailUrl`，包括 folder child。
- `buildNewNodeSpec()` 能创建 `asset` / `link` 默认节点。
- `searchCurrentView()` 能搜索 asset / link 元数据。

### Component tests

- `AssetNode` 渲染不同 `kind` 的缩略态。
- `LinkNode` 在 unfurl 缺失时仍渲染 URL fallback。
- `FocusedView` 能分发到 asset / link focused view。

### Bun tests

- `saveAttachment` 能保存非图片 MIME。
- `loadAttachment` 能返回正确 data URL。
- manifest 保存时不写入大 base64。
- manifest 加载时能 hydrate thumbnail / missing 状态，不默认读取完整大附件。
- `openAttachment()` 拒绝绝对路径、`../` 和 workspace 外路径。

### Manual QA

- 拖入视频，重启后仍可播放。
- 拖入音频，重启后仍可播放。
- 拖入 PDF，显示文件卡且可打开。
- 粘贴链接，显示链接卡。
- 多个大文件在画布上缩放 / 拖拽仍流畅。

---

## 17. 推荐 MVP 决策

第一版建议只承诺：

1. 先做 foundation PR：`CanvasNodeKind` / `AssetKind` / node spec map / predicates / 递归 runtime 字段清理，现有行为不变。
2. 再做 `link` 基础 URL card，不依赖 unfurl。
3. 再做 `asset.kind = "file"`，跑通附件保存、manifest、metadata hydrate、打开文件。
4. 抽出 `isCanvasContentNode()`、`isFolderChildNode()`、`isGroupChildNode()`、`isFocusableNode()`，替代硬编码 `card || image`。
5. 视频 / 音频作为第二阶段，画布态只显示缩略卡，播放器只放 focused view。
6. PDF 先显示文件卡，PDF 首页缩略图放到增强。
7. 不迁移现有 `image` 节点。
8. manifest 坚决不保存大 base64。
9. 新 `asset` 启动 hydrate 不默认读取完整附件；完整文件读取只发生在 focused view、open action 或缩略图生成路径。
10. Phase 0 不要顺手做 `nodeTypes` / `readOnlyNodeTypes` 自动派生，也不要扩 `SearchResultKind`；这些都是后续阶段的事，留到该阶段再动。

这样可以先把架构闭环做稳，再逐步提高不同内容类型的预览质量。

---

## 18. 首个 PR 范围

首个 PR 只做 foundation，不新增可见功能，目标是降低后续 `link` / `asset` 接入风险。

包含：

- 新建 `src/mainview/lib/contentTypes.ts`
  - `CanvasNodeKind`
  - `AssetKind`
  - `AssetNodeData`
  - `LinkNodeData`
  - `classifyFile()`，签名见 5.4
  - `getAssetDisplayTitle()`，签名见 5.4

- 新建 `src/mainview/lib/canvasNodeRegistry.ts`
  - `CANVAS_NODE_SPECS`
  - `getNodeSpec()`
  - `buildNewNodeSpec()`
  - 先覆盖现有 `card` / `checklist` / `sticky` / `image` / `folder` / `group`
  - 预留 `asset` / `link` spec，但不暴露创建入口（CreateMenu 不动、`createNode()` union 暂不放出）

- 新建 `src/mainview/lib/canvasNodePredicates.ts`
  - `isCanvasContentNode()`
  - `isGroupChildNode()`
  - `isFolderChildNode()`
  - `isFocusableNode()`，MVP 等价于 `node.type === 'card' || node.type === 'image'`

- 调整 `src/mainview/store/canvasStore.ts`
  - 移除本地散落 union，引用共享 `CanvasNodeKind`
  - `createNode()` 和 `buildNewNodeSpec()` 走 registry
  - `folderChildToDetachedNode()` 使用 predicates / registry，避免只认识 image / card

- 调整 `src/mainview/hooks/useNodeCreation.ts`
  - `onCreateNode` 入参类型改用 `CanvasNodeKind`

- 调整 `src/mainview/hooks/useContextMenu.ts`
  - `NewNodeType` 与 `NEW_NODE_ACTIONS` 改用共享 `CanvasNodeKind`
  - 节点右键 target 判断改走 predicates / registry，不再手写 `'card' | 'image' | 'sticky' | ...` 链式三元

- 调整 `src/mainview/hooks/useNodeDrag.ts`
  - 删除本地 `CONTENT_TYPES`，改用 `isGroupChildNode()` / `isFolderChildNode()`

- 调整 `src/mainview/lib/resolvePlacement.ts`
  - 删除重复的 `GROUP_CHILD_TYPES`，从 predicates 导入

- 调整 `src/mainview/lib/collision.ts`
  - `getNodeWidth()` / `getNodeHeight()` 改为消费 `getNodeSpec(type).size`

- 调整 `src/mainview/lib/canvasUtils.ts`
  - `GROUP_CHILD_TYPES` / `FOLDER_CHILD_TYPES` 改为转发自 predicates，保留导出兼容现有引用
  - `DOC_TREE_TYPES` 改走 predicate；`DocumentTreeNode.kind` 不动

- 调整 manifest 清理边界（`src/mainview/lib/sanitize.ts`）
  - `RUNTIME_DATA_KEYS` 加 `previewUrl`、`thumbnailUrl`
  - `sanitizeNode()` 递归处理 `data.children`，对 folder child 走相同清理
  - 现有 image 行为保持兼容

不包含：

- 不新增 `LinkNode` / `AssetNode` UI
- 不开启 `file` 菜单
- 不改 `saveAttachment` / `loadAttachment` / `openAttachment` RPC
- 不做视频 / 音频
- 不做 link unfurl
- 不迁移现有 image 节点
- 不动 `nodeTypes` / `readOnlyNodeTypes` 静态注册
- 不扩展 `SearchResultKind` / `DocumentTreeNode.kind`

新增 / 扩展的单测：

- `contentTypes.test.ts`：`classifyFile()` 覆盖 image / video / audio / pdf / 未知；`getAssetDisplayTitle()` 覆盖 4 条回退路径。
- `canvasNodeRegistry.test.ts`：6 个现有 type 的尺寸、默认 data、`canEnterGroup` / `canEnterFolder` 真值表。
- `canvasNodePredicates.test.ts`：`isCanvasContentNode` / `isFolderChildNode` / `isGroupChildNode` / `isFocusableNode` 真值表。
- `sanitize.test.ts` 增量：folder child 中的 `previewUrl` / `thumbnailUrl` / `isHidden` / `isDropTarget` 都被剥离；嵌套 image child 行为不变。
- `canvasStore.test.ts` 不应需要语义改动；只允许把 helper 替换为 registry / predicates。

验证：

```bash
bun run test
bun run type-check
```
