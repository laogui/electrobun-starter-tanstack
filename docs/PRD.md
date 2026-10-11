# 产品需求文档 (PRD)：GhostBoard 本地空间工作台

> **相关文档**
>
> - [技术规范文档](./tech-spec.md) — 架构、目录、状态、持久化、RPC、Canvas Type 行为、高信任插件运行时、许可证、诊断与发布
>
> **插件模型**：已启用的插件是高信任本机扩展，与宿主前端处于同一个 JavaScript realm。宿主不提供权限沙箱，也不按 `capabilities` 拦截调用。网络隔离容器在目标 WebView 上不可行，QuickJS 命令运行时已从仓库删除，不计入现行验收。
>
> **文档状态**：D0–D2 已完成自动回归与桌面验收。D3 仍是条件任务。Topic 的代码与相邻测试已落地，桌面走查还没有记录。公开插件运行时已在仓库中实现，装载、四类贡献、签名更新和安全模式有 macOS arm64 探针；npm 发布、文档站上线、样例分发、macOS x64 实跑和外部作者试用未完成，首版不得标为已验收。§2.0 记录与代码核对过的边界，§7.1 是当前未完成项。历史完成标记里 2026-06 至 2026-07 的条目不代表迁移后的行为都重新验收过。

## 1. 产品概述

### 1.1 当前定位与开发对象

**GhostBoard 是一款本地优先的个人空间工作台，帮助用户围绕一个具体项目，把笔记、链接和本地素材放在一起，完成浏览、整理、比较与记录结论。**

- **当前服务的任务**：一个人围绕一个主题准备文章、研究笔记或方案，需要反复对照多份资料；不要求用户先迁移整个知识库。
- **核心问题**：素材分散在网页、文件和笔记中，切换查看后容易失去上下文；整理后的资料还需要能被找回、继续编辑，并形成可带走的结论。
- **产品方法**：用画布保留资料之间的空间关系；用 Group 表达工作分区，用 Folder 收纳资料，用聚焦视图阅读和编辑。空间布局应降低整理成本，而不是要求用户先学会一套复杂的知识管理方法。
- **目标用户仍待验证**：独立创作者、个人方案准备者与研究学习者是候选人群，不把其中任何一类写成已经验证的市场。当前用同一条项目流程验收基础能力。
- **新增开发对象**：希望通过插件扩展工作流程的普通用户，以及独立开发和分发插件的外部开发者。开发者无需加入主仓库即可提供工具、面板、导入器和内容类型；该方向已确定，市场规模与使用效果仍需验证。
- **本地优先的含义**：核心内容与布局保存在本地，支持离线整理；不等于 Markdown 原生或任意外部编辑器双向同步。主动访问网页或调用远程 AI 的联网边界见 §6。

### 1.2 当前必须打通的使用流程

> 带入真实素材 → 浏览与编辑 → 分组、连线或收纳 → 找回并继续工作 → 记录结论 → 导出带走。

| 环节 | 当前阶段的产品要求 | 不应混为一谈的能力 |
| --- | --- | --- |
| 带入 | 笔记、图片、文件和 URL 能通过明确入口进入画布，失败可理解且不留下不可用对象 | Link 元数据预览不等于网页全文剪藏或离线快照 |
| 理解 | 能查看内容、编辑笔记，在全局布局与单项内容之间往返 | 文件基础预览不等于 PDF 批注、OCR 或文献管理 |
| 整理 | 拖动、Group、Folder、复制与撤销遵守明确且一致的类型边界 | 内部改成 extension 不应静默改变用户原有操作能力 |
| 找回 | 收纳、移出画布、切换视图和重启后，内容仍有可理解的访问路径 | “未放在画布”不等于“可以清理的垃圾” |
| 形成结果 | 先用现有 Note 手动记录观点、结论或大纲，并保留相关素材在旁供对照 | 不承诺已有自动大纲、引用溯源或结构化写作系统 |
| 带走 | 现有导出明确内容范围、附件处理与不支持项；需要恢复的备份另行验证 | 导出笔记集合不等于按画布结构生成有序文章；导出 JSON 不等于可恢复备份 |

### 1.3 这一阶段如何判断做对了

- 验收单位是**一次完整项目流程**，不是增加了多少节点类型、动画或设置。
- 用同一套包含 Note、图片、链接和文件的真实资料，完成整理、找回、继续编辑及导出；中途包含重启、撤销和失败路径。
- 手工记录阻断点：哪里必须绕路、哪里资料不可达、哪里类型行为不一致；问题关闭需要回归证据。
- 流畅动效负责维持空间上下文，不替代可用性与数据可靠性验收。不以下载量、付费率或发布完成度作为当前开发目标。
- 公开插件另以“独立开发 → URL/ZIP 安装 → 实际使用 → 更新与恢复”的完整流程验收，四类插件均须可用；不能用新增卡片数量代替平台验收，也不能因基础流程验收而跳过插件要求。

### 1.3.1 Topic 与轻量思维导图（2026-09-14 实施完成，未验收）

思维导图场景需要比便签更轻的主题节点。代码已实现核心「主题」类型、Tab/Enter 连续创建、以 `topic-child` 边为唯一层级真源、向右自动排布与避让、分支选择/复制/整理/拆出/删除、离开画布前提交草稿、非法关系时暂停写入并保留 `*.pre-topic` 备份、大纲导出前的关系门禁，以及与 `card` / `sticky` 共用的免费额度。实现在 `src/shared/topic.ts`、`src/mainview/lib/topicTree.ts`、`src/mainview/lib/topicLayout.ts` 和 `src/mainview/lib/nodeQuota.ts`。桌面走查（连续创建、一步撤销、整树进出 Group、锁定拒绝、重启后层级、大纲落盘）还没有记录，因此本节不把 Topic 标成已验收。

### 1.4 当前不扩张的方向

- 暂不确定垂直行业路线，不新增专门的论文引用系统或完整脚本编辑器。
- 公开插件开发、分发、URL/ZIP 安装与更新属于正式范围；插件市场的评分、交易、付费和推荐系统仍延期，安装不依赖官方账号或市场在线。
- 暂不扩张多人实时协作、移动端与支付订阅流程。
- 已有小组件与 AI 保留，优先补齐安全与行为边界，不为丰富功能清单继续增加类型。
- 网页剪藏、摘录溯源等先作为候选需求；只有现有手工流程的阻断点明确后，才进入下一轮开发。「主题大纲 Markdown 导出」已随 Topic 落地，但它只输出主题标题与层级；把整张画布转成有序文章仍是候选需求。

## 2. 核心功能模块与交互逻辑

### 2.0 当前代码基线与迁移差异

本节区分“代码已接入”和“产品已验收”。下表以当前源码声明为依据，不将进行中的修改视为已发布行为。后续小节出现 legacy `widget/image/asset/link/recording` 描述时，涉及迁移类型的当前代码边界先查本节；旧行为是否保留需要显式决策，不能靠实现差异自动改写产品要求。

