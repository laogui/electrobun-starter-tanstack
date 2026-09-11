# GhostBoard 高信任插件系统改造方案

日期：2026-09-09（同日修订：去掉首版 Bun 后端入口、补充装载机制、能力声明与签名更新；同日采纳）  
状态：**已采纳；T0、T1（含追加 A1–A3）与现行 T2 范围均已通过 macOS arm64 发行包验证，旧运行时清理完成；下一阶段为 T3 导入器与分发**。T2 已覆盖 A4、笔记事务 / 选区 / 正文同步、detached 创建、自定义画布类型、冲突恢复 UI，以及 session 级统一原生 / 画布 / 插件笔记历史。本文是公开插件系统的现行实施设计，接替已归档的 [公开插件系统整改方案 v2](../Archive/public-plugin-platform-redesign.md)。仅 §10 中有验收记录的阶段视为已实现，其他章节仍是目标设计。

范围：公开插件的开发、运行、安装、生命周期、数据接口和交付验收。

追加：[追加 1 — 借鉴 bb 的六项补充](./trusted-plugin-platform-addendum-1.md)（2026-09-09）。追加条目只落在 T1 及之后，不改动已完成的 T0 与清理；与本文冲突处以追加为准，对应关系见追加 §7。

## 1. 决策摘要

GhostBoard 拟采用**高信任插件模型：与宿主同 realm 运行的 JavaScript / React 前端 + 宿主 SDK 服务 + TypeScript SDK + 开放扩展点**。Bun 后端入口不进入首版，由真实插件需求驱动后再加入。

第三方插件由用户主动安装并启用，按具有较高本机能力的应用扩展对待。产品优先追求插件灵活性和极低的开发门槛，不提供细粒度权限沙箱，不承诺限制已启用插件的网络、文件或宿主页面访问。

架构参考 VS Code 的“以 API 面为契约、不做权限沙箱”的扩展模型，bb 的 typed SDK 与扩展注册组织方式，以及 Obsidian 自定义视图的 DOM 开放程度。GhostBoard 自行设计资料与画布 API，不以复制另一个产品的全部接口为目标。

本次选型不以兼容现有运行器、保留既有代码或降低重写量为前提。现有代码仅在符合新架构且经过验证时复用。

### 已明确的产品前提

- 插件灵活性与第三方开发体验优先。
- 用户自行决定安装来源，并承担运行第三方代码的风险。
- 可以重写插件实现，不以旧实现的投入决定新方案。
- 不再将“不受信任代码隔离”“未授权不得联网”作为插件平台交付目标。

### 本文建议确定的架构选择

- 前端插件直接进入宿主 renderer，与宿主 JavaScript 同 realm 运行；React 为推荐路径，普通 JavaScript / DOM 为基础能力。
- 插件模块由宿主本地 HTTP 服务挂出，通过 import map 解析 `react`、`react-dom`、`@ghostboard/sdk` 等共享依赖到宿主实例。
- 文件、网络等超出 renderer 能力的操作经 SDK 由宿主 Bun 进程代理执行（`files`、`net`），不要求插件自带后端。
- 首版不提供 Bun 后端入口。后续如有真实需求，以每插件一个 Bun `Worker` 的形式加入；独立子进程仅在 Worker 被实测证明不足时才考虑。
- manifest 保留一个不做强制的 `capabilities` 声明，仅用于安装页展示插件自称会使用的能力。
- 更新必须由作者自持密钥签名（TOFU），公钥随 manifest 首次安装时固定；不需要账号、CA 或官方审核。
- 保留生命周期管理、内容事务、缺失插件时的数据保留和更新恢复，这些属于可靠性目标。

## 2. 目标与范围

### 2.1 开发者体验目标

具有基础 Web 开发经验的作者，应能在主仓库之外创建插件，无需理解 GhostBoard 内部 store、消息信封或文件布局。

最小插件由 manifest 和一个 JavaScript 文件组成，不要求 TypeScript、React、后端入口或构建工具。有复杂界面时，作者可直接使用 React、CSS 和兼容的第三方组件库。

提供创建模板、连接开发目录、自动重载、源码错误定位、打包和独立 SDK。目标是让新开发者在 15 分钟内完成第一个可运行插件；该目标需要通过外部开发者试用验证，不能以模板能够编译代替。

### 2.2 首版正式范围

| 能力 | 首版要求 |
| --- | --- |
| 命令 | 注册命令、菜单入口、快捷键；可访问选区与内容 API |
| 面板 | 注册 React 或 DOM 界面，在宿主侧栏或主区域打开 |
| 画布类型 | 自定义卡片渲染、编辑、状态、摘要及缺失插件时的展示 |
| 导入器 | 选择文件、配置映射、预览、提交、取消与失败恢复 |
| 设置 | 简单字段自动生成设置页，也可提供自定义界面 |
| 事件与任务 | 订阅宿主事件，运行应用存续期间的插件任务 |
| 宿主服务 | SDK 提供文件选择/读写、代理 `fetch`、工作区与设置存储；插件端计算用 Web Worker |
| 开发与分发 | 本地开发目录、ZIP / HTTPS 安装、签名更新及回退 |

首版不建设交易、评分和推荐市场，不强制账号、付费证书或官方审核。Bun 后端入口、应用退出后持续运行的系统服务、原生二进制依赖的跨平台分发、完整编辑器内部扩展 API 不作为首版保证。

首版四类贡献按 T1 命令 + 面板、T2 画布类型、T3 导入器的顺序验收：命令与面板先验证装载模型，画布类型是本产品最具差异化且最难的扩展点，导入器依赖 SDK 文件服务成型后再做。

这些范围限制不构成安全边界。高权限插件可能自行实现额外能力，但宿主不因此承诺其兼容性和支持范围。

## 3. 信任与可靠性边界

### 3.1 安装与启用

首次启用时使用一次清晰的高信任说明，告知插件可能访问工作区、本机文件和网络。安装页面展示来源、版本、作者自述、身份是否验证，以及 manifest 中 `capabilities` 自称会使用的能力（如 `network`、`files`）。用户确认安装并启用后，不再按选区、正文、网络等能力逐项授权。

