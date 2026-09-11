# GhostBoard 画布内置扩展化改造方案（RFC-1）

> 状态：Ready for 验收（Phase 0–6 已落地；冷启动聚合文件阈值仍按 §26.4 待基准后再定）
>
> 创建日期：2026-08-19
>
> 修订日期：2026-09-11
>
> 目标版本：当前开发分支 `feat/canvas-extension-platform`
>
> 适用范围：`src/mainview/`、`src/bun/`、`src/shared/`、画布/工作区数据格式
>
> 后续项目：第三方扩展平台见 [高信任插件系统改造方案](./trusted-plugin-platform.md)。2026-09-07 起以公开插件方案替代本文 §28 和旧 RFC-2 的“等待外部需求后立项”前提；2026-09-09 起插件模型改为高信任、同 realm 运行，本文为“RFC-2 沙箱化”预留的可序列化 Host API 约束不再是必要条件，但仍是良好的内部解耦实践。本文的内置扩展迁移历史与验收记录保留。

## 0. 修订记录

v2 相对 v1 草案的主要变化：

1. **范围拆分**：本 RFC 只覆盖内置扩展化（内部解耦）。沙箱、权限系统、SDK、脚手架、签名分发全部移入 RFC-2，且 RFC-2 需要独立的需求论证后才立项。
2. **Manifest 改为 TypeScript 对象**：内置扩展随应用编译，声明用 TS 接口获得编译期检查，删除 JSON schema 校验、路径校验、资源大小限制等仅为第三方包服务的机制。
3. **Sticky 保留为核心类型**：判断标准从"实现是否简单"改为"是否有人想禁用或替换它"。Sticky 内容继续 inline 在 manifest 中，避免加载性能退化和"禁用 basics 后满画布 fallback"的荒谬状态。
4. **启用粒度改为 Canvas Type 级**：扩展包只是代码组织单位，用户按内容类型（如单独禁用 Recording）启用/禁用。
5. **删除 Snapshot 截图系统**：内置扩展都是宿主 DOM 内的 React 组件，Folder/Library/模板预览统一要求提供轻量 `PreviewSurface`，fallback 用 Presentation Card。截图系统连同它在沙箱下的技术矛盾一起移入 RFC-2。
6. **Presentation 由宿主派生**：内置 Canvas Type 必须实现纯函数 `buildPresentation(state)`，宿主在每次持久化写入时调用并保存，杜绝"扩展忘记更新导致搜索静默腐化"。原待决策项 8 就此关闭。
7. **画布 manifest 保持 `ghostboard-canvas/v1`**：`extension` 节点类型作为增量修改加入，不 bump 大版本。新增"回滚与向前兼容"章节（§18.6），把旧版本 round-trip 验证列为 Phase 0 退出条件。
8. **`pomodoro` 不改名为 `timer`**：与"不做无用户价值的内部重命名"原则保持一致（同 `card` 不改 `note`）。
9. **两层 Undo 语义明确为沿用现状**：焦点在扩展 Surface 内时 Cmd+Z 走实例历史，否则走画布历史，与当前 `widgetStore` 行为一致。
10. **Scheduler 事件投递语义定义**（§12.3）：持久化、重启恢复、过期任务合并触发。
11. **性能预算加入冷启动基准**；工作量估算单列测试迁移成本。
12. **Canvas Export v2 的 `requiredExtensions` 简化为 ID 列表**，删除无处解析的 `versionRange`。

2026-09-11 修订（同步 [插件系统整改计划](./plugin-system-hardening.md) H1/H4/H5 的落地结果）：

1. **Scheduler 投递模型改写**（§12.3）：投递由宿主驱动、不等 Surface 挂载；通知改由 Canvas Type 在 `onTaskFired` 里发出，宿主不代发；新增 ack 结算机制作为 at-least-once 的实现基础。原文"触发时由宿主显示系统通知；Surface 在下次挂载时收到事件"的描述作废。
2. **`BuiltinCanvasType` 新增 `onTaskFired`**（§6）：调度回调挂在类型上而非 Surface 上。
3. **RPC 清单补齐**（§17.4）：`extensionScheduler.cancel` 带 `instanceId`，新增 `extensionScheduler.ack`，并单列宿主 → renderer 的 `extensionTaskFired` 消息。
4. **禁用语义澄清**（§8.3）：禁用类型的已排期任务是"抑制并结算"而非"暂停"。原文措辞含糊，且实现一度完全没有检查 enablement（H1 引入的回归，已随本次修订修复）。
5. **`extension-tasks.json` 进入文件布局与损坏策略**（§7.3）：损坏时先另存 `.corrupt-*` 备份再重建，备份没落盘就不覆盖原文件。
6. **`expectedRevision` 由约定变成强制**（§7.4、§13.3）：renderer 侧 compare-and-set，冲突抛 `ExtensionRevisionConflictError` 并附带当前快照。
7. **Phase 4 验收更正**（§21）：§12.3 语义当初被记为已交付，实际到 2026-09-11 才落地，原因与教训记在该处。

2026-09-07 gap-closure 收尾修订：

1. **上下文菜单保持声明式宿主边界**：宿主通用动作由 `openBehavior` / `interactions` 派生，类型专属动作由 `menuActions` 声明；handler 只通过 Host API 与实例更新通道执行，不让 Surface 直接依赖 canvasStore 或 bridge。
2. **内置搜索展示映射集中维护**：内置 Canvas Type 到 legacy search kind / widget kind 的适配与稳定 ID 同处 `src/shared/extensions/builtinIds.ts`；未知或第三方类型继续使用通用 `extension` 展示。

## 1. 摘要

本方案将 GhostBoard 从"编译期固定内容类型的画布"改造为"稳定画布内核 + 内置 Canvas Type 注册表"的架构。

改造完成后，核心画布只理解五类运行时节点：

- Note（内部 key 仍为 `card`）
- Sticky
- Folder
- Group
- Extension（通用宿主节点，不作为用户可直接选择的内容类型）

Image、File、Link、Recording、Checklist、Pomodoro、Reminder 等均改为通过统一 Registry 注册的内置 Canvas Type，用户可按类型启用或禁用。新增一种内容类型只需新增扩展目录和注册信息，不再修改散布在约 54 个文件中的类型分支。

本方案的核心原则：

1. 画布内核控制空间行为（拖拽、缩放、选择、连接、父子关系、Undo/Redo），Canvas Type 控制内容与业务交互。
2. Canvas Type 不直接依赖 React Flow 内部结构、canvasStore 或工作区绝对路径；通过 Host API 访问宿主能力。
3. 禁用类型或数据来自更新版本时，节点位置、尺寸、状态和搜索投影必须保留。
4. 实例数据模型和 Host API 语义保持"沙箱可兼容"（可序列化、无直接 store 访问），使 RFC-2 无需重做协议，但本阶段一律进程内实现，不引入消息桥。
5. 改造采用双读、渐进迁移，不要求一次性转换整个工作区，且保证可回滚。

## 2. 背景与现状

当前代码已经具备扩展化的部分基础：

