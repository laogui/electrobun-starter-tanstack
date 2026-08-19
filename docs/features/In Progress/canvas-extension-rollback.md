# RFC-1 rollback / forward-compat (Phase 0)

RFC §18.6 requires a conclusion before `extension` nodes are written to real workspaces.

## Question

If a newer build saves `type: 'extension'` (plus extra `data` fields) and the user rolls back to the current mainline, does the older build:

1. Render without crashing?
2. Persist those nodes and extra fields on the next save?

## Current-mainline evidence

Renderer `sanitizeForPersistence` / `serializeNodeForManifest` only strip known runtime keys. Unknown `node.type` values and unknown `data` fields are kept. Covered by `src/mainview/lib/canvasNodeSerialization.test.ts`.

Bun `saveManifest` special-cases `widget` and `card`. Every other type, including `extension` and future unknown types, is written back as received. Covered by `src/bun/index.test.ts` (`saveManifest keeps extension nodes and unknown extra fields`).

React Flow maps unknown types to its default node. That is a visual downgrade, not a crash.

## Conclusion

No updater floor is required before introducing `extension` nodes. Rolling back to the current published persist path keeps instance refs and extra fields. Instance sidecar files under `.ghostboard/extension-instances/` are ignored by older builds and remain on disk.

Widget files stay on the existing `.ghostboard/widgets/` path until a later migration phase. Canvas Export v2 is still out of scope for this slice.
