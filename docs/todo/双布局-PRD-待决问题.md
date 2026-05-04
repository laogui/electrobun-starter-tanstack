# 引入「文档模式」后 PRD 的冲突点与待决问题

> **来源**：基于 [docs/PRD.md](../PRD.md) 与 [docs/features/Backlog/双布局-文档模式.md](../features/Backlog/双布局-文档模式.md) 的差异梳理
> **状态**：待与产品确认；确认后回写到 PRD 对应章节

---

## A. 新建与编辑入口

1. **文档模式如何「新建」节点？**
   - 现状：画布右下角 `CreateMenu` 一次能新建 Card / Checklist / Image / Sticky / Folder 五种。
   - 问题：文档模式只承认 Card / Folder / Image，那左栏「+ 新建」要不要露出 Sticky / Checklist 入口？
   - 选项：① 只露 Card / Folder（Sticky/Checklist 仅画布可建，文档模式提示"请到画布模式"）；② 露 Checklist（它本来就是 Card 的一种 type）但屏蔽 Sticky；③ 全部允许，但 Sticky 创建后立刻提示"会出现在画布"。
   - → **决策：文档模式新建只支持 Note（text card）类型。** 已通过 `createDetachedNote` 实现，创建 `detached: true` 的游离笔记。

2. **新建文档的画布坐标怎么定？**
   - 文档模式下用户没有"视口中心"概念。
   - 选项：① 落在当前视口最后一次保存的 `viewport` 中心；② 落在所有现有节点的 bounding box 右侧（堆到画布外避免遮挡）；③ 不分配 position，用 sentinel 值，下次进画布时再 auto-layout。
   - 也要决定 `style.width/height` 用什么默认值。
   - → **决策：采用 detached note 模式，`position: {x:0, y:0}` 占位，`data.detached: true` 标记。** 不在画布上渲染，用户从 canvas 侧边栏拖入画布时才赋予真实坐标（通过 `screenToFlowPosition` + `pinNoteToCanvas`）。

3. **新建到 Folder 内的卡片**
   - 当前 Folder children 是**内嵌**在 manifest 里、没有 `noteId`、外部编辑器看不见（PRD §5.1 / §5.10 已标注 ⚠️）。
   - 文档模式如果鼓励"在 Folder 下新建一篇长文"，会让大量正文卡进入这种"只在画布内可见"的草稿态，与"知识沉淀"的卖点冲突。
   - 选项：① 文档模式新建的 Folder 子卡片**强制**走 `noteId + 独立 .md`（提前做 §5.10 那个"后续迁移"）；② 维持现状但 UI 显著提示；③ 文档模式不允许直接在 Folder 内新建，必须先建顶层 Card 再拖入。
   - → **决策：Folder 子卡片强制走 `noteId + 独立 .md`。** 提前实施 §5.10 的迁移方案。

---

## B. 既有节点类型在文档模式的展示

4. **Sticky / Group / Edge "保留但不显示"的副作用**
   - Sticky 是当前主要的"快速捕获"通道（双击空白原地编辑）。文档模式直接隐藏会让习惯 Sticky 的用户失去这一入口。
   - Backlog 已建议未来做「便签收件箱面板」，需要确认首版**是否完全不暴露 Sticky 数量**，还是在左栏底部加一个 `📌 Stickies (n)` 计数（只读跳转回画布）。
   - → 决策：暂未决定，后续迭代。

5. **Image 节点的可编辑性**
   - PRD 把 Image 的聚焦模式定义为"大图浏览模式"。
   - Backlog 说在文档模式点击图片"进入只读预览"。
   - 问题：用户在文档模式想换图 / 删图 / 改 alt 怎么办？建议明确：① 完全只读，引导切回画布；② 复用 ImageNode 的右键菜单做基础替换。
   - → 决策：暂未决定，后续迭代。

6. **Checklist 在文档模式的编辑形态**
   - 画布上 Checklist 可"原地勾选 + 末尾加条目"，不进入聚焦。
   - 文档模式右侧编辑器是 Tiptap，要不要把 Checklist 也用 Tiptap 的 task list 渲染？这样会涉及 `data.items` ↔ Tiptap doc 的双向序列化，目前 PRD §2.2 明确写了 Checklist 不走 markdown-it。
   - 建议先决定：Checklist 在文档模式是 ① 复用 ChecklistNode 嵌入到右侧面板，还是 ② 作为 Tiptap task list 直接编辑。
   - → 决策：暂未决定，后续迭代。

