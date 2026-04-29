# 搜索功能方案

## 结论

先实现 **后端按需扫描搜索**，暂不引入搜索索引库。

搜索模块运行在 Bun 主进程中，按需扫描 workspace 配置、所有 view 的 canvas manifest，以及 `content/` 下的 Markdown 笔记。核心不是只扫 Markdown，而是先建立 `noteId/nodeId/viewId` 的映射，再把 Markdown 正文命中结果映射回画布上的节点，前端才能完成跨 view 跳转和定位。

等笔记规模明显增长、需要模糊搜索/拼写纠错/复杂排序时，再评估 MiniSearch 或 SQLite 索引。

---

## 现状分析

项目当前没有搜索功能。数据是 local-first 文件系统存储：

- workspace 配置：`.ghostboard/workspace.json`
- 每个画布 view：`.ghostboard/views/*.canvas.json`
- card 正文：`content/**/*.md`
- 附件：`attachments/`

Card 节点的正文不会长期完整保存在 manifest 中。保存 manifest 时，Bun 侧会把 card 内容写入 Markdown 文件，并在 manifest 节点里只保留 `noteId/file/type` 等引用信息。因此，只搜索前端 Zustand store 或 manifest，无法稳定覆盖笔记正文。

### 可搜索实体

| 实体 | 存储位置 | MVP 搜索字段 | 定位目标 |
|------|----------|--------------|----------|
| Card（文本笔记） | Markdown + manifest | title、body、tag、tags、createdAt | node |
| Card（清单） | Markdown + manifest | title、清单项文本、tag、tags | node |
| Card（饼图/特殊 card） | manifest 或 Markdown frontmatter | title、pieData[].label、tag | node |
| Sticky 便签 | manifest | content | node |
| Folder | manifest | title、subtitle | node |
| Group | manifest | label | node |
| Image 节点 | manifest + attachment | title | node |
| Edge 连接 | manifest | label（顶层）/ data.label | source/target 中点或 source node |
| View | workspace.json | name | view |

MVP 可以先实现 node 和 view 搜索。Edge 搜索可以作为第二步，因为 edge 的定位和选中交互需要额外定义。

注意：当前 `ManifestEdge.label` 是顶层字段（见 `src/bun/manifest.ts`），不是 `data.label`。前端 React Flow 也可能在 `edge.data.label` 上挂自定义文本。Edge 搜索实现时要同时兼容这两处，避免漏匹配。

---

## 方案对比

### 方向 1：前端内存搜索

搜索当前已 hydrate 的 Zustand store。

优点：

- 无需新增 Bun 侧逻辑。
- 对当前 view 的短文本字段响应最快。
- 可作为后端搜索的本地兜底或当前 view 增量补充。

缺点：

- 只能搜当前 view。
- 搜不到未 hydrate view。
- 搜不到已经被抽到 Markdown 文件里的完整正文。
- 结果不能代表磁盘上的完整 workspace。

适合做附加能力，不适合作为主搜索方案。

### 方向 2：后端按需扫描搜索（推荐）

在 Bun 主进程新增搜索 RPC，扫描 workspace 文件并返回可定位的搜索结果。

优点：

- 能覆盖所有 view。
- 能搜索 Markdown 正文。
- 和当前文件系统架构匹配。
- 不需要维护索引一致性。

缺点：

- 需要新增 Bun 侧搜索模块、RPC 契约和前端交互。
- 搜索结果必须和 manifest join，不能只返回 Markdown 文件命中。
- 当前编辑内容存在 debounce 保存，需要处理数据新鲜度。

这是 MVP 推荐方案。

### 方向 3：索引搜索

引入 MiniSearch、FlexSearch 或 SQLite FTS。

优点：

- 支持更好的排序、模糊匹配、字段权重和大数据量查询。
- 可做增量索引和高级搜索语法。

缺点：

- 引入新的依赖和数据结构。
- 需要处理索引更新、重建、迁移和损坏恢复。
- 当前规模下复杂度过高。

只作为长期方案。

---

## MVP 目标

