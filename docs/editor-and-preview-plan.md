# Editor & Preview 技术方案

> 本文档是 `note-data-model-analysis.md` 的落地延伸。
>
> 方向已确定：
>
> - **编辑层**：focused view 使用 tiptap
> - **预览层**：卡片使用轻量 markdown 渲染（不挂 editor 实例）
> - **resize 策略**：路线 B —— 一次性预渲染足够多内容，靠 `overflow: hidden` 自然裁剪

本文档给出具体的模块划分、数据模型变更、改造点、性能预算和分阶段任务。

---

## 1. 目标与非目标

### 1.1 目标

- focused view 升级为 tiptap，能力覆盖 markdown 常用子集（标题、列表、任务列表、引用、代码块、行内代码、粗斜体、删除线、链接、图片、分割线）
- 卡片预览态以**预生成的静态 HTML**渲染正文，渲染成本接近 `innerHTML` 本身
- 卡片 resize 不触发任何 markdown 解析或 React 子树重建，仅由 CSS 裁剪
- `.md` 文件保持人类可读，frontmatter 仅扩展、不破坏现有结构
- 保持 checklist card 当前的结构化 `data.items` 交互（不在预览层退化为 markdown 渲染）

### 1.2 非目标

- 不引入 ProseMirror JSON 作为 canonical 存储（见 `note-data-model-analysis.md` §9）
- 不做 slash command / mention / AI inline 扩展（单独议题，后续再加）
- 不改动 checklist card 的卡片交互（勾选仍是结构化 items）
- 不做 tiered preview（路线 C）。仅在路线 B 真成为瓶颈时再评估
- 不引入协同编辑 / Yjs

---

## 2. 架构全景

```
┌──────────────────────────────────────────────────────────────────┐
│                         磁盘 (workspace)                         │
│   content/*.md  —  frontmatter + body (markdown / GFM checkbox)  │
└──────────────────────────────────────────────────────────────────┘
                │                                    ▲
                │ loadCanvas / loadNote              │ saveNote (debounced)
                │ noteToCardData()                   │ cardDataToNote() + preview
                ▼                                    │
┌──────────────────────────────────────────────────────────────────┐
│                    Renderer (React, zustand)                     │
│                                                                  │
│  CanvasStore.nodes[].data:                                       │
│    { type, title, content | items, previewHtml, previewMeta }    │
│                                                                  │
│  ┌──────────────────────┐   ┌──────────────────────────────────┐ │
│  │   CardNode (卡片态)  │   │  FocusedView (聚焦编辑)          │ │
│  │                      │   │                                  │ │
│  │  NotePreview         │   │  TiptapEditor (lazy)             │ │
│  │   ├ prose HTML 片段  │   │   ├ StarterKit + TaskList ...    │ │
│  │   └ overflow:hidden  │   │   ├ md ↔ pm doc via              │ │
│  │                      │   │   │    tiptap-markdown           │ │
│  │  (不挂 editor)       │   │   └ debounced save               │ │
│  └──────────────────────┘   └──────────────────────────────────┘ │
│                                                                  │
│  lib/markdown/                                                   │
│   ├ render.ts  (markdown-it 单例)                                │
│   ├ preview.ts (截断 + 过滤重 block + sanitize)                  │
│   └ sanitize.ts (DOMPurify 配置)                                 │
└──────────────────────────────────────────────────────────────────┘
```

三层职责严格分离：**存储只认 markdown；编辑只在 focused view；预览只消费字符串**。

---

## 3. 依赖与包选型

### 3.1 新增运行时依赖

| 包                                                            | 用途                               | 预估大小（gz）            |
| ------------------------------------------------------------- | ---------------------------------- | ------------------------- |
| `@tiptap/react` + `@tiptap/core` + `@tiptap/pm`               | ProseMirror + React 胶水           | ~35KB                     |
| `@tiptap/starter-kit`                                         | 常用节点/marks 打包                | ~25KB                     |
| `@tiptap/extension-task-list` + `@tiptap/extension-task-item` | GFM 任务列表                       | ~5KB                      |
| `@tiptap/extension-link`                                      | 链接                               | ~2KB                      |
| `@tiptap/extension-image`                                     | `![]()` 图片                       | ~2KB                      |
| `@tiptap/extension-placeholder`                               | 空状态提示                         | ~1KB                      |
| `tiptap-markdown`                                             | markdown ↔ PM doc 序列化           | ~15KB（内含 markdown-it） |
| `markdown-it`                                                 | 预览层渲染器                       | ~20KB                     |
| `markdown-it-task-lists`                                      | 任务列表支持                       | ~1KB                      |
| `dompurify`                                                   | `dangerouslySetInnerHTML` sanitize | ~20KB                     |

