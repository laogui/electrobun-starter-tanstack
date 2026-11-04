# 瘦身改动记录（slim/v1）

分支 `slim/v1`，基线是 `main` 的 `b4ec080`。`main` 未动，未开 PR。决策和理由见 [`../PRD-slim.md`](../PRD-slim.md)，本文只记“改了哪些代码、怎么恢复”。

| 顺序 | 提交 | 内容 | 差异 |
| --- | --- | --- | --- |
| 1 | `fceed6f` | 隐藏不在写作流程上的入口，加 PRD-slim | [`01-scope-fceed6f.diff`](01-scope-fceed6f.diff)（不含 PRD 正文） |
| 2 | `128301b` | 资料库合并：删掉游离笔记侧栏 | [`02-library-128301b.diff`](02-library-128301b.diff) |
| 3 | `3f9000d` + `9229296` | 写作模板、首次打开成品板、Checklist 并入 Note | 见 [`../template-redesign/`](../template-redesign/README.md) |

原则：**只关入口，不删数据。** 旧画布里的番茄钟、提醒、录音、插件内容、Checklist 照常显示、搜索、打开。唯一真正删掉的代码是第 2 步的游离笔记侧栏。

## 1. 隐藏入口（`fceed6f`）

所有开关集中在 `src/mainview/lib/productScope.ts`，改回 `true` 或从集合里移除即可恢复，不涉及数据迁移。

| 改动 | 开关 / 位置 | 恢复方法 |
| --- | --- | --- |
| 新建菜单和右键菜单不再出现番茄钟、提醒、录音 | `HIDDEN_CREATE_CANVAS_TYPE_IDS`，`extensions/createMenu.ts` 读取 | 从集合中移除对应 id |
| 设置里隐藏“插件”页 | `SHOW_PLUGINS_SETTINGS = false`，`settings/SettingsApp.tsx` | 改为 `true` |
| 设置里隐藏“画布类型”页 | `SHOW_CANVAS_TYPES_SETTINGS = false`，同上 | 改为 `true` |
| 关闭 100 张免费额度和许可证卡片 | `LICENSE_QUOTA_ENABLED = false`，`lib/nodeQuota.ts` 直接放行，`settings/panels/GeneralPanel.tsx` 不渲染卡片 | 改为 `true` |
| 模板库隐藏看板、冲刺复盘、周计划、四象限、开一家店 | `HIDDEN_TEMPLATE_IDS`，`src/bun/templates.ts` | 从集合中移除 |

测试：`templates.test.ts` 断言隐藏模板仍可按 id 加载；`nodeQuotaPaths.test.ts`、`nodesEdgesSlices.test.ts`、`topicsSlice.test.ts` 在额度相关用例里显式打开额度开关，避免被关掉的额度影响原有断言。

另：`docs/PRD.md` 顶部加了一行，指向 PRD-slim。

## 2. 资料库合并（`128301b`）

| 改动 | 文件 |
| --- | --- |
| 删除游离笔记侧栏组件（508 行） | `components/canvas/DetachedNotesSidebar.tsx` |
| 删除 `detachedSidebarOpen` 状态；创建菜单的“文库笔记”和工具栏都改为打开笔记库 | `routes/index.tsx` |
| 笔记库里点游离笔记：直接放到视口中央并打开，不再弹提示 | `components/library/LibraryPopup.tsx` |

结果：找回内容只剩两个入口，`Cmd/Ctrl+K` 搜索和笔记库。Unlinked Files 留在笔记库底部。

已接受的损失：不能把游离笔记拖到指定位置，只能放到中央。恢复方法：`git revert 128301b`（会带回整个侧栏）。

## 3. 写作模板与 Checklist（`3f9000d`、`9229296`）

详见 [`../template-redesign/README.md`](../template-redesign/README.md)。涉及的开关：`HIDDEN_CREATE_CANVAS_TYPE_IDS` 加入 Checklist；`HIDDEN_TEMPLATE_IDS` 加入 quick-start、demo；`workspace.ts` 的 `FIRST_RUN_SEED_TEMPLATE_ID` 改为 `feature-story`。

## 冻结（未改代码，只是停止开发）

公开插件平台；网站 App、API 与登录；付费与订阅。解冻条件见 PRD-slim。

## 验证状态

- 每一步都过了 tsc（无项目内报错）、biome 和相关测试。
- 都**没有在 Mac 上实际运行过**，全量测试也没跑（沙箱太慢）。
