# 剩余测试缺口清单

## 结论先说

当前项目已经不属于“广泛缺测试”的状态，而是进入“少量高价值边界待补 + 一批低价值展示组件未补”的阶段。

如果继续投入，建议优先做 P1 级别的高性价比补强，不建议为了表面覆盖率继续扩张低收益测试。

## 当前基线

- 全量测试命令：`bun run test`
- 当前结果：`28` 个测试文件通过，`164` 个测试通过
- 测试体系状态：稳定，可持续维护

## P1：仍值得继续补的高价值缺口

### 1. `src/bun/index.ts` 的 `loadCanvas` / `saveManifest` 深层边界

相关文件：

- `src/bun/index.ts`

当前已覆盖：

- `getMainViewUrl`
- `waitForDevServer`
- `loadSettings`
- `persistSettings`
- View RPC 小分支
- Settings RPC 小分支
- Attachment RPC 小分支

建议继续补：

#### `loadCanvas`

- manifest 找不到 view 时返回 `null`
- 图片节点存在 `imageFile` 但附件文件不存在时的分支
- card 节点有 `noteId` 但 note 文件不存在时的分支
- note 存在时 `noteToCardData` 的 hydration 合并是否正确

#### `saveManifest`

- `viewId` 不存在时返回 `{ success: false }`
- image 节点保存时剥离 `imageUrl`、保留 `imageFile`
- card 节点已有 `noteId` 时走更新分支
- card 节点无 `noteId` 时走新建 note 分支
- `writeManifest` 最终写出的 manifest node 结构是否只保留引用字段

优先理由：

- 这是 Bun 持久化主链路的核心
- 出问题会直接影响数据落盘与再次加载恢复
- 业务价值明显高于继续补纯展示组件

### 2. `useContextMenu` 更细粒度的剩余动作分支

相关文件：

- `src/mainview/hooks/useContextMenu.ts`

当前已覆盖：

- pane / node / edge 菜单状态
- `new-note`
- `paste`
- `reset-zoom`
- `copy`
- `delete`
- `change-color`
- `new-child`
- edge 的常见 action
- `focus` / `open-folder`
- rect 缺失提前返回

建议继续补：

- `new-folder`
- `new-sticky`
- `new-group`
- `new-image`
- sticky / group 的随机色分支稳定断言
- `copy` 时剥离 `isHidden` / `isDropTarget` 的清洗细节
- `toggle-edge-path-type` 从 `bezier` 切回 `smoothstep` 的反向分支

优先理由：

- action 多，回归风险高
- 增补成本可控，收益直接

### 3. `useNodeDrag` 的 group 拖拽复杂分支

相关文件：

- `src/mainview/hooks/useNodeDrag.ts`

当前已覆盖：

- `dragStart` 脱离 parent
- `dragging` 命中 folder `dropTarget`
- `dragStop` 收进 folder `children`

建议继续补：

- group 拖拽命中另一个 group 时的 parent 归属逻辑
- `isDescendant` 防止循环嵌套分支
- group 移动时 push aside 其他内容节点的逻辑
- stop 后 group 归属 target group 的位置换算
- `originalPositionsRef` 的恢复逻辑

优先理由：

- 逻辑复杂，改动后容易引入回归
- 但 mock 成本较高，因此放在 P1 末位

### 4. `FocusedView` 的真实编辑细节

相关文件：

- `src/mainview/components/canvas/FocusedView.tsx`

当前已覆盖：

- 文本卡片渲染
- 图片渲染
- 编辑回写最小闭环
- 关闭行为

建议继续补：

- 真实 `CardContent` 的 `contentEditable` blur 更新
- 点击内容层不应冒泡关闭
- mount / unmount 时 body `overflow` 恢复
- image focused 模式的展示契约

优先理由：

- 已有主路径保障
- 再补主要是交互细节稳固

## P2：可以补，但收益一般

### 5. `FolderView` 的拖拽 / 滚动交互细节

相关文件：

- `src/mainview/components/canvas/FolderView.tsx`

建议继续补：

- `handleMouseDown` / `handleMouseMove` / `handleMouseUp`
- 拖动后 `click capture` 阻止误触发
- subtitle / title 回退显示
- sticky child 的专门渲染分支

说明：

- 更偏交互体验细节
- 业务收益低于 Bun 持久化链路与复杂 hook

### 6. `router.tsx` / `__root.tsx` 的更多异常分支

相关文件：

- `src/mainview/router.tsx`
- `src/mainview/routes/__root.tsx`

建议继续补：

- 设置加载失败时的回退行为
- `settings-updated` 事件 payload 异常值分支
- notFound / error fallback 更具体的断言

说明：

- 当前主流程已覆盖
- 再补主要是异常完备性提升

### 7. `rpc.ts` 的异常传播细节

相关文件：

- `src/mainview/lib/rpc.ts`

建议继续补：

- 个别 RPC reject 时是否原样向上抛
- `isRpcAvailable` 在初始化异常后的重复调用表现
- Electrobun 对象缓存失效 / 重建边界

说明：

- 当前主干覆盖已经足够
- 再补是为了增强回归保护

## P3：不建议继续投入太多的缺口

### 8. 纯展示组件 / 低逻辑组件

例如：

- `Loader`
- 单纯按钮 / 壳层类组件
- 各类 node 的纯展示外观部分
- 只做样式拼装的组件

原因：

- 测试容易变成脆弱断言
- 对真实业务回归帮助有限

### 9. `src/bun/index.ts` 的 `main()` 整体启动单测

相关文件：

- `src/bun/index.ts`

原因：

- 外部依赖太重
- mock 成本高
- 测试脆弱，维护成本大
- 当前已把可稳定拆分的小分支测得较完整，继续强测整体收益不高

## 推荐后续顺序

如果后续继续补，建议按如下顺序推进：

1. `src/bun/index.ts` 的 `loadCanvas` / `saveManifest`
2. `useContextMenu` 剩余动作分支
3. `useNodeDrag` 的 group 拖拽复杂分支
4. `FocusedView` / `FolderView` 的交互细节
5. 其他低优先级模块

## 最简决策建议

如果目标是“阶段性收尾”，当前可以先停。

原因是：

- `bun run test` 已全绿
- 高风险主链路大部分已有覆盖
- 剩余缺口主要是边界增强与低收益项

如果后续继续投入，优先建议从 `src/bun/index.ts` 的 `loadCanvas/saveManifest` 开始。
