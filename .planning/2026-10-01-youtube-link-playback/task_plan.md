# YouTube link playback

## Goal
Allow YouTube video links to play inside link cards and the focused view. Preserve unrelated changes and do not edit tests.

## Next Step
Deliver the implementation and verification results.

### Phase 1: Inspect and design
**Status:** complete
- [x] Read repository instructions and inspect current link renderer.
- [x] Verify player integration, URL formats, and desktop origin requirements.

### Phase 2: Implementation
**Status:** complete
- [x] Add validated YouTube video URL parsing.
- [x] Add usable in-card and focused playback.

### Phase 3: Verification
**Status:** complete
- [x] Run relevant existing tests, type/lint checks, build and manual UI verification.
- [x] Review final diff and report limitations.

## Decisions
- Use a task-specific planning directory; preserve the existing active-plan pointer.
- No test files will be created, modified or deleted.
- Use a click-to-load YouTube facade and an authenticated local HTTP wrapper for packaged views:// pages.
- Keep playback out of thumbnail/folder previews and stop canvas playback when a focused overlay opens.

## Errors
- Initial lint reports formatting, import sorting and one boolean simplification; apply targeted safe fixes.
- Discovery used several nonexistent optional filenames; resolved with actual source paths.
- Standard Vite dev startup did not listen on 5173; used a temporary Vite API server with React/Tailwind and the existing alias for manual UI QA, without modifying repository configuration.
- Full repository lint reports unrelated diagnostics/settings/support errors; targeted checks pass.
- Browser HMR reset the temporary UI scenario after a source edit; recreated the manual scenario.
- Raw CDP invalidated browser snapshot refs; take fresh snapshots before subsequent selector actions.
- A repeated Node-based Vite build stalled before logging; cancelled it and the final Bun-based build passed using the unchanged repository config.
- Earlier whole-repository lint failure was resolved by the concurrent task; final bun run check passes.
