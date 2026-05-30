# Markdown 存储整改总方案 — v0.2 增订

- 状态：Draft
- 日期：2026-05-29
- 基线：`docs/markdown-storage-remediation-plan.md`（v0.1）
- 关联：`docs/features/Planned/preview-from-blocknote-json.md`、`docs/features/Planned/node-metadata-sidecar.md`

本文不重写基线，只补几处在 review 中识别出的缺口。每条按 `id` 引用，便于合入主方案时对齐章节。

## A. 缺口与补丁

### A1. Attachment URL 在 preview 里的出口（补 §4 / Phase 2）

Phase 2 任务清单要求 image/file/video/audio block「给稳定占位」，但没规定 preview HTML 里 attachment 路径用什么 scheme，导致 NotePreview 拿到 HTML 后浏览器解析不到 workspace 文件（当前 bug 的直接成因）。

二选一，落到 §4.2 / Phase 2 任务清单：

- **方案 1（推荐）**：注册 Electrobun 自定义 scheme `gb-asset://<wsRelative>`，bun 侧 schema handler 按需返回文件流。preview serializer 写 `<img src="gb-asset://attachments/xxx.png">`，sanitize 白名单扩展 `allowedSchemes: ['http','https','mailto','gb-asset']`。一次性基础设施投入，零运行时 RPC。
- **方案 2（兜底）**：serializer 写 `<img data-attachment-path="attachments/xxx.png" src="" loading="lazy">`，NotePreview 在 mount 时用 IntersectionObserver 懒解析、`rpcLoadAttachment` 转 data URL，加 LRU 缓存。无新基础设施但每张图一次 RPC + 内存里多份 base64。

建议方案 1 作为长期路线，方案 2 仅作为 Phase 2 落地前的过渡，不长期保留。

### A2. Sidecar revision 乐观锁（补 §4.2 / §6.2）

JSON 成为唯一源后，`revision` 必须从「日志字段」升格为「写入保护机制」：

- `saveBlockNote` RPC 入参增加 `expectedRevision`。
- bun 写盘前比对当前 sidecar 的 `revision`：
  - 一致 → 写盘，`revision += 1`，返回 `{ ok: true, revision }`。
  - 不一致 → 不写，返回 `{ ok: false, current: <latest sidecar> }`，由 renderer 决定 merge / 覆盖 / 放弃。
- 默认 UX：mismatch 时弹一次「检测到外部更新，重新加载？」，不要静默覆盖。
- 单窗口编辑下 mismatch 永远不应发生；落入日志作为 invariant 监控。

如果决定显式声明「单窗口编辑」模型不考虑并发，至少把这条假设写进 §4.2，并在 README/onboarding 提一句多窗口同 note 编辑不被支持。

### A3. `rebuildAllPreviews` 后台重算入口（补 Phase 2）

JSON SoT 带来的红利之一：bun 端能离线遍历 sidecar 批量重算 preview，不再依赖 renderer 打开卡片。建议在 Phase 2 任务清单加：

- [ ] `rpcRebuildAllPreviews(wsPath, { fromVersion?: number, dryRun?: boolean })`
  - 扫描所有 sidecar，`preview.version < currentVersion` 的全部重算。
  - 写盘按 noteId 串行 + 节流，避免 IO 抖动。
  - workspace 打开完成后异步触发一次（progress 隐式）。
  - 设置页加显式「重建预览缓存」按钮，用于 schema 升级 / 排障。

这条解决 previewVersion 字段在 v0.1 体系里「升级后无法生效」的死结。

### A4. Schema migration 章节（补 §6.3）

风险表里只把 schema 当 JSON 损坏时的兜底，但 schema 演进是常态。新增 §6.3 描述：

- sidecar `schema` 字段格式：`ghostboard-blocknote/v{N}`、`preview/v{M}`、`node-metadata/v{K}` 等独立版本号。
- 读路径：load 时识别 schema，落后 → in-place lazy 迁移；当前进程内升级，写回时使用新 schema。
- 写路径：永远写 current schema。
- 不兼容跨度（major bump）：触发显式 migration step，进入 onboarding 模态告知用户，备份原文件到 `.ghostboard/backup/<timestamp>/`。
- preview `version` 与 sidecar `schema` 解耦：preview 可单独升版，不必动 blocks schema。

