# Code review: GhostBoard (`main` @ `0b99320`)

Review of `laogui/electrobun-starter-tanstack` on the default branch after `feat: extension detail and search reachability`. This is a read-only review: no product changes, no refactors. No Critical vulnerability was found that was both trivial and safe to patch.

Scope: Electrobun/Bun main process (`src/bun/`), React/Vite renderer (`src/mainview/`), shared contracts (`src/shared/`), RPC/HTTP trust boundaries, notes/search/extensions/detach/AI, tests, and solo-dev maintainability.

---

## Executive summary

GhostBoard is a well-structured local-first desktop app: Bun owns the filesystem and secrets, React owns the canvas, and the RPC/HTTP split is mostly intentional. Persistence is stronger than average (atomic writes, view-switch flush-before-clear, attachment/note path sandboxes with tests). Markdown preview XSS is handled seriously (markdown-it `html: false`, sanitize-html on write, DOMPurify + React whitelist on read).

The highest practical security gap is **unvalidated `workspace.json` view/trash file paths**, which can escape `.ghostboard/` when a crafted or git-synced workspace is opened. Other notable issues: **backend search ignores `node-metadata` tags** (the renderer already searches them), **`saveBlockNote` does not conflict-check revisions**, **extension saves never send `expectedRevision`**, **offline license keys are locally forgeable** (documented), and **god-files** (`index.ts` ~3.1k, `canvasStore.ts` / canvas route ~2.3k each) will slow a solo developer soon.

TanStack Router/Query are wired correctly but underused: almost all product UI lives on `/` with Zustand + hand-rolled RPC wrappers. Tests are unusually strong for canvas/store/search; the gaps that matter are shared markdown, BlockNote save, `hostApi`, and RPC contract drift.

---

## What's working well

1. **Clear process split.** Renderer never touches the disk. Bun owns workspace I/O, attachments, AI keys, license, templates, and cleanup. Streaming (AI chat, media, unfurl, upload) correctly bypasses Electrobun RPC via a 127.0.0.1 HTTP bridge (`src/bun/localHttpServer.ts`).

2. **Path sandboxing is a habit, not a one-off.** Attachments, notes, BlockNote sidecars, widgets, and extension instances all use `assert*Path` helpers that reject absolute paths, `..`, and root escape. Tests cover traversal (`attachments.test.ts`, `notes.test.ts`, `cleanup.test.ts`, `blocknote.test.ts`).

3. **Atomic writes everywhere that matters.** `atomicWrite` (tmp + rename) is used for manifests, settings, sidecars, widgets, workspace config, and credentials.

4. **View-switch safety is thought through.** `canvasStore.switchView` flushes the outgoing canvas and aborts on save failure; hydration uses a `cancelled` flag; persistence explicitly refuses to flush after `setActiveView` has cleared the store. `moveSelectedToView` writes the target first so a crash duplicates rather than loses nodes.

5. **XSS strategy for note previews is defense-in-depth.** Shared markdown-it disables raw HTML; Bun `preview.ts` sanitizes with explicit `http`/`https`/`mailto` schemes; `NotePreview` sanitizes again with DOMPurify and rebuilds React elements from a tag whitelist — no `dangerouslySetInnerHTML` in product UI. Stickies render as escaped text. Search highlights are React nodes.

6. **AI is treated as untrusted output.** `aiTasks.ts` caps nodes/chars and uses Zod; the renderer re-validates (`parseAITaskResult`, `filterValidAIActions`) before mutating the canvas; apply is explicit and undo-batched; request-id / source-view guards drop stale responses.

7. **AI key isolation.** Keys live in `~/.ghostboard/{channel}/ai-credentials.json` with `chmod 0o600`, never in workspace `settings.json`. RPC exposes `hasApiKey` only.

8. **Link unfurl SSRF defenses.** `linkPreview.ts` rejects localhost/private IPv4/IPv6 (including mapped `::ffff:`), caps redirects and body size, times out.

9. **External URL gate.** `openExternalUrl` allows only `http:`, `https:`, `mailto:`.

10. **Extension isolation for a first-party registry.** Typed canvas-type registry, enablement store, instance path + 1 MiB cap + revision lock on the Bun side, scheduler payload/size limits, error boundary + fallback UI so one extension crash does not take the board.

11. **Search reachability work is real.** Backend search covers cards, stickies, folders, widgets, extensions, folder children, and detached placement. The renderer merges backend + current-view memory results with a sequence guard. Tests assert orphan notes are *intentionally* skipped (performance).

