# Topic（主题）与轻量思维导图实施方案

日期：2026-09-13。状态：**方案已编写；实施待开始，功能未实现**。

本方案依据桌面仓库 `fa2feb7` 和官网 `react-starter-kit` 的 `12fe8bc` 核查。开始实施时重新核对两边 HEAD 和未提交改动。本文是新增需求的实施依据，不回写已有 T0–T5 的完成证据，也不把进行中的工作写成已发布功能。

## 1. 要解决的问题与首版交付

用户已经可以用 Note、Sticky 和连线画出导图，但连续记录想法时，要反复创建、改尺寸、移动、连线。Topic 的价值是让一个概念能直接长出子主题与同级主题，并自动得到可读的布局。

名称：用户界面英文 **Topic**、中文 **主题**；运行时核心类型 `topic`。不新增泛用 `text` 类型，不改变现有 Sticky 的含义。

| 类型 | 内容角色 | 默认操作 |
| --- | --- | --- |
| Note | 展开的论述与结论 | 聚焦阅读、长文编辑 |
| Sticky | 一段临时想法、提醒或批注 | 原地编辑、自由调整大小、自由摆放 |
| Topic | 概念、问题、提纲项 | 紧凑自适应、创建子主题/同级主题、树结构与基础排布 |

**首版必须作为完整能力交付**：主题节点、连续键盘创建、向右树布局、分支移动、可靠保存与撤销、搜索定位、导出、扩展回归和双仓文档同步。只完成紧凑外观不算 Topic 验收通过。

首版不包括：折叠、多种放射布局、拖到任意主题换父级、自动把任意现有连线转成树、Topic 与 Note 无损互转、AI 自动生成导图、导入 XMind/OPML、公开的树编辑 SDK。后续可以另立任务，但不预留一套无人使用的通用图引擎。

## 2. 当前扩展系统事实与架构决策

### 2.1 已核查的现状

| 层次 | 当前事实 | 对 Topic 的影响 |
| --- | --- | --- |
| 核心画布 | `canvasConstants.ts` 注册 `card/folder/group/sticky/extension`，另有内部 Folder 展开节点 | 新增核心类型有现成路径，但必须补齐完整行为矩阵 |
| 内置扩展 | `BuiltinCanvasType` + `ExtensionInstanceRecord` 管理状态、能力、菜单、预览与持久化 | 适合已有媒体和工具内容；不是所有画布对象都必须实例化 |
| 公开插件 | `PluginContext.canvas` 只有 `registerType()`；组件拿到 state、presentation、updateState | 没有公开创建兄弟/子节点、设置边和排布的 API |
| 公开尺寸契约 | `pluginCanvasTypes.tsx` 校验宽高在 80–4096 px，默认最小尺寸 160×120 | 约 36 px 高的 Topic 不能直接按普通公开卡片交付 |
| 公开选区 | `SelectionPlacement.content` 可为 null；`app.selection.get()` 只返回持久 Note | Topic 可以保留 placement 可见性，不需要伪造 Note 或 extension 引用 |
| 公开内容 API | `app.content` 读写 Note 投影，具备 revision、批次、undo 契约 | 不擅自扩大为“全部画布节点 API” |
| 历史 | 原生画布与插件 Note 操作已经进入 `unifiedUndoHistory` | Topic 应使用原生画布事务，不能再做第三套撤销栈 |

源码依据：

- [核心节点注册](../../../src/mainview/lib/canvasConstants.ts)、[创建类型注册](../../../src/mainview/lib/canvasNodeRegistry.ts)。
- [内置扩展类型](../../../src/mainview/extensions/types.ts)、[公开扩展适配器](../../../src/mainview/plugins/runtime/pluginCanvasTypes.tsx)。
- [SDK 类型](../../../packages/plugin-sdk/index.d.ts)、[选区投影](../../../src/mainview/plugins/runtime/canvasSelection.ts)。
- [统一历史](../../../src/mainview/lib/unifiedUndoHistory.ts)、[兼容策略](../In%20Progress/trusted-plugin-compatibility-policy.md)。

