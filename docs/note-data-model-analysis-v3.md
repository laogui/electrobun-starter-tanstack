# Note 数据模型分析 v3 — 缩略图渲染策略与存储格式决策

> v3 在 v2 基础上，聚焦讨论两个关键问题：
>
> 1. 卡片大小不固定，缩略图无法预存摘要 — 那怎么展示？
> 2. 在缩略图里渲染完整内容，性能怎么样？

---

## 1. v2 的一个问题：contentPlain 预存摘要不可行

v2 方案建议在存储时同时保存 `contentPlain` 字段作为缩略图摘要文本。

**问题：卡片大小不固定。**

- 用户可以拖拽改变卡片宽高
- 卡片变大 → 应该展示更多内容
- 卡片变小 → 应该展示更少内容
- 预存的固定长度摘要无法适应动态尺寸

所以 `contentPlain` 预存摘要的思路行不通。缩略图能展示多少内容取决于卡片当前宽高，不是取决于存储时的一个固定截断长度。

---

## 2. 正确的缩略图思路：CSS overflow 裁剪

关键认知：**不需要预计算"展示多少"，CSS overflow 就是天然的裁剪机制。**

Notion、Obsidian、Miro 的卡片缩略图做法一致——没有一个预计算摘要，都是渲染后裁剪。

数据结构只需要一个字段：

```ts
interface CardTextData {
  type: 'text';
  title: string;
  content: string; // Markdown — 编辑和持久化的主格式
  color: string;
}
```

不需要 `contentPlain` 字段。缩略图的问题是渲染策略问题，不是数据格式问题。

---

## 3. 性能分析：缩略图里渲染完整内容

假设 canvas 上可见 30 个卡片，每个卡片内容 500 字：

### 3.1 markdown 解析性能

- markdown-it 解析单次 <1ms
- 30 个卡片 ~30ms
- **不是瓶颈**

### 3.2 DOM 渲染性能 — 这是真正的压力点

- 500 字 markdown → HTML 可能产生 50-100 个 DOM 节点
- 30 个卡片 = 1500-3000 个额外 DOM 节点
- 对比当前 skeleton lines — 每个缩略图只有 5 个 div
- **多了几十倍 DOM 数量**

如果缩略图完整渲染 markdown → HTML，性能会显著下降。

---

## 4. 最终方案：三级渐进渲染

核心思路：不同视图级别用不同渲染精度，与当前 zoom 阶梯保持一致。

| 视图                | 渲染方式                                                 | DOM 量        | 性能                     |
| ------------------- | -------------------------------------------------------- | ------------- | ------------------------ |
| 缩略图 (zoom < 0.4) | **strip markdown → 纯文本**，小字号 + `overflow: hidden` | ~10 个节点    | 和现在 skeleton 一样轻量 |
| Canvas 非聚焦卡片   | markdown → 简化 HTML（只保留段落/粗体/列表）             | ~30-50 个节点 | 中等                     |
| FocusedView         | 完整编辑器                                               | 不限          | 按需加载                 |

### 4.1 "strip markdown" 不是渲染

是极轻量的字符串处理——去掉 `#`、`**`、`>` 等标记，保留纯文本。

```ts
// 示例：几行正则的 strip 函数，0 DOM 开销
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '') // 标题标记
    .replace(/\*{1,2}(.*?)\*{1,2}/g, '$1') // 粗体/斜体
    .replace(/^>\s+/gm, '') // 引用标记
    .replace(/^[-*+]\s+/gm, '') // 无序列表标记
    .replace(/^\d+\.\s+/gm, '') // 有序列表标记
    .replace(/`{1,3}(.*?)`{1,3}/g, '$1'); // 行内代码
}
```

缩略图把 strip 后的纯文本放进和卡片同尺寸的容器，小字号 + `overflow: hidden`。卡片越大自然看到越多。这和现在 skeleton lines 的思路本质一样——容器有固定宽高，内容超出就隐藏。只不过从"假线条"变成"真实内容被裁剪"。

### 4.2 性能对比

和当前实现基本一致：

- 缩略图：~10 个 DOM 节点（和现在 skeleton placeholder 相当）
- 甚至比现在更好 — 真实文字比 skeleton placeholder 信息密度高
- 不需要在保存时预计算任何东西

### 4.3 中间态（Canvas 非聚焦卡片）

使用 markdown-it 的 subset 渲染，只启用必要插件：

- paragraph
- bold / italic
- list (有序/无序)
- code_inline

bundle ~5KB，DOM 量可控（~30-50 个节点）。

---

## 5. 为什么 Markdown 仍是最佳存储格式

基于以上渲染策略分析：

1. **人类可读** — 数据文件直接可读可编辑，符合用文件系统存 note 的设计
2. **渐进式引入编辑器** — 先用简易 markdown 预览，后续可替换编辑层，数据格式不变
3. **缩略图零成本** — strip 函数几行代码，无需任何渲染器
4. **中间态轻量渲染** — markdown-it subset ~5KB
5. **未来可迁移** — 如果需要 Tiptap，编辑态用 Tiptap，save 时 `editor.getMarkdown()` 导出 markdown。JSON 只做编辑态中间格式，不是持久化格式

---

## 6. 存储格式对比总结（含缩略图策略）

| 方案                                | 编辑体验                | 缩略图渲染                                       | 中间态渲染         | 性能              | 复杂度 |
| ----------------------------------- | ----------------------- | ------------------------------------------------ | ------------------ | ----------------- | ------ |
| 纯 Markdown + strip                 | Typora 式即时预览编辑器 | strip → 纯文本裁剪                               | markdown-it subset | 好                | 低     |
| Tiptap JSON                         | 所见即所得富文本        | 需从 JSON 提取纯文本摘要，或用 Tiptap 渲染精简版 | Tiptap 渲染器      | 较差（bundle 大） | 高     |
| 混合（Tiptap 编辑 + Markdown 存储） | Tiptap 所见即所得       | strip → 纯文本裁剪                               | markdown-it subset | 好                | 中     |

混合方案本质和纯 Markdown 方案的渲染策略一样，只是编辑层更强。**存储格式决定了缩略图的实现难度，Markdown 在这方面明显优于 JSON。**

---

## 7. 与 v2 的变更总结

v2 → v3 的关键修正：

1. **去掉 contentPlain 预存摘要** — 卡片大小不固定，无法预计算截断长度
2. **缩略图用 CSS overflow 裁剪** — 不需要预计算，容器大小决定展示量
3. **缩略图渲染用 strip markdown 而非 markdown→HTML** — 避免 DOM 数量几十倍增长
4. **三级渐进渲染策略** — 缩略图(纯文本) / 卡片态(轻量 markdown) / 聚焦态(完整编辑器)
5. **性能分析** — DOM 数量是瓶颈，不是解析速度；strip 纯文本和现在 skeleton 同量级

---

## 8. 下一步

决定方向后可以着手：

1. 实现 `stripMarkdown()` 函数
2. 替换缩略图的 skeleton placeholder 为真实内容裁剪
3. 引入 markdown-it subset 用于非聚焦卡片态
4. 为 focused view 评估编辑器选型（Typora-like vs Tiptap）
