# Findings & Decisions

## Requirements
- Support imports larger than 100 notes through explicit bounded segments rather than one oversized atomic batch.
- Expose completed ranges and failed segment state honestly; allow retry of the same segment and continuation after a recoverable failure.
- Give every segment stable idempotency identity so an uncertain response can be retried without duplicate notes.
- Rollback only notes that remain at their imported revisions; later user edits must survive and be reported as conflicts.
- Keep generic field mapping, importer choice, target canvas placement, temporary assets and general packaging CLI outside this slice.

## Research Findings
- The completed first importer slice validates exactly 1–100 notes and commits them with one stable `plgimport_*` operation ID through `content.createMany`.
- Failed confirmation retains the preview and reuses the same operation ID; successful confirmation closes the session.
- Import preview validation currently lives in renderer `importers.ts`; the host-owned session state machine is implemented inside `PluginRuntime`, not a standalone `importerSessions.ts` module.
- The complete files service now provides bounded streaming/range reads and non-persistent file handles, so large parsers can process source files incrementally without expanding the importer slice into generic mapping UI.
- Bun `NoteContentService` stores each creation batch, exact created documents and operation receipts in the persistent v3 content journal. Identical retries deduplicate across restart; different input with the same ID fails.
- Creation undo compares every current note byte-for-byte with its imported document and scans live/canvas/trash/content references before any deletion. A modified or referenced note rejects the entire batch, which is already a conflict-safe primitive at segment granularity.
- The 8 MiB content history and 32 MiB durable-intent limits remain authoritative. Segmented import must surface a later segment failure honestly rather than claiming the whole source was atomic.
- Public `content.undo` already supplies current live-note references and exposes conflict codes, so host-owned rollback orchestration does not require a second Bun mutation endpoint.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Preserve the existing 100-note `notes` result as the single-segment compatibility form | Existing importers and tests should continue to work unchanged while a new explicit segmented form opts into multi-batch behavior. |
| Segmented parse results use `segments`, with 1–100 notes per segment and more than 100 total | This makes the loss of whole-import atomicity an explicit author decision and directly matches the host transaction ceiling. |
| The renderer retains the completed segmented session until the user closes it | The user can inspect completed/conflicted ranges and request rollback; the original single-batch success behavior still closes immediately. |
| Rollback conflicts are range-granular | Existing creation undo safely rejects an entire segment if any note was edited or referenced. Other clean segments can be undone without touching that range. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `docs/features/In Progress/trusted-plugin-t3-plan.md`
- `.planning/2026-09-12-plugin-t3-complete-files-service/`
- `src/mainview/plugins/runtime/importers.ts`
- `src/mainview/plugins/runtime/PluginRuntime.ts`
- `src/bun/plugins/noteCreation.ts`
