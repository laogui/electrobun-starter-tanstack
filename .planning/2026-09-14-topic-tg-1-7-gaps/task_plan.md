# Task Plan: Topic TG-1–TG-7 gap closure

## Goal

Implement the seven Topic mindmap scheme clauses (TG-1–TG-7) that 2026-09-14 review found missing, with adjacent Vitest coverage, dual-locale copy, and development-plan §1.1 status updates. Do not mark any P0–P3 stage as accepted.

## Next Step

Confirm all seven TG rows are updated and no P0–P3 stage is marked accepted.

## Current Phase

Phase 6

## Phases

### Phase 1: Requirements & Discovery
- [x] Read topicLayout, topicTree, canvasStore Topic paths, keyboard, export, menu, persistence, quota
- [x] Document entry points and constraints in findings.md
- **Status:** complete

### Phase 2: TG-1 layout avoidance
- [x] Add obstacle set, bounded search, Group hard bounds, soft-fail toast, hard-fail keep-draft
- [x] Tests in topicLayout.test.ts and store/layout integration
- [x] type-check / check / test; update only TG-1 row
- **Status:** complete

### Phase 3: TG-2 + TG-3 draft flush and command context
- [x] Flush non-empty draft on view leave; clear topicDraft/editingTopicId
- [x] Explicit Topic command context; Esc exits so Tab is not intercepted by selected-only
- [x] Messages + mocks; tests
- [x] type-check / check / test; update TG-2 and TG-3 rows
- **Status:** complete

### Phase 4: TG-4 + TG-5 outline gate and branch actions
- [x] export-topic-outline rejects when index.problems or unsupported versions; no silent drop
- [x] Context menu: copy-branch and tidy-branch
- [x] Messages + mocks; tests
- [x] type-check / check / test; update TG-4 and TG-5 rows
- **Status:** complete

### Phase 5: TG-6 + TG-7 persistence protection and quota
- [x] Lossy-decode pause persistence writes; backup manifest before first Topic write
- [x] Quota on paste / duplicate / import consistently
- [x] Messages + mocks; tests
- [x] type-check / check / test; update TG-6 and TG-7 rows
- **Status:** complete

### Phase 6: Delivery
- [x] Confirm all seven TG rows updated, no stage marked accepted, forbidden areas untouched
- **Status:** complete

## Key Questions

1. How does current tidy-tree layout compute positions and what collision helpers exist?
2. Where is setActiveView / topicDraft / commitTopicDraft implemented?
3. How is Tab intercepted today and what selected-only path exists?
4. How does export-topic-outline and buildTopicOutline handle cycles/problems?
5. How do existing branch menu actions commit graph transactions?
6. Where is persistence write-pause / manifest backup already done for other features?
7. Where do paste / duplicate / import create nodes and how does createNode check quota?

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Isolated plan under `.planning/2026-09-14-topic-tg-1-7-gaps/` | Parallel-task isolation; do not overwrite root T4 task_plan.md |
| Batch TG-2+TG-3, TG-4+TG-5, TG-6+TG-7 after TG-1 | Related surfaces share files; still update only completed TG rows per batch |
| Do not move templates or mark stages accepted | User hard constraints |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes

- Tree edges (`data.kind: 'topic-child'`) stay host-managed: no label/animation/pathType/color edits.
- Each tree op is one transaction: compute+validate next graph, `saveSnapshot()`, one `set()` for nodes+edges.
- Do not revert `src/paraglide/runtime.js`.
- Do not touch `src/bun/templates/brainstorm-mindmap/` or `packages/create-plugin/templates/`.
