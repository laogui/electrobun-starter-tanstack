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
| — | `4b5effc` + `3158b8f` | 整改方案：更正 1.4 关于撤销的说法；新增 4.3 撤销对齐 Heptabase | 仅文档，见 [`../remediation-plan.md`](../remediation-plan.md) |
| 8 | `4096020` | 撤销 4.3 第一步：卡片颜色算画布操作，可撤销 | `canvasNoteHistory.ts` 新增 `HISTORY_NOTE_KEYS`；`nodesSlice`、`folderSlice` 改用它；`canvasStore.test.ts` +2 项 |
| 9 | `150608b` | 方案 4.2 第 2 步核对（只改文档） | `docs/remediation-plan.md` |
| 10 | `578d757` | 改卡片颜色改为弹出取色器，与画布背景同一套；颜色仍存笔记里 | 新增 `ui/ColorSwatchPanel.tsx`、`canvas/CardColorPopover.tsx`、`store/colorPickerStore.ts`；`useContextMenu` 改为打开取色器；`canvasBackgroundCustoms` 抽出 `loadColorCustoms/saveColorCustoms`；自定义卡片色存 localStorage `ghostboard.card-color-customs` |
| 11 | `dabfe46` | 分组改颜色也改为弹出取色器：5 种原色调作预设，支持自定义色值 | `GroupNode.tsx` 支持 hex（`group-custom` 类 + `--group-custom`）；`index.css` 新增 `.canvas-group.group-custom`；`CardColorPopover` 新增 group 色板；`useContextMenu` 混选时只改与首项同色板的卡 |
| 12 | `22ff5c3` | 删除插件系统（用户 2026-11-05 决定）：运行时、主进程宿主、SDK、脚手架、文档站副本、签名与授权、T0–T5 探针、插件 CI、设置页 | 323 个文件，+364 / −39213。笔记保存同步画布改由 `lib/noteChangeSync.ts`（主进程只推 `noteChanged`）；统一撤销只留画布、小组件、扩展实例；删掉笔记意图事务、扩展迁移备份、`createNote` 等只给插件用的 RPC 与 HTTP 路由。恢复：`git revert 22ff5c3` |
| 13 | `96aca60` | 单击打开卡片，单击/拖拽不再选中，选中只靠框选（用户 2026-11-05 改回 73ac03d 的点击模型） | 单击（双击同效）打开侧边栏、编辑便签、进入文件夹，文件夹子卡也单击打开；`Shift/Cmd+Click` 不再选中；框选后 `Enter` 打开、Delete 删除。新手提示与 PRD 同步。恢复：`git revert 96aca60` |
| 14 | `0f8f89f` | 删除许可证额度与“画布类型”设置页（含按类型启用/停用机制） | 47 个文件，−1951。删 `nodeQuota`、`license.ts` 与激活 RPC、`extensionEnablementStore`、`enablement.ts`；扩展可用性只剩 available / unknown。恢复：`git revert 0f8f89f` |
| 15 | `9747a50` | 删除 7 个隐藏模板（快速上手、演示、看板、冲刺复盘、周计划、四象限、开一家店） | 模板文件、注册、`HIDDEN_TEMPLATE_IDS`、文案。已建画布不受影响。恢复：`git revert 9747a50` |
| 16 | `44e1379` | 删除番茄钟、提醒、录音、Checklist 与旧小组件体系（原计划第 3、4 步，因共用 widget 体系合成一个提交） | 98 个文件，+661 / −8868。旧数据在打开画布时转换并写回：清单 → 笔记（GFM 任务列表）、录音 → 音频文件卡、番茄钟/提醒 → “已移除”占位。`productScope.ts` 已删。恢复：`git revert 44e1379`（已转换的画布不会自动转回） |
| 17 | `c485b7d` | 链接卡改版：头图按 OG 标准 1.91:1 整宽显示（最高占卡片 55%）；方图/小图（宽高比 < 1.3 或宽 < 400px）缩成标题旁小图；没图不再留灰色占位，改为紧凑卡；标题有图时最多 2 行；侧边栏详情头图也改 1.91:1；新建默认尺寸 380×420 | `LinkNode.tsx`、新增 `lib/linkPreviewImage.ts`（+测试）、`canvasNodeRegistry.ts`、`extensions/builtin/web/link.tsx`。已有卡片尺寸不变。恢复：`git revert` 本提交 |
| 18 | `71eb897` | 用户 2026-11-05 三处交互：①（已被第 19 行更正）；②文件夹展开后，点子卡片以外任何地方（空白、其他卡片、连线）都收回，拖拽不算；③侧边栏打开改为 56px/220ms 滑入，切换卡片时内容淡入；正在预览的卡片在画布上加强调色描边和光晕（文件夹子卡也有） | `CanvasFlowLayer.tsx`（去掉 onPaneClick 关文件夹，改为指针判断；预览高亮用按 data-id 的样式规则）、`CardSidePanel.tsx`。恢复：`git revert` 本提交 |
| 19 | `62ca130` | 更正第 18 行第①点（理解反了）：恢复“新建画布”子菜单（空白画布 + 模板）；删掉空画布中间的引导弹窗（新建笔记 / 浏览模板 / 打开笔记库），新建空白画布后直接是空画布 | 恢复 `ViewSwitcher.tsx` 与 3 条文案；删 `EmptyCanvasOverlay.tsx`、`routes/index.tsx` 的 `CanvasEmptyState`、7 条 `empty_canvas_*` 文案。恢复：`git revert` 本提交 |

原则：最初是**只关入口，不删数据**；2026-11-05 起用户要求无用代码直接删（第 12、14–16 步）。删代码时旧数据一律转换或保留，不丢内容：第 16 步把旧清单转成笔记、旧录音转成音频文件卡，番茄钟和提醒显示占位并保留原数据；第 4 步把旧的主标签字段改写进标签列表（无损）。

## 1. 隐藏入口（`fceed6f`）

> 第 14–16 步之后，本节的开关已全部删除，`productScope.ts` 不再存在；下表仅作历史记录。

所有开关集中在 `src/mainview/lib/productScope.ts`，改回 `true` 或从集合里移除即可恢复，不涉及数据迁移。

| 改动 | 开关 / 位置 | 恢复方法 |
| --- | --- | --- |
| 新建菜单和右键菜单不再出现番茄钟、提醒、录音 | `HIDDEN_CREATE_CANVAS_TYPE_IDS`，`extensions/createMenu.ts` 读取 | 从集合中移除对应 id |
| ~~设置里隐藏“插件”页~~ | 第 12 步已整块删除插件，开关一并删掉 | 不可恢复（需 revert 第 12 步） |
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

网站 App、API 与登录；付费与订阅。解冻条件见 PRD-slim。（公开插件平台原在此列，第 12 步已删除。）

## 验证状态

- 每一步都过了 tsc（无项目内报错）、biome 和相关测试。第 4 步：workspace、canvasPersistence、templates、searchIntegrity 共 41 项通过。
- 第 12 步：tsc 无报错、vite build 通过、全量 vitest 46 个文件 444 项通过（1 项跳过）。
- 第 14–16 步：tsc 无报错、biome 通过、vite build 通过、全量 vitest 45 个文件 430 项通过（1 项跳过）。
- 都**没有在 Mac 上实际运行过**。