---

## C. 与现有 PRD 概念的耦合

7. **Folder drill-down 的去留**
   - 画布模式的 drill-down（暗化背景 + 子卡片散开）在文档模式毫无意义——左栏直接展开就是。
   - 但状态机里 `folder-drill-down` 是个一等状态。要不要约定：文档模式禁用此状态？切换模式时如果当前在 drill-down，怎么处理？
   - → **决策：Folder drill-down 在文档模式下禁用。切换模式时如果当前在 drill-down，自动切回 canvas 模式。**

8. **FocusedView 与 DocumentEditor 共存策略**
   - Backlog §6.2 说要把 `FocusedView` 抽 `useCardEditor` 给两边复用。
   - 待定：在文档模式下，**双击 / Enter 还要不要触发 FocusedView 模态**？还是右侧已经是编辑器，双击只是无操作？建议在文档模式禁用 `focused` 状态。
   - → **决策：在文档模式下禁用 `focused` 状态。双击进入编辑模式，Enter 也进入编辑模式。**

9. **`Extract to Canvas` 在文档模式的语义**
   - 这个动作目前定义为"从 Folder drill-down 提取到画布"。
   - 文档模式选中一个 Folder 内子卡片时，右键菜单要不要保留 Extract？保留则需要解释"提取到哪个画布坐标"。
   - → **决策：`Extract to Canvas` 在文档模式下先不做，因为退出 folder 后坐标不确定。**

10. **多画布（View）与 layoutMode 的归属**
    - Backlog 说 `layoutMode` 持久化到**当前 view 的 manifest**。
    - 这意味着同一个 workspace 里"Roadmap 视图"可以是文档模式、"Brainstorm 视图"是画布模式。需要你确认这是想要的（vs. 全局/per-workspace 偏好）。
    - 新建 View 时默认 layoutMode 是什么？继承当前？永远 canvas？
    - → 决策：暂未决定，后续迭代。

11. **`unplaced notes` 在文档模式的入口**
    - PRD §2.8 把 "Unplaced (n)" 放在画布侧边栏底部。文档模式需不需要也露一个？建议在左栏最底部统一展示。
    - → **决策：已通过 detached notes 功能解决。** 文档模式 All Notes / Inbox 自然包含 detached notes；canvas 模式通过创建菜单「Library Note」打开侧边栏抽屉。

---

## D. 状态机 / 快捷键 / Undo

12. **交互状态机要不要新增 `document` 顶级模式**
    - 现状的状态（`idle`、`selected`、`focused`、`folder-drill-down` 等）几乎都假设画布存在。
    - 建议：在 §2.11 加一句"`document` 模式独立于上述状态机；进入文档模式即冻结画布所有状态"。
    - → **决策：`document` 模式进入后即冻结画布所有状态（`idle`、`selected`、`focused`、`folder-drill-down` 等）。**

13. **快捷键冲突**
    - `Cmd+N` 在文档模式：弹画布 CreateMenu 还是文档模式自己的"新建"？
    - `Enter`：文档模式下选中树节点意义？
    - `Escape`：在 Tiptap 内时是退出聚焦还是退出当前文档？
    - `Delete`：删除当前打开的文档 vs 删除目录树高亮项？
    - 建议把 §2.10 的快捷键表加一列"文档模式"。
    - → **决策：document 和 canvas 模式的快捷键不同。文档模式下不需要 Enter、Escape、Delete 快捷键。**

14. **Undo/Redo 的边界**
    - 目前 undo 栈在切 view 时会清空（PRD §2.9）。切 layoutMode 算不算同一类切换？
    - 文档模式里"删除一个 Card"和画布模式里"删除一个节点"是否进同一个栈？建议同一栈，但要补一条规则。
    - → **决策：文档模式下只有进入文档编辑才有 Undo/Redo。Tiptap 的 Undo/Redo 和画布的分开，Tiptap 自带此功能。**