`capabilities` 只是作者自述，宿主不据此限制任何调用；它的作用是让用户在一次确认前看到“这个插件说它要联网、要读文件”。未声明却使用相应能力不会被拦截，但属于可在诊断中记录并提示的行为。

下载和解包阶段不运行包内代码，也不执行依赖安装脚本。最终安装物必须能够直接运行，用户无需安装 Node、Bun 或编译工具。

安装在应用级管理，启用可按工作区配置。打开工作区不会自动执行其中推荐的插件；工作区配置用于管理使用体验，**不承诺约束高权限插件能够访问的数据范围**。

### 3.2 明确不提供的保证

- 同 realm 前端插件不是安全沙箱，可能读取页面状态、改变 DOM、经宿主代理发起网络请求或影响应用响应。
- SDK 的 `files` / `net` 宿主服务以宿主进程权限执行，不做路径或域名白名单；它们是接口，不是访问控制。
- `capabilities` 声明、SDK、RPC 校验、插件 ID 和工作区参数用于展示、接口正确性与归属管理，不是针对恶意插件的访问控制。
- 停用会清理宿主管理的资源；任意第三方代码造成的页面修改、外部副作用或自行创建的 Worker，不保证全部可撤销。
- 签名用于来源连续性（同一作者才能更新同一插件），摘要用于包完整性；二者都不代表插件代码安全。

### 3.3 仍然必须实现的可靠性

包路径校验、防止解压覆盖任意位置、损坏包拒绝、版本兼容检查和安装恢复继续保留。用户接受执行风险不意味着安装器应容忍意外损坏。

通过正式内容 API 进行的操作，应有清晰的冲突、批次、撤销和持久化语义。插件直接修改文件可绕过这些机制；官方示例优先使用 SDK。

提供启动时跳过第三方插件的安全模式，使用户可管理故障插件。不要把 React 错误边界描述为可以防止死循环或任意 DOM 破坏。

## 4. 运行架构

```text
插件包（应用级安装目录，bundle 之外）
  ├─ manifest.json
  ├─ app.js       命令、React / DOM 界面、前端事件；可再 import 包内相对模块
  └─ CSS / 静态资源
          │
          ▼
宿主本地 HTTP 服务（复用 localHttpServer，bearer token + CORS）
  http://127.0.0.1:<port>/plugins/<id>/<version>/app.js
          │
          ▼  import()
宿主 renderer（views://mainview，同一 realm）
  ├─ import map：react / react-dom / react/jsx-runtime / @ghostboard/sdk → 宿主稳定模块
  ├─ 命令 / 面板 / 菜单 / 画布注册表
  └─ 插件挂载点：面板 root、卡片 root、工具栏 slot（各自独立 createRoot）
          │
          ▼  Electrobun RPC / 本地 HTTP
宿主 Bun 主进程（SDK 服务）
  ├─ content / canvas / workspace / settings / history
  └─ files（选择、读写）、net（代理 fetch）

后续可选：Bun Worker（每插件一个）承载需要 Bun 原生能力的后端入口
```

### 4.1 前端装载

- 插件文件在用户可写的应用级目录，不在应用 bundle 内，`views://` 无法直接覆盖。宿主用已有的本地 HTTP 服务把已启用插件的目录挂出，renderer 以 `import()` 加载入口。跨 origin 的 `import()` 仍在宿主 realm 内执行，拥有与宿主脚本完全相同的页面能力；本文所称“同 realm”即指此，不依赖 origin 相同。
- 宿主 `index.html` 内置 `<script type="importmap">`，把 `react`、`react-dom`、`react/jsx-runtime`、`@ghostboard/sdk`、`@ghostboard/sdk/react` 映射到宿主导出的稳定模块 URL。这是无构建 JavaScript 插件能直接 `import '@ghostboard/sdk'` 的唯一机制，也是避免重复 React 实例的唯一机制。
- 为此 Vite 构建需要把 React 与 SDK 输出为名称稳定、不带 hash 的独立 chunk（manual chunks），并确保宿主自身也从同一 chunk 导入。import map 必须在任何模块执行前存在，运行时不能追加。
- 模块请求不能自行附加 `Authorization` header，入口 URL 的 query token 也不会传给包内相对 import。插件静态目录使用 `/plugins/<每次启动的 bearer token>/<id>/<version>/` 路径前缀，使相对模块和资源请求继承 token；其他宿主服务继续使用 Authorization header。此 token 只保护本地服务免于无凭据访问，不是插件权限边界；不得写入持久日志或向外部请求发送。
- 插件构建模板默认将上述包标记为 external；其他依赖打包进插件，不要求用户安装 npm 依赖。
- `views://` 为自定义 scheme，其 origin 在 WebView 中通常按 opaque 处理，插件在前端直接 `fetch` 第三方接口会被 CORS 拦截。因此 SDK 提供宿主代理的 `net.fetch`；这不是限制而是能力补足。
- 共享依赖涉及版本兼容，宿主需发布支持范围，构建和加载时给出明确错误。不能让作者自行解决重复 React、隐式依赖宿主包版本等问题。

- 模块地址以 §4.1 的带 token 目录前缀为准，图中的 URL 省略该凭据段。

### 4.2 前端运行与 DOM 边界

- 推荐 React 组件注册，支持普通 DOM 的 `mount(element)` / dispose 接口。
- 每个面板、卡片体和工具栏 slot 由宿主提供一个专属挂载点，并为 React 插件创建独立的 `createRoot`，不把插件树渲染进宿主 React 树。宿主 hooks（`useSelection` 等）基于订阅 API 用 `useSyncExternalStore` 实现，不依赖宿主 React context 继承。这样插件渲染错误不会打断宿主树，停用时 `root.unmount()` 即可收尾。
- **挂载点内随意，挂载点外不支持。** 宿主 UI 由 React 19、Zustand、BlockNote 与 xyflow 管理，插件修改挂载点以外的宿主 DOM 会在下一次渲染被覆盖，此类问题不视为宿主缺陷，文档需明确说明。这与 Obsidian `contentEl` 的实际边界一致。
- 提供 `--gb-*` 主题变量、模板内可复制修改的基础组件源码和宿主 hooks，使用与否由作者决定。宿主 UI 组件不作为 SDK/import map 的共享 API。允许自定义 CSS，推荐局部样式，避免无意污染宿主。
- DOM 挂载适配不同框架即可，首版无需发布多套框架 SDK。
- 插件端重计算用 Web Worker；SDK 不为此提供额外机制。

