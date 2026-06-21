# License Check Cold-Start Design

## Problem

Creating the first canvas node after application startup is delayed with no UI feedback. `canvasStore.createNode` currently awaits `rpcCheckLicense()` before inserting any node into Zustand. The license RPC client creates its own `Electroview`, separate from the shared renderer RPC client, so its first call performs a dynamic import and opens a duplicate WebSocket for the same webview ID.

The duplicate RPC client can replace the socket registered for the shared client while request listeners remain attached to the original client. It also makes license initialization part of the user-visible node creation latency.

## Goals

- Keep exactly one `Electroview` instance per renderer webview.
- Make node creation below the free limit independent of license RPC availability and cold-start latency.
- Apply the free limit only to `card` and `sticky` nodes.
- Cache license status for the renderer session and share concurrent refreshes.
- Refresh the cache after successful activation.
- Preserve the existing fail-open behavior when license validation cannot be completed.

## Non-goals

- Changing license file encoding or server-side verification.
- Changing the free limit from 100 card/sticky nodes in the active canvas.
- Adding optimistic node creation followed by rollback.
- Adding cross-window license broadcasts in this change.

## Architecture

### Unified RPC transport

License RPC functions move into `src/mainview/lib/rpc.ts`, alongside the other renderer-to-Bun requests. `src/mainview/lib/rpc-license.ts` remains responsible only for license status caching and calls the exported RPC functions; it no longer imports `electrobun/view` or constructs an `Electroview`.

### Session cache

The license module stores:

- the last successfully loaded `LicenseInfo`, and
- one in-flight refresh promise.

`getCachedLicense()` is synchronous. `refreshLicense()` deduplicates concurrent calls and updates the cache when the RPC returns a license result. A failed or unavailable RPC returns `null` without replacing the last known successful value.

`rpcActivateLicense()` uses the shared RPC transport. Successful activation triggers a license refresh so later node creation observes the activated state.

### Node creation policy

`createNode` applies the license gate only when all of these are true:

1. the requested kind resolves to an underlying `card` or `sticky` node
   (`checklist` therefore counts as a card);
2. the current canvas already contains at least 100 card/sticky nodes; and
3. no cached activated license is available.

When the boundary is reached, a cached activated license takes the immediate fast path. Unknown or inactive cache entries are refreshed through the shared RPC transport so an activation completed in the separate settings renderer can be observed without a cross-window cache protocol. If the refreshed result is explicitly unactivated, creation is rejected with the existing toast. If the RPC fails or is unavailable, creation remains allowed, matching the current catch-and-continue behavior.

All other node types and all card/sticky creation below the free limit are inserted without waiting for a license request.

### Startup prefetch

The renderer starts a non-blocking license refresh during application initialization. This is a latency optimization only: correctness does not depend on the prefetch finishing because `createNode` handles cached, unknown, and failed states at the limit boundary.

## Error handling

- License RPC failure must not block ordinary creation.
- A failed refresh is logged and resolves to `null`.
- Explicit `{ activated: false }` is authoritative for the current attempt, but is revalidated on a later over-limit attempt so another renderer's activation can be observed.
- Successful activation refreshes the cached status.

## Testing

Automated tests cover:

- creation below the limit does not call the license RPC;
- non-limited node types do not call the license RPC even when 100 cards exist;
- an unlicensed user cannot create the 101st card or sticky;
- a licensed user can create beyond the limit;
- license RPC failure preserves fail-open behavior;
- concurrent license refreshes share one RPC request;
- successful activation refreshes the session cache;
- the license module does not initialize a second `Electroview`.

## Acceptance criteria

- The first node created on an ordinary canvas appears without awaiting a license request.
- Renderer code has one `Electroview` construction path.
- Existing canvas persistence and node creation tests remain green.
- Type checking and repository quality checks pass for the changed files.
