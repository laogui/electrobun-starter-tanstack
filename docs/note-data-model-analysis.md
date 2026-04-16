# Note 数据模型与编辑器方案分析

> 本文档聚焦于一个容易混在一起、但其实应该拆开讨论的问题：
>
> 1. **note 底层怎么存**
> 2. **focused note 用什么编辑**
> 3. **卡片态 / 缩略态怎么展示**
>
> 当前项目是一个空间化画布应用，不是单纯文档编辑器。因此这 3 个问题不建议绑成同一个决策。

---

## 1. 问题背景

当前的纠结点很真实：

- 如果 note 只存成 **纯 markdown**：
  - 文件可读、易于本地存储和 git diff
  - 但用户通常不会直接写 markdown
  - 编辑器最终还是要做成类似 Typora 的即时预览 / 所见即所得

- 如果引入 **TipTap / ProseMirror**：
  - focused 编辑体验会强很多
  - 但又会碰到两个新问题：
    1. 卡片预览态如何渲染？
    2. 缩略卡片是否要渲染完整富文本？

这个问题如果不拆开，很容易陷入“存储格式 = 编辑器 = 预览方式”的绑定设计，后面会越来越难演化。

---

## 2. 当前项目的现状

基于当前代码实现，note 体系其实还比较轻量。

### 2.1 当前持久化模型

`src/bun/notes.ts` 里的 note 本质上是：

```ts
type NoteDocument = {
  frontmatter: NoteFrontmatter;
  body: string;
  file: string;
};
```

也就是：

- frontmatter 存元信息
- body 存正文字符串
- file 是 workspace 相对路径

### 2.2 当前支持的内容类型

当前卡片内容实际上主要是两类：

- `text`
- `checklist`

其中：

- `text`：body 就是普通文本
- `checklist`：body 使用 GFM checkbox markdown 进行序列化

也就是说，当前虽然用了 `.md` 文件，但还不是一个完整的 markdown 富文本系统，而是：

- 文本卡片 → 纯文本 body
- checklist 卡片 → markdown 化存储

### 2.3 当前 UI 渲染方式

当前渲染也比较直接：

- `CardNode.tsx`
  - 卡片态直接展示 title + content / checklist items
- `FocusedView.tsx`
  - 打开聚焦视图后，用 `contentEditable` 做编辑

换句话说，当前系统其实还没有进入“富文本编辑器 vs markdown 编辑器”的阶段，它目前更像是一个：

- 卡片数据模型
- 本地 `.md` 持久化
- 简单文本编辑

这也是为什么现在是一个很合适的决策窗口。

---

## 3. 先拆分成 3 个独立决策

建议先明确：以下 3 件事不是同一个问题。

### 3.1 决策 A：底层存储格式

回答的是：

> 磁盘里到底存什么，作为 canonical source of truth？

候选通常包括：

- markdown / markdown-compatible text
- ProseMirror / TipTap JSON
- 自定义 block JSON

### 3.2 决策 B：编辑器形态

回答的是：

> 用户在 focused note 里，看到的是什么编辑体验？

候选通常包括：

- 纯文本编辑
- Typora 风格 markdown WYSIWYG
- TipTap / ProseMirror 富文本编辑
- Lexical 富文本编辑

### 3.3 决策 C：卡片态 / 缩略态展示

回答的是：

> 画布上的卡片，到底展示“全文缩小版”，还是“摘要投影”？

这个对空间化产品尤其关键。

---

## 4. 核心判断：卡片预览不应该等于微型编辑器

这是整个问题里最重要的一个判断。

在空间化画布里，小卡片的职责通常不是忠实还原正文全文，而是：

- 让用户一眼识别这张卡是什么
- 让用户知道核心内容大概是什么
- 保持画面整洁
- 保持渲染性能稳定

因此：

> 卡片态更适合是 **preview projection（预览投影）**，而不是“把完整编辑器内容缩小渲染”。

### 4.1 为什么不推荐“完整富文本缩小渲染”

如果未来用了 TipTap / ProseMirror，直接在卡片态渲染整棵富文本文档，通常会带来这些问题：

- 视觉上很乱，小尺寸下层级和块结构会失真
- 性能开销更大
- 每张卡片都变成 mini editor renderer，复杂度上升
- 同一种 note 在 focused view 和卡片 view 的设计目标不同，却被强行复用

### 4.2 更合理的卡片态目标

卡片态只需要解决：

- 标题识别
- 简短摘要
- 关键状态提取
- 必要的内容类型标识

例如：

#### 文本 note

- title
- 前 2～4 行 excerpt

#### checklist note

- title
- 完成度 `3/8`
- 前 3 个 item

#### rich note

- title
- 首段摘要
- badge：`Checklist` / `Image` / `Code` / `Table`

#### 图片型 note

