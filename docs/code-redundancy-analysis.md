# GhostBoard 代码冗余分析报告

> **分析日期**: 2026-05-23
> **分析范围**: `src/` 目录下全部源码（177 个 .ts/.tsx 文件，其中 94 个为非测试源文件）
> **分析方法**: 静态代码审查、导入/导出追踪、模块职责对比

---

## 一、总体结论

项目整体代码质量**良好**，模块划分清晰，职责边界明确。未发现严重的代码冗余问题。
以下列出 3 个可优化项和若干设计观察。

---

## 二、可优化项

### 1. `sanitize.ts` — 纯粹的重导出桶文件（低优先级）

**文件**: `src/mainview/lib/sanitize.ts`

```typescript
// 整个文件内容仅此一段 re-export
export {
  sanitizeForPersistence,
  serializeNodeDataForManifest,
  serializeNodeForManifest,
  stripRuntimeAssetFields,
} from '@/lib/canvasNodeSerialization';
```

**现状**: 该文件仅作为 `canvasNodeSerialization.ts` 的 re-export barrel，没有新增逻辑。
文件内注释说明原因是"避免改动十几个已有 import 路径"。

**建议**:
- 短期：保持现状，不影响功能。
- 长期：当需要触碰这些 import 时，可将 call sites 直接改为从
  `canvasNodeSerialization` 导入，然后删除此文件。

**影响范围**: 3 个文件引用了 `@/lib/sanitize`：
- `useCanvasPersistence.ts`
- `canvasExport.ts`
- `applyCanvasNodeChanges.test.ts`

---

### 2. `bun/index.ts` — 主进程入口文件偏大（中优先级）

**文件**: `src/bun/index.ts`（1178 行）

**现状**: 该文件是主进程的入口，集中处理了：
- 窗口管理（BrowserWindow 创建/设置）
- RPC handler 注册（canvas、settings、template 等所有 handler）
- 工具函数（`sleep`、`waitForDevServer`）
- 设置窗口逻辑

**问题**: 所有 RPC handler 都注册在一个大文件中，随着功能增长会持续膨胀。

**建议**:
- 将不同业务域的 RPC handler 拆分到独立模块，例如：
  - `bun/handlers/canvas.ts` — canvas 相关的 RPC
  - `bun/handlers/settings.ts` — 设置相关的 RPC
  - `bun/handlers/template.ts` — 模板相关的 RPC
- `index.ts` 只负责窗口初始化和 handler 注册的编排。

---

### 3. `settingsClient.ts` — 类型/接口定义与运行时逻辑混合（低优先级）

**文件**: `src/mainview/settingsClient.ts`（196 行）

**现状**: 同一个文件中包含了：
- 类型定义（`AppSettings`、`TrashEntry`、`SettingsClient`、`SettingsRPC`）
- 运行时逻辑（`createSettingsClient`、`initElectrobun`）
- 常量（`DEFAULT_SETTINGS`、`TRASH_UPDATED_EVENT`）

**建议**: 可将类型定义提取到 `src/types/settings.ts`（或类似路径），
使 `settingsClient.ts` 只保留运行时逻辑。不过文件体量不大，优先级较低。

---

## 三、设计良好的模块（无冗余）

以下模块经过审查，结构清晰、无重复代码：

| 模块 | 文件 | 行数 | 说明 |
|------|------|------|------|
| 内容类型 | `contentTypes.ts` | 343 | Link/Asset 类型定义和工具函数，单一职责 |
| Canvas 序列化 | `canvasNodeSerialization.ts` | 132 | 运行时字段剥离、manifest 序列化逻辑清晰 |
| Canvas 工具 | `canvasUtils.ts` | ~80 | 父子关系、拓扑排序等，职责明确 |
| 颜色工具 | `colorUtils.ts` | ~50 | 色彩判断和样式转换，简洁无冗余 |
| 工具函数 | `utils.ts` | ~5 | 仅 `cn()` (clsx + tailwind-merge)，标准模式 |
| 共享 Markdown | `shared/markdown/` | 3 个文件 | render / preview / sanitize 职责分离 |
| 注册表 | `canvasNodeRegistry.ts` | ~190 | 节点类型规格定义，集中管理 |
| 放置算法 | `resolvePlacement.ts` | ~80 | 碰撞检测和自动放置，逻辑独立 |
| 碰撞检测 | `collision.ts` | ~120 | AABB 碰撞计算，独立模块 |
| 撤销/重做 | `undoRedo.ts` | ~80 | 历史状态管理，逻辑自洽 |

---

## 四、已排除的"伪冗余"

以下情况经审查确认为**有意设计**，不属于真正的冗余：

| 模式 | 原因 |
|------|------|
| `sanitize.ts` re-export `canvasNodeSerialization.ts` | 为保持 import 路径稳定的临时方案 |
| `bun/preview.ts` 使用 `sanitize-html` + `shared/markdown/sanitize` | 主进程和服务端需要不同的 sanitizer 实现（sanitize-html vs DOMPurify） |
| `settings.tsx` + `settingsClient.ts` 分离 | 入口文件和 RPC 客户端是不同职责，不是冗余 |
| `routeTree.gen.ts` 存在 | TanStack Router 自动生成文件，非手写 |
| 测试文件与源文件同目录 | 项目规范要求测试放在源文件旁边 |

---

## 五、测试覆盖情况

项目测试文件与源文件的比例良好：

- 总计 177 个 `.ts/.tsx` 文件
- 其中约 83 个为测试文件（`.test.ts/.test.tsx`）
- **测试文件占比约 47%**

每个核心模块（`canvasStore`、`canvasExport`、`canvasNodeSerialization`、
`contentTypes`、`rpc` 等）都有对应的测试文件，代码质量有保障。

---

## 六、代码统计数据

| 文件 | 行数 | 角色 |
|------|------|------|
| `bun/index.ts` | 1178 | 主进程入口（最大文件） |
| `store/canvasStore.ts` | 998 | Canvas 状态管理（Zustand store） |
| `lib/canvasExport.ts` | 484 | Canvas 导出（PNG/JSON/缩略图） |
| `lib/rpc.ts` | 350 | 渲染进程 ↔ 主进程 RPC 客户端 |
| `lib/contentTypes.ts` | 343 | 内容类型定义和工具函数 |
| `settingsClient.ts` | 196 | 设置页面 RPC 客户端 |
| `lib/canvasNodeSerialization.ts` | 132 | 节点序列化 |

---

## 七、改进建议优先级

| 优先级 | 建议 | 预估工作量 |
|--------|------|-----------|
| 🟡 中 | 拆分 `bun/index.ts` 的 RPC handler 到独立模块 | 半天 |
| 🟢 低 | 删除 `sanitize.ts` re-export 桶文件 | 15 分钟 |
| 🟢 低 | 提取 `settingsClient.ts` 中的类型定义 | 30 分钟 |

---

*报告由 Craft Agent 自动生成*