### 4.3 后端入口（延后）

首版不提供 Bun 后端入口。原本设想由后端承担的三类需求已有前端路径：文件处理走 SDK `files`，网络走 SDK `net.fetch`，计算走 Web Worker。这去掉了打包第二个运行时入口、设计前后端 RPC 和三平台验证子进程生命周期的成本。

当出现只有 Bun 原生能力才能满足的真实插件需求时，按下面顺序加入：

1. 每个后端插件一个 Bun `Worker`，运行在宿主主进程内。Worker 有独立事件循环，一个插件死循环不阻塞其他插件；宿主可 `terminate()` 直接回收；不需要额外打包入口。
2. 仅当 Worker 被实测证明不足（例如需要独立的原生模块加载或崩溃隔离）时，才考虑独立子进程，并单独做发行包验证。

无论哪种形式，后端入口都不是安全边界，其权限等于宿主进程权限。

### 4.4 生命周期与工作区

- 插件激活时获得由宿主创建的上下文；注册命令、面板和事件后自动登记清理责任。
- 明确区分安装记录、已加载模块、工作区激活实例、打开的视图实例。
- 关闭面板只销毁该视图的 React root，不停用插件命令或事件订阅。
- 停用、工作区退出和成功重载交接触发对应实例的清理；重载候选失败保留旧实例，见追加 1 §2。插件可登记自有资源的 disposer。宿主同时终止该插件创建并经 SDK 登记的 Web Worker。
- 宿主服务操作绑定明确的工作区上下文，异步操作不因“当前工作区”变化而写入错误位置。
- 无法可靠清理的前端副作用可要求重新加载窗口；安全模式必须在插件加载前生效。

## 5. 包结构与开发体验

### 5.1 最小包

以下 manifest 字段与 API 均为拟议设计，最终命名在第一阶段冻结，不表示当前已发布。

```text
hello-plugin/
  manifest.json
  app.js
```

```json
{
  "manifestVersion": 2,
  "id": "example.hello",
  "name": "Hello GhostBoard",
  "version": "0.1.0",
  "engines": { "ghostboard": ">=1.0.0 <2.0.0" },
  "entrypoints": { "app": "app.js" },
  "capabilities": ["network"],
  "publicKey": "ed25519:base64...",
  "update": { "url": "https://example.com/hello/latest.json" }
}
```

示例中的宿主版本范围仅演示格式，不表示当前产品或 SDK 版本。`manifestVersion: 2` 标识高信任契约；旧的 `manifestVersion: 1`（`ghostboard.plugin.json`、QuickJS 命令契约）一律拒绝加载，见 §9。

字段职责：

| 字段 | 职责 | 是否强制执行 |
| --- | --- | --- |
| `id`、`name`、`version`、`engines` | 身份、展示、兼容性检查 | 兼容性检查强制 |
| `entrypoints.app` | 前端入口，必填 | 缺失则拒绝安装 |
| `capabilities` | 作者自述会使用的能力：`network`、`files`、`clipboard` 等枚举 | 仅展示，不强制 |
| `publicKey` | 作者自持 ed25519 公钥，首次安装时固定 | 更新校验强制，见 §8 |
| `update.url` | 更新描述地址，安装时固定 | 更新来源强制 |

manifest 不包含用于强制执行的细粒度权限表。贡献在运行时通过 SDK 注册，避免同一命令既在 manifest 声明、又在代码重复定义。

### 5.2 简单命令

```js
import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  setup(app) {
    app.commands.register({
      id: 'normalize-titles',
      title: '整理选中资料的标题',
      async run() {
        const selected = await app.selection.get();
        const items = selected.filter((item) => item.revision !== null);
        if (items.length > 100) throw new Error('一次最多整理 100 篇可写笔记');
        if (!items.length) return;
        await app.content.updateMany(
          items.map((item) => ({
            id: item.id,
            expectedRevision: item.revision,
            changes: { title: item.title.trim().replace(/\s+/g, ' ') },
          })),
          { label: '整理标题' },
        );
      },
    });
  },
});
```

对于无构建 JavaScript，`@ghostboard/sdk` 由宿主 import map 解析（§4.1），作者不需要任何打包配置。不能一面宣称不需要构建，一面要求作者手动配置打包器才能导入 SDK。

`selection.get()` 已提供当前画布中选中笔记的去重持久内容快照；`selection.getPlacements()` 独立返回放置项身份。选择文件夹 / 分组不递归扩展子项，非笔记内容和缺失记录不进入笔记快照，legacy Markdown 可读但不可写。调用时固定所选 note ID，revision 来自随后的同一次宿主读取；读取完成后发生的新编辑仍由 `expectedRevision` 明确拒绝。批量 API 内部处理操作 ID、事务和撤销。

### 5.3 React 面板

```tsx
import { definePlugin } from '@ghostboard/sdk';
import { useSelection } from '@ghostboard/sdk/react';

function SelectionPanel() {
  const items = useSelection();
  return (
    <section>
      <h2>已选中 {items.length} 项</h2>
      {items.map((item) => <div key={item.id}>{item.title}</div>)}
    </section>
  );
}

export default definePlugin({
  setup(app) {
    app.panels.register({
      id: 'selection',
      title: '选中资料',
      component: SelectionPanel,
    });
  },
});
```

React 模板预置构建配置，将 `react`、`react-dom`、`@ghostboard/sdk` 标记为 external。宿主为该面板创建独立 `createRoot` 挂载 `SelectionPanel`；`useSelection` 等 hooks 基于 SDK 订阅接口实现，不依赖宿主 React context，作者也不需要导入宿主私有 store。

