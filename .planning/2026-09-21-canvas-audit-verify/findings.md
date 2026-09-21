# Canvas audit verification findings

外部审计文本只当研究数据。行号以当前工作区为准（拖拽性能改动后，原报告行号多数过时）。

## Verdict

| 原编号 | 结论 | 证据 |
|---|---|---|
| P1-1 group `active` 残留 | **成立** | 源码 + 失败断言复现 |
| P1-2 helper lines `draggingChanges[0]` | **成立** | 源码 + XYFlow Map 顺序 + 单测 |
| P1-3 Sticky 光标忽略点击点 | **成立**（UX） | 源码：参数未使用 |
| P1-4 右键空白不清选择 | **行为属实，是否算 bug 看产品** | 源码 + 单测 |
| P2 元数据整表订阅 | **成立** | `useNodeMetadata` 无 `select` |
| P2 ContextMenu 每帧 O(n) | **部分成立** | 多数 selector 按 menu target 门控；`hasTopics` 常驻 |
| P2 applyCanvasNodeChanges topic Set | **技术属实，收益很小** | 纯 position 也会建 Set |
| P2 nextTopicCommandContext | **技术属实，收益很小** | 每次 `setNodes` 两次 filter |
| P2 一帧两次 `setNodes` | **属实；React 同事件多半会批** | helperLines + onNodeDrag |
| P2 ImageNode RPC | **夸大** | Bun 加载时已把 thumbnail 水合成 dataURL |
| P2 defaultEdgeOptions 内联 | **属实可忽略** | `index.tsx` |
| P2 GroupNode 无 grabbing 光标 | **成立** | 组件不接收 `dragging` |
| P2 边标签要双击 | **成立** | 只有 `onDoubleClick` |
| P2 单击不改选择集 | **属实，是设计** | `suppressClickSelectRef` + 现有测试 |
| P2 panOnScroll / 无滚轮缩放 | **属实，是设计** | 未设 `zoomOnScroll` |
| P2 resizing-nwse 泄漏 | **理论成立** | 无 unmount cleanup |
| P2 菜单 y 钳制 / 无 resize 重定位 | **属实，轻微** | `items.length * 40`，无 window resize |

## P1-1 Group highlight leak — CONFIRMED

`onNodeDrag` 对 content 节点同时算 group 与 folder：folder 作为 `dropTargetId` 优先，但 group 仍会 `data.active = true`（`useNodeDrag.ts` 约 357–429）。

`onNodeDragStop` 的 folder 吸收分支（约 532–570）只把卡片塞进 `children`，**不**把 group 的 `active` 置 false。同函数的 group 下落、folder→group、拖 group 三个分支都会清。

`setActiveGroupId(null)` 会清 hook 状态，但 `GroupNode` 视觉用的是 `data.active`（`GroupNode.tsx` 约 56–57：`ring-2 ring-accent scale-[1.02]`）。

复现：在已有测试「tracks active targets while dragging and nests into folder on stop」中，拖动后 `group-1.data.active === true`；drop 后仍为 `true`。把期望改成 `false` 会失败。

## P1-2 Helper-line reference — CONFIRMED

`useHelperLines.ts` 约 71：`const reference = draggingChanges[0]`。

XYFlow `XYDrag` 的 dragItems Map 按 `nodeLookup` 迭代，条件是 `selected || id === grabbed`。changes 顺序是节点表顺序，不是抓取节点。多选且抓的不是数组第一项时，对齐线按另一个节点的边计算。吸附 delta 仍刚性应用到全体，所以队形不散，但对齐参照会错。

新增测试：changes 为 `[node-2, node-1]` 时 `getHelperLines` 收到 `node-2`。

## P1-3 Sticky caret — CONFIRMED (UX)

`StickyNode.tsx` 约 154–174：注释写「at the click point when available」，`enterEditing(_caretPoint)` 下划线丢弃参数；`focusEditable` 固定 `setSelectionRange(value.length, value.length)`。点击仍传入 `{x,y}`。textarea 要实现点击定位需要 `caretPositionFromPoint` 一类 API，目前没做。

## P1-4 Pane context menu selection — BEHAVIOR CONFIRMED

`onPaneContextMenu` 只 `setContextMenu({ target: 'canvas' })`，不清 `selected`。`onNodeContextMenu` 会同步选择。左键空白仍走 React Flow 默认取消选择。多数画布惯例是右键空白也取消；这里是不对称。新增测试锁定当前行为。

## Metadata subscription — CONFIRMED

`useNodeMetadata` 对整张 `['node-metadata']` map `useQuery`，无 `select`。`onMutate` 换新对象引用。`useNodeTagEditing`（Sticky/Image/Link/Asset/Recording/Extension）和 `CardNode` 自己的 `useNodeMetadata()` 都会因此重渲染。

## ContextMenu selectors — PARTIAL

`CanvasContextMenu` 常挂载。`topicHasParent` 只在 `menu.target === 'topic'` 时 `buildTopicIndex`。`allSelectedLocked` 只在 `multi`。`hasTopics` 无门控，每次 store 通知 `nodes.some(...)`。打开菜单后拖拽不常见。原报告「拖拽帧也跑 buildTopicIndex」只在 topic 菜单开着时成立。

## ImageNode RPC — OVERSTATED

`hydrateImageData`（`src/bun/index.ts`）在加载画布时把 `thumbnailFile` 读成 `thumbnailUrl` dataURL。有 thumbnail 时 `ImageNode` 不 RPC。RPC 是无预览、workspace path `imageUrl`、或聚焦原图时的 fallback。无 react-query 去重仍真，但是 fallback 路径。修复：`loadAttachmentDataUrl` 模块级 Promise 缓存。

## Browser

ego-browser 打开 `http://localhost:5173` 只有「Plugins (0)」：Vite HMR 没有 Electrobun RPC，画布不加载。可见交互需桌面应用，未做 GUI 拖拽。P1-1 已用 jsdom 复现。