### 2.2 决策：Topic 是核心节点，树行为由宿主拥有

| 路径 | 判断 |
| --- | --- |
| 给 Sticky 增加外观 | 适合紧凑便签；不足以表达不同的键盘与树行为，不选 |
| 普通第三方 canvas type | 当前公开能力不足；会把轻量节点需求扩大为 SDK、尺寸和拓扑 API 改造，不选 |
| 内置 extension | 可以写专用宿主逻辑，但会引入每个主题的实例状态、引用及实例历史与画布拓扑事务协调；首版收益不足，不选 |
| 核心 `topic` + 专用树操作 | 与 Sticky 一样内联保存；拓扑、排布和撤销在同一画布事务里，推荐 |

这是一项明确的核心类型例外，不撤销媒体/工具已完成的 extension 迁移。Topic 不注册进 `registerBuiltins()`，不创建 extension sidecar，不受插件启停影响。复用现有文字编辑、配色、菜单基础设施、连接渲染、搜索和持久化管道；树计算提取到小型纯函数模块，避免把所有算法塞入 `canvasStore.ts`。

**第一版不修改公开 SDK 方法签名、插件 manifest v2、激活、签名、安装更新、实例迁移和安全模式协议。** SDK 参考说明和测试夹具需要补充边界；如果实施中发现必须新增公共能力，先更新本方案与兼容策略，不能用插件直接访问宿主 store 的方式绕过契约。

## 3. 首版交互契约

### 3.1 节点与编辑

- 创建菜单提供「主题」，与 Note / Sticky 并列；右键在光标位置创建，底部入口在视口合理位置创建。新主题进入原地编辑，无正文、FocusedView、附件和 Note 文件。
- 建议初始最小宽 80 px、最大宽 320 px、最小高 36 px、左右内边距 12 px；超过最大宽度换行，高度随内容增长。数值为首版调校起点，验收后再冻结。
- 首版不提供手动 resize；没有图钉和大卡片外框。保留颜色、选中、锁定、连线入口与可访问名称。
- 普通单击进入编辑，沿用画布现有“单击打开、显式选择”规则；修饰键单击和框选只选中，拖动不能误触编辑。编辑中支持文本选择、粘贴与中文输入法。
- `F2` 编辑选中主题；输入框使用 label、只读态和合适的焦点标识。快捷键提示与右键动作保持一致，不仅靠键盘暴露能力。
- 新建空主题先作为临时编辑草稿显示，不写入正式 nodes/edges、持久化或历史。首次非空提交才一次性加入节点、树边和排布。取消或离开时丢弃空草稿；离开画布前提交非空草稿并走原有 flush。
- 已存在主题不能提交全空标题；清空后提交时保留编辑并提示，Esc 恢复原值。文本按纯文本处理，不执行 HTML 或 Markdown。建议上限 2,000 个 Unicode 码点，超限提示且保留草稿，不静默截断。

### 3.2 快捷键与状态优先级

| 场景 | 动作 |
| --- | --- |
| 单选 Topic，未编辑，Tab | 创建子主题并编辑 |
| 单选非根 Topic，未编辑，Enter | 创建紧接其后的同级主题并编辑 |
| 单选根 Topic，未编辑，Enter | 编辑根标题；根没有“同级”语义 |
| Topic 编辑中，Tab | 提交当前非空标题，再编辑新子主题 |
| 非根 Topic 编辑中，Enter | 提交当前非空标题，再编辑新同级主题 |
| 根 Topic 编辑中，Enter | 仅提交并保持选中 |
| Topic 编辑中，Mod+Enter | 仅提交并保持选中 |
| Topic 编辑中，Shift+Enter | 输入换行，受文本长度约束 |
| Topic 编辑中，Esc | 取消本轮编辑；新草稿直接消失 |
| Shift+Tab | 保留焦点导航，不用于更改父级 |
| 输入法 composing / keyCode 229 | 不触发创建、提交、删除、搜索等画布命令 |
| 多选、弹窗、其他输入框、插件表面获得焦点 | 不触发 Topic 快捷键；保留现有行为 |

