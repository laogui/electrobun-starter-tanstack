# Canvas type behavior matrix (Phase 0)

> 状态：D0-1 目标规则、gap-closure T0–T6 与 D0-3 生命周期/异常回归已同步；2026-09-07 桌面验收覆盖 Productivity 创建、打开、实例 Undo、重载、Folder 新放置拒绝及 legacy Folder 无损迁移/搜索/打开/提取。D0 已完成（收口时 164 files / 1486 tests；当前串行全量 167 files / 1509 tests）。D1-1 至 D1-4 的搜索可达性、文库/恢复矩阵已完成自动化验证，2026-09-07 已完成桌面走查；公开插件方案仍单独跟踪。

Baseline for RFC-1. Values come from `src/mainview/lib/canvasNodeRegistry.ts`, the current canvas predicates / focused-view routing, and `src/mainview/components/canvas/ContextMenu.tsx` legacy builders. Later phases must not change a migrated type relative to this table unless the RFC calls the change out.

Context menu legend (used in the last column):

- **Host** — host-owned generic actions (`focus`, `change-color`, `edit-tag`, `copy`, `lock`/`toggle-lock`, `detach-from-canvas`, `delete`, plus card/sticky extras). Restored for extensions by gap-closure T1.
- **Type** — type-contributed actions (`open-link`, `replace-image`, `reveal-in-finder`, …). Restored for extensions by gap-closure T2.

| Kind | RF `node.type` | Default size | Open | Group | Folder | Preview | Search / export notes | Context menu actions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Note | `card` | 350×450 | Focused view | Yes | Yes | Card content | Note body + title | Host: focus, copy, copy-as-markdown, change-color, edit-tag, ai-summarize, lock, detach-from-canvas, export-markdown, delete |
| Checklist | `widget` | 320×380 | Focused view | Yes | No | Widget read-only | Widget sidecar / extension instance | Host: focus, copy, lock, delete |
| Pomodoro | `widget` | 320×380 | Canvas only | Yes | No | Widget read-only | Widget sidecar / extension instance | Host: copy, lock, delete |
| Reminder | `widget` | 320×380 | Canvas only | Yes | No | Widget read-only | Widget sidecar / extension instance | Host: copy, lock, delete |
| Sticky | `sticky` | 200×200 | Canvas only | Yes | No | Inline text | Manifest content | Host: copy, change-color, edit-tag, ai-summarize, lock, delete |
| Topic | `topic` | Auto-measured from title | Canvas only (inline title edit) | Yes, whole branch only | No | Inline title | Manifest content (title) | Host: copy, change-color, lock, delete. Type: edit-topic-title, topic-new-child, topic-new-sibling, topic-select-branch, topic-detach-branch, topic-delete-branch (no tags, no focus, no detach-from-canvas) |
| Folder | `folder` | 280×280 | Expand / edit | Yes | No | Folder chrome | Title + children | Host: open-folder, edit-folder, new-child, lock, delete |
| Group | `group` | 500×300 | Canvas only | No | No | Group chrome | Label | Host: change-color, lock, delete |
| Image | `image` | 350×350 | Focused view | Yes | Yes | Image content | Attachment + title | Host: focus, copy, change-color, edit-tag, lock, detach-from-canvas, delete. Type: replace-image, copy-image-address, reveal-in-finder, rename-asset |
| File | `asset` | 350×260 | Focused view | Yes | Yes | Asset content | Attachment + title | Host: focus, copy, change-color, edit-tag, lock, detach-from-canvas, delete. Type: reveal-in-finder, replace-file, rename-asset |
| Link | `link` | 380×360 | Focused view | Yes | Yes | Link content | URL + unfurl | Host: focus, copy, change-color, edit-tag, lock, detach-from-canvas, delete. Type: open-link, copy-url, refetch-link, edit-url |
| Recording | `recording` | 380×150 | Canvas only | Yes | Yes | Recording content | Attachment + title | Host: copy, change-color, edit-tag, lock, delete (no focus; canvas only). Type: reveal-in-finder, rename-asset |
| Extension (new) | `extension` | Per Canvas Type | Per `openBehavior` | Per type (`canEnterGroup`) | Per type (`canEnterFolder`, default false) | `PreviewSurface` / presentation fallback | Host-derived presentation | Assembled from the canvas type: Host items from `openBehavior` + `interactions`; Type items from `menuActions`. Migrated link/image/file/recording must match the legacy row above. Checklist adds host focus; Pomodoro/Reminder stay copy/lock/delete. |

The Topic row records the behavior that is implemented today, not the full frozen target. Seven plan clauses are still open (layout avoidance, draft flush on canvas leave, the Tab command context and its Esc exit, outline-export gating on invalid relations, copy/tidy branch actions, write protection plus manifest backup, and quota parity on copy/import) — see TG-1–TG-7 in [development plan §1.1](../../development-plan.md#11-topic-与轻量思维导图2026-09-14). Desktop acceptance has not started, so no Topic row here is accepted.

Topic rows describe a core host type, not an extension. Hierarchy lives only on `labeledEdge` records carrying `data.kind: 'topic-child'`; those tree edges are host-owned (no label edit, no animation toggle, no `pathType` switch, no independent color, no direct delete) and every generic edge command is guarded, not merely hidden. A whole topic tree must stay inside one canvas and one direct Group container: dragging or Group entry/exit moves the entire branch, and partial cross-container operations are refused. Any locked topic inside a branch blocks the branch from moving. Topic shares the free-tier node quota with `card` and `sticky`.

`Folder: No` is the admission rule for newly placed Productivity instances. It is not a deletion or coercion rule: legacy Folder-contained `widget` entries and already-migrated `extension` entries remain previewable, searchable, and extractable, and extraction must preserve their stored runtime type and data.

Undo layers (unchanged):

- Focus / pointer inside a widget or extension surface: instance history (`Cmd+Z`).
- Otherwise: canvas history. Topic tree transactions (draft commit, title commit, branch detach, branch delete, single-topic delete with the relayout it triggers) update `nodes` and `edges` in one commit, so each is exactly one canvas history step. Uncommitted topic drafts stay in memory and never enter the graph or history.

Demo Counter (`ghostboard.demo/counter`, DEV only): 240×200, `openBehavior: 'none'`, group yes, folder no.
