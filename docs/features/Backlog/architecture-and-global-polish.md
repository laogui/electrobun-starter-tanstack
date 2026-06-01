# 架构与全局优化

> 迁移自 `docs/ux-optimization-audit.md`（2026-05-26 审计）
> 仅保留经代码核对后确认仍未实现的 P2 打磨项

---

## 代码架构

### `src/bun/index.ts` 单文件过长

**优先级**: P2

所有 RPC handler 注册在一个文件里。每加一个功能都要改这个文件。

**建议**: 按业务域拆分为 `handlers/canvas.ts`、`handlers/settings.ts`、`handlers/template.ts`。

### 主路由 `index.tsx` 过长

**优先级**: P2

画布页面的全部逻辑集中在一个组件中。

**建议**: 提取 `useCanvasDragDrop`、`useCanvasExport`、`useCanvasInit` 等自定义 hooks。

---

## 主题与视觉一致性

### 深色主题覆盖不完整

**优先级**: P2

已知不兼容区域:
- Group label 文字颜色
- 部分 placeholder 文本颜色
- FolderNode 翻页角（固定紫色渐变，单独列入 `node-and-media-polish.md`）

**建议**: 逐组件审查 `dark:` variant 使用。

### Shadow 一致性 — StickyNode 是离群点

**优先级**: P2

| 节点类型 | 默认 shadow | Hover shadow | Transition |
|----------|-------------|--------------|------------|
| CardNode | `shadow-card` | `hover:shadow-card-hover` | ✅ |
| ImageNode | `shadow-card` | `hover:shadow-card-hover` | ✅ |
| AssetNode | `shadow-card` | `hover:shadow-card-hover` | ✅ |
| LinkNode | `shadow-card` | `hover:shadow-card-hover` | ✅ |
| **StickyNode** | `shadow-card` | **无** | **无** |

**备注**: StickyNode 在设计上保留扁平阴影（便签不应有 hover 抬起感）可能是有意的，但与其余四类交互节点不一致。需产品确认设计意图后决定是否对齐。

---

## 用户引导

### 没有 onboarding / 引导流程

**优先级**: P2

首次打开应用 seed 了 `quick-start` 模板，但没有任何浮层引导。

**建议**: 在首次启动时显示 3-4 步引导浮层：
1. 「拖拽平移画布」
2. 「双击卡片进入编辑」
3. 「右键创建新内容」
4. 「Cmd+K 搜索」