合计增量 ~130KB gz。FocusedView 的 tiptap 部分用动态 `import()` 懒加载，卡片首屏只包含 markdown-it + DOMPurify（~40KB gz）。

### 3.2 不引入的东西

- 不引入 Shiki / Prism / highlight.js。预览层代码块保留纯 `<pre><code>`；focused view 如需语法高亮后续再评估 `@tiptap/extension-code-block-lowlight`
- 不引入 `remark` / `rehype` 生态。markdown-it 速度更快、API 更简单，够用
- 不引入 `react-markdown`。它每次渲染都要 parse 且包体更大，不符合"预生成"方案

### 3.3 安装命令

```bash
bun add @tiptap/react @tiptap/core @tiptap/pm \
        @tiptap/starter-kit \
        @tiptap/extension-task-list @tiptap/extension-task-item \
        @tiptap/extension-link @tiptap/extension-image \
        @tiptap/extension-placeholder \
        tiptap-markdown markdown-it markdown-it-task-lists dompurify
bun add -d @types/markdown-it @types/dompurify
```

（仅作为文档记录，不要在写这份方案时直接执行。）

---

## 4. 数据模型变更

不改现有结构，只在 frontmatter 上**追加字段**。

### 4.1 frontmatter 新增

```yaml
---
id: note_xxx
title: Project Kickoff
displayHint: note
color: '#fff'
createdAt: 2026-04-16T10:00:00.000Z
updatedAt: 2026-04-16T10:05:00.000Z

# —— 新增字段 ——
previewHtml: '<h3>Project Kickoff</h3><p>We need to align...</p>'
previewExcerpt: 'We need to align on scope and timeline before the demo.'
previewBlocks: 27 # 正文总 block 数，用来显示 "+N more" 类 UI（可选）
previewVersion: 1 # 预览生成器版本，用于未来升级时强制重算
---
```

说明：

- `previewHtml`：截断到前 N 个 block、裁剪过重 block、DOMPurify 处理过的 HTML 字符串。由 bun 侧在保存时生成。
- `previewExcerpt`：纯文本摘要，前 160 字符。用于空 HTML 兜底 / 搜索 / 分享预览。
- `previewBlocks`：正文总 block 数。仅用来做 "+N more" 这类 UI 决策，不是必需。
- `previewVersion`：生成器版本号。将来预览规则升级时，加载到旧版本就标记为 stale，下次 save 时重算。

### 4.2 为什么把 preview 放 frontmatter 而不是独立文件

已在 `note-data-model-analysis.md` §11 讨论。短期采用方案 A：

- 单一来源，canvas 加载一次就能拿到
- 文件仍可读
- 等卡片数量上千再升级到独立 preview 索引

### 4.3 `NoteFrontmatter` 类型扩展

`src/bun/notes.ts`:

```ts
export interface NoteFrontmatter {
  // ... 现有字段
  previewHtml?: string;
  previewExcerpt?: string;
  previewBlocks?: number;
  previewVersion?: number;
}
```

### 4.4 card node `data` 扩展

`data` 在 manifest 里仍只保留 `{ noteId, file, type }`（加载时从 note 文件 hydrate），新增：

```ts
data.previewHtml?: string
data.previewExcerpt?: string
```

`noteToCardData()` 增加从 frontmatter 透传。`cardDataToNote()` **不**把 preview 字段写回——它们由 bun 侧统一生成（§7.3）。

### 4.5 body 格式不变

- text card：body 仍是 markdown 字符串（此前是纯文本，向后兼容——纯文本在 markdown 里就是一段普通段落）
- checklist card：body 仍是 GFM checkbox markdown

checklist 保持当前的结构化 `data.items` 交互，不走 tiptap 也不走预览 HTML 渲染。

---

## 5. 模块划分

### 5.1 新增目录结构