### 5.4 工具链

建议提供以下用户路径，命令名称在实现时确定：

1. 创建插件：选择命令、面板、导入器或画布卡片模板。
2. 连接开发目录：在运行中的 GhostBoard 注册目录，一次连接后自动重载。
3. 查看诊断：按插件显示日志、构建错误、激活失败和源码位置。
4. 打包与签名：生成包含编译结果、依赖和静态资源的可安装 ZIP，用作者密钥签名；首次运行时生成并保存密钥对。
5. 安装验证：在没有开发工具的应用环境中完成一次真实安装。

前端重载采用追加 1 §2 的候选准备、成功交接模型：先以新 generation URL 导入并暂存候选 `setup` 的注册，成功后才清理旧实例并发布新注册；失败时旧实例原样继续运行。旧模块的闭包无法强制释放，开发模式应提示多次重载后可重新加载窗口。

### 5.5 T1 实施冻结范围（2026-09-09）

T1 先冻结命令和面板的最小公开契约，不将 §6 的全部领域一次性发布。独立 `@ghostboard/sdk` 包导出 `definePlugin({ setup(app) })` 及 TypeScript 类型；`setup` 可返回 disposer 或其 Promise。上下文包含 `pluginId`、固定的 `workspaceId`、`commands.register({ id, title, shortcut?, enabled?, run })`、`panels.register({ id, title, component? | mount? })`、`panels.open(id)`、`panels.close(id)`、`onCleanup(disposer)`、`workers.track(worker)`。所有注册返回 disposer，并由宿主在失败激活、停用或重载时兜底清理。命令可用状态为运行时回调，不恢复旧 manifest 权限或命令可用性协议。

- 面板通过宿主命令/面板菜单打开，React 组件与 DOM `mount(element)` 二选一。关闭面板不注销命令，重新打开创建新 root；面板错误可关闭后重开。快捷键默认不截获输入框中的编辑按键；宿主现有快捷键优先。
- 本地开发目录通过设置页选择、审阅、连接，并经过高信任启用确认；连接不执行代码。登记保存在应用目录，启用仍按工作区保存。修改代码不要求重复授权；manifest 身份改变或变为 v1 时拒绝候选并给出诊断，已运行的上一合法实例保持不变，可从管理页明确停用。
- 重载 URL 使用 `/plugins/<launch-token>/<id>/<version>/<generation>/...`，让整个相对模块图继承 generation。仅给入口加 query 会继续复用相对依赖，不能作为完整重载实现。主进程保留旧实例及候选的不可变模块图，renderer 完成相关实例清理后通过 `/plugins/release` 释放对应图；明确停用时全部撤下。候选失败不清理旧实例。上下文追加递增数字 `generation` 与所属实例的 `signal`，与 URL 中的 UUID 区分。
- T1 诊断保留插件 ID、阶段、错误栈/源码位置；显示插件未启用、加载中、运行中、失败状态和重载操作。自动重载通过开发目录文件变化触发，不依赖修改宿主。
- T1 模板提供无构建 JS 命令 + DOM 面板，以及共享宿主 React 的面板。SDK/模板是可独立分发的文件，不引用宿主私有 store。内容快照/`useSelection` 与通用内容 API 在 T2 冻结，完整 `files` 流程在 T3；T0 的 `net`/`files` 实验接口不冒充正式 SDK。`@ghostboard/sdk/react` 的业务 hooks 随 T2 发布。

## 6. SDK 与扩展点

| 接口领域 | 核心能力 | 设计约束 |
| --- | --- | --- |
| commands | 命令、快捷键、可用状态 | 多入口复用同一命令 |
| panels | React / DOM 视图、打开与关闭 | 视图生命周期与插件激活分离 |
| canvas | 画布、放置项、内容类型注册 | 内容 ID 与放置项 ID 明确区分 |
| content | 查询、读取、创建、批次修改 | 冲突、撤销和保存结果明确 |
| importers | 配置、预览、提交与取消 | 有进度、重试去重和失败恢复 |
| menus / toolbars | 上下文操作、按钮 | 随注册归属统一清理 |
| settings / storage | 设置、应用级和工作区级插件数据 | 明确作用域，不承诺安全隔离 |
| events / tasks | 内容事件、工作区事件与运行任务 | 可取消、可清理，注明退出行为 |
| files | 系统文件选择器、按句柄读写、目录列举 | 宿主进程权限执行，不做路径白名单；大文件流式传输 |
| net | 宿主代理 `fetch`，返回标准 `Response` 形态 | 绕过 `views://` 的 CORS 限制；不复用宿主登录态与 AI 凭据 |
| workers | 登记插件创建的 Web Worker 以便停用时终止 | 不提供额外调度 |

SDK 优先覆盖完整用户动作，而不是导出内部 store。`files` 与 `net` 是宿主服务的代理，不是插件后端；把它们放进 SDK 是为了让首版不需要后端入口。不必把全部 Bun API 再包装一遍。

宿主服务调用运行时明确支持的传输类型、错误、取消、超时和大文件处理方式。不要在 TypeScript 类型中允许任意对象，再让作者在运行时遭遇不可序列化错误。

公开 SDK 提供版本兼容承诺；直接 DOM 操作与未公开接口不提供同等承诺。建议为新增不稳定接口提供显式 experimental 命名，在实践稳定后进入正式接口。

## 7. 资料与画布类型

插件灵活性不能以宿主无法管理资料为代价。正式 SDK 应允许宿主继续搜索、撤销和显示用户内容。

- 插件安装文件、插件设置、工作区业务数据、画布实例内容分别存储。
- 自定义画布类型至少声明类型 ID、状态版本、初始状态、渲染、摘要与可选迁移。
- 缺少插件时保留原始状态，并使用最后保存的摘要展示占位视图；不执行未知插件代码。
- 内容写入通过宿主服务时更新对应投影、搜索数据与历史；避免各插件自行维护多份事实来源。
- 小批次修改提供一次撤销；大导入支持明确的分段提交，展示已完成范围。
- 插件缺失时可导出通用摘要与原始数据；特定格式的完整导出需要作者另行提供，不能笼统承诺。
- 停用与卸载保留用户内容及插件持久数据，删除数据是独立操作。