- `checklist`、`pomodoro`、`reminder` 共用 `node.type = 'widget'`。
- Widget 内容使用 `.ghostboard/widgets/*.json` 独立保存。
- `widgetStore` 已支持按实例加载、保存、克隆、Undo/Redo 和损坏降级。
- `canvasNodeRegistry` 已集中管理默认尺寸与 Folder/Group 资格。
- 画布已经具备只读节点、Folder child preview、Canvas JSON 导入导出等投影视图。

但内容类型仍然以编译期联合和类型分支散布在多个系统中：

- `CanvasNodeKind` 和 `WidgetKind` 是固定联合类型。
- 创建菜单、上下文菜单和创建流程按类型写死。
- `WidgetNode`、`FocusedView`、`FolderChildPreview` 按类型分发组件。
- 搜索、AI 上下文、导出、复制粘贴和清理逻辑理解具体节点类型。
- Image、Asset、Recording 等节点直接访问附件和文件相关 RPC。
- 未知内容类型无法完整参与搜索、预览和导入。

代码扫描显示，节点类型词汇直接或间接出现在约 54 个非测试文件和 69 个测试文件中。本次工作是跨系统架构改造，测试迁移是工作量的显性组成部分（见 §25）。

## 3. 目标与非目标

### 3.1 目标

- 核心画布只理解 Note、Sticky、Folder、Group、Extension 五类运行时节点。
- 所有非核心内容通过统一 Canvas Type Registry 创建和渲染。
- 用户可按工作区、按 Canvas Type 启用或禁用。
- 禁用类型不删除实例数据；数据来自更新版本（未知类型）时无损 round-trip。
- Canvas Type 声明默认尺寸、缩放约束、打开行为、Folder/Group 资格。
- Canvas Type 提供画布 Surface、必需的轻量 Preview Surface 和可选的详情 Surface。
- 搜索、AI、导出和无障碍信息只依赖宿主派生并持久化的 Presentation。
- 支持旧画布、旧 Widget、旧模板和旧 Canvas JSON 的渐进迁移，且迁移可回滚。
- 实例数据模型与 Host API 语义为 RFC-2 的沙箱化预留兼容性。

### 3.2 非目标

以下内容不属于本 RFC（大部分移入 RFC-2）：

- 第三方扩展的安装、沙箱执行、消息桥和 CSP。
- 权限声明的运行时确认 UI。
- 扩展 SDK、脚手架、本地开发模式和打包格式。
- Snapshot 截图系统（内置世界用 PreviewSurface 替代）。
- 在线市场、签名和分发。
- 扩展自定义 React Flow 节点、边或修改画布内部 store。
- 扩展自定义拖拽、框选、连线和 Undo/Redo 实现。
- 将内部 `card` key 重命名为 `note`，或将 `pomodoro` 重命名为 `timer`。

最后一项是有意的范围控制：产品文案可以叫 Note 和 Timer，但内部 key 保持 `card` 和 `pomodoro`，避免为无用户价值的重命名扩大迁移面。

### 3.3 Sticky 为什么留在核心

判断一个类型是否扩展化的标准是"是否有人想禁用或替换它"，而不是"它是否实现简单"：

- 没有用户需要禁用便签；禁用后满画布 fallback 是负价值。
- Sticky 内容目前 inline 在 manifest 中，一次读盘全有。扩展化会把最高基数的轻量类型变成 N 个 sidecar 文件，冷启动和搜索 IO 都变差。
- Sticky 无附件、无详情视图、无外部依赖，留在核心的维护成本接近零。

Link 曾考虑同样保留，但 Link 有 unfurl 网络行为和真实的"禁用网络抓取"诉求，保持扩展化。

## 4. 术语

| 术语 | 含义 |
| --- | --- |
| Canvas Type | 通过 Registry 注册的一种内容类型，例如 `ghostboard.media/image` |
| Extension Pack | 一组相关 Canvas Type 的代码组织单位（目录），不是启用/禁用单位 |
| Instance | 用户放在画布上的一个内容实例 |
| Extension Node | React Flow 中承载实例的通用节点（`type: 'extension'`） |
| Host Shell | 宿主提供的节点外壳，负责拖拽、缩放、选择、连接和错误状态 |
| Canvas Surface | Canvas Type 在画布节点内部显示的 React UI |
| Detail Surface | 实例被打开后显示的可选详情 UI |
| Preview Surface | 必需的轻量只读预览组件，用于 Folder、Library、模板 |
| Presentation | 宿主从 state 派生并持久化的纯文本投影，用于搜索、导出和 fallback |
| Availability | 实例引用的 Canvas Type 在当前运行时的可用状态 |

## 5. 目标架构

```text
┌────────────────────────────────────────────────────────────────────┐
│                         GhostBoard Canvas                          │
│                                                                    │
│  Core nodes                     Generic extension node             │
│  ├── card (Note)                └── ExtensionHostShell             │
│  ├── sticky                         ├── selection / drag / resize  │
│  ├── folder                         ├── handles / lock / fallback  │
│  ├── group                          └── CanvasSurface (React)      │
│  └── internal folder child                    │                    │
├───────────────────────────────────────────────┼────────────────────┤
│              Canvas Type Registry (built-in)  │                    │
│  ├── TS manifests + React adapters            │                    │
│  ├── per-type enablement                      │                    │
│  └── availability resolution                  │                    │
├───────────────────────────────────────────────┴────────────────────┤
│                         Host Services                              │
│  instance state / presentation / assets / scheduler                │
│  notifications / external URL / network (unfurl) / commands        │
├────────────────────────────────────────────────────────────────────┤
│                       Bun Persistence                              │
│  manifest (v1, additive) / instances / attachments / GC / journal  │
└────────────────────────────────────────────────────────────────────┘
```

### 5.1 核心运行时类型

```ts
type CoreReactFlowNodeType =
  | 'card'
  | 'sticky'
  | 'folder'
  | 'group'
  | 'extension';
```

`folderExpandedChild` 等只为动画或内部渲染存在的类型不属于公开内容类型。

Edge、视口、选择、拖拽、框选、连线、自动布局、撤销重做仍由核心画布管理。

### 5.2 核心服务不等于核心内容类型

Image 作为 Canvas Type，并不意味着它自行保存文件。以下能力继续属于宿主：

- 附件导入、路径校验、流式读取和孤立文件清理。
- 麦克风权限和录音文件持久化。
- 后台时间调度和系统通知。
- 安全打开外部 URL。
- Link unfurl 等网络请求。
- 搜索索引和 AI 文本投影。
- Canvas JSON、PNG、Markdown 等导入导出。
- Undo/Redo、复制、粘贴、克隆和删除恢复。

Canvas Type 通过 Host API 调用这些能力，不直接访问 RPC 或文件系统。

## 6. Canvas Type 声明（TypeScript Manifest）

内置扩展随应用编译，声明是带类型参数的 TS 对象，无 JSON schema、无运行时路径校验：