优先级：输入法与当前输入框 → Topic 编辑器局部命令 → Topic 单选画布命令 → 现有画布快捷键 → 插件快捷键。方向键在编辑时移动光标，非编辑时沿用现有空间导航。Tab 只在 Topic 编辑或单选上下文拦截，不全局占用。

### 3.3 树关系、普通连线与容器

- Topic 可单独存在。只有明确创建子/同级主题的动作产生树边；手拉连线仍是普通关联，允许 Topic 连接 Note、Sticky、图片、链接、Folder 或插件卡片。
- 普通关联不影响排布、移动后代、删除和未来折叠的范围。
- 第一版一棵树在同一画布、同一直接 Group 容器内；不支持树边跨 Group、Folder 或视图。所有 Topic 不进入 Folder、不 detach 到文库。
- Group 的 `node.parentId` 仍只表示容器；与逻辑父主题无关。拖入/拖出 Group 时只允许整棵树一起变换容器坐标；部分树跨容器操作拒绝并给出说明。整树框选分组与 Group 删除/解组都需保留绝对位置。
- 不做拖到 Topic 上自动换父级。首版删除树边可把目标分支拆为新树，保留其位置和内部关系；禁止通过通用边端点编辑偷偷换父级。

### 3.4 移动、复制、删除和锁定

- 拖动 Topic 时携带其后代 Topic；根拖动整树。普通关联到的其他内容不跟随。
- 首版属于自动树布局：手动拖分支仅平移该子树，下一次明确结构/标题提交或“整理分支”允许对受影响分支重新排布；不承诺永久保留每个内部节点的手工偏移。UI 提供整理动作并说明这一行为。
- 普通 Copy / Duplicate / Delete 沿用显式选中集合，不暗中扩大到整树；另提供「选择分支」「复制分支」「删除分支」。删除单个 Topic 时保留未删除子主题及其位置，使其成为独立根；显式删除分支才递归移除后代。
- 复制一部分树时只复制两端都在选集内的边，剪断外部父边；复制整树保留顺序和关系。粘贴全部生成新的节点/边 ID，不能与原树串联。
- 一次操作若必须改动锁定节点、锁定容器或其关系，整个操作拒绝，不跳过一部分后留下断裂结构。首版将锁定解释为 Topic 结构及内容不可变；明确记录此规则，不静默改变其他类型的既有锁定行为。
- 拖动整树/分支时按整体边界处理碰撞，不调用逐个节点排斥把兄弟主题相互推散。

## 4. 数据模型、校验与兼容

### 4.1 推荐持久化形状（待实施）

```ts
// Node.type = 'topic'; Node.parentId 仍为 Group ID。
type TopicDataV1 = {
  topicVersion: 1;
  title: string;
  color: string;
};

// 沿用 labeledEdge 渲染入口，宿主按 data.kind 区分树边。
type TopicChildEdgeDataV1 = {
  kind: 'topic-child';
  relationVersion: 1;
  order: number; // 同父级的稳定排序值
};
```

树边 `source` 是父主题，`target` 是子主题。**边是逻辑层级的唯一真源**：不在 Node 里再存 topicParentId、children、rootId；运行时索引由 nodes/edges 推导。`order` 用连续非负整数，同级插入/删除在一个事务内重排，不从屏幕 y 坐标反推顺序。普通 `labeledEdge` 没有此标记时语义完全不变。

需要补齐 Bun `ManifestEdge.data` 类型及共享校验；当前 `ManifestEdge` 声明未列 data，但运行时序列化会保留其余字段，不应依赖这种隐式透传。

