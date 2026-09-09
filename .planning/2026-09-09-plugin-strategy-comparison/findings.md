# Findings & Decisions

## Requirements
- Audience: leadership deciding whether the GhostBoard plugin approach should change.
- Deliverable: a neutral Chinese Markdown document in the repository.
- Scope: GhostBoard current state versus Obsidian and get-bb/bb plugin models.
- Constraint: report facts, unresolved problems, and risks only; do not recommend a target architecture.

## Research Findings
- GhostBoard internal evidence: package review/installation and constrained command activation have completed desktop acceptance. The title-tools proof covers Settings installation, explicit grants, native menu execution, Undo/Redo, disable/RPC refusal, restart persistence, and copy-workspace non-inheritance. Source: `docs/features/In Progress/plugin-p0-frozen-contract.md` and `plugin-container-evidence/2026-09-08/p0-title-tools-desktop-acceptance.json`.
- GhostBoard panel state: the macOS WKWebView helper can load host-owned `ghostboard-plugin:` relative CSS/ESM resources with no bridge, while content rules block conventional HTTP(S)/WS(S) paths. A direct local UDP STUN canary nevertheless received two WebRTC packets. The candidate is documented as rejected for P0 and is not integrated into the product. Source: `plugin-p0-frozen-contract.md`, `public-plugin-platform-redesign.md`, and `os-webview.json`.
- Obsidian official documentation says a plugin is built to `main.js`, placed below a vault's `.obsidian/plugins` directory, and enabled in Community plugins. A plugin extends `Plugin`; its UI guide gives plugins an `ItemView` with `contentEl` and shows direct HTML element creation. Sources: `https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin` and `https://docs.obsidian.md/Plugins/User+interface/Views` (inspected 2026-09-09).
- bb source documentation exposes a typed `@get-bb/plugin-sdk`. It supports optional plugin backend/frontend split (`server.ts`, `app.tsx`), React slots/panels/overlays, and lifecycle-managed content scripts. Its SDK explicitly calls frontend content scripts "trusted same-origin page code, not a sandbox." Sources: `https://github.com/get-bb/bb/tree/main/packages/plugin-sdk` and `https://github.com/get-bb/bb/tree/main/plugins/plugin-api-docs/PLUGIN_OVERVIEW.md` (inspected 2026-09-09).
- bb's Docs plugin documents host-routed file operations through `bb.sdk.files`, an explicit vault root, and SHA-256 compare-and-swap behavior. This demonstrates capability-shaped host APIs for at least some backend data operations; it does not turn bb's frontend content-script model into a sandbox. Source: `https://github.com/get-bb/bb/tree/main/plugins#docs`.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Separate verified facts from risk implications | Product and security claims require different evidence levels. |
| Describe the WebRTC finding as a demonstrated route around URL-content rules, not as evidence of data exfiltration | The canary observed two local UDP/STUN packets; it did not demonstrate a production data leak. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `docs/features/In Progress/plugin-p0-frozen-contract.md`
- `docs/features/In Progress/public-plugin-platform-redesign.md`
- `docs/features/In Progress/plugin-container-evidence/2026-09-08/p0-title-tools-desktop-acceptance.json`
- `docs/features/In Progress/plugin-container-evidence/2026-09-08/os-webview.json`
- https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- https://docs.obsidian.md/Plugins/User+interface/Views
- https://github.com/get-bb/bb/tree/main/packages/plugin-sdk
- https://github.com/get-bb/bb/tree/main/plugins/plugin-api-docs/PLUGIN_OVERVIEW.md
