# Markdown 变只写（Plan C — Phase 3）

> ⚠️ 已废弃 / 改写：本文原方案（保留 `.md` mirror、只是停止回读）已被
> `docs/decisions/0002-json-sot-markdown-export.md` 与
> `docs/markdown-storage-remediation-plan.md` 取代为 **markdown-export-only**：
> 保存时不再生成或更新任何 `.md`，note 内容与元数据全部落 sidecar JSON，
> Markdown 仅由用户主动“导出”生成。下文中“`saveBlockNote` 仍写两份（JSON + markdown export）”
> 等表述以新方案为准（不再写 `.md` mirror）。本文保留作历史记录。

> 落地 ADR 0001 第三步：删除 Markdown body 的回读 / 冲突检测 / 自动恢复路径，Markdown 降级为单向 export。

## 一、问题

`src/bun/blocknote.ts` 当前维护 4 态判定：

| 当前 markdown hash | sidecar JSON | 行为 |
|---|---|---|
| 未变 | 有 | 加载 JSON |
| 变化 | 无未提交改动 | 从 markdown re-import |
| 变化 | 也比 frontmatter 新 | 标记 conflict + 落副本 |
| — | 损坏 | 从 markdown 恢复 |

这套逻辑：

- 是当前 persistence 层最复杂的部分
- 在 ADR 0001 后大部分场景都不会触发（JSON 是 SoT，conflict 是定义里的"不应发生"）
- 仍消耗维护成本，每次 frontmatter / hash 字段变动都要同步它

## 二、目标

- 删除自动 reconcile：用户从外部编辑 `.md` 后，应用**不会**自动覆盖、也不会自动导入
- 提供显式入口"从 Markdown 重新导入"（菜单项），手动触发时才走 import → blocks 路径
- frontmatter 不再写 `markdownHash`（保留 `blocknoteHash` + `blocknoteRevision`）
- 文件冲突 → 不存在概念了：用户编辑的 `.md` 永远不会被自动写回；应用编辑的 sidecar 永远不依赖 `.md`

## 三、变更清单

### 3.1 删除

- `detectExternalMarkdownChange()`
- `markdownHash` 字段及所有读写
- `recoveredFromMarkdown` 信号 + 横幅 UI（保留 toast 用于显式 import）
- `<note>.conflict-<timestamp>.md` 副本生成

### 3.2 保留

- `saveBlockNote` RPC 仍写两份（JSON + markdown export）— JSON 优先，markdown 失败不阻塞
- sidecar 损坏 / 缺失时的 markdown 恢复路径：升级为**显式菜单项**「从 Markdown 重新导入」，调用 `recoverFromMarkdown(noteId)` RPC

### 3.3 新增

- focused view 工具栏 / 卡片右键菜单项：「从 Markdown 重新导入」(用 `Tooltip` 标注：会覆盖当前编辑器内容)
- 二次确认对话框：明确告知"会丢失高级块结构"
- 操作走 `recoverFromMarkdown` RPC：从 .md 解析 blocks → 写 sidecar → 触发 query invalidate

## 四、测试

- 删除：`detectExternalMarkdownChange` 相关用例
- 新增：`recoverFromMarkdown` RPC 测试（含菜单触发 + 用户确认 + sidecar 替换 + 撤销路径）
- 验证：外部编辑 `.md` 后再次打开 note，**不会**触发自动 reconcile

## 五、风险

- 用户可能误以为 `.md` 改了会同步 → 文档 + 首次启动 onboarding 文案明示
- 高级用户可能依赖 conflict 副本作为安全网 → 提供「定时 sidecar 备份」作为替代（独立功能，不在本 phase）

## 六、依赖

- Phase 1（node metadata sidecar）— 已完成
- Phase 2（preview from JSON）— 已完成
- BlockNote markdown → blocks parser 已有（`tryParseMarkdownToBlocks`）

## 七、验收

- frontmatter 检查：不再含 `markdownHash`
- 外部编辑 `.md` → 重开应用 → 加载 sidecar 版本，markdown 改动**不可见**
- 「从 Markdown 重新导入」入口可用、二次确认有效
- persistence 层代码量减少（预期 -300 行）
- `bun run test` 全绿