15. **删除 Card 时附带 edge 清理的提示**
    - 画布模式有连线时的视觉提示，文档模式用户看不到 edge，也就感知不到"我删的东西原本连着 5 条线"。建议删除前弹 confirm 显示 "此卡片在画布上有 N 条连线"。
    - → **决策：删除 Card 时附带 edge 自动清理，不需要提示。**

---

## E. 布局切换 / 入口体验

16. **首次进入工作区的默认模式**
    - Backlog §2 用户故事 4 说"新用户希望选择更熟悉的'文档模式'作为入口"。
    - 决策：① 始终 canvas；② 首启弹 onboarding 让用户选；③ 通过 `app-config.json` 加 `defaultLayoutMode` 偏好。
    - → **决策：在设置项里加个选项让用户自己决定，默认是 canvas 模式。**

17. **切换模式时的 viewport / 编辑态**
    - 切到文档模式：当前 Tiptap 草稿是否 flush？聚焦模式是否自动收回？
    - 切回画布模式：默认是恢复上次 viewport，还是 fitView 到选中的那张文档？
    - → 决策：暂未决定，后续迭代。

18. **"画布 / 文档" 切换器的位置**
    - Backlog 草图放在顶部，但当前 `ViewSwitcher` 放在画布**底部**居中。
    - 决策：① ViewSwitcher 一并迁顶部，统一顶部工具栏；② 顶部放 LayoutSwitcher、底部留 ViewSwitcher（容器要避让）。
    - → **决策："画布 / 文档" 切换器继续放在顶部。**

---

## F. 其他要在 PRD 里补充的

19. 文档模式的**空状态**和**目录树排序规则**（Backlog §4 提到 `order` 字段是新增的——这违反了"不新增持久化字段"原则，需要在 PRD §5.10 加一行决策）。
    - → **决策：默认按最后修改时间排序。**
20. 文档模式的**搜索 Cmd+F**：是只搜目录树还是仍然全局；命中后高亮目录还是直接打开右侧。
    - → **决策：文档模式搜索和全局搜索一样，命中后直接打开右侧编辑器。**
21. **导出 (PNG/SVG)** 在文档模式应禁用还是改成"导出 Markdown"。
    - → 决策：暂未决定，后续迭代。
22. **i18n**：左栏菜单、右键菜单、空状态文案需要补 zh / en 两套。
    - → **决策：确认需要补 zh / en 两套，待实施。**
23. **可访问性**：左栏树要明确 ARIA tree role 与 roving tabindex 规范，比 §6.2 的"键盘可达"更具体。
    - → 决策：暂未决定，后续迭代。

---

## 差距清单（决策已确定但尚未实现）
按决策编号映射 → 待开发任务：

决策 3 — Folder 子卡片强制 noteId + 独立 .md（提前实施 PRD §5.10 迁移）
最大块。当前 addFolderChild 把子卡片内嵌在 data.children，无 noteId、无独立 md。

决策 7 — Folder drill-down 在文档模式禁用 + 自动切回画布
切换 layoutMode 到 document 时，若 focusedFolder 非空，需要自动 setFocusedFolder(null) 并将 layoutMode 切回 canvas。

决策 8 — 文档模式禁用 focused 状态；双击/Enter 进入编辑
当前 DocumentEditor 已是常驻面板，但 LeftRail/NoteList 没有 Enter 进入编辑、双击进入编辑的细化语义；同时切到 document 时 focusedNode 也应清空。

决策 9 — 文档模式不提供 Extract to Canvas 入口
确认 NoteList / 右键菜单不暴露 Extract（目前 NoteList 没有右键菜单，但 FolderView 有，需要在文档模式下不进入 FolderView）。

决策 12 — document 模式冻结画布所有状态
切换到 document 时 reset：focusedNode、focusedFolder、createMenuOpen、contextMenu、searchOpen、剪贴板、helper lines。

决策 13 — 快捷键差异化
useCanvasKeyboard 当前对画布全局生效；进入 document 模式后必须屏蔽 Enter/Escape/Delete/Cmd+A/Cmd+N（但保留 Cmd+F、Cmd+Z/Y）。