```
src/mainview/
├── lib/
│   └── markdown/
│       ├── render.ts          # markdown-it 单例 + 配置
│       ├── preview.ts         # 仅用于预览：截断 + 去重 block + sanitize
│       └── sanitize.ts        # DOMPurify 配置
├── components/
│   ├── editor/
│   │   ├── TiptapEditor.tsx   # 懒加载的 focused view 编辑器
│   │   └── extensions.ts      # 集中声明扩展清单
│   └── preview/
│       └── NotePreview.tsx    # 卡片态正文渲染

src/bun/
└── preview.ts                 # 服务端版本 preview 生成（与 lib/markdown/preview.ts 共享规则）
```

### 5.2 `lib/markdown/render.ts`

职责：提供共享的 `md` 单例，供 preview 生成和任何只读渲染复用。

```ts
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

export const md = new MarkdownIt({
  html: false, // 禁止原始 HTML，交给 sanitize 兜底
  linkify: true,
  breaks: false,
  typographer: false,
}).use(taskLists, { enabled: false }); // 预览里任务列表只渲染不可交互

export function renderMarkdownToHtml(src: string): string {
  return md.render(src);
}
```

### 5.3 `lib/markdown/preview.ts`

职责：把 markdown 源转成"适合卡片渲染"的截断 HTML。

关键规则：

- **块截断**：按 markdown-it token stream 找到 block open/close 边界，累计到第 `MAX_PREVIEW_BLOCKS`（默认 30）个 top-level block 停止
- **重 block 替换**：遇到 `table` / `fence`（代码块）/ `html_block` / 未知自定义 block 时，不原样渲染，换成简短 badge `<span class="note-badge">Table</span>`
- **图片处理**：仅保留前 1 张图，其余 `<img>` 去除并加 `<span class="note-badge">+N images</span>`
- **链接**：保留但禁止 target=\_blank（在卡片态不允许离开 app）
- **sanitize**：最后一步喂给 DOMPurify（§5.4）

API 草案：

```ts
export interface PreviewArtifacts {
  html: string; // 截断后的 HTML（已 sanitize）
  excerpt: string; // 纯文本摘要
  blocks: number; // 正文总 block 数
  version: number; // 生成器版本号
}

export function buildPreview(markdown: string): PreviewArtifacts;
```

`buildPreview` 既在 renderer 侧可用（client-side 预览 refresh），也在 bun 侧调用（保存时写入 frontmatter）。两端共用同一份实现：

- renderer 的 `lib/markdown/preview.ts` 导出 `buildPreview`
- bun 的 `src/bun/preview.ts` **从 `lib/markdown/` 复制一份等价实现**（bun 不能 import renderer 代码；代码量很少，允许复制，双份配 lint 规则禁止漂移，或提取到 `src/shared/` 被双方 import）

> 建议做法：把 `render.ts` / `preview.ts` 放 `src/shared/markdown/`，renderer 和 bun 都 import。检查 electrobun 打包规则是否允许，若不允许再走复制路线。

### 5.4 `lib/markdown/sanitize.ts`

```ts
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'blockquote',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  's',
  'code',
  'pre',
  'a',
  'img',
  'span',
  'div',
];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class'];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR: ['style', 'onclick', 'onload', 'onerror'],
    KEEP_CONTENT: true,
  });
}
```

注意 bun 侧需要的是 `isomorphic-dompurify` 或自行注入 jsdom。`src/bun/preview.ts` 优先用 `isomorphic-dompurify`；若体积敏感可用简单的白名单 scanner 代替（因为 markdown-it `html: false` 已经挡掉了大部分风险）。

### 5.5 `components/editor/extensions.ts`

```ts
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';

export const buildExtensions = (placeholder?: string) => [
  StarterKit.configure({
    codeBlock: { HTMLAttributes: { class: 'prose-code' } },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Link.configure({ openOnClick: false, autolink: true }),
  Image,
  Placeholder.configure({ placeholder: placeholder ?? 'Write something...' }),
  Markdown.configure({
    html: false,
    tightLists: true,
    bulletListMarker: '-',
    linkify: true,
    breaks: false,
    transformPastedText: true,
  }),
];
```

