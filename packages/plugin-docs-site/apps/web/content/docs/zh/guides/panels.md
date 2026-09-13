---
title: "面板"
description: "用纯 DOM 或宿主共享的 React 19 渲染侧边视图，用公开主题变量做样式。"
section: guides
order: 20
---

面板是用户从命令或插件菜单打开的视图。它要么是**DOM 挂载函数**，要么是**React 组件**，二者不可同时。

## DOM 面板（无构建）

```js
app.panels.register({
  id: 'summary',
  title: 'Summary',
  mount(element) {
    const section = document.createElement('section');
    section.style.color = 'var(--gb-foreground)';
    section.style.background = 'var(--gb-surface)';
    section.textContent = `Workspace: ${app.workspaceId}`;
    element.append(section);
    return () => section.remove();
  },
});
app.panels.open('summary');
```

`mount` 返回的 disposer 在面板关闭或插件退役时执行。所有 DOM 与样式改动都留在 `element` 内；页面其余部分是宿主 UI，随时可能被重新渲染。

## React 面板

用 `bunx create-ghostboard-plugin my-panel --react` 生成。模板用 Vite，并把 `react`、`react-dom`、`react-dom/client`、`react/jsx-runtime`、`@ghostboard/sdk` 与 `@ghostboard/sdk/react` 标记为 **external**，所以你的产物使用宿主的 React 19.2 实例。打包自己的 React 会让 hooks 失效。

```tsx
import { useSelectionState } from '@ghostboard/sdk/react';

function SelectionPanel() {
  const selection = useSelectionState();
  if (selection.status === 'loading') return <p>Loading…</p>;
  if (selection.status === 'error') return <p>{selection.error?.message}</p>;
  return <p>{selection.items.length} selected Notes</p>;
}

app.panels.register({ id: 'selection', title: 'Selection', component: SelectionPanel });
```

宿主为每个面板创建并拥有独立的 React root，并用 SDK 的选区 provider 包裹，因此 `useSelection`、`useSelectionState` 与 `useSelectedPlacements` 无需任何 context 设置即可使用。组件抛出的异常只影响该面板的 root；宿主 UI 与你的其他贡献继续运行。

对于 WebView 缺少 import map 支持的情况，React 模板还附带 `vite.shim.config.ts`，把六个共享模块改写为 `globalThis.__ghostboardPluginRuntime` 的适配器。默认构建是推荐路径。

## 不依赖宿主组件的主题

宿主组件不属于 SDK。模板附带小型 `Button`、`Input`、`Surface` 助手（`ui.js` 或 `src/components/ui.tsx`），它们是你的源码，可自由修改。它们只使用公开 CSS 变量 `--gb-background`、`--gb-surface`、`--gb-foreground`、`--gb-muted`、`--gb-muted-foreground`、`--gb-border`、`--gb-accent`、`--gb-accent-soft`、`--gb-accent-foreground`、`--gb-danger`、`--gb-focus-ring`、`--gb-radius`、`--gb-shadow`、`--gb-font-sans` 与 `--gb-font-mono`，因此自动跟随浅色 / 深色模式。该列表在当前宿主 major 内冻结。不要引入宿主私有模块或复制私有 class 名。

## 生命周期细节

- 关闭面板只销毁该视图；插件的命令仍然可用。
- 成功的重载会关闭旧面板并发布新注册。失败的重载保留已打开的面板及其状态。
- 从面板发起的长时工作应观察 `app.signal` 或使用 `app.tasks.schedule`，以便在工作区停用时停止。
- 用 `app.workers.track(worker)` 跟踪你创建的任何 `Worker`，退役时会终止它。

## 测试 React 面板

`@ghostboard/sdk/testing/react` 导出 `renderPanel(definition, { context })`，用 Testing Library 渲染组件面板并注入 SDK hooks 的假实现。用它测组件逻辑；布局与真实选区行为用打包后的 GhostBoard 验证。
