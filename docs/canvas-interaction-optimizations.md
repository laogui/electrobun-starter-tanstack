# 画布交互优化清单

> **来源**：基于 2026-06-06 对 `src/mainview/routes/index.tsx`、`canvasStore`、各节点组件及 [`product-detail-roadmap.md`](./product-detail-roadmap.md) 的代码走查。
> **范围**：主画布（React Flow）、FolderView、FocusedView、拖入/粘贴、键盘与多选等**交互层**可改进项；不含纯视觉打磨（已归入 Phase 10）或 bun 侧数据生成。
> **使用方式**：按 P0 → P1 → P2 推进；P3 为长期项或路线图已明确推迟项。每项可独立开 issue / PR。

---

## 0. 当前基线（已实现，作回归参照）

| 能力 | 状态 | 主要文件 |
|---|---|---|
| 节点拖拽 + 吸附对齐线 | ✅ | `useHelperLines.ts`、`HelperLines.tsx` |
| Group / Folder 收纳 + 排斥 | ✅ | `useNodeDrag.ts` |
| 空格防误拖节点 | ⚠️ 部分 | `useSpacePanMode.ts`（见 P0-1） |
| 全屏文件拖入蒙层 | ✅ | `routes/index.tsx`（`isDraggingFile`） |
| 右键菜单（单选 / 多选 / 边） | ✅ | `ContextMenu.tsx`、`useContextMenu.ts` |
| FocusedView 翻页 + 图片缩放 | ✅ | `FocusedView.tsx`、`useImageZoomPan.ts` |
| 软删除 + Undo toast | ✅ | `useCanvasKeyboard.ts`、`canvasStore.ts` |
| 视口持久化 | ✅ | `canvasStore.ts`、`useCanvasPersistence.ts` |

> **文档勘误**：[`product-detail-roadmap.md`](./product-detail-roadmap.md) Phase 6 仍将 H2（全屏 Drop zone）标为未实现；代码已在 `routes/index.tsx:1002-1015` 落地，开 Phase 6 后续项前建议同步更新路线图状态。

---

## 1. 优先级总览

| 优先级 | 数量 | 主题 |
|---|---|---|
| **P0** | 4 | 日常操作手感（平移、选中、键盘导航） |
| **P1** | 6 | 路线图遗留 + 性能 + 冷启动 |
| **P2** | 5 | 子视图与节点级抛光 |
| **P3** | 5 | 长期体验 / 已推迟项 |

**建议落地顺序**：P0-1 → P0-2 → P0-3 + P0-4 → P1-5 + P1-6 → P1-7 + P1-8 → P1-9 + P1-10 → P2 按需。

---

## 2. P0 · 直接影响日常手感

### P0-1 · 空格 + 拖拽平移未真正生效

**现象**：按住空格时节点不可拖（`nodesDraggable={!(spacePanActive || …)}`），但 `panOnDrag` 恒为 `false`，无法在空白区域拖动画布。纯鼠标用户只能依赖滚轮平移（`panOnScroll={true}`），与 Figma / FigJam 类「空格 + 拖 = 平移」预期不符。

**相关代码**：

- `src/mainview/routes/index.tsx:838, 861`
- `src/mainview/hooks/useSpacePanMode.ts`

**建议**：

```tsx
panOnDrag={spacePanActive}
selectionOnDrag={!spacePanActive && !editableInteractionLocked}
```

空格模式下关闭框选，避免拖动画布时误框选。

**验收**：按住空格在空白处拖拽可平移；松开空格恢复框选；编辑 input / contentEditable 时空格行为不变。

**预估**：0.5 天

---

### P0-2 · Folder 单击即打开，无法「只选中」

**现象**：`onNodeClick` 对 `folder` 类型直接 `setFocusedFolder`，与其他节点「单击选中、双击 / Enter 打开」不一致。无法将 Folder 纳入多选后批量操作，也无法单击选中而不进入 FolderView。

