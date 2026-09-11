# Findings & Decisions

## Requirements
- T2 still requires a visible recovery path when a plugin changes a note while the host editor has an unsaved local draft.
- The flow must preserve local input, never silently overwrite newer persisted content, and keep revision-checked writes fail-closed.
- This slice should not pretend that native canvas history and explicit plugin batch history are already one ordered undo timeline.

## Research Findings
- The previous custom-canvas slice is complete at commit `15b1e76`, and the working tree was clean before this plan was initialized.
- Current SDK documentation says clean editors reconcile automatically, while dirty title/body/color drafts retain their prior revision and stale saves are rejected.
- Accepted planning documents name richer conflict recovery UI and unified undo as the remaining T2 work, with conflict UI first.
- `useBlockNoteSaver` already keeps the latest serialized blocks/Markdown, local frontmatter, dirty flag, and the last acknowledged revision after a failed save. A conflict response includes `conflict: true` and the current persisted revision, but the hook currently reduces every failure to generic `error` state.
- `createNoteBodySync` loads the canonical body for plugin changes, but if any registered editor is dirty it deliberately drops the refresh after preserving the editor. That means the recovery flow must load a fresh canonical snapshot when the stale save is rejected rather than rely on a retained coordinator event.
- `BlockNoteEditor` owns the real editor instance, title draft and external-body application path. The saver hook should own conflict detection/retry state, while the editor surface must own applying a user-selected canonical snapshot.
- A deliberate “keep my version” can rebase the preserved draft onto the freshly loaded canonical revision and call the same revision-checked save. If another write wins first, the retry must conflict again and refresh the recovery state instead of overwriting blindly.
- A deliberate “use saved version” must clear the dirty payload, replace the editor blocks/title, update the saver revision/frontmatter, and force all host projections for that note to the chosen canonical snapshot. The normal projection helper intentionally rejects conflicting local metadata, so discard needs an explicit user-authorized canonical projection path.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Present conflict recovery inside the focused editor, not as a toast-only action | The draft and the saved version are both note-scoped, and the user needs persistent, accessible controls while editing. |
| Offer explicit “Use saved version” and “Keep my version” actions, with manual editing remaining available | Automatic rich-text merging is unsafe; these actions preserve both understandable outcomes without inventing a lossy merge algorithm. |
| Re-load the canonical note using the editor's bound workspace ID after a stale save | The conflict response has only a revision. A workspace-bound read supplies exact blocks, text, preview, title and color while preventing cross-workspace reuse. |
| Keep retry revision-checked even after the user chooses their draft | This turns overwrite into an intentional compare-and-swap; a second concurrent change returns to conflict state. |
| Use the server's workspace ID from the initial canonical load as the recovery scope | `loadBlockNote` already rejects an explicit stale workspace ID before reading, which closes the cross-workspace race. |

## Frozen Interaction Contract
- On `saveBlockNote` returning `conflict: true`, the saver stops automatic flush retries, keeps the live draft untouched, enters a distinct conflict status, and loads the latest canonical record for the editor's bound workspace.
- The focused editor shows a persistent alert explaining that the draft is preserved. An expandable comparison shows the local title/body excerpt and the current saved title/body excerpt.
- `Keep my version` rebases the still-current local payload onto the loaded revision and runs the normal save. If that compare-and-swap loses another race, the banner remains with the newer canonical version.
- `Use saved version` clears local dirty state and scheduled saves, replaces title and blocks with the canonical snapshot, updates all note projections, and exits conflict state. It never sends a write.
- If the canonical read fails, the draft stays editable and the alert exposes `Try loading again`; neither resolution action is enabled without a concrete saved snapshot.
- Generic I/O failures remain the existing `error` state and retry-on-next-edit behavior; only revision conflicts enter this recovery flow.

## Packaged Acceptance Scenario
- Open a real sidecar note in the BlockNote editor, create an unsaved local title/body draft, then commit a plugin body/title replacement against the same starting revision.
- Trigger the stale host save and assert that the conflict banner appears while the local draft remains visible and persisted plugin content remains unchanged.
- Choose `Use saved version`; assert the plugin version replaces the editor and projected card metadata without another write.
- Repeat the conflict and choose `Keep my version`; assert a revision-checked save advances from the plugin revision, the draft becomes canonical, and the banner clears.

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Focused tests initially failed on four stale expectations/fixtures after the new state was introduced | Updated only the affected assertions and host-shaped fixture; the corrected focused suite passed. |
| Type-check and tests cannot safely run concurrently because Paraglide compilation replaces generated localization files | Run `bun run type-check` before Vitest rather than parallelizing those commands. |
| Native browser confirmation violates the repository interaction lint rule | Use the existing Sonner action pattern for explicit close-and-discard confirmation. |
| A constructed `blur` event did not trigger the packaged React editor's delegated onBlur | Drive a real focus transition with `focus()` and `blur()` in the acceptance probe. |
| Reusing the existing body-history note made the new intentional overwrite invalidate the old restart fixture | Use a dedicated conflict note; independent acceptance scenarios must not mutate one another's history preconditions. |

## Resources
- `docs/features/In Progress/trusted-plugin-platform.md`
- `docs/development-plan.md`
- `packages/plugin-sdk/README.md`
- `.planning/2026-09-10-plugin-custom-canvas-types/*`