正式字段仅存标题、颜色、版本、位置、稳定尺寸与树边。编辑草稿、尺寸测量缓存、hover、派生索引和拖动过程不是持久化数据。文字提交后将确定的尺寸及排布写入同一快照；字体就绪或首次测量只做确定性校正，不产生多条用户撤销记录，也不在加载时全局重新整理用户画布。

### 4.2 校验与异常规则

- 树边只能连接两个 Topic，不自连、无环、每个子主题最多一个父级；节点/边 ID 唯一，位置与尺寸是有限数字，同父级顺序有效。
- 校验同视图和同直接 Group；新建、删除、拆支、复制、导入、模板实例化、恢复都走同一校验，不能只校验 UI 创建入口。
- 树遍历使用迭代和已访问集合，深树或坏数据不得导致无限递归。重复顺序按稳定 ID 规则计算临时展示顺序，显式修复时才写回。
- 无效树关系不自动删节点、不自动降格并写回；保留原始文件，显示诊断，问题树暂停结构操作。读取适配保留原始未知数据，普通自动保存不得覆盖有损解码结果；用户显式修复前对受影响画布暂停写入。
- 未知 `topicVersion` / `relationVersion` 显示只读标题/关系回退并保留原数据；解析失败不能覆盖成空标题、空画布或 Sticky。
- 跨画布复制是独立副本，不共享 Topic 身份；Topic 不成为 Note Library 条目，cleanup 不为它创建或删除内容文件。

### 4.3 保存、历史与旧版本

- 首版沿用 `ghostboard-canvas/v1` 外层格式，新增显式版本的节点/边数据；不改插件 manifestVersion 和实例 dataVersion。
- 每次“创建节点+树边+排布”“改标题+尺寸+排布”“删除/拆分/移动分支”只有一条原生画布历史。先计算与校验完整 nextGraph，再 snapshot + 一次 store set，不能串联多次 `setNodes/setEdges/saveSnapshot`。
- 沿用 `useCanvasPersistence`、pending flush backup 和原子写盘；失败提示、退出/切换视图 flush 与恢复覆盖 Topic。切换工作区后迟到测量/保存结果不能写入新工作区。
- 统一历史仍按 workspace + view、session 定界。验收重启后内容/结构恢复；**不承诺 Topic 的原生 Undo 跨重启**，不改变插件 Note 持久批次 undo 的语义。
- 旧工作区无需批量迁移；现有脑图模板在首版验收后更新，新建模板使用 Topic，用户已有 Card/Sticky 不自动转换。
- 当前旧客户端 `loadManifest()` 直接读 JSON，没有最小 reader 版本检查。不能靠新增一个版本字段声称旧客户端会拒绝打开。首版不承诺旧客户端往返编辑新 Topic 数据；首次写入 Topic 前保留原 manifest 备份，发布说明明确最低应用版本和降级恢复边界。恢复备份会丢弃备份后的修改，需要显式选择。
- 实施阶段用当前旧版本跑一次新数据只读/导出/保存探针，记录具体行为。若要求新旧客户端安全往返，应另做 reader 兼容阶段，先交付未知类型保留/只读保护，再开放新类型。

## 5. 排布实现范围

新增 `src/mainview/lib/topicTree.ts`（索引、校验、后代、事务图变换）与 `topicLayout.ts`（向右树排布）；名称为拟新增，不是已有文件。