首版用一个真正的自定义交互卡片验证这组接口。不要用只能变颜色的静态卡片代替类型状态、编辑、恢复和搜索的完整验证。

## 8. 安装、更新与恢复

安装以应用级目录保存完整的已构建包，工作区记录启用状态。首版建议一个插件 ID 只激活一个应用级版本，避免同时维护多版本前端、后端和共享依赖；按工作区选择不同版本延后。

安装先检查包、解压到暂存位置，再提交安装记录；失败保留旧版本。下载成功不等于可以执行，显式启用后才加载入口。

更新默认由用户确认，允许固定版本与本地 ZIP 更新。自动更新不作为最早闭环的前提。

高信任模型下，更新等于向用户机器投递可执行代码，因此**作者密钥签名是 T4 的硬性要求，不是可选项**：

- 作者用本地生成的 ed25519 密钥对包签名；公钥写入 manifest `publicKey`。不需要账号、CA 或官方审核。
- 首次安装时宿主固定该插件 ID 对应的公钥与 `update.url`（TOFU）。后续任何更新——自动检查、手动 ZIP、URL 重装——都必须由同一密钥签名，否则拒绝并明确提示“作者密钥已变更”，由用户决定是否作为全新插件重新安装。
- 更新只从固定的 `update.url` 拉取描述；描述中的包 URL 需 HTTPS，且包摘要与描述一致。
- 未签名包允许安装（开发目录、本地实验），但在列表中标注“未签名”，且不接受任何来源的自动更新。

这一机制只保证“更新同一插件的人持有同一把密钥”，不证明作者身份真实，也不证明代码安全。

代码回退与数据回退分开处理。插件升级若迁移数据，应声明数据版本并准备恢复材料；只有旧代码可读取现有数据时才能直接回退。不得用替换旧 ZIP 的成功提示掩盖数据不兼容。

## 9. 与现有方案的关系

本节用于明确文档和实现切换点，不要求复用旧代码。

| 原方向 | 新方向 |
| --- | --- |
| 默认不受信任代码、细粒度权限 | 用户主动启用的高信任代码 |
| QuickJS 为第三方通用逻辑入口 | 宿主 realm 内的 JavaScript 前端；Bun Worker 后端延后 |
| 独立 Web UI 无网络隔离容器 | 宿主同 realm React / DOM 视图，独立 createRoot |
| 选区、正文、网络逐项授权 | 一次高信任说明与启用确认；`capabilities` 仅展示 |
| UI 容器隔离通过后才开放视图 | 以开发体验、生命周期和数据流程验收视图 |
| 严格宿主 API 作为访问限制 | SDK 作为稳定易用的推荐接口；`files` / `net` 为能力补足 |
| 工作区授权作为权限边界 | 工作区启用和上下文作为行为管理 |
| 签名更新列为后续阶段 | 作者密钥 TOFU 签名为 T4 硬性要求 |

停止把 WebRTC / STUN 阻断作为此方案的交付门槛，不再扩建第三方无网络 WebView 沙箱，也不以声明式 UI 限制作者。

### 9.1 现有代码的处置

现有插件代码约 8k 行，按是否与信任模型耦合分为两类。

**默认保留并适配新契约**（这些机制与信任模型无关，已有测试与桌面验收）：

| 模块 | 用途 | 需要的改动 |
| --- | --- | --- |
| `zipInstall.ts`、`urlInstall.ts` | 解包、路径校验、HTTPS URL 规则、摘要 | 接受 `manifest.json` v2；加入签名校验 |
| `pluginInstall.ts` | 可恢复安装事务、暂存与提交 | 安装目录从工作区 `.ghostboard/plugins/` 改为应用级 |
| `contentBatch.ts` | 标题批次、journal、Undo/Redo | 扩展为 `content.updateMany` 的通用字段集 |
| `management.ts`、`shared/plugins/management.ts` | 按工作区启用状态 | 去掉权限授予，保留启用/停用 |
| `shared/plugins/manifest.ts`、`ids.ts`、`release.ts` | manifest 解析、ID 规则、semver | 升到 v2 字段集；旧字段拒绝 |
| `PluginsPanel.tsx` | 设置页安装、审阅、启用 | 展示 `capabilities`、签名状态、更新来源 |
| `localHttpServer.ts` | 本地 HTTP + bearer token | 增加插件目录挂载 |

**删除**（只服务旧隔离模型）：`quickjsRuntime.ts`、`logicRuntime.ts`、`panelRuntime.ts`、`probeHost.ts`、`isolationMatrix.ts`、`shared/plugins/session.ts`、`shared/plugins/protocol.ts` 的信封与 host-call 类型、`commandEnablement.ts`（按工作区的权限授予与包指纹记录；工作区启用状态并入 `management.ts`）、`scripts/plugin-container-probe/` 与其中的 WKWebView helper。`quickjs-emscripten` 依赖及 `electrobun.config` 中的 wasm 拷贝随之移除。

复用条件是符合新契约且有验证，不能让旧 session / permission 协议泄漏到公开 SDK。

### 9.2 旧包切换

旧包采用安全执行模型（`ghostboard.plugin.json`、`manifestVersion: 1`），新包采用高信任模型（`manifest.json`、`manifestVersion: 2`）。宿主对 v1 包一律拒绝加载，在插件列表中标注“旧契约，需重新安装 v2 版本”，保留其用户数据与画布内容。不得把用户以前启用的受限包静默当成高权限包加载；不维护双运行时。

### 9.3 文档同步状态（2026-09-09）

- PRD §2.14、§5.12、§6、§7.1、§8.3 已按本方案改写：高信任模型、`capabilities` 展示、TOFU 签名更新、T0–T6 阶段。
- 开发计划 §1、§2.1 已改为指向本方案。
- 旧整改方案 v2、P0 冻结契约、容器实验及其证据已移入 `docs/features/Archive/`，仅作历史记录。
- `.planning/` 下 2026-09-08 的插件条目属于旧模型执行记录，不再作为任务来源。
- 2026-09-09 晚新增 [追加 1](./trusted-plugin-platform-addendum-1.md)：A1 不共享宿主组件、A2 generation/signal/原子重载、A3 全局运行时对象、A4 KV/任务/事件、A5 testing 子包、A6 单文件 SDK 参考。T1 起按追加执行。