**相关代码**：

- `src/mainview/routes/index.tsx:611-624`（`onNodeClick`）
- `src/mainview/routes/index.tsx:595-609`（`onNodeDoubleClick` 已有打开逻辑）

**建议**：单击仅选中；双击或 Enter 打开 FolderView（`useCanvasKeyboard` 已对 folder 走 `setFocusedFolder`）。

**验收**：单击 Folder 只出现选框；双击 / Enter 进入 FolderView；Shift+单击可多选 Folder。

**预估**：0.5 天

---

### P0-3 · 方向键选中后视口不跟随

**现象**：`selectNodeInDirection` 只更新 `selected`，不像搜索跳转那样 `setCenter`。目标节点在视口外时，方向键导航「选中了但看不见」。

**相关代码**：

- `src/mainview/store/canvasStore.ts:814-876`
- 对照：`src/mainview/routes/index.tsx:447-450`（搜索跳转时的 `setCenter`）

**建议**：选中后检测节点是否在视口内（可用 `rfInstance.getNodes` + viewport 换算）；不可见时 `setCenter(cx, cy, { duration: 180 })`。

**验收**：画布上有 10+ 节点且视口偏一时，按方向键始终能看到新选中节点。

**预估**：0.5–1 天

---

### P0-4 · 方向键不支持 Shift 扩展多选

**现象**：方向键总是单选替换，无法 Shift + 方向键扩展选区。

**相关代码**：`src/mainview/store/canvasStore.ts:814-876`、`useCanvasKeyboard.ts:194-207`

**建议**：`selectNodeInDirection(direction, { extend: e.shiftKey })`；extend 模式下保留已选节点并追加新目标。

**验收**：Shift + ↑↓←→ 扩展选区；无 Shift 时行为与现网一致。

**预估**：0.5 天

---

## 3. P1 · 路线图遗留 + 性能 + 冷启动

### P1-5 · 导入 Markdown（路线图 H3）

**现象**：Bun RPC `importMarkdownFiles` 与 i18n `menu_import_markdown` 已就绪，但 `creatableNodes.ts` / `ViewSwitcher` / 右键「新建」子菜单未接入。右键有导出 Markdown，缺对称导入入口。

**相关代码**：

- `src/mainview/lib/rpc.ts`（`importMarkdownFiles`）
- `src/mainview/lib/creatableNodes.ts`
- `src/mainview/components/canvas/ViewSwitcher.tsx`
- `src/bun/index.ts`（RPC 实现）

**建议**：在 `getCreatableMenuItems` 或 ViewSwitcher CreateMenu 增加「Import markdown…」；调 RPC 后在光标/视口中心创建 BlockNote 卡片。

**验收**：从 CreateMenu 选文件 → 画布出现可编辑笔记卡；`bun run test` 覆盖 RPC wrapper。

**预估**：1 天（含 UI + 测试）

**路线图**：Phase 6 / H3

---

### P1-6 · 多选「批量移到 view」（路线图 G5 遗留）

**现象**：多选右键已支持批量改色、加 tag、删除；跨 view 迁移未实现。

**相关代码**：

- `src/mainview/hooks/useContextMenu.ts:276-315`
- `src/mainview/components/canvas/ContextMenu.tsx`（多选分支）

**建议**：多选菜单增加「Move to view…」→ 二级列表当前 workspace 内其他 view → 将选中节点序列化写入目标 view manifest（或抽 `moveNodesToView` store action）。

**验收**：选中 3 张卡 → 移到另一 view → 原 view 消失、目标 view 出现且位置合理。

**预估**：1–2 天

**路线图**：Phase 6 / G5（方案决策曾标为不在验收内，可按需求重启）

---

### P1-7 · 缩放性能：每节点 `useViewport()`（路线图 L1）