1. `Cmd+K` / `Ctrl+K` 打开搜索弹窗。
2. 输入关键词后搜索所有 view 的笔记正文和短文本节点。
3. 结果显示标题、view 名称、命中摘要、命中字段。
4. 点击结果：
   - 同 view：定位并选中目标节点。
   - 跨 view：保存当前 view，切换 view，等待 hydrate 完成，再定位目标节点。
5. 无 Electrobun RPC 的浏览器调试环境下，降级为当前 view 内存搜索。

非目标：

- 暂不做拼音搜索。
- 暂不做复杂搜索语法。
- 暂不做持久化索引。
- 暂不搜索附件图片内容。

---

## 后端设计

### 新增文件

- `src/bun/search.ts`：后端搜索纯逻辑。
- `src/bun/search.test.ts`：搜索模块单元测试。

不要在 `src/bun/manifest.ts` 注册 RPC handler。`manifest.ts` 当前是纯 manifest load/save 模块。RPC 类型和 handler 应注册在 `src/bun/index.ts` 的 `CanvasRPC` 和 `BrowserView.defineRPC` 中。

### RPC 契约

在 `src/bun/index.ts` 的 `CanvasRPC.bun.requests` 中新增：

```ts
searchCanvas: {
  params: {
    query: string;
    viewId?: string;
    limit?: number;
  };
  response: SearchResult[];
};
```

在 `src/mainview/lib/rpc.ts` 中新增：

```ts
export async function rpcSearchCanvas(
  query: string,
  options?: { viewId?: string; limit?: number }
) {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.searchCanvas({
    query,
    viewId: options?.viewId,
    limit: options?.limit,
  });
}
```

### SearchResult 类型

搜索结果必须能直接支持 UI 展示和画布定位：

```ts
export type SearchResultKind =
  | 'note'
  | 'sticky'
  | 'folder'
  | 'group'
  | 'image'
  | 'edge'
  | 'view';

export type SearchMatchField =
  | 'title'
  | 'body'
  | 'tag'
  | 'content'
  | 'label'
  | 'subtitle'
  | 'viewName'
  | 'createdAt';

export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  viewId: string;
  viewName: string;
  nodeId?: string;
  edgeId?: string;
  noteId?: string;
  title: string;
  excerpt: string;
  matchField: SearchMatchField;
  score: number;
  position?: { x: number; y: number };
}
```

`id` 可以是稳定组合，例如：

- `note:${viewId}:${nodeId}:${matchField}`
- `node:${viewId}:${nodeId}:${matchField}`
- `view:${viewId}`

### 搜索流程

`searchWorkspace(wsPath, params)` 的推荐流程：

1. 规范化 query：
   - `trim()`
   - 空字符串直接返回 `[]`
   - 默认大小写不敏感：用 `query.toLowerCase()` 后 `String.indexOf` 比较即可。
   - CJK 友好说明：`toLowerCase()` 对中文是 no-op，`indexOf` 按 codepoint 比较，中文搜索天然能用。**不要**做 word boundary 检测或英文词干提取，否则中文短语会匹配失败。MVP 不做拼音/分词。
2. 读取 workspace config：
   - 获取所有 views
   - 如果传入 `viewId`，只搜索该 view
3. 读取每个 view 的 manifest。
4. 建立映射：
   - `noteId -> Array<{ viewId, viewName, node }>`
   - `nodeId -> { viewId, viewName, node }`
   - `edgeId -> { viewId, viewName, edge }`
5. 搜索 manifest 短文本：
   - sticky `data.content`
   - folder `data.title` / `data.subtitle`
   - group `data.label`
   - image `data.title`
   - card manifest 中仍存在的 `data.title` / `data.tag`
   - view name