## 10. 实施阶段与退出条件

使用 T0–T6 编号，与已归档 v2 方案的插件 P0–P5 区分。阶段按可验证结果推进，不预先承诺未经估算的工期。

| 阶段 | 工作 | 退出条件 |
| --- | --- | --- |
| T0：决策与装载验证（macOS arm64 已通过） | 同步信任模型；在打包后的真实应用中验证：本地 HTTP 挂载插件目录并 `import()`、import map 解析共享 React / SDK、Vite 输出稳定 chunk、独立 `createRoot` 挂载与卸载、`net.fetch` 代理与 `files` 读写 | 无构建 JS 命令、使用宿主 React 的面板、一次代理 `fetch`、一次文件读取均在 macOS 发行包运行；React 单实例得到验证（`useState` 在插件组件内正常）；记录 Linux / Windows 差异 |
| T1：命令与面板闭环（macOS arm64 已通过） | manifest v2、目录加载、注册清理、SDK、模板、自动重载、诊断；追加 A1–A3 | 仓库外作者无需修改宿主，即可开发、重载、停用命令与面板；旧 v1 包被拒绝并有提示；失败重载保留原实例/视图状态，signal/generation 与候选注册交接通过，主题变量和冻结全局 shim 通过 |
| T2：内容与画布类型（macOS arm64 已通过） | 查询、批次、事件、实例状态、摘要、视图上下文、自定义卡片；追加 A4 持久 KV / 任务；统一 session 原生历史 | 内容修改可撤销；自定义卡片编辑、重启、搜索及缺失插件展示通过；画布快照与插件笔记批次按提交顺序撤销且冲突不移动游标 |
| T3：导入器与分发 | SDK `files` 完整流程、导入器、可安装构建、ZIP / HTTPS 安装、组合插件 | 四类样例均从独立包安装，最终用户无开发工具也能使用 |
| T4：故障、签名与更新 | 安全模式、作者密钥签名与 TOFU 校验、更新事务、代码回退与迁移恢复 | 坏插件、坏包、失败更新、密钥变更的更新均不会使用户失去插件管理和数据恢复入口 |
| T5：公开开发验收 | 文档、兼容策略、外部作者试用、支持平台回归 | 四类完整流程及开发体验目标有记录，限制与支持范围公开明确 |
| T6+（需求驱动）：后端入口 | 每插件一个 Bun Worker；仅在真实插件需要 Bun 原生能力时启动 | 有具名插件需求；Worker 生命周期、停用回收与发行包验证通过 |

2026-09-09 第一批结果：[T0 发行包证据与平台差异](trusted-plugin-t0-evidence.md)。macOS arm64 的三项机制及 v1 拒绝/提示/数据保留通过，Linux/Windows 未运行。§9.1 旧运行时及权限协议已删除；保留模块完成 v2 基础适配，T2 内容字段扩展和 T4 签名更新按阶段保留待办。

2026-09-09 T1 结果：[命令/面板及追加 A1–A3 发行包证据](trusted-plugin-t1-evidence.md)。正式 SDK、开发目录启用、命令/面板、自动/手动重载、失败保留原实例、独立作者模板及 global shim 均在 macOS arm64 归档运行；跨工作区重启没有继承启用或执行。主题变量与现行 SDK 冻结范围见 [SDK README](../../../packages/plugin-sdk/README.md)。T0 发行包回归、普通 canary 构建及全量测试通过；原生目录选择器交互、Linux/Windows 和外部真人作者试用不在本次已验收范围。