- 给定文本尺寸、根锚点、子序、水平/垂直间距计算布局；建议初始水平间距 64 px、兄弟间距 16 px。父主题在其子树总高度中居中，稳定遍历保证结果可重复。
- 标题与子树高度变化只重算受影响的树内范围；无关 Note、图片、插件实例和其他树不移动。
- Group 内计算局部坐标，碰撞时转换到绝对坐标。Group 边界或锁定障碍导致无合法布局时拒绝整个结构提交并保留输入草稿，提供移动整树或扩大 Group 的说明；不得出现半建节点。
- 画布空白区域内优先稳定原锚点，必要时寻找分支整体可用位置；不采用全画布重排。碰撞求解设置有界迭代，失败可理解。
- 文字宽度测量要考虑当前字体、中英文、换行和缩放；使用画布逻辑单位，不能把屏幕像素直接写入尺寸。ResizeObserver 更新去重，防止测量→写尺寸→再次测量的循环。
- 以 20 节点键盘流程作为必过体验验收；100/500 节点、深树和长中文标题作为压力样例。记录硬件、帧耗时和创建延迟，不先承诺未经实测的性能数字。

## 6. 桌面端改动清单

以下是已核对的入口，不要求无差别修改所有文件；拟新增文件标“新增”。

| 工作项 | 文件或目录 | 必须覆盖 |
| --- | --- | --- |
| 类型/树模型 | `src/mainview/lib/contentTypes.ts`、`canvasNodeRegistry.ts`、新增 `src/shared/topic.ts`、`topicTree.ts` | 创建类型、尺寸/容器准入、两端校验、逻辑父子单一真源 |
| 渲染 | `src/mainview/lib/canvasConstants.ts`、新增 `components/canvas/nodes/TopicNode.tsx`、`nodes/readOnlyNodes.tsx`、`edges/LabeledEdge.tsx` | 正常与只读注册、树边呈现、标签、色彩、连接点、无动画噪声 |
| 行为入口 | `components/canvas/ViewSwitcher.tsx`、`ContextMenu.tsx`、`hooks/useCanvasKeyboard.ts`、`routes/index.tsx` | 两个创建入口、编辑状态、快捷键、分支菜单、i18n |
| 结构操作/排布 | `store/canvasStore.ts`、新增 `topicLayout.ts`、`hooks/useNodeDrag.ts`、`lib/collision.ts` | 原子图变换、分支拖拽、Group 坐标、锁定、碰撞 |
| 通用能力 | `lib/canvasNodePredicates.ts`、`canvasUtils.ts` | 内容识别、聚焦禁用、Folder 拒绝、复制/删除/标签完整性 |
| 持久化/恢复 | `lib/canvasNodeSerialization.ts`、`hooks/useCanvasPersistence.ts`、`lib/pendingFlushBackup.ts`、`src/bun/manifest.ts`、`src/bun/workspace.ts` | 保存、备份、原始数据保留、模板构造；核查 `rpc.ts`/Bun 保存处理器边数据透传 |
| 历史 | `lib/undoRedo.ts`、`unifiedUndoHistory.ts`、`routeUndoRedo.ts` | 原生事务与插件 Note 撤销交替，现有实例历史保持行为 |
| 搜索 | `src/bun/search.ts`、`src/shared/searchTypes.ts`、`src/mainview/lib/searchTypes.ts`、`components/search/` | 后端与当前视图 fallback、中文标题、跨视图定位并原地编辑 |
| 输出/输入 | `src/bun/markdownExport.ts`、`lib/canvasExport.ts`、`canvasImport.ts`、`lib/ai/buildAIContext.ts` | Markdown 标题/层级、JSON 往返、PNG/预览、AI 类型与父子投影 |
| 模板 | `src/bun/templates/brainstorm-mindmap/` | 新模板改 Topic 与正式树边，既有用户画布不迁移 |
| 额度与文案 | `store/canvasStore.ts`、`messages/en.json`、`messages/zh.json`、`docs/subscription.md` | 现有创建上限只数 card/sticky；建议 Topic 同口径计数，创建/分支/复制/导入一致，不升级全局商业策略 |
| 插件回归 | `plugins/runtime/canvasSelection.ts` 与测试、`selection.ts`/测试、SDK fake host 测试 | Topic placement 为 content:null，不污染 Note 内容 API 和事件 |