**边界**：这套扩展定义了"tiptap 允许创建的结构" = "我们承诺 markdown 能承载的结构"。不要引入 markdown 不可表达的扩展（如 color、font-family、callout 等）。

### 5.6 `components/editor/TiptapEditor.tsx`

职责：

- 接收 `markdown` 初值与 `onSave(markdown)` 回调
- 内部通过 `tiptap-markdown` 在 init 时 parse markdown → PM doc，在导出时 serialize 回 markdown
- 默认 800ms debounce 调用 `onSave`
- 失焦（blur）立即 flush
- 卸载前 flush（避免丢失）

组件应通过**动态 import** 从 FocusedView 里拉取：

```tsx
const TiptapEditor = lazy(() => import('@/components/editor/TiptapEditor'));
```

这样卡片首屏不打包 tiptap。

### 5.7 `components/preview/NotePreview.tsx`

职责：极薄组件，纯渲染。

```tsx
export const NotePreview = memo(({ html, excerpt, fallback }: Props) => {
  if (!html) {
    return (
      <div className='opacity-40'>{excerpt || fallback || 'Empty note'}</div>
    );
  }
  return (
    <div
      className='note-preview prose prose-sm max-w-none overflow-hidden'
      // html 已由 bun 端 sanitize。前端再过一次以防磁盘被手动篡改。
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
```

`memo` + `html` 引用稳定 → resize 期间零 re-render。

---

## 6. CardNode 与 FocusedView 改造

### 6.1 `CardNode.tsx` 改造点

现状（text card 卡片态分支，lines 178-203）：

```tsx
<div className='... whitespace-pre-wrap'>{data.content || 'Empty note'}</div>
```

改为：

```tsx
<NotePreview
  html={data.previewHtml}
  excerpt={data.previewExcerpt}
  fallback={data.content} // 向后兼容：旧数据还没有 previewHtml 时退化为纯文本
/>
```

**注意**：

- 卡片态**不再**调用 `CardContent` 的 text 分支做文本渲染——直接使用 `NotePreview`
- `isZoomedOut` 骨架分支保留不变（它早就不吃正文）
- checklist / image 分支不变
- `CardContent` 仅保留两个职责：(a) checklist 的结构化交互渲染 (b) image 的特殊渲染。text 在 focused 下直接路由到 `TiptapEditor`

### 6.2 `FocusedView.tsx` 改造点

现状：text card 在 focused 下走 `EditableCardContent`（contentEditable）。

改为：

```tsx
{node.data.type === 'text' ? (
  <Suspense fallback={<FocusedSkeleton />}>
    <TiptapEditor
      title={node.data.title}
      markdown={node.data.content ?? ''}
      onTitleChange={(title) => updateNodeData(node.id, { title })}
      onSave={(markdown) => updateNodeData(node.id, { content: markdown })}
      color={node.data.color}
    />
  </Suspense>
) : node.data.type === 'checklist' ? (
  <CardContent data={node.data} isFocused onChange={...} />
) : node.type === 'image' ? (
  <ImageContent ... />
) : null}
```

`EditableCardContent` 可以删除（text 编辑已由 tiptap 取代），但建议先保留一个 fallback 开关（§12 迁移），确认稳定后再删。

---

## 7. 保存流程

### 7.1 现状梳理

- `useCanvasPersistence` 用 2500ms debounce 保存整个 manifest
- bun 的 `saveManifest` handler 会在写 manifest 时顺便为每张 card **重写 note 文件**（`src/bun/index.ts` 约 L380-L402）
- 独立 `saveNote` RPC 存在但目前未被 UI 调用
- 结果：每次 focused view 编辑触发 store 变更 → manifest 脏 → 2.5s 后批量刷盘

问题：

1. focused view 高频编辑会连带刷整个 manifest，浪费
2. note body 和 manifest 耦合，note preview 也依赖 manifest 路径生成
3. saveNote 没被用，意味着 bun 侧 preview 生成**只能在 saveManifest 里做**

### 7.2 新的保存流程

将 note 保存与 manifest 保存拆开：