2026-09-10（Asia/Singapore）T2 首批结果：[A4 持久 KV、事件与任务证据](trusted-plugin-t2-a4-evidence.md)。正式 SDK 提供应用级 / 工作区级 JSON KV、宿主内容和画布选区变化推送、激活事件、生命周期绑定的定时 / 单次任务。发行包通过首次启用、同工作区重启、切换工作区及返回原工作区验证；数据不串工作区，应用级 KV 共享，停用后事件和任务停止，原数据保留。A2 的候选准备不发布订阅 / 任务，失败仍保留旧代，成功交接后才启动新代。API 语义与限制见 [SDK README 的 A4 章节](../../../packages/plugin-sdk/README.md#t2-first-slice-storage-events-and-tasks-a4)。**本批不代表整个 T2 通过**：通用内容查询 / 批次事务 / 撤销、内容快照 hooks、第三方自定义卡片与迁移 / 缺失展示仍待实施与验收。

2026-09-10（Asia/Singapore）T2 第二批结果：[笔记元数据事务与恢复证据](trusted-plugin-t2-content-evidence.md)。`app.content.get/query/updateMany/undo/redo` 已接入正式 SDK：读取笔记、按 revision 批量更新 sidecar 笔记的标题 / 颜色、持久化操作回执及撤销 / 重做。宿主编辑器、manifest 元数据与插件写入共用工作区写入队列；批次先写 intent，读取 / 写入前完成中断恢复，外部文件冲突不覆盖。发行包通过两笔记批量修改、画布 / 文件夹投影、搜索、陈旧 manifest 拒绝、重启后撤销及整批 redo 冲突。待保存正文在连续的 metadata-only 变更下保留并更新其 revision；不能证明连续性或本地标题存在冲突时保留草稿并拒绝覆盖。**本批仍不代表 T2 全部完成**：正文修改 / 内容创建、内容选区快照 / React hooks、统一历史顺序与冲突恢复 UI、第三方卡片 / 迁移 / 缺失展示均未验收。当前插件撤销使用显式 SDK / 插件命令，不冒充原生全局 Undo 已统一。

2026-09-10（Asia/Singapore）T2 第三批结果：[笔记选区与 React hooks 证据](trusted-plugin-t2-selection-evidence.md)。`app.selection.get()` 去重并通过同一次宿主队列读取笔记快照，`getPlacements()` 独立保留画布放置身份；`subscribe/getSnapshot` 提供生命周期绑定的稳定缓存。正式 `@ghostboard/sdk/react` 提供 `useSelection/useSelectionState/useSelectedPlacements`，每个独立面板 root 由 SDK 自有 provider 绑定，dev / 发行 import map 和可选 global shim 共用同一 React / hooks 模块。发行包通过重复放置去重、只修改选中笔记、内容变化刷新面板且不重挂、旧 revision 拒绝、重启后 undo 更新 hooks 和停用清理。**本批仍不代表 T2 全部完成**：选区目前只读取当前画布中显式选中的持久化笔记，容器不递归、非笔记仅保留放置引用；正文修改 / 内容创建、第三方卡片与迁移 / 缺失展示、统一 undo、更多业务 hooks 仍待推进。上方各批结果中的“待实施”按当批范围保留，最新边界以本段及 SDK README 为准。

2026-09-10 T2 第四批结果：[纯文本正文替换证据](trusted-plugin-t2-body-evidence.md)。`updateMany` 增加 `changes.text`，显式将已有笔记正文替换为纯文本段落；沿用 revision 校验、批次 intent 与回执，重建转义预览，历史保存原始富文本 blocks / preview，支持重启后 undo / redo。首次正文历史升级为 v2，旧宿主拒绝读取以避免只恢复元数据。**本批不是 T2 退出**：宿主已打开编辑器和画布预览不会自动重载正文；本地草稿保留且旧 revision 保存被拒绝。内容创建、富文档编辑、宿主正文同步与冲突 UI、自定义卡片 / 迁移 / 缺失展示、统一 undo 仍待推进。前三批“待实施”保留为当批记录，最新边界以本段与 SDK README 为准。

2026-09-10 T2 第五批结果：[宿主正文同步证据](trusted-plugin-t2-body-sync-evidence.md)。正文通知经工作区绑定、队列读取和过期响应检查，刷新干净的画布 / 文件夹引用与已打开编辑器；实际编辑器中的替换、富文本 undo / redo 已通过发行包验证。本地输入在 Markdown 序列化前立即标记为脏，正文 / 标题 / 颜色草稿及进行中的保存阻止刷新；旧工作区的同名笔记编辑器不会参与新工作区同步。第四批的“不会自动重载”边界由本批覆盖，冲突合并 UI、内容创建、自定义卡片、统一 undo 仍待推进。

2026-09-10 T2 第六批结果：[detached 笔记创建证据](trusted-plugin-t2-creation-evidence.md)。正式 SDK 增加 `app.content.createMany`：由宿主分配 opaque ID，在一个可重试事务中创建 1–100 条 sidecar 笔记，并可在重启后整批 undo / redo；redo 保持原 ID 并递增 revision。创建笔记进入文库扫描但不自动放到画布。undo 在任一笔记已修改、仍被当前界面引用、存在于活动或回收站画布、被工作区内容提及时拒绝整批删除；引用源不可读或损坏时也拒绝。发行包覆盖创建重试、文库发现、live / 持久放置保护、删除后陈旧画布保存阻断、重启 undo / redo 和修改冲突。历史升级至 v3，事务恢复与通知仍在工作区写入队列内完成。**T2 仍在实施**：自定义卡片、迁移 / 缺失插件展示、冲突恢复 UI、富文档创建与统一 undo 尚未验收。

2026-09-10 T2 第七批结果：[自定义画布类型证据](trusted-plugin-t2-canvas-evidence.md)。正式 SDK 增加 `app.canvas.registerType`：插件本地 ID 由宿主绑定到插件命名空间，候选代注册在 setup 成功后按 owner generation 原子发布；失败重载不影响旧卡片。第三方交互计分卡在发行包中完成创建、编辑、实例/放置持久化、重启、宿主摘要搜索、停用后的原始状态与摘要占位，以及重新启用恢复。插件从 dataVersion 1 升到 2 时，对当前加载实例执行带旧 revision 的惰性迁移；迁移结果、版本、摘要和搜索均跨重启持久化，降级、无迁移或冲突不覆盖原数据。**T2 仍在实施**：冲突恢复 UI、富文档创建及统一原生 / 画布 / 插件 undo 仍待收口；未打开画布不做后台迁移。

2026-09-11 T2 第八批结果：[冲突恢复 UI 证据](trusted-plugin-t2-conflict-evidence.md)。已打开的 BlockNote 编辑器在本地草稿与插件正文事务发生 revision 冲突时，不再只显示泛化保存失败：宿主按编辑器绑定的 workspace 读取最新 canonical blocks / 摘要，暂停自动重试并展示可展开的本地草稿与已保存版本比较。用户可显式采用已保存版本（不写盘，强制刷新所有当前投影），或保留本地版本（以最新 revision 再做 compare-and-swap）；若第二次竞争失败则刷新冲突而不覆盖。读失败保留草稿并允许重试，未解决时关闭需要单独确认丢弃。发行包用独立冲突笔记通过两个选择，并回归原正文事务重启 / undo / redo。**T2 仍在实施**：本批没有自动合并富文本，也没有统一原生 / 画布 / 插件历史；下一批先冻结统一 undo 的顺序、作用域、持久化和冲突语义。

2026-09-11 T2 第九批结果：[统一原生 / 画布 / 插件笔记历史证据](trusted-plugin-t2-history-evidence.md)。宿主在 active workspace + view 的 renderer session 内，将画布快照与已提交插件笔记批次按观察到的 commit 顺序放入同一线性时间线；原生菜单与画布级快捷键撤销 / 重做该时间线，编辑器、输入框及聚焦 widget / extension 仍保留本地历史所有权。插件 revision conflict、引用保护和传输失败不移动混合游标；显式 SDK undo / redo 继续跨视图和重启持久可用。发行包通过 A→B→C 顺序、redo 分支废弃、冲突可见失败、视图边界和重启边界。**现行 T2 退出条件已满足并进入 T3**。混合游标不跨 view / workspace / restart，富文档创建、附件写入、插件菜单贡献和持久画布事务不借此扩入 T2。

T0 是本方案最大的技术风险所在，其三项机制（import map 共享依赖、本地 HTTP 装载、宿主代理服务）任一不成立都会改变架构，必须先于 SDK 设计在真实发行包上实测。随后做开发者闭环，不先设计所有可能的扩展点。原生依赖、复杂任务调度和深度编辑器 API 等待真实插件需求驱动。

## 11. 验收清单

### 开发者与最终用户

- 最小命令只需 manifest 和 JavaScript，`import '@ghostboard/sdk'` 经 import map 解析，无需额外手工配置。
- React 插件可以使用常见组件库，宿主共享 React，不出现重复实例问题（插件组件内 hooks 正常工作即为证据）。
- 插件通过 SDK `net.fetch` 访问第三方 HTTPS 接口成功；直接 `fetch` 被 CORS 拦截的情况有文档说明。
- 插件通过 SDK `files` 选择并读取用户文件；不需要后端入口。
- 本地修改可重载，报错指向插件源码，旧注册不重复残留。
- 安装页展示 `capabilities`、签名状态与更新来源。
- 四类插件均在主仓库之外开发、打包、安装和使用。
- 干净应用环境无需开发工具，不会在安装时运行 npm / Bun install。

### 行为与数据

- 关闭面板不影响同插件命令；停用后宿主登记的入口、订阅与任务清理正确。
- 工作区切换时，进行中的 SDK 操作不写入错误工作区。
- SDK 批次操作有一致的失败、冲突和撤销结果。
- 导入可预览、取消、显示部分完成范围，并在重试时避免重复内容。
- 卡片重启后恢复；缺失插件时状态、摘要和基础导出仍可用。
- 更新失败保留可用版本；不兼容的数据迁移有明确恢复方式。
- 使用不同密钥签名的更新包被拒绝并提示密钥变更；未签名插件不接受自动更新。
- 旧 `manifestVersion: 1` 包被拒绝加载，其用户数据与画布内容保留。
- 启动故障时可在第三方代码加载前进入安全模式。

### 运行条件

- 插件面板抛错只影响该面板的 root，宿主 UI 继续可用；有对应诊断与恢复路径。
- 插件修改挂载点以外宿主 DOM 的行为在文档中明确为不支持。
- 对无法自动撤销的任意代码副作用，文档明确重新加载或人工恢复的边界。
- 每个宣称支持的平台分别完成打包、安装、import map 与模块装载、宿主代理服务和基础恢复验证；未通过的平台不宣称已支持。

## 12. 已确定的设计取舍

以下前提已由产品方向明确：优先灵活性和低门槛，接受高信任第三方代码，可以重写。下表记录采纳时的取舍；实施中若 T0 实测推翻其中任一项，需回到本表修订。

| 设计项 | 采纳方案 | 主要取舍 |
| --- | --- | --- |
| 前端模型 | 同 realm React + DOM，独立 createRoot，挂载点内自由 | 开发自由度高，接受页面相互影响；挂载点外不支持 |
| 共享依赖 | import map + 稳定 chunk | 无构建 JS 可直接导入 SDK；宿主构建需维护稳定导出 |
| 本地模块鉴权 | 带每次启动 token 的目录前缀；服务调用继续使用 bearer header | 原生 import 不支持附加 header，query 不会被相对 import 继承；token 不构成插件权限边界 |
| 后端拓扑 | 首版无后端入口；`files` / `net` 由宿主代理；后端按需以 Bun Worker 加入 | 去掉第二运行时与前后端 RPC；需要 Bun 原生能力的插件要等 T6+ |
| 能力声明 | `capabilities` 仅展示，不强制 | 用户有知情基础；不构成任何限制 |
| 更新签名 | 作者 ed25519 TOFU，T4 硬性 | 无账号 / CA 门槛；作者丢失密钥需以新插件身份重发 |
| 版本管理 | 应用级单版本，工作区控制启用 | 降低首版复杂度，暂不支持工作区并行多版本 |
| 公共接口 | 稳定 SDK + experimental；允许 DOM 自定义 | 常用路径稳定，内部结构变化由非正式用法承担 |
| 旧包切换 | `manifestVersion: 2`；v1 拒绝加载并提示 | 避免隐式升级权限，接受开发阶段不兼容 |
| 首版顺序 | T1 命令 + 面板，T2 画布类型，T3 导入器 | 先验证装载模型，再攻最难且最具差异化的扩展点 |

实施中持续关注：哪些 API 会使简单插件变复杂、T0 三项装载机制之外还有哪些运行假设需要实测、哪些数据或生命周期语义还不够明确。若后续要求首版保留后端入口，应给出无法用 `files` / `net` / Web Worker 覆盖的具体插件场景。

## 13. 参考与证据范围

- [GhostBoard PRD §2.14 / §5.12 / §6 / §7.1](../../PRD.md)：产品要求，已与本方案同步。
- [公开插件系统整改方案 v2（已归档）](../Archive/public-plugin-platform-redesign.md)、[P0 冻结契约 v1（已归档）](../Archive/plugin-p0-frozen-contract.md)、[容器实验（已归档）](../Archive/plugin-container-experiment.md)：旧模型的设计、契约与失败证据。
- [VS Code Extension API](https://code.visualstudio.com/api)：以 API 面为契约、不做权限沙箱、贡献点与激活生命周期的设计参考。
- [bb Plugin SDK](https://github.com/get-bb/bb/tree/main/packages/plugin-sdk)：typed SDK、React 扩展点、生命周期和可信同源 content script 的设计参考。
- [Obsidian Views](https://docs.obsidian.md/Plugins/User+interface/Views)：宿主提供视图容器、插件创建 DOM 的设计参考。
- [Import maps](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps)：共享依赖解析机制；需在 T0 确认目标 WebView 版本支持。

外部链接用于说明参考来源，不代表 GhostBoard 已实现相应能力，也不代表对参考产品进行了完整运行时审计。本文中的 API、包结构和实施阶段均为拟议设计，需由实现验证后冻结。