决策 14 — Tiptap 自带 Undo，与画布栈分离
确认 TiptapEditor 启用 history extension（已默认开启），并阻止 Cmd+Z 冒泡到 canvas store undo。

决策 15 — 删除 Card 时附带 edge 自动清理（无提示）
deleteNodes 已清理 edges；需验证 EditorToolbar 的 handleDelete 路径同样走 deleteNodes 并触发 edge 清理（看上去已经如此），加测试覆盖即可。

决策 16 — 设置项 defaultLayoutMode（默认 canvas）
在 settings 窗口与 app-config.json 增加偏好项，应用启动时使用之；当前 loadLayoutModeFromStorage 总是落到 canvas，没有读 settings。

决策 19 — 默认按 updatedAt 倒序排序
NoteList 当前未排序；需要 entries.sort((a,b) => b.updatedAt - a.updatedAt)，并让排序按钮（已有 UI 占位）可切换。

决策 20 — 文档模式 Cmd+F 命中后直接打开右侧
当前 SearchDialog 仅处理 canvas 的 fitView。需要在文档模式接管 onSelect：把命中的 node/child 转换为 selectedDocumentId 并写入 store。

决策 22 — i18n（zh / en）
文档模式 UI 文案（LeftRail "Inbox/All Notes/Archive/Folders/Views/Types"、NoteList 空状态、EditorToolbar 工具按钮 aria-label）目前是硬编码英文，需要走 paraglide。

开发计划（按里程碑）
╭─ M1 「冻结与切换语义」（0.5d） ───────────────────────────────╮
│ - setLayoutMode 重写：进入 document 时 reset focusedNode /   │
│   focusedFolder / contextMenu / createMenuOpen              │
│ - useCanvasKeyboard 在 document 模式下短路 Enter/Esc/Delete │
│   /Cmd+A/Cmd+N                                              │
│ - 单测覆盖切换路径                                            │
╰──────────────────────────────────────────────────────────────╯
╭─ M2 「排序 + 搜索集成」（0.5d） ──────────────────────────────╮
│ - NoteList: 默认 updatedAt desc + 排序按钮交互               │
│ - SearchDialog onSelect 分支：layoutMode==='document' 时写   │
│   selectedDocumentId（含 child:fid:cid 形式）                 │
│ - 单测                                                       │
╰──────────────────────────────────────────────────────────────╯
╭─ M3 「设置项 defaultLayoutMode」（0.5d） ─────────────────────╮
│ - bun 端 app-config.json 增加 preferences.defaultLayoutMode  │
│ - settings 窗口加单选；启动时读取，覆盖 localStorage 默认值   │
╰──────────────────────────────────────────────────────────────╯
╭─ M4 「i18n zh/en」（0.5d） ───────────────────────────────────╮
│ - messages/{en,zh}.json 增 17 个 key（document.*）           │
│ - LeftRail / NoteList / DocumentEditor / EditorToolbar 替换 │
│   硬编码字符串                                                │
╰──────────────────────────────────────────────────────────────╯
╭─ M5 「Folder 子卡片迁移到 noteId + .md」（1.5d） ─────────────╮
│ - addFolderChild：创建独立 md（rpcSaveNote）+ 分配 noteId    │
│ - children 保留 { id, noteId, file } 引用（去掉内嵌 data）   │
│ - 兼容旧 manifest：load 时迁移内嵌 children → 新结构         │
│ - DocumentEditor / FolderView 的 useResolvedDocument 改成读 │
│   noteId 对应文件                                             │
│ - 删 children 时同步删 md（参考 deleteNodes 路径）           │
│ - 单测：迁移、新增、删除、Extract to Canvas                   │
╰──────────────────────────────────────────────────────────────╯
╭─ M6 「打磨 + 验证」（0.5d） ──────────────────────────────────╮
│ - 删除子卡片右键菜单仅文档模式不显示 Extract                  │
│ - Tiptap Cmd+Z 冒泡阻断验证                                   │
│ - 切换模式手动 QA：drill-down → document → canvas 连贯       │
│ - bun run ci + bun run test 全绿                             │
╰──────────────────────────────────────────────────────────────╯
合计约 4 天（单人）。M1–M4 互不耦合，可并行；M5 是最大改动，建议独立 PR 并优先做 manifest 迁移测试。
