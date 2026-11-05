# 产品需求文档 (PRD)：GhostBoard 本地空间工作台

> **相关文档**
>
> - [减法版 PRD](./PRD-slim.md) — 当前阶段的范围以它为准：保留、隐藏与冻结清单
> - [技术规范文档](./tech-spec.md) — 架构、目录、状态、持久化、RPC、Canvas Type 行为、本地 HTTP 端点、许可证、诊断与发布
>
> **插件**：插件系统已于 2026-11-05 删除，见 §2.14。
>
> **文档基线（2026-11-03）**：本文描述当前产品行为与仍未决定的范围。基础项目流程、Topic、Checklist / 恢复验收已有记录；已完成任务不再保留在待办中。正式官网、双语文档、Web App 与 API 已部署到 `ghostboard.21blog.com`，后端继续使用 Neon。网站 Google OAuth / Resend / OpenAI 配置由用户明确暂缓。尚待安全核验、产品决策与条件需求集中在 §8；构建、测试与原生验收过程见 [结项记录](./8.5-closeout.md)。

## 1. 产品概述

### 1.1 当前定位与开发对象

**GhostBoard 是一款本地优先的个人空间工作台，帮助用户围绕一个具体项目，把笔记、链接和本地素材放在一起，完成浏览、整理、比较与记录结论。**

- **当前服务的任务**：一个人围绕一个主题准备文章、研究笔记或方案，需要反复对照多份资料；不要求用户先迁移整个知识库。
- **核心问题**：素材分散在网页、文件和笔记中，切换查看后容易失去上下文；整理后的资料还需要能被找回、继续编辑，并形成可带走的结论。
- **产品方法**：用画布保留资料之间的空间关系；用 Group 表达工作分区，用 Folder 收纳资料，用聚焦视图阅读和编辑。空间布局应降低整理成本，而不是要求用户先学会一套复杂的知识管理方法。
- **目标用户仍待验证**：独立创作者、个人方案准备者与研究学习者是候选人群，不把其中任何一类写成已经验证的市场。当前用同一条项目流程验收基础能力。
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

### 1.3.1 Topic 与轻量思维导图

Topic 是用于思路展开的轻量主题节点，标题为纯文本。支持 Tab / Enter 连续创建、向右自动排布与避让，以及分支选择、复制、整理、拆出和删除。`topic-child` 树边是层级的唯一真源；Group 只表示空间容器，整棵树须一起进出 Group。主题与 Card / Sticky 共用免费额度。

主题草稿在离开画布前提交；非法关系会暂停写入并保留原始备份。大纲导出先校验树关系，只输出标题与层级。连续创建、一步撤销重做、分支复制、Group 进出、锁定拒绝、搜索、正常退出重启与原生目录导出已在 macOS arm64 验收。

### 1.4 当前不扩张的方向

- 暂不确定垂直行业路线，不新增专门的论文引用系统或完整脚本编辑器。
- 暂不扩张多人实时协作、移动端与支付订阅流程。
- 已有小组件与 AI 保留，优先补齐安全与行为边界，不为丰富功能清单继续增加类型。
- 网页剪藏、摘录溯源等先作为候选需求；只有现有手工流程的阻断点明确后，才进入下一轮开发。「主题大纲 Markdown 导出」已随 Topic 落地，但它只输出主题标题与层级；把整张画布转成有序文章仍是候选需求。

## 2. 核心功能模块与交互逻辑

### 2.0 当前代码基线与迁移差异

本节区分“代码已接入”和“产品已验收”。下表记录当前实现与兼容规则；发行平台和外部验证范围见 §2.14.5–§2.14.6。后续小节出现 legacy `widget/image/asset/link/recording` 描述时，涉及迁移类型的当前代码边界先查本节；旧行为是否保留需要显式决策，不能靠实现差异自动改写产品要求。

| 核查项 | 当前代码事实 | 产品处理 |
| --- | --- | --- |
| 内置类型 | [registerBuiltins](../src/mainview/extensions/registerBuiltins.ts) 注册 Checklist / Pomodoro / Reminder / Image / File / Link / Recording，Counter 仅开发环境注册 | 用用户可见类型描述功能，不把 React Flow 的 `node.type` 当产品分类 |
| 打开与容器能力 | [Canvas Type 契约](../src/mainview/extensions/types.ts) 声明 `openBehavior`、Group/Folder 能力、详情布局、通用交互与类型菜单 | 创建、右键、聚焦、文库等入口必须使用同一能力规则 |
| 媒体与链接 | 当前内置 Image / File / Link 声明详情视图，Recording 声明画布内操作；四者均声明可进入 Group / Folder | 迁移后继续验收预览、媒体操作、收纳、搜索、导出和错误回退，不只验收能显示 |
| Productivity | Checklist 声明 `openBehavior: 'detail'`，Pomodoro / Reminder 声明 `openBehavior: 'none'`；三者均可进入 Group、不可进入 Folder，见 [Checklist](../src/mainview/extensions/builtin/productivity/checklist.tsx)、[Pomodoro](../src/mainview/extensions/builtin/productivity/pomodoro.tsx)、[Reminder](../src/mainview/extensions/builtin/productivity/reminder.tsx) | 已冻结的行为规则：Checklist 保留完整详情编辑，Pomodoro / Reminder 保持画布内操作；禁止新放入 Folder，旧 Folder 内条目可预览、搜索、打开并无损取回 |
| 内容引用 | [迁移序列化](../src/shared/extensions/migrateNodes.ts) 将 extension 节点写为 `canvasTypeId + instanceId` 引用，并保留 `detached` 等宿主标记 | §5 的 widget/media 旧存储描述不能当作迁移后全部类型的现状；验收复制、保存重载与找回时不能丢失实例状态 |
| 搜索 | [searchWorkspace](../src/bun/search.ts) 已分别收集 Note / Widget / Extension 引用；后端与当前画布 fallback 均覆盖 Folder Card / Widget / Extension，并保留 Folder child 与 detached 的定位目标 | 搜索命中、定位和打开使用同一目标契约；新类型需同时接入后端与 fallback |
| AI 选区上下文 | [buildAIContext](../src/mainview/lib/ai/buildAIContext.ts) 对迁移后的 extension 使用宿主 presentation 的 `title/plainText`，不直接读取任意实例 state；选中的 Topic 贡献纯文本标题，并单独给出 `topicParentId` / `topicOrder`，与表示容器归属的 `parentId` 区分 | 不承诺已读取图片像素、附件全文或录音转写；未知/失败实例与无有效文本内容的回退纳入验收；标题为空的 Topic 不计入可摘要内容 |

