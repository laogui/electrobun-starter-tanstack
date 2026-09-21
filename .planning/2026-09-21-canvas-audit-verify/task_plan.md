# Task Plan: Canvas audit fixes

## Goal

把已核对可修的画布审计问题全部修掉：P1 交互、确定的 UX 瑕疵、低风险性能项。不改滚轮缩放设计，不合并拖拽双 setNodes。

## Next Step

无。可修项已落地并通过定向测试、type-check 与 lint。

## Current Phase

Phase 6

## Phases

### Phase 1–4: 核对

- **Status:** complete

### Phase 5: 实现全部可修项

- [x] P1: group active、helper-line 参照、便签光标
- [x] UX: 右键空白清选择、单击清残留多选、边标签单击、GroupNode cursor、resize 类泄漏、菜单钳制、defaultEdgeOptions、选中自定义色边
- [x] Perf: metadata select、ContextMenu 门控、applyCanvasNodeChanges、topic context、ImageNode 查询缓存
- [x] 更新测试
- **Status:** complete

### Phase 6: 验证

- [x] 定向测试、type-check、lint
- **Status:** complete

## Decisions Made

| Decision | Rationale |
|---|---|
| 不改 panOnScroll / zoomOnScroll | 有意设计，无设置项需求 |
| 不合并 helperLines + repulsion 的两次 setNodes | React 同事件会批；改动面大 |
| 右键空白与普通单击打开时清选择 | 与左键空白、菜单目标同步，避免 Delete 误伤 |
| ImageNode fallback 用模块级 Promise 缓存，不用 react-query | 测试 mock RPC 且无 QueryClient；主路径仍由 host 水合 thumbnail |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| textareaCaret 测试缺 jsdom | 1 | 加 `// @vitest-environment jsdom` |
| ContextMenu `useLayoutEffect` 未导入 | 1 | 补 React import |
| 大聚合 Vitest 无输出挂起 | 1 | 改成分文件定向跑 |
| type-check 编译 paraglide 改了 runtime.js | 1 | 还原生成文件 |