```ts
interface BuiltinCanvasType<TState> {
  /** 完整类型键，如 'ghostboard.media/image'，一经发布不得改变含义 */
  id: string;
  /** i18n message key，创建菜单与设置页标题 */
  titleKey: string;
  descriptionKey?: string;
  icon: ComponentType<IconProps>;
  category: 'media' | 'productivity' | 'web';

  surface: {
    defaultSize: Size;
    minSize?: Size;
    maxSize?: Size;
    resizable: boolean;
    preserveAspectRatio?: boolean;
    openBehavior: 'none' | 'detail';
    canEnterGroup: boolean;
    canEnterFolder: boolean;
  };

  dataVersion: number;

  createInitialState(): TState;
  validateState(value: unknown): value is TState;
  /** dataVersion 升级时由宿主调用 */
  migrateState(record: ExtensionInstanceRecord): TState;
  /** 纯函数；宿主在每次持久化写入时调用并保存结果 */
  buildPresentation(state: TState): ExtensionPresentation;

  CanvasSurface: ComponentType<SurfaceProps<TState>>;
  DetailSurface?: ComponentType<SurfaceProps<TState>>;
  /** 必需：Folder / Library / 模板 / fallback 的轻量只读预览 */
  PreviewSurface: ComponentType<PreviewProps<TState>>;

  /**
   * 该实例的调度任务到期时由宿主调用（§12.3）。声明在类型上而不是 Surface 上，
   * 这样没有任何组件挂载时任务也能触发——否则持久化调度就没有意义。
   */
  onTaskFired?(
    event: ScheduledTaskFiredEvent,
    context: { host: GhostBoardHostAPI; state: TState }
  ): Promise<void> | void;

  /**
   * 声明该类型使用的宿主能力，仅用于审计和 RFC-2 前向兼容，
   * 本阶段不做运行时授权。
   */
  capabilities?: HostCapability[];
}
```

### 6.1 标识约束

- 命名空间使用 `ghostboard.<pack>` 前缀；完整类型键为 `${namespace}/${typeId}`。
- `typeId` 使用 kebab-case：`^[a-z][a-z0-9-]{0,63}$`。
- 类型键一经发布不得转让或改变含义；迁移映射依赖它的稳定性。
- 校验在单元测试中完成（注册表启动断言 + 测试覆盖），不需要运行时 schema 校验。

## 7. 画布节点与实例数据模型

### 7.1 Canvas Manifest 引用

画布只保存空间布局和通用实例引用。**manifest schema 保持 `ghostboard-canvas/v1` 不变**，`extension` 是新增节点类型（增量修改），理由见 §18.6。

```ts
interface ExtensionNodeData {
  /** 完整类型键，如 'ghostboard.productivity/pomodoro' */
  canvasTypeId: string;
  instanceId: string;
}
```

```json
{
  "id": "node-abc123",
  "type": "extension",
  "position": { "x": 420, "y": 240 },
  "style": { "width": 320, "height": 260 },
  "data": {
    "canvasTypeId": "ghostboard.productivity/pomodoro",
    "instanceId": "extinst_abc123"
  }
}
```

以下数据不保存在实例 state 中：

- 节点位置、宽高。
- parentId / extent。
- 选中、拖拽和测量状态。
- React Flow 内部字段。

这些数据属于画布布局，由 `canvasStore` 和 manifest 管理。

### 7.2 Extension Instance

```ts
interface ExtensionInstanceRecord {
  schema: 'ghostboard-extension-instance/v1';

  id: string;
  canvasTypeId: string;

  appVersion: string;
  dataVersion: number;
  revision: number;

  createdAt: string;
  updatedAt: string;

  state: unknown;
  presentation: ExtensionPresentation;
}

interface ExtensionPresentation {
  title: string;
  subtitle?: string;
  plainText?: string;
  accentColor?: string;
  accessibilityLabel?: string;
}
```

宿主只校验通用 envelope；类型可用时再由对应 `validateState` 校验 `state`。类型被禁用或未知（数据来自更新版本）时，`state` 必须被当作不透明 JSON 原样保存，不能因为宿主不理解业务字段而判定整个实例损坏。未知字段必须 round-trip 保留。

### 7.3 文件布局

```text
.ghostboard/
  extensions.json            # 工作区级 per-type 启用状态
  extension-tasks.json       # 宿主调度任务（§12.3）
  extension-instances/
    extinst_abc123.json
```

- 现有通用附件继续保存在 `attachments/`；实例只保存宿主生成的 asset handle，不保存绝对路径。
- `extensions.json` 结构：`{ "disabledCanvasTypes": ["ghostboard.media/recording"] }`，默认全部启用。
- `extension-tasks.json` 的任务按 `(instanceId, id)` 唯一；文件不存在视为"还没排过任务"，JSON 或 schema 损坏则另行处理（见下）。
- **损坏处理**：以上任一 JSON 损坏时，宿主不静默当作空文件——原始字节先另存为同目录的 `<name>.corrupt-<timestamp>` 兄弟文件，之后才允许重建，且备份没落盘就绝不覆盖原文件。这条 fail-closed 策略对 `extension-tasks.json` 同样适用，避免一次解析失败就把用户所有提醒清空。
- 迁移第一轮保持现有附件路径不变，只迁移节点引用和 metadata 所属。

### 7.4 并发与写入

- 每个实例维护单调递增 `revision`。
- 更新使用 expected revision **和**宿主内的串行写链，避免覆盖较新的状态。`ExtensionStateUpdate.expectedRevision` 在 renderer 侧就地校验（§13.3）：与当前 `revision` 不符时整笔写入被丢弃并抛 `ExtensionRevisionConflictError`，错误对象带上当前快照，调用方可以据此重试或放弃。省略 `expectedRevision` 表示"无条件写入"，仍然只有串行写链兜底。
- 文件写入必须原子化（复用现有 atomic write），并按路径串行——同一文件的并发读改写排队执行，避免后写覆盖先写。
- 高频临时更新使用 `history: 'ephemeral'`，例如计时器每秒刷新，只更新内存，不写盘、不进 Undo 栈、不重算 presentation。
- 业务状态只在语义变化时写盘；运行中的计时显示由 `startedAt` / `durationMs` 时间戳计算。
- 单个实例 JSON 默认限制 1 MiB，大数据必须使用 Asset API。

### 7.5 加载性能

实例采用每实例一文件（sidecar），与现有 widget 一致，但要满足冷启动预算（§19）：

- `extensionInstance.loadMany` 一次 RPC 批量返回画布引用的全部实例。
- Bun 端并行读取实例文件。
- 最高基数的轻量类型（sticky、card）留在核心、内容 inline，不产生 sidecar。
- 若 Phase 3 冷启动基准不达标，备选方案是 per-canvas 聚合实例文件（`extension-instances/<viewId>.json`），协议不变、只改存储布局。该备选默认不实现。

## 8. Registry 与生命周期

### 8.1 Registry 职责

`CanvasTypeRegistry` 负责：

- 汇总内置 Extension Pack 注册的全部 Canvas Type。
- 启动时断言 ID 唯一性和声明完整性。
- 解析 `canvasTypeId` 到 manifest 与 React 组件。
- 结合工作区 `extensions.json` 暴露"当前已启用"的类型集合。
- 为创建菜单、图标、尺寸约束提供声明数据。
- 提供 availability 状态。

Registry 不负责实例业务状态，不直接写 canvasStore。

### 8.2 Availability

```ts
type ExtensionAvailability =
  | 'available'   // 已注册且启用
  | 'disabled'    // 已注册但被工作区禁用
  | 'unknown';    // 本构建不认识该类型（数据来自更新版本）
```