Markdown 首版可把 Topic 树导出为稳定缩进列表，同时保留普通资料导出；普通关联线不得伪装成树层级。结构遍历去重，节点不重复输出。该改动不代表“整个画布自动写成文章”。JSON 必须保留树边与顺序并重映射导入 ID；PNG 和模板预览使用纯只读渲染，不挂载编辑器、不发 RPC。

AI 上下文仅让既有宿主投影识别主题标题与父子关系，不新增 AI 写树工具；第三方插件读 Topic 的限制与宿主内部 AI 投影是两个边界。

额度采用当前未激活上限的既有规则，新增 Topic 纳入同一计数。若产品决定 Topic 免费不计数，必须在实现前把决定写入矩阵及文案，不能因漏加类型判断形成隐式豁免。

## 7. 扩展系统与公开开发文档契约

### 7.1 公开 API 的明确行为

| API / 场景 | 首版 Topic 行为 |
| --- | --- |
| `app.canvas.registerType()` | 继续只注册插件自有实例型卡片，不注册/替换核心 Topic，不提供树编辑能力 |
| `app.selection.getPlacements()` | 包含选中 Topic 的 placement ID，`content: null`；容器不递归展开 |
| `app.selection.get()`、`getSnapshot().items` | 继续只返回去重后的 Notes；Topic 不混入 NoteContentSnapshot |
| `app.content.get/query/createMany/updateMany` | 仍只操作 Note，不能传 Topic ID 读取标题或修改树 |
| `content.changed` | Topic 编辑不发送伪造 Note/extension 事件；首版无公开 Topic 内容变更事件 |
| `selection.changed` | Topic 选区成员变化照常可见，不扩展 payload 为树数据 |
| 第三方卡片与 Topic 关联 | 使用画布普通关联线；第三方实例不是 Topic 树的子节点 |
| 插件停用/卸载/安全模式 | Topic 正常可用；插件卡片继续原有 fallback，普通关联线不被当作树边删除 |
| 插件快捷键 | 保留宿主/编辑器优先；不能抢 Topic 编辑中的 Tab/Enter |

后果必须公开说明：首版第三方作者无法通过正式 SDK 做“读取选中 Topic → 批量改标题/生成分支”。高信任同 realm 不是公开 API 承诺，不在官方示例里读取 React Flow/Zustand 内部状态。此类需求出现后再设计独立树服务与 since-host 兼容声明。

### 7.2 两仓库同步清单

官网实际源码权威是 `/Users/laogui/Projects/react-starter-kit/apps/web`。桌面仓库 `packages/plugin-docs-site` 是 Markdown authoring copy 与部分测试来源，不应把旧 Astro 文件整包覆盖官网。