```
TiptapEditor
   │ 800ms debounce after edit
   │ or blur / unmount flush
   ▼
useNoteSaver(noteId) hook
   │ 调用 rpcSaveNote(noteId, fm, body)
   ▼
bun.saveNote handler
   │ buildPreview(body) → { html, excerpt, blocks, version }
   │ 写回 frontmatter.previewHtml / previewExcerpt / ...
   │ atomicWrite .md
   ▼
onSuccess 回 renderer：
   │ updateNodeData(nodeId, { content, previewHtml, previewExcerpt })
```

manifest 侧：

- `saveManifest` 的 handler **不再**每次都重写 note 正文（这是个独立优化，可放 Phase 2）
- 短期内容可以：当 `node.data.content` 存在时仍写 note；但让 `saveNote` 路径**覆盖**式刷 preview
- 或者：让 `saveManifest` 只在"新建 note（没有 file）"时才 createNote，其他情况跳过 note body 写入

### 7.3 preview 生成时机

preview 在 **bun 侧的 `saveNote` handler** 中生成。原因：

- bun 有 workspace 路径，能访问附件路径做 URL 解析
- renderer 只需要消费最终产物，不用再算一次
- 未来如果做后台索引 / 批量重算，逻辑集中在 bun 层更顺

renderer 侧 `lib/markdown/preview.ts` 主要用于：

- 测试
- 未来某些客户端即时 refresh 场景（可选）

### 7.4 `saveNote` handler 扩展

```ts
saveNote: async ({ noteId, frontmatter, body }) => {
  const noteIndex = await buildNoteIndex(wsPath);
  const filePath = noteIndex.get(noteId);
  if (!filePath) return { success: false };

  const preview = buildPreview(body);
  frontmatter.updatedAt = new Date().toISOString();
  frontmatter.previewHtml = preview.html;
  frontmatter.previewExcerpt = preview.excerpt;
  frontmatter.previewBlocks = preview.blocks;
  frontmatter.previewVersion = preview.version;

  await writeNote(wsPath, filePath, frontmatter, body);
  return { success: true, preview }; // 回传 preview，让 renderer 同步更新 data
};
```

`CanvasRPC.saveNote.response` 类型相应扩展：

```ts
response: {
  success: boolean;
  preview?: { html: string; excerpt: string; blocks: number; version: number };
};
```

### 7.5 `useNoteSaver` hook

新增 `src/mainview/hooks/useNoteSaver.ts`：

- 输入：`nodeId`, `noteId`, 当前 `frontmatter`
- 输出：`saveNoteDebounced(body: string)` + `flushNow()`
- 行为：800ms debounce；blur / unmount flush；回来的 `preview` 同步写入 `canvasStore.updateNodeData`

参考 `useCanvasPersistence` 的结构（带 dirty flag、blur 监听、beforeunload 处理）。

### 7.6 与 manifest 保存的协调

focused view 打开期间：

- 用户编辑 → `updateNodeData` 改 store 里的 `content`
- store 变化触发两条链路：
  1. `useNoteSaver`（800ms）→ saveNote → preview 回填
  2. `useCanvasPersistence`（2500ms）→ saveManifest

manifest 保存本身不再重写 note body（让 saveNote 成为唯一 body 写入路径）。这是 Phase 2 的改动，Phase 1 可先忍受"双写"（saveNote 写一次，2.5s 后 saveManifest 再写一次），数据正确性没问题。

---

## 8. 路线 B 的实现细节（resize + overflow）

### 8.1 核心思路

- `NotePreview` 渲染的是 `previewHtml`——一个**固定长度的 HTML 字符串**
- `previewHtml` 在保存时就已经截到 `MAX_PREVIEW_BLOCKS` 个 block
- 卡片容器 `overflow: hidden`，尺寸变化由 CSS 自然裁剪
- 组件 `memo` + `html` 字符串引用不变 → React 零重渲染
- `NodeResizeControl` 改父节点尺寸，`NotePreview` DOM 不卸载

### 8.2 关键 CSS

```css
.note-preview {
  /* 让长内容可以撑开预渲染布局，但外层 card overflow:hidden 会裁剪 */
  height: auto;
}

.note-preview > * + * {
  margin-top: 0.5em;
}

.note-preview img {
  max-width: 100%;
  height: auto;
  loading: lazy; /* HTML 属性，通过 DOMPurify 保留 */
}

/* resize 进行时降级动画 / 过渡，减少视觉抖动 */
body.resizing-nwse .note-preview {
  pointer-events: none;
}
```

