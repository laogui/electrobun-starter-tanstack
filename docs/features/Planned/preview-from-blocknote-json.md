# Preview from BlockNote JSON（Plan C — Phase 2）

> 落地 ADR 0001 第二步：卡片预览（previewHtml / previewExcerpt / previewBlocks）改从 BlockNote sidecar JSON 派生，不再走 Markdown body。

## 一、问题

`src/bun/preview.ts` 的 `writeNoteWithPreview()` 当前从 Markdown body 解析生成预览：

- 任何 BlockNote 高级块（嵌套块、自定义块、callout、未来自定义类型）在 Markdown 投影时丢失结构
- 预览看到的是被简化后的版本，和用户在 focused view 看到的对不上
- 包括 image / file / video / audio 块，Markdown mirror 写出 `![](attachments/…)` 后预览只能渲染图片块，文件 / 音视频 attachment 无预览

## 二、目标

- 卡片预览源切换为 sidecar JSON
- 既有 `previewHtml / previewExcerpt / previewBlocks / previewVersion` 字段语义不变（Bun 仍写 frontmatter）
- 不要求 renderer 持有 BlockNote editor 实例
- 保持卡片渲染路径（`NotePreview`）不变 — 仍只消费 `previewHtml`

## 三、技术方案

### 3.1 Bun 侧 serializer

新增 `src/bun/blocknotePreview.ts`：

- 输入：`blocks: BlockNoteBlock[]`（从 sidecar JSON 直接读）
- 输出：`{ previewHtml, previewExcerpt, previewBlocks }`
- 实现 A：基于 `@blocknote/core` 的 `Server`-side serializer（如果 Bun 环境可用）
- 实现 B：手写一个有限子集 → HTML 的 walker（更安全，可控）

> 第一版先用 B（受控的安全子集），等覆盖率验证后再考虑接 `@blocknote/core`。

支持块类型最小集：

- paragraph / heading / bulletListItem / numberedListItem / checkListItem
- codeBlock / quote / image / video / audio / file
- 未识别块 → 占位 `<div class="bn-unknown">[block: <type>]</div>`

inline 处理：

- text styles（bold/italic/code/underline/strike）
- links（白名单 protocol，严格 escape）
- mentions（保留 plain text）

### 3.2 `writeNoteWithPreview` 重构

- 旧签名：`(wsPath, file, frontmatter, body)`，从 body 派生
- 新签名：`(wsPath, file, frontmatter, body, blocks)`
  - 优先从 blocks 派生
  - blocks 为 undefined（兼容老路径）时回退 body 派生 — 后续 Phase 3 删除回退
- `saveBlockNote` RPC 在 sidecar 写完后传 blocks 给 `writeNoteWithPreview`

### 3.3 旧 markdown-derived 路径

保留到 Phase 3：

- 没有 sidecar 的 note（迁移期）继续走 body 派生
- 完整切换后只剩 blocks 派生

## 四、测试

- `blocknotePreview.test.ts`：每种支持块的 round-trip 输出（输入 fixture → 期望 HTML）
- 安全：恶意 link / `javascript:` / 嵌套深度爆炸 / 异常字符全部 escape
- `writeNoteWithPreview.test.ts`：blocks 路径优先
- `CardNode.test.tsx`：previewHtml 含 image / file 块时正确渲染

## 五、风险

- BlockNote schema 升级时 serializer 需要跟进 → 在 sidecar 写 `schema: 'ghostboard-blocknote/v1'`，serializer 按 schema 分支
- HTML 安全：所有用户输入字符串通过 `escapeHtml` + 受限属性白名单
- 性能：大笔记的 preview 生成时间 → 同 Markdown 路径量级

## 六、不在范围

- 卡片直接挂 BlockNote editor 实例（仍只挂在 focused view）
- 卡片视图支持交互式 checklist / link click（继续是只读）
- preview 增量更新（继续每次 save 重新生成全文）

## 七、依赖

依赖 Phase 1 已经完成，不再依赖 frontmatter 携带 tag/tagColor（preview 不再生成 tag chip — chip 改由 renderer 从 metadata 直接渲染在卡片外层）。

## 八、验收

- focused 编辑高级块后，卡片预览能正确渲染（不是降级版）
- 删除卡片正文 → 预览也清空
- image / video / audio / file 块在卡片预览中显示对应占位
- 全部测试通过