内置世界不存在"卸载"，`unknown` 只出现在降级打开新数据的场景，行为与 RFC-2 的 missing 一致：保留数据、显示 fallback、可导出。

### 8.3 禁用行为

按 Canvas Type 禁用（不是按 Pack）：

- 从创建菜单中隐藏。
- 停止该类型新的网络、通知和调度请求。已排期的宿主任务到期时被抑制而非暂停：不通知、不写 state，但照常 ack 结算（理由与代价见 §12.3）。
- 已有节点原地保留，显示 PreviewSurface（只读）或 Presentation Card fallback。
- 节点仍可移动、缩放、复制、删除和导出。
- presentation 和原始 state 保留。
- 用户可从节点 fallback 直接重新启用。

## 9. Host Shell 与画布交互协议

### 9.1 Host Shell 职责

通用 `ExtensionNode` 只渲染一个 `ExtensionHostShell`：

```text
ExtensionHostShell
├── selection outline
├── drag region
├── resize handles
├── connection handles
├── locked / read-only state
├── availability fallback
├── crash boundary (React error boundary)
└── CanvasSurface
```

Host Shell 统一负责：

- 选中和框选。
- 拖拽、Group parent 和 Folder drop。
- resize constraints。
- React Flow handles。
- 锁定和只读状态。
- 打开详情 Surface。
- disabled / unknown / corrupted-state / crashed fallback。

### 9.2 拖拽

- 所有画布节点默认可由宿主拖动，不提供类型级 `draggable: false`。
- Surface 内部输入、按钮、滚动和自定义拖动不应触发节点移动（沿用现有 widget 的 `nodrag` 处理）。

### 9.3 缩放

Canvas Type 只声明 `resizable` / `minSize` / `maxSize` / `preserveAspectRatio` / `defaultSize`；宿主负责实际 NodeResizer、约束、Undo/Redo 和 manifest 持久化。

Surface 接收：

```ts
interface SurfaceRenderContext {
  width: number;
  height: number;
  theme: 'light' | 'dark';
  locale: string;
  readOnly: boolean;
  selected: boolean;
  surface: 'canvas' | 'detail' | 'preview';
}
```

Surface 可调用 `host.canvas.requestResize()` 请求调整尺寸，最终尺寸由宿主裁剪。连续 resize 只更新 UI，停止后才进入持久化历史。

### 9.4 打开详情

- `openBehavior: 'none'`：只在画布内交互。
- `openBehavior: 'detail'`：双击或 Enter 打开统一详情壳（改造后的 `FocusedView`），Surface 内可调用 `host.canvas.openDetail()`。
- ESC、关闭按钮、前后导航和动画由宿主负责。
- Note 作为核心类型保留现有单击打开行为。

### 9.5 Group 与 Folder

- `canEnterGroup` / `canEnterFolder` 由声明控制，宿主执行。
- Canvas Type 不能直接修改 parentId 或 Folder children。
- Folder child 保存相同的通用 instance 引用，不复制业务 state。
- 从 Folder 移回画布时，实例 ID 保持不变。
- Folder 中渲染 PreviewSurface，不渲染完整 CanvasSurface。

```ts
interface ExtensionFolderChild {
  id: string;
  type: 'extension';
  data: ExtensionNodeData;
  size: { width: number; height: number };
}
```

## 10. Surface 体系

三种 Surface 都是 React 组件，运行在宿主 renderer 内（无 iframe、无消息桥）：

| Surface | 必需性 | 用途 |
| --- | --- | --- |
| `CanvasSurface` | 必需 | 画布节点内的交互 UI |
| `PreviewSurface` | 必需 | Folder、Library、模板、禁用 fallback 的轻量只读预览 |
| `DetailSurface` | 可选 | `openBehavior: 'detail'` 时的详情视图 |

约束：

- PreviewSurface 不得订阅 store、发起 RPC 或产生副作用；只接收已加载的 `state` 和 presentation，接口与现有 `readOnlyNodeTypes` 的约定一致。
- Surface 不得 import canvasStore、Electrobun bridge 或 `src/bun/*`；ESLint/Biome 规则强制。
- CanvasSurface 崩溃由 error boundary 捕获，降级为 Presentation Card，不影响画布其余部分。

不做 Snapshot 截图：内置组件可以直接以只读模式渲染，截图缓存的全部复杂度（生成队列、缓存失效、theme 绑定、文件 GC）在内置世界没有收益。RFC-2 的沙箱场景才需要它，连同其与隔离的技术矛盾一起在 RFC-2 处理。

## 11. Presentation

### 11.1 派生规则（宿主强制）

Presentation 不依赖 Surface 自觉提交：

1. 每次 `history: 'record'` 的状态写入，宿主调用该类型的 `buildPresentation(state)` 并随实例一起持久化。
2. `history: 'ephemeral'` 更新不重算 presentation。
3. `buildPresentation` 必须是纯函数；返回值超限（见 §19）时截断并告警。
4. 宿主只接受纯文本和颜色，不接受 HTML。

这保证 presentation 永远与最后持久化的 state 一致，搜索和导出不会静默腐化。

### 11.2 用途

- 搜索索引。
- AI 上下文（默认只提供 presentation，不传递任意 state）。
- 无障碍标签。
- Markdown/纯文本 fallback 导出。
- disabled / unknown fallback 卡片。

类型被禁用或未知时，仍能搜索和导出最后保存的 presentation。

## 12. Host API

### 12.1 API 形状

进程内实现，但接口形状保持可序列化、按实例绑定，为 RFC-2 沙箱化预留兼容性：

```ts
interface GhostBoardHostAPI {
  instance: {
    getState(): ExtensionStateSnapshot;
    updateState(request: ExtensionStateUpdate): Promise<ExtensionStateSnapshot>;
  };

  canvas: {
    requestResize(size: Partial<Size>): Promise<Size>;
    openDetail(): Promise<void>;
    closeDetail(): Promise<void>;
  };

  assets: {
    importFile(options?: AssetImportOptions): Promise<AssetHandle | null>;
    getUrl(assetId: string): Promise<string>;
    getMetadata(assetId: string): Promise<AssetMetadata>;
    remove(assetId: string): Promise<void>;
  };

  scheduler: {
    schedule(task: ScheduledTask): Promise<void>;
    cancel(taskId: string): Promise<void>;
    list(): Promise<ScheduledTask[]>;
  };

  notifications: {
    show(notification: ExtensionNotification): Promise<void>;
  };

  external: {
    openUrl(url: string): Promise<void>;
  };

  network: {
    /** 本阶段仅供 Link unfurl 等内置能力使用 */
    fetch(request: ExtensionFetchRequest): Promise<ExtensionFetchResponse>;
  };
}
```

所有请求自动绑定当前 `canvasTypeId` 和 `instanceId`。剪贴板不在 v1 API 中；内置类型如需剪贴板走现有宿主路径，RFC-2 再决定是否作为受权能力开放。

### 12.2 能力声明

`capabilities` 只是 manifest 上的声明式列表（`'assets' | 'scheduler' | 'notifications' | 'external' | 'network'`），用于审计和 RFC-2 前向兼容。本阶段不做运行时授权和确认 UI——内置代码是受信任的，授权系统没有对象。

### 12.3 Scheduler

