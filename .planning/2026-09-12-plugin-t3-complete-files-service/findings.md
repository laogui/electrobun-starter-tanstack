# Findings & Decisions

## Requirements
- Complete the public plugin `files` service beyond the first slice's one-file strict UTF-8 read.
- Cover binary/streaming reads, host writes, directory selection/listing, handle lifetime/recovery rules, progress, cancellation and resource limits.
- Preserve opaque paths and activation/workspace scoping; do not leak absolute host paths to plugins.
- Keep segmented imports, generic mapping/target UI, and general packaging CLI as subsequent T3 slices unless implementation coupling makes a narrow shared primitive necessary.

## Research Findings
- The completed first slice is bounded to one opaque file handle, strict UTF-8, 1 MiB and renderer RPC transport.
- The retained ZIP/HTTPS installer and installed-package runtime are already real final-user paths and must be reused.
- T4 signing/update/safe-mode work remains explicitly out of scope.
- The first-slice Bun `PluginFileStore` holds up to 256 in-memory file handles keyed by UUID and bound to plugin/workspace/activation. It re-stats before strict UTF-8 reads but has only file handles, no explicit generation token, directory handles or output destinations.
- Native selection uses Electrobun RPC and returns absolute paths only to the Bun process. The renderer receives frozen opaque metadata and keeps object-identity ownership checks; activation abort asynchronously releases all issued handles.
- Existing renderer RPC is appropriate for native picker control but not payload streaming. The authenticated localhost server already supports range-capable file downloads and streamed attachment uploads, making it the natural data plane for plugin file bodies while RPC remains the control plane.
- The localhost server composes authenticated host handlers for plugin content, storage and runtime. A dedicated plugin-files handler can be inserted with the same per-launch bearer token and workspace binding rather than adding large binary results to Electrobun RPC.
- Current public SDK exposes only `pick` and `readText`; the fake testing host likewise models queued text files only. Completing the contract requires coordinated SDK declarations, runtime implementation and fake-host coverage.
- Electrobun exposes a single `openFileDialog` API with `canChooseDirectory`, `canChooseFiles`, and `allowsMultipleSelection`; there is no separate save dialog symbol in the installed package search results.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Start with a contract audit before editing source | Streaming, writes and directory handles cross native RPC, authenticated HTTP, SDK and lifecycle boundaries; freezing ownership and limits first avoids an incompatible one-off API. |
| Directory listing is direct-child and cursor-paged; recursion is plugin-controlled | This prevents an accidental unbounded tree walk, lets cancellation happen between pages, and avoids hidden traversal of very large user-selected trees. |
| Symlinks are reported as non-openable directory entries and are never followed | The user grants a directory root, not authority to escape through a link inside it. Writes reject symlink roots/ancestors/targets. |
| Writes use begin → sequential chunks → atomic commit and return a new opaque file handle | A failed/cancelled write can delete its temporary file, progress reflects acknowledged bytes, and readers never observe a partially written target. |
| `readText` remains strict UTF-8 with a 1 MiB default but allows an explicit bounded collected-read limit | Existing importers retain their original behavior; authors needing larger text must opt into the allocation and still remain below the 16 MiB collected-read ceiling. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `docs/features/In Progress/trusted-plugin-t3-plan.md`
- `.planning/2026-09-11-plugin-t3-importer-distribution/`
- `packages/plugin-sdk/README.md`
