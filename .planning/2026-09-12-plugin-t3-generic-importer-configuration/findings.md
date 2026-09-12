# Findings & Decisions

## Requirements
- When more than one registered importer matches a selected file, the user must explicitly choose which importer runs.
- The host must own bounded field mapping rather than requiring every format plugin to build arbitrary mapping UI.
- The user must explicitly choose detached Notes or a target canvas plus a deterministic placement policy before commit.
- Temporary assets produced during parse/configuration must be activation/session scoped and cleaned on cancellation, replacement, failure or lifecycle retirement unless successfully committed.
- Preserve the completed single-batch and segmented retry/rollback behavior.

## Research Findings
- The current Workbench exposes one button per importer, and each button opens its own native picker; overlapping filters therefore never produce an explicit post-selection importer choice.
- Existing importer parse results are already host-owned immutable previews with single or explicit segmented Note groups.
- Canvas placement currently has two materially different paths: the active view can be mutated through `canvasStore`, while a non-active view requires loading and saving its manifest directly. The generic-import contract must avoid silently clobbering concurrent canvas edits.
- Attachment saves become durable workspace files immediately after their internal temp-file rename; there is no importer-scoped stage/commit/abort lifecycle yet.
- File handles are scoped to a plugin activation. A picker shared across different plugins therefore cannot safely pass the same handle to whichever importer is chosen without an explicit host-side reissue/transfer primitive.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Preserve legacy importers; make generic field mapping opt-in through a bounded inspection contract. | Existing packaged importers must continue to select and parse without a new confirmation step, while generic tabular importers can expose source fields for host-owned mapping to `title`, `text`, and `color`. |
| Treat `title` as the required target and `text` / `color` as optional targets. | These are the complete bounded `NoteContentCreate` surface; an arbitrary schema or plugin-rendered configuration UI would not be host-owned. |
| Choose detached versus canvas placement before commit; canvas placement targets a named view and uses a deterministic grid or vertical strategy. | This satisfies the T3 target/placement requirement without silently inventing layout. |
| Canvas placement is a follow-up host operation, not part of the content transaction. If it fails, created Notes remain detached and placement is retryable from the same session. | Content batch receipts and canvas manifests have no cross-store transaction or CAS. Claiming atomicity would be false; preserving Notes is safer than overwriting canvas state or compensating over concurrent edits. |
| Before placing, switch through the existing safe view-switch path and require the target view to be hydrated. | The active view path owns current renderer edits and persistence; direct background-manifest writes could clobber changes without revision checks. |
| Define the temporary-asset boundary in this slice as the selected opaque source-file capability, and release it at every session/lifecycle terminal. | This is the temporary resource the current Note importer contract actually owns. Workspace attachment staging/promotion is a separate absent contract and is explicitly not claimed here. |
| Limit canvas placement to the existing 1–100 Note atomic form; segmented imports stay detached. | This preserves segmented conflict-safe rollback and avoids inventing a cross-content/canvas transaction for up to 5,000 placements. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Initial planning-file patch used wording not present in the generated template. | Re-read the planning files and patched against their actual headings and entries. |

## Resources
- `docs/features/In Progress/trusted-plugin-t3-plan.md`
- `.planning/2026-09-12-plugin-t3-segmented-import/`
- `src/mainview/plugins/runtime/PluginRuntime.ts`
- `src/mainview/plugins/runtime/PluginWorkbench.tsx`
- `src/mainview/store/canvasStore.ts`
- `src/bun/attachments.ts`
