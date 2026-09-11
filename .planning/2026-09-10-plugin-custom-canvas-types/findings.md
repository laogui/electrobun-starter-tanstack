# Findings & Decisions

## Requirements
- T2 exit requires custom-card edit, restart, search, and missing-plugin display.
- Accepted design requires at least a type ID, state version, initial state, renderer, summary, and optional migration.
- Unknown or unavailable plugin code must not run; the host must retain opaque raw state and show the last saved summary.
- Host services remain responsible for persisted projections, search data, and history rather than allowing plugins to create divergent facts.

## Research Findings
- The immediately previous plan completed live body reconciliation and detached note creation; its explicit next step is custom canvas types, followed by conflict-resolution UI.
- Current staged work comprises the completed prior slice. No commit was created, so new work must preserve existing index state.
- Existing `extensionInstanceStore` already has an unknown-type preservation regression, indicating that opaque state and presentation are part of the internal foundation rather than a greenfield model.
- The accepted contract intentionally keeps host UI components private. Public custom cards should use the shared React/SDK/theme surfaces and must not import the built-in `CanvasTypeDefinition` or host stores.
- T2 acceptance is behavioral: one genuinely interactive custom card must support editing, restart, search, and missing-plugin display. A color-only static demo is explicitly insufficient.
- The repository already has end-to-end internal foundations for extension records: shared versioned instance/presentation shapes, Bun persistence and migration scheduling, renderer registry/store/host shell/fallback, canvas serialization/import/export, search and AI summary projections, settings enablement, and context-menu integration.
- Public plugin lifecycle currently covers commands, panels, storage/events/tasks, content, and selection. No public custom-type registration is visible in the SDK/runtime yet, so the likely work is an adapter over the mature internal extension substrate rather than a new persistence format.
- The internal type shape is renderer-centric (`CanvasSurface`, `PreviewSurface`, host API, validation, migration, dimensions/interactions), while the public plugin context is activation-centric with tracked cleanup and atomic candidate publication. Public registrations must be staged with the candidate and become visible only when that generation wins.
- The global `canvasTypeRegistry` currently rejects duplicates and has no unregister/replace-by-owner operation. It must gain owner/generation-aware publication semantics or an adapter-owned overlay so failed reloads cannot disturb the old card implementation and successful reloads can replace it atomically.
- Existing creation already consumes any registry definition, derives presentation, persists revision-1 state, and adds an `extension` node. Once public types appear in the same registry/create menu, their persistence/restart path mostly works unchanged.
- Existing built-in canvas IDs are restricted to `ghostboard.<pack>/<type>`, whereas public plugin IDs are reverse-DNS-like and explicitly forbid `ghostboard.*`. The ID contract must be generalized carefully, with plugin ownership derived from an exact canonical `${pluginId}/${localTypeId}` form rather than permitting a plugin to claim another namespace.
- The current internal `migrateState(record)` hook is defined but is not wired into record hydration. Public state migration therefore needs an explicit orchestration point and revision-checked persistence rather than being assumed to work.
- The app starts the router and plugin runtime concurrently. A custom node may hydrate before its plugin publishes, so registry consumers must subscribe to registry changes and migration must also work when a type appears after the record.
- Canvas load only hydrates extension instances referenced by the active view. A renderer-side migration should therefore be explicitly lazy-on-open/current-view; it can still be durable and revision-checked. Workspace-wide eager migration would require executing plugin code over arbitrary unloaded files and is not needed for the behavioral T2 acceptance.
- Successful plugin handoff can publish a complete owner generation in one registry mutation before retiring the old generation; generation-qualified cleanup prevents the retiring activation from removing the replacement. Failed candidates never publish.
- Search already uses persisted `presentation.title/subtitle/plainText`; missing plugins therefore remain searchable without executing their code. Canvas JSON export also already includes opaque extension instance state and presentation.
- The public definition can stay narrow: plugin-local ID, title/description, integer data version, initial JSON state, state validator, summary builder, React component (optional preview component), optional synchronous migration, and bounded surface sizing. Host services can adapt that into the existing internal definition.
- The runtime and router start concurrently, and active-view instance hydration happens inside the canvas route. Registry subscriptions are required both on memoized extension nodes and on creation/focused-view surfaces so late plugin publication immediately replaces fallbacks and adds create-menu entries.
- The existing focused view renders only `DetailSurface`; a public type that opts into `openBehavior: 'detail'` must adapt the same public component for both canvas and detail contexts unless a separate detail API is introduced later.
- Migration persistence only requires extending the existing extension update RPC with a monotonic `dataVersion`; Bun can reject downgrades and keep its current revision conflict check.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Treat the current accepted platform document as the product contract and the existing extension registry/store as the implementation substrate | This avoids introducing a parallel canvas model and preserves current built-in behavior. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `docs/features/In Progress/trusted-plugin-platform.md`
- `docs/development-plan.md`
- `packages/plugin-sdk/README.md`
- `.planning/2026-09-10-plugin-body/*`
