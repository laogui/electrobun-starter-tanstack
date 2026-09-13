---
title: "自定义画布类型"
description: "注册一种新卡片：带校验与版本的状态、用于搜索和导出的摘要，以及带宿主备份的迁移。"
section: guides
order: 30
---

自定义画布类型是用户可以放到画布上的卡片。插件拥有组件与状态形状；GhostBoard 拥有持久化、revision、搜索索引、预览与插件缺失时的回退。

## 最小计数卡片

```js
import { createElement } from 'react';

function CounterCard({ context, state, updateState }) {
  return createElement(
    'button',
    {
      type: 'button',
      disabled: context.readOnly,
      onClick: () => updateState({ count: state.count + 1 }),
    },
    `Count: ${state.count}`
  );
}

app.canvas.registerType({
  id: 'counter',
  title: 'Counter',
  dataVersion: 1,
  component: CounterCard,
  createInitialState: () => ({ count: 0 }),
  validateState: (state) =>
    Boolean(state && typeof state === 'object' && !Array.isArray(state) &&
      typeof state.count === 'number'),
  summarize: (state) => ({
    title: `Counter: ${state.count}`,
    plainText: `Counter value ${state.count}`,
  }),
});
```

持久化的类型名是 `<pluginId>/<id>`。`createElement` 避免了构建步骤；`--react` 与 `--combined` 模板展示 JSX 和更丰富的计分卡。

## 契约

| 成员 | 作用 |
| --- | --- |
| `dataVersion` | 状态形状的整数版本。形状变化时递增。 |
| `createInitialState()` | 新放置卡片的状态。 |
| `validateState(state)` | 类型守卫。持久化状态是不可信输入；拒绝任何意外形状。 |
| `migrateState(state, fromVersion)` | 把旧状态转换为当前形状。提高 `dataVersion` 时必需。 |
| `summarize(state)` | `title` 与 `plainText`，用于搜索、无障碍、预览、导出，以及插件缺失或停用时。 |
| `component` / `previewComponent` | 在卡片内渲染，以及（可选）在紧凑预览中渲染。 |
| `surface` | 默认 / 最小 / 最大尺寸、`resizable`，以及 `openBehavior: 'detail'` 获得聚焦视图。 |

`updateState(next)` 提交新的 revision 并返回它。只在瞬时交互帧（拖动滑块）中传 `{ history: 'ephemeral' }`，并以一次记录的更新收尾，让撤销有合理的步长。

## 插件缺失时会怎样

插件停用或卸载后，卡片保留其状态、摘要与搜索文本。用户看到摘要占位；什么都不会被删除。重新启用插件即恢复实时组件。

## 迁移与恢复

加载 `dataVersion` 较旧的卡片时，GhostBoard 先写入 **preimage**（宿主拥有的旧状态备份），再调用 `migrateState` 并以新 revision 保存结果。如果备份写入失败，迁移不会运行。降级插件永远不会用旧形状覆盖数据；遇到 revision 冲突的迁移不会触碰实时数据。

用户可以在设置 → 插件中恢复最近的 preimage（**恢复迁移前备份**）。恢复会停用插件并保留一份当前数据的保护副本。把迁移设计成旧状态的纯函数，并保持 `validateState` 严格，让坏迁移大声失败而不是持久化垃圾。

只有画布卡片状态有这份备份契约。插件键值存储没有；请在那里自行给值加版本。

## 测试

`createFakeHost` 通过 `harness.inspection.canvasTypes` 暴露已注册类型。直接单元测试 `validateState`、`migrateState` 与 `summarize`；渲染与持久化在打包后的 GhostBoard 中验证。