12. **Test investment is unusually high.** ~167 `*.test.ts(x)` files; canvas store, serialization, search, RPC client, AI apply, and most node components have dedicated coverage. Persistence races have named tests.

---

## Architecture fit

### What fits

| Layer | How it's used | Fit |
| --- | --- | --- |
| Electrobun Bun | Window, RPC (~71 request handlers), FS, local HTTP, menus | Correct place for privileged work |
| Renderer | xyflow canvas, Zustand interaction state, BlockNote, extension surfaces | Correct place for UI |
| TanStack Router | File routes; hash history in packaged `views://`; browser history under Vite | Correct for Electrobun URL schemes |
| TanStack Query | License, node-metadata, tags, templates + global error toast | Correct for "server-ish" reads |
| Zustand | Canvas, widgets, extension instances, settings, AI panel | Correct for high-frequency canvas state |

Local HTTP for streams is the right call: Electrobun RPC is a request/response socket, not a byte pipe. The comment in `rpc.ts` about HMR spawning a second Electroview (and hanging in-flight promises) is the kind of runtime scar that belongs in code.

### Drift and underuse

- **RPC types are not shared.** `CanvasRPC` lives only in `src/bun/index.ts` (~lines 776–1203). Renderer wrappers in `src/mainview/lib/rpc.ts` re-declare shapes (`nodes: any[]` on `rpcSaveManifest`). Adding a handler is a two-file manual sync.
- **TanStack Query does not own canvas/widgets/extensions/views.** Those stay Zustand + RPC. Coherent for a desktop app, but Query's invalidation model does not protect the hottest data paths.
- **TanStack Router is a thin shell.** Product UI is essentially `/` (`src/mainview/routes/index.tsx`, ~2345 lines). Templates are the only other routes. Tech spec mentions TanStack Form; there is no `useForm` usage — only `@tanstack/react-form-devtools` on the root.
- **Extensions run in-process.** The builtin registry (`registerBuiltins.ts`) is appropriate today. The public-plugin backlog will need a real sandbox; `hostApi.ts` already bridges assets, scheduler, unfurl, and focus into the same React tree.

---

## Findings

Severity: **Critical** (remote or untrusted-input compromise of user data / machine) / **High** / **Medium** / **Low** / **Nit**.

Items marked **Bug** are incorrect or unsafe today. Items marked **Suggestion** are design debt or follow-ups.

### 1. High — Bug — Manifest / trash paths are not sandboxed

**Where:** `src/bun/manifest.ts` 35–60; `src/bun/workspace.ts` 207–258, 305, 342; also `cleanup.ts` and `extensions/gc.ts` which consume `view.file` / `trashFile`.

```35:60:src/bun/manifest.ts
export async function loadManifest(
  wsPath: string,
  viewFile: string
): Promise<CanvasManifest | null> {
  const filePath = join(wsPath, '.ghostboard', viewFile);
  // ...
}

export async function saveManifest(...) {
  const filePath = join(wsPath, '.ghostboard', viewFile);
  await atomicWrite(filePath, JSON.stringify(manifest, null, 2));
}
```

`addView` always writes `views/${id}.canvas.json`, but **load/save/restore trust `workspace.json`**. That file is user-editable and often git-synced. A crafted `"file": "../../userprefs.json"` or `"file": "../../../.ssh/id_rsa"` can read/write outside `.ghostboard/` with the app's OS permissions.

**Why it matters:** Opening an untrusted or collaboratively-synced workspace is a realistic threat for a local-first notes app. Attachments and notes already have this guard; manifests do not.

**Fix direction:** Add `assertWorkspaceManifestPath(wsPath, viewFile)` mirroring `assertWorkspaceAttachmentPath`: relative only, no `..`, must start with `views/` or `trash/`, then `relative(root, resolved)` containment. Apply it to restore/purge/cleanup/search as well. Add a traversal test next to `manifest.test.ts`.

Not patched in this review: High, not Critical (requires a crafted workspace, no remote exploit).

---

### 2. Medium — Bug — Backend search misses `node-metadata` tags

**Where:** `src/bun/search.ts` ~541–592 (card candidates) and 890–951 (`scanNotes`); contrast `src/mainview/hooks/useSearch.ts` 320–332.

The renderer in-memory scan looks up tags via `useNodeMetadata()` for every node. The Bun scanner still only reads **legacy frontmatter** `tag` / `tags`, despite its own comment:

```890:894:src/bun/search.ts
    const title = record.title;
    // Tags live in node-metadata for sidecar notes; legacy markdown still
    // carries them in frontmatter.
    let tag = '';
    const tags: string[] = [];
```

