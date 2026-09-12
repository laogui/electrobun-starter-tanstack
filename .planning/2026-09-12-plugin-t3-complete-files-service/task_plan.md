# Task Plan: T3 complete plugin files service

## Goal
Deliver the next independently reviewable T3 slice: a public plugin files service with bounded binary and streaming reads, explicit host-mediated writes, directory selection/listing, lifecycle-safe opaque handles, progress/cancellation/resource limits, tests, author documentation and honest packaged evidence.

## Next Step
Commit this completed files-service slice, then start the separately reviewable segmented-import slice recorded in the T3 plan.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Recover the completed T3 first-slice plan and remaining-work list
- [x] Map current file handles, RPC/HTTP transport and lifecycle cleanup
- [x] Map reusable attachment/write/directory validation helpers
- [x] Record constraints and candidate boundaries in findings.md
- **Status:** complete

### Phase 2: Contract Freeze
- [x] Freeze public API and handle kinds for files/directories
- [x] Freeze read/write/stream/progress/cancellation/resource semantics
- [x] Freeze packaged acceptance scenarios and explicit exclusions
- **Status:** complete

### Phase 3: Implementation
- [x] Extend Bun file service and authenticated transport
- [x] Extend renderer runtime and public SDK surface
- [x] Add author fixture usage without coupling to segmented import UI
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Add unit/integration regressions across Bun, renderer and SDK boundaries
- [x] Run type-check, scoped style checks and focused tests
- [x] Run full serial regression and proportional packaged verification
- **Status:** complete

### Phase 5: Delivery
- [x] Update SDK, T3 and development documentation with exact boundaries
- [x] Review diff and working-tree state
- [x] Commit the completed slice with a conventional subject
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Implement complete files as its own T3 slice before segmented imports, generic mapping and packaging CLI | Each is a substantial reviewable capability; files is the dependency for large segmented imports and temporary assets, while the prior plan explicitly lists them as separate remaining items. |
| Keep native RPC as the picker/listing control plane and use authenticated localhost HTTP for bounded range reads and chunked atomic writes | Electrobun RPC is already suitable for small metadata but not streaming payloads; the existing localhost service provides cancellation, byte responses and request-body streaming behind a per-launch bearer token. |
| Add `kind` to opaque handles, extend `pick` with bounded multi-select, and add `pickDirectory`, paged `list`, `readBytes`, `stream`, `write` and explicit `release` | This completes file/directory workflows without revealing absolute paths and leaves importer-specific mapping/placement outside the generic file service. |
| Keep handles process/activation/workspace-bound and explicitly non-persistent | Electrobun does not expose cross-platform security bookmarks; silently persisting raw host paths would overclaim authority and portability. Plugins must ask the user to select again after reload/restart. |
| Use 100-entry directory pages, 1 MiB transfer chunks, 16 MiB collected reads and 256 MiB per streamed read/write | These bounds keep every transport request and renderer allocation explicit while still supporting incremental processing; larger files can be processed through caller-chosen ranges in separate streams. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| First oversized source patch was malformed and applied nothing; a delete/add retry initially failed because both operations targeted one path in a single patch | Split shared types, deletion and full-file addition into separate atomic patches; the Bun file service is now restored with the intended implementation. |
| First combined shared/Bun patch was too large for a reliable patch hunk and was rejected without changes | Split the shared contract from a full Bun store replacement, then apply and verify each independently. |
| First renderer integration patch used stale stub wording and was rejected atomically | Split import/type changes from the exact implementation block and applied both against fresh context. |
| First file-transfer type-check exposed Bun's `fetch.preconnect` mock typing and Node/DOM `ReadableStream` declaration overlap | Declare fetch mocks before assigning implementations, normalize request bodies to `ArrayBuffer`, and explicitly bridge the browser Blob stream type. |
| First packaged T3 rerun failed at invalid UTF-8 because `/plugins/files/read` was intercepted as a static plugin-asset path and returned 404 | Reserve and authenticate `/plugins/files/` before static asset routing; retain token-in-path module serving for actual plugin assets. |
| Second packaged T3 rerun reached the new data plane but the oversized-file assertion expected the established `limited to` diagnostic | Preserve the public first-slice error wording in renderer `readText` while retaining the shared binary collector's generic limit error. |
| First full serial suite had two import-time failures because complete `@/lib/rpc` mocks omitted `rpcListPluginDirectory`; the other 218 files / 1,988 tests passed | Add the new control-plane export to both complete runtime mocks; the final serial suite then passed 220 files / 1,998 tests. |