Reminder 等类型不能依赖 React 组件中的长时间 `setTimeout`。Scheduler 由 Bun 宿主维护，语义定义如下：

- 任务持久化在工作区 `.ghostboard/extension-tasks.json`（随实例所属工作区走），应用重启后恢复。
- 支持指定时间触发和重复规则，payload 大小受限。
- **投递语义：at-least-once**。应用关闭期间到期的任务，在下次启动时立即触发；同一任务的多次错过合并为一次触发（例如错过 3 次的重复提醒只通知一次，并注明最近到期时间）。
- **投递由宿主驱动，不等 Surface 挂载。** 宿主定时 tick 出到期任务，通过 `extensionTaskFired` 消息把一批 `ExtensionTaskDelivery` 推给 renderer；renderer 的 task dispatcher 按需加载实例记录（Surface 没挂载就走 `loadMany` 补齐），然后调用该 Canvas Type 的 `onTaskFired`。**通知由 Canvas Type 在 handler 里通过 `host.notifications.show()` 发出，宿主不代发**——宿主不理解业务语义，无法决定通知文案。
- **ack 后才结算。** 任务在投递后仍留在盘上，renderer 处理完回 `extensionScheduler.ack(deliveryId)`，宿主才把一次性任务删除、把重复任务推进到下一周期。handler 抛错或 Canvas Type 未注册时同样 ack（否则会永久重投）；未 ack 的任务随后续每次 tick 重发，这正是 at-least-once 的实现方式。
- **禁用类型的任务被抑制但照常结算**：dispatcher 在调用 `onTaskFired` 前检查工作区 enablement，禁用时不通知、不写 state，但仍然 ack。因此一次性任务在禁用期间被消费掉，重复任务静默推进到下一周期，不会在盘上堆积或触发重投风暴。
- 任务数量按 Canvas Type 和工作区设上限。
- 不允许任意常驻后台 JavaScript。

Pomodoro 使用 `startedAt`、`durationMs` 等时间戳计算当前状态，结束通知用一次性调度任务实现，不每秒运行后台任务或保存状态。

## 13. 创建、复制、删除与 Undo/Redo

### 13.1 创建

1. 创建菜单 = 核心类型定义 + Registry 中已启用的 Canvas Type，动态派生。
2. 用户选择类型后，宿主校验 availability。
3. Bun 创建 Instance 并写入 `createInitialState()` 与派生的 presentation。
4. canvasStore 创建通用 Extension Node。
5. 节点创建失败时回收未引用实例。

创建菜单不再维护固定 `CanvasNodeKind` 联合。

### 13.2 复制和粘贴

- 复制节点时复制通用引用和实例导出。
- 粘贴时克隆 Instance，生成新 instanceId。
- 克隆保留业务 state 和 presentation。
- Folder child 中的引用使用相同算法递归处理。
- 禁用或未知类型的实例也能克隆，state 作为不透明数据复制。

### 13.3 Undo/Redo

两层历史，**语义沿用现状**（与当前 `widgetStore` 行为一致）：

- **Canvas History**：位置、尺寸、父子关系、节点创建和删除。
- **Instance History**：每实例独立的业务 state 历史（深度沿用现有 50）。

路由规则：键盘焦点位于某个扩展 Surface（或其 Detail Surface）内时，Cmd+Z / Cmd+Shift+Z 作用于该实例的历史；否则作用于画布历史。不做跨层统一时间线——那是高成本低收益的改造，如未来有需求另立 RFC。

```ts
interface ExtensionStateUpdate {
  expectedRevision?: number;
  state: unknown;
  history: 'record' | 'ephemeral';
}
```

`ephemeral` 用于运行时间显示等不应占据 Undo 栈、不应触发写盘的更新。`expectedRevision` 的 compare-and-set 语义见 §7.4；后台 `onTaskFired` handler 与用户正在编辑的 Surface 可能并发写同一实例，这是它真正开始起作用的场景。

### 13.4 删除与垃圾回收

删除节点时不立即删除 Instance 文件：

1. 从画布删除引用。
2. Instance 标记为可能孤立。
3. Undo 可恢复引用。
4. 清理器扫描正常画布、Trash、Folder child 和未迁移旧画布。
5. 确认无引用且超过宽限期后清理 Instance 和专属附件引用。

数据清理复用现有"未引用内容"设置流程（`cleanup.ts`），不在 canvasStore 中 fire-and-forget 删除文件。

## 14. 搜索、AI 与导出

### 14.1 搜索

搜索索引使用 `presentation.title` / `subtitle` / `plainText` 和 Canvas Type 标题。搜索不实例化 Surface。SearchResult 增加：

```ts
interface ExtensionSearchMetadata {
  canvasTypeId: string;
  instanceId: string;
  availability: ExtensionAvailability;
}
```

未知类型使用通用扩展图标。核心类型（card、sticky、folder、group）的搜索路径保持现状不变。

内置类型映射回 `image` / `asset` / `recording` / `link` / `widget` 等既有 search kind，只是宿主搜索结果的展示层适配，不进入 manifest 或扩展协议。新增内置 Canvas Type 时必须同步 `src/shared/extensions/builtinIds.ts` 的穷尽映射；未知或第三方类型保持 `extension` fallback。

### 14.2 AI 上下文

默认只向 AI 提供 presentation。类型贡献结构化 AI 上下文属于 RFC-2 的受权能力。

### 14.3 Canvas JSON

Canvas Export Schema 升级为 v2：

```ts
interface CanvasExportDocumentV2 {
  schema: 'ghostboard-canvas-export/v2';
  exportedAt: string;
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  extensionInstances?: Record<string, ExtensionInstanceRecord>;
  /** 仅记录 ID，无版本范围（第一版没有分发渠道，versionRange 无处解析） */
  referencedCanvasTypes?: string[];
}
```

导出格式 bump 到 v2 是有意的：现有导入器严格匹配 schema 字符串，旧版本遇到 v2 文件会**明确拒绝**，优于旧版本静默吞掉 `extensionInstances` 导致节点残废。v1 导入器永久保留。

导入时：

- 所有 instanceId 重新映射。
- 已启用类型正常恢复。
- 禁用或未知类型仍创建实例和 fallback 节点，不能像当前未知 Widget 那样丢弃。
- 附件打包作为后续 `.ghostboard-canvas` 压缩格式设计。

### 14.4 Markdown/纯文本导出

- 默认使用 Presentation 生成通用文本输出。
- Canvas Type 可注册结构化 exporter（内置、受信任）。
- 禁用或未知类型时仍可导出 `canvasTypeId`、title 和 plainText。

## 15. 设置与用户体验

设置中增加 Canvas Types 面板：

- 按分类列出全部内置 Canvas Type。
- 工作区级启用开关（per-type）。
- 显示当前工作区实例数量。
- 清除类型数据必须二次确认，并显示受影响实例数量。
- 迁移状态与失败列表（见 §18.5）。

节点 fallback 状态：

| 状态 | UI 行为 |
| --- | --- |
| Disabled | 显示 PreviewSurface（只读）或 Presentation Card，提供"启用"入口 |
| Unknown | 显示 canvasTypeId、保留数据、提示升级应用 |
| Crashed | Presentation Card + 重新加载 |
| Corrupted state | 显示恢复/导出原始状态，不影响画布打开 |