| 位置 | 实施完成时要改什么 |
| --- | --- |
| 桌面 `docs/PRD.md` | Topic 类型、键盘状态、树与容器、删除/复制/额度及范围；只在完成后更新实现状态 |
| 桌面 `docs/tech-spec.md` | 核心类型增加 Topic，节点/边 schema、原子图操作与历史边界；修正“只有四种核心用户类型”的相关断言 |
| 桌面 `docs/development-plan.md` | 增量任务与验收入口，不重新标记扩展改造阶段 |
| 桌面 `docs/features/In Progress/canvas-extension-behavior-matrix.md` | 增加 Topic 行及分支行为，保留其他类型现行规则 |
| 桌面现行扩展方案/追加说明 | 核查 `trusted-plugin-platform.md`、`trusted-plugin-platform-addendum-1.md` 和 `canvas-extension-platform-refactor.md` 中现行核心类型枚举，追加日期化说明；不改写历史证据/归档的当时结论 |
| 桌面 `packages/plugin-sdk/AI_REFERENCE.md`、`README.md` | 核心节点 vs 注册卡片，selection 的 null 示例，content 仅 Note；不新增虚构 API 签名 |
| 桌面 `packages/create-plugin/templates/{javascript,react,combined,importer}/` | 核查 README/AGENTS 的枚举、选区范例与 API 限制；只有实际描述受影响时更新，不改无关模板代码 |
| 双边手写 `content/docs/{en,zh}/guides/canvas-types.md` | 核心 Topic 与自定义卡片的边界；内联核心数据与实例 state 的区别 |
| 双边手写 `content/docs/{en,zh}/guides/content-and-storage.md` | Topic/Sticky 的 placement 选区、Note-only 内容 API、事件范围 |
| 双边 `guides/commands.md` 与 `policy/support-and-limits.md` | 前者检查焦点/快捷键优先级，后者注明没有公开 Topic/树编辑 API |
| 双边 `start/overview.md`、`policy/compatibility.md` | 只在概览/版本声明受影响时同步，标明实际可用宿主版本 |
| 官网 `apps/web/vendor/`、`apps/web/package.json`、根 `bun.lock` | SDK 参考更新后换精确包版本/新 tarball，安装并记录锁文件；不原地替换同版本已固定包 |
| 官网 `apps/web/content/docs/en/reference/sdk.md` | 运行 `sync:sdk` 从安装包生成；严禁手改生成页 |
| 官网 `/docs/llms.txt`、`/docs/llms-full.txt` | 自动聚合结果必须含新边界和正确版本，无需另存一份正文；zh SDK 页继续现有英文 fallback |

官网配套执行单见另一仓库 `docs/topic-docs-sync-plan.md`。本轮在两个项目写规划与入口，**不把尚未实现的 Topic 写进在线开发指南的当前能力段落**。

### 7.3 SDK、版本与发布顺序

1. 桌面功能与插件回归通过，明确 Topic 首次可用的实际宿主版本（本方案不提前占用版本号）。
2. 更新内部文档、SDK AI_REFERENCE/README 和必要夹具。公开签名不变时，不升级 manifestVersion 或 SDK major；参考包内容若变，使用新的 SDK patch 版本，并与兼容策略及防漂移脚本对齐。
3. 构建/打包新 SDK，官网精确安装该产物，再执行 `sync:sdk` 与 `--check`。当前源码里 SDK 是 0.1.0、官网用 vendor tgz；实施时若已切 npm，按当时分发方式走，禁止继续假设本地包。
4. 更新官网与桌面 authoring copy 的 en/zh 手写指南，检查生成参考页、llms 输出和版本一致。
5. 桌面已具备该能力后，才将相关文档作为当前能力发布；如先发预览，必须显式标明预览版本。网站部署、npm 发布、上传签名示例不属于本轮方案编写。

## 8. 实施分批与退出条件

| 批次 | 依赖 | 实施交付 | 退出条件 |
| --- | --- | --- | --- |
| P0 契约与基线 | 本方案 | 冻结行为矩阵、数据/树边校验、无效数据与旧客户端策略；核对两仓最新状态；记录已有门禁结果 | 关键规则无矛盾；已有扩展失败归属明确；数据/SDK 边界可测试 |
| P1 主题基础 | P0 | 核心 Topic、编辑草稿、自动尺寸、创建菜单、保存/恢复、搜索和只读渲染初接入 | 单节点从创建到重启找回完整可用；不上线为“完整思维导图” |
| P2 树与连续操作 | P1 | 子/同级创建、树边、向右排布、移动/拆支、Group/锁定、事务历史 | 连续 20 节点流程、中文输入法、单步撤销通过 |
| P3 全链路与插件回归 | P2 | 复制/导入、JSON/Markdown/PNG、AI、额度、模板、混合选区/插件历史 | 所有必过矩阵及发行包场景通过；无孤儿边、内容丢失、实例迁移回归 |
| P4 SDK/双仓文档收口 | P3 | 内部规范、SDK 参考包、双语指南、生成参考页、官网验证 | 实际实现、安装 SDK、网页、llms 文本一致；写明未验证平台/限制 |