**现象**：Card / Image / Link / Asset / Sticky / Folder 各自 `useViewport()` 计算 `isZoomedOut`（`zoom < 0.4`）。缩放手势触发所有节点 re-render，30+ 卡时易卡顿。

**相关代码**：6 个 `*Node.tsx`、`FolderNode.tsx`；路线图 Phase 9 / L1

**建议**：新建 `ZoomLevelContext`（Provider 在 `routes/index.tsx`，~100ms throttle 写 `isZoomedOut`）；节点改读 context。

**验收**：Profiler 录 30 张卡 + 缩放手势，节点 commit 数下降 ≥80%（路线图 Phase 9 验收标准）。

**预估**：1–2 天

---

### P1-8 · Link 预览按需加载（路线图 L4）

**现象**：`LinkNode` 在 `useEffect` 挂载即 `rpcUnfurlLink`，无 `IntersectionObserver`。大量 link 卡同时进入视野会并发请求。

**相关代码**：`src/mainview/components/canvas/nodes/LinkNode.tsx:318-373`

**建议**：仅在节点 ≥50% 可见时触发 unfurl；卸载时 abort；保留 `unfurlAttemptRef` 防重复。

**验收**：30 张 link 卡滚入视野 → 网络面板无瞬间 30 并发。

**预估**：0.5–1 天

---

### P1-9 · 空画布引导（路线图 J7）

**现象**：新 view 或清空后只有网格，无「创建第一张卡 / 选模板 / 拖入文件」引导。

**建议**：新建 `EmptyCanvasOverlay.tsx`，`nodes.length === 0` 时居中展示 placeholder + 常用模板 chip + `/` 或 `⌘N` 提示。

**相关代码**：`routes/index.tsx`；模板列表可参考 `ViewSwitcher.tsx` `getQuickTemplateItems`

**预估**：1–2 天

**路线图**：Phase 10 / J7

---

### P1-10 · MiniMap 选中态高亮（路线图 J8）

**现象**：MiniMap `nodeColor` 统一 `#ddd`，选中节点无法在缩略图中辨认。

**相关代码**：`src/mainview/routes/index.tsx:879-891`

**建议**：`nodeColor={(n) => n.selected ? '#3b82f6' : '#ddd'}`（或读 theme token）。

**预估**：0.5 天

**路线图**：Phase 10 / J8

---

## 4. P2 · 子视图与节点级抛光

### P2-11 · FolderView 交互偏薄

**现状**：

- 子卡右键仅「移出 folder」（`getFolderChildItems`）
- 无键盘 ←/→ 切换子卡
- 无拖拽排序
- 横向滚动仅鼠标拖拽，无触控板友好提示
- 固定 `350×450` + `gap 48`，子卡多 / 小屏易挤

**相关代码**：`src/mainview/components/canvas/FolderView.tsx`、`ContextMenu.tsx:119-121`

**建议方向**：补子卡删除/改色/复制；键盘导航；可选 reorder；响应式 card 宽度。

**预估**：2–3 天

---

### P2-12 · Sticky 交互边界不清晰

**现状**：

- 不能进 Folder（`canAbsorbIntoFolder` 对 sticky 为 false），拖上去无明确反馈
- 不能进 FocusedView（`isFocusableNode('sticky')` 为 false），仅画布 inline 编辑
- 单击即编辑 + `stopPropagation`，干扰框选 / 多选

**相关代码**：

- `src/mainview/lib/canvasUtils.ts`（`canAbsorbIntoFolder`）
- `src/mainview/components/canvas/nodes/StickyNode.tsx`

**建议方向**：拖入 Folder 时 toast 说明；或扩展 registry 允许 sticky 进 folder；考虑双击编辑、单击选中；或提供 Sticky 轻量 Focused 模式。

**预估**：1–2 天（视产品决策）

---

### P2-13 · 拖入 / 粘贴体验

**现状**：