### 8.3 不要做的事

- 不要监听 `NodeResizeControl` 的 onResize 去动态切 preview
- 不要根据卡片高度重新调用 `buildPreview`
- 不要在 preview 内用 ResizeObserver 触发重渲染
- 不要用 `react-markdown` 之类"每次渲染都 parse"的方案

### 8.4 关于 `MAX_PREVIEW_BLOCKS`

默认 30。粗略预算：

- 最大卡片 800×900，内边距扣掉后可视区约 750×820px
- 平均每个 block（段落 / 列表项）约 28px 高
- 820 / 28 ≈ 29 → 30 绰绰有余

若后续允许更大卡片（例如 1200×1200），把常量调到 50 即可；这是唯一需要动的地方。

### 8.5 渐隐遮罩（可选的视觉优化）

若内容恰好被裁剪到一半，底部边缘会突兀。可加底部 mask：

```css
.note-preview {
  mask-image: linear-gradient(to bottom, black calc(100% - 24px), transparent);
}
```

仅当 `previewBlocks > MAX_PREVIEW_BLOCKS` 时加这个类，表示"还有更多内容"。

---

## 9. 加载策略

### 9.1 现状

`loadCanvas` 会 hydrate 每个 card 的完整 body 到 `data.content` / `data.items`。

### 9.2 当前阶段（Phase 1）保持不变

理由：

- 现在只有 text / checklist，body 本身就不大
- 预加载 preview 和 body 同时发生，没有显著浪费
- 真正要改"按需加载全文"是 Phase 3 的事（见 `note-data-model-analysis.md` §12）

### 9.3 Phase 1 的 loadCanvas 改动

`noteToCardData` 补充：

```ts
if (frontmatter.previewHtml) data.previewHtml = frontmatter.previewHtml;
if (frontmatter.previewExcerpt)
  data.previewExcerpt = frontmatter.previewExcerpt;
```

这样初次加载卡片就能直接拿到 preview，不用再算。

### 9.4 旧数据的 preview 兜底

没有 `previewHtml` 的旧 note：

- `NotePreview` 的 fallback 路径渲染纯文本（§5.7）
- 首次用户打开 focused view 编辑并触发 save 后，preview 字段会自动补上
- 也可以加一个一次性 "preview 迁移任务"：启动时扫描所有 note，没有 preview 的批量调用 `buildPreview` 补齐。这是可选优化，不是必需。

---

## 10. 样式规范

### 10.1 Tailwind `prose` 复用

使用 `@tailwindcss/typography` 的 `.prose .prose-sm` 作为 preview 和 focused view 的基底排版。当前项目没装 typography 插件，需要新增：

```bash
bun add -d @tailwindcss/typography
```

Tailwind v4 的启用方式（在 `index.css`）：

```css
@plugin "@tailwindcss/typography";
```

### 10.2 三种尺寸约定

| 场景                 | class            | 字号       |
| -------------------- | ---------------- | ---------- |
| 预览（卡片）         | `prose prose-sm` | 14px       |
| 焦点编辑             | `prose prose-lg` | 18px       |
| 缩略骨架（zoom<0.4） | 不用 prose       | 24px title |

### 10.3 暗色卡片

`isColorDark(data.color)` 的分支仍然适用——只需给 `.note-preview` 加 `dark:` 风格：

```tsx
<NotePreview
  className={cn('note-preview prose prose-sm', isColorDark(color) && 'prose-invert text-white')}
  ...
/>
```

---

## 11. 性能预算

### 11.1 首屏（100 张卡片）目标

| 指标                          | 目标                           |
| ----------------------------- | ------------------------------ |
| `loadCanvas` → first paint    | < 300ms                        |
| preview HTML 总大小           | < 500KB（每张平均 ~5KB）       |
| 初始 JS bundle（不含 tiptap） | +40KB gz                       |
| 内存常驻                      | +8MB（100 张 × 平均 80KB DOM） |

### 11.2 编辑态目标

| 指标                              | 目标                               |
| --------------------------------- | ---------------------------------- |
| 打开 focused view 到 editor ready | < 150ms（tiptap 代码分片首次加载） |
| 按键 latency                      | < 16ms（一帧）                     |
| debounced save 往返               | < 50ms（本地文件）                 |

