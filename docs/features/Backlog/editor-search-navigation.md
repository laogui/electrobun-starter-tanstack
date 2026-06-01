# 编辑器、搜索与导航增强

> 迁移自 `docs/ux-optimization-audit.md`（2026-05-26 审计）
> 仅保留经代码核对后确认仍未实现的 P2/P3 打磨项
>
> 注：原审计的 8.1（无格式工具栏）和 8.2（无图片插入）因 TiptapEditor 已被 BlockNoteEditor 替换而自动失效，BlockNote 自带工具栏、slash 命令和文件上传。下列剩余项需在 BlockNote 语境下重新评估适用性。

---

## BlockNoteEditor — 富文本编辑器

### 代码块没有语法高亮

**优先级**: P2

需确认 BlockNote 默认 CodeBlock 是否已带 highligh.js / Shiki 集成；若未带，接入语法高亮库支持常见语言。

### 表格支持

**优先级**: P2

需安装 BlockNote 的 Table block 或自定义 block。

### 字数/词数统计

**优先级**: P3

### 查找替换

**优先级**: P3

### `[[双向链接]]`

**优先级**: P4（PRD 远期）

---

## ContextMenu — 右键菜单

### 不支持多选批量操作

**优先级**: P2

可以框选多个节点，但右键菜单只对单个节点生效。没有批量删除、批量改色、批量复制。

**建议**: 当 `selectedNodes.length > 1` 时，显示批量操作菜单：Delete N items, Copy N items, Change color。

### 缺少「复制为 Markdown」选项

**优先级**: P3

无法从右键菜单把卡片内容复制为 Markdown 文本。

**建议**: 在卡片右键菜单中添加 "Copy as Markdown"，将标题 + 正文写入剪贴板。

---

## SearchDialog — 搜索

### 搜索结果无结果总数

**优先级**: P2

返回多个结果时，用户不知道总共有多少条匹配。

**建议**: 在结果列表顶部或底部显示 `N results for "query"`。

### 没有搜索历史

**优先级**: P3

关闭搜索后历史清空，再次打开是空白输入框。

**建议**: 用 `localStorage` 保存最近 5-10 条搜索记录，打开搜索时显示「Recent searches」。

### 没有按类型筛选

**优先级**: P3

无法「只搜文件夹」或「只搜链接」。

**建议**: 在搜索框下方添加类型过滤 chips: `All | Notes | Folders | Links | Images`。

---

## ViewSwitcher — 画布切换器

### 模板子菜单只有 Kanban

**优先级**: P2

其他 8 个内置模板需要跳转到 `/templates` 页面。

**建议**: 将 `quick-start`、`brainstorm-mindmap`、`weekly-planner` 等高频模板加入子菜单。

### 新建画布自动命名为 "Canvas N"

**优先级**: P2

没有重命名弹窗，用户必须事后手动改名。

**建议**: 创建后自动进入 inline rename 模式（与画布列表中的 rename 逻辑复用）。

---

## FocusedView — 聚焦模式

### 没有「下一条/上一条」导航

**优先级**: P2

无法用 `←` / `→` 键在相邻卡片间切换聚焦。每次都必须退出 → 选择另一张 → 再进入。

**建议**: 在返回按钮旁添加 `<` / `>` 导航按钮，或支持 `Cmd+←` / `Cmd+→` 快捷键。

### 没有卡片位置面包屑

**优先级**: P3

进入聚焦模式后，只有返回箭头。不知道当前卡片属于哪个 Group/Folder。

**建议**: 在返回按钮旁显示 `{FolderName} > {CardTitle}` 面包屑。

### 点击遮罩关闭无保存确认

**优先级**: P2

点击黑色遮罩区域直接关闭聚焦模式，如果编辑器中有未保存的修改（debounce 未到期），可能丢失。

**建议**: 检测是否有未保存修改，有则显示 "Discard changes?" 确认。
