# GhostBoard 整改方案（slim/v1 质量冲刺）

> 基线：`slim/v1` 分支 `a2b1a5d`（2026-11-04）。周期约 3 周。
> 原则：**这期间不加新功能、不再调整产品结构**，除非本方案里写了。每个阶段单独提交，都有验收标准，不达标就不进下一阶段。

## 已确认的交互决定（2026-11-04）

| # | 问题 | 决定 |
| --- | --- | --- |
| 1 | 卡片怎么打开侧边栏：单击还是双击 / `Enter`？ | **单击只选中，双击或 `Enter` 打开**。拖拽、框选时不会误开，跟 Heptabase 的手感接近。现在是单击直接聚焦 |
| 2 | 侧边栏是**盖在**画布上面，还是把画布**挤窄**？ | **盖在上面，不加遮罩，画布照常可操作**。打开时如果所选卡片被侧边栏挡住，就把画布自动平移一下。挤窄会让 React Flow 反复重新计算尺寸，更容易卡 |
| 3 | 图片要不要保留全屏看大图？ | 保留，但只用淡入，**不做形变动画** |
| 4 | 要不要保留"全屏写作"？ | 保留，作为侧边栏上的一个按钮，打开后侧边栏铺满窗口，同样只用淡入 |
| 5 | 侧边栏一次只放一张卡，还是能叠放多张？ | **第一版只放一张**，点别的卡就替换。叠放、固定等自用一周后再决定 |

> [!IMPORTANT]
> 背景：笔记的标题、颜色、预览等字段目前被复制进了画布节点的 `data`。所以撤销系统专门维护了一套"存快照时剥掉，撤销时再补回来"的机制（[canvasNoteHistory.ts](../src/mainview/lib/canvasNoteHistory.ts)），避免撤销画布操作时把笔记内容一起回退。根本问题在于**笔记内容存进了画布节点**，阶段 3 解决的就是这个。

---

## 阶段 0：冻结与基线（第 1～2 天）

**目标**：先把现状量出来，后面每一步才有数据可比。

1. **建一个性能测试样本**：写脚本 `scripts/perf/make-fixture.ts`，生成两个测试工作区，分别有 200 个和 500 个节点。节点混合 Note、图片、Link、Group、Folder 和连线。这是开发工具，不是单元测试。
2. **测基线**，结果写进 `docs/quality/perf-baseline.md`：

   | 指标 | 测法 | 目标 |
   | --- | --- | --- |
   | 冷启动到画布可操作 | 手动计时 / `performance.now()` 打点 | < 1.5s |
   | 拖拽单卡 / 多选拖拽帧率 | WebKit Timeline | ≥ 55fps（500 节点） |
   | 平移、缩放帧率 | 同上 | ≥ 55fps |
   | 打开卡片到可以输入 | 打点 | < 150ms |
   | 切换画布 | 打点 | < 300ms |
   | 渲染端打包体积 | `vite build` 产物 | 记录即可，后面看变化 |

3. **建 bug 清单** `docs/quality/bugs.md`，三级：P0 丢数据或崩溃，P1 核心流程走不下去，P2 手感和视觉。**只修 P0 和 P1；P2 只修核心流程上的**。
4. **Heptabase 对照试用**（可以和后面的阶段同时进行）：同一篇稿子的素材，两边各整理一次，把"Heptabase 做不到或做得别扭"的地方记进 `docs/quality/heptabase-diff.md`。

**验收**：基线文档和 bug 清单都已提交。

---

## 阶段 1：真瘦身（第 3～4 天）

**目标**：冻结的模块不再在启动时加载，主路径的代码真正变少。风险低、见效快，所以放在前面。