## 16. 内置 Extension Pack 拆分

Pack 只是代码组织单位，启用粒度是 Canvas Type：

```text
src/extensions/builtin/
  media/
    image/
    file/
    recording/
  productivity/
    checklist/
    pomodoro/
    reminder/
  web/
    link/
```

迁移映射（`sticky` 留在核心，不迁移；`pomodoro` 不改名）：

| 旧类型 | 新 Canvas Type |
| --- | --- |
| `image` | `ghostboard.media/image` |
| `asset` | `ghostboard.media/file` |
| `recording` | `ghostboard.media/recording` |
| `link` | `ghostboard.web/link` |
| `widget/checklist` | `ghostboard.productivity/checklist` |
| `widget/pomodoro` | `ghostboard.productivity/pomodoro` |
| `widget/reminder` | `ghostboard.productivity/reminder` |

第一轮迁移保持现有附件路径不变，只迁移节点引用和 metadata 所属。

## 17. 代码模块改造

### 17.1 新增共享协议

```text
src/shared/extensions/
  ids.ts
  instance.ts
  presentation.ts
  protocol.ts
```

要求：

- 不能导入 Bun-only 或 DOM-only 模块。
- Renderer 和 Bun 端共用同一份 envelope 类型与验证器。
- 类型设计保持可序列化，为 RFC-2 预留。

### 17.2 Bun 端

```text
src/bun/extensions/
  instanceStore.ts
  enablement.ts
  migration.ts
  scheduler.ts
  gc.ts
```

改造职责：

- `widgets.ts` 的通用 CRUD 迁入 `instanceStore.ts`。
- `index.ts` 中 Widget RPC 替换为 Extension Instance RPC；旧 RPC 在迁移窗口内保留 adapter。
- `search.ts` 对 extension 节点改读 presentation；核心类型路径不变。
- `cleanup.ts` 扫描通用 instance 引用。
- `manifest.ts` 支持 `extension` 节点（v1 增量，无版本 bump）。

### 17.3 Renderer 端

```text
src/mainview/extensions/
  registry.ts
  ExtensionNode.tsx
  ExtensionHostShell.tsx
  ExtensionFallback.tsx
  hostApi.ts

src/mainview/store/
  extensionInstanceStore.ts
```

改造职责：

- `widgetStore` 泛化为 `extensionInstanceStore`。
- `canvasConstants.nodeTypes` 最终只注册核心类型和通用 extension node；`readOnlyNodeTypes` 对应改为 PreviewSurface 分发。
- `canvasNodeRegistry` 分离 Core Node Spec 与动态 Canvas Type 声明。
- `canvasNodePredicates` 改为对节点引用解析 capability。
- `FolderChildPreview` 对 extension 节点渲染 PreviewSurface。
- `FocusedView` 使用 Detail Surface host，不再认识 Image/Asset/Link 等具体类型。
- 创建菜单合并 core definitions 与 enabled canvas types。

### 17.4 RPC

```ts
extensionEnablement.list
extensionEnablement.setEnabled

extensionInstance.create
extensionInstance.loadMany
extensionInstance.update
extensionInstance.clone
extensionInstance.exportRaw

extensionScheduler.schedule
extensionScheduler.cancel      // (instanceId, taskId) —— 任务按 (instanceId, id) 唯一
extensionScheduler.list
extensionScheduler.ack         // (deliveryId) —— 见 §12.3 的 at-least-once 结算
```

宿主 → renderer 的单向消息（不是请求-响应，因此不在上面的 RPC 列表里）：

```ts
extensionTaskFired  // payload: ExtensionTaskDelivery，见 src/shared/extensions/scheduling.ts
```

注意 `extensionScheduler.cancel` 的 RPC 签名带 `instanceId`，而 §12.1 里 Canvas Type 面向的 `host.scheduler.cancel(taskId)` 不带——owner 由 Host API 按绑定的实例注入，扩展无法取消别人的任务。

旧 `createWidget/saveWidget/cloneWidget/deleteWidget` 在迁移窗口内通过 adapter 调用新服务。

## 18. 旧数据迁移

### 18.1 总体策略

采用渐进迁移，不执行一次性破坏性重写：

1. 新版本先支持旧节点和 Extension Node 双读。
2. 旧节点加载时生成内存迁移计划。
3. 先原子写入 Extension Instance。
4. 再原子写入更新后的 manifest（schema 仍为 v1）。
5. 成功后保留旧 Widget 文件和附件，等待 GC。
6. 失败时继续使用旧节点，不写半迁移 manifest。
7. 未打开的旧画布保持原样，加载时再迁移。
8. 每种类型的迁移可通过内部开关独立启停（分阶段灰度自己的数据格式）。

### 18.2 确定性实例 ID

迁移必须幂等：

- Widget 使用旧 widgetId 派生 instanceId。
- Manifest inline 节点使用 `viewId + nodeId + type` 派生稳定 ID。
- Folder child 使用完整 child path 派生稳定 ID。
- 重复运行迁移不得创建多个实例。

### 18.3 各类型迁移

- Link：URL 和 unfurl metadata 移入 `state`，presentation 保存标题、URL 和摘要。
- Image：title、attachmentFile、thumbnailFile 等移入 `state`，附件文件保持原位。
- Asset：文件 metadata、waveform、preview excerpt 等移入 `state`。
- Recording：录音 metadata 和 waveform 移入 `state`，附件保持原位。
- Widget：读取旧 `.ghostboard/widgets/*.json`，包装成 Extension Instance envelope。
- Folder：递归迁移 children，具体类型 child 替换为通用 extension 引用。
- Template：内置模板同步升级，保留旧导入器。

### 18.4 Schema 兼容

- 画布 manifest 保持 `ghostboard-canvas/v1`，`extension` 节点为增量修改。
- `ghostboard-canvas-export/v1` 保留 importer；新导出使用 v2。
- Widget `ghostboard-widget/v1` 读取器在迁移窗口后仍保留至少两个稳定大版本。
- 未知 Extension Instance 字段必须 round-trip 保留。

### 18.5 安全与恢复

- 首次工作区迁移前写 migration journal。
- 不删除旧数据作为迁移成功条件。
- 每个 manifest 独立提交，避免一个损坏画布阻塞整个工作区。
- 设置页提供迁移状态、失败数量和原始数据导出。
- 迁移 fixture 必须覆盖顶层节点、Folder child、Group parent、Trash 和 Canvas Export。

### 18.6 回滚与向前兼容

本产品有自动更新（`Updater.checkForUpdate`），必须考虑"升级 → 数据被迁移 → 回滚旧版本"的场景：

- manifest 保持 v1 是本节的核心手段：回滚后旧版本仍能打开工作区，`extension` 节点作为未知类型处理。
- **Phase 0 必须实机验证**：当前已发布版本打开含 `extension` 节点的 manifest 时，(a) React Flow 渲染为默认节点而不崩溃；(b) 保存 manifest 时未知节点及其 data 原样 round-trip，不被剥离。若 (b) 不成立，需要先在当前版本发布一个"未知节点保护"补丁，并把它设为迁移的最低版本门槛（updater floor），之后才能开启迁移。
- 旧 Widget 文件在迁移后保留（§18.1），回滚版本的 widget 功能继续可用；迁移开关支持按类型延迟，缩小单次回滚的影响面。
- Canvas Export v2 被旧版本明确拒绝（§14.3），不产生静默数据损失。

