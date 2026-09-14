# Findings: Topic TG-1–TG-7

## Requirements

- TG-1 §5: obstacle set, bounded down/out search, Group hard bounds, soft-fail toast, hard-fail keep-draft
- TG-2 §3.1/§4.4: commit non-empty draft before leaving canvas; clear draft state
- TG-3 §3.2: explicit Topic command context; Esc exits so Tab is not selected-only
- TG-4 §6/P3-M: block outline export when `index.problems` or unsupported versions; no silent omit
- TG-5 §3.3/§3.4: context menu copy-branch + tidy-branch
- TG-6 §4.2/§4.3: pause persistence on lossy decode; backup manifest before first Topic write
- TG-7 §6: quota on paste / duplicate / import, same tally as card/sticky/topic

## Research Findings

### TG-1
- `topicLayout.ts` exports `layoutTopicTree`, `diffTopicPositions`, `translateTopicBranch` (tests only). Pure tidy-tree.
- `relayoutTopicTree` (canvasStore 294–339) only rejects locked moved nodes.
- Collision helpers already exist: `buildAbsoluteRects`, `findNearestFreePosition*`, `resolveNodePlacement` (root drafts only).
- Group layout is local coords; collision must convert to absolute.
- Missing i18n: overlap warning, group-full hard fail.

### TG-2
- No `startTopicDraft`; APIs are `beginTopicDraft` / `beginTopicRelativeDraft`.
- `setActiveView` (2286–2314) clears nodes/edges/focus/undo, not `topicDraft` / `editingTopicId`.
- `switchView` flushes persisted nodes/edges only.
- `routes/index.tsx` 1775–1776 merges draft with no viewId check.
- `commitTopicDraft` 1715–1718 drops text if viewId mismatches.

### TG-3
- `useCanvasKeyboard.ts` 302–314 intercepts Tab on any single selected topic.
- Esc does not exit a Topic command context (none exists).
- TopicEditor handles Tab/Esc only while editing.

### TG-4
- `buildTopicOutline` omits cycle members; unsupported version → empty title.
- `useContextMenu.ts` 540–558 never reads `index.problems`.
- `topicTree.test.ts` currently treats cycle omission as intended.

### TG-5
- Menu: new-child / new-sibling / select-branch / detach / delete. No copy/tidy.
- `relayoutTopicTree` is private. `copySelected` already copies internal edges only.

### TG-6
- Structure freeze exists (`getStructurallyFrozenTopics`). No write-pause.
- `pendingFlushBackup` is crash-only. No pre-Topic manifest backup.
- Load does not parse Topics; sanitize passthroughs data.

### TG-7
- `COUNTED_NODE_TYPES` = card/sticky/topic. `hasNodeQuota` only from `createNode` and `commitTopicDraft`.
- paste / duplicate / JSON import bypass. Markdown import hits createNode per card.
- Quota toast is hardcoded English.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Avoidance lives in `topicLayout.ts` as pure functions | Scheme puts obstacle/search there; store stays a thin caller |
| Soft fail still commits + warning toast | §5: soft unsolved + hard OK → overlap allowed |
| Hard fail returns structured reason | Distinct toasts for group-full vs locked |
| Command context is store flag `topicCommandContextId` | Cannot infer from `selected` alone |
| Flush draft in `switchView`; always clear in `setActiveView` | User leave path commits; any view swap must not leak draft |
| Export gate in shared helper used by menu | Testable without RPC |
| Copy-branch fills clipboard (internal edges) | Matches existing copy semantics; one click vs select+copy |
| Tidy-branch = relayout from that topic as subtree root | Scheme: tidy the affected branch |
| Write-pause when unsupported/invalid records cannot be confirmed lossless | Distinguishes from structure freeze |
| First-Topic backup via Bun RPC once per view | Scheme §4.3; restore is explicit later, backup must exist this round |
| Quota helper takes additional counted count | Shared by paste/duplicate/import |

## Resources

- `src/mainview/lib/topicLayout.ts`, `topicTree.ts`, `collision.ts`, `resolvePlacement.ts`
- `src/mainview/store/canvasStore.ts`
- `src/mainview/hooks/useCanvasKeyboard.ts`, `useContextMenu.ts`, `useCanvasPersistence.ts`
- `src/mainview/routes/index.tsx`
- `src/shared/topic.ts`, `topicMarkdownExport.ts`
- `src/bun/manifest.ts`, `workspace.ts`
- `messages/en.json`, `messages/zh.json`