- cover image
- 一行摘要
- 图片数量或附件标记

所以卡片态本质上是一个“语义预览”，不是“缩小正文”。

---

## 5. 方案对比

## 5.1 方案 A：Markdown 作为主存储

### 方案说明

- 磁盘 canonical 仍然是 `.md`
- focused view 可以是 Typora-like 或富文本编辑体验
- 卡片态展示独立 preview

### 优点

- 文件可读
- git diff 友好
- 本地优先很自然
- AI、搜索、导出都更容易接
- 与普通文件系统 / markdown 生态兼容性更强

### 缺点

- markdown 表达能力有限
- 如果编辑器功能做得太强，很容易超出 markdown 可表达范围
- 富文本编辑器和 markdown 之间的 round-trip 可能有损

### 适合场景

- 想保留本地文件可读性
- 笔记内容仍以文本、标题、列表、checklist 为主
- 未来 AI、搜索、导出都更强调“文本友好”

---

## 5.2 方案 B：TipTap / ProseMirror JSON 作为主存储

### 方案说明

- 磁盘主存储改为结构化 JSON
- focused view 原生使用 TipTap / ProseMirror
- 卡片态仍然不要直接渲染全文，而是单独 preview projection

### 优点

- 编辑器能力最自然
- schema 扩展性强
- 更适合复杂 block、嵌入、自定义组件
- 以后做 slash command、AI inline rewrite、comment、mention 都更顺

### 缺点

- 文件不再可读
- git diff 体验差很多
- schema/version/migration 成本会长期存在
- 搜索、AI、导出都需要额外转换层

### 适合场景

- 未来要明显走向 Notion / Miro 风格 rich block 系统
- 会有大量自定义 block 和复杂嵌套布局
- 文件系统可读性不是核心诉求

---

## 5.3 方案 C：混合路线（推荐）

### 方案说明

将“存储”“编辑”“预览”彻底分层：

- **存储层**：继续保持 markdown / markdown-compatible 为主
- **编辑层**：focused view 升级为更强的编辑器
- **预览层**：卡片只展示派生 preview 数据

### 优点

- 兼顾文件可读性与编辑体验
- 最贴合当前项目演化路径
- 对 AI / 搜索 / 本地持久化更友好
- 不需要现在就全面押注 JSON canonical

### 缺点

- 需要接受一个边界：编辑器能力要控制在“markdown 可表达子集”附近
- 需要额外维护 preview projection

### 为什么这是当前项目更适合的方向

因为当前项目本质上是：

- 空间化画布
- 本地文件持久化
- 卡片密度高
- focused view 和 card view 明显是两种交互场景

这类产品更需要的是：

- 清晰的内容边界
- 快速卡片识别
- 轻量卡片渲染
- 强 focused 编辑

而不是让所有层都绑定成一个“编辑器格式决策”。

---

## 6. 对当前项目的推荐结论

## 6.1 短中期推荐

### 推荐方向

1. **磁盘层保持可读**
   - 继续以 markdown / markdown-compatible 为主

2. **focused 编辑层增强**
   - 在 focused view 中引入更强的编辑器
   - 但先限制在 markdown 能较好承载的子集里

3. **卡片层独立 preview**
   - 卡片不直接渲染完整正文
   - 卡片只展示 preview projection

4. **数据模型升级**
   - 正文和 preview 分开

5. **加载策略优化**
   - 画布初始加载只拿 preview
   - 打开 focused view 时再懒加载 full note

### 一句话建议

> 不要把“存储格式”“编辑器”“卡片缩略渲染”绑成同一个决策。
> 对这个项目更合理的方向是：**正文单独存，编辑器单独强，卡片单独预览。**

---

## 7. 建议的数据模型（v2 草案）

可以考虑把 note 从当前的：

```ts
frontmatter + body: string
```

升级成一种更明确的结构。

```ts
type NoteDocumentV2 = {
  meta: {
    id: string;
    title?: string;
    kind: 'text' | 'checklist' | 'rich';
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
    color?: string;
  };
  storage: {
    format: 'markdown' | 'pm-json';
    body: string | Record<string, unknown>;
  };
  preview: {
    contentType: 'text' | 'checklist' | 'rich';
    text: string;
    excerpt?: string;
    checklist?: {
      total: number;
      checked: number;
      topItems: Array<{ text: string; checked: boolean }>;
    };
    coverImage?: string;
    badges?: string[];
  };
};
```

### 设计重点

- `storage` 是正文的真实存储
- `preview` 是卡片展示专用投影
- 不要让卡片直接依赖 editor document 全量渲染

---

## 8. 卡片 preview 的推荐规则

## 8.1 text card

- title
- `excerpt` 截断到 80～160 字符
- 最多 3～4 行

## 8.2 checklist card

- title
- `checked / total`
- 前 3 个 item
- 可选进度条或 badge