## 19. 性能预算

- 单实例 JSON state：默认不超过 1 MiB。
- Presentation plainText：不超过 32 KiB，超限截断。
- 调度任务数量按类型和工作区设上限。
- resize 更新节流，不将每个 pointer move 写入状态。

基准场景（Phase 3 建立，含**冷启动**）：

- **500 节点画布（其中 200 个 extension 实例）冷启动到可交互，不劣于现状 20%。**
- 100 个 Extension Node 同屏渲染与滚动帧率。
- Folder 中 50 个扩展 child 的展开耗时。
- 20 个并发计时实例的 CPU 占用。
- 快速切换画布和主题。

冷启动基准不达标时启用 §7.5 的聚合文件备选方案。

## 20. 测试策略

### 20.1 单元测试

- ID、envelope 解析与 unknown-field round-trip。
- Registry 注册断言、enablement 和 availability。
- 尺寸约束和 requestResize clamp。
- `buildPresentation` 派生、限制和纯文本清理。
- Clone、GC 和引用扫描。
- 每一种旧类型的迁移函数。
- Scheduler 触发、合并与重启恢复。

### 20.2 组件测试

- ExtensionHostShell 选择、拖拽区和 resize。
- Disabled / Unknown / Crashed / Corrupted fallback。
- Canvas / Detail / Preview Surface 生命周期。
- Folder 中只渲染 PreviewSurface。
- 创建菜单随 enablement 动态更新。

### 20.3 集成测试

- 创建 → 更新 → 保存 → 重启 → 恢复。
- 复制/粘贴生成独立实例。
- 删除 → Undo → 恢复。
- 禁用 → 重启 → 启用 → 恢复。
- 未知类型 Canvas JSON 导入后保留 fallback。
- Widget sidecar 自动迁移与幂等重跑。
- Folder child、Group parent 和跨 View 移动。
- Search / AI / Export 不实例化 Surface。
- Scheduler 在应用重启后恢复，过期任务合并触发。
- 回滚模拟：迁移后的 manifest 被"不认识 extension 类型"的加载路径打开并保存，数据无损。

### 20.4 既有测试迁移

约 69 个测试文件涉及节点类型词汇。原则：

- 每个 Phase 的退出条件包含"该阶段触及的既有测试全部绿"，不允许跳过累积。
- 迁移某类型时同步改写其测试，不留双份。
- 行为矩阵（Phase 0）作为改写时的对照基准，防止静默改变行为。

### 20.5 迁移 Fixture

至少保存以下真实 fixture：

- 每一种旧内容类型的顶层节点。
- 每一种可进入 Folder 的 child。
- Group 内节点。
- 已删除 View/Trash 引用。
- 损坏 Widget 和缺失附件。
- v1 Canvas JSON。
- 含运行时字段的旧 manifest。

## 21. 分阶段实施计划

每一阶段保持主分支可运行、旧工作区可打开，并以独立 PR 合并。

### Phase 0：RFC 冻结、行为矩阵与兼容性验证

交付物：

- 冻结本 RFC 的 v1 contract。
- 现有类型行为矩阵：尺寸、打开、Folder、Group、Preview、Search、Export。
- **回滚验证**（§18.6）：已发布版本对未知节点的渲染与 round-trip 行为；必要时先发保护补丁。
- 确定 instance 文件 schema 与 manifest 增量格式。

退出条件：

- 回滚路径有明确结论（可直接迁移，或需要 updater floor）。
- 所有迁移类型都有映射和 fixture 计划。

### Phase 1：共享协议与 Registry

交付物：

- `src/shared/extensions/*`。
- `CanvasTypeRegistry` 和工作区 per-type enablement。
- 设置页最小 Canvas Types 面板。
- 一个 Counter Demo Canvas Type（不随发布启用）。

退出条件：

- 创建菜单可动态显示/隐藏 Demo。
- 禁用 Demo 不丢实例。
- Registry 不依赖具体业务类型联合。

### Phase 2：通用 Instance Store 与 Host Shell

交付物：

- Bun instance CRUD/RPC 与批量加载。
- `extensionInstanceStore`。
- `ExtensionNode`、Host Shell、fallback 和 crash boundary。
- 通用创建、保存、克隆和删除引用。
- 两层 Undo（沿用现状语义，§13.3）。

退出条件：

- Demo 完成创建、编辑、保存、重启、复制、删除和 Undo。
- Unknown 类型实例可无损 round-trip。

### Phase 3：Presentation、Preview 与投影系统

交付物：

- `buildPresentation` 派生与持久化。
- PreviewSurface 接入 Folder、Library、模板。
- Search、AI、Markdown fallback 接入 Presentation。
- Canvas Export v2 和 unknown type import。
- 冷启动与渲染性能基准（§19）。

退出条件：

- 类型禁用后仍可搜索、预览和导出。
- 冷启动基准达标（或触发聚合文件备选方案决策）。

### Phase 4：迁移 Widget 系统

迁移顺序：Checklist → Pomodoro → Reminder。

交付物：

- `ghostboard.productivity` Pack。
- Widget v1 adapter 和迁移器。
- Scheduler/Notifications 宿主能力（含 §12.3 语义）。
- 删除渲染端固定 `WidgetKind` 分支。

> **验收更正（2026-09-11）**：Phase 4 当初按"§12.3 语义已交付"通过验收，但插件系统整改复核发现并非如此——`tickExtensionTasks()` 只在 `loadCanvas` 时调用一次且返回值被丢弃，到期任务从不投递；Reminder 实际靠 mounted Surface 的 render effect 触发，应用没开着或节点不在当前画布上就不响。§12.3 的投递语义在 2026-09-11 的 H1 整改中才真正落地（宿主驱动 tick + `extensionTaskFired` + ack 结算 + `onTaskFired`）。教训是"宿主能力已接入"不等于"语义已生效"，此类交付物的退出条件应当要求一条端到端的重启恢复测试，而不是接口存在即算通过。

退出条件：

- 三种 Widget 行为与迁移前一致（对照行为矩阵）。
- 旧 `.ghostboard/widgets/` 数据可恢复，迁移幂等。
- 禁用类型不删除画布节点。

### Phase 5：迁移 Link

交付物：

- `ghostboard.web/link`，unfurl 走 Host API network。
- 删除对应 FocusedView、FolderPreview、Search 类型分支。

退出条件：

- 创建、Folder、Group、详情打开、搜索和导出行为无回退。

### Phase 6：迁移媒体类型

迁移顺序：Image → File/Asset → Recording。

交付物：

- `ghostboard.media` Pack。
- Asset Handle、附件导入、缩略图、打开文件和麦克风能力接入 Host API。
- 附件 GC 与 Instance 引用关联。
- 删除旧具体 React Flow node 注册。

退出条件：

- 核心 `nodeTypes` 只剩 `card` / `sticky` / `folder` / `group` / `extension`（及内部动画类型）。
- 旧附件无需移动即可正常访问。

## 22. 建议 PR 拆分

