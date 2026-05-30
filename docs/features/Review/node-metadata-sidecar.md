# Node metadata sidecar（Plan C — Phase 1）

> 落地 ADR 0001 第一步：把节点元数据（tag / tagColor / tags）从 `.md` frontmatter 搬到统一 sidecar。

## 一、问题

旧链路有两个不兼容的存储：

- card 类型：`tag / tagColor / tags` 写在 `content/<note>.md` frontmatter
- 非 card（sticky / image / link / asset）：理论上要写进 `manifest.canvas.json` 的 `node.data`

这导致：

- `listAllTags` / 重命名 / 删除 要分别扫两个数据源
- frontmatter 用手写 YAML parser 表达数组，脆弱
- 跨视图 / 库 / 画布 batch 操作要遍历大量文件

## 二、目标

- 单一 SoT：`.ghostboard/node-metadata.json`
- 所有节点类型 tag 统一从一份数据走
- 启动时一次性 load，运行时全部走内存缓存
- 写盘 debounce + atomicWrite，最差 500ms 落地

## 三、数据结构

```
<wsPath>/.ghostboard/node-metadata.json
```

```json
{
  "schema": "ghostboard-node-metadata/v1",
  "entries": {
    "note_abc123": { "tag": "Work", "tagColor": "#fcd34d", "tags": ["api", "h1"] },
    "sticky-xyz":   { "tags": ["idea"] },
    "image-def":    { "tags": ["mood"] }
  }
}
```

Key 规则：

- card 节点：以 `noteId` 为 key（tag 跟着 note 走，不绑画布）
- 非 card：以 React Flow `nodeId` 为 key
- 删除节点时同步删 entry（renderer 在 `removeNode` 调用 `rpcDeleteNodeMetadata`）

## 四、Bun API

`src/bun/nodeMetadata.ts`：

```ts
loadAllMetadata(wsPath): Promise<NodeMetadataMap>          // 启动时调，懒加载缓存
setNodeMetadata(wsPath, id, partial): Promise<void>        // 合并，debounced flush
deleteNodeMetadata(wsPath, id): Promise<void>
listAllTagsFromMetadata(wsPath): Promise<TagSummary[]>
renameTagEverywhere(wsPath, oldName, newName): Promise<{ updated }>
deleteTagEverywhere(wsPath, name): Promise<{ updated }>
```

`tags.ts` 缩为对 nodeMetadata 的薄 wrapper（保留导出名，避免上游改动）。

## 五、RPC

```ts
loadNodeMetadata: () => NodeMetadataMap
setNodeMetadata: ({ id, metadata }) => { success }
deleteNodeMetadata: ({ id }) => { success }
// 复用既有：listTags / renameTag / deleteTag
```

## 六、Renderer

新 hook `useNodeMetadata()`（TanStack Query，`['node-metadata']`）：

- 启动时一次性 load
- `setMetadata(id, partial)` 做 optimistic update + 调 RPC + invalidate
- `getMetadata(id)` selector

切换点：

| 旧代码 | 新代码 |
|---|---|
| `data.tag` / `data.tags` 在节点组件里直接读 | `useNodeMetadata().get(id)?.tag / tags` |
| `TagEditor onChange` → `commitNodeData(id, { tag, tags })` | → `setNodeMetadata(id, { tag, tags })` |
| `useSearch.searchCurrentView` 读 `node.data.tags` | 读 metadata map |
| `activeTagFilter` 对比 `data.tag/tags` 做 dim | 对比 metadata.get(id).tags |

## 七、删除迁移代码（pre-launch）

不写一次性迁移。要求：

- 开发本地 workspace 数据由开发者清理
- 演示模板（`src/bun/templates/*`）改成新格式：
  - 模板 `.md` 不再有 `tag/tagColor`
  - 模板 `manifest.canvas.json` 不再有 `data.tag/tagColor`
  - 新增 `TemplateManifest.nodeMetadata: Record<placeholderId, NodeMetadata>`
  - `populateViewFromTemplate` 在 noteId remap 后写入 workspace metadata

## 八、非 card 节点 UI 接入

4 个组件（StickyNode / ImageNode / LinkNode / AssetNode）每个：

- 顶部 / 旁侧渲染 chip 行（zoomedOut 不渲染）
- 监听 `editingTagNodeId === id` 打开 `<TagEditor>`
- `ContextMenu` 列表加 `{ id: 'edit-tag', ... }`
- 读 `activeTagFilter` 做透明度

抽通用 hook `useTagFilterDim(nodeKey)`，5 个节点共用。

## 九、测试覆盖

- `nodeMetadata.test.ts` — load / save / atomic / cache / listAllTags / rename / delete
- 现有 `tags.test.ts` 大部分用例迁移过去（保留 wrapper 的烟雾测试）
- `CardNode.test.tsx` / `TagEditor.test.tsx` / `TagSidebar.test.tsx` 切 mock
- 4 个非 card 节点测试：chip 渲染 + edit-tag 触发
- `useNodeMetadata.test.tsx`

## 十、验收

- 卡片 tag 编辑 → 立即体现在 sidebar / 其他视图
- 4 类非 card 节点都能加 tag 并参与筛选
- 重命名 / 删除 tag 覆盖所有节点类型
- `bun run test` 全绿（除既有 `attachments.test.ts` 环境问题）
- `bun run type-check` 项目代码 0 错误
- workspace 重启后所有 tag 恢复