### 11.3 resize 目标

| 指标                           | 目标 |
| ------------------------------ | ---- |
| 拖动 resize 时 FPS             | ≥ 55 |
| resize 过程中 React 渲染次数   | 0    |
| resize 过程中 preview 重算次数 | 0    |

验证方式：React DevTools Profiler 录一段 resize → 确认 `NotePreview` commit count = 0；Chrome Performance 面板确认 main thread long task < 50ms。

---

## 12. 迁移与兼容

### 12.1 运行时 feature flag

`src/mainview/lib/flags.ts`（如已存在则复用）：

```ts
export const FLAGS = {
  tiptapEditor: true, // 可切回 contentEditable 回退
  markdownPreview: true, // 可切回纯文本渲染
};
```

开发阶段两边都能开关，出问题时一键回到旧路径。

### 12.2 正式切换前的验证

- 所有 fixture note（`__fixtures__/notes/*.md`）能完成：load → tiptap → 编辑 → save → 文件内容一致性对比（除 `updatedAt`）
- fixture 中准备"边界"样本：嵌套列表、代码块、表格、HTML 片段、极长段落、纯文本（旧格式兼容）
- 重启 app 之后 preview 字段稳定、不会每次打开都变化（确保 `buildPreview` 是确定性的）

### 12.3 回退策略

如果 tiptap 出现严重 bug：

1. 把 FLAGS.tiptapEditor 设为 false，FocusedView 回到 `EditableCardContent`
2. 已经被 tiptap 编辑过的 note 仍能在 contentEditable 下打开（因为 body 仍是 markdown 字符串）
3. preview 层独立于 editor，不受影响

---

## 13. 测试计划

所有测试都用 vitest。不新建独立 e2e，优先以单元 + 组件测试覆盖。

### 13.1 `lib/markdown/preview.test.ts`

- 空字符串 → empty HTML，`blocks=0`
- 仅标题 + 一段 → 正常 HTML
- 包含代码块 → 替换成 `<span class="note-badge">Code</span>`
- 包含表格 → 替换成 `Table` badge
- 多图 → 仅保留首张，其余转 badge
- 超过 `MAX_PREVIEW_BLOCKS` → 截断到常量，`blocks` 是真实总数
- `<script>` 注入 → sanitize 后没有 script 标签
- excerpt 长度 ≤ 160 字符

### 13.2 `lib/markdown/sanitize.test.ts`

- 标签白名单正确
- `onclick` / `onerror` 被移除
- `href="javascript:..."` 被移除
- `<img src="...">` 保留

### 13.3 `components/preview/NotePreview.test.tsx`

- 给 `html` → 渲染出对应结构
- 不给 `html` 给 `excerpt` → 渲染纯文本
- 父容器尺寸变化 → `memo` 命中，`render` 不重复（用 vitest spy 验证）

### 13.4 `components/editor/TiptapEditor.test.tsx`

- 初始 markdown → PM doc 正确 parse（检查 heading、list、task item）
- 编辑后 800ms 内触发 `onSave`
- blur 立即 flush
- unmount 立即 flush
- 往返稳定：markdown → PM doc → markdown，字符串相等（为若干 fixture 样本）

### 13.5 bun 侧 `preview.test.ts`

- `buildPreview` 的结果与 renderer 侧完全一致（用同一批 fixture）

### 13.6 RPC 端到端（既有 `rpc.test.ts` 扩展）

- `saveNote` 响应包含 `preview` 字段
- 字段值与 fixture 预期一致

### 13.7 现有测试的影响

- `notes.test.ts` 的 `cardDataToNote` / `noteToCardData` 相关断言需要更新，补充 `previewHtml` / `previewExcerpt` 透传的断言
- `rpc.test.ts` 的 `saveNote` mock 需要支持新的 response 结构

---

## 14. 任务拆解（分阶段）

### Phase 1 — 预览层（独立完成，不阻塞编辑器）

约 1～2 天。完成后立即带来"卡片态渲染 markdown"的能力，即使不上 tiptap 也有效果。