1. `refactor: add shared extension contracts`
2. `feat: add canvas type registry and per-type enablement`
3. `feat: add generic extension instance persistence`
4. `feat: add extension host shell and demo canvas type`
5. `feat: derive and persist extension presentation`
6. `refactor: make folder previews use preview surfaces`
7. `refactor: make search and export extension-aware`
8. `feat: add canvas export v2 with instance payloads`
9. `refactor: migrate widgets to productivity canvas types`
10. `refactor: migrate link to web canvas type`
11. `feat: route asset host capabilities through host api`
12. `refactor: migrate media nodes to canvas types`

不要在单个 PR 中同时迁移多种媒体类型、修改导出 schema 和删除旧兼容代码。

## 23. 验收标准

1. 新增 Built-in Canvas Type 只需新增扩展目录和注册信息，不修改 Host 类型分支。
2. 核心 React Flow 用户内容类型只剩 `card`、`sticky`、`folder`、`group`、`extension`。
3. 创建菜单完全由 Core 定义和已启用 Canvas Type 派生。
4. 扩展节点的拖拽、resize、连接、Folder/Group 行为由 Host Shell 控制。
5. Folder、Library、Search 和 MiniMap 只使用 PreviewSurface 或 Presentation，不实例化 CanvasSurface。
6. 禁用和未知类型都不丢失节点或实例状态。
7. Unknown 类型实例可经过加载、保存、复制和 Canvas JSON 导出而无损 round-trip。
8. Search、AI 和基础导出只依赖宿主持久化的 Presentation。
9. 旧 Widget、Link、Image、Asset、Recording 和 Folder child 可渐进迁移，迁移幂等且可按类型独立启停。
10. 迁移后的工作区被回滚版本打开时不丢数据（Phase 0 验证的路径）。
11. Surface 代码不 import canvasStore、bridge 或 `src/bun/*`（lint 强制），保证 RFC-2 沙箱化时协议不需重做。

## 24. 风险与缓解

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| 旧版本剥离未知 manifest 节点 | 回滚丢数据 | Phase 0 实机验证；必要时先发保护补丁并设 updater floor |
| 旧数据迁移失败 | 用户内容不可用 | 双读、实例先写、manifest 后写、保留旧文件、迁移 journal、按类型开关 |
| 每实例一文件冷启动退化 | 大画布打开变慢 | loadMany 批量 RPC、并行读、冷启动基准、聚合文件备选方案 |
| 两层 Undo 语义混淆 | 用户困惑 | 沿用现状语义并写入行为矩阵，不新造时间线 |
| Canvas Type 声明设计不足 | 后续频繁破坏兼容 | envelope 版本化；未知字段 round-trip；RFC-2 兼容性约束前置（§23 第 11 条） |
| 内置类型绕过 Host API | 形成两套架构 | lint 禁止 Surface 直接 import store/bridge；contract 测试 |
| 文件引用泄漏 | workspace 膨胀 | 引用扫描 + 宽限期 GC，不在删除节点时立即物理删除 |
| 测试迁移被低估 | 排期失控 | 单列估算（§25）；每 Phase 退出条件含既有测试全绿 |

## 25. 工作量级别

按一名熟悉代码库的开发者估算，**含对应范围的测试迁移**（约 69 个测试文件分摊到各阶段）：

| 范围 | 粗略量级 |
| --- | --- |
| Phase 0：RFC 冻结、行为矩阵、回滚验证 | 0.5–1 周 |
| Phase 1：协议、Registry、enablement、Demo | 1–1.5 周 |
| Phase 2：Instance Store、Host Shell、Undo | 1.5–2.5 周 |
| Phase 3：Presentation、Preview、Search、Export、基准 | 1.5–2.5 周 |
| Phase 4：Widget 迁移 + Scheduler | 1–2 周 |
| Phase 5：Link 迁移 | 0.5–1 周 |
| Phase 6：媒体迁移 + Asset API | 2–3 周 |

合计约 **8–13.5 周**。相比 v1 草案对"内置平台"的 4–8 周估算，此数字包含了测试迁移和回滚验证，且删除了 Snapshot/沙箱前置成本后仍偏保守——跨系统改造中估算宁可偏高。

## 26. 待决策项

实施前需要明确（较 v1 草案大幅缩减）。2026-08-19 冻结如下：

1. **`extensions.json` 独立于 `settings.json`**：工作区本地文件 `.ghostboard/extensions.json`，不走现有设置同步。
2. **默认不允许进入 Folder**：`canEnterFolder` 默认 `false`，需要的类型显式开启。Demo Counter 设为 `false`。
3. **Counter Demo 仅 dev 注册**：`import.meta.env.DEV` 才 `register`，正式构建不出现在创建菜单。
4. **聚合实例文件阈值**：仍待 Phase 3 冷启动基准后再定。

Phase 0 对照文档：

- 行为矩阵：`canvas-extension-behavior-matrix.md`
- 回滚结论：`canvas-extension-rollback.md`（当前版本已可保留未知节点，无需 updater floor）

## 27. 推荐的第一步

在修改现有节点前，先完成一个最小纵切 Counter Canvas Type：

1. Registry 注册（TS manifest）。
2. 创建通用 Instance。
3. 画布渲染与 Host Shell 拖拽、resize。
4. State update、两层 Undo。
5. `buildPresentation` 派生与搜索命中。
6. PreviewSurface 在 Folder 中渲染。
7. 禁用、重启和重新启用。
8. Canvas JSON 导出和导入。
9. Unknown 类型 round-trip。

只有这条纵切完整通过后，才开始迁移 Checklist。这样可以在成本最低时验证协议是否覆盖真实画布生命周期，避免迁移到 Image/Asset 时才发现数据或缩略图模型需要重做。

## 28. 与 RFC-2 的关系

RFC-2（第三方扩展平台）依赖本 RFC 完成，且**只有在出现真实的第三方开发需求信号后才立项**。本 RFC 为其预留的兼容性约束：

- Instance envelope、presentation、Host API 方法形状全部可序列化，可无损搬到消息桥之上。
- Surface 与宿主 store/bridge 的隔离由 lint 强制，内置组件迁到受信任 adapter 无需改协议。
- `capabilities` 声明已存在于 manifest，RFC-2 补充运行时授权即可。
- Availability 的 `unknown` 状态与 RFC-2 的 `missing` / `incompatible` 语义兼容。
- 已落地的上下文菜单机制保持声明式：宿主按 `openBehavior` / `interactions` 组装通用动作，类型通过 `menuActions` 贡献受信任 handler；handler 依赖 Host API 与实例通道而非 Surface 直连宿主 store。第三方运行时仍需在公开插件方案中把 label/icon/handler 转成可传输声明并实施权限校验，不能把内置 TS 函数对象直接当作公开协议。

RFC-2 需要独立解决、本 RFC 刻意不碰的问题：沙箱容器选型、**Snapshot 截图与隔离的矛盾**、权限确认 UX、签名与分发。其中沙箱容器与细粒度权限已于 2026-09-09 被高信任模型放弃（同 realm 运行后截图矛盾也不再存在），签名与分发由 [高信任插件系统改造方案](./trusted-plugin-platform.md) §8 处理；旧 RFC-2 与 v2 方案见 `../Archive/`，仅保留历史背景。
