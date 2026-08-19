# Canvas type behavior matrix (Phase 0)

Baseline for RFC-1. Values come from `src/mainview/lib/canvasNodeRegistry.ts` and the current canvas predicates / focused-view routing. Later phases must not change a migrated type relative to this table unless the RFC calls the change out.

| Kind | RF `node.type` | Default size | Open | Group | Folder | Preview | Search / export notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Note | `card` | 350×450 | Focused view | Yes | Yes | Card content | Note body + title |
| Checklist | `widget` | 320×340 | Canvas only | Yes | Yes | Widget read-only | Widget sidecar |
| Pomodoro | `widget` | 320×340 | Canvas only | Yes | Yes | Widget read-only | Widget sidecar |
| Reminder | `widget` | 320×340 | Canvas only | Yes | Yes | Widget read-only | Widget sidecar |
| Sticky | `sticky` | 200×200 | Canvas only | Yes | No | Inline text | Manifest content |
| Folder | `folder` | 280×280 | Expand / edit | Yes | No | Folder chrome | Title + children |
| Group | `group` | 500×300 | Canvas only | No | No | Group chrome | Label |
| Image | `image` | 350×350 | Focused view | Yes | Yes | Image content | Attachment + title |
| File | `asset` | 350×260 | Focused view | Yes | Yes | Asset content | Attachment + title |
| Link | `link` | 380×360 | Focused view | Yes | Yes | Link content | URL + unfurl |
| Recording | `recording` | 380×150 | Canvas only | Yes | Yes | Recording content | Attachment + title |
| Extension (new) | `extension` | Per Canvas Type | Per `openBehavior` | Per type (`canEnterGroup`) | Per type (`canEnterFolder`, default false) | `PreviewSurface` / presentation fallback | Host-derived presentation |

Undo layers (unchanged):

- Focus / pointer inside a widget or extension surface: instance history (`Cmd+Z`).
- Otherwise: canvas history.

Demo Counter (`ghostboard.demo/counter`, DEV only): 240×200, `openBehavior: 'none'`, group yes, folder no.
