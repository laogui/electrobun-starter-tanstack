# 性能基线

> 整改方案阶段 0（[remediation-plan.md](../remediation-plan.md)）。每次测完把数字填进下表的新一列，不覆盖旧数据。

## 测试样本

```bash
bun run perf:fixture                      # 生成 ~/GhostBoard-perf/ws-200 和 ws-500
bun run perf:fixture -- --nodes 1000      # 其他规模
bun run perf:fixture -- --out ~/somewhere # 换输出目录
```

内容固定（按节点数作种子），每次生成都一样。500 节点的构成：210 张 Note（一半短、三成中等、两成长文带标题和列表）、120 张 Sticky（含 15 个 Group 里的 60 张）、40 张图片、40 个链接、15 个 Group、15 个 Folder（每个 4 项）、126 条连线，三分之一的 Note 带标签。链接已标为 `ready`，不会联网。

样本走的是模板实例化的路径，笔记是 Markdown 文件；首次在 App 里打开某张笔记并编辑后，它会迁移成 BlockNote sidecar，与真实工作区一致。**每次测量前重新生成一份**，避免上次测量留下的迁移影响结果。

打开方式：设置里切换工作区，选 `ws-500` 文件夹，重启 App。

## 怎么测

打点默认关闭。打开方式二选一：

- `VITE_GB_PERF=1 bun run dev:hmr`
- Web Inspector 里执行 `localStorage.setItem('gb:perf', '1')`，然后重新加载

打开后，控制台会输出 `[perf] …`，所有结果也存在 `window.__gbPerf`，用 `copy(window.__gbPerf)` 复制出来。代码在 `src/mainview/lib/perfMarks.ts`。

| 指标 | 打点 | 怎么操作 | 目标 |
| --- | --- | --- | --- |
| 冷启动到画布可操作 | `cold-start`：页面开始加载 → 第一批节点绘制完成 | 打开 ws-500 后重启 App，取 3 次中位数 | < 1.5s |
| 拖拽帧率 | `drag`：按住节点拖动 ≥ 300ms，记录 fps 和最慢一帧 | 单卡拖 3 次；框选约 20 张一起拖 3 次 | ≥ 55fps |
| 打开卡片到可以输入 | `open-to-input`：发出打开请求 → 新的可编辑区出现并绘制 | 打开 5 张不同长度的 Note，取中位数 | < 150ms |

注意：
- `cold-start` 从 WebView 页面开始计时，不含 Bun 主进程启动和窗口创建。需要完整数字时另用秒表从点击图标开始计时，记在备注里。
- 用 `bun run build:canary` 的产物测才能代表用户体验；`dev:hmr` 下的数字只用来前后对比。两种都可以记，标明是哪种。
- `open-to-input` 的选择器不依赖全屏视图，改成侧边栏后同样有效，可以直接对比。

## 结果

| 日期 | 提交 | 构建 | 样本 | cold-start | drag 单卡 fps / 最慢帧 | drag 多选 fps / 最慢帧 | open-to-input | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | ws-500 | | | | | |
