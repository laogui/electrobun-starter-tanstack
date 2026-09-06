# Canvas type behavior matrix (Phase 0)

Baseline for RFC-1. Values come from `src/mainview/lib/canvasNodeRegistry.ts`, the current canvas predicates / focused-view routing, and `src/mainview/components/canvas/ContextMenu.tsx` legacy builders. Later phases must not change a migrated type relative to this table unless the RFC calls the change out.

Context menu legend (used in the last column):

- **Host** — host-owned generic actions (`focus`, `change-color`, `edit-tag`, `copy`, `lock`/`toggle-lock`, `detach-from-canvas`, `delete`, plus card/sticky extras). Restored for extensions by gap-closure T1.
- **Type** — type-contributed actions (`open-link`, `replace-image`, `reveal-in-finder`, …). Restored for extensions by gap-closure T2.

| Kind | RF `node.type` | Default size | Open | Group | Folder | Preview | Search / export notes | Context menu actions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Note | `card` | 350×450 | Focused view | Yes | Yes | Card content | Note body + title | Host: focus, copy, copy-as-markdown, change-color, edit-tag, ai-summarize, lock, detach-from-canvas, export-markdown, delete |
| Checklist | `widget` | 320×340 | Canvas only | Yes | Yes | Widget read-only | Widget sidecar | Host: copy, lock, delete |
| Pomodoro | `widget` | 320×340 | Canvas only | Yes | Yes | Widget read-only | Widget sidecar | Host: copy, lock, delete |
| Reminder | `widget` | 320×340 | Canvas only | Yes | Yes | Widget read-only | Widget sidecar | Host: copy, lock, delete |
| Sticky | `sticky` | 200×200 | Canvas only | Yes | No | Inline text | Manifest content | Host: copy, change-color, edit-tag, ai-summarize, lock, delete |
| Folder | `folder` | 280×280 | Expand / edit | Yes | No | Folder chrome | Title + children | Host: open-folder, edit-folder, new-child, lock, delete |
| Group | `group` | 500×300 | Canvas only | No | No | Group chrome | Label | Host: change-color, lock, delete |
| Image | `image` | 350×350 | Focused view | Yes | Yes | Image content | Attachment + title | Host: focus, copy, change-color, edit-tag, lock, detach-from-canvas, delete. Type: replace-image, copy-image-address, reveal-in-finder, rename-asset |
| File | `asset` | 350×260 | Focused view | Yes | Yes | Asset content | Attachment + title | Host: focus, copy, change-color, edit-tag, lock, detach-from-canvas, delete. Type: reveal-in-finder, replace-file, rename-asset |
| Link | `link` | 380×360 | Focused view | Yes | Yes | Link content | URL + unfurl | Host: focus, copy, change-color, edit-tag, lock, detach-from-canvas, delete. Type: open-link, copy-url, refetch-link, edit-url |
| Recording | `recording` | 380×150 | Canvas only | Yes | Yes | Recording content | Attachment + title | Host: copy, change-color, edit-tag, lock, delete (no focus; canvas only). Type: reveal-in-finder, rename-asset |
| Extension (new) | `extension` | Per Canvas Type | Per `openBehavior` | Per type (`canEnterGroup`) | Per type (`canEnterFolder`, default false) | `PreviewSurface` / presentation fallback | Host-derived presentation | Assembled from the canvas type: Host items from `openBehavior` + `interactions`; Type items from `menuActions`. Migrated link/image/file/recording must match the legacy row above. Productivity widgets stay copy/lock/delete. |

Undo layers (unchanged):

- Focus / pointer inside a widget or extension surface: instance history (`Cmd+Z`).
- Otherwise: canvas history.

Demo Counter (`ghostboard.demo/counter`, DEV only): 240×200, `openBehavior: 'none'`, group yes, folder no.
