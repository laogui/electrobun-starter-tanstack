# Findings & Decisions

## Requirements
- User explicitly requested implementation of the extension-management and installation UI.
- The visible flow must correspond to real installation/state behavior; it must not be a mock UI or imply that unsafe panels are executable.

## Research Findings
- The redesign explicitly calls for local ZIP import, URL download, installation preview, compatibility/permission display, failure recovery, and enablement as part of the public-plugin user path.
- `src/bun/plugins/pluginInstall.ts` already owns an atomic journaled package registry with `listInstalled`, prepare/commit semantics, ZIP and URL sources. It is not yet exposed to the renderer as a user-facing management API.
- The renderer already has a Settings shell with dedicated panels, dialog navigation, test coverage, and i18n conventions. It is the natural first home for a Plugins panel rather than a new top-level product route.
- Existing external panel execution remains unavailable by design because no verified view container exists. The management UI must surface a package's contributions and activation state without advertising unsafe panel execution.
- The first UI contract will be: choose local `.zip`/`.ghostboard-plugin` → host-only validation and staging → untrusted manifest preview → explicit commit/cancel → list stored packages. URL preparation accepts only the installer's existing HTTPS policy. No package code executes in preparation or commit.
- Since installed packages currently are not dynamically registered into product commands, importers, canvas types, or panels, this slice will not expose an enable toggle. It will explicitly label stored packages as not yet activated by a product runtime.
- Plugin state belongs under the current workspace at `.ghostboard/plugins/`, matching other workspace-local GhostBoard metadata. The host, not the renderer, reads selected file paths and package bytes.

## Technical Decisions
| Decision | Rationale |
| --- | --- |
| Create `PluginManagementService` over the existing `PluginInstallStore` | Keeps selection/download details in Bun, reuses atomic prepare/commit/cancel/recovery behavior, and avoids a renderer-controlled filesystem seam. |
| Scope package storage to `<workspace>/.ghostboard/plugins/` | The package registry is per workspace, matching product-local plugin selection and avoiding a new global-state migration. |
| Return redacted source metadata and parsed manifest summaries only | The renderer never receives a selected file path, URL query credentials, unpacked paths, source files, or executable handles. |
| Require a review state before commit | The installer already stages/validates first. The UI exposes digest, source, API range, contributions, and permissions, then calls commit only after a second user action. |
| Do not expose enable/disable controls for third-party packages | Third-party contributions are not dynamically registered and a verified panel runtime does not exist. A toggle would imply executable behavior the product cannot truthfully provide. |

## Issues Encountered
| Issue | Resolution |
| --- | --- |
| Fixture display name initially assumed to be English | The bundled fixture declares `标题整理`; the host test now validates the actual manifest label. |
| Full test suite lacks its sibling independent sample repository and hits a jsdom navigation limitation | Focused new tests, type-check, and Ultracite pass. `bun run test` still fails before most plugin suites can run because `/Users/laogui/Projects/ghostboard-plugin-samples` is absent; `src/bun/index.test.ts` then has 52 dependent failures and `router.test.tsx` has one known jsdom navigation failure. |

## Resources
- `docs/PRD.md`
- `docs/features/In Progress/public-plugin-platform-redesign.md`
- `src/bun/plugins/`
- `src/mainview/components/settings/`
