# Findings & Decisions

## Requirements
- T3 formally covers the complete SDK `files` flow, importers, installable builds, ZIP / HTTPS installation and combined plugins.
- Import must be host-owned from file selection through preview and confirmation; cancellation must leave no uncommitted content, and retries must not duplicate committed content.
- Final-user acceptance must use independent built packages without Bun, Node or dependency installation at install time.
- `@ghostboard/sdk/testing` and at least one template test are T3 deliverables under addendum A5.
- T4 retains safe mode, author signatures / TOFU, update transactions, code rollback and migration recovery.

## Research Findings
- T2 completed on macOS arm64 with session-level ordered canvas/plugin history; explicit durable note batch undo/redo remains available and is the likely safe commit primitive for imported notes.
- The platform document says application-level install state and workspace-level enablement are distinct; download/unpack must not execute package code, and enabling is the activation boundary.
- The platform acceptance checklist requires ZIP / HTTPS installation, capability/source/signature presentation, independent packages and no development tools in the final-user environment.
- The smallest T3 slice must still state partial completion and retry semantics; a single atomic bounded import may legitimately make partial completion zero-or-all while larger segmented imports remain later T3 work, if documented honestly.
- The repository already retains a substantial manifest-v2 installer: ZIP parsing/path limits, HTTPS download, prepared transaction preview/cancel/commit, application-level installed storage, workspace enablement, installed-tree integrity checks and a Settings `PluginsPanel` UI for local file or URL installation.
- Existing packaged T1/T2 probes commonly prepare and commit independent ZIP packages, then enable them through the same management/runtime path; T3 can extend that path instead of building a second distribution mechanism.
- Current public SDK declarations/runtime contain content, canvas, selection, storage, events and tasks, but no importer registration or complete public `files` API was found in the initial symbol audit.
- Product-native Markdown and attachment import utilities exist in the renderer, but they are canvas-specific UI flows rather than a plugin importer contribution contract.
- Manifest v2 intentionally has only one `entrypoints.app` and display-only capabilities; command, panel and canvas contributions are registered dynamically during `setup`, so importer registration should follow the same staged activation pattern instead of adding static contribution handlers to the manifest.
- Installed package summaries already distinguish application package storage from workspace enablement and verify a canonical installed-tree digest before activation. This is a usable final-user distribution substrate, not just legacy dead code.
- `PluginRuntime` stages per-activation registrations and publishes them only after candidate setup succeeds. Its view snapshot currently exposes commands, panels and canvas types; importers need a parallel activation-owned registry so failure/reload/disable cannot leak registrations.
- Public SDK operation cancellation consistently combines caller signals with the activation signal. The T3 file/import path should reuse that lifetime rule so workspace changes and plugin retirement cannot commit into a stale workspace.
- Settings already exposes local `.zip` / `.ghostboard-plugin`, development-directory and HTTPS inspection. Package details and digest are previewed before commit; stored packages remain disabled until a second explicit high-trust enable confirmation.
- Bun uses the native `Utils.openFileDialog` for existing package and product file choices. There is no general renderer RPC for a plugin-owned file picker yet.
- T0's `files` proof is explicitly opt-in test-only code that accepts arbitrary absolute paths for text read/write. It is not wired into the normal SDK/runtime and must not be promoted as-is; the formal T3 service needs request identity, workspace/lifecycle cancellation and bounded file-result validation.
- The normal local HTTP server already composes independently authenticated plugin content, storage and runtime hosts. A formal file host can follow this structure, while native selection itself stays an Electrobun RPC because it must invoke the OS dialog.
- Existing Settings installation already satisfies much of the user-facing ZIP/HTTPS storage path, but T3 still needs packaged evidence that an independently built installed package activates and contributes an importer—not only the development-directory probes used for prior runtime slices.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Start from a bounded note importer using the existing revision-checked note transaction layer | It can deliver preview/cancel/commit/retry/undo evidence without inventing rich-document or attachment authoring APIs. |
| Treat package signatures, automatic updates and safe mode as explicit T4 exclusions | These are separate stage exits in the accepted platform plan. |
| Make the first T3 importer a strict UTF-8 CSV-to-detached-Note flow capped at 1 MiB and 100 rows | It can use one existing atomic `createMany` batch, making cancel, failure and retry semantics provable without pretending segmented imports are already solved. |
| Publish opaque activation/workspace/process-bound file handles, not absolute paths | The public API remains portable and stale/cross-context handles can fail deterministically even though enabled plugins are explicitly high trust. |
| Put importer discovery in the existing Plugin Workbench | The current runtime already exposes activation-owned commands and panels there; this gives a user-triggered entry without coupling import execution to installation or creating a hidden card. |
| Use one stable content operation ID per import session and keep the preview after uncertain failure | Existing receipts provide retry deduplication; preserving the preview gives the user an honest retry path without creating duplicate notes. |
| Treat the first bounded batch as zero-or-all, not “partially complete” | `createMany` is atomic for at most 100 notes. Partial completion becomes real only when later T3 work introduces explicit segmented commits. |

## Frozen First-Slice Boundary
- Read-only `files.pick` plus strict UTF-8 `files.readText`; one file, 1 MiB maximum, opaque activation-scoped handles. Streaming, binary, write and directories remain later T3.
- Dynamic activation-owned importer registration with ID/title/filter/parse, staged publication and cleanup matching existing contribution types.
- CSV fixed columns `title`, `text`, optional `color`; 1–100 normalized detached Notes. Generic field mapping and target canvas placement remain later T3.
- Host preview in Plugin Workbench, explicit confirm/cancel, single atomic `createMany`, stable operation ID retry, batch identity retained for existing undo/redo.
- Packaged local-ZIP and loopback-HTTP acceptance in isolated roots using the same independently built combined package; normal product URL policy remains public HTTPS only.
- The formal plan is recorded in `docs/features/In Progress/trusted-plugin-t3-plan.md`.

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `docs/features/In Progress/trusted-plugin-platform.md`
- `docs/features/In Progress/trusted-plugin-platform-addendum-1.md`
- `docs/features/In Progress/trusted-plugin-t2-history-evidence.md`
- `packages/plugin-sdk/README.md`