6. 扫描 `content/**/*.md`：
   - 复用现有 frontmatter/body 解析能力。当前 `src/bun/notes.ts` 中的 `parseFrontmatter` 和 `listFilesRecursive` 是模块私有的；实施时优先把 `searchNotes` 写在 `notes.ts` 内部直接复用，不必扩大 API 表面。如果搜索逻辑放在新文件 `src/bun/search.ts`，再把这两个函数 `export` 出来。
   - 用 frontmatter `id` 找回所有引用该 note 的 node。
   - 对 title、tag、tags、createdAt、body 做匹配。
   - body 匹配前先做 Markdown 清洗，避免命中代码块/链接 URL 等噪声：
     - 去除 ``` 围栏代码块和行内 `` ` `` 代码。
     - 图片 `![alt](url)` 直接整段替换为空。
     - 链接 `[text](url)` 只保留 `text`。
     - 行首 `#` 标题符、`- [x]` / `- [ ]` 任务前缀去掉。
     - **保守处理强调符号**：只剥成对的 `**bold**` / `*italic*` / `~~del~~` 标记（用类似 `\*\*([^*]+)\*\*` → `$1` 的形式），不要无差别 `replaceAll(/[*_~]/g, '')`，否则正文里的 `foo_bar` 会被破坏成 `foobar` 造成漏命中。
     - 多空白合并为单空格。
     - 命中位置在**清洗后**文本上计算，excerpt 也从清洗后文本切片返回，前端直接渲染该字符串即可。
7. 生成 excerpt：
   - title/tag 命中：返回命中字段自身或 body 前段。
   - body 命中：返回命中位置前后固定字符，例如前后各 48 字符。
   - Markdown 可以先做纯文本近似，不必在 MVP 中完整 AST 解析。
8. 排序：
   - title 命中 > tag 命中 > body 命中 > 其他字段。
   - 当前 view 结果可适当加权。
   - 同分按 updatedAt/createdAt 或原始顺序。
9. 截断到 `limit`，默认 50。

### 数据新鲜度

后端搜索扫描的是磁盘。当前编辑可能还没写盘，因为：

- note 保存有 debounce。
- manifest 保存有 debounce。

前端执行搜索前应尽量 flush 当前 view：

- 保存当前 manifest：复用 `sanitizeForPersistence` + `rpcSaveManifest(activeViewId, nodes, edges)`。
- 正在 focused editor 中编辑的 note 应在关闭搜索前或执行搜索前触发 flush。若实现成本较高，MVP 至少要在文档和 UI 行为里接受“当前正在编辑的未 flush 字符可能短暂搜不到”。

更好的 MVP 做法：

- 搜索 RPC 返回磁盘结果。
- 前端再叠加当前 view 内存搜索结果，用 `nodeId + matchField` 去重。
- 这样当前 view 的未落盘短文本和正文也能被搜到。

---

## 前端设计

### 新增文件

- `src/mainview/components/search/SearchDialog.tsx`
- `src/mainview/components/search/SearchDialog.test.tsx`
- `src/mainview/hooks/useSearch.ts`
- `src/mainview/hooks/useSearch.test.tsx`

### UI 依赖选择

项目当前已有 `@base-ui/react`，但没有 `cmdk` runtime 依赖。

两种可选做法：

1. 新增 `cmdk`，再用 shadcn Command 风格实现。
2. 不新增依赖，用 Base UI Dialog/Popover + 自定义 input/listbox 实现。

推荐 MVP 先用现有依赖实现，除非确认 `cmdk` 的交互价值值得增加依赖。

### 搜索入口

在 `useCanvasKeyboard` 中加入：

- `Cmd+K` / `Ctrl+K` 打开搜索。
- 输入框聚焦时不要触发现有全局快捷键。
- 搜索弹窗打开时，`Escape` 优先关闭搜索弹窗。

不要让搜索快捷键和现有 `Cmd+N`、`Cmd+A`、`Cmd+Z` 行为互相抢事件。

### 组件挂载位置

`SearchDialog` 建议挂在 `CanvasComponent` 内部、`ReactFlowProvider` 之下。这样搜索结果点击后可以使用 React Flow instance 做定位。

当前 `CanvasComponent` 已经维护 `rfInstance`，也可以把定位函数作为 prop 传给 `SearchDialog`。

### 点击结果定位

同 view：

1. 清除当前 focused node/folder。
2. 选中目标 node 或 edge。
3. 调用 React Flow instance 定位：
   - node：`setCenter(nodeCenterX, nodeCenterY, { zoom, duration })`
   - edge：定位到 source/target 中点，或先定位 source node