| 核查项 | 当前代码事实 | 产品处理 |
| --- | --- | --- |
| 内置类型 | [registerBuiltins](../src/mainview/extensions/registerBuiltins.ts) 注册 Checklist / Pomodoro / Reminder / Image / File / Link / Recording，Counter 仅开发环境注册 | 用用户可见类型描述功能，不把 React Flow 的 `node.type` 当产品分类 |
| 公开插件 | `src/bun/plugins/`、`src/mainview/plugins/`、`src/shared/plugins/` 与 `packages/plugin-sdk` 是高信任模型：`manifest.json` 且 `manifestVersion: 2`、同 realm 前端、import map、宿主 files / net / content / canvas / importer 服务、Ed25519 TOFU 更新、启动安全模式。仓库内没有 QuickJS。v1 包拒绝加载。`capabilities` 只用于展示 | 产品行为见 §2.14，运行时与版本表见 [tech-spec §13](./tech-spec.md#13-高信任插件运行时)。macOS arm64 探针已覆盖装载到恢复；§7.1 的公开验收未完成，不得把首版标为已验收 |
| 打开与容器能力 | [Canvas Type 契约](../src/mainview/extensions/types.ts) 声明 `openBehavior`、Group/Folder 能力、详情布局、通用交互与类型菜单 | 创建、右键、聚焦、文库等入口必须使用同一能力规则 |
| 媒体与链接 | 当前内置 Image / File / Link 声明详情视图，Recording 声明画布内操作；四者均声明可进入 Group / Folder | 迁移后继续验收预览、媒体操作、收纳、搜索、导出和错误回退，不只验收能显示 |
| Productivity | Checklist 声明 `openBehavior: 'detail'`，Pomodoro / Reminder 声明 `openBehavior: 'none'`；三者均可进入 Group、不可进入 Folder，见 [Checklist](../src/mainview/extensions/builtin/productivity/checklist.tsx)、[Pomodoro](../src/mainview/extensions/builtin/productivity/pomodoro.tsx)、[Reminder](../src/mainview/extensions/builtin/productivity/reminder.tsx) | OD-6 已冻结并完成 2026-09-07 桌面验收：Checklist 保留完整详情编辑，Pomodoro / Reminder 保持画布内操作；禁止新放入 Folder，旧 Folder 内条目可预览、搜索、打开并无损取回 |
| 内容引用 | [迁移序列化](../src/shared/extensions/migrateNodes.ts) 将 extension 节点写为 `canvasTypeId + instanceId` 引用，并保留 `detached` 等宿主标记 | §5 的 widget/media 旧存储描述不能当作迁移后全部类型的现状；验收复制、保存重载与找回时不能丢失实例状态 |
| 搜索 | [searchWorkspace](../src/bun/search.ts) 已分别收集 Note / Widget / Extension 引用；Widget 与 Extension 有 Folder children 引用收集，Note 正文引用仍从顶层循环建立 | 不再笼统写“所有 Folder 内容都漏搜”或“全类型已覆盖”；逐类型验收命中、定位和打开 |
| AI 选区上下文 | [buildAIContext](../src/mainview/lib/ai/buildAIContext.ts) 对迁移后的 extension 使用宿主 presentation 的 `title/plainText`，不直接读取任意实例 state；选中的 Topic 贡献纯文本标题，并单独给出 `topicParentId` / `topicOrder`，与表示容器归属的 `parentId` 区分 | 不承诺已读取图片像素、附件全文或录音转写；未知/失败实例与无有效文本内容的回退纳入验收；标题为空的 Topic 不计入可摘要内容 |

容器与打开规则以 [tech-spec §12](./tech-spec.md#12-画布类型行为) 和 `canvasNodeRegistry.ts` 为准。D0 的生命周期回归已完成。之后新增类型仍要逐项核对，不能用旧的“已完成”标记跳过。

### 2.1 无限自由画布 (Infinite Canvas)

- **功能描述**：一个没有边界的 2D 空间，用户可以在任意位置放置内容节点。
- **交互逻辑**：
  - **平移 (Panning)**：支持触控板双指滑动或鼠标中键拖拽，实现画布的无级平移。
  - **缩放 (Zooming)**：支持触控板捏合、`Ctrl/Cmd + 滚轮` 以及 `Cmd/Ctrl + +/-/0` 缩放。节点在所有缩放等级保持同一套真实内容与视觉结构，不在固定阈值批量切换 placeholder / skeleton；Image / Asset 继续使用既有缩略图和摘要数据控制媒体成本。低缩放专用 LOD 只有在实际 Profiler 数据证明必要后才重新引入。
  - **选择与聚焦 (Selection & Focus)**：
    - 当前采用"单击打开 + 显式选择"模型（✅ 已实现）——普通单击可聚焦节点直接进入 FocusedView，普通单击 Folder 进入 drill-down；未锁定 Sticky 的普通单击直接进入原地编辑。锁定的 Sticky 不进入编辑。选择主要通过框选、`Shift/Cmd/Ctrl+Click`、方向键导航、右键菜单同步选择来完成。
    - 多选集合支持批量拖拽、删除、复制/剪切/粘贴、重复、分组、锁定/解锁、改色、编辑标签、移动到其他画布，以及拖入 Group/Folder。
    - 为避免误触发，拖拽、连线和框选判定优先于单击打开；普通节点点击产生的 React Flow 纯 selection change 会被抑制，避免"打开同时残留选中"。
  - **框选 (Marquee Selection)**：桌面端在画布空白处左键拖拽绘制选择框，按部分相交规则选中多个节点。当前 `selectionOnDrag` 在普通画布状态启用；按住空格进入平移模式或处于文本/输入编辑态时临时关闭，避免与平移和编辑冲突。进入聚焦模式或 Folder drill-down 后，框选仅作用于当前上下文，不影响背景画布。

### 2.2 多模态信息卡片 (Content Cards)

> **迁移说明**：下列 Widget 存储描述保留用于解释旧数据兼容；当前内置类型已接入 extension，新实例状态存放在 `.ghostboard/extension-instances/`。Productivity 的聚焦与 Folder 规则已在 §2.0 / OD-6 冻结，旧 `.ghostboard/widgets/` 数据仍须可读取和取回。

- **功能描述**：画板上的基本元素，支持不同类型的数据载体。
- **卡片类型**：
  - **图文卡片**：包含图片和文本（如演示中的 Target audience 饼图卡片）。
  - **长文本/文档 (Note Card)**：承载长篇幅的文章。在聚焦模式下使用 **BlockNote 块编辑器**进行 Notion 风格的所见即所得编辑，支持标题、列表、任务列表、引用、代码块、行内代码、粗斜体、删除线、链接、图片、分割线等常用块。BlockNote 文档以无损 JSON sidecar (`content/.ghostboard/blocknote/<noteId>.json`) 作为 canonical source；Markdown 只作为 legacy/import fallback 与按需导出格式，保存时不再维护同步 `.md` 副本。
  - **小组件 (Widget)**：独立于 Card 的节点类别，React Flow `type: "widget"`，用 `kind` 区分具体种类。**内容不写入 canvas manifest**，而是存放在 `.ghostboard/widgets/<widgetId>.json`；manifest 只保留 `{ widgetId, kind }` 引用。当前支持三种：
    - **待办列表 (Checklist)**：画布上可直接勾选与在列表末尾添加条目，不改变全局交互状态（保持 `idle` / `selected`），不触发 `inline-editing`；完整编辑可进入 FocusedView。内容字段为带稳定 `id` 的 items 数组；迁移后的编辑通过 Canvas Type host 写入 extension instance 并记录实例历史，不经 `commitNodeData` 写回 manifest；legacy widget 继续走 `widgetStore` 兼容路径。
    - **番茄钟 (Pomodoro)**：专注 / 短休 / 长休计时器，画布上直接操作。运行中 tick **不**每秒写盘，仅在 start / pause / complete 等状态转换时保存；加载时若 `running` 已超时则按完成结算。
    - **提醒 (Reminder)**：截止时间与状态（scheduled / snoozed / done / missed）。第一版仅在 app 打开时做应用内提示，`repeat` 只实现 `'none'`；系统通知与重复提醒后置。
    - **生命周期**：legacy widget 删除、克隆和撤销继续遵守原有 `widgetStore` / widget 文件规则；迁移后的实例更新走 extension instance store 与 per-instance history，同样不写入画布快照。D0-3 已按七个内置类型完成复制、删除、画布/实例撤销与重载矩阵，并验证未知/损坏数据保留。
    - **Checklist 迁移**：旧版 `type: "card"` + `data.type: "checklist"` 在 `loadCanvas` 时懒迁移为 widget；标签 key 从 `note_*` 同步为 `widget_*`。
  - **图片卡片**：支持拖拽上传、粘贴、或从文件选择器导入图片。导入时按图片自然宽高自动计算卡片尺寸，并生成轻量缩略图；画布态优先显示缩略图，聚焦模式下懒加载原图。支持图片替换二次确认、缺失图片重试、标题重命名和标签管理。
  - **本地文件卡片 (Asset)**：支持从文件选择器、拖拽和粘贴导入本地文件，文件内容保存到 `attachments/`。导入流程优先使用原生路径拷贝或本地 HTTP 流式上传，避免大文件走 data URL；保留 25 MB data URL 限制仅作为 legacy 路径。画布态以预览为主：视频 poster、音频 waveform、图片缩略图、PDF/普通文件纸张图标、文本/JSON 摘要、压缩包条目摘要；文件名、大小、时长、路径等细节进入 hover 信息面板。FocusedView 中视频/音频可播放，图片、文本和 PDF 可预览，普通文件提供 `Open file`。支持替换文件、在 Finder 中显示、标题重命名和标签管理。PDF 已有基础内嵌预览，但页面级缩略图、页码导航和批注仍属后续增强。
  - **录音卡片 (Recording)**：支持通过创建菜单或画布右键启动麦克风录音。录音弹窗自动请求权限并展示实时 waveform 与计时，停止后以用户可读的 `recording-N.<ext>` 作为显示文件名，实际音频通过统一附件链路保存到 `attachments/audio_<id>.<ext>`，并生成 duration / waveform / stream URL。Recording 在画布上以语音备忘录样式展示，可直接播放、暂停、重命名、标记标签、改变颜色、锁定和删除；它可以进入 Group/Folder，但当前不进入 FocusedView。
  - **链接卡片 (Link)**：支持从创建菜单输入 URL，或粘贴/拖拽 URL 到画布后自动创建 Link 节点。系统通过本地 HTTP 服务器进行链接预览（unfurling），抓取网页标题、描述、站点名、favicon/image 元数据；画布 UI 展示富媒体卡片样式，支持打开链接、复制 URL、重新抓取预览和编辑 URL。URL 创建路径只接受安全的 http(s) 链接，打开外部链接时限制为 http/https/mailto。
  - **便签 (Sticky Note)**：轻量级的彩色便签，支持快速记录短文本。可在 120–500 × 120–500 范围内调整大小，提供多种预设颜色。正文以纯文本写入 manifest 的 `data.content`，粘贴时剥离富文本格式。便签不进入聚焦放大模式（FocusedView），编辑都在画布上原地完成。
    - **未钉住（默认）**：可以拖拽，光标为抓取。普通单击进入原地编辑；已选中时按 `Enter`，或焦点在便签上时按 `Enter` / `Space`，也会进入编辑。失焦后把正文写回 `data.content`。未钉住时不渲染图钉。
    - **钉住位置**：右键「固定位置」/「取消固定」（英文 Pin in Place / Unpin），状态写入 `data.pinned`。钉住只固定便签在**当前父坐标系**中的位置，正文编辑、缩放、连线、改色、改标签和删除仍然可用。钉住后光标为默认箭头，并显示 CSS 图钉；图钉渐变按便签颜色派生，只在 `data.pinned === true` 时渲染，正文同时留出顶部间距。用户拖拽、碰撞排斥、普通 position 更新和 AI `move_node` 都不会移动它。父级 Group 移动时，子便签的相对坐标保持不变，因此随 Group 一起移动。父级归属变化带来的坐标换算（例如进出 Group）会保留换算后的位置，避免把局部坐标当成绝对坐标。锁定已经固定位置，所以锁定的便签不再提供这项菜单。
    - **锁定**：`data.locked` 比钉住更严。锁定的便签不进入原地编辑（单击、双击、`Enter`、`Space` 都无效），也不渲染缩放手柄，并与其他锁定节点一样禁止拖拽、连线和删除。锁定规则见 §2.6。
  - **主题 (Topic)**：面向思维导图的轻量概念节点，React Flow `type: "topic"`，`data` 为 `{ title, color, topicVersion }` 且内嵌在 manifest，没有 Note 文件、附件或聚焦模式。标题按**纯文本**处理（不解析 Markdown / HTML），建议上限 2,000 个 Unicode 码点，超限时保留草稿并提示，不静默截断。尺寸按标题自动测量，第一版不提供手动 Resize。普通单击进入标题原地编辑；`Tab` 创建子主题，`Enter` 创建同级主题（根主题上改为编辑标题），`F2` 编辑标题，`Esc` 取消。颜色使用 token，树边颜色由父主题派生，不单独设置边颜色。Topic 与 Card / Sticky 共用免费额度计数。
- **卡片通用能力**：
  - **画布预览渲染**：普通文本卡片在画布态（非聚焦态）优先渲染 sidecar 中缓存的 `previewHtml` / `previewExcerpt`；legacy Markdown 卡片通过 **markdown-it** 将正文渲染为安全的 HTML 预览，并经 **DOMPurify** 清理后展示。预览层仅渲染摘要级别内容（标题、段落、列表、代码块等），不挂载完整的编辑器实例，保证首屏性能。Checklist 在画布上保持独立的结构化 items 交互；迁移后读取 extension instance，legacy 数据继续读取 `widgetStore`。
  - **自由调整大小 (Resize)**：所有卡片均支持拖拽边角/边缘来调整宽高，不再固定为 350×450。调整时保持内容自适应重排。锁定的便签不渲染缩放手柄；钉住的便签仍可缩放。
  - **复制/粘贴 / 剪切 / 重复**：支持 `Cmd/Ctrl+C`、`Cmd/Ctrl+V`、`Cmd/Ctrl+X`、`Cmd/Ctrl+D`；复制时保留选中集合内部的连线，粘贴和重复会分配新的 `nodeId` 并保持 parent / extent 约束。**Widget 额外克隆内容文件**并重映射 `widgetId`，避免多个节点共享同一 widget 文件。复制一部分 Topic 树时只保留两端都在选集内的边，外部父边被剪断，粘贴出的副本是独立的树而不会挂回原树；整树复制保留顺序和内部关系。普通 Copy / Duplicate / Delete 只作用于显式选中集合，不暗中扩大到整棵树；整树操作由「选择分支」「删除分支」等专用动作提供。
  - **聚焦入口约定**：普通单击 Card / Image / Asset / Link / Checklist widget 进入聚焦模式（FocusedView），已选中节点按 `Enter` 也可进入；Checklist 仍可在画布上直接勾选和添加条目。Pomodoro / Reminder 以画布内交互为主；Recording、Sticky 与 Topic 不进入 FocusedView。Topic 选中后按 `Enter` 在非根主题上创建同级主题、在根主题上编辑标题。
  - **创建流程**：底部 `ViewSwitcher` 右侧 `+` 是主创建入口，常用区提供 Note / Sticky / Topic / Link / Image，More 区提供 **Checklist / Pomodoro / Reminder** / Folder / Group / File / Recording，并提供 Markdown 导入和文库笔记入口；画布右键菜单提供同一套创建能力，并以右键位置作为新节点锚点。Image / File 会先打开系统文件选择器；Link 会打开 URL 表单；Recording 会打开麦克风录音弹窗；新建 Productivity 类型时先创建 extension instance 再放置引用节点，legacy widget 文件只作为兼容数据读取。

### 2.3 沉浸式聚焦模式 (Focused View / Modal Expansion)

- **功能描述**：当用户需要深度阅读、编辑或预览某一张卡片时，提供无干扰的阅读/编辑环境。聚焦模式下，长文本/文档类卡片使用 **BlockNote 块编辑器**进行 Notion 风格的所见即所得编辑；图片卡片进入大图浏览模式；Checklist 进入结构化列表编辑模式（迁移后写 extension instance，legacy 数据写 `widgetStore`）；Asset 根据文件类型进入媒体播放器、图片/PDF/文本预览或文件详情视图；Link 进入链接详情/URL 编辑视图。
- **交互逻辑**：
  - 普通单击可聚焦节点、已选中节点按 `Enter`，或右键菜单 `Open Focused` 进入聚焦模式。全屏 shell 以源卡片屏幕矩形为起点 **morph 放大**到主视图（FLIP 风格：`transformOrigin` 取卡片中心，scale 从卡片相对视口比例过渡到 1）；退出时反向收缩。背景画布被半透明遮罩覆盖。点击遮罩、返回按钮或按 `Escape` 退回画布。
  - BlockNote 与 note 加载态共用 `NoteEditorLoading` 占位，避免聚焦闪白。
  - **不可聚焦的节点类型**：Sticky（便签）不支持聚焦模式，未锁定时普通单击进入原地编辑，锁定时单击不进入编辑；Topic 同样只在画布上原地编辑标题；Recording 当前不进入 FocusedView，在画布卡片上直接播放和管理；Pomodoro / Reminder 以画布内控件为主。

### 2.4 节点连线 (Edges / Connections)

- **功能描述**：卡片之间可以建立有向连线，表达知识的关联、依赖或流转关系。
- **交互逻辑**：
  - 鼠标悬停卡片边缘出现连接点 (Handle)，从连接点拖拽到另一卡片即可建立连线。
  - 每个可连线节点提供四个方向（上/右/下/左）的连接点；连接模式为 loose，拖拽半径内命中目标 handle 即可连接。
  - 连线使用自定义 `labeledEdge`，默认 `bezier` 曲线，可在右键菜单中切换 `bezier` / `smoothstep`，并支持 `animated` 流动动画。
  - 连线可添加文本标签，用于标注关系类型；双击 label 或右键 `Edit Label` 可行内编辑。
  - **连线颜色**：右键菜单 `Cycle Color` 在默认色与红/橙/绿/蓝/紫之间循环，颜色写入 `edge.data.color` 并随 manifest 持久化；选中态仍以加粗描边表达。
  - **浮动端点与连接预览**：正式边和拖拽中的 `ConnectionPreviewLine` 都会根据源/目标节点相对位置计算"面向对方"的一侧作为端点，减少固定 handle 带来的绕路和折返。释放时若命中目标卡片的 Handle，则建立正式 Edge；若未命中，则预览线消失，不创建无效连接。
  - **端点边界（MVP）**：仅当前画布上可见的节点实例暴露 Handle；被收纳进 Folder 的子卡片在 drill-down 中只用于浏览与聚焦，不作为独立 Edge 端点。
  - **Folder 兼容规则（MVP）**：Folder 本体可作为一个摘要节点被连线，但系统不会在 drill-down 时自动把该连线映射到某个子卡片；需要表达外部关系时，应连到 Folder 封面节点本身。
  - **两类边**：同一个 `labeledEdge` 承载两种语义，由 `data.kind` 区分。**关联边**（无 `kind`）就是上述手拉连线，行为不变。**树边**（`data.kind: 'topic-child'`）表示主题层级，是层级的**唯一**真源，只由「创建子/同级主题」这类明确动作产生。树边归宿主管理：不提供 label 编辑、动画、`pathType` 切换、视觉反向和独立颜色（颜色由父主题 token 派生），也不能直接删除——删除通过带校验的拆支 / 删分支事务完成。双击、右键菜单、通用边更新与端点改写都统一守卫，不只是隐藏 UI。手拉连线始终是普通关联，不会自动变成父子关系；Topic 也可以和 Note、Sticky、图片、链接、Folder 或插件卡片建立普通关联。

### 2.5 💡 两种分组模式 —— _核心特性_

本应用提供两种互补的卡片组织方式：

#### 2.5.1 Group 开放式分组 (Open Group)

- **功能描述**：在画布上创建一个可调整大小的彩色容器区域，子节点**直接展示**在画布上，所见即所得。
- **交互逻辑**：
  - **拖入**：将卡片拖入 Group 区域，自动成为子节点（位置转换为相对于 Group 的局部坐标）。
  - **拖出**：将卡片拖出 Group 边界，自动脱离父子关系（位置转换回画布绝对坐标）。
  - **嵌套**：Group 可嵌套 Group（需防止循环嵌套）。
  - **连线**：Group 内的子节点可以与画布上任意节点建立连线。
  - **适用场景**：主题分区、看板、思维导图分支。
  - **排斥与碰撞**：拖拽单个内容节点或 Folder 时，与邻近顶层内容节点存在实时 gentle repulsion（柔和排斥）机制。被推开的节点会基于拖拽起点反复求解，随压力消失回流，避免级联漂移；Group / Folder / locked 节点，以及钉住的 Sticky，作为不可移动障碍，子节点不单独参与求解。悬停到 Group 或 Folder drop target 时暂停排斥并恢复已推开节点，避免为即将被收纳的节点腾出无意义空间。同时提供**碰撞检测与放置解析**能力：释放节点时若检测到与 Group 区域重叠，系统会自动判断是"纳入 Group"还是"放在 Group 旁边"，确保放置意图明确。

#### 2.5.2 Folder 堆叠式文件夹 (Folder Stack)

- **功能描述**：在二维画布上引入第三个维度（Z轴层级）。Folder 是**内容集合 / 资料夹**，用于把多个相关内容节点收纳为一个视觉上的"堆叠实体"，子节点**隐藏**。它不是万能容器，也不是可自由布局的子画布。
- **交互逻辑**：
  - **外观**：在画布上表现为一个带有标签的堆叠卡片组（如演示中的 "3 items - The really great ideas..."）。
  - **封面渲染原则**：Folder 封面只表达摘要，不渲染完整的内部小画布。封面信息优先级为：标题 / item 数量 / 主要类型分布 / 最近的 2–4 个代表性缩略图或类型图标。没有图片时使用类型图标组合和数量文案兜底，避免每新增一种节点类型都重写封面布局。
  - **进入图层 (Drill-down)**：普通单击 Folder、已选中 Folder 按 `Enter`，或通过右键菜单 `Open` 触发**隔离层模式**。
    - 背景画布整体变暗或模糊（失去焦点）。
    - 文件夹内的条目从堆叠状态平滑展开到临时图层。当前实现为 **bottom-up waterfall** 自动排布（非横向 strip / 固定 grid）：最多约五列从 Folder 上方中心向上生长，宽内容自动减列，保留各子项自然尺寸；封面使用动态缩略图槽位摘要。排列顺序按 `children` 数组索引（拖入先后），**不**提供自由拖拽排序，因此不额外持久化 Folder 内部坐标。
      - 在此模式下，画布上的其他非同组元素不可见或不可交互。
  - **退出图层**：点击背景空白处或返回按钮，展开的卡片平滑收缩回堆叠状态，背景画布恢复明亮和可交互状态。
  - **允许收纳的节点类型**：Folder 可以收纳 `Card` / `Image` / `Asset` / `Link` / `Recording`，以及 Canvas Type 明确声明 `canEnterFolder: true` 的扩展。这些类型都被视为“内容条目”，可在 Folder 展开层中被浏览、聚焦、播放或编辑。
  - **不允许新收纳的节点类型**：Folder 不收纳 `Folder` / `Group` / `Sticky` / `Topic`（树边不能跨 Folder 边界，因此整棵树和单个主题都不进 Folder），当前 Checklist / Pomodoro / Reminder 也都声明 `canEnterFolder: false`。历史版本已经保存在 Folder 内的 `widget` 或已迁移 `extension` 条目属于兼容数据：仍须可预览、搜索并通过 `Extract to Canvas` 无损取回，不因当前准入规则而删除、隐藏或转成 Card。
  - **成员来源**：Folder 的成员通过以下方式产生：
    1. **在 Folder 内直接新建**：在 Folder drill-down 视图中通过顶部工具栏或右键菜单的 `New Card` 新建卡片，直接追加到该 Folder 的 `children` 数组。
    2. **从画布拖入**：将允许收纳的内容节点拖到 Folder 上，节点从当前画布移除并写入该 Folder 的 `data.children`。若节点带有 Edge，当前策略会阻止/提示用户先断开连线或清理相关 Edge；需要保留外部关系时，应先连接到 Folder 封面节点。
  - **取回到主画布**：drill-down 视图中选中子卡片后，可通过顶部工具栏的 ↗ `Extract to Canvas` 按钮或右键菜单将该卡片作为新的独立画布节点放回 Folder 邻近区域。**M5 之后 Folder Card 子节点本身已拥有独立 `noteId` 和 note record（sidecar 或 legacy `.md`）**，Extract 动作仅是把 manifest 中的 `children` 引用提升为顶层节点并分配新的 `nodeId`，不再涉及内容文件创建；同一 `noteId` 可在 Extract 前后被其他画布共用。
  - **Extract 可发现性**：为降低 `Extract to Canvas` 被用户忽略的风险（仅藏在右键菜单中发现性不足），drill-down 视图顶部工具栏需提供一个显式的 ↗ `Extract to Canvas` 按钮。当用户在 drill-down 中选中一张或多张子卡片时，该按钮高亮可用；未选中时置灰。此按钮与右键菜单中的 `Extract to Canvas` 行为一致。
  - **Folder 内操作边界（MVP）**：支持在 drill-down 视图中浏览和聚焦子内容；不支持自由拖拽改变顺序，也不支持跨 Folder 边界直接建立子卡片连线。后续若需要自由布局，应升级为独立的 Sub-canvas / View 模型，单独保存 `nodes + edges + viewport`，而不是继续扩展 `data.children`。
  - **适用场景**：归档收纳、减少画布视觉噪音。空间布局、看板分区和关系可视化继续由 Group / Canvas View 承担；成层级的思路展开由 Topic 与树边承担，二者互补。
  - **Topic 与 Group 的关系**：Group 的 `node.parentId` 仍然只表示容器，与逻辑父主题无关。一棵树必须整体处在同一画布、同一直接 Group 容器内；拖入或拖出 Group 时整棵树一起变换容器坐标，部分子树跨容器的操作被拒绝。

### 2.6 右键菜单 / Context Menu

- **功能描述**：右键菜单是画布上的高频操作入口，避免用户频繁依赖顶部工具栏或记忆快捷键。
- **交互逻辑**：
  - **画布空白处右键**：提供新建（`note` / `checklist` / `pomodoro` / `reminder` / `sticky` / `topic` / `image` / `link` / `folder` / `group` / `file` / `recording`）、粘贴、重置缩放到 100%、导入 Markdown、导出当前画布为 Markdown、导出主题大纲为 Markdown（画布上没有主题时置灰）等操作。
  - **卡片上右键**：提供聚焦打开、复制、Copy as Markdown（标题 + 正文写入剪贴板）、改颜色、编辑标签、锁定/解锁、移到笔记库、导出为 Markdown、删除等操作；"永久删除内容"属于显式二次确认的破坏性动作，不与普通删节点合并。
  - **Topic 上右键**：提供编辑标题、新建子主题（`Tab`）、新建同级主题（`Enter`，根主题上不可用）、选择分支、复制分支、整理分支、拆出分支（根主题上不可用）、删除、删除分支、改颜色、锁定/解锁。复制分支只写入分支节点与内部树边，不含外部父边，粘贴出的是独立的树。整理分支对该分支重新排布——首版不承诺永久保留每个内部节点的手工偏移。拆支、删分支、整理分支各是一次事务、一步撤销；整理后位置未变则不记历史。
  - **Widget / Sticky / Image / Asset / Link / Recording / Group / Folder 右键**：根据节点类型提供对应能力。未锁定的 Sticky 额外提供「固定位置」/「取消固定」。所有可拖拽节点的菜单都包含 `Lock` / `Unlock`。锁定写入 `data.locked`，右上角显示锁定徽章，并禁止拖拽、连线和删除。目标已锁定时（多选则是选中集合全部锁定），菜单中的改颜色、编辑标签、删除和删除分支置灰。改色、打开标签编辑会跳过已锁定节点；删除分支在分支内含锁定节点时整支拒绝。删除请求里夹带锁定节点时，这些节点留在画布上，并提示一次「已锁定的内容无法删除，已跳过」；成功提示只计算实际删除的数量，一个都没删掉时不提示成功。AI `move_node` 遇到锁定节点或钉住的便签会跳过并给出警告。解锁后恢复默认行为。锁定的便签同时不能进入原地编辑，也不显示缩放手柄。Widget 删除只移除画布引用。
  - **多选右键**：在选中集合内右键时显示批量菜单，支持 Duplicate、Group、Change Color、Edit Tags、Lock/Unlock、Move to View、Copy、Delete。批量复制会保留选中集合内部连线；含 widget 时会 clone 内容文件。Move to View 会先读取目标 manifest，复制节点/内部边并从当前画布移除。集合里混有锁定节点时，删除和改色仍可执行，但只作用于未锁定的成员。
  - **媒体节点右键**：Image 支持 Replace image、Copy image address、Reveal in Finder、Rename；Asset 支持 Reveal in Finder、Replace file、Rename；Link 支持 Open link、Copy URL、Refetch preview、Edit URL；Recording 支持 Reveal in Finder、Rename。
  - **Folder 上右键**：提供打开 Folder、重命名显示标签、在该 Folder 内新建内容、锁定/解锁、删除等操作。**注**：M5 之后 Folder 子卡片是独立 note / widget record，不再对应系统目录，因此不提供「在系统文件管理器中显示目录」入口；如需查看原始数据，可在 `content/.ghostboard/blocknote/`、`content/*.md` 或 `.ghostboard/widgets/` 按 id 查找。Folder 展开层中的子项菜单需额外提供 `Extract to Canvas`。
  - **连线上右键**：提供编辑标签、切换动画、切换曲线/折线、`Cycle Color` 循环切换连线颜色、删除连线等操作。

### 2.7 多画布视图 (Multi-Canvas Views) ✅

- **功能描述**：同一个 workspace 中可以创建多个独立的画布视图。同一个 note record 可以通过 `noteId` 在不同画布上多次出现（实例 `nodeId` 不同），实现同一知识库的多视角组织。
- **交互逻辑**：
  - **底部切换器**：画布底部居中显示一个浮动的 `ViewSwitcher` 面板，包含当前画布名称、节点计数、导出按钮和创建按钮。
  - **视口 chrome**：画布右下角 `CanvasViewportChrome` 将 minimap 与缩放控件合成一块 frosted 面板；设置中可关闭 minimap（仅保留缩放条）。
  - **切换画布**：点击切换器展开画布列表，点击任一画布立即切换。切换前会先保存当前画布；若保存失败则中止切换并提示，避免未保存变更被清空。切换成功后清空节点/边、聚焦模式、Folder drill-down、undo/redo 历史栈并加载目标画布；剪贴板保留，支持跨画布复制粘贴。
  - **Viewport 持久化**：每个画布视图的 ReactFlow viewport（`x` / `y` / `zoom`）随 manifest 一起持久化到 `.canvas.json` 的 `viewport` 字段。切换画布时恢复目标画布的上次 viewport；刷新页面或重启应用后 viewport 也会恢复。搜索定位、聚焦定位等程序化相机移动会短暂抑制 viewport 持久化，避免把临时跳转写成用户的长期浏览位置。
  - **活跃画布持久化**：用户当前选中的画布 `activeViewId` 持久化到 `workspace.json`，重启应用后自动恢复到上次使用的画布。
  - **新建画布**：通过切换器右侧的 `+` 按钮触发子菜单，提供两种创建方式：① **空白画布**（沿用原有 `handleCreate` 流程，自动命名为 `Canvas N` 并切换过去）；② **选择模板…**（跳转 `/templates` 路由页浏览模板库，选中模板后在只读 ReactFlow 预览页确认后基于模板创建新画布，自动为模板中的每张 Card 生成新 `noteId` 和初始 note record，首次聚焦编辑后迁移为 BlockNote sidecar；legacy checklist 在加载时懒迁移为 widget）。
  - **重命名**：在弹出菜单中点击铅笔图标进入行内编辑模式，`Enter` 确认、`Escape` 取消。名称为空、超过 80 字符或与其他画布重名时阻止提交并显示行内错误。
  - **删除画布**：在弹出菜单中点击删除图标。至少保留一个画布，删除最后一个时操作被拒绝。删除当前画布时自动切换到列表中的第一个画布。
  - **恢复画布**：删除画布后进入 workspace trash，并通过 toast 提供 Undo 恢复；设置页的 Workspace 面板也可恢复 trash 中的画布。
  - **数据隔离**：每个画布对应独立的 `.ghostboard/views/{viewId}.canvas.json` manifest 文件。Card 以 `noteId` 引用 note record；Widget 以 `widgetId` 引用 `.ghostboard/widgets/` 文件，均不随单个画布整份复制内容文件。
- **限制（当前版本）**：
  - 不支持跨画布拖拽节点。
  - 不支持画布间的 noteId / widgetId 引用关系可视化。

### 2.8 搜索 (Search) ✅ MVP / ✅ D1 可达性验收

- **功能描述**：全局搜索当前 workspace 中的画布可定位内容，包括各画布视图、顶层 Card/Sticky/Topic/Folder/Group/Image/Asset/Recording/Link、Edge label，以及这些节点引用的 Markdown / BlockNote 正文。Topic 以标题参与搜索，命中后在画布上选中并居中，不进入聚焦模式。
- **交互逻辑**：
  - 通过 `Cmd/Ctrl+K`、应用菜单，或在画布空闲时直接输入任意可打印字符唤起 `SearchDialog` 并预填首字符。
  - 输入关键词后 debounce 调用 Bun 侧 `searchCanvas`；当前画布内存状态会与后端结果合并，降低未落盘编辑被漏搜的概率。
  - 点击搜索结果项，若命中当前画布节点或连线，则选中并平移缩放至对应位置；若命中其他画布，则先安全切换 `activeViewId`，待目标 manifest hydrate 后再定位。定位相机移动不会覆盖用户持久化 viewport。
  - **排序规则（MVP）**：标题/名称匹配优先于文件名、URL、标签、正文等字段匹配，再按基础相关性评分排序。后续可引入更完整的字段权重与索引。
  - **类型筛选 chips**：搜索框下方提供 `All / Notes / Folders / Links / Images` 切换按钮，仅在前端对 `result.kind` 做客户端过滤，不重发查询。`All` 会显示 Asset / Recording / Topic / Edge / View 等其他结果；`Notes` 同时覆盖 `note` 与 `card` 两种 kind，Topic 不混入 `Notes` chip。
  - **搜索历史**：查询输入为空时显示「Recent searches」分组，列出 `localStorage` 中保存的最近 8 条查询（`ghostboard:v1:search-history` 键，兼容旧键 `ghostboard:search-history`），点击回填到输入框；提供 `Clear` 一键清空与单条删除入口。历史只在用户实际选中结果时落盘，避免误触污染。
  - **Detached notes 的可见性**：用户主动从画布分离的笔记 (`detachNoteFromCanvas`) 会变成 **detached notes**（`data.detached: true`，`position: {x:0,y:0}` 占位），不在画布上渲染，但仍作为 manifest 中的节点进入搜索。画布侧提供游离笔记管理入口，可将 detached notes 拖回画布并赋予真实坐标。
  - **搜索目标契约（D1-1）**：每条搜索结果同时保留可读文本与可序列化的 `target`。普通节点目标携带 `viewId + nodeId + placement`，边目标携带 `edgeId`，Folder 子项目标必须同时携带所属 `folderId` 与子项 `childId`；引用型内容可附带 `content.kind/id`，因此同一 Note 的多画布实例不会被错误合并。后端与当前画布 fallback 使用同一目标形状；Folder child 命中后会先进入所属 Folder，再展开到真实 child，支持的类型进入 FocusedView。
- **当前限制 / 待办**：
  - 后端与前端 fallback 已按类型补齐 Folder Card / Widget / Extension 的命中与目标信息；D1-4 自动化位置×类型矩阵及 2026-09-07 桌面走查已覆盖后端、fallback、文库/Detached browse、Folder child 打开及 unlinked 恢复边界。后续若新增类型仍需按同一矩阵验收，不能只因后端能命中就视为完整可达。
  - 纯粹存在于 `content/*.md`、`content/.ghostboard/blocknote/*.json` 或 `.ghostboard/widgets/*.json`、但没有任何 manifest 引用的内容不会作为一等搜索结果返回；Note Library 现在提供只读的 **Unlinked Files** 区域。带稳定 `noteId` 的 Markdown / BlockNote sidecar 可从这里显式放回当前画布；无 frontmatter id 的 Markdown 需要走显式 Markdown 导入，Widget / Extension 记录保持原类型浏览，不被强制伪装成 Card，也不在此入口删除。
  - 早期规划中的“输入时实时高亮画布匹配/未匹配节点变淡”尚未实现。
  - 搜索面板不直接承载 unlinked 内容的放回操作；正式放回入口是 Note Library 的 Unlinked Files 区域，用户主动 detached 的已有路径仍是 `DetachedNotesSidebar`。

### 2.9 撤销/重做 (Undo / Redo)

- **功能描述**：对画布上的结构性与离散操作（移动、创建、删除、Resize、拖入文件夹、节点级提交等）提供撤销和重做能力。正文长文编辑不进入画布撤销栈，而是由 BlockNote（底层 ProseMirror）自身历史栈处理；迁移后的 Productivity 内容编辑由 extension instance 的 **per-instance history** 处理，legacy widget 仍由 `widgetStore` 的 **per-widget undo 栈**处理，二者都不写入画布快照；标题输入框使用浏览器原生 input undo。
- **交互逻辑**：
  - 非编辑态下，`Cmd+Z` 撤销，`Cmd+Shift+Z` 重做。若编辑焦点在某个 extension / legacy widget 内，快捷键优先路由到对应实例的 undo/redo；若焦点位于 `input` / `textarea` / `contenteditable` 中，则交给当前编辑控件；否则由画布 store 接管。
  - 维护一个画布快照历史栈（Snapshot History Stack），每次离散画布操作前保存当前 `{nodes, edges}` 快照；当前实现不记录 diff / command。Extension / Widget 内容栈与画布栈互不感知。
  - **Topic 树事务**：提交主题草稿、编辑标题、拆出分支、删除分支、删除单个主题以及随之发生的重排都各自是一次事务，`nodes` 与 `edges` 在同一次提交中一起更新，因此只产生一步撤销，不会出现「撤销一次只回滚节点或只回滚边」的中间态。未提交的主题草稿只在内存中，不入图也不入历史。主题标题是纯文本 input，不走 BlockNote / widget 历史栈。
  - **栈深度上限**：画布与每个内容实例各自最多保留 **50** 步，超出后丢弃最早记录。
  - **撤销与持久化的一致性策略**：撤销/重做恢复业务内容，并进入正常 debounce 保存流程。Extension 历史只保留 state/presentation，不回滚持久化 revision；保存使用最新确认版本，旧保存回包不能覆盖请求期间的新编辑。保存失败保留本地内容并提示，不能视为已落盘。画布与 legacy widget 继续使用各自保存路径。
  - **生命周期**：撤销栈仅存在于内存中，关闭应用或切换 workspace 后清空，不做持久化。

### 2.10 键盘快捷键体系 (Keyboard Shortcuts)

| macOS                   | Windows / Linux           | 行为                                                                            |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `Cmd+Z` / `Cmd+Shift+Z` | `Ctrl+Z` / `Ctrl+Shift+Z` | 焦点在 widget 内 → widget undo；焦点在 input/contenteditable → 编辑控件（BlockNote / 浏览器）；否则画布快照栈 |
| `Cmd+C` / `Cmd+X` / `Cmd+V` | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | 复制 / 剪切 / 粘贴选中节点与其内部连线                                                                 |
| `Cmd+D`                 | `Ctrl+D`                  | 重复选中节点                                                                     |
| `Cmd+G` / `Cmd+Shift+G` | `Ctrl+G` / `Ctrl+Shift+G` | 将选中节点创建为 Group / 取消 Group                                             |
| `Delete` / `Backspace`  | `Delete` / `Backspace`    | 从当前画布移除选中的节点（不删除 .md 内容文件；永久删除需通过右键菜单二次确认） |
| `Cmd+K`                 | `Ctrl+K`                  | 打开搜索，命中后 fitView 到画布节点                                             |
| 任意可打印字符          | 任意可打印字符             | 画布空闲且非编辑态时打开搜索并预填该字符                                        |
| `Cmd+A` / `Cmd+Shift+A` | `Ctrl+A` / `Ctrl+Shift+A` | 全选当前上下文中的节点 / 清空选择                                                |
| `Cmd+N`                 | `Ctrl+N`                  | 打开新建卡片菜单                                                                |
| `Cmd++` / `Cmd+-` / `Cmd+0` | `Ctrl++` / `Ctrl+-` / `Ctrl+0` | 放大 / 缩小 / 重置缩放到 100%                                                   |
| `Arrow` / `Shift+Arrow` | `Arrow` / `Shift+Arrow`   | 按方向选择邻近节点；`Shift` 扩展选择，目标不在视口时平滑居中                    |
| `Enter`                 | `Enter`                   | 打开选中卡片的聚焦模式；选中未锁定 Sticky 时进入原地编辑；选中 Topic 时创建同级主题（根主题上改为编辑标题） |
| `Tab`                   | `Tab`                     | 处于 Topic 命令上下文或标题编辑中时创建子主题；其他情况仍是控件间移动焦点        |
| `F2`                    | `F2`                      | 编辑选中 Topic 的标题                                                           |
| `Escape`                | `Escape`                  | 关闭聚焦/文件夹视图、退出搜索/菜单；编辑主题标题时取消本次编辑（草稿被丢弃）     |

**Topic 键位优先级**：`Tab` / `Enter` 只在**显式进入的 Topic 命令上下文**里拦截，不是只要选中 Topic 就拦截。显式选择某个 Topic、按 `F2`、单击进入编辑或创建相对草稿会进入该上下文；`Esc` 退出上下文并把焦点交回画布容器，此时视觉选中可以保留，但 `Tab` 已经恢复成常规的控件间移动——不能仅凭「还处于选中态」重新占用 `Tab`。焦点位于 `input` / `textarea` / `contenteditable`、搜索框、菜单或模态内时按键同样交还给这些控件。`Shift+Tab` 始终不被占用。主题标题编辑中：`Enter` 提交并创建下一个同级主题，`Tab` 提交并创建子主题，`Mod+Enter` 提交但不续接，`Esc` 取消当前编辑；取消一个尚未提交的草稿不会留下空主题。

### 2.11 交互状态机 (Interaction State Machine)

| 状态                | 进入条件                                                                               | 退出条件                                 | 约束                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`              | 默认状态；点击空白处；完成操作后回落                                                   | 选中节点、开始拖拽、打开菜单、按下快捷键 | 允许平移、缩放、框选；普通单击可聚焦节点会直接进入 `focused` / `folder-drill-down`，普通单击未锁定的 Sticky 或 Topic 进入 `inline-editing`。锁定的 Sticky 不因单击进入编辑                                                                            |
| `selected`          | 框选、`Shift/Cmd/Ctrl+Click`、方向键导航、右键单选或多选集合右键                         | 点击空白、`Escape`、进入其他状态         | 允许批量拖拽、删除、复制/剪切/粘贴、重复、分组、锁定/解锁、移动到其他画布。**Checklist widget 例外**：在 `selected` 状态下允许直接勾选 checkbox 和在列表末尾添加条目（局部交互，写 widgetStore） |
| `marquee-selecting` | 在空白处左键拖拽                                                                       | 鼠标释放                                 | 桌面端启用；与空格平移模式、输入编辑态互斥                                                                                                                                                           |
| `dragging`          | 拖拽一个或多个已选节点                                                                 | 鼠标释放或取消                           | 暂停双击判定，避免误触发编辑                                                                                                                                                                         |
| `inline-editing`    | 普通单击未锁定的 Sticky 或 Topic、选中未锁定 Sticky 后按 `Enter`（焦点在便签上时 `Enter` / `Space` 同样进入）、选中 Topic 后按 `F2`（或在根主题上按 `Enter`）、Topic 草稿创建、Group label 编辑、资源/录音标题重命名 | `Escape`、提交、失焦或点击其他区域       | 编辑期间禁用画布级快捷键；Sticky 使用纯文本 textarea，Topic 使用纯文本标题 input（`Enter` 提交并建同级、`Tab` 提交并建子级），媒体标题使用行内 input。锁定的 Sticky 不能进入此状态。Card/Image/Asset/Link 的深度编辑进入 `focused`                                                                         |
| `focused`           | 普通单击 Card/Image/Asset/Link；选中后按 `Enter`；右键菜单 `Open Focused`               | 返回按钮、点击遮罩、`Escape`             | 背景画布不可交互；Sticky / Recording / Topic 不可进入此状态                                                                                                                                                  |
| `folder-drill-down` | 普通单击 Folder；选中 Folder 后按 `Enter`；右键菜单 `Open`                             | 返回按钮、背景空白、`Escape`             | 仅当前 Folder 内容可交互；背景画布冻结                                                                                                                                                               |
| `connecting`        | 从 Handle 开始拖出连线                                                                 | 连接成功、取消                           | 禁止进入编辑与聚焦                                                                                                                                                                                   |
| `recording-capturing` | 创建 Recording 时打开麦克风弹窗                                                       | 停止保存、取消、权限失败后关闭           | 背景画布暂不交互；录音保存为附件后创建 `recording` 节点                                                                                                                                                |

**状态优先级规则**：`dragging` 与 `connecting` 高于双击/编辑判定；`focused` 和 `folder-drill-down` 为全屏模态上下文，会冻结背景画布；`inline-editing` 期间不响应框选与节点拖拽。

### 2.12 笔记库弹窗 (Library Popup) ✅

- **入口**：画布左上角 `CanvasToolbar` 中的 Library 图标，点击后弹出覆盖式弹窗。`CanvasToolbar` 同时集中承载标签筛选入口和设置入口，取代分散的左上角按钮。
- **职责**：浏览当前画布上的所有可聚焦 `Card` / `Image` / `Asset` / `Link` 及声明 `openBehavior: detail` 的 Extension（按 Folder 分组 + 未分组 + 游离笔记），点击卡片即关闭弹窗 → `fitView` 飞到目标节点 → 自动打开 FocusedView。
- **能力**：支持搜索筛选、排序切换（最近编辑/名称/创建时间）、`Escape` / 点击遮罩关闭。
- **角色边界**：与既有入口互补：
  - `Cmd/Ctrl+K` `SearchDialog`：关键词驱动，「我知道我要什么」，跨画布跳转。
  - 笔记库弹窗：浏览驱动，「我想看看我有什么」，仅限当前画布。
  - `DetachedNotesSidebar`：游离笔记的快捷管理与拖回画布（可从底部创建菜单的「文库笔记」入口打开）。

#### Detached notes（游离笔记池）

- **概念**：detached notes 是**有正式 `.md` 文件 + `noteId`、但尚未放置到任何画布**的笔记。它们存在于笔记库中永远可被找回。
- **数据形态**：`position: {x:0, y:0}` 占位，`data.detached: true` 标记；不在画布上渲染。
- **创建路径**：画布上右键菜单 > 「移出到笔记库」 → `detachNoteFromCanvas()` 保留 `.md` 和 `noteId`，但清理画布实例坐标和 edges。
- **放回画布**：笔记库弹窗的「游离笔记」分组中，点击 detached 卡片会弹出 toast 提示 +「放到画布」按钮，点击后 `pinNoteToCanvas()` 将笔记放到视口中心并打开 FocusedView。画布侧 `CreateMenu` 也提供「文库笔记 / Library Note」入口打开 `DetachedNotesSidebar` 进行拖拽放回。
- **搜索可见性**：detached notes 进入全局搜索；笔记库弹窗与 `DetachedNotesSidebar` 在「游离笔记」分组单独列出可聚焦/可分离的 `card` / `image` / `asset` / `link` 及声明相应能力的 Extension。Sticky、Recording、Topic、不可聚焦 Widget 不伪装成可打开的笔记条目；Topic 没有 Note 文件，也不参与「移出到笔记库」和游离笔记流程。

### 2.13 标签管理 (Tag Management) ✅

- **功能描述**：为卡片、图片、附件、链接等节点提供标签标注能力，通过标签对画布内容进行分类和快速筛选。
- **标签模型**：
  - 每个节点有一个**主标签（Primary Tag）**：带颜色背景的标签，一个节点最多一个。
  - 每个节点可有**多个次要标签（Secondary Tags）**：灰色/半透明标签，用于补充分类。
  - 标签数据存储在 `.ghostboard/node-metadata.json` 中，以 `noteId`（Card）或 `nodeId`（非 Card 节点）为键。Card 节点的标签通过 `noteId` 跨画布共享；Image/Asset/Link/Sticky 节点的标签与画布实例绑定。
  - **约束**：每节点最多 8 个标签，单个标签最长 32 字符。
- **标签编辑**：
  - **右键菜单入口**：在 Card/Image/Asset/Link/Sticky 节点上右键 → `Edit Tags`，弹出 `TagEditor` 弹窗。
  - **TagEditor**：基于 `@base-ui/react` Popover 实现，提供标签输入框、颜色选择器、自动补全（基于 workspace 已有标签列表）、添加/删除/修改标签。
  - **CardNode 画布态**：卡片标题下方渲染 `NodeTagChips`，展示主标签（带颜色）和次要标签（灰色）。
  - **Image/Asset/Link/Sticky/Recording 节点**：标题区域或卡片底部同样展示 `NodeTagChips`。
  - 标签修改通过 `useSetNodeMetadata` mutation 乐观更新 React Query 缓存，失败时回滚。
- **标签侧边栏 (TagSidebar)**：
  - **入口**：画布左上角 `CanvasToolbar` 中的 Tag 图标，点击后滑出 `TagSidebar` 面板；有活跃筛选时图标显示小圆点。
  - **内容**：列出 workspace 中所有标签，按使用次数降序排列，每个标签显示节点计数。
  - **筛选**：点击标签设置 `activeTagFilter`，画布上不携带该标签的卡片自动变暗（dimmed），仅突出匹配的卡片。点击已选标签或「Clear filter」按钮清除筛选。
  - **重命名**：点击铅笔图标进入行内编辑模式，调用 `rpcRenameTag` 重命名 workspace 中所有使用该标签的节点元数据。
  - **删除**：点击删除图标，弹出 `DeleteTagConfirmDialog` 二次确认，调用 `rpcDeleteTag` 从所有节点元数据中移除该标签。
  - 标签变更后自动刷新 `['tags']` 查询缓存，侧边栏计数即时更新。
- **适用节点类型**：`card`、`image`、`asset`、`link`、`sticky`、`recording`。`folder`、`group` 和 `topic` 暂不支持标签。

---

### 2.14 公开通用插件系统（高信任模型，运行时已实现）

#### 2.14.0 信任模型

插件是用户主动安装并启用的高信任代码，与 Obsidian、VS Code 的扩展模型同类。用户在首次启用时看到一次明确的说明：插件可以访问工作区、本机文件与网络，并可修改应用界面。确认后不再逐项授权。

产品**不承诺**：插件运行在沙箱内、未声明的能力会被拦截、插件不能联网、插件不能读取其他插件的数据。产品**承诺**：安装与更新阶段不执行包内代码；更新只接受同一作者密钥签名的包；停用与卸载不删除用户内容；坏插件不会让用户失去应用的管理与恢复入口。

#### 2.14.1 产品目标与首版范围

用户可以安装插件扩展 GhostBoard 的工作流程。插件独立于应用发布，一个插件可组合多个功能，也可以只有一个无界面命令。命令、面板和导入器不需要创建画布卡片或隐藏的占位实例。

| 首版形态 | 用户价值 | 必须可验证的行为 |
| --- | --- | --- |
| 工具命令 | 批量整理选中资料，如统一标题或标签 | 从命令入口执行，明确作用范围，修改持久化并可一次撤销 |
| 独立面板 | 查看工作区任务、统计或资料列表 | 在侧栏或主区域打开，无需卡片；关闭后其他插件功能仍可用，重开恢复布局并刷新数据 |
| 文件导入器 | 将 CSV 等外部材料转为资料 | 选择文件与导入器、映射字段、预览后确认；显示进度、取消和失败恢复 |
| 画布内容类型 | 增加自定义交互卡片 | 创建、编辑、保存重启、摘要搜索/预览，缺少插件时保留内容 |

同时提供设置、菜单/工具栏中的命令入口、内容变化订阅与应用运行期间的插件任务。多个入口执行同一个动作，避免重复实现不同业务行为。首版验收顺序为命令 + 面板、画布内容类型、导入器。首版不承诺深度编辑器扩展、自定义导出器、持续双向同步、Bun 后端入口、原生二进制插件或应用退出后持续运行的服务；这些范围限制不构成安全边界，高信任插件可能自行实现额外能力，但宿主不承诺其兼容性与支持。

#### 2.14.2 安装与首次使用

“设置 → 插件”包含已安装、安装插件和开发插件入口。正式安装支持：

- **URL**：ZIP 压缩包直链或发布描述文件链接；支持无 ZIP 后缀与带查询参数的直链。网页分享页、仓库首页无法解析时给出改用直链或本地文件的提示。
- **本地文件**：选择或拖入 `.zip` / `.ghostboard-plugin`；本地导入不上传服务器，可离线完成，不移动或删除用户原始文件。

统一流程为：选择来源 → 下载/检查并显示可取消进度 → 预览名称、版本、作者自述、签名状态、来源、功能、`capabilities` 自述能力与兼容结果 → 一次高信任确认并选择当前工作区启用 → 显示适用功能入口。

`capabilities` 是作者自述会使用的能力（如联网、读写文件），只用于展示，宿主不据此限制任何调用。安装与下载阶段不执行包内代码，也不运行依赖安装脚本。

安装完成后按贡献显示“执行命令 / 打开面板 / 导入资料 / 添加到画布”，不自动执行修改资料的业务动作。安装在应用级管理，启用按工作区配置；打开陌生工作区不自动下载或运行其推荐插件。工作区启用配置用于管理使用体验，不约束高信任插件能够访问的数据范围。

损坏包、缺失入口、不兼容版本、重复安装、来源冲突或签名与已安装作者密钥不一致均给出具体原因。失败不破坏已有可用版本；断网、取消、磁盘不足和安装时退出应用均有恢复路径。URL 与本地文件使用相同的兼容、签名及安装规则。

#### 2.14.3 功能发现与运行行为

- 插件命令可从可搜索的命令入口找到，可配置快捷键；菜单和工具栏仅展示适用动作。不符合选区条件时明确禁用或解释原因。
- 面板由宿主管理位置、焦点、关闭与布局恢复；插件被停用时移除活动界面，保留可恢复信息。不能因关闭面板而注销插件的命令。
- 工具操作先固定本次选择范围。同一资料放在多个位置时，编辑其内容不能重复执行；移动位置则按具体放置对象处理。
- 导入先预览、后提交；大导入可以分批，但必须显示已完成范围。取消或重试不能留下未提交内容或重复资料，回滚不能覆盖用户后续编辑。
- 插件任务在应用运行且工作区激活时可执行，无需对应卡片或面板可见；应用完全退出后不承诺实时执行，重新打开时按恢复规则处理。
- 插件界面在宿主提供的挂载点（面板、卡片体、工具栏位）内可自由使用 React、DOM 与 CSS；挂载点外的宿主界面修改不受支持，产生的问题不视为宿主缺陷。插件面板出错只影响该面板，宿主界面继续可用。
- 故障应显示可理解的提示、日志入口、重试和停用操作。用户可以通过安全模式在第三方代码加载前管理故障插件，不要求编辑配置文件恢复应用。

#### 2.14.4 签名、更新与卸载

不要求官方账号、购买域名、付费证书或官方审核才能开发及手动安装。作者身份以本地生成的密钥表示：未签名插件可以安装但如实标注“未签名”且不接受自动更新；已签名插件在首次安装时固定作者公钥与更新来源。相同名称或插件 ID 不能成为自动覆盖已有安装的理由。

任何更新——自动检查、手动 ZIP、URL 重装——都必须由同一作者密钥签名；密钥不一致时拒绝更新并提示“作者密钥已变更”，由用户决定是否作为全新插件重新安装。签名只保证“更新同一插件的人持有同一把密钥”，不证明作者身份真实，也不证明代码安全。

默认提示更新并由用户决定，允许固定版本、关闭检查和通过 ZIP 手动升级。不兼容版本不能静默激活。代码回退先检查数据兼容，恢复旧数据备份需明确提示可能丢失迁移后的修改并由用户选择。

停用清理宿主登记的命令入口、视图、订阅、任务与 Worker；任意第三方代码造成的页面修改或外部副作用不保证全部可撤销，必要时提示重新加载窗口。卸载默认只移除插件代码，不删除卡片内容、插件持久数据、导入结果或已修改的普通资料。永久删除数据作为独立确认操作，显示影响范围。卡片在缺少插件时可用已有摘要阅读、搜索和基础导出；导入出的普通资料不依赖原插件。

#### 2.14.5 开发者体验

开发者可在主仓库之外创建、调试、打包和分发插件，无需修改内置注册源码。提供工具命令、独立面板、导入器、画布类型四类模板：简单命令只需 manifest 和一个 JavaScript 文件，`import '@ghostboard/sdk'` 无需任何打包配置即可解析；有界面的插件可直接使用 React、CSS 与常见组件库，并与宿主共享同一个 React 实例；TypeScript 工具链可选。

SDK 覆盖内容、画布、选区、设置、事件、文件选择与读写、代理网络请求等完整用户动作；插件不需要自带后端进程即可读文件和联网。

应用提供加载开发目录、自动重载、查看错误和打包签名入口。最终用户安装时不需要 Node/Bun，也不运行依赖安装或构建命令。示例和文档应帮助具有基础 Web 知识的开发者在 15 分钟内完成第一个可用插件，这是待外部开发者实测的体验目标。

开发模式默认以测试工作区调试；使用真实资料需明确切换。错误说明尽量定位到插件源码文件与字段，避免开发者必须理解宿主 Store、原生桥或文件布局。

**支持平台**：插件系统只在 macOS（Apple Silicon arm64 与 Intel x64）上以发行包验证并宣称支持。应用继续为 Windows x64 构建，但插件装载、安装、更新与恢复未在 Windows 验证，Linux 没有发行矩阵；两者公开标注为"未验证、不支持插件系统"，文档与官网不得把"可构建"写成"已验证"。

#### 2.14.6 产品验收

以下项目全部通过，才能将公开插件首版标记为已验收：

1. 四类样例在主仓库之外开发，并在干净环境通过 URL 和 ZIP 安装；开发者不修改宿主源码，最终用户无需开发工具。
2. 无界面标题整理命令只含 manifest 与 JavaScript，完成选区的批量修改、保存和一次撤销；冲突及保存失败可见。
3. 独立面板使用宿主共享 React 渲染并查询资料，关闭后命令仍可用，重启后可以恢复入口和布局且不串工作区数据；面板抛错不影响宿主界面。
4. CSV 导入器通过 SDK 文件服务完成预览、提交、取消、失败恢复及重试去重，卸载后导入资料仍可使用。
5. 自定义卡片完成编辑、重启恢复、搜索和基础导出，停用/缺失插件不丢内容。
6. 一个组合插件可复用命令、菜单与面板；停用后无残留注册、订阅或任务。
7. 更新、作者密钥变更、坏包、运行故障与迁移失败不会静默覆盖已有数据，恢复过程有桌面操作记录；旧 v1 包被拒绝且数据保留。

代码与 macOS arm64 探针已经覆盖第 2–7 项的工程路径，以及第 1 项里的脚手架、签名样例脚本和公共 HTTPS 探针。下面五件事还没有发生，完成前不得把公开插件首版标为已验收：

1. 发布 `@ghostboard/sdk` 与 `create-ghostboard-plugin`。
2. 把插件文档站部署到真实域名。
3. 把签名样例包上传到公开地址，并在不走 loopback 的前提下完成安装与更新。
4. 在 macOS x64 上跑通平台回归。
5. 至少两名仓库外作者按四类模板各自做出可用插件。

Windows 与 Linux 不支持插件系统。装载、包格式、签名和版本表见 [tech-spec §13](./tech-spec.md#13-高信任插件运行时)。每插件一个 Bun Worker 的后端入口没有实现，也不在首版。

## 3. 关键动画与动效规范 (Motion Design Specs)

动效服务于上下文连续性，不是独立的功能完成标准。所有动画都必须遵循**"空间连续性"**原则，即用户要清晰地感知到元素是从哪里来的，又回到了哪里。开发优先保证输入响应、可中断性、内容可读性与 reduced-motion 回退，再追求表现细节；性能目标需要实际测量，不以文字要求代替验收。

### 3.1 缩放与平移 (Pan & Zoom)

- **动效要求**：必须达到 60fps 甚至 120fps。不能有卡顿感。
- **缓动曲线**：使用弹簧物理引擎（Spring Physics）而非简单的线性或贝塞尔曲线（如 Ease-in-out），让拖拽停止时的惯性滑动显得自然。

### 3.2 共享元素过渡动画 (Shared Element Transition) - _卡片聚焦_

- **动效要求**：当卡片从画布态切换到聚焦态时，它不是突然弹出的 Dialog，而是**当前这块卡片本身发生形变和位移**。
- **拆解过程**：
  1.  用户点击卡片。
  2.  背景迅速叠加一层黑色半透明遮罩（`opacity: 0 -> 0.6`，耗时 ~200ms）。
  3.  被点击的卡片解除在画布中的绝对定位，通过计算其在视口中的初始位置 (BoundingClientRect) 和目标位置（屏幕中央），执行放大和平移动画。
  4.  卡片内部的元素（如图片、文字）进行流式重排（Reflow）的平滑过渡。

### 3.3 文件夹展开/收起动画 (Folder Stacking & Spreading)

- **展开动效**：
  - 点击"堆叠容器"。
  - 容器消失，内部包含的 3 张卡片以容器原先的中心点为基准，向四周呈放射状（或线性排布）平滑移动至目标位置。
  - 同时，卡片的缩放比例从缩小状态恢复为 1:1，透明度从较低恢复到 1。
- **缓动推荐**：稍微带一点点弹性（Bouncy）的 Spring 曲线，增加由于"释放"带来的物理反馈感。

---

## 4. 技术栈概览

| 层级       | 技术选型                      |
| ---------- | ----------------------------- |
| 画布引擎   | @xyflow/react (React Flow)    |
| UI 框架    | React 19 + TypeScript         |
| 样式       | Tailwind CSS v4               |
| 动画       | Framer Motion (motion/react)  |
| 富文本编辑 | BlockNote (ProseMirror)       |
| Markdown   | markdown-it + DOMPurify       |
| 构建工具   | Vite + Bun                    |
| 桌面运行时 | Electrobun                    |
| 国际化     | Paraglide / Inlang（en / zh） |

| 状态管理 | Zustand + TanStack React Query |

> 渲染引擎、连续缩放渲染、FocusedView morph、Folder waterfall、性能预算与降级策略等技术实现细节请参阅 [技术规范文档](./tech-spec.md)。

---

## 5. Local-First 数据架构

> **适用范围**：本章保留 Note、legacy Widget 与媒体迁移前的数据说明。已迁移内置类型采用 extension 实例引用（见 §2.0）；当前不能据此承诺所有小组件仍写 widget sidecar，或所有媒体元数据仍内嵌在 manifest。具体实例存储与迁移规则跟随实现及扩展方案维护，D0 验收后同步本章，不另造一套产品层存储规范。

### 5.1 核心原则

1. **本地文件即数据源（Local Files as Source of Truth）**—— 每张 **Card 类型**卡片对应一个以 `noteId` 标识的 note record。当前优先使用 BlockNote JSON sidecar（`content/.ghostboard/blocknote/<noteId>.json`）作为内容级 canonical source；legacy/imported `.md` 文件仍会被发现、读取、导出和迁移，但新编辑保存不再维护同步 Markdown 副本。迁移后的 Canvas Type 内容以 `instanceId` 标识，canonical source 为 `.ghostboard/extension-instances/<instanceId>.json`；legacy **Widget** 内容仍以 `widgetId` 标识并从 `.ghostboard/widgets/<widgetId>.json` 兼容读取。画布布局用独立的 manifest 文件管理。Folder 子节点与对应顶层内容共享同一内容引用，准入与兼容规则见 §2.5.2。Sticky 内容内嵌在 manifest `data.content`；Image / Asset / Recording 走 `attachments/`；Link 走 URL + unfurl 元数据。

   > **早期版本历史**：MVP 初版 Folder children 是以 `{ id, data: {...content inline} }` 内嵌在 manifest 中的「legacy」形式。它们会在 `loadCanvas` 加载时被自动迁移：分配 `noteId`，下次 `saveManifest` 会迁到独立 note record。Checklist 曾以 Card + `data.type: "checklist"` 存在，现已懒迁移为 Widget。
2. **内容与布局解耦** —— 内容级属性（标题、颜色、创建时间、BlockNote blocks / preview、widget items/timer）存 sidecar / widget JSON 或 legacy frontmatter；视图级属性（位置、大小、层级）存 manifest。
3. **`noteId` / `widgetId` ≠ `nodeId`** —— 内容实体 ID 和画布实例 ID 分离；同一内容可在多画布出现。Widget 的 duplicate/粘贴会克隆文件（不共享 widgetId）。
4. **删除实例不等于删除内容** —— 删除顶层 `node` 只影响当前画布实例；当某个 `noteId` / `widgetId` 不再被任何画布引用时，内容文件保留，直到用户显式永久删除或 Unlinked Files 清理。删除 Folder 时，其 children 会被转换为 detached 节点，不随 Folder 一起丢失；单独删除 Folder child 时，Card child 的 note record 清理策略与顶层一致，Widget 默认只删引用，Image/Asset/Recording 仍遵循附件 + manifest 引用模式，Link 只清理 URL 元数据。

### 5.2 配置文件与偏好

#### 当前实现：Workspace settings ✅

当前版本已有默认 workspace、设置弹窗内的 Workspace 面板、以及"选择下次启动 workspace"能力；完整的 recent list / 欢迎页 / 无重启热切换还未完成。用户偏好分为 workspace 内设置、app-level workspace 指针和 app-level 密钥三类。

Workspace 内设置存放在当前 workspace：

```
workspace/
└── .ghostboard/
    └── settings.json
```

```json
{
  "theme": "system",
  "locale": "zh",
  "fontFamily": "system",
  "canvasBackground": "default",
  "canvasShowMinimap": true,
  "canvasSnapToGrid": true,
  "autoSaveInterval": 800,
  "aiEnabled": false,
  "aiProvider": "openai",
  "aiModel": "gpt-4.1-mini",
  "aiBaseUrl": ""
}
```

- `theme` / `locale` / 字体 / **画布背景**（`default` | `paper` | `cream` | `mono`，设置面板 swatch 选择）/ **minimap 开关**（`canvasShowMinimap`）/ 网格吸附 / 自动保存间隔 / AI 模型配置通过 `CanvasToolbar` 的 Settings 图标打开 in-window `SettingsDialog` 保存，并向主画布即时推送更新。
- 设置弹窗包含 General / Workspace / AI / Shortcuts / About 五个 section。General 含外观与画布 chrome；Workspace 面板承载当前路径、打开 workspace 文件夹、选择下次启动 workspace、导出 workspace archive、Trash 恢复/清空、Unlinked Files 扫描/删除。
- AI API key 不写入 `.ghostboard/settings.json`，而是保存在 app-level `ai-credentials.json`。
- 当前 workspace 路径不可能放进 workspace 内设置，因此单独保存在 app-level `userprefs.json`：

```json
{
  "workspacePath": "/Users/me/Documents/work-notes"
}
```

#### 目标设计：App config（多 Workspace 前置）❌ 待实现

多 workspace 管理需要把当前 `userprefs.json` 演进为更完整的应用级配置，建议存放在 app `userData` 目录下：

```
<userData>/
├── app-config.json
├── userprefs.json
└── ai-credentials.json
```

```json
{
  "schema": "ghostboard-app/v1",
  "recentWorkspaces": [
    {
      "path": "/Users/me/Documents/work-notes",
      "name": "Work Notes",
      "lastOpenedAt": "2026-04-03T10:00:00Z"
    },
    {
      "path": "/Users/me/Documents/personal-ideas",
      "name": "Personal Ideas",
      "lastOpenedAt": "2026-04-01T08:30:00Z"
    }
  ],
  "activeWorkspace": "/Users/me/Documents/work-notes",
  "preferences": {
    "theme": "system",
    "language": "zh-CN"
  }
}
```

**启动流程**：

1. 读取 app-level `app-config.json` / `userprefs.json`
2. 若有 `activeWorkspace` → 直接打开该 workspace
3. 若无（首次启动）→ 显示欢迎页，引导用户创建或选择 workspace 目录
4. 进入 workspace 后 → 读取 `.ghostboard/workspace.json` 与 `.ghostboard/settings.json` → 加载画布

> 当前启动流程是 `loadUserPrefs()` → 若 `workspacePath` 存在则使用它，否则使用 `<userData>/workspace` → `initWorkspace(wsPath)` → `seedFirstRunIfNeeded()` → `loadSettings(wsPath)` → 读取 `.ghostboard/workspace.json` 的 `activeViewId`。设置页切换 workspace 会初始化目标目录并写入 `userprefs.json`，实际切换在重启边界生效。

### 5.3 Workspace 文件系统结构

```
workspace/
├── .ghostboard/                        # 应用元数据（不是用户内容）
│   ├── workspace.json                  # workspace 内视图列表、activeViewId、trash 记录
│   ├── settings.json                   # 主题、语言、字体、画布背景/minimap、自动保存、AI 模型配置
│   ├── node-metadata.json              # 标签元数据（key = noteId / widgetId / nodeId）
│   ├── widgets/                        # 小组件内容 JSON（checklist / pomodoro / reminder）
│   │   └── widget_ab12cd34.json
│   ├── trash/                          # 被软删除的 canvas manifest
│   └── views/                          # 每个画布一个 manifest（widget 仅存引用）
│       ├── default.canvas.json
│       └── roadmap.canvas.json
├── content/                            # 统一 note 内容树
│   ├── who-ghostboard-is-for.md        # legacy / imported Markdown，或按需导出的格式
│   ├── prio-before-launch.md
│   ├── alpha-feedback.md
│   ├── .ghostboard/                    # 内容辅助文件（不污染用户可见目录）
│   │   └── blocknote/                  # BlockNote JSON sidecar 文件，按 noteId 命名
│   │       └── note_a1b2c3d4.json
│   └── great-ideas/                    # 后续迁移目标：文件夹即目录（当前不启用）
│       ├── floating-notes.md
│       └── drop-in-anything.md
└── attachments/                        # 图片、文件、视频、音频附件（类型前缀 + 短 UUID）
    ├── img_a1b2c3d4.png
    ├── img_f1e2d3c4.png                # 图片缩略图或视频 poster
    ├── video_b2c3d4e5.mp4
    ├── audio_c3d4e5f6.m4a              # Recording / audio asset
    └── file_d4e5f6a7.pdf
```

- **单一 note 内容树**：所有 note record 统一由 `noteId` 索引。当前主存储是 `content/.ghostboard/blocknote/<noteId>.json`；legacy/imported Markdown 继续位于 `content/*.md`，并可在下次聚焦编辑时迁移为 sidecar。**M5 之后 Folder Card 子节点与顶层 Card 对等**，manifest 通过 `children[].noteId` 加可选 legacy `file` 引用。示意图中的 `great-ideas/` 子目录仅为远期「文件夹即目录」模型的占位示意，当前不启用。
- **Widget 内容树**：独立于 note，按 `widgetId` 存放在 `.ghostboard/widgets/`；manifest 与 Folder children 只保存引用。
- **Per-view manifest**：每个画布视图独立一个 `.canvas.json`，避免单文件成为写入热点。
- **附件命名**：附件文件名使用 `{kind}_{uuid8}.{ext}` 格式（`img_` / `video_` / `audio_` / `file_`），避免同名冲突。路径统一为 workspace-relative POSIX 路径。Image / Asset / Recording 节点保存原始附件引用；视频/图片可额外保存 `thumbnailFile`，音频/录音可额外保存 `waveform` / `duration`，文本与压缩包可保存 `previewExcerpt` / `archiveSummary`。

### 5.4 Markdown 文件格式（Legacy / Import / Export）

Markdown 不再是 BlockNote 卡片的主存储格式。它仍用于 legacy notes、外部 `.md` 导入和按需导出；当没有 sidecar 时，系统会用 YAML frontmatter + 正文作为一次性导入/恢复来源：

```markdown
---
id: 'note_a1b2c3d4'
title: 'Prio before launch'
displayHint: 'note'
color: '#EAF2B8'
tags: ['Inbox']
createdAt: 2026-03-28T10:00:00Z
updatedAt: 2026-03-31T14:30:00Z
---

## Lingering bugs

Body text stored in BlockNote sidecar (or legacy Markdown body).
```

**`displayHint` 说明**（legacy Markdown / 导出 frontmatter 中的 UI 渲染提示，仅用于 **Card / note**）：

| displayHint | 代码中对应 `data.type` | 含义                   | 画布上的默认渲染                            | 聚焦行为      |
| ----------- | ---------------------- | ---------------------- | ------------------------------------------- | ------------- |
| `note`      | `text`                 | 普通文本笔记（默认值） | 显示标题 + 正文摘要                         | ✅ 可进入聚焦 |
| `image`     | `image`                | 以图片为主（legacy）   | 显示图表/图片内容                           | ✅ 可进入聚焦 |

> **Checklist 不再使用 Card `displayHint`**：待办列表是 **Widget**（`type: "widget"`, `kind: "checklist"`），内容在 `.ghostboard/widgets/`。导出 Markdown 时 checklist widget 会序列化为 GFM 任务列表。磁盘上若仍存在 legacy `displayHint: 'checklist'` 的 Card，加载时会懒迁移为 widget。

> **Sticky / Widget / Asset / Link / Recording 不属于 Card 的 `displayHint` 枚举**：Sticky 内嵌 `data.content`；Widget 用 `widgetId` + `kind`；Asset / Link / Recording 引用附件或 URL 元数据。

> **当前实现说明**：Card 仍使用 `data.type`（`'text'` / `'image'`）作为运行时标识，与 PRD 的 `displayHint: 'note'` 存在命名差异；长期目标是统一字段名。

**frontmatter / sidecar 字段归属原则**：

| 放 sidecar / legacy frontmatter（内容级） | 放 manifest（视图级）                  |
| ----------------------------------------- | -------------------------------------- |
| `id` (noteId)                             | `id` (nodeId)                          |
| `title`、`createdAt`、`updatedAt`         | `position`、`style: { width, height }` |
| `color`（内容默认颜色）                   | z-order（数组顺序）                    |
| `displayHint` / `type`                    | `color`（per-view 视觉覆盖，可选）     |
| BlockNote `blocks`、cached `preview`      | `locked`、`parentId`、`extent`；Sticky 另有 `pinned`（钉住当前位置，缺省为未钉住） |

**颜色优先级**（三层回退）：`manifest.data.color`（per-view override）→ sidecar / frontmatter `color`（内容默认）→ 组件默认色板。当同一笔记出现在多个画布中时，每个画布可通过 manifest `color` 独立覆盖颜色，而不影响内容文件本身的默认颜色。**Sticky 例外**：Sticky 无 sidecar / frontmatter，仅走两层回退——`manifest.data.color` → 组件默认色板。

### 5.5 Workspace 配置

`.ghostboard/workspace.json`：

```json
{
  "schema": "ghostboard-workspace/v1",
  "activeViewId": "default",
  "views": [
    {
      "id": "default",
      "name": "Default Canvas",
      "file": "views/default.canvas.json"
    },
    { "id": "roadmap", "name": "Roadmap", "file": "views/roadmap.canvas.json" }
  ]
}
```

- **`activeViewId` 持久化**：用户切换画布时，`activeViewId` 实时写入 `workspace.json`，确保应用重启后自动恢复到上次使用的画布。

### 5.6 Canvas View Manifest

`.ghostboard/views/default.canvas.json`（与 @xyflow/react 原生 Node/Edge JSON 完全一致）：

```json
{
  "schema": "ghostboard-canvas/v1",
  "viewId": "default",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    {
      "id": "node_7f3a",
      "type": "card",
      "position": { "x": 900, "y": 100 },
      "data": {
        "noteId": "note_a1b2c3d4",
        "type": "text"
      }
    },
    {
      "id": "node_w1",
      "type": "widget",
      "position": { "x": 300, "y": 120 },
      "data": {
        "widgetId": "widget_ab12cd34",
        "kind": "checklist"
      }
    },
    {
      "id": "node_group1",
      "type": "group",
      "position": { "x": 60, "y": 60 },
      "data": { "label": "Strategy", "color": "blue" },
      "style": { "width": 760, "height": 420 }
    },
    {
      "id": "node_card_in_group",
      "type": "card",
      "position": { "x": 30, "y": 50 },
      "parentId": "node_group1",
      "extent": "parent",
      "data": { "noteId": "note_moat", "type": "text" }
    },
    {
      "id": "node_folder1",
      "type": "folder",
      "position": { "x": 900, "y": 600 },
      "style": { "width": 350, "height": 350 },
      "data": {
        "label": "Great Ideas",
        "subtitle": "The really great ideas...",
        "children": [
          {
            "id": "child_1",
            "noteId": "note_abc12345",
            "type": "card",
            "data": {
              "noteId": "note_abc12345",
              "type": "text"
            }
          },
          {
            "id": "child_2",
            "noteId": "note_def67890",
            "type": "card",
            "data": {
              "noteId": "note_def67890",
              "type": "text"
            }
          },
          {
            "id": "child_3",
            "type": "recording",
            "data": {
              "attachmentFile": "attachments/audio_c3d4e5f6.m4a",
              "duration": 42.3,
              "fileName": "recording-1.m4a",
              "mimeType": "audio/mp4",
              "recordingNumber": 1
            }
          }
        ]
      }
    },
    {
      "id": "node_asset1",
      "type": "asset",
      "position": { "x": 1320, "y": 260 },
      "data": {
        "attachmentFile": "attachments/video_b2c3d4e5.mp4",
        "fileName": "demo-video.mp4",
        "kind": "video",
        "mimeType": "video/mp4",
        "thumbnailFile": "attachments/img_f1e2d3c4.png",
        "title": "Demo video"
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_7f3a",
      "target": "node_card_in_group",
      "sourceHandle": "right",
      "targetHandle": "left",
      "type": "labeledEdge",
      "data": { "color": "blue", "label": "supports", "pathType": "bezier" }
    }
  ]
}
```

**设计说明**：

- 所有字段（`position`、`data`、`style`、`parentId`、`extent`、`source`/`target`、`sourceHandle`/`targetHandle`）均为 React Flow 原生字段，加载时可直接传入 `<ReactFlow nodes={} edges={} />` 无需转换。
- 业务自定义字段（`noteId`、`widgetId`、`file`、`label`、`color`、`children` 等）统一放在 `data` 对象内。
- 节点 `type` 使用 `'card'` / `'widget'` / `'image'` / `'asset'` / `'link'` / `'recording'` / `'sticky'` / `'topic'` / `'folder'` / `'group'`，与代码中 `nodeTypes` 一致。
- **Topic 节点**：`data` 为 `{ title, color, topicVersion }`，标题是纯文本，内容直接内嵌在 manifest，没有 `noteId` / `widgetId` / 附件指针。层级**不写在节点上**，而完全由 `data.kind: 'topic-child'` 的边表达；加载时由 `nodes + 树边` 推导运行时索引，因此不存在节点与边互相矛盾的双写来源。写盘和读盘都保留未识别字段，旧版本不认识的新字段不会被抹掉。
- **Topic 的数据保护**：读到不支持版本或非法的主题/关系记录时，对该画布**暂停持久化写入**并提示，自动保存与切换视图的 flush 都不再落盘，避免把无法无损重写的内容表现为已保存；纯结构损坏（例如成环）只冻结该棵树的结构操作，不升级为整画布写保护。首次向某个画布写入 Topic 前，先把原 manifest 复制为 `*.pre-topic` 备份，已有备份不覆盖；恢复备份会丢弃备份后的修改，需用户显式选择。
- 节点在数组中的顺序即为 z-order（后面的覆盖前面的）。
- Edge 使用自定义 `labeledEdge`，曲线类型放在 `edge.data.pathType`（默认 `bezier`，可切换 `smoothstep`），label / color / animated 等显示属性也随 `data` 持久化。`data.kind: 'topic-child'` 的边是主题树边：它额外携带 `order` 和 `relationVersion`，`source` 为父主题、`target` 为子主题，视觉属性由宿主派生而非用户设置，通用的边编辑动作对它一律拒绝。
- Folder 的 `data.children` 存放被收纳的内容条目；新收纳允许 `card` / `image` / `asset` / `link` / `recording`，以及声明 `canEnterFolder: true` 的 `extension`。`folder` / `group` / `sticky` / `topic` 与当前三个 Productivity 类型不进入 Folder；已存储的 legacy `widget` / `extension` child 仍作为兼容数据保留。
- Folder 封面上的计数标题（如 `"3 items"`）为运行时根据 `children.length` 派生；封面只渲染摘要缩略图，不渲染内部完整小画布；展开层用 waterfall 自动排布且不持久化坐标。
- Folder `children` 在展开层中只用于浏览、聚焦和 `Extract to Canvas`，不作为独立 Edge 端点；需要对外表达关系时，应连到 Folder 封面节点。
- **Folder Card 子节点的水化与落盘**（M5 ✅）：加载时 `loadCanvas` 按 `noteId` 优先读取 BlockNote sidecar，缺失时回退到可选 legacy `file` 指向的 `.md`；水化回 `title` / `preview` / `content` / `color` 等字段填充到 `data` 中。保存时 `saveManifest` 对 sidecar-backed note 只合并 title/color 等元数据，不重写 blocks 或 Markdown；legacy Markdown note 继续 round-trip `.md`，直到下次聚焦编辑迁移为 sidecar。manifest 保留 `{ id, noteId, type, data: { noteId, type, file? } }` 的薄引用形式（不写正文、不写 preview 元数据）。Legacy 内嵌 children 在加载时自动 stamp 一个 `noteId`，下次 save 时迁到 note record。
- **Folder Widget / Extension 兼容子节点**：legacy `{ id, type: "widget", widgetId, data: { widgetId, kind } }` 仍由 `loadWidgets` 批量加载进 `widgetStore`；迁移后的 `{ type: "extension", data: { canvasTypeId, instanceId } }` 从 extension instance store 水化。两者虽然不再允许新放入 Productivity Folder，但必须能从既有 Folder 中预览、搜索和无损 Extract。
- **非 Card 子节点例外**：Folder 中的 Image / Asset / Recording / Link 子节点不分配 `noteId`，不生成 `.md`；Image/Asset/Recording 使用附件指针，Link 使用 URL + unfurl 元数据。
- **Asset / Link / Recording 节点**：Asset 使用 `attachmentFile`、`thumbnailFile`、`waveform`、`mimeType`、`kind`、`previewExcerpt`、`archiveSummary` 等字段描述本地附件；Link 使用 `url`、`title`、`description`、`siteName`、`faviconUrl`、`imageUrl` 等字段描述网页链接；Recording 使用 `attachmentFile`、`fileName`、`mimeType`、`recordingNumber`、`duration`、`waveform` 描述录音。三者可以作为顶层节点，也可以作为 Folder children，长期产品语义为"资料夹中的内容条目"。
- **Viewport 持久化**：`viewport` 字段（`x` / `y` / `zoom`）随 manifest 一起持久化。切换画布时保存当前 viewport 到源 manifest、从目标 manifest 恢复 viewport；应用重启后通过 `hydrate` 回写 ReactFlow，确保用户回到上次浏览位置。搜索定位、聚焦定位、导出临时 fitView 等程序化相机移动会抑制或恢复 viewport，避免污染用户最后浏览位置。

### 5.7 TypeScript 类型定义

> 完整的 TypeScript 类型定义（`NoteFrontmatter`、各节点 Data 接口、`CanvasViewManifest`、`WorkspaceConfig`、`AppConfig` 等）已迁移至 [技术规范文档 §3.2](./tech-spec.md#32-typescript-类型定义)。

### 5.8 读写流程与状态管理

> 读写流程、debounce 策略、原子写入、RPC 协议等技术实现细节请参阅 [技术规范文档 §7](./tech-spec.md#7-数据持久化)。
> 状态管理分层（Zustand + React Query）、canvasStore 结构、undo/redo 机制请参阅 [技术规范文档 §4](./tech-spec.md#4-状态管理)。

### 5.9 导入/导出 (Import / Export)

- **导出**：
  - **Markdown**：单篇笔记导出（卡片右键 →「导出为 Markdown…」）、当前画布批量导出（画布右键 →「导出画布为 Markdown…」）。
    - 导出内容包含 frontmatter + 正文 + 附件收集 + `index.md`；**checklist widget** 会生成 GFM 任务列表，避免静默丢清单。
    - RPC `exportNoteMarkdown` / `exportNotesMarkdown` 已实现，`scope` 支持 `'view'`（当前画布）/ `'all'`（全部画布）/ `'selected'`（自选）。
    - ⚠️ `scope: 'all'` 和 `'selected'` 的 UI 入口尚未实现（见 TODO-23）。
  - **JSON**：导出当前画布的 self-contained JSON（当前导出 schema 为 `ghostboard-canvas-export/v2`，保留 v1 导入兼容），直接从内存中的可见 nodes / edges / viewport 生成，并清理运行时 URL、hidden / detached 节点和不可持久化字段。当前实现是导出能力，尚未提供 JSON 导入恢复；widget 完整 records 是否纳入 JSON 导出仍属后续增强（workspace ZIP 已含 `.ghostboard/widgets/`）。
  - **Workspace ZIP**：设置 → Workspace →「Export workspace as ZIP…」导出整个 workspace 的可恢复候选备份，包含 views、content/sidecar、extension instances、legacy widgets 与 attachments；D2-2 已在独立临时 workspace 中通过压缩完整性和成员清单检查，恢复导入流程仍需后续任务单独验证。
  - **主题大纲 Markdown**：画布右键 →「导出主题大纲为 Markdown…」把当前画布的主题森林导出为嵌套无序列表。根主题按 id 排序、子主题按树边 `order` 排序；标题按纯文本转义，换行折叠为空格，因此不会把用户输入当作 Markdown 语法执行。画布上没有主题时入口置灰，导出空大纲会被拒绝。存在非法树关系或不支持的主题/关系版本时**整次导出被拒绝并说明原因**，不静默省略——原始数据仍可走无损备份/导出路径。该导出只覆盖主题标题与层级，不包含 Note 正文或附件。
  - **PNG**：导出当前画布的 2x screenshot-style PNG。导出时先临时 `fitView` 全部可见节点、等待浏览器 repaint、隐藏 minimap/controls/panel/attribution，再截图 `.react-flow` 容器，最后恢复导出前 viewport。当前没有 SVG 导出。
- **导入**：
  - 支持通过底部创建菜单或画布右键显式选择多个 Markdown 文件，解析 frontmatter / 标题 / 正文后创建新的 Note 卡片。
  - 支持拖拽/粘贴图片、文件、URL 到画布，分别创建 Image / Asset / Link 节点；文件导入优先 native path copy 或本地 HTTP 流式上传，data URL 仅作为 fallback。
  - ⚠️ JSON 导入恢复尚未实现。
  - ⚠️ 显式「从 Markdown 重新导入到当前笔记」（解析外部 .md → blocks → 写 sidecar，覆盖当前内容）尚未实现（见 TODO-24）。

### 5.10 关键架构决策

| 决策点             | 方案                                                                            | 理由                                                                       |
| ------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ID 分离            | `noteId`（内容）+ `nodeId`（画布实例）                                          | 同一笔记可在多画布/同画布多次出现                                          |
| 布局存储           | Per-view manifest，不放 frontmatter                                             | 布局和内容解耦，避免单文件热点                                             |
| 内容树结构         | 统一 `content/` 目录                                                            | 避免 `notes/` + `folders/` 双根混乱                                        |
| 内容生命周期       | 删 `node` 只删实例；零引用 `note` 保留为 **detached note**，可在笔记库中找回                             | 避免误删共享内容，也避免内容文件无入口可找回                               |
| Folder 范围        | Folder 是内容集合，不是万能容器；可新收纳 Card/Image/Asset/Link/Recording 与显式允许的 Canvas Type，不收纳 Folder/Group/Sticky/Topic 或当前 Productivity 类型；历史 Widget/Extension child 保留兼容取回 | 保持 Folder 的资料夹语义，同时避免准入规则变化造成旧数据丢失或类型降级 |
| Topic 层级真源     | 父子关系只存放在 `data.kind: 'topic-child'` 的边上，节点不重复记录 `parentId` / `childIds`；Group 容器归属继续用 `node.parentId` 表达 | 单一真源避免节点与边互相矛盾；容器与逻辑层级两个概念互不污染 |
| Folder Card 子节点  | 与顶层 Card 对等：独立 `noteId` + note record（sidecar 或 legacy `.md`）；manifest 仅保留薄引用（M5 ✅） | 可跨画布复用 noteId；消除早期「仅画布内可见」降级定位 |
| Folder Widget 子节点 | 与顶层 Widget 对等：独立 `widgetId` + `.ghostboard/widgets/` JSON；manifest 仅 `{ widgetId, kind }` | items/timer 不进 canvas json，避免布局文件膨胀 |
| Folder Image 子节点 | 继续使用 `attachments/` + `imageFile` 指针，不分配 `noteId`                                       | Image 没有文本正文概念，附件模式已足够；保持与顶层 Image 节点一致                                 |
| Asset / Link / Recording 节点 | 作为独立 node kind，不并入 `image` 或 `card`；Asset/Recording 走 `attachments/`，Link 走 URL + unfurl 元数据 | 避免把本地文件、网页链接、录音和 Markdown 文档混成一个数据模型 |
| Widget 节点        | 单一 `type: "widget"` + `kind`；内容独立 JSON；duplicate 克隆文件；per-widget undo 栈 | 可交互小工具与笔记解耦，checklist 从 card 迁出 |
| Folder / Edge 边界 | Folder 封面可连线；`children` 不跨层暴露 Handle                                 | 避免 drill-down 时连线语义失真                                             |
| Folder 内布局      | 打开时 bottom-up waterfall 自动排布，不存子坐标                                 | 避免过早引入子画布复杂度                                                   |
| ID 生成            | note / widget 使用 nanoid 风格 id，写入各自内容文件                             | 文件重命名不影响引用关系                                                   |
| 文件监听           | 暂不承诺持续 watcher；当前通过 load/search/export 按需读取 sidecar / widget / legacy `.md`，未来如做外部编辑器实时同步再引入 `fs.watch` / `chokidar` | 避免 watcher 循环、跨 workspace 切换 teardown 和 JSON 冲突过早复杂化 |
| 持久化策略         | manifest/layout 约 2500ms debounce，viewport 约 500ms debounce，widget 内容独立 debounce，视图切换/失焦/隐藏时立即 flush | 平衡输入流畅度与磁盘写入频率 |
| 写入协调           | 分 debounce + 单串行写入队列 + 原子写                                           | 降低内容/布局竞态与文件损坏风险                                            |
| Checklist 导出     | Markdown 导出生成 GFM `- [x]` 任务列表                                          | 与 Obsidian/Typora 等生态兼容                                              |
| 图片/附件          | `attachments/` + `{kind}_{uuid8}.{ext}` 文件名，媒体流通过本地 token-auth HTTP 服务读取，视频/音频支持 byte range | 避免同名冲突，支持大文件导入和播放器 seek                                 |
| manifest 格式      | 与 @xyflow/react 原生 Node/Edge JSON 一致                                       | 加载时零转换，直接传入组件                                                 |
| z-order            | 数组顺序（后覆盖前）                                                            | 简单直观，React Flow 原生行为                                              |
| 路径格式           | workspace-relative POSIX path                                                   | 跨平台一致性                                                               |
| 颜色来源           | manifest `color` 覆盖 sidecar / legacy frontmatter `color`                      | 保留内容语义色与视图强调色的分层                                           |
| Viewport 持久化    | Per-view `viewport` 字段写入 `.canvas.json`，切换画布/重启后恢复                  | 用户回到上次浏览位置，避免每次打开从原点开始                             |
| 活跃画布持久化     | `activeViewId` 实时写入 `workspace.json`                                          | 重启后恢复到上次使用的画布                                               |
| 画布 chrome        | `canvasShowMinimap` + `CanvasViewportChrome`；背景 `default/paper/cream/mono`   | 视口导航可配置，主题色板含 cream                                         |
| 设置归属           | Workspace settings 存 `.ghostboard/settings.json`；当前 workspace 指针存 app-level `userprefs.json`；AI key 存 app-level credentials | workspace 可移植，同时避免把绝对路径和密钥写进可共享目录 |

### 5.11 Edge Cases & Guardrails

> 完整的 edge case 处理策略表格（文件断链、watcher 循环、frontmatter 解析失败、sidecar 损坏、manifest 损坏等）已迁移至 [技术规范文档 §9](./tech-spec.md#9-edge-cases--guardrails)。

> 桌面运行时选型对比（Electrobun / Tauri / Electron）已迁移至 [技术规范文档 §1.3](./tech-spec.md#13-桌面运行时选型)。

### 5.12 公开插件的数据保障

- 插件代码、本机安装信息、工作区启用与版本选择、插件业务数据、画布实例内容分别管理。纯命令和面板不创建虚假实例；现有内容 ID 与兼容数据不因插件化批量改名。
- 插件读取和修改资料通过宿主正式接口；保留内容实体与画布放置位置的区别。批量修改必须有一致性、冲突检查和可撤销结果，不能以逐个文件保存伪装完整事务。
- 保存失败不报告成功，加载失败不替换成初始空内容。更新迁移保护原始数据和备份；代码回退与数据回退是不同操作。
- 插件经 SDK 进行的操作绑定明确的工作区上下文，异步操作不因“当前工作区”切换而写入错误位置。插件直接读写文件可绕过这些机制，官方示例与文档一律使用 SDK。
- 陌生工作区中的插件来源只是提示，不能触发自动下载或执行；工作区启用配置用于体验管理，不是数据访问边界。
- 卸载、禁用和清理缓存不得删除用户内容、插件持久数据或历史恢复依赖；永久删除另行确认。安装目录、签名与版本规则见 [tech-spec §13](./tech-spec.md#13-高信任插件运行时)。

---

## 6. 隐私与安全 (Privacy & Security)

- **本地优先**：核心笔记、附件与画布布局在本地保存，默认不把整个 workspace 上传到远程服务。“本地优先”不等于所有功能都不联网。
- **无账号体系**：MVP 阶段不需要用户注册或登录。
- **外部访问边界**：链接预览、打开外链、远程 AI、插件 URL 下载、已启用的更新检查以及**任何已启用的第三方插件**都可能联网；需区分本地资料操作与用户触发或用户已启用的外部访问，不使用“任何数据绝不出设备”的笼统承诺。本地 ZIP 安装可离线完成。
- **AI 功能的隐私边界**：已有 AI 接入不代表全库读取。产品要求明确告知用户发送范围、服务提供方及失败状态，并保留关闭能力。extension 选区上下文当前取宿主 presentation 文本，不直接序列化任意实例 state；其他上下文补全路径仍需逐项验收。
- **插件执行边界（高信任模型）**：已启用的第三方插件与宿主前端代码运行在同一 JavaScript realm，可读取页面状态、修改 DOM、经宿主服务读写本机文件与联网；宿主不提供权限沙箱，不按能力逐项授权，`capabilities` 声明只用于展示。产品向用户传达的是“安装插件等同于运行第三方程序”，而不是任何隔离承诺。SDK 的宿主服务不复用 AI 凭据；插件对 AI 密钥等敏感配置的访问不由技术手段阻止，而由“是否安装该插件”决定。
- **安装与更新阶段的保证**：下载、解包与审阅阶段不执行包内代码，不运行依赖安装脚本；解包拒绝路径穿越与覆盖任意位置。作者自述、插件 ID 和下载摘要不等于已验证身份；更新必须由首次安装时固定的作者密钥签名，密钥变更、来源变化和不兼容版本须显式呈现并由用户决定。下载不复用宿主或浏览器登录凭据。
- **故障恢复保证**：安全模式在任何第三方代码加载前生效；坏插件、坏包、失败更新均不会使用户失去插件管理与数据恢复入口。

### 6.1 明确排除项 (Out of Scope for MVP)

- **实时协作**：MVP 不提供多人协作、CRDT、远程同步或 presence。冲突处理默认以单设备本地文件系统为边界；不承诺持续 watcher 或外部编辑器实时双向同步（见 §5.10），超出此范围不承诺一致性。
- **Folder 子画布 / 万能容器**：MVP 不把 Folder 设计为可自由摆放节点的嵌套画布，也不允许它收纳所有节点类型。完整空间结构继续由 Group / Canvas View 承担；若未来需要 Sub-canvas，应作为独立模型设计。
- **插件范围限制**：插件市场的交易/评分/推荐、Bun 后端入口、原生二进制、深度编辑器扩展和持续双向同步不进入公开插件首版；§2.14 中四类基本形态、URL/ZIP 安装、签名更新及恢复属于正式范围。范围限制不是安全边界。

### 6.2 无障碍基线 (Accessibility Baseline)

- **键盘可达性**：Tab 在当前上下文的可聚焦控件间移动；方向键可在选中节点之间导航；`Enter` 打开聚焦；`Escape` 返回上一级。例外：画布上恰好选中一个 Topic 且不在编辑态时，`Tab` 改为创建子主题；焦点进入输入控件、搜索、菜单或模态后，`Tab` 恢复常规焦点移动语义。
- **语义标注**：卡片、Folder、连接点、上下文菜单需预留 ARIA label / role，保证后续可接入屏幕阅读器。
- **视觉对比**：颜色不是唯一状态来源；选中、锁定、错误态需同时提供描边、图标或文字反馈，高对比主题作为预留能力。

---

## 7. 迭代路线图 (Roadmap)

### 7.1 当前开发顺序与验收门槛

下表是基础项目流程。公开插件的产品要求在 §2.14，运行时在 [tech-spec §13](./tech-spec.md#13-高信任插件运行时)。本节的阶段编号和 §7.3 的历史 P0–P3 不是同一套编号。代码存在、测试通过、桌面走查通过是三种状态。

| 顺序 | 目标 | 验收条件 | 当前状态 |
| --- | --- | --- | --- |
| D0 | 内置类型迁移不破坏基本操作 | 按类型验证创建、画布预览、打开、菜单、容器、复制、撤销、保存重载；禁用、未知或损坏实例不静默丢内容。Checklist/Folder 等差异先决策再同步实现和文档 | 已验收（D0-1–D0-4；桌面矩阵通过；D0 收口 164 文件 / 1486 测试；当前串行全量 167 文件 / 1509 测试；D1 搜索可达性另行跟踪） |
| D1 | 资料始终可达 | 用顶层、Group 内、Folder 内、detached、无引用内容分别验证搜索/文库/恢复入口；搜索命中后能到达对应内容而不只选中封面。无引用内容入口遵循已解决的 OD-2 | D1-1 搜索目标契约、D1-2 Folder 命中导航、D1-3 Unlinked Files 入口及 D1-4 位置×类型自动化矩阵已完成；2026-09-07 桌面点击、文库放回与重启走查通过 |
| D2 | 一次项目从素材到结果 | 用真实素材完成 §1.2；先手写一张结论 Note，再导出笔记及相关附件；明确不支持项，包含重启继续、重复素材、文件缺失和保存失败场景 | D2-1 合成资料夹具、D1 桌面门禁及 D2-2 正向流程/Markdown/JSON/PNG/ZIP 导出已验收；D2-3 已验收离线链接、缺失/损坏附件、保存失败、跨视图删除、不可写导出、撤销重启和本地编辑/AI 网络边界，并修复两项可靠性阻断；没有证据支持新增 D3 交互 |
| D3 | 只补流程暴露的最小缺口 | 记录现有步骤、阻断点、最小改动与验收样例；若手写结论足够，不另造大纲系统；若导出顺序确实阻断，再定义显式顺序及格式 | 候选需求，尚未承诺实现 |

**统一验收记录**：每项记录样例 workspace/素材构成、复现步骤、预期与实际结果、关联测试及未解决项；不要将用户私有资料提交到仓库。先跑相关单元/组件测试，代码变更提交前按仓库规范运行完整测试，再用桌面应用完成实际操作核验。

**基础流程不作为前置条件的事项**：应用发布签名、公测、支付、定价、官网、获客指标和垂直用户市场选择。插件手动安装允许未签名包，但未签名包不接受自动更新；已签名包的更新必须通过作者密钥校验，这属于 §2.14.4 的正式要求，不能据此豁免。

**公开插件**：装载（本地 HTTP + `import()`、import map、独立 root、宿主 `files` / `net`）、命令与面板、内容事务与自定义卡片、导入器、Ed25519 签名更新和安全模式都已在代码中，并有 `bun run test:plugin-t0` 至 `test:plugin-t4` 的 macOS arm64 发行包探针。QuickJS 运行时已删除。尚未完成的是 §2.14.6 的五项公开验收。每插件 Bun Worker 没有实现。SDK 写操作绑定工作区，切换后不得写到另一个工作区。D3 只在基础流程出现新阻断时启动，不挡住已经纳入范围的插件收尾。

### 7.2 开发计划与任务索引

下表保留 D0–D3 做过什么。当前未完成项是 Topic 桌面走查、§2.14.6 的插件公开验收，以及只有新阻断才会启动的 D3。

| 阶段 | 开发任务 | 关键依赖与交付 |
| --- | --- | --- |
| D0 | D0-1 行为规则决策；D0-2 既有扩展收尾；D0-3 生命周期回归；D0-4 文档与阶段验收 | 先解决 OD-6；承接现有收尾计划 T0–T6，不重做已有实现；对齐旧数据访问与类型行为 |
| D1 | D1-1 搜索目标契约；D1-2 Folder 命中到打开；D1-3 detached/unlinked 找回；D1-4 可达性验收 | 依赖 D0 容器规则；OD-2 决定无引用内容入口；后端命中和前端导航一起交付 |
| D2 | D2-1 合成资料与基线；D2-2 项目流程及导出；D2-3 阻断点记录与阶段关闭 | 样例可提前准备；最终验收依赖 D0/D1，通过重启、失败恢复和外部文件阅读核验成果 |
| D3 | D3-1 按问题证据补最小体验缺口 | 由 D2 问题触发；有序输出涉及 OD-7，不自动新增大纲、剪藏或行业系统 |

D0–D2 已验收，没有新的 D3 证据。下一步是 §2.14.6 的公开验收，以及 Topic 的桌面走查。改变四类插件形态、信任模型或数据保障时同步本文。

### 7.3 历史能力清单（非当前排期）

> 以下 P0–P3 和远期条目保留历史编号供回查。“已完成”是当时记录，不是 extension 迁移后的全量验收证明；当前状态以 §2.0 和 §7.1 为准。各任务的涉及文件、实现要点和关键算法请参阅 [技术规范文档](./tech-spec.md)。

> 本节历史 P 编号不对应公开插件的 T0–T6（也不对应已归档 v2 方案的 P0–P5），不能据历史完成标记认为公开插件阶段已完成。

#### 🔴 历史 P0 — 核心交互完善

| #   | 任务                                                      | 复杂度 | 状态      |
| --- | --------------------------------------------------------- | ------ | --------- |
| 1   | **右键菜单 (Context Menu)** — 画布、单节点、媒体节点、多选、Folder/Group/Sticky/Edge 上下文 | 中     | ✅ 已完成 |
| 2   | **键盘快捷键** — Delete/Cut/Copy/Paste/Duplicate/Group/Search/Zoom/方向键选择、模态屏蔽 | 低     | ✅ 已完成 |
| 3   | **节点连线 (Edges)** — 四向 Handle + `labeledEdge` + bezier/smoothstep + 浮动端点 + 连接预览线 | 中     | ✅ 已完成 |
| 4   | **选择模型重构** — 普通单击打开，框选/修饰键/右键/方向键显式选择 | 中     | ✅ 已完成 |
| 5   | **FolderNode Resize** — NodeResizeControl                 | 低     | ✅ 已完成 |
| 5.1 | **碰撞检测与放置解析** — Group/Folder 拖拽时的排斥与自动归属判定 | 中     | ✅ 已完成 |

#### 🟡 历史 P1 — 核心特性（差异化亮点）

| #   | 任务                                              | 复杂度 | 状态      |
| --- | ------------------------------------------------- | ------ | --------- |
| 6   | **Group 开放式分组** — 三阶段拖拽 + 预设颜色 + 排斥力学 | 高     | ✅ 已完成 |
| 7   | **撤销/重做 (Undo/Redo)** — 快照历史栈            | 中     | ✅ 已完成 |
| 8   | **便签 (Sticky Note)** — 单击原地编辑、钉住后才显示 CSS pushpin、纯文本保存、不进入聚焦；钉住只锁位置 | 低     | ✅ 已完成 |
| 9   | **图片卡片** — 拖拽/粘贴/选择器导入，缩略图生成，聚焦懒加载原图，替换与缺失重试 | 中     | ✅ 已完成 |
| 9.1 | **BlockNote 块编辑器** — 聚焦模式块级编辑，JSON sidecar canonical source，支持标题/列表/任务/代码块等，Markdown 按需导出 | 中     | ✅ 已完成（取代旧 Tiptap 方案） |
| 9.2 | **画布预览渲染** — sidecar cached preview + legacy markdown-it / DOMPurify 安全预览 | 低     | ✅ 已完成 |

#### 🟢 历史 P2 — 数据层与增强功能

| #    | 任务                                                               | 复杂度 | 状态      |
| ---  | ------------------------------------------------------------------ | ------ | --------- |
| 10   | **数据持久化** — 端到端链路（manifest + .md 拆分 + RPC + hydrate） | 高     | ✅ 已完成 |
| 11   | **全局搜索** — Cmd/Ctrl+K，跨画布搜索与定位；Folder children / unreferenced Markdown 覆盖待补 | 中     | ✅ MVP 已完成 / ⚠️ 覆盖待补 |
| 12   | **连线标签与动画** — 可编辑 label + 流动虚线 + Marker 端点           | 低     | ✅ 已完成 |
| 13   | **Group 嵌套** — 多级 parentId + 防循环                            | 中     | ✅ 已完成 |
| 13.1 | **画布标题栏模糊** — 顶部工具栏背景模糊效果                          | 低     | ✅ 已完成 |
| 14   | **画布导出 PNG/JSON**                                              | 低     | ✅ 已完成 |
| 14.2 | **Folder Card 子节点迁移 noteId + 独立 note record**（M5）                     | 中     | ✅ 已完成 |
| 14.3 | **设置弹窗（General / Workspace / AI / Shortcuts / About）**            | 低     | ✅ 已完成 |
| 14.5 | **Canvas 模板库** — ViewSwitcher「+」按钮子菜单、`/templates` 列表、`/templates/$templateId` 只读预览、基于模板创建新画布 | 高     | ✅ MVP 已完成 / ⚠️ P5 收尾待补 |
| 14.6 | **Per-view Viewport 持久化** — 每个画布的 ReactFlow viewport（x/y/zoom）随 `.canvas.json` 持久化，切换画布/重启后恢复 | 低     | ✅ 已完成 |
| 14.7 | **活跃画布持久化** — `activeViewId` 写入 `workspace.json`，重启后恢复到上次使用的画布 | 低     | ✅ 已完成 |
| 14.8 | **Asset / Link 多模态节点** — 本地文件、视频/音频/文本/压缩包预览、链接创建与 unfurl、Document 类型视图接入 | 高 | ✅ MVP 已完成 / ⚠️ PDF 页级预览、视频转码、网页剪藏待补 |
| 14.9 | **标签管理** — TagEditor、TagSidebar、node-metadata.json、标签筛选与重命名/删除 | 中 | ✅ 已完成 |
| 14.10 | **Recording 录音节点** — 麦克风录制、实时 waveform、附件保存、画布播放、Folder/Group 收纳 | 中 | ✅ 已完成 |
| 14.11 | **Markdown 文件导入** — 多文件选择导入为新 Note，创建卡片并保留 frontmatter / 正文 | 低 | ✅ 已完成 |
| 14.12 | **Widget 系统** — `type: widget` + checklist/pomodoro/reminder；独立 JSON；懒迁移 checklist；per-widget undo；Folder 收纳 | 高 | ✅ MVP 已完成 |
| 14.13 | **Folder waterfall 展开** — bottom-up 多列排布、动态封面缩略图、展开层子项右键 | 中 | ✅ 已完成 |
| 14.14 | **FocusedView morph + 共享 loading** — 从源卡片 scale 展开；`NoteEditorLoading` | 中 | ✅ 已完成 |
| 14.15 | **画布 viewport chrome** — minimap + zoom 合一面板；`canvasShowMinimap` 设置 | 低 | ✅ 已完成 |
| 14.16 | **Cream 画布背景** — settings swatch；`default/paper/cream/mono` | 低 | ✅ 已完成 |

#### ⚪ 历史 P3 — 后续迭代

| #    | 任务                         | 复杂度 | 状态      |
| ---  | ---------------------------- | ------ | --------- |
| 15   | **多画布视图切换**           | 中     | ✅ 已完成 |
| 16   | **多 workspace 管理**        | 中     | ❌ 待实现 |
| 17   | **节点锁定**                 | 低     | ✅ 已完成（节点右键 Lock/Unlock，`data.locked` 持久化，锁定时禁用 drag/connect/delete，并置灰改色、编辑标签、删除和删除分支；夹带锁定节点的删除会跳过它们并提示一次。锁定的便签额外不能编辑、不能缩放。右上角显示锁定徽章） |
| 18   | **框选 (Marquee Selection)** | 低     | ✅ 已完成（React Flow 内置框选 + 自定义选框样式） |
| 19   | **导入 JSON / Markdown 覆盖重新导入** | 低     | ❌ 待实现 |
| 20   | **移动端适配**               | 高     | ❌ 待实现 |
| 21   | **Group 拖拽推开**           | 中     | ✅ 已完成 |
| 22   | **`extent: "parent"` 约束**  | 低     | ✅ 已完成（createNode / useNodeDrag / clipboard paste / initialNodes 均已在写入 parentId 时附带 extent: 'parent'，normalizeCanvasParenting 保留） |
| 23   | **Edge 颜色/样式**           | 低     | ✅ 已完成（边右键菜单 Cycle Color，LabeledEdge 读取 data.color） |
| 23.1 | **桌面应用图标** — 多尺寸 icns/ico | 低     | ✅ 已完成 |

#### 🔮 历史远期设想

| #   | 任务                     | 说明                                                                                                                                                                                             |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 24  | **高级视频/PDF 卡片**    | Asset MVP 已支持大文件原生导入、视频/音频播放、音频 waveform、视频 poster 和基础 PDF 预览；后续补 PDF 页级缩略图/导航/批注、视频转码/封面编辑                                                                                                                                 |
| 25  | **富 Web Clips**         | Link MVP 已支持 URL 节点、基础 unfurl、favicon/image 元数据与富媒体卡片样式；后续补网页剪藏、离线快照、Magazine 风格预览                                                                                                                                 |
| 26  | **全局快捷键快速输入**   | Quick Input from anywhere                                                                                                                                                                        |
| 27  | **AI 辅助**              | ✅ 基础架构已实现 — 本地 HTTP 服务器支持 AI 流式传输，集成 Gemini 等 AI 能力进行内容总结、生成和关联推荐。后续需完善 UI 入口和用户体验。                                                                 |
| 28  | **商业化**               | ✅ 许可证管理系统已实现 — 硬件绑定 + 本地加密存储，后端 API 支持签发/激活/验证/撤销，未激活用户限制 100 张卡片（计数包含 `card`、`sticky` 与 `topic`，共用同一额度）；该门禁在新建、主题提交、粘贴、复制选中、JSON 画布导入与插件投放各入口一致生效，不因某个入口漏判形成隐式豁免。激活用户无限制。后续需完善支付集成和订阅管理。                                                                 |
| 29  | **双向链接 (Backlinks)** | 支持 `[[note]]` 语法在笔记正文中引用其他笔记，自动建立反向链接索引。与 Edge 系统互补——Edge 是画布上显式的视觉关系，Backlink 是内容层隐式的语义关系。侧边栏或聚焦模式底部展示"被哪些笔记引用"列表 |

---

## 8. 项目待办与未决策 (Backlog & Open Decisions)

> 本章节记录产品待办与未决策，不另行定义一套排期；当前顺序以 §7.1 为准。决策落地后，把对应行删除或改为“已决策”，同步正文、相关功能方案与回归测试。产品目标由 PRD 定义，代码现状通过源码与运行验收核实，历史描述不作为实现完成的证据。

### 8.1 架构级未决策

| ID | 题目 | 背景与选项 | 状态 |
| --- | --- | --- | --- |
| OD-2 | **搜索范围** | Folder 内按类型补齐命中与打开属于 D1 基础要求，不再作为可选项；无 manifest 引用的内容仍需决定：① 搜索整个 workspace 内容库；② 仅搜索可定位对象，但在文库提供明确找回入口。建议区分 placed / detached / unlinked，清理工具不作为唯一访问路径。 | **已决策：选择②**。全局画布搜索保持 placed / detached / Folder 等可定位对象；Note Library 的 Unlinked Files 提供只读清单和非破坏性找回。仅带稳定 `noteId` 的 Markdown / BlockNote sidecar 可显式恢复为当前画布的顶层 Card；无 id Markdown 走显式导入，Widget / Extension 记录只按原类型展示并保留给后续宿主恢复，不在该入口强制转换或删除。 |
| OD-3 | **多 Workspace 管理** | 当前可在设置页选择下次启动 workspace，并把路径写入 app-level `userprefs.json`；完整多 workspace 仍需要欢迎页、recentWorkspaces、activeWorkspace、无重启 workspace switch、app-level config。 | 待实现 |
| OD-4 | **app-level vs workspace-level settings** | 当前 workspace 内设置在 `.ghostboard/settings.json`，workspace path 在 app-level `userprefs.json`，AI key 在 app-level credentials。仍需决定 theme/locale/trash cleanup/AI 模型等在多 workspace 目标下的归属。 | 待决 |
| OD-5 | **Folder / Detached 删除语义** | 当前顶层删除移除 canvas node，Folder child 删除会清理 child note，删除 Folder 会把 children 转为 detached 节点；Image/Asset/Recording 附件与 Link 元数据仍按 manifest/附件模式处理。若转向 filesystem-first，需要重新定义"删除引用"与"删除真实文件"的确认流程。 | 待决 |

### 8.2 产品体验未决策

| ID | 题目 | 当前差异或问题 | 决策要求 |
| --- | --- | --- | --- |
| OD-6 | **Productivity 的打开与 Folder 边界** | 历史矩阵误把三个 Productivity 类型记为可进入 Folder；Checklist 的完整编辑入口在 Canvas Type 迁移后不可达 | **已验收**：Checklist 使用 `detail` 打开完整编辑；Pomodoro / Reminder 保持画布内操作；三者可进入 Group、不可新进入 Folder。旧 Folder 内 `widget` / `extension` 条目继续可预览、搜索并无损取回 |
| OD-7 | **输出是否需要独立结构** | 当前已有 Note 与导出，不代表已支持按 Group/空间关系生成有序大纲 | D2 先验收手写结论；只有真实流程暴露阻断，才决定是否新增显式排序/大纲模型，不从坐标自动猜测写作顺序 |
| OD-8 | **首个垂直用户场景** | 创作者、方案准备者、研究学习者均为候选，尚无足够证据确定 | 当前不据此扩张行业功能；基础流程完成后再结合可触达用户的实际任务决策 |

### 8.3 已知待办

公开插件的未完成项是 §2.14.6，不是重新实现运行时。下表沿用历史优先级，不重新给插件编号。

| ID | 事项 | 目标 | 优先级 |
| --- | --- | --- | --- |
| TODO-1 | **补齐 Folder 搜索与打开** | Widget / Extension 后端引用收集已有；补齐 Note 等缺口，并逐类型验证前端 fallback、搜索命中、进入 Folder 和打开子内容，不能只定位封面。 | D1-2 自动化实现、D1-4 位置×类型矩阵及 2026-09-07 桌面走查完成；后续新增类型沿用矩阵 |
| TODO-2 | **明确无引用内容入口** | 解决 OD-2，为无 manifest 引用的内容定义正式搜索或文库找回入口，并区分浏览、恢复与永久清理。 | D1-3 已决策并实现 Note Library 清单及稳定 note 恢复；D1-4 自动化 + 2026-09-07 桌面放回/重启验收完成 |
| TODO-3 | **Asset 大文件导入** | ✅ 已实现 — 文件选择优先 native path copy，拖拽/粘贴走本地 HTTP 流式上传；25 MB data URL 限制仅保留为 legacy fallback。 | ~~P1~~ ✅ |
| TODO-4 | **Link 富预览与安全硬化** | ✅ 已实现 — UI 展示 favicon/image preview；unfurl 已增加 DNS 解析后的私网 IP 防护，降低 DNS rebinding 风险。 | ~~P1~~ ✅ |
| TODO-5 | **PDF 页级预览** | 基础内嵌 PDF 预览已实现；后续补页面缩略图、页码导航、批注和更稳定的失败兜底。 | P2 |
| TODO-6 | **模板库 P5 收尾** | 补模板数量，接入 thumbnail，删除 `preview-test` 路由，决定从模板创建的画布命名规则，考虑 URL query 同步与 i18n metadata。 | P1 |
| TODO-7 | **Multi-workspace** | 欢迎页、创建/打开/切换 workspace、recent list、app config、settings 迁移策略。 | P2 |
| TODO-8 | **独立 saveNote debounce** | ✅ 已实现 — BlockNote 走 `useBlockNoteSaver` + `rpcSaveBlockNote` 独立 debounce；legacy Markdown 走 `useNoteSaver` + `rpcSaveNote`，均支持 blur / hidden / unmount flush。 | ~~P2~~ ✅ |
| TODO-9 | **ContextMenu 多选批量操作** | ✅ 已实现 — 多选右键菜单支持 Duplicate、Group、Change Color、Edit Tags、Lock/Unlock、Move to View、Copy、Delete，并保留选中集合内部连线。来源：原 UX 审计 8.2.1。 | ~~P2~~ ✅ |
| TODO-10 | **FocusedView 遮罩关闭保存确认** | 检测 BlockNote 是否有未 flush 的修改，有则弹出 "Discard changes?" 确认。当前点击黑色遮罩直接 `onClose()`（[FocusedView.tsx#L291](./../src/mainview/components/canvas/FocusedView.tsx)），debounce 未到期的编辑可能丢失。来源：原 UX 审计 8.5.3。 | P2 |
| TODO-12 | **FocusedView 卡片位置面包屑** | 在返回按钮旁显示 `{FolderName} > {CardTitle}`，让聚焦中的卡片有归属感（尤其是 Folder child）。来源：原 UX 审计 8.5.2。 | P3 |
| TODO-16b | **BlockNote 选区字数统计** | FocusedView 当前已展示整篇正文字数/字符数（基于 markdown 文本剥离格式后统计）。后续可在 BlockNote 选区变化时给出选中文本的字数统计。来源：原 UX 审计 8.1。 | P3 |
| TODO-17 | **BlockNote 查找替换** | 当前 BlockNote 无内置 find/replace；接入或自研一个轻量查找替换面板，至少支持 `Cmd+F` 高亮匹配。来源：原 UX 审计 8.1。 | P3 |
| TODO-23 | **Markdown 批量导出 UI 入口** | 设置页添加「导出所有笔记为 Markdown…」按钮；画布多选后提供「批量导出选中」入口。RPC `exportNotesMarkdown` 已支持 `scope: 'all' \| 'selected'`，只缺前端入口；当前 Settings 已是主窗口内 Dialog，可直接复用现有 renderer/RPC 通道。 | P2 |
| TODO-24 | **显式「从 Markdown 重新导入」** | 当前已支持选择多个外部 `.md` 文件导入为新 Note；仍缺"覆盖当前笔记内容"路径。新增 RPC（解析外部 `.md` → blocks → 写 sidecar → invalidate）；focused view 工具栏 / 卡片右键提供入口；二次确认对话框说明「会覆盖当前编辑器内容、可能丢失高级块结构」。 | P1 |
| TODO-25 | **Phase 0 文案** | 设置页 / onboarding 添加说明：「Markdown 是按需导出格式，不会在每次保存时自动生成；外部 Markdown 需显式导入」。 | P2 |
| TODO-26 | **Markdown 预览附件渲染** | 预览 HTML 中附件真正渲染（注册自定义 scheme 或懒解析），当前用稳定占位 badge 未渲染真实图片。 | P3 |
| TODO-18 | **`src/bun/index.ts` 单文件过长** | 所有 RPC handler 注册在一个文件里（当前约 2841 行），每加一个功能都要改这个文件。建议按业务域拆分为 `handlers/canvas.ts`、`handlers/settings.ts`、`handlers/template.ts`、`handlers/assets.ts`。来源：原架构审计。 | P2 |
| TODO-19 | **主路由 `index.tsx` 过长** | 画布页面的全部逻辑集中在一个组件中（当前约 1584 行）。建议继续提取 `useCanvasDragDrop`、`useCanvasExport`、`useCanvasInit`、`useCanvasSearchNavigation` 等自定义 hooks。来源：原架构审计。 | P2 |
| TODO-20 | **深色主题覆盖不完整** | 近期 design tokens / accent 色已有改善，但 Group label、部分 placeholder、媒体卡片 hover 信息等仍需逐组件审查深色主题适配。来源：原架构审计。 | P2 |
| TODO-22 | **Onboarding 引导流程** | 首次打开应用 seed 了 `quick-start` 模板，但没有任何浮层引导。建议在首次启动时显示 3-4 步引导浮层：1.「拖拽平移画布」2.「点击卡片打开，框选/修饰键选择」3.「右键或 + 创建新内容」4.「Cmd+K 搜索」。来源：原架构审计。 | P2 |

### 8.4 已落地的关键决策映射（供回查）

| 决策摘要 | 落地位置 |
| --- | --- |
| Folder Card 子节点强制 `noteId + note record`（M5） | §5.1、§5.6、§5.10 |
| Widget 独立于 Card；checklist 懒迁移；内容不进 manifest | §2.2、§5.1、§5.3、§5.10；[tech-spec](./tech-spec.md) §3.3 / §4.2.1 / §7 |
| Folder 展开用 waterfall，不持久化子坐标 | §2.5.2、§5.10 |
| FocusedView 从源卡片 morph | §2.3 |
| canvasShowMinimap + cream 背景 | §5.2 |
| Folder 是内容集合，不是万能容器；允许 Card/Image/Asset/Link/Recording 与显式允许的 Canvas Type，不允许 Folder/Group/Sticky/Topic 或当前 Productivity 新进入；历史 Widget/Extension child 保留兼容取回 | §2.5.2、§5.6、§5.10 |
| Topic 为核心节点类型；层级唯一真源是 `topic-child` 树边；树边归宿主管理；整棵树进出 Group；主题大纲可导出 Markdown | §1.3.1、§2.2、§2.4、§2.5、§2.6、§2.9、§2.10、§5.6、§5.9 |
| Detached notes 取代早期 `unplaced notes` 概念 | §2.8、§2.12 |
| BlockNote 与画布 undo/redo 栈隔离 | §2.10 |
| TagEditor + TagSidebar + node-metadata.json | §2.13、§5.3 |
| BlockNote JSON sidecar (`content/.ghostboard/blocknote/`) | §2.2、§5.3 |
| 旧 `.md` 同步副本退役，Markdown 变为 legacy/import fallback 与按需导出格式 | §2.2、§5.4、§5.9、§5.10 |
| Asset / Link / Recording 作为独立 node kind，不混入 Card frontmatter | §2.2、§5.1、§5.6、§5.10 |
| Sticky 钉住（`data.pinned`）只固定当前位置；锁定（`data.locked`）才禁止编辑、缩放、连线和删除 | §2.2、§2.5.1、§2.6、§2.11、§5.4 |
| Settings 从独立窗口入口收敛到主窗口内 `SettingsDialog`，workspace 指针拆到 app-level `userprefs.json` | §2.12、§5.2、§5.10 |
| PNG / JSON 导出已落地；JSON 导入和 Markdown 覆盖重新导入仍待补 | §5.9、§7、§8.3 |