阶段状态初始均为 **待开始**。P0–P4 是增量 Topic 任务，不复用或重开已完成的插件 T0–T5 编号。

## 9. 验证与验收

### 9.1 自动化必过矩阵

- 纯函数：单根/多根、父子与同级、顺序、无环/单父、深树、重复 ID、非法版本、坏尺寸、跨 Group 拒绝、子树闭包、稳定排布。
- 编辑与键盘：中英文/emoji、composition Enter/Tab、空草稿 Esc、文本过长、已有标题清空、Shift+Enter、修饰键选择、拖动阈值、多选、插件面板/输入框焦点。
- 生命周期：创建/编辑/拆支/删除/移动/复制分别一次撤销；重复和跨画布粘贴 ID 重映射；锁定导致全事务拒绝；重启、切视图、保存失败恢复。
- Group/Folder：整树分组/解组绝对位置不变、部分树跨容器拒绝、Folder 拒收、删除 Group 后树结构与位置保留。
- 搜索与输出：后端及 fallback 命中、跨视图定位编辑、Markdown 稳定层级、PNG 与模板预览、JSON 往返、不把普通关联变父子、不丢插件未知类型 fallback。
- 扩展：混合 Topic + Note + 第三方卡片选区，placement 全可见但 Note 内容投影不混入 Topic；主题编辑不伪发 content.changed；插件 Note mutation → Topic 结构 mutation → Undo/Redo 顺序正确。
- SDK/旧插件：原 command/panel/canvas type/importer 样例仍工作，公开签名不变；禁用/重新启用/安全模式、实例 state 保存/迁移不受 Topic 影响。

### 9.2 实施阶段命令

桌面仓库：

```bash
bun run type-check
bun run check
bun run test
bun run test:plugin-t5-compat
bun run test:plugin-templates
bun run build:canary
```

按改动运行现有 packaged 探针，重点 `test:plugin-t2-selection`、`test:plugin-t2-canvas`、`test:plugin-t2-history`；P3 最终运行 `test:plugin-t5`。安全模式/恢复需真实发行包走查；若动到相关实现，增加 `test:plugin-t4`。探针需要的本地 fixture、设备或外部服务缺失应记录，不能把未运行写成通过。

官网 `apps/web`：

```bash
bun run sync:sdk
bun run check
bun run test
bun run build
```

官网需实查 `/docs/guides/canvas-types/`、`/zh/docs/guides/canvas-types/`、双语 content-and-storage、SDK 页与中文 fallback，以及两个 llms 端点。代码构建通过不等于已部署。

### 9.3 真实桌面体验验收

1. 从一个中心主题，用键盘连续写 20 个想法（至少三层、中文标题），不手拉线、不手工整理每个节点。
2. 接入一张 Note、一张图片、一个链接和一个第三方卡片，确认普通关联不改变树关系。
3. 改长标题、移动分支、整树进/出 Group；删除中间单节点后子主题仍在，删除分支后仅指定子树消失。
4. 交替执行插件 Note 更新与 Topic 操作，按顺序撤销/重做；关闭重启后标题、层级、顺序、位置都在。
5. 搜索定位中文主题；导出 Markdown/PNG/JSON，JSON 导入新画布并核对节点数、树边数、父子、子序及普通关联。
6. 关闭第三方插件或进入安全模式，Topic 保持可编辑，第三方卡片显示既有回退。记录截图/短录屏、发行包版本、平台和机器结果。

## 10. 完成定义与本轮产物

功能完成要求 P0–P4 全部有证据，不能以新增 `TopicNode.tsx` 或截图作为完成标准。首版公开限制：无折叠/拖拽换父级/公开树 API、不支持旧客户端编辑新 Topic、不共享跨画布 Topic 内容、原生 Undo 不跨重启。

本轮仅交付本方案、官网配套同步计划及现有规划入口；没有修改运行时代码、SDK 版本或当前线上能力文档。后续执行本方案时，按批次更新状态与实际验证结果。