## 8.3 rich card

- title
- 首段摘要
- badge：`Image` / `Code` / `Table` / `Checklist`

## 8.4 image-heavy card

- cover image
- 一行 caption / excerpt
- 图片数 badge

---

## 9. 关于 “TipTap 要不要上” 的判断

## 9.1 可以上，但不建议立刻把它当成 canonical storage

如果未来要提升 focused 编辑体验，TipTap 是可以认真考虑的。

但更推荐的用法是：

> **先把 TipTap 当成编辑层，不要立刻把它升级成存储层。**

也就是说：

- focused view 用 TipTap
- note 文件仍保持 markdown / markdown-compatible
- 卡片仍然只读 preview projection

## 9.2 什么时候该认真考虑 JSON canonical

如果未来出现这些需求，可以再评估把主存储升级为 ProseMirror JSON：

- 复杂自定义 block 越来越多
- markdown round-trip 经常丢失结构
- 强依赖高保真所见即所得
- 需要复杂嵌套布局 / 任意 block 组合
- 文件可读性已经不再重要

只要这些条件还没明显成立，就没必要过早切过去。

---

## 10. 当前架构里一个更值得优先处理的问题

比“用 markdown 还是 tiptap”更应该先解决的是：

> **不要在 canvas 初始加载时，把所有 note 全文都 hydrate 成 card data。**

### 当前问题

目前 `loadCanvas()` 会读取 note 文件并把正文 hydrate 到 card data。

当正文还是纯文本时问题不大；但一旦内容变富：

- 首屏加载会变重
- canvas store 会装下太多正文数据
- 卡片层和正文编辑层耦合太深

### 更合理的方向

#### 画布加载时

只加载：

- noteId
- title
- excerpt / preview
- checklist progress
- cover / badge

#### 打开 focused view 时

再懒加载：

- full body
- 富文本结构
- 附件细节

### 收益

- 首屏更轻
- 卡片多时更稳
- renderer store 更干净
- 后续编辑器升级更自由

---

## 11. Preview 放在哪里更合适

这个问题值得单独留意。

### 方案 A：preview 放在 note frontmatter

优点：

- 单一来源
- 多个画布共享同一份 preview
- 文件仍然可读

缺点：

- 加载 preview 时仍需要读 note 文件
- 大量 note 时首屏 I/O 仍会增长

### 方案 B：preview 放在 manifest node data

优点：

- 画布加载时最轻
- 不必读取全文 note 文件

缺点：

- 同一 note 在多个 view 中会有重复 preview
- note 更新后要同步多个 view 引用

### 方案 C：单独 preview index / cache

优点：

- 性能最佳
- 与 note 正文和 view manifest 解耦

缺点：

- 复杂度最高
- 需要额外索引维护机制

### 对当前项目的建议

短期建议：

- 先把 preview 放在 **frontmatter** 或 note 层可快速读取的位置
- 当卡片量明显增加后，再考虑做独立 preview cache / index

这样比较稳，不会一开始就把系统做复杂。

---

## 12. 推荐演进路径

## Phase 1：先做 preview 分层

目标：不换编辑器，先把架构边界拉开。

建议做法：

- note 增加 preview 字段
- 卡片只吃 preview 数据
- focused view 仍维持现有编辑方式
- canvas 初始加载不再强依赖全文 hydrate

## Phase 2：focused view 升级编辑器

目标：提升编辑体验，但不急着改 canonical storage。

建议做法：

- 在 focused view 引入更强的编辑器
- 能力先收敛在 markdown 子集内
- 保存时生成稳定的 note 正文 + preview

## Phase 3：再决定是否需要 rich JSON canonical

目标：只有在 markdown 明显成为瓶颈时，才升级主存储。

判断信号包括：

- 频繁出现 markdown 无法表达的内容结构
- preview 和 full editor 的转换越来越脆弱
- editor 能力越来越依赖富 schema

---

## 13. 最终结论

如果只保留一句结论：

> 对这个画布产品来说，**note 的存储层、编辑层、预览层应该分开设计。**

当前阶段最推荐的方向是：

- **存储层**：继续保持 markdown / markdown-compatible，可读、利于 AI 和本地文件系统
- **编辑层**：focused view 引入更强的编辑体验，不要求用户直接写 markdown
- **预览层**：卡片态只展示摘要投影，不渲染完整正文
- **加载策略**：卡片只拿 preview，全文按需加载

这条路线对当前项目最稳，也最符合它作为“空间化画布”而不是“纯富文本编辑器”的产品定位。

---

## 14. 后续可以继续补的内容

如果决定继续深入，下一步可以单独再写两份文档：

1. **note v2 TypeScript 数据结构草案**
2. **markdown 路线 vs TipTap 路线技术选型表**

这样就能从“方向分析”进一步落到“可实施设计”。
