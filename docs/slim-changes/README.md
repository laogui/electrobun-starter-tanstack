# 瘦身改动记录（slim/v1）

分支 `slim/v1`，基线是 `main` 的 `b4ec080`。`main` 未动，未开 PR。决策和理由见 [`../PRD-slim.md`](../PRD-slim.md)，本文只记“改了哪些代码、怎么恢复”。

| 顺序 | 提交 | 内容 | 差异 |
| --- | --- | --- | --- |
| 1 | `fceed6f` | 隐藏不在写作流程上的入口，加 PRD-slim | [`01-scope-fceed6f.diff`](01-scope-fceed6f.diff)（不含 PRD 正文） |
| 2 | `128301b` | 资料库合并：删掉游离笔记侧栏 | [`02-library-128301b.diff`](02-library-128301b.diff) |
| 3 | `3f9000d` + `9229296` | 写作模板、首次打开成品板、Checklist 并入 Note | 见 [`../template-redesign/`](../template-redesign/README.md) |
| 4 | `dbc1468` | 标签只剩一种 | [`03-tags-dbc1468.diff`](03-tags-dbc1468.diff) |
| — | `5c7fa31` | 整改方案按评审调整顺序；PRD-slim 记下“卡片改为侧边栏打开” | 仅文档，见 [`../remediation-plan.md`](../remediation-plan.md) |
| 5 | `ef05a12` | 整改阶段 0：性能样本脚本、计时打点、基线表与 bug 清单 | 见 [`../quality/`](../quality/perf-baseline.md)；打点默认关闭，不影响用户 |
| 6 | `73ac03d` | 整改阶段 1：卡片改在右侧边栏打开，删除转场体系；单击选中、双击打开 | 见 [`../remediation-plan.md`](../remediation-plan.md) 阶段 1 进度；恢复：`git revert` 本提交 |
| 7 | `a444b48` | 阶段 1 收尾：文件夹子卡、右键菜单、搜索跳转、扩展 `openDetail` 统一走 `openFocusedItem`；插件按需启动暂缓 | 4 个文件，+25 / −20；原因见 remediation-plan 1.4 |

原则：**只关入口，不删数据。** 旧画布里的番茄钟、提醒、录音、插件内容、Checklist 照常显示、搜索、打开。真正删掉的代码只有第 2 步的游离笔记侧栏；第 4 步会把旧的主标签字段改写进标签列表（无损）。

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

## 4. 标签只剩一种（`dbc1468`）

界面其实早已合并：编辑器和卡片上只有一排标签，每个都能单独设颜色，编辑过的节点也已经只存 `tags[]`。剩下的是数据层：没编辑过的旧节点、隐藏模板和旧 frontmatter 里还留着“主标签” `tag` / `tagColor`，搜索、重命名、删除、迁移都要为它多写一条分支。

| 改动 | 文件 |
| --- | --- |
| `compactEntry` 先把 `tag` 放到 `tags[]` 第一位、`tagColor` 写进 `tagColors[tag]`（已有颜色优先），再只保留 `tags` 和 `tagColors`。读盘、写入、重命名、删除、移动、模板实例化都经过它 | `src/bun/nodeMetadata.ts` |
| frontmatter 迁移也走同一个合并 | 同上 |
| 测试改为断言单一列表；新增“合并旧主标签”“磁盘上的旧字段读入即合并、写回时消失”两项 | `workspace.test.ts`、`canvasPersistence.test.ts` |
| PRD §2.13 标签模型改为一种标签 | `docs/PRD.md` |

数据影响：旧数据下次保存时，`.ghostboard/node-metadata.json` 里的 `tag` / `tagColor` 会变成 `tags[]` 第一项和对应颜色，显示顺序和颜色与之前一致。旧版本 App 读新文件没问题（它本来就读 `tags[]`）。超过 8 个标签时，与之前界面一样只保留前 8 个。

行为变化：一张卡片从旧的 Checklist 迁移到新位置时，原来“目标的主标签优先、来源的主标签丢弃”，现在两边标签都保留，目标在前。

恢复：`git revert dbc1468`。已经改写的 sidecar 不会变回主标签，但旧代码同样能读。

## 冻结（未改代码，只是停止开发）

公开插件平台；网站 App、API 与登录；付费与订阅。解冻条件见 PRD-slim。

## 验证状态

- 每一步都过了 tsc（无项目内报错）、biome 和相关测试。第 4 步：workspace、canvasPersistence、templates、searchIntegrity 共 41 项通过。
- 都**没有在 Mac 上实际运行过**，全量测试也没跑（沙箱太慢）。