- 全屏蒙层 `pointer-events-none`，落点无光标跟随预览
- 多文件落点固定 `+28px` 偏移，文件多时堆叠
- `paste` 事件仅识别 URL 建 link，不支持剪贴板图片 / 文件

**相关代码**：`src/mainview/routes/index.tsx:218-236, 539-554, 691-728`

**建议**：蒙层显示落点 ghost；多文件网格或螺旋偏移；`clipboardData.files` / image item 走 `createAssetsFromFiles`。

**预估**：1–2 天

---

### P2-14 · 连线 Handle 可发现性

**现状**：四向 Handle（`NodeHandles.tsx`）默认较隐蔽，新用户不易发现可拉连线。

**建议**：节点选中时高亮 Handle；hover 放大热区；可选首次 onboarding 提示。

**相关代码**：`src/mainview/components/canvas/nodes/_shared/NodeHandles.tsx`

**预估**：0.5–1 天

---

### P2-15 · 网格吸附无法关闭

**现状**：`snapToGrid` + `snapGrid={[24, 24]}` 写死开启。

**相关代码**：`src/mainview/routes/index.tsx:866-867`；Settings `GeneralPanel` 已有画布背景等项

**建议**：Settings → General 增加「吸附网格」开关，写入 `appSettingsStore` 后传给 ReactFlow。

**预估**：0.5 天

---

## 5. P3 · 长期体验 / 路线图已推迟

| ID | 项 | 说明 | 路线图 |
|---|---|---|---|
| P3-16 | 多选对齐工具 | 需新 UI 概念（对齐工具栏），优先级低于 G5 多选菜单 | H4，明确推迟 |
| P3-17 | 自定义快捷键 | Settings Shortcuts 面板只读 cheatsheet | Phase 8 决策 |
| P3-18 | 中键拖拽平移 | 未实现；部分 CAD/设计工具用户有预期 | — |
| P3-19 | FocusedView 动画性能 | 进入/退出仍可用 layout 属性；高负载下可能掉帧 | Phase 9 / L2 |
| P3-20 | a11y focus ring | 右键菜单、ViewSwitcher 等 Tab 焦点环不完整 | Phase 10 / J3 |

---

## 6. 与现有路线图的映射

| 本清单 ID | 路线图 Phase / ID | 备注 |
|---|---|---|
| P0-1 | — | 新发现，未入原审计 |
| P0-2 | — | 新发现 |
| P0-3 / P0-4 | — | 新发现 |
| P1-5 | Phase 6 / H3 | RPC 就绪，UI 未接 |
| P1-6 | Phase 6 / G5 | 曾标不在验收内 |
| P1-7 | Phase 9 / L1 | |
| P1-8 | Phase 9 / L4 | |
| P1-9 | Phase 10 / J7 | |
| P1-10 | Phase 10 / J8 | |
| P2-15 | — | 可并入 Phase 8 General |
| P3-16 | Phase 6 / H4 | 推迟 |
| P3-19 | Phase 9 / L2 | |
| P3-20 | Phase 10 / J3 | |

---

## 7. 建议 PR 切分

```
PR-A  P0-1 + P0-2           空格平移 + Folder 选中语义     ~1 天
PR-B  P0-3 + P0-4           方向键视口跟随 + Shift 多选    ~1 天
PR-C  P1-5                  Import Markdown UI             ~1 天
PR-D  P1-6                  批量移到 view                  ~1–2 天
PR-E  P1-7 + P1-8           性能 pass（zoom context + IO） ~2 天
PR-F  P1-9 + P1-10          空画布 + MiniMap 选中          ~2 天
PR-G  P2（按需）            FolderView / Sticky / 拖入等   分批
```

每项 PR 验收：`bun run test && bun run check` 全绿；交互改动附简短录屏或截图。

---

> 本文档随实现进度更新状态列。合并相关 PR 时请在 PR 描述引用对应 ID（如 `Implements canvas-interaction P0-1`）。