### A5. Phase 依赖图调整（修正 §5 / §9）

Phase 1 / 2 / 3 / 4 在原文里视为线性，但落地节奏存在隐性硬依赖。建议：

```text
Phase 0 (文档冻结)
   ├── Phase 1 (saveManifest 切断)              ─┐
   ├── Phase 2 (preview from JSON)               │  互相独立可并行
   └── Phase 4.1 (单篇 Markdown 导出)            ─┘
            │
            ▼
       Phase 3 (停止自动写 Markdown，删 reconcile)
            │
            ▼
       Phase 4.2 (批量导出)
            │
            ▼
       Phase 5 (清理 legacy 代码与测试)
```

关键变化：**Phase 4.1 提前到 Phase 3 之前作为前置条件**。否则在 Phase 3 落地、批量导出未 ship 的窗口里，用户失去 `.md` 自动同步、又没有任何方式取最新版本笔记，对外只能拿到 stale 文件。

§9「推荐优先级」相应调整为：
1. P0：Phase 1（saveManifest 切断）
2. P0：Phase 2（preview from JSON）— 与 1 并行
3. P1：Phase 4.1（单篇导出）— Phase 3 的前置
4. P1：Phase 3（停止自动写 Markdown）
5. P2：Phase 4.2（批量导出）
6. P2：Phase 5（清理）

### A6. Legacy 卡片 discriminator 与迁移表（补 Phase 1）

Phase 1 说「legacy checklist / plain text card 暂时保留旧路径」，但没规定 discriminator 和升级时机。补一张表：

| Note 文件状态 | discriminator 判定 | saveManifest 行为 | 升级时机 |
|---|---|---|---|
| 有 sidecar JSON | sidecar 存在 | 只写引用，正文不动 | 已升级 |
| 无 sidecar、`displayHint: checklist` | 无 `blocknoteFile` 且 hint=checklist | 走 legacy `cardDataToNote` | 用户首次进 focused view 时一次性导入为 sidecar |
| 无 sidecar、纯文本 | 无 `blocknoteFile` 且 hint=note | 走 legacy `cardDataToNote` | 同上 |
| sidecar 损坏 | sidecar 存在但 schema 不识别 | 拒绝写正文，提示用户 | 走 §6.1 损坏分支 |

升级动作必须显式（不在画布加载时静默批量改写），避免「打开 workspace 就把所有 `.md` 都写花」的副作用。

### A7. Node metadata 与 note sidecar 的字段边界（补 §4.2）

`docs/features/Planned/node-metadata-sidecar.md` 已经定义 tag / tagColor / tags 走独立 sidecar，但 §4.2 未明确「note 自身属性」与「跨节点元数据」的拆分原则。补一行：

| 字段 | 归属 |
|---|---|
| `title`、`color`、`createdAt`、`updatedAt` | note sidecar JSON |
| `tag`、`tagColor`、`tags` | `node-metadata.json` |
| `position`、`width`、`height`、`parentId` | canvas manifest |
| `editor`、`blocknoteFile`、`previewHash` | note sidecar JSON |
| 跨 note 的关系 / 引用图 | `node-metadata.json` 或独立索引 |

Phase 5 收敛 `cardDataToNote` 时按此表迁移，避免反复重构。

## B. 验收补充（补 §10）

在原 §10 基础上追加：

- [ ] 在 sidecar `revision` mismatch 时不会发生静默覆盖（A2）。
- [ ] `rebuildAllPreviews` 能把 stale previewVersion 全部刷新到 current（A3）。
- [ ] 升级 sidecar schema 后旧文件能 in-place 迁移成功且原文件已备份（A4）。
- [ ] preview HTML 中 attachment 引用能在 NotePreview 中正确显示（A1）。
- [ ] legacy 卡片在不进入 focused view 时不会被静默改写（A6）。

## C. 待决策项

留给主方案 v0.2 正式合入前的两个 open question：

1. **A1 选方案 1 还是方案 2？** 影响 sanitize 白名单、Electrobun 主进程配置、迁移期渲染稳定性。
2. **A2 是否声明「单窗口编辑」假设？** 决定是否真的实现乐观锁，还是只做检测 + 警告。

确认后把本文合入 `markdown-storage-remediation-plan.md` 主体，作为 v0.2。
