# Findings & Decisions

## Requirements
- Continue the PRD's public-plugin P0 work, whose exit condition is controlled logic and Web views without fake instance IDs plus measured isolation and recovery results.
- Preserve the staged boundary: P1/P2/P3 capability expansion must not be presented as P0 completion.

## Research Findings
- `docs/PRD.md` §7.1 says the current next line is public plugin P0.
- The detailed source of truth is `docs/features/In Progress/public-plugin-platform-redesign.md` §19.1 (dated 2026-09-08).
- Existing evidence: per-invocation QuickJS command runtime, local ZIP/loopback package loading, installer journal prototype, command and panel samples, and native WebKit helper experiments.
- The WebKit/CEF embedded-container paths have failed isolation tests (bridge and/or network reachability). The separate macOS WKWebView helper has a bridge-free resource-loading result, but is rejected as a view container by a direct WebRTC/STUN network bypass; it is not integrated into GhostBoard. Linux/Windows conclusions are not available.
- The remaining explicit baseline validation also includes a desktop retest of instance rollback persistence.
- Recent commits show that P0 code was most recently added in `51e831a` (command/title/install foundations) and `fd4cec9` (panel open/close/reopen lifecycle). The worktree is clean before this session apart from this session's planning artifacts.
- P0-related implementation is concentrated in `src/bun/plugins/`, `src/shared/plugins/`, and `scripts/plugin-container-probe/`; the probe results are deliberately recorded as evidence, not as a production container integration.
- The previously committed `2026-09-08-plugin-foundations` plan lists its P0 probe activities as complete but deliberately leaves public activation closed. Its next-step note says not to open installation/settings until the view container passes the canary.
- The P0 frozen contract confirms that `panelRuntime.ts` is a host-session lifecycle model only: it does not embed an HTML page. The macOS helper is bridge-free and its host-owned in-memory package scheme loads relative CSS/ES modules, but it is not a complete network container.
- `pluginIsolationMatrix` intentionally reports no real panel container as verified. It cannot be upgraded based on configuration or unit tests alone.
- Current helper page canaries cover fetch, local file fetch, storage, WebSocket, blob Worker, iframe navigation, and popups. They do not cover form submission, passive subresources, relative package modules/styles, or whether WebRTC remains exposed beyond the URL content rule.
- The helper currently loads its test page with `loadHTMLString(..., baseURL: about:blank)`, which is useful for opaque-origin behavior but cannot validate package-relative resources. A safe custom `WKURLSchemeHandler` probe can supply fixed in-memory package resources without granting page-side filesystem access.
- Bun 1.3.14 provides a local `Bun.udpSocket` API. A response-free UDP STUN sink on `127.0.0.1` safely observed two packets from each viable helper candidate, including the HTTP(S)/WS(S) blocklist + resource candidate. This is direct evidence that `WKContentRuleList` URL filtering does not constrain WebRTC UDP.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Inspect the exact runtime/container implementation and tests before editing | The P0 docs include multiple experimental paths; implementing against the wrong one could re-open a rejected isolation model. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `docs/PRD.md` §7.1
- `docs/features/In Progress/public-plugin-platform-redesign.md` §§11, 19–20
- `docs/features/In Progress/plugin-container-experiment.md`