1. 安装 markdown-it / dompurify / typography 插件
2. 新建 `src/shared/markdown/render.ts` 和 `preview.ts`（含 `buildPreview`）
3. 新建 `src/shared/markdown/sanitize.ts`
4. 编写上述 §13.1~§13.2 单元测试
5. 扩展 `NoteFrontmatter` 类型 + `noteToCardData` 透传 preview 字段
6. 扩展 bun `saveNote` handler（生成 preview + 回传）
7. 更新 `rpcSaveNote` 签名 + 返回类型
8. 新建 `components/preview/NotePreview.tsx`
9. `CardNode` text 卡片分支切到 `NotePreview`
10. 运行 `bun run test` 和 `bun run type-check`，确保通过
11. 手工验证：新建 text note 写入 markdown → 卡片展示正确，resize 无卡顿

### Phase 2 — 编辑层（tiptap）

约 2～3 天。依赖 Phase 1 的数据模型。

1. 安装 tiptap 相关包
2. 新建 `components/editor/extensions.ts`
3. 新建 `components/editor/TiptapEditor.tsx`（含 markdown 往返 + debounce + blur flush）
4. 新建 `hooks/useNoteSaver.ts`
5. `FocusedView` text 分支切到 `TiptapEditor`（用 `React.lazy` + `Suspense`）
6. 编写 §13.4 测试（含 fixture 往返）
7. 手工验证：focused 下可编辑所有 markdown 常见结构，保存落盘 → 重新打开结构一致
8. 手工验证：编辑过程中 preview 字段在保存后同步更新，卡片态看到最新摘要

### Phase 3 — 优化与收尾

按需做，不必一次做完：

1. `saveManifest` 不再重写 note body（拆双写）
2. 新增 preview 迁移任务（老 note 批量补 preview）
3. preview 渐隐遮罩（§8.5）
4. 移除 `EditableCardContent`（确认稳定后）
5. 如果 bundle 体积敏感，评估把 `tiptap-markdown` 替换为手写薄适配层（只支持我们的 extension 集合）

---

## 15. 风险与回滚

### 15.1 主要风险

| 风险                                  | 影响                           | 缓解                                                                   |
| ------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `tiptap-markdown` 往返丢结构          | 用户编辑后保存，再打开内容变样 | §13.4 往返测试 + fixture 覆盖；边界情况用 FLAGS 关闭该 note            |
| preview HTML 被磁盘手动篡改注入脚本   | XSS                            | 前端再 sanitize 一次；CSP 禁 inline script                             |
| 老 note 没有 preview 导致卡片空       | UX 降级                        | fallback 到 `excerpt` / `content` 纯文本；Phase 3 批量补齐             |
| bun 与 renderer 的 preview 生成不一致 | 保存后首次渲染和重启后不一致   | 放 `src/shared/`，单一来源；fixture 双端对比测试                       |
| tiptap 首次加载 > 150ms               | 打开 focused view 卡顿         | 打包分析；必要时进一步裁扩展；预加载（鼠标悬停卡片时 `import()` 预取） |
| `dompurify` 在 bun 环境的兼容         | saveNote 路径报错              | 用 `isomorphic-dompurify` 或白名单 scanner；保留纯文本 fallback        |

### 15.2 回滚

任一 Phase 出问题都可独立回滚：

- Phase 1 出问题：把 `NotePreview` 换回原 `whitespace-pre-wrap` 分支；preview 字段留在 frontmatter 不影响
- Phase 2 出问题：`FLAGS.tiptapEditor = false` → FocusedView 回到 `EditableCardContent`
- Phase 3 出问题：保留双写路径即可

所有磁盘数据（markdown body）在任何 phase 都保持兼容，不存在"降级打不开"的场景。

---

## 16. 待澄清项（实施前确认）

1. `src/shared/` 是否能被 bun 和 renderer 同时 import？需要检查 `electrobun.config.ts` 与 Vite 配置。若不行，采用复制 + lint 检查。
2. `@tailwindcss/typography` 在 Tailwind v4 下的启用方式（`@plugin` 语法）是否已在项目中成立。
3. 是否允许 focused view 内显示图片（markdown `![]()`）——目前 text card 没有图片概念，引入后涉及附件路径解析。Phase 1 可暂不支持，TiptapEditor 的 Image 扩展先禁用。
4. 是否需要在 preview 渲染 task list checkbox——本文档建议**只渲染不可交互**（checkbox disabled）。交互性仍由 checklist card（结构化 items）承担。