`loadAllMetadata` is never imported. Tests cover frontmatter tags (`search.test.ts` "matches frontmatter tag and tags array") but not sidecar + `node-metadata.json`.

**Why it matters:** Tags are a first-class product feature. Cross-view `Cmd+K` will miss tagged sidecar notes; current-view merge only papers over the active canvas. Users will conclude search is broken.

**Fix direction:** Load `node-metadata.json` once per search and match `tag` / `tags` for both `noteId` and node id keys (same keying as the renderer). Add a regression test with a sidecar note and metadata-only tags.

---

### 3. Medium — Bug — `saveBlockNote` ignores optimistic locking

**Where:** `src/bun/index.ts` 2427–2435.

```2427:2435:src/bun/index.ts
        saveBlockNote: async ({ noteId, frontmatter, blocks, revision }) => {
          const existing = await loadBlockNoteSidecar(wsPath, noteId);
          const nextRevision =
            (typeof revision === 'number'
              ? revision
              : (existing?.revision ?? 0)) + 1;
```

Client `revision` is incremented blindly. A stale focused-view write overwrites a newer sidecar. Extension instances already throw `revision-conflict` when `expectedRevision` mismatches (`instanceStore.ts` 187–191).

**Why it matters:** Same note can appear on multiple canvases (`README.md`). Focused view + library + a second window (or a hung flush) can lose edits silently.

**Fix direction:** If `existing && revision !== existing.revision`, return `{ success: false, conflict: true, revision: existing.revision }` and let `useBlockNoteSaver` reload/toast. Do not accept a client revision ahead of disk.

---

### 4. Medium — Bug — Extension instance saves omit `expectedRevision`

**Where:** `src/mainview/store/extensionInstanceStore.ts` 241–245. RPC wrapper already accepts it (`rpc.ts` 256–268). Bun already enforces it.

```241:245:src/mainview/store/extensionInstanceStore.ts
        const result = await rpcUpdateExtensionInstance({
          instanceId,
          state: record.state,
          presentation: record.presentation,
        });
```

Saves are debounced and chained per id (good), but last-write-wins on disk if two surfaces (canvas + detail, or undo vs live edit) race.

**Fix direction:** Pass `expectedRevision: record.revision`. On `revision-conflict`, reload the instance and toast rather than clobbering.

---

### 5. Medium — Bug — Offline license keys are locally forgeable

**Where:** `src/bun/license.ts` 84–92, 143–158, 229–237. Documented in `docs/subscription.md`.

`validateKey` is a public checksum of the first three segments. `generateLicenseKey()` produces keys that pass it. Online verification is opt-in (`USE_ONLINE_LICENSE=true`) and off by default. Storage is XOR with a hostname/CPU/RAM fingerprint — obfuscation, not crypto.

**Why it matters:** If paid activation ships with defaults, any reader of this MIT repo can unlock the 100-card gate. Not a user-data issue.

**Fix direction:** Treat local checksum as format-only. Require server activate/verify before setting `activated: true`, or ship with `USE_ONLINE_LICENSE=true` and fail closed when the API is unreachable *for first activation* (keep offline grace after a successful bind, as the subscription doc already intends).

---

### 6. Medium — Bug — `saveAttachmentFile` reads any absolute OS path

**Where:** `src/bun/attachments.ts` 310–341; RPC `src/bun/index.ts` (~2538).

The destination is sandboxed. The **source** is any absolute path the renderer sends. Intended for native-picker imports, but nothing proves the path came from a dialog.

**Why it matters:** A compromised renderer (or XSS in the webview) can copy SSH keys, browser profiles, etc. into `attachments/`. Exfiltration still needs a second step; aggregation is enough to treat this as Medium.

**Fix direction:** Restrict to a picker-issued token, or only accept paths returned by a Bun-side `Utils.openFileDialog` in the same turn.

---

### 7. Medium — Bug — Unbounded attachment upload / in-memory load

**Where:** `saveAttachmentStream` (`attachments.ts` 230–251) and `/attachment/upload` (`localHttpServer.ts` 220–244) have no size cap. `loadAttachment` (254–267) base64-encodes the whole file. Data-URL RPC path correctly caps at 25 MiB.