4. 可短暂高亮目标节点。

跨 view：

1. 先保存当前 view manifest。
2. 写入 `pendingSearchTarget`：

```ts
interface PendingSearchTarget {
  viewId: string;
  nodeId?: string;
  edgeId?: string;
}
```

3. 调用 `setActiveView(viewId)`。
4. 等待新 view hydrate 完成。
5. 在 effect 中消费 `pendingSearchTarget`，找到目标 node/edge 后定位。
6. 消费后清空 pending target，避免重复定位。

注意：`setActiveView(viewId)` 会清空 nodes/edges 并把 `_hydrated` 设为 false，所以不能在调用后立即定位。

### 浏览器调试降级

`rpcSearchCanvas()` 返回 `null` 时，说明不在 Electrobun RPC 环境。此时 `useSearch` 应降级为当前 view 内存搜索：

- 遍历 `useCanvasStore.getState().nodes`
- 搜索 `data.title` / `data.content` / `data.tag` / `data.tags` / `data.label` / `data.subtitle`
- 只返回当前 view 结果

这样 `bun run hmr` 或普通浏览器调试时搜索 UI 仍可用。

---

## MVP 实施步骤

1. 后端搜索核心：
   - 新增 `src/bun/search.ts`
   - 实现 `searchWorkspace(wsPath, params)`
   - 添加 `src/bun/search.test.ts`
2. RPC 接入：
   - 更新 `src/bun/index.ts` 的 `CanvasRPC`
   - 在 `BrowserView.defineRPC` handlers 中加入 `searchCanvas`
   - 更新 `src/mainview/lib/rpc.ts`
   - 更新 `src/mainview/lib/rpc.test.ts`
3. 前端搜索状态：
   - 新增 `useSearch`
   - 支持 debounce、loading、error、RPC fallback
4. 搜索弹窗：
   - 新增 `SearchDialog`
   - 支持快捷键打开、输入、结果列表、空状态、loading 状态
5. 定位逻辑：
   - 同 view 直接定位
   - 跨 view pending target 等 hydrate 后定位
6. 测试：
   - 后端搜索结果覆盖 Markdown + manifest + view name
   - RPC wrapper payload 正确
   - 搜索弹窗键盘交互
   - 跨 view 选择结果时不会在未 hydrate 状态下定位
7. 验证：
   - `bun run test`
   - `bun run type-check`

---

## 测试清单

### 后端

- 空 query 返回空数组。
- 大小写不敏感匹配。
- 递归搜索 `content/**/*.md`。
- Markdown body 命中能映射回正确 `viewId + nodeId`。
- 同一个 note 被多个 view/node 引用时返回可定位结果。
- sticky/folder/group/image 的 manifest 字段可搜索。
- view name 可搜索。
- 不存在的 note 文件不会让搜索失败。
- 损坏 manifest 或异常文件的处理策略明确：MVP 可以跳过并 `console.warn`。

### 前端

- `Cmd+K` / `Ctrl+K` 打开搜索。
- 输入框聚焦时不会触发画布删除、复制、粘贴等快捷键。
- RPC 不可用时降级当前 view 内存搜索。
- 点击同 view 结果会选中并定位节点。
- 点击跨 view 结果会先切 view，hydrate 后定位。
- loading、空结果、错误状态都可见且不会阻塞关闭弹窗。

---

## 长期演进

当出现以下情况时，再考虑索引：

- 笔记数量达到几百到上千，并且按需扫描出现明显延迟。
- 需要模糊搜索、拼写纠错、字段权重调参。
- 需要高亮所有命中位置。
- 需要复杂过滤，例如按 view、tag、类型、时间范围组合筛选。

优先候选：

- MiniSearch：轻量、纯 JS、适合本地应用。
- SQLite FTS：适合更大规模和持久化索引，但迁移和维护成本更高。

索引方案应基于当前 MVP 的 `SearchResult` 契约演进，避免重写前端搜索 UI 和定位逻辑。