| 改动 | 位置 | 做法 |
| --- | --- | --- |
| 插件运行时按需启动 | [main.tsx](../src/mainview/main.tsx#L60-L70) | 先问主进程有没有已安装的插件，**有才** `import('./plugins/runtime')` 并启动。`PluginWorkbench` 改成懒加载。这样已装插件照常可用，和 PRD-slim 的约定一致 |
| 冻结组件懒加载 | `PomodoroWidget`、`ReminderWidget`、`RecordingNode`、`ChecklistFocusedView`、`useAudioRecorder` | 节点组件用 `React.lazy` 包起来，画布里真有这类节点时才加载对应代码 |
| 许可证代码不进打包 | 引用 `LICENSE_QUOTA_ENABLED` 的地方 | 把开关改成编译期常量（仿照 `__GHOSTBOARD_PLUGIN_PROBES__` 的做法），让构建时把关掉的分支直接删掉 |
| 删除死代码 | 全局 | 用 `knip` 或手工 grep，列出没有被引用的导出和文件，删掉 |

**验收**：
- `bun run type-check`、`bun run check`、`bun run test` 通过。
- 打包体积和冷启动时间比基线有下降，数字写进 `perf-baseline.md`。
- 手动验证：打开含有番茄钟、提醒、录音、Checklist 的旧工作区，这些节点照常显示和使用。已装插件照常运行。

---

## 阶段 2：卡片改在右侧边栏打开，删除转场体系（第 5～9 天）

**目标**：打开卡片时画布不被挡住，可以边看边写。删掉形变动画和它带来的一整套代码。

### 2.1 交互规格（按上面的建议值写，你拍板后再调整）

- **打开**：双击卡片，或选中后按 `Enter`；从笔记库、搜索结果打开时也走同一个入口。侧边栏从右边滑入，**150ms，只动 `transform`**。
- **侧边栏**：默认宽 480px，可以拖拽调到 360～720px，宽度记在应用设置里。不加遮罩，画布可以继续平移、拖拽、选中。
- **切换**：侧边栏开着时双击另一张卡，内容直接替换，不播放动画。替换前先保存上一张笔记，沿用现有的统一关闭路径和保存冲突保护（[focusedLifecycle](../src/mainview/lib/focusedLifecycle.test.ts) 里的逻辑全部保留）。
- **关闭**：按 `Esc`、点关闭按钮或删除该卡片时关闭。**点画布空白处不关闭**，因为对照写作时经常要点画布。
- **全屏写作**：侧边栏上的按钮，打开后铺满窗口，淡入 120ms；按 `Esc` 退回侧边栏。
- **图片**：在侧边栏里显示，另有"看大图"按钮，打开全屏灯箱，只用淡入。
- **不进侧边栏的类型保持不变**：Sticky 和 Topic 仍在画布上原地编辑，Recording 仍在卡片上直接播放。

### 2.2 代码改动

| 动作 | 文件 |
| --- | --- |
| **新增** | `components/canvas/CardSidePanel.tsx`：侧边栏外壳，负责宽度、拖拽调宽、全屏切换 |
| **复用并改造** | [FocusedView.tsx](../src/mainview/components/canvas/FocusedView.tsx)（946 行）按内容类型拆开：`FocusedNoteBody`、`ChecklistFocusedView`、图片、Asset、Link、extension detail。拆完后只是侧边栏里的内容组件，不再负责全屏外壳和动画 |
| **改造** | [FocusedViewHost.tsx](../src/mainview/components/canvas/FocusedViewHost.tsx)、[canvasFocus.ts](../src/mainview/lib/canvasFocus.ts)：状态从"聚焦节点"改为"侧边栏中的节点"加上"是否全屏"两个字段 |
| **改调用点** | `routes/index.tsx`（10 处）、`useCanvasKeyboard.ts`、`useContextMenu.ts`、`useCanvasSearchNavigation.ts`、`LibraryPopup.tsx`、`FolderNode.tsx`、`extensions/hostApi.ts`（`closeDetail`） |
| **删除** | 整个 [focusTransition/](../src/mainview/components/canvas/focusTransition/) 目录（含 `scaleMorph`、`viewTransition*`、`focusAnimProbe`、`registry`，以及两个对应的测试文件）、[FocusedNotePreview.tsx](../src/mainview/components/editor/FocusedNotePreview.tsx)、`index.css` 里的 `.gb-vt-focus` 样式、`appSettingsStore` 里切换转场方案的设置、[focus-transition-variants.md](../docs/focus-transition-variants.md) |
| **文档** | 改写 PRD §2.3 和 §3.2；在 PRD-slim 第 4 节里写明"打开方式改为侧边栏" |
| **多语言** | `messages/*.json` 新增侧边栏相关文案，比如全屏写作、关闭、看大图 |

**验收**：
- type-check、check、test 通过。
- 手动走一遍：每种卡片都能在侧边栏打开、编辑、切换、关闭；切换时上一张笔记没有丢字；全屏写作能进能退；笔记库、搜索、右键菜单都走侧边栏入口；扩展的 detail 视图正常。
- "打开卡片到可以输入"的耗时不比基线差。
- 删掉的代码行数写进提交说明，预计 1500 行以上。

---

## 阶段 3：笔记内容只保留一份数据（第 10～14 天）

**目标**：画布节点只记录"放在哪里、引用哪篇笔记"，笔记的标题、颜色、预览统一从一处读。对齐 Heptabase 的 `card` / `cardInstance` 分法。

### 3.1 目标模型

```
画布节点 node.data   { noteId, tags, 放置相关字段... }   ← 只存放置信息
noteRecordStore     Map<noteId, { title, color, revision, preview, updatedAt }>  ← 渲染端唯一来源
主进程 sidecar        blocks（原文）+ preview（派生缓存）  ← 磁盘上唯一来源
```

### 3.2 步骤（每一步单独提交，都可以回退）

1. **（0.5 天）先验证**：`@blocknote/server-util` 能否在 Bun 主进程里生成 HTML。
   - 能用：用它替换手写的 [blocknotePreview.ts](../src/bun/blocknotePreview.ts)（409 行），卡片预览和编辑器出自同一套渲染。
   - 不能用：保留手写转换器。它已经是唯一的生成路径，问题不大。
2. **新增 `store/noteRecordStore.ts`**。`loadCanvas` 的返回值从"把笔记数据合并进节点 data"（[noteRecordToCardData](../src/bun/noteStore.ts#L208-L240)）改成"节点 + 另附一份 `notes` 表"。保存结果、`noteBodySync`、插件 `hostEvents` 都改为更新这个 store。
3. **读取方改成按 `noteId` 读**：`CardNode`、`NotePreview`、笔记库、搜索结果、导出、AI 总结。过渡期保留"读不到就回退到 `node.data`"的兜底。
4. **不再往节点 data 里写笔记字段**，然后删掉相关机制：`canvasNoteHistory` 的剥离、补回、缓存逻辑；`noteMetadataProjection` 修改节点的部分；`nodesSlice` 和 `folderSlice` 里对 `NOTE_CONTENT_KEYS` 的判断；`replaceNoteSources`。
5. **兼容旧数据**：读取时如果 manifest 里有旧的标题或预览字段，就忽略并在下次保存时去掉。旧 `.md` 笔记照常通过 `noteStore` 读取。

> [!WARNING]
> 这一阶段动到撤销历史和数据完整性，正好属于 AGENTS.md 允许写测试的范围。需要更新或补充 `routeUndoRedo`、`noteBodySync`、`canvasNodeSerialization`、`useCanvasPersistence` 的测试。重点覆盖三个场景：撤销画布操作不会回退笔记内容；同一篇笔记放在多张画布上时标题同步；旧工作区读写一轮后数据无损。动手之前先确认 manifest 落盘时目前到底带了哪些笔记字段，这一点我还没核实。

**验收**：
- type-check、check、test 通过。
- 手动验证：同一篇笔记放在两张画布上，在一边改标题和正文，另一边的卡片同步更新；撤销、重做画布操作后笔记内容不变；打开一个旧版本工作区，所有卡片的预览正常。
- 删除行数写进提交说明。

---

## 阶段 4：性能（第 15～17 天）

**目标**：达到阶段 0 定下的指标。**只修测出来最慢的前 3 项**，不凭感觉改。

先验证这几个嫌疑点（来自代码粗看，没有实测）：

| 嫌疑 | 位置 | 可能的修法 |
| --- | --- | --- |
| `backdrop-blur` 有 38 处，其中一部分在画布节点上，每个节点都在做模糊合成 | `LinkNode.tsx:317`、`ReminderWidget.tsx:261` 等 | 画布节点上的全部改成不透明背景，模糊只留给少数浮层 |
| 拖拽过程中每次鼠标移动都要对整个节点数组做 `setNodes` 以及分组高亮、推挤计算 | [useNodeDrag.ts](../src/mainview/hooks/useNodeDrag.ts) | 拖拽中只更新被拖的节点，高亮计算用 `requestAnimationFrame` 节流，推挤计算放到松手时做 |
| 处于可编辑交互锁定状态时，会关掉"只渲染可见节点" | [CanvasFlowLayer.tsx:454](../src/mainview/components/canvas/CanvasFlowLayer.tsx#L454) | 确认这个开关在什么情况下会被关掉；阶段 2 之后可能已经不需要关 |
| 每张卡片的预览 HTML 里的图片都要单独异步替换地址 | [NotePreview.tsx](../src/mainview/components/preview/NotePreview.tsx#L119-L145) | 预览里只显示图片占位，或者在主进程生成预览时就写好最终地址 |
| 订阅了整个 `nodes` 数组的组件 | `CanvasFlowLayer.tsx`（2 处）、`useCanvasSearchNavigation.ts` | 改成更细的 selector |

**验收**：500 节点样本的各项指标达标，前后对比写进 `perf-baseline.md`。

---

## 阶段 5：动画收敛（第 18～19 天）

1. **盘点**：用到 `motion` 的 13 个文件，加上 CSS 里的 `transition` 和 `animation`，列一张表：位置、作用、处理方式（保留、简化或删除）。
2. **定规则**，写进 `docs/quality/motion.md`：
   - 时长只用两档：120ms（悬停、淡入）和 180ms（面板滑入）。缓动只用一条 `ease-out`。
   - 只动 `transform` 和 `opacity`，不动宽高、阴影和模糊。
   - 拖拽、平移、缩放这些高频操作期间不播放任何动画。
   - 支持系统的"减少动态效果"设置（`prefers-reduced-motion`）。
3. **默认删掉**纯装饰性的动画；Folder 展开动画看盘点结果再决定。

**验收**：拖一遍核心流程，没有任何一处动画掉帧或闪烁。

---

## 贯穿整个周期

- **每天**：从 bug 清单里修 P0 和 P1，修完在清单上标记，并写明对应的提交。
- **第 3 周末，方向决策**：看 `heptabase-diff.md`。
  - 找到了真实差异：下一阶段做 1～2 个写作者专属功能（比如摘录自带出处、画布导出稿件骨架），并把 PRD-slim 第 1 节的差异描述改成具体功能。
  - 没找到：认真考虑止损或开源。

## 时间总览

```mermaid
flowchart LR
  P0["阶段0 基线<br/>D1-2"] --> P1["阶段1 真瘦身<br/>D3-4"] --> P2["阶段2 侧边栏<br/>D5-9"] --> P3["阶段3 单一数据源<br/>D10-14"] --> P4["阶段4 性能<br/>D15-17"] --> P5["阶段5 动画<br/>D18-19"] --> G{"方向决策"}
  B["bug 清单 P0/P1 每天处理"] -.-> P5
  H["Heptabase 对照试用"] -.-> G
```