容器与打开规则以 [tech-spec §12](./tech-spec.md#12-画布类型行为) 和 `canvasNodeRegistry.ts` 为准。新增类型需按相同规则验证创建、打开、容器、复制、撤销、保存重载和错误回退。

### 2.1 无限自由画布 (Infinite Canvas)

- **功能描述**：一个没有边界的 2D 空间，用户可以在任意位置放置内容节点。
- **交互逻辑**：
  - **平移 (Panning)**：支持触控板双指滑动或鼠标中键拖拽，实现画布的无级平移。
  - **缩放 (Zooming)**：支持触控板捏合、`Ctrl/Cmd + 滚轮` 以及 `Cmd/Ctrl + +/-/0` 缩放。节点在所有缩放等级保持同一套真实内容与视觉结构，不在固定阈值批量切换 placeholder / skeleton；Image / Asset 继续使用既有缩略图和摘要数据控制媒体成本。低缩放专用 LOD 只有在实际 Profiler 数据证明必要后才重新引入。
  - **选择与聚焦 (Selection & Focus)**：
    - 当前采用"单击打开、框选选中"模型（用户 2026-11-05 定）——单击（双击同效）：可聚焦节点在右侧边栏打开，Folder 进入 drill-down，未锁定 Sticky 进入原地编辑；单击不会选中卡片，`Shift/Cmd/Ctrl+Click` 也不选中。选中只能在空白处拖出选框；框选后按 `Enter` 打开、按 Delete 删除。锁定的 Sticky 不进入编辑。
    - 多选集合支持批量拖拽、删除、复制/剪切/粘贴、重复、分组、锁定/解锁、改色、编辑标签、移动到其他画布，以及拖入 Group/Folder。
    - 拖拽、连线和框选判定优先于单击打开；拖拽卡片不会选中它。
  - **框选 (Marquee Selection)**：桌面端在画布空白处左键拖拽绘制选择框，按部分相交规则选中多个节点。当前 `selectionOnDrag` 在普通画布状态启用；按住空格进入平移模式或处于文本/输入编辑态时临时关闭，避免与平移和编辑冲突。进入聚焦模式或 Folder drill-down 后，框选仅作用于当前上下文，不影响背景画布。

### 2.2 多模态信息卡片 (Content Cards)

> **迁移说明**：下列 Widget 存储描述保留用于解释旧数据兼容；当前内置类型已接入 extension，新实例状态存放在 `.ghostboard/extension-instances/`。Productivity 的聚焦与 Folder 规则见 §2.0，旧 `.ghostboard/widgets/` 数据仍须可读取和取回。

- **功能描述**：画板上的基本元素，支持不同类型的数据载体。
- **卡片类型**：
  - **图文卡片**：包含图片和文本（如演示中的 Target audience 饼图卡片）。
  - **长文本/文档 (Note Card)**：承载长篇幅的文章。在聚焦模式下使用 **BlockNote 块编辑器**进行 Notion 风格的所见即所得编辑，支持标题、列表、任务列表、引用、代码块、行内代码、粗斜体、删除线、链接、图片、分割线等常用块。BlockNote 文档以无损 JSON sidecar (`content/.ghostboard/blocknote/<noteId>.json`) 作为 canonical source；Markdown 只作为 legacy/import fallback 与按需导出格式，保存时不再维护同步 `.md` 副本。
  - **小组件 (Widget)**：独立于 Card 的节点类别，React Flow `type: "widget"`，用 `kind` 区分具体种类。**内容不写入 canvas manifest**，而是存放在 `.ghostboard/widgets/<widgetId>.json`；manifest 只保留 `{ widgetId, kind }` 引用。当前支持三种：
    - **待办列表 (Checklist)**：画布上可直接勾选与在列表末尾添加条目，不改变全局交互状态（保持 `idle` / `selected`），不触发 `inline-editing`；完整编辑可进入 FocusedView。内容字段为带稳定 `id` 的 items 数组；迁移后的编辑通过 Canvas Type host 写入 extension instance 并记录实例历史，不经 `commitNodeData` 写回 manifest；legacy widget 继续走 `widgetStore` 兼容路径。
    - **番茄钟 (Pomodoro)**：专注 / 短休 / 长休计时器，画布上直接操作。运行中 tick **不**每秒写盘，仅在 start / pause / complete 等状态转换时保存；加载时若 `running` 已超时则按完成结算。
    - **提醒 (Reminder)**：截止时间与状态（scheduled / snoozed / done / missed）。第一版仅在 app 打开时做应用内提示，`repeat` 只实现 `'none'`；系统通知与重复提醒后置。
    - **生命周期**：legacy widget 删除、克隆和撤销继续遵守原有 `widgetStore` / widget 文件规则；迁移后的实例更新走 extension instance store 与 per-instance history，同样不写入画布快照。复制、删除与重载保留实例内容；未知或损坏记录显示兼容回退并保留原件，补回记录后可重新加载。
    - **Checklist 迁移**：`loadCanvas` 已对带 noteId 的 legacy checklist Card（含 Folder child）执行 card → widget，并继续走 widget → extension 迁移；同时迁移标签：保留原有放置标签，为其余放置复制一次旧标签，显式清空后不再复活。迁移写入失败时保留可读可操作的旧卡片，修复后可重试；源 Markdown 不因替换引用立即删除。顶层与 Folder 子项的编辑、取回、标签和重启均已验证。
  - **图片卡片**：支持拖拽上传、粘贴、或从文件选择器导入图片。导入时按图片自然宽高自动计算卡片尺寸，并生成轻量缩略图；画布态优先显示缩略图，聚焦模式下懒加载原图。支持图片替换二次确认、缺失图片重试、标题重命名和标签管理。
  - **本地文件卡片 (Asset)**：支持从文件选择器、拖拽和粘贴导入本地文件，文件内容保存到 `attachments/`。选择与拖入通过 File 字节流上传，避免大文件走 data URL；可信主进程内部可使用路径拷贝，渲染端不提供任意绝对路径拷贝入口；保留 25 MB data URL 限制仅作为 legacy 路径。画布态以预览为主：视频 poster、音频 waveform、图片缩略图、PDF/普通文件纸张图标、文本/JSON 摘要、压缩包条目摘要；文件名、大小、时长、路径等细节进入 hover 信息面板。FocusedView 中视频/音频可播放，图片、文本和 PDF 可预览，普通文件提供 `Open file`。支持替换文件、在 Finder 中显示、标题重命名和标签管理。PDF 已有基础内嵌预览，但页面级缩略图、页码导航和批注仍属后续增强。
  - **录音卡片 (Recording)**：支持通过创建菜单或画布右键启动麦克风录音。录音弹窗自动请求权限并展示实时 waveform 与计时，停止后以用户可读的 `recording-N.<ext>` 作为显示文件名，实际音频通过统一附件链路保存到 `attachments/audio_<id>.<ext>`，并生成 duration / waveform / stream URL。Recording 在画布上以语音备忘录样式展示，可直接播放、暂停、重命名、标记标签、改变颜色、锁定和删除；它可以进入 Group/Folder，但当前不进入 FocusedView。
  - **链接卡片 (Link)**：支持从创建菜单输入 URL，或粘贴/拖拽 URL 到画布后自动创建 Link 节点。系统通过本地 HTTP 服务器进行链接预览（unfurling），抓取网页标题、描述、站点名、favicon/image 元数据；画布 UI 展示富媒体卡片样式，支持打开链接、复制 URL、重新抓取预览和编辑 URL。URL 创建路径只接受安全的 http(s) 链接，打开外部链接时限制为 http/https/mailto；unfurl 抓取在 DNS 解析后校验目标 IP，拒绝私网地址，降低 DNS rebinding 风险。
  - **便签 (Sticky Note)**：轻量级的彩色便签，支持快速记录短文本。可在 120–500 × 120–500 范围内调整大小，提供多种预设颜色。正文以纯文本写入 manifest 的 `data.content`，粘贴时剥离富文本格式。便签不进入聚焦放大模式（FocusedView），编辑都在画布上原地完成。
    - **未钉住（默认）**：可以拖拽，光标为抓取。单击进入原地编辑；框选中后按 `Enter`，或焦点在便签上时按 `Enter` / `Space`，也会进入编辑。失焦后把正文写回 `data.content`。未钉住时不渲染图钉。
    - **钉住位置**：右键「固定位置」/「取消固定」（英文 Pin in Place / Unpin），状态写入 `data.pinned`。钉住只固定便签在**当前父坐标系**中的位置，正文编辑、缩放、连线、改色、改标签和删除仍然可用。钉住后光标为默认箭头，并显示 CSS 图钉；图钉渐变按便签颜色派生，只在 `data.pinned === true` 时渲染，正文同时留出顶部间距。用户拖拽、碰撞排斥、普通 position 更新和 AI `move_node` 都不会移动它。父级 Group 移动时，子便签的相对坐标保持不变，因此随 Group 一起移动。父级归属变化带来的坐标换算（例如进出 Group）会保留换算后的位置，避免把局部坐标当成绝对坐标。锁定已经固定位置，所以锁定的便签不再提供这项菜单。
    - **锁定**：`data.locked` 比钉住更严。锁定的便签不进入原地编辑（单击、双击、`Enter`、`Space` 都无效），也不渲染缩放手柄，并与其他锁定节点一样禁止拖拽、连线和删除。锁定规则见 §2.6。
  - **主题 (Topic)**：面向思维导图的轻量概念节点，React Flow `type: "topic"`，`data` 为 `{ title, color, topicVersion }` 且内嵌在 manifest，没有 Note 文件、附件或聚焦模式。标题按**纯文本**处理（不解析 Markdown / HTML），建议上限 2,000 个 Unicode 码点，超限时保留草稿并提示，不静默截断。尺寸按标题自动测量，第一版不提供手动 Resize。普通单击进入标题原地编辑；`Tab` 创建子主题，`Enter` 创建同级主题（根主题上改为编辑标题），`F2` 编辑标题，`Esc` 取消。颜色使用 token，树边颜色由父主题派生，不单独设置边颜色。Topic 与 Card / Sticky 共用免费额度计数。
- **卡片通用能力**：
  - **画布预览渲染**：普通文本卡片在画布态（非聚焦态）优先渲染 sidecar 中缓存的 `previewHtml` / `previewExcerpt`；legacy Markdown 卡片通过 **markdown-it** 将正文渲染为安全的 HTML 预览，并经 **DOMPurify** 清理后展示。预览层仅渲染摘要级别内容（标题、段落、列表、代码块等），不挂载完整的编辑器实例，保证首屏性能。Checklist 在画布上保持独立的结构化 items 交互；迁移后读取 extension instance，legacy 数据继续读取 `widgetStore`。
  - **自由调整大小 (Resize)**：所有卡片均支持拖拽边角/边缘来调整宽高，不再固定为 350×450。调整时保持内容自适应重排。锁定的便签不渲染缩放手柄；钉住的便签仍可缩放。
  - **复制/粘贴 / 剪切 / 重复**：支持 `Cmd/Ctrl+C`、`Cmd/Ctrl+V`、`Cmd/Ctrl+X`、`Cmd/Ctrl+D`；复制时保留选中集合内部的连线，粘贴和重复会分配新的 `nodeId` 并保持 parent / extent 约束。**Widget 额外克隆内容文件**并重映射 `widgetId`，避免多个节点共享同一 widget 文件。复制一部分 Topic 树时只保留两端都在选集内的边，外部父边被剪断，粘贴出的副本是独立的树而不会挂回原树；整树复制保留顺序和内部关系。普通 Copy / Duplicate / Delete 只作用于显式选中集合，不暗中扩大到整棵树；整树操作由「选择分支」「删除分支」等专用动作提供。
  - **聚焦入口约定**：单击 Card / Image / Asset / Link / Checklist widget 在右侧边栏打开，已选中节点按 `Enter` 也可打开；Checklist 仍可在画布上直接勾选和添加条目。Pomodoro / Reminder 以画布内交互为主；Recording、Sticky 与 Topic 不进入 FocusedView。Topic 选中后按 `Enter` 在非根主题上创建同级主题、在根主题上编辑标题。
  - **创建流程**：底部 `ViewSwitcher` 右侧 `+` 是主创建入口，常用区提供 Note / Sticky / Topic / Link / Image，More 区提供 **Checklist / Pomodoro / Reminder** / Folder / Group / File / Recording，并提供 Markdown 导入和文库笔记入口；画布右键菜单提供同一套创建能力，并以右键位置作为新节点锚点。Image / File 会先打开系统文件选择器；Link 会打开 URL 表单；Recording 会打开麦克风录音弹窗；新建 Productivity 类型时先创建 extension instance 再放置引用节点，legacy widget 文件只作为兼容数据读取。

### 2.3 沉浸式聚焦模式 (Focused View / Modal Expansion)

- **功能描述**：当用户需要深度阅读、编辑或预览某一张卡片时，提供无干扰的阅读/编辑环境。聚焦模式下，长文本/文档类卡片使用 **BlockNote 块编辑器**进行 Notion 风格的所见即所得编辑；图片卡片进入大图浏览模式；Checklist 进入结构化列表编辑模式（迁移后写 extension instance，legacy 数据写 `widgetStore`）；Asset 根据文件类型进入媒体播放器、图片/PDF/文本预览或文件详情视图；Link 进入链接详情/URL 编辑视图。
- **交互逻辑**：
  - 单击可聚焦节点、框选中的节点按 `Enter`，或右键菜单 `Open Focused`，在**右侧边栏**打开（`CardSidePanel`）。侧边栏盖在画布上、无遮罩，画布照常可平移、拖拽、选中；卡片被挡住时画布自动平移到侧边栏左侧。一次只放一张卡，打开另一张即替换。默认宽 480px，拖左边缘可调到 360～720px（记在本机）。侧边栏从右侧滑入 160ms，只动 `transform` 与 `opacity`，`prefers-reduced-motion` 下无动画。关闭：`Esc`、关闭按钮，或该卡片被删除；点画布空白处不关闭。侧边栏上的按钮可切到**全屏写作**（淡入 120ms，`Esc` 退回侧边栏）；图片在侧边栏显示，另有“看大图”打开全屏灯箱（只淡入，`Esc` 退回侧边栏）。
  - BlockNote 与 note 加载态共用 `NoteEditorLoading` 占位，避免聚焦闪白。
  - **离开与冲突保护**：返回、遮罩、Esc、外部关闭及相邻笔记导航走统一关闭路径。有未解决保存冲突时先由用户决定，不为每次关闭增加通用确认框。迟到的打开或关闭回调不能作用于切换后的画布、已删除节点或重新打开的同 ID 会话；过渡失败后恢复画布可见性与交互。
  - **不可聚焦的节点类型**：Sticky（便签）不支持聚焦模式，未锁定时单击或 `Enter` 进入原地编辑，锁定时不进入编辑；Topic 同样只在画布上原地编辑标题；Recording 当前不进入 FocusedView，在画布卡片上直接播放和管理；Pomodoro / Reminder 以画布内控件为主。

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
  - **进入图层 (Drill-down)**：单击 Folder、框选中的 Folder 按 `Enter`，或通过右键菜单 `Open` 触发**隔离层模式**。
    - 背景画布整体变暗或模糊（失去焦点）。
    - 文件夹内的条目从堆叠状态平滑展开到临时图层。当前实现为 **bottom-up waterfall** 自动排布（非横向 strip / 固定 grid）：最多约五列从 Folder 上方中心向上生长，宽内容自动减列，保留各子项自然尺寸；封面使用动态缩略图槽位摘要。排列顺序按 `children` 数组索引（拖入先后），**不**提供自由拖拽排序，因此不额外持久化 Folder 内部坐标。
      - 在此模式下，画布上的其他非同组元素不可见或不可交互。
  - **退出图层**：点击背景空白处或返回按钮，展开的卡片平滑收缩回堆叠状态，背景画布恢复明亮和可交互状态。
  - **允许收纳的节点类型**：Folder 可以收纳 `Card` / `Image` / `Asset` / `Link` / `Recording`，以及 Canvas Type 明确声明 `canEnterFolder: true` 的扩展。这些类型都被视为“内容条目”，可在 Folder 展开层中被浏览、聚焦、播放或编辑。
  - **不允许新收纳的节点类型**：Folder 不收纳 `Folder` / `Group` / `Sticky` / `Topic`（树边不能跨 Folder 边界，因此整棵树和单个主题都不进 Folder），当前 Checklist / Pomodoro / Reminder 也都声明 `canEnterFolder: false`。历史版本已经保存在 Folder 内的 `widget` 或已迁移 `extension` 条目属于兼容数据：仍须可预览、搜索并通过 `Extract to Canvas` 无损取回，不因当前准入规则而删除、隐藏或转成 Card。
  - **成员来源**：Folder 的成员通过以下方式产生：
    1. **在 Folder 内直接新建**：在 Folder drill-down 视图中通过顶部工具栏或右键菜单的 `New Card` 新建卡片，直接追加到该 Folder 的 `children` 数组。
    2. **从画布拖入**：将允许收纳的内容节点拖到 Folder 上，节点从当前画布移除并写入该 Folder 的 `data.children`。带连线、锁定或类型不支持的收纳请求会整批拒绝，不留下部分收纳或悬空边；成功批次保留内容引用、尺寸并只记一步撤销。需要保留外部关系时，应先连接到 Folder 封面节点。
  - **取回到主画布**：drill-down 视图中选中子卡片后，当前可通过子项右键菜单的 `Extract to Canvas`将该卡片作为新的独立画布节点放回 Folder 邻近区域。**M5 之后 Folder Card 子节点本身已拥有独立 `noteId` 和 note record（sidecar 或 legacy `.md`）**，Extract 动作仅是把 manifest 中的 `children` 引用提升为顶层节点并分配新的 `nodeId`，不再涉及内容文件创建；同一 `noteId` 可在 Extract 前后被其他画布共用。
  - **Extract 可发现性**：当前没有独立顶部 Extract 按钮。顶部入口仅作为条件需求保留（见 §8.2）；如桌面走查证实右键入口难发现，再为现有 waterfall 展开层设计显式入口。
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
  - **Viewport 当前行为**：按画布在会话内缓存 `x/y/zoom`，切换画布可恢复；当前不写 manifest，刷新/重启不恢复。搜索、聚焦等临时相机移动会抑制缓存更新。是否恢复跨重启持久化见 §8.4 R-44。
  - **活跃画布持久化**：用户当前选中的画布 `activeViewId` 持久化到 `workspace.json`，重启应用后自动恢复到上次使用的画布。
  - **新建画布**：通过切换器右侧的 `+` 按钮触发子菜单，提供两种创建方式：① **空白画布**（沿用原有 `handleCreate` 流程，自动命名为 `Canvas N` 并切换过去）；② **选择模板…**（跳转 `/templates` 路由页浏览模板库，选中模板后在只读 ReactFlow 预览页确认后基于模板创建新画布，自动为模板中的每张 Card 生成新 `noteId` 和初始 note record，首次聚焦编辑后迁移为 BlockNote sidecar）。
  - **重命名**：在弹出菜单中点击铅笔图标进入行内编辑模式，`Enter` 确认、`Escape` 取消。名称为空、超过 80 字符或与其他画布重名时阻止提交并显示行内错误。
  - **删除画布**：在弹出菜单中点击删除图标。至少保留一个画布，删除最后一个时操作被拒绝。删除当前画布时自动切换到列表中的第一个画布。
  - **恢复画布**：删除画布后进入 workspace trash，并通过 toast 提供 Undo 恢复；设置页的 Workspace 面板也可恢复 trash 中的画布。
  - **异步复制隔离**：粘贴与重复只在发起操作的画布会话内提交；切走再切回同一画布也会取消旧请求。只有实际插入时才记撤销，失败副本不保留悬空边。取消产生的未修改、无引用副本经宿主核验后归档，原件、被引用或已编辑副本保留。
  - **数据隔离**：每个画布对应独立的 `.ghostboard/views/{viewId}.canvas.json` manifest 文件。Card 以 `noteId` 引用 note record；Widget 以 `widgetId` 引用 `.ghostboard/widgets/` 文件，均不随单个画布整份复制内容文件。
- **限制（当前版本）**：
  - 不支持跨画布拖拽节点。
  - 不支持画布间的 noteId / widgetId 引用关系可视化。

### 2.8 搜索 (Search)

- **功能描述**：全局搜索当前 workspace 中的画布可定位内容，包括各画布视图、顶层 Card/Sticky/Topic/Folder/Group/Image/Asset/Recording/Link、Edge label，以及这些节点引用的 Markdown / BlockNote 正文。Topic 以标题参与搜索，命中后在画布上选中并居中，不进入聚焦模式。
- **交互逻辑**：
  - 通过 `Cmd/Ctrl+K`、应用菜单，或在画布空闲时直接输入任意可打印字符唤起 `SearchDialog` 并预填首字符。
  - 输入关键词后 debounce 调用 Bun 侧 `searchCanvas`；当前画布内存状态会与后端结果合并，降低未落盘编辑被漏搜的概率。
  - 点击搜索结果项，若命中当前画布节点或连线，则选中并平移缩放至对应位置；若命中其他画布，则先安全切换 `activeViewId`，待目标 manifest hydrate 后再定位。定位相机移动不会覆盖用户的会话 viewport 缓存。
  - **排序规则（MVP）**：标题/名称匹配优先于文件名、URL、标签、正文等字段匹配，再按基础相关性评分排序。后续可引入更完整的字段权重与索引。
  - **类型筛选 chips**：搜索框下方提供 `All / Notes / Folders / Links / Images` 切换按钮，仅在前端对 `result.kind` 做客户端过滤，不重发查询。`All` 会显示 Asset / Recording / Topic / Edge / View 等其他结果；`Notes` 同时覆盖 `note` 与 `card` 两种 kind，Topic 不混入 `Notes` chip。
  - **搜索历史**：查询输入为空时显示「Recent searches」分组，列出 `localStorage` 中保存的最近 8 条查询（`ghostboard:v1:search-history` 键，兼容旧键 `ghostboard:search-history`），点击回填到输入框；提供 `Clear` 一键清空与单条删除入口。历史只在用户实际选中结果时落盘，避免误触污染。
  - **Detached notes 的可见性**：用户主动从画布分离的笔记 (`detachNoteFromCanvas`) 会变成 **detached notes**（`data.detached: true`，`position: {x:0,y:0}` 占位），不在画布上渲染，但仍作为 manifest 中的节点进入搜索。画布侧提供游离笔记管理入口，可将 detached notes 拖回画布并赋予真实坐标。
  - **搜索目标契约**：每条搜索结果同时保留可读文本与可序列化的 `target`。普通节点目标携带 `viewId + nodeId + placement`，边目标携带 `edgeId`，Folder 子项目标必须同时携带所属 `folderId` 与子项 `childId`；引用型内容可附带 `content.kind/id`，因此同一 Note 的多画布实例不会被错误合并。后端与当前画布 fallback 使用同一目标形状；Folder child 命中后会先进入所属 Folder，再展开到真实 child，支持的类型进入 FocusedView。
- **可达性与容错**：Group 内节点与边使用世界坐标定位，Folder child 先进入所属 Folder 再打开实际内容；单篇笔记、组件或标签读取失败不阻断其他可读结果。
- **当前边界**：
  - 纯粹存在于 `content/*.md`、`content/.ghostboard/blocknote/*.json` 或 `.ghostboard/widgets/*.json`、但没有任何 manifest 引用的内容不会作为一等搜索结果返回；Note Library 现在提供只读的 **Unlinked Files** 区域。带稳定 `noteId` 的 Markdown / BlockNote sidecar 可从这里显式放回当前画布；无 frontmatter id 的 Markdown 需要走显式 Markdown 导入，Widget / Extension 记录保持原类型浏览，不被强制伪装成 Card，也不在此入口删除。
  - 搜索提供结果列表与定位，输入时实时高亮整张画布仅作为条件需求（§8.2）。
  - 搜索面板不直接承载 unlinked 内容的放回操作；正式放回入口是 Note Library 的 Unlinked Files 区域，用户主动 detached 的已有路径仍是 `DetachedNotesSidebar`。

### 2.9 撤销/重做 (Undo / Redo)

- **功能描述**：对画布上的结构性与离散操作（移动、创建、删除、Resize、拖入文件夹、节点级提交等）提供撤销和重做能力。正文长文编辑不进入画布撤销栈，而是由 BlockNote（底层 ProseMirror）自身历史栈处理；迁移后的 Productivity 内容编辑由 extension instance 的 **per-instance history** 处理，legacy widget 仍由 `widgetStore` 的 **per-widget undo 栈**处理，二者都不写入画布快照；标题输入框使用浏览器原生 input undo。
- **交互逻辑**：
  - 非编辑态下，`Cmd+Z` 撤销，`Cmd+Shift+Z` 重做。若编辑焦点在某个 extension / legacy widget 内，快捷键优先路由到对应实例的 undo/redo；若焦点位于 `input` / `textarea` / `contenteditable` 中，则交给当前编辑控件；否则由统一操作时间线路由。
  - **统一操作顺序**：画布、Extension / Widget 实例编辑由统一时间线排序；非编辑态撤销最近一次操作，各来源仍保存自己的快照记录。新操作同步清除旧重做分支，撤销后重新校验聚焦目标、Folder 与 Topic 暂停状态。
  - **正文隔离**：画布快照保存结构，不保存笔记正文、内容元数据或 revision；恢复结构时采用最新内容。正文编辑不产生空画布撤销步，画布撤销也不回滚已保存正文。
  - **Topic 树事务**：提交主题草稿、编辑标题、拆出分支、删除分支、删除单个主题以及随之发生的重排都各自是一次事务，`nodes` 与 `edges` 在同一次提交中一起更新，因此只产生一步撤销，不会出现「撤销一次只回滚节点或只回滚边」的中间态。未提交的主题草稿只在内存中，不入图也不入历史。主题标题是纯文本 input，不走 BlockNote / widget 历史栈。
  - **栈深度上限**：画布与每个内容实例各自最多保留 **50** 步，统一时间线最多 **100** 条；超出后丢弃最早记录。
  - **撤销与持久化的一致性策略**：撤销/重做恢复业务内容，并进入正常 debounce 保存流程。Extension 历史只保留 state/presentation，不回滚持久化 revision；保存使用最新确认版本，旧保存回包不能覆盖请求期间的新编辑。保存失败保留本地内容并提示，不能视为已落盘。画布与 legacy widget 继续使用各自保存路径。
  - **生命周期**：撤销栈仅存在于内存中，关闭应用、切换 workspace 或画布后清空，不做持久化。

### 2.10 键盘快捷键体系 (Keyboard Shortcuts)

| macOS                   | Windows / Linux           | 行为                                                                            |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `Cmd+Z` / `Cmd+Shift+Z` | `Ctrl+Z` / `Ctrl+Shift+Z` | 焦点在 widget 内 → widget undo；焦点在 input/contenteditable → 编辑控件（BlockNote / 浏览器）；否则统一操作时间线 |
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
| `idle`              | 默认状态；点击空白处；完成操作后回落                                                   | 选中节点、开始拖拽、打开菜单、按下快捷键 | 允许平移、缩放、框选；单击不选中；单击可聚焦节点进入 `focused`（侧边栏），单击 Folder 进入 `folder-drill-down`，单击未锁定的 Sticky 进入 `inline-editing`，Topic 单击编辑；选中只靠框选。锁定的 Sticky 不进入编辑                                                                            |
| `selected`          | 框选、`Shift/Cmd/Ctrl+Click`、方向键导航、右键单选或多选集合右键                         | 点击空白、`Escape`、进入其他状态         | 允许批量拖拽、删除、复制/剪切/粘贴、重复、分组、锁定/解锁、移动到其他画布。**Checklist widget 例外**：在 `selected` 状态下允许直接勾选 checkbox 和在列表末尾添加条目（局部交互，写 widgetStore） |
| `marquee-selecting` | 在空白处左键拖拽                                                                       | 鼠标释放                                 | 桌面端启用；与空格平移模式、输入编辑态互斥                                                                                                                                                           |
| `dragging`          | 拖拽一个或多个已选节点                                                                 | 鼠标释放或取消                           | 暂停单击判定，避免误触发编辑                                                                                                                                                                         |
| `inline-editing`    | 单击未锁定的 Sticky、单击 Topic、选中未锁定 Sticky 后按 `Enter`（焦点在便签上时 `Enter` / `Space` 同样进入）、选中 Topic 后按 `F2`（或在根主题上按 `Enter`）、Topic 草稿创建、Group label 编辑、资源/录音标题重命名 | `Escape`、提交、失焦或点击其他区域       | 编辑期间禁用画布级快捷键；Sticky 使用纯文本 textarea，Topic 使用纯文本标题 input（`Enter` 提交并建同级、`Tab` 提交并建子级），媒体标题使用行内 input。锁定的 Sticky 不能进入此状态。Card/Image/Asset/Link 的深度编辑进入 `focused`                                                                         |
| `focused`           | 单击 Card/Image/Asset/Link；框选中后按 `Enter`；右键菜单 `Open Focused`               | 关闭按钮、`Escape`、删除该卡片             | 侧边栏模式下画布照常可交互；全屏写作与看大图时冻结背景画布；Sticky / Recording / Topic 不可进入此状态                                                                                                                                                  |
| `folder-drill-down` | 单击 Folder；框选中 Folder 后按 `Enter`；右键菜单 `Open`                             | 返回按钮、背景空白、`Escape`             | 仅当前 Folder 内容可交互；背景画布冻结                                                                                                                                                               |
| `connecting`        | 从 Handle 开始拖出连线                                                                 | 连接成功、取消                           | 禁止进入编辑与聚焦                                                                                                                                                                                   |
| `recording-capturing` | 创建 Recording 时打开麦克风弹窗                                                       | 停止保存、取消、权限失败后关闭           | 背景画布暂不交互；录音保存为附件后创建 `recording` 节点                                                                                                                                                |

**状态优先级规则**：`dragging` 与 `connecting` 高于单击/编辑判定；`folder-drill-down` 以及 `focused` 的全屏写作 / 看大图为模态上下文，会冻结背景画布（侧边栏模式不冻结）；`inline-editing` 期间不响应框选与节点拖拽。

### 2.12 笔记库弹窗 (Library Popup) ✅

- **入口**：画布左上角 `CanvasToolbar` 中的 Library 图标，点击后弹出覆盖式弹窗。`CanvasToolbar` 同时集中承载标签筛选入口和设置入口，取代分散的左上角按钮。
- **职责**：浏览当前画布上的所有可聚焦 `Card` / `Image` / `Asset` / `Link` 及声明 `openBehavior: detail` 的 Extension（按 Folder 分组 + 未分组 + 游离笔记），点击卡片即关闭弹窗 → `fitView` 飞到目标节点 → 自动打开 FocusedView。
- **能力**：支持搜索筛选、排序切换（最近编辑/名称/创建时间）、`Escape` / 点击遮罩关闭。
- **角色边界**：与既有入口互补：
  - `Cmd/Ctrl+K` `SearchDialog`：关键词驱动，「我知道我要什么」，跨画布跳转。
  - 笔记库弹窗：浏览驱动，「我想看看我有什么」，仅限当前画布。
  - `DetachedNotesSidebar`：游离笔记的快捷管理与拖回画布（可从底部创建菜单的「文库笔记」入口打开）。

#### Detached notes（游离笔记池）

- **概念**：detached notes 是**保留 note record 与 `noteId`、但暂不在画布上展示**的笔记。它们存在于笔记库中永远可被找回。
- **数据形态**：`position: {x:0, y:0}` 占位，`data.detached: true` 标记；不在画布上渲染。
- **创建路径**：画布上右键菜单 > 「移出到笔记库」 → `detachNoteFromCanvas()` 保留 note record 和 `noteId`，但清理画布实例坐标和 edges。
- **放回画布**：笔记库弹窗的「游离笔记」分组中，点击 detached 卡片会弹出 toast 提示 +「放到画布」按钮，点击后 `pinNoteToCanvas()` 将笔记放到视口中心并打开 FocusedView。画布侧 `CreateMenu` 也提供「文库笔记 / Library Note」入口打开 `DetachedNotesSidebar` 进行拖拽放回。
- **搜索可见性**：detached notes 进入全局搜索；笔记库弹窗与 `DetachedNotesSidebar` 在「游离笔记」分组单独列出可聚焦/可分离的 `card` / `image` / `asset` / `link` 及声明相应能力的 Extension。Sticky、Recording、Topic、不可聚焦 Widget 不伪装成可打开的笔记条目；Topic 没有 Note 文件，也不参与「移出到笔记库」和游离笔记流程。

### 2.13 标签管理 (Tag Management) ✅

- **功能描述**：为卡片、图片、附件、链接等节点提供标签标注能力，通过标签对画布内容进行分类和快速筛选。
- **标签模型**：
  - **只有一种标签**（slim/v1 起）：每个节点一个有序标签列表 `tags[]`，每个标签可单独设颜色（`tagColors`），不设颜色时显示为灰色。不再区分主标签与次要标签。
  - 旧数据里的主标签 `tag` / `tagColor` 在读入时并入 `tags[]` 的第一位和 `tagColors`，之后不再写回；模板、frontmatter 和旧版 sidecar 里的这两个字段仍可读。
  - 标签数据存储在 `.ghostboard/node-metadata.json` 中，以 `noteId`（Card）或 `nodeId`（非 Card 节点）为键。Card 节点的标签通过 `noteId` 跨画布共享；Image/Asset/Link/Sticky 节点的标签与画布实例绑定。
  - **约束**：每节点最多 8 个标签，单个标签最长 32 字符。
- **标签编辑**：
  - **右键菜单入口**：在 Card/Image/Asset/Link/Sticky 节点上右键 → `Edit Tags`，弹出 `TagEditor` 弹窗。
  - **TagEditor**：基于 `@base-ui/react` Popover 实现，提供标签输入框、颜色选择器、自动补全（基于 workspace 已有标签列表）、添加/删除/修改标签。
  - **CardNode 画布态**：卡片标题下方渲染 `NodeTagChips`，按列表顺序展示标签，有颜色的显示颜色，没有的显示灰色。
  - **Image/Asset/Link/Sticky/Recording 节点**：标题区域或卡片底部同样展示 `NodeTagChips`。
  - 标签修改通过 `useSetNodeMetadata` mutation 乐观更新 React Query 缓存，失败时回滚。清空标签会显式持久化删除；旧 frontmatter 标签只迁移一次，不因再次加载或重启复活。退出等待标签落盘，失败保留修改并取消退出以便重试。
- **标签侧边栏 (TagSidebar)**：
  - **入口**：画布左上角 `CanvasToolbar` 中的 Tag 图标，点击后滑出 `TagSidebar` 面板；有活跃筛选时图标显示小圆点。
  - **内容**：列出 workspace 中所有标签，按使用次数降序排列，每个标签显示节点计数。
  - **筛选**：点击标签设置 `activeTagFilter`，画布上不携带该标签的卡片自动变暗（dimmed），仅突出匹配的卡片。点击已选标签或「Clear filter」按钮清除筛选。
  - **重命名**：点击铅笔图标进入行内编辑模式，调用 `rpcRenameTag` 重命名 workspace 中所有使用该标签的节点元数据。
  - **删除**：点击删除图标，弹出 `DeleteTagConfirmDialog` 二次确认，调用 `rpcDeleteTag` 从所有节点元数据中移除该标签。
  - 标签变更后自动刷新 `['tags']` 查询缓存，侧边栏计数即时更新。
- **适用节点类型**：`card`、`image`、`asset`、`link`、`sticky`、`recording` 及已声明标签能力的 Checklist / Extension。`folder`、`group` 和 `topic` 暂不支持标签。

---

### 2.14 插件系统（已删除）

2026-11-05 起不再提供插件。运行时、SDK、脚手架、签名与更新、授权、探针与文档站一并删除，原因见 [PRD-slim](./PRD-slim.md) §2：目标用户是写稿的人，不会装插件；插件面带来启动开销和无法补齐的同 realm 安全缺口。内置的清单、番茄钟、提醒、录音等扩展卡是另一套机制，不受影响。旧版本留在应用数据目录的插件文件不再读取。

### 2.15 首次启动引导 (Onboarding) ✅

- **功能描述**：首次启动应用时，除 seed `quick-start` 模板画布外，还通过 4 步引导浮层（`OnboardingDialog`）介绍核心操作：① 拖拽平移画布；② 点击卡片打开、框选/修饰键选择；③ 右键或 `+` 创建新内容；④ `Cmd+K` 搜索。引导文案与日常提示统一来自 `lib/learningContent.ts`。
- **交互逻辑**：由 `learningStore` 的 `ONBOARDING_VERSION` 控制首次启动自动弹出；完成后记录版本，`CanvasHelp` 提供再次查看入口，引导内容版本升级时可重新展示。

### 2.16 AI 辅助

- 选区 AI 工具栏与摘要面板提供资料摘要和画布动作；设置中管理服务提供方与凭据。桌面支持 Anthropic、OpenAI、OpenAI-compatible 自定义服务及 Ollama；没有 Gemini 直连，可经兼容服务接入。
- 上下文使用选中资料的可读文本，Extension 通过宿主 presentation 提供标题与摘要；不承诺读取图片像素、附件全文或录音转写。有效 Topic 提供纯文本标题及树关系。
- 修改动作按节点类型限定字段，禁止改写内容 ID、revision、children、locked 或 BlockNote 正文镜像；遵守节点 / 祖先锁定、便签固定位置和 Topic 暂停状态。配额与画布会话在异步等待后重检，有效批次一次提交、一次撤销，无变化不记历史。
- 桌面 AI 与网站 API 的 OpenAI 配置独立；网站 AI 凭据本轮暂缓，不影响用户自行配置桌面服务。

### 2.17 许可证与配额

- 许可证支持硬件绑定、本地加密存储，以及后端签发、激活、验证与撤销。
- 未激活用户共用 100 张 `card` / `sticky` / `topic` 额度，激活后无限制。新建、Topic 提交、复制粘贴、JSON / Markdown 导入、AI 批量动作使用统一配额；不能投放的已导入笔记保留在文库。
- 支付和订阅不是本节已有许可证能力的验收结论，后续商业化按 §8.2 单独立项。

### 2.18 官网与 Web 服务

- 官方站点为 [ghostboard.21blog.com](https://ghostboard.21blog.com/)，源代码位于 companion checkout `react-starter-kit`。官网 / 双语文档、登录后的 App、API 分别由 Cloudflare Worker 承载，通过同域路由连接，数据库使用既有 Neon。
- 未登录访问受保护 App 页面会转到登录页。Google OAuth 与邮件入口按服务配置隐藏，显示当前暂不可用的说明；保留既有 passkey / 会话能力，不绕过登录守卫。
- Google OAuth、Resend 邮件及网站 OpenAI 配置由用户暂缓；本轮未新增支付配置，也未以真实生产账号注册或登录作为已通过证据。版本回执与部署步骤见 [部署报告](/Users/laogui/Projects/react-starter-kit/docs/deployments/2026-11-03-ghostboard-cloudflare.md)。

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

> **适用范围**：本章保留 Note、legacy Widget 与媒体迁移前的数据说明。已迁移内置类型采用 extension 实例引用（见 §2.0）；当前不能据此承诺所有小组件仍写 widget sidecar，或所有媒体元数据仍内嵌在 manifest。具体实例存储与迁移规则见 [技术规范](./tech-spec.md)，旧格式只用于兼容，不作为新内容的存储要求。

### 5.1 核心原则

1. **本地文件即数据源（Local Files as Source of Truth）**—— 每张 **Card 类型**卡片对应一个以 `noteId` 标识的 note record。当前优先使用 BlockNote JSON sidecar（`content/.ghostboard/blocknote/<noteId>.json`）作为内容级 canonical source；legacy/imported `.md` 文件仍会被发现、读取、导出和迁移，但新编辑保存不再维护同步 Markdown 副本。迁移后的 Canvas Type 内容以 `instanceId` 标识，canonical source 为 `.ghostboard/extension-instances/<instanceId>.json`；legacy **Widget** 内容仍以 `widgetId` 标识并从 `.ghostboard/widgets/<widgetId>.json` 兼容读取。画布布局用独立的 manifest 文件管理。Folder 子节点与对应顶层内容共享同一内容引用，准入与兼容规则见 §2.5.2。Sticky 内容内嵌在 manifest `data.content`；Image / Asset / Recording 走 `attachments/`；Link 走 URL + unfurl 元数据。

   > **早期版本历史**：MVP 初版 Folder children 是以 `{ id, data: {...content inline} }` 内嵌在 manifest 中的「legacy」形式。它们会在 `loadCanvas` 加载时被自动迁移：分配 `noteId`，下次 `saveManifest` 会迁到独立 note record。Checklist 曾以 Card + `data.type: "checklist"` 存在；现有加载链路已实现 card → widget → extension 迁移，失败保留原卡片（见 §2.2）。
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

#### 多 Workspace 边界

当前启动读取 app-level `userprefs.json` 的 workspace 指针；未配置时使用应用数据目录下的默认 workspace。设置中选择目录会初始化目标目录并保存指针，实际切换在重启边界生效。

Recent list、欢迎页与运行中热切换尚未纳入当前实现；配置归属及开发顺序待 §8.4 决策后再设计。

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
- **附件命名**：附件文件名使用 `{kind}_{uuid}.{ext}` 格式（`img_` / `video_` / `audio_` / `file_`），采用完整 UUID 并拒绝新建覆盖碰撞文件。路径统一为 workspace-relative POSIX 路径。Image / Asset / Recording 节点保存原始附件引用；视频/图片可额外保存 `thumbnailFile`，音频/录音可额外保存 `waveform` / `duration`，文本与压缩包可保存 `previewExcerpt` / `archiveSummary`。

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

> **Checklist 不再使用 Card `displayHint`**：新待办列表是 **Widget**（`type: "widget"`, `kind: "checklist"`），内容在 `.ghostboard/widgets/`。导出 Markdown 时 checklist widget 会序列化为 GFM 任务列表。带稳定 noteId 的 legacy `displayHint: 'checklist'` Card 已在 `loadCanvas` 迁移为 widget，并继续迁到 extension；失败时保留旧数据。枚举仍能 round-trip 是兼容支持，不是缺少迁移（见 §2.2）。

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
- **Viewport 当前行为**：manifest 类型仍兼容旧 `viewport` 字段，但 `saveManifest` 主动省略它；用户视角仅保存在会话缓存。JSON 导出可以携带当前 viewport，这不等于工作区持久化。跨重启行为待 §8.4 R-44 决策。

### 5.7 TypeScript 类型定义

> 完整的 TypeScript 类型定义（`NoteFrontmatter`、各节点 Data 接口、`CanvasViewManifest`、`WorkspaceConfig`、`AppConfig` 等）已迁移至 [技术规范文档 §3.2](./tech-spec.md#32-typescript-类型定义)。

### 5.8 读写流程与状态管理

- 保存整批预检 revision 与同一笔记的多处投影。冲突时可独立保存布局，正文草稿保持 dirty；选择“使用磁盘笔记”只替换冲突笔记并归档本地副本。旧内容与未知 frontmatter 保留，未变内容不重复写入。
- 笔记、组件、附件、迁移、配置与清理通过 workspace 写入协调。跨文件保存采用可恢复事务：写前保留原值，失败回滚，中断后在后续读写前恢复，通知仅在提交后发出。
- BlockNote 输入捕获 JSON blocks 并去抖保存，不逐键转换整篇 Markdown 或更新画布正文镜像。退出与导出先等待最新正文，再保存画布；失败保留本地状态，旧会话回执不能修改另一画布。
- 读取缓存遵守保存屏障与失效规则，工作区切换不会采用旧工作区结果；损坏 metadata、凭据或事务不能被空默认值覆盖。
- 写入失败明确提示并可重试。RPC 使用有限等待；超时说明宿主操作仍可能完成，不自动重放写入。缩略图进程超时终止并清理临时输出，原媒体保留。
- 事务保证仅覆盖当前应用协调范围，不提供跨进程锁或文件系统多文件同时可见性；发现外部字节冲突时停止自动恢复，转到 §5.11 的诊断流程。

> 读写流程、debounce 策略、原子写入、RPC 协议等技术实现细节请参阅 [技术规范文档 §7](./tech-spec.md#7-数据持久化)。
> 状态管理分层（Zustand + React Query）、canvasStore 结构、undo/redo 机制请参阅 [技术规范文档 §4](./tech-spec.md#4-状态管理)。

### 5.9 导入/导出 (Import / Export)

- **导出**：
  - **Markdown**：单篇笔记从卡片右键导出；底部切换器导出菜单提供全部画布、当前画布和选中笔记，画布右键也可导出当前画布。
    - 导出内容包含 frontmatter + 正文 + 附件收集 + `index.md`；**checklist widget** 会生成 GFM 任务列表，避免静默丢清单。
    - 选中 Group / Folder 时包含后代笔记，按 noteId 去重；空选区提示且不请求导出，取消文件选择保持安静。
    - 每次导出使用独立目录，等待附件复制；缺失或越界附件明确计为失败，部分失败显示数量、输出路径与 index 明细，全部失败不报成功。
  - **JSON**：导出当前画布的 self-contained JSON（当前导出 schema 为 `ghostboard-canvas-export/v2`，保留 v1 导入兼容），读取笔记最新 canonical 正文，结合内存中的可见 nodes / edges / viewport 生成，并清理运行时 URL、hidden / detached 节点和不可持久化字段。已支持拖入 JSON 合并到当前画布；导出传入 widget / extension records，导入重建独立记录。这不是完整 workspace 替换恢复。
  - **Workspace ZIP**：设置 → Workspace →「Export workspace as ZIP…」导出整个 workspace 的可恢复候选备份，包含 views、content/sidecar、extension instances、legacy widgets 与 attachments；已在独立临时 workspace 中通过压缩完整性和成员清单检查，恢复导入流程仍需后续任务单独验证。
  - **主题大纲 Markdown**：画布右键 →「导出主题大纲为 Markdown…」把当前画布的主题森林导出为嵌套无序列表。根主题按 id 排序、子主题按树边 `order` 排序；标题按纯文本转义，换行折叠为空格，因此不会把用户输入当作 Markdown 语法执行。画布上没有主题时入口置灰，导出空大纲会被拒绝。存在非法树关系或不支持的主题/关系版本时**整次导出被拒绝并说明原因**，不静默省略——原始数据仍可走无损备份/导出路径。该导出只覆盖主题标题与层级，不包含 Note 正文或附件。
  - **PNG**：导出当前画布的 2x screenshot-style PNG。导出时先临时 `fitView` 全部可见节点、等待浏览器 repaint、隐藏 minimap/controls/panel/attribution，再截图 `.react-flow` 容器，最后恢复导出前 viewport。当前没有 SVG 导出。
- **导出前保存**：单篇和批量导出均等待编辑草稿及画布保存；JSON / PNG 等异步流程也绑定发起时的画布会话，切换或离开再返回后取消旧导出，避免混用内容与画布名称。
- **导入**：
  - 支持通过底部创建菜单或画布右键显式选择多个 Markdown 文件，解析 frontmatter / 标题 / 正文后创建新的 Note 卡片。
  - 支持拖拽/粘贴图片、文件、URL 到画布，分别创建 Image / Asset / Link 节点；文件选择 / 拖入使用本地 HTTP 流式上传，data URL 仅作为 fallback。
  - 已支持把导出的 JSON 拖入当前画布并合并；不等同于整体 workspace 替换恢复。
  - ⚠️ 显式「从 Markdown 重新导入到当前笔记」（解析外部 .md → blocks → 写 sidecar，覆盖当前内容）尚未实现（需求候选，见 §8.2）。

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
| 持久化策略         | manifest/layout 约 2500ms debounce，viewport 仅会话缓存，widget 内容独立 debounce，视图切换/失焦/隐藏时立即 flush；BlockNote 走 `useBlockNoteSaver` + `rpcSaveBlockNote` 独立 debounce（legacy Markdown 走 `useNoteSaver` + `rpcSaveNote`），均支持 blur / hidden / unmount flush | 平衡输入流畅度与磁盘写入频率 |
| 写入协调           | 独立 debounce + workspace 队列 + 原子发布 + 可恢复跨文件事务                                           | 降低内容/布局竞态与文件损坏风险                                            |
| Checklist 导出     | Markdown 导出生成 GFM `- [x]` 任务列表                                          | 与 Obsidian/Typora 等生态兼容                                              |
| 图片/附件          | `attachments/` + `{kind}_{uuid}.{ext}` 文件名，媒体流通过本地 token-auth HTTP 服务读取，视频/音频支持 byte range | 避免同名冲突，支持大文件导入和播放器 seek                                 |
| manifest 格式      | 与 @xyflow/react 原生 Node/Edge JSON 一致                                       | 加载时零转换，直接传入组件                                                 |
| z-order            | 数组顺序（后覆盖前）                                                            | 简单直观，React Flow 原生行为                                              |
| 路径格式           | workspace-relative POSIX path                                                   | 跨平台一致性                                                               |
| 颜色来源           | manifest `color` 覆盖 sidecar / legacy frontmatter `color`                      | 保留内容语义色与视图强调色的分层                                           |
| Viewport 会话缓存 | 切换画布可恢复，重启不恢复；manifest 保存主动省略 viewport | 跨重启持久化目标待 §8.4 决策 |
| 活跃画布持久化     | `activeViewId` 实时写入 `workspace.json`                                          | 重启后恢复到上次使用的画布                                               |
| 画布 chrome        | `canvasShowMinimap` + `CanvasViewportChrome`；背景 `default/paper/cream/mono`   | 视口导航可配置，主题色板含 cream                                         |
| 设置归属           | Workspace settings 存 `.ghostboard/settings.json`；当前 workspace 指针存 app-level `userprefs.json`；AI key 存 app-level credentials | workspace 可移植，同时避免把绝对路径和密钥写进可共享目录 |

### 5.11 数据恢复与异常处理

- **备份恢复**：设置 → 工作区可查看磁盘 / 本地恢复来源、版本提示、预览、比较、导出和确认删除，也可恢复为独立画布。恢复副本使用当前共享正文，不回写共享笔记 / 组件内容；不承诺历史正文自动合并。
- **损坏文件确认**：读取损坏 manifest 时保留原件；采用 `.bak` 前需明确同意，授权绑定当前损坏文件和展示备份的字节，文件变化必须重新审阅。取消不覆盖原件，过期确认拒绝。可直接导出原始证据后切回正常画布。
- **事务诊断**：设置与画布加载失败页均可查看冲突文件、导出证据、重试，或二次确认“保留当前文件并归档事务”；不会自动覆盖外部修改。
- **部分坏数据**：隔离非法 / 重复节点、边和 Folder 子项并保存原始字节。坏回收站条目可导出或确认归档；严格清理扫描遇到不完整引用仍停止删除，不以隔离结果冒充完整引用集。
- **附件与副本**：附件用完整 UUID、独占临时文件和同步后的原子发布，新建不覆盖重名文件，失败清理 staging。取消复制时只归档宿主确认属于本次、未修改且无引用的副本；不默认后台删除无引用笔记或组件。

> 完整的 edge case 处理策略表格（文件断链、watcher 循环、frontmatter 解析失败、sidecar 损坏、manifest 损坏等）已迁移至 [技术规范文档 §9](./tech-spec.md#9-edge-cases--guardrails)。

> 桌面运行时选型对比（Electrobun / Tauri / Electron）已迁移至 [技术规范文档 §1.3](./tech-spec.md#13-桌面运行时选型)。

## 6. 隐私与安全 (Privacy & Security)

- **本地优先**：核心笔记、附件与画布布局在本地保存，默认不把整个 workspace 上传到远程服务。“本地优先”不等于所有功能都不联网。
- **桌面无需账号**：本地资料整理不要求注册或登录；官网 Web App 的受保护页面另有登录守卫（§2.18）。
- **外部访问边界**：链接预览、打开外链、远程 AI 和已启用的更新检查可能联网；需区分本地资料操作与用户触发或用户已启用的外部访问，不使用“任何数据绝不出设备”的笼统承诺。
- **AI 功能的隐私边界**：已有 AI 接入不代表全库读取。产品要求明确告知用户发送范围、服务提供方及失败状态，并保留关闭能力。extension 选区上下文当前取宿主 presentation 文本，不直接序列化任意实例 state；其他上下文补全路径仍需逐项验收。
- **本地 HTTP 边界**：本地 HTTP 服务只绑定 127.0.0.1，CORS 只回显应用自身来源（`views://mainview`、开发态 `http://localhost:5173` / `127.0.0.1:5173`，以及 WebKit 自定义 scheme 可能上报的 `null`），所有路由要求启动期 token。

### 6.1 明确排除项 (Out of Scope for MVP)

- **实时协作**：MVP 不提供多人协作、CRDT、远程同步或 presence。冲突处理默认以单设备本地文件系统为边界；不承诺持续 watcher 或外部编辑器实时双向同步（见 §5.10），超出此范围不承诺一致性。
- **Folder 子画布 / 万能容器**：MVP 不把 Folder 设计为可自由摆放节点的嵌套画布，也不允许它收纳所有节点类型。完整空间结构继续由 Group / Canvas View 承担；若未来需要 Sub-canvas，应作为独立模型设计。

### 6.2 无障碍基线 (Accessibility Baseline)

- **键盘可达性**：Tab 在当前上下文的可聚焦控件间移动；方向键可在选中节点之间导航；`Enter` 打开聚焦；`Escape` 返回上一级。例外：画布上恰好选中一个 Topic 且不在编辑态时，`Tab` 改为创建子主题；焦点进入输入控件、搜索、菜单或模态后，`Tab` 恢复常规焦点移动语义。
- **语义标注**：卡片、Folder、连接点、上下文菜单需预留 ARIA label / role，保证后续可接入屏幕阅读器。
- **视觉对比**：颜色不是唯一状态来源；选中、锁定、错误态需同时提供描边、图标或文字反馈，高对比主题作为预留能力。
- **主题可读性**：Group、Checklist 与媒体 / Link 等内置类型的画布、预览和详情按实际底色设置文字明暗，兼顾深色应用中的白卡和浅色应用中的深卡；提示位置避开底部画布控件。

---

## 7. 后续迭代原则

当前功能和行为边界以 §1–§6 为准；已完成的开发批次、历史 P0–P3 清单与原始问题映射不再作为 PRD 排期保留。原生 / 公网证据见 [结项记录](./8.5-closeout.md)，工程过程见 `.planning/2026-11-01-prd-backlog-reconciliation/`。

后续工作先区分安全核验、产品决策、用户暂缓和条件需求（§8）。新增开发应由实际项目流程的阻断、用户任务或性能测量触发；记录复现样例、最小改动与验收方式，不因代码重构或功能清单缺项自动立项。有序文章、剪藏或行业系统需单独定义，不能从画布坐标推导写作顺序。

## 8. 待核验、候选与未决事项

本章只保留尚未完成或尚未确定的事项。旧编号仅用于关联既有调查记录；已关闭问题不重复列入。

### 8.1 安全核验

| 事项 | 当前边界 | 下一步 |
| --- | --- | --- |
| R-26 DNS rebinding | `net/publicTarget.ts` 的 DNS 校验到实际连接存在窗口，尚不能宣称已完全防住重绑定 | 验证能否绑定已检查 IP 并保留 TLS / SNI；不要用裸 IP 替换 URL 破坏证书校验，确认可行方案后再加固 |
| R-27 CORS `null` | WebKit 自定义 scheme 可能使用 opaque origin，非资源路由仍校验 token；仅凭 `null` 不能推导任意网页可读数据 | 在发行包核验实际 Origin 与 token 边界；确认不需要后才移除 `null`，避免破坏桌面运行 |

### 8.2 条件需求与远期机会

以下不属于已承诺的待做功能。只有出现对应任务或测量证据，才重新排序与立项。

| 候选 | 启动条件与边界 |
| --- | --- |
| Markdown 覆盖当前笔记（TODO-24） | 有真实“外部编辑后回写同一笔记”流程，再定义差异预览、确认、撤销、revision 和高级块损失保护；现有导入创建新笔记 |
| PDF 阅读增强（TODO-5） | 基础预览阻断真实阅读任务时，先考虑页码导航 / 缩略图；批注涉及独立内容模型 |
| Folder 面包屑、字数统计、查找替换（TODO-12 / TODO-16b / TODO-17） | 归属辨认或长文编辑确有困难后排序；查找优先，替换另需事务和撤销 |
| 预览内媒体播放（TODO-26） | 轻量摘要不能帮助判断内容时，先评估封面和文件名，不默认在每张卡片嵌播放器 |
| 更显式的 Extract 入口（R-45） | 现有 waterfall 子项右键难以发现时，为当前展开层增加入口 |
| 搜索实时画布高亮（R-47） | 已有结果列表与定位无法完成实际查找任务时重开 |
| 大工作区索引 / 传输优化（R-35 / R-37） | 先测搜索、保存时延、读盘量和传输体积，再选缓存、增量失效或传输方案；不预设 SQLite FTS5 或全面重构 |
| 自动回收无引用资料（R-10） | 确有空间压力后定义预览、宽限期与回收站；无引用不等于可删除 |
| 诊断日志性能（R-43） | 测出同步写入阻塞再优化，保留 fatal path 的崩溃留痕能力 |
| 按画布生成有序文章（OD-7） | 手写结论 Note 与 Topic 大纲不足以完成成果输出时，先定义明确顺序和格式 |
| 垂直行业、移动端、网页剪藏、视频转码、全局快速输入、Backlinks、支付订阅 | 用户任务或商业目标明确后单独立项；不重建已有 AI、许可证入口 |

死代码、复杂分支、slice I/O 与大菜单拆分归日常工程维护，随具体修改处理，不单列产品欠债。

### 8.3 用户明确暂缓

| 事项 | 恢复工作时需要补齐 |
| --- | --- |
| 网站 Google OAuth、Resend、OpenAI | 配置真实服务凭据后启用对应入口，补登录 / 邮件 / AI 端到端验证；继续使用现有 Neon |

### 8.4 需要决策的范围

| 决策 | 当前状态与建议 | 决策后影响 |
| --- | --- | --- |
| 多 workspace（OD-3 / OD-4 / TODO-7） | 当前只选择下次启动目录。建议先验证高频隔离需求，再做 recent list / 打开创建，最后做热切换；theme / locale 建议 app-level、项目设置 workspace-level，AI 密钥继续 app-level | 决定配置归属与 override 后再设计迁移、欢迎页和运行中状态隔离 |
| 崩溃报告默认上传（R-28） | 当前 `DiagnosticsService.autoUpload = true`。建议默认关闭并显式征得同意；若保留默认上传，须清楚展示范围和关闭入口 | 影响隐私承诺，配置尚未改变 |
| 跨重启 viewport（R-44） | 当前仅会话缓存，manifest 不保存 viewport。建议恢复最后手动视角，临时搜索 / focus 不覆盖；也可正式接受重启 fitView | 决定持久化与临时相机移动的关系 |