**Why it matters:** A token-bearing renderer (or a leaked query token — see #14) can fill disk or OOM the main process on a large video.

**Fix direction:** Enforce a hard max on stream upload (and reject `loadAttachment` above a smaller cap; media should use the byte-range HTTP route, which already exists).

---

### 8. Medium — Bug — `workspace.json` read-modify-write is unlocked

**Where:** `src/bun/workspace.ts` — `addView`, `removeView`, `restoreView`, `setActiveViewId`, trash purge all load → mutate → save.

Concurrent RPC (delete view + rename + set active, or two windows) can drop an update. Same class of bug as #3, at workspace-config granularity.

**Fix direction:** Serialize workspace-config mutations on a per-`wsPath` queue (the extension save-chain pattern), or include a revision field and retry.

---

### 9. Medium — Bug — Legacy markdown saves fail silently

**Where:** `src/mainview/hooks/useNoteSaver.ts` 149–151. Contrast `FocusedView.tsx` BlockNote path, which toasts `toast_save_failed`.

```149:151:src/mainview/hooks/useNoteSaver.ts
      } catch (error) {
        console.error('[note] Failed to save note:', error);
      }
```

Widget saves have the same console-only pattern (`widgetStore.ts` 325–327).

**Why it matters:** Disk-full / permission errors look like a successful edit. Checklist / imported markdown still use this path.

**Fix direction:** Mirror BlockNote: status callback + toast + keep `dirty` true so flush retries.

---

### 10. Medium — Bug — `setState` during render in `StickyNode`

**Where:** `src/mainview/components/canvas/nodes/StickyNode.tsx` 177–185.

```177:185:src/mainview/components/canvas/nodes/StickyNode.tsx
  const editRequested = useCanvasStore((s) => s.editingStickyId === id);
  const setEditingStickyId = useCanvasStore((s) => s.setEditingStickyId);
  if (editRequested) {
    if (!editing) {
      focusAfterEditRequestRef.current = true;
      setEditing(true);
    }
    setEditingStickyId(null);
  }
```

Updating a **Zustand store** while rendering this node can trip "Cannot update a component while rendering a different component" and drop the Enter-to-edit request. `BlockNoteEditor.tsx` 118–122 uses the same-component derived-state pattern (React-legal); the sticky case is not the same.

**Fix direction:** Move the store clear + `setEditing(true)` into a `useEffect` on `editRequested`.

---

### 11. Medium — Suggestion — God-files and RPC type drift

**Where:** `src/bun/index.ts` (~3130 lines: window + 71 handlers + settings + AI config), `src/mainview/store/canvasStore.ts` (~2353), `src/mainview/routes/index.tsx` (~2345), `src/mainview/lib/rpc.ts` (~1094).

**Why it matters:** The next feature (public plugins, more AI tasks, more node types) will land in these files. Review and regression cost grows faster than the test suite can compensate. `rpcSaveManifest(..., nodes: any[])` already shows contract drift.

**Fix direction:** Extract `CanvasRPC` into `src/shared/rpc.ts` and import it from both sides. Split Bun handlers by domain (`rpc/notes.ts`, `rpc/views.ts`, …). Split the canvas route into hydration / search-target / chrome / node-types. Keep `canvasStore` as a facade over smaller slices (views, selection, clipboard).

---

### 12. Medium — Suggestion — TanStack Devtools ship in packaged builds

**Where:** `src/mainview/routes/__root.tsx` 228–244; `vite.config.ts` always loads `@tanstack/devtools-vite`.

The overlay is `hideUntilHover` but still mounts Query/Router/Form panels in production `views://` builds.

**Why it matters:** Extra bundle, extra runtime, accidental inspector in a notes app. Form plugin is especially unused.

**Fix direction:** Gate on `import.meta.env.DEV` (or channel === `dev`).

---

### 13. Low — Bug — Node metadata 500 ms debounce crash window

**Where:** `src/bun/nodeMetadata.ts` 246–256. `flushNodeMetadata` exists (templates use it) but tag edits from the UI rely on the timer.

A crash within 500 ms of a tag rename/delete can lose metadata. Manifest persistence has a localStorage backup (`pendingFlushBackup`); metadata does not.

**Fix direction:** Flush on window blur / `beforeunload` (renderer already does this for the canvas) by calling a `flushNodeMetadata` RPC.

---

### 14. Low — Suggestion — Bearer token in query strings

**Where:** `localHttpServer.ts` 75–86; `rpc.ts` `resolveAttachmentStreamUrl` 909–924.

Documented: `<video>`/`<audio>` cannot set `Authorization`. Token in the URL is the pragmatic fix. It can still leak via media logs, crash reports, or Referer if a page is ever navigated.

**Fix direction:** Keep query tokens for media only; prefer header auth for `/ai/chat`, `/unfurl`, `/attachment/upload`. Shorten token lifetime or rotate on HMR (partially already done).

---

### 15. Low — Suggestion — `createNote` IDs are not sidecar-safe

**Where:** `src/bun/notes.ts` 283–309; RPC `createNote` / `saveManifest` allocate `noteId` from the renderer with only a `note_` prefix convention.

Sidecar paths require `NOTE_ID_RE` (`^[A-Za-z0-9_-]+$`). A hand-edited or imported id with slashes still hits `assertWorkspaceNotePath` (safe) but can throw inconsistently on first BlockNote save.

**Fix direction:** Reject or slug `noteId` at `createNote` / `saveManifest` with the same regex.

---

### 16. Low — Suggestion — Settings / license file hardening

**Where:** `normalizeAppSettings` (`index.ts` 1304–1341) accepts any string `theme`, `locale`, `aiModel`, `aiBaseUrl` (no URL parse). `userprefs.json` and `license.dat` are not `chmod 600`. Custom/Ollama `baseUrl` is passed straight to the SDK (user-configured SSRF — acceptable, but a malicious `settings.json` in a shared workspace can point AI traffic anywhere).

**Fix direction:** Enum-validate theme/locale; `URL` parse `aiBaseUrl` to `http:`/`https:` only; chmod prefs/license like credentials.

---

### 17. Low — Suggestion — Preview sanitizer footgun

**Where:** `src/shared/markdown/preview.ts` 136: `options.sanitizeHtml?.(dirtyHtml) ?? dirtyHtml`. Current callers pass a sanitizer. Future callers can persist unsanitized HTML into sidecar `preview.html`. Renderer still DOMPurifies on read.

**Fix direction:** Make `sanitizeHtml` required, or default to a shared sanitizer in `src/shared/markdown/`.

---

### 18. Low — Suggestion — Folder-child search target can stall

**Where:** `src/mainview/routes/index.tsx` 1289–1317. If the folder or expanded-child DOM rect is missing, the effect returns without clearing `pendingSearchTarget`. Usually self-heals on the next render; a broken expansion leaves search "stuck".

**Fix direction:** Timeout / retry budget, then clear the pending target.

---

### 19. Low — Suggestion — `maxRequestTime: Number.POSITIVE_INFINITY`

**Where:** Bun `index.ts` 1641–1642 and renderer `rpc.ts` 64–65.

A hung FS or AI call never rejects. Fine for large imports; bad for UI stuck-spinners.

**Fix direction:** Per-method timeouts (search 5s, save 15s, AI already 60s on tasks).

---

### 20. Nit — Suggestion — Orphan notes are unsearchable by design

**Where:** `search.ts` `scanNotes` only iterates `noteIdToNodes`; `search.test.ts` "ignores notes that no manifest references" and "does not read unreferenced note files".

This is a deliberate performance tradeoff, not a regression. Library UI still lists files. Worth a product decision: should `Cmd+K` include unlinked notes with a "not on any canvas" affordance?

---

### 21. Nit — DX toolchain friction

- `package.json` depends on `typescript@^6` and `@typescript/native-preview` (`tsgo`); `vite.config.ts` comments still talk about "Vite 7" while the dep is Vite 8. Fine if intentional, noisy for contributors.
- `index.html` has no CSP. Desktop webviews often skip this; a strict CSP would harden the markdown/img surface.
- Electrobun `1.18.1` is the right stack for this repo and still a young runtime — the HMR-socket workaround in `rpc.ts` is evidence. Budget time for upstream RPC/streaming quirks rather than inventing more transports.

---

## Performance hot spots

| Area | What's good | Risk |
| --- | --- | --- |
| Canvas nodes | Decorated-node identity cache in `routes/index.tsx` (~1733–1888) preserves object identity for xyflow | `CanvasComponent` still sits in a ~2.3k-line route and re-renders on `nodes`/`edges` |
| Zustand | Per-field selectors; no bare `useCanvasStore()` | `SelectionAIToolbar`, `FocusedView`, `DetachedNotesSidebar` subscribe to the full `nodes` array |
| Search | Substring scan (not regex); default limit 50; no full `content/` walk | Many distinct `noteId`s → many parallel `loadNoteRecord` disk reads; no on-disk index |
| Previews | 30-block cap in `shared/markdown/preview.ts` | `NotePreview` → `hydratePreviewImageSources` fires **one `loadAttachment` RPC per `<img>`**, and `loadAttachment` base64s the whole file |
| Detached library | Works for small sets | No virtualization; each row can hydrate a preview |
| Extensions | Error boundary isolates render crashes | Scheduler + instance JSON parsed on canvas load |

For boards in the low hundreds of nodes this is fine. The first cliff is "many cards with inline images" (N RPC + base64) and "Detached sidebar with hundreds of notes".

---

## Testing vs real risk

**Strong (keep doing this):** canvas store (view switch, folder children, license gate, detach), canvas serialization/export/import, search (including reachability and orphan skip), attachments path sandbox, cleanup delete allowlist, AI apply/summarize, RPC client HMR/init, node components, extension enablement/ids/instance parse.

**Gaps that match the findings above:**

| Risk | Missing or thin test |
| --- | --- |
| Manifest path traversal | No `..` / absolute `view.file` case in `manifest.test.ts` / `workspace.test.ts` |
| Tag search after metadata migration | Backend tests only use markdown frontmatter |
| `saveBlockNote` conflict | `index.test.ts` asserts increment, not reject-stale |
| Extension `expectedRevision` from renderer | Store tests mock update without revision |
| Shared markdown sanitize/render/preview | **No `src/shared/markdown/*.test.ts`** |
| `useBlockNoteSaver` / `hostApi` / `aiPanelStore` | No dedicated tests |
| Legacy `useNoteSaver` failure UX | Partial hook tests; no toast/dirty assertion |
| Sticky Enter-to-edit | Keyboard tests exist; render-phase store update is untested |
| License online-off forgeability | `generateLicenseKey` is tested as a feature, not as a threat |

There is no E2E / Spectron-style Electrobun harness. For this stack that is understandable; the highest-ROI next tests are **unit tests on the path/search/revision bugs**, not a full desktop driver.

---

## Testing / follow-up checklist

Use this as a working list, not a patch series. Order is risk, not calendar.

### Security / integrity

- [ ] Add `assertWorkspaceManifestPath` and reject `..` / absolute / non-`views|trash` prefixes. Test crafted `workspace.json`.
- [ ] Cap `/attachment/upload` and `loadAttachment` size; keep byte-range streaming for media.
- [ ] Restrict `saveAttachmentFile` source paths to dialog-selected files.
- [ ] Conflict-check `saveBlockNote` against disk revision.
- [ ] Pass `expectedRevision` from `extensionInstanceStore.saveNow` and handle conflict.
- [ ] Serialize `workspace.json` mutations.
- [ ] Decide license: online-required for first activate, or stop calling it a license.

### Correctness / product

- [ ] Backend search: load `node-metadata.json` and match tags the same way `searchCurrentView` does.
- [ ] Toast + dirty-keep on legacy note and widget save failure.
- [ ] Move Sticky Enter-to-edit off the render path.
- [ ] Optional: `Cmd+K` affordance for unlinked notes (today intentionally excluded).

### Performance

- [ ] Hydrate preview images via the HTTP attachment URL (or a batched RPC), not per-image `loadAttachment` data URLs.
- [ ] Virtualize `DetachedNotesSidebar` when the detached set is large.
- [ ] Narrow `nodes` subscriptions in `SelectionAIToolbar` / sidebars to selected/detached slices.

### DX / architecture (when touching those files anyway)

- [ ] Extract shared `CanvasRPC` type.
- [ ] Split `src/bun/index.ts` handlers by domain.
- [ ] Gate TanStack Devtools on `import.meta.env.DEV`.
- [ ] Add `src/shared/markdown/*.test.ts` for sanitize + scheme + preview invariants.
- [ ] Add tests for `hostApi` capability gates and `useBlockNoteSaver` cancellation/revision.

### Do not do in a "cleanup" PR

- Do not rewrite Zustand → Query.
- Do not introduce an extension iframe sandbox until the public-plugin work starts.
- Do not add a search index until tag + revision bugs are closed; indexing will freeze today's gaps.

---

## Review method

Read `package.json`, `electrobun.config.ts`, `docs/tech-spec.md`, `docs/subscription.md`, and `README.md` for intended architecture. Walked Bun RPC surface in `src/bun/index.ts`, path helpers, search, license, AI, local HTTP, workspace/manifest, and extension stores. Walked renderer RPC client, canvas/extension stores, search hook, preview/markdown pipeline, FocusedView / detach / AI apply, and test layout. Did not run the desktop app or change product code.

---

## Focused review: 0b99320 (2026-09-07 20:39 +08)

Commit `0b993201321f70d559a102526f3b49cb6e97f61e` — `feat: extension detail and search reachability` (author date 2026-09-07 20:39:53 +0800). Reviewed from `git show` / `--stat` and surrounding call sites only. This is **not** a second whole-repo pass.

### What the commit intended

Close the remaining canvas-extension / search gaps: restore Checklist focused detail through the Canvas Type `DetailSurface` (Pomodoro/Reminder stay canvas-only), keep legacy Folder children recoverable instead of silently becoming cards, route Cmd+Z to the focused extension instance, stop context-menu subscribers from invalidating on every `nodes` identity change, and persist the first post-hydrate mutation. Search gets a shared `SearchResultTarget` (including Folder-child hit-to-open), in-memory fallback coverage for recordings/extensions/folder children, Note Library browse/recover of unlinked note files, a reachability matrix + project fixture, plus smaller D2 fixes (PDF magic-byte check, BlockNote title-only save). Presentation `stripMarkup` now drops closed `<script>`/`<style>` blocks. Lots of tests landed with the behavior.

### Verdict

**No Critical or High issues in this diff.** The D0/D1 product paths are real, wired through, and have dedicated tests (route Folder-child navigation, Library recover markdown vs sidecar, Checklist `DetailSurface`, persistence-after-hydrate, reachability matrix). It is **not perfectly clean**: a few Low leftovers in the new navigation/recovery/detail paths, some dead contract surface, and the commit message over-claims D2 (link-preview / AI *source* files are not in the diff). Residual whole-repo risks (backend tag search, revision locking) are unchanged by this commit and are not re-listed here.

### Findings specific to this commit

#### 1. Low — Bug — Folder-child search can stall if the owner Folder (or expanded child) has no DOM rect

**Where:** `src/mainview/routes/index.tsx` (new effect branch ~1262–1317); triggered from `SearchDialog.tsx` `locateInCurrentView` when `result.target?.type === 'folder-child'`.

The new navigator correctly refuses to treat Folder children as top-level RF nodes. If `querySelector('[data-id="…"]')` misses or `getBoundingClientRect()` is missing, the effect `return`s **without** clearing `pendingSearchTarget` (unlike the “folder/child no longer stored” branches, which do clear). A later layout usually self-heals; a broken expansion leaves search navigation stuck.

`index.test.tsx` covers the happy path (focusable child, matrix child, cross-view non-focusable widget) with elements already in jsdom. There is no retry/timeout test.

**Fix direction:** Retry budget or `requestAnimationFrame` loop, then clear the pending target. Do not block the canvas indefinitely.

---

#### 2. Low — Bug — Checklist detail commits swallow persistence errors

**Where:** new `ChecklistDetailSurface` in `src/mainview/extensions/builtin/productivity/checklist.tsx`:

```106:108:src/mainview/extensions/builtin/productivity/checklist.tsx
        host.instance
          .updateState({ history: 'record', state: nextState })
          .catch(() => undefined);
```

This is the newly restored detail path. A failed `updateState` (revision conflict, RPC down) looks like a successful edit. Canvas-surface checklist updates are not given a toast here either, but this commit is what made detail editing a first-class open.

**Fix direction:** Surface the same save-error toast used by BlockNote focused view; keep the editor dirty.

---

#### 3. Low — Inconsistency — Unlinked Library lists widgets/extensions but only notes are recoverable

**Where:** `LibraryPopup.tsx` `isRecoverableUnlinkedNote` (markdown / BlockNote sidecar only) vs `unlinkedTypeLabel` which also names `.ghostboard/widgets/` and `extension-instances/`. Tests assert two “Place on canvas” buttons for the note rows and that typed records are not recovered as cards.

Browse is useful; the section title is the settings cleanup string, so users will expect a recover action on every row. Widget/extension rows render with no button and no explanation.

**Fix direction:** Hide non-note rows, or add an explicit “not recoverable here / use Settings cleanup” hint.

---

#### 4. Low — Residual — Title-only BlockNote flush still reads `frontmatterRef` updated in an effect

**Where:** new `handleTitleChange` / `handleBlur` in `BlockNoteEditor.tsx` 417–447; `useBlockNoteSaver` `frontmatterRef` is copied in `useEffect`.

The fix is real: title edits now call `saveDebounced` + `flushNow`, and the integration test asserts that. `saveNow` still sends `frontmatterRef.current`. A same-tick blur (change + blur before the title `useEffect` runs) can persist the **previous** title. Pre-existing ref lag; this commit is what made title-only a flush path.

**Fix direction:** Pass the latest title into `flushNow` / `saveNow`, or update `frontmatterRef.current` synchronously when the title changes.

---

#### 5. Nit — Unfinished contract — `SearchResultTarget` type `'content'` / `placement: 'unlinked'` is never produced

**Where:** `src/shared/searchTypes.ts` 49–53; `searchTypes.test.ts` only type-checks the shape. `search.ts` / `useSearch.ts` never emit `type: 'content'`. Unlinked recovery is a separate Library RPC (`rpcScanUnlinkedNotes`), not Cmd+K.

`SearchResult.target` is also optional. Current emitters always set it; if a future caller omits `target` on a Folder child, `locateInCurrentView` falls through to `result.nodeId` and tries to select a node that is **not** on the canvas.

**Fix direction:** Either emit unlinked hits from search or drop the unused variant until Cmd+K grows that feature. Consider making `target` required on `SearchResult`.

---

#### 6. Nit — Commit message vs diff — D2 “link preview/AI failure bounds” are not in this commit’s source

`--stat` touches `src/bun/linkPreview.test.ts` and a large `src/test/projectFixture.ts`, but **not** `linkPreview.ts`, `ai.ts`, or `aiTasks.ts`. The actual D2 product hunks here are AssetNode PDF signature checks and the BlockNote title-only save. The extra tests may lock existing bounds; they are not a behavior change in this SHA.

---

#### 7. Nit — Duplicated target helpers and hardcoded English

`contentReferenceForNode` / `targetForNodeRef` exist in both `src/bun/search.ts` and `src/mainview/hooks/useSearch.ts` (renderer also accepts `nodeType === 'note'`). Fine for a first cut; they will drift.

New `unlinkedTypeLabel` strings (`Note sidecar`, `Legacy widget`, …) and the PDF failure copy in `AssetNode` are hardcoded English while the surrounding Library chrome is Paraglide.

---

### Security (this commit only)

Nothing Critical/High introduced or worsened.

- **Presentation sanitizer** (`presentation.ts`): `DANGEROUS_BLOCK_RE` now removes closed `<script>`/`<style>` **bodies** before `TAG_RE` strips tags. That is a small improvement for searchable/plain-text presentation (the old path left `alert(1)` in the string). Presentation is not rendered as HTML. Unclosed tags still leak text. Test already covers the closed-`<script>` case.
- **Unlinked recover** passes `file` / `noteId` from `rpcScanUnlinkedNotes` into `createNode`. That RPC was already path-constrained; this commit does not add a new filesystem primitive.
- **PDF check** decodes at most 64 base64 chars / 1 KiB URI payload before mounting an iframe. Sensible; not a new trust boundary.
- Folder-child `querySelector(\`[data-id="${folder.id}"]\`)` assumes ids are CSS-safe. App-generated ids are; not a new XSS.

### Tests added vs still missing

**Landed (good):** Folder-child open (focusable, matrix, cross-view non-focusable widget) in `routes/index.test.tsx`; SearchDialog target plumbing; `useSearch` recording/extension/folder-child; reachability matrix + `search.test.ts`; Library unlinked scan/fail/sidecar recover; Checklist `FocusedView` DetailSurface; persistence “first layout change when mounted after hydration”; ContextMenu primitive selectors; `builtinIds` search-kind mapping; presentation script/style strip; BlockNote title-only blur; AssetNode PDF signature.

**Still missing for the new behavior:**

- [ ] Folder-child pending target when the Folder node is not in the DOM (stall / timeout).
- [ ] Title-only save asserts **frontmatter title** on `rpcSaveBlockNote`, not only that `saveDebounced` was called.
- [ ] Checklist detail `updateState` rejection shows UI (today `.catch(() => undefined)`).
- [ ] Recover-unlinked when `createNode` returns undefined (license / no placement) leaves the row and does not claim success.
- [ ] `stripMarkup` unclosed `<script>` (documents residual, not a product XSS).

### Unfinished / dead / inconsistent (diff)

| Item | Notes |
| --- | --- |
| `SearchResultTarget` `'content'` + `unlinked` | Typed and unit-tested as a shape; no producer in search |
| `SearchResult.target?` optional | New navigation depends on it for Folder children |
| D2 AI/unfurl “bounds” | Tests/fixture only; implementation files unchanged |
| Duplicate target builders | Bun vs renderer copies |
| `unlinkedTypeLabel` | Lists types the recover button will not handle |
| Planning markdown (~1.7k lines of `.planning/` + public-plugin redesign) | Not product risk; makes the SHA harder to review as a behavior change |

No product code was changed for this focused pass.
