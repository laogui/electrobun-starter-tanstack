# GhostBoard — Design Review

- **Mode:** review
- **Date:** 2026-07-04
- **Score:** 35 / 50
- **Verdict:** MIDDLE — focused interventions, not rethinking
- **Register:** Product (canvas tool, not brand)
- **Surface reviewed:** Renderer canvas app (`src/mainview/`), Electrobun desktop. Evidence from `routes/index.tsx`, `routes/__root.tsx`, `FocusedView.tsx`, `CardNode.tsx`, `StickyNode.tsx`, `SearchDialog.tsx`, `EmptyCanvasOverlay.tsx`, `ViewSwitcher.tsx`, `Select.tsx`, `useCanvasKeyboard.ts`, `index.css`, `settingsClient.ts`, plus `bun run check` + `bun run test` results. App not launched; review is implementation-grounded.
- **Context:** An in-progress `/design recolor` left the codebase mid-migration. This review judges the current actual state, including that half-applied recolor.

## First impression (named)

A sticky-note canvas knowledge tool. The first viewport is a pannable dot-grid canvas with colored note cards, a slim draggable titlebar with a centered search field, and a floating bottom control cluster (view switcher + create + export). The most memorable detail is the **pure-CSS metallic pushpin** on each sticky note (gradient + inset highlight + cast shadow + glint) — an authored, domain-specific touch that signals "this was designed, not generated." The empty state teaches the space (create / templates / library) with a drop hint. The voice is calm-instrumental, appropriate for a daily-use Product surface. What it lacks is a memorable color point of view — the accent is generic Tailwind blue, currently mid-re-authoring.

## Primary flow walked

Arrive → hydrated canvas (Loader gate) → cards visible. Create a note: bottom `+` menu → "note" → card appears at viewport center, or drag-drop a file, or paste, or right-click pane → context menu. Organize: drag cards, draw connections between handles, group into folders, tag. Locate: `⌘K` search → grouped results → Enter jumps + centers. Focus: single-click a card → FocusedView expands (full-bleed for text/checklist/image, centered rounded shell for asset/link) with `⌘←/→` sibling navigation and Escape to close. Delete: `Delete` → toast with Undo. The story holds end-to-end; the breaks are in color consistency, screen-reader access, and the unfinished recolor (below).

## Scoring

| Lens | Score | Verdict |
|---|---|---|
| First impression | 7/10 | clear POV, authored details; generic accent |
| Hierarchy | 8/10 | strong 3-level chain; zoomed-out skeletons |
| Color voice | 5/10 | accent half-tokenized + build broken; neutrals untinted |
| Type voice | 8/10 | honest system stack, micro scale; density layer pending |
| Interaction feel | 7/10 | comprehensive keyboard + undo; SR semantics weak; recolor regression |
| **Total** | **35/50** | **middle** |

## Lenses

### First impression — 7/10
Memorable pushpin, considered empty state, calm-instrumental voice. Loses points for the generic blue accent (the one predictable-from-category reflex) and the absence of a strong color point of view. The accent is being re-authored to an "ink blue" but the migration is incomplete, so the first impression is currently inconsistent (some surfaces tokenized, most still raw `blue-*`).

### Hierarchy — 8/10
The eye knows what matters: titlebar search (centered, kbd hint) → canvas cards (title + preview, or skeleton bars when zoomed out) → bottom control cluster. FocusedView correctly distinguishes full-bleed (text/checklist/image) from centered rounded shell (asset/link), with floating chrome buttons that respect the macOS traffic-light offset (`top-12 left-6`). Each card carries a 3-level chain (tag chips → title → preview). The zoomed-out skeleton-bar layout is a genuine hierarchy decision — cards stay scannable at low zoom instead of rendering unreadable tiny text. Minor loss: the bottom cluster's three floating pills (view/export/create) read as equal weight when create is the primary verb.

### Color voice — 5/10 (weak)
This is the weakest lens and the active failure. Findings:
- **Accent is generic Tailwind blue** with no project-specific reason. Being re-authored to an "ink blue" (hue 255, OKLCH) — a defensible Product-register choice — but the migration is ~25% complete: **26 files still use raw `blue-*`, 8 use the new `accent` tokens.** The CSS unification (three divergent accent colors — UI `blue-500`, connection-active `HSL 220`, selected-edge `#1a7f74` teal — onto one hue) IS done and is the real color decision this pass.
- **The half-applied recolor broke the build.** `bun run check` emits 1 formatting error (`DetachedNotesSidebar` line 301, from the migration) and `bun run test` shows **4 new failures** in `SearchDialog.test.tsx` (assertions expect `bg-blue-50`, now `bg-accent-softer`). This is a P0 regression that must be resolved before any further color work.
- **Neutrals are pure gray**, not tinted toward the brand hue. Stone/neutral surfaces read as cold next to the blue accent. A whisper of chroma (<0.02) would make them feel authored.
- **Dark mode is inversion-ish**: light surfaces → dark surfaces, light text. No accent chroma reduction for dark (accents glow), no neutral hue cast. Functional, not authored.
- Positive: the HSL group tokens (`--group-blue/green/yellow/pink/orange`) for canvas groups are a real, restrained palette. `isColorDark()` correctly flips card text. The Whisper-level accent usage (accent stays rare) is correct for the register.

### Type voice — 8/10
Recently tokenized and honest. The `@theme` block declares `--font-sans` as an explicit system-UI stack (not Inter, which was never loaded — the prior code falsely claimed an "Inter stack" in `index.css` that didn't exist). Serif/mono settings stacks mirror the tokens. A micro type scale (`text-2xs` 11px, `text-3xs` 10px) replaced 34 arbitrary-px utilities. Weight hierarchy is coherent (`font-medium` default 109 uses → semibold 42 → bold 17). Note-preview line-heights are tuned (`text-sm/relaxed`, `text-2xl/snug`). Loses points for: the 12px/13px arbitrary density layer (78 uses across settings/panels) not yet tokenized; dark-mode line-height compensation for light-on-dark not done; the FocusedView centered shell uses `rounded-[32px]` (a very large radius) which is consistent with `rounded-3xl` cards but pushes toward pill-card territory.

### Interaction feel — 7/10
Strongest dimension in coverage, with one active regression. Findings:
- **Comprehensive keyboard layer** (`useCanvasKeyboard`): spatial Arrow nav with auto-center, Enter opens/edits, Delete, full clipboard, group/ungroup, undo/redo, zoom, `⌘K` search, type-to-search. This offsets React Flow's `disableKeyboardA11y`.
- **Undo beats confirm** for node/view deletes (Sonner toast + Undo action); folder deletes still confirm — the right split.
- **Single-click-to-open** model is well-reasoned and consistently applied (cards, stickies edit on single click).
- **Focus rings** are present and consistent (`focus-visible:ring-accent/60`, offset) — now on the accent token.
- **9-states coverage**: empty (EmptyCanvasOverlay), loading (Loader, FocusedSkeleton), error (search error row, save-failed toast), disabled (menu items, dialog buttons), hover/active throughout. Good.
- **Weak SR semantics on the spatial canvas**: the `role="application"` landmark was added (finish pass), but node visuals use `role="presentation"` on interactive divs (`StickyNode` node-visual) and there is no `aria-live` region announcing selection/counts. Screen-reader users still cannot traverse the canvas meaningfully; the search dialog remains the only documented accessible path.
- **Recolor regression**: the interrupted migration broke 4 tests + check (see Color voice). A regression in the interaction-verification surface.
- **No in-app motion control**: `prefers-reduced-motion` is honored via OS media query only; no Settings toggle.

## Smell lens

Not obviously AI-generated. The pushpin, the zoomed-out skeletons, the undo-over-confirm model, the HSL group tokens, the single-click-open reasoning, and the hydration/identity-cache performance patterns all show authorship. The one smell is the **generic blue accent** — predictable from the "canvas/productivity tool" category — which the recolor is mid-fix. A secondary smell is the **visible inconsistency from the half-applied recolor**: some surfaces now use `accent` tokens, most still use `blue-*`, so the accent reads as two slightly different blues depending on which surface you're looking at. This is a transient state, not a design smell, but it currently fails the 2-second test.

## Priority issues (ordered by impact)

### P0 — Recolor left the build broken
**Evidence:** `bun run check` emits 1 error (`DetachedNotesSidebar` line 301 formatting, from the migration). `bun run test` shows 4 new failures in `SearchDialog.test.tsx` (`expect(...).toHaveClass('bg-blue-50')` now finds `bg-accent-softer`). The recolor migrated ~8 of 26 blue-using files then stopped.
**Why it matters:** A broken check + failing tests block ship and mask future regressions. Half-tokenized color is worse than either fully-raw or fully-tokenized.
**Next move:** Complete the recolor — fix the formatting, update the 4 test assertions to `bg-accent-softer`, migrate the remaining 18 blue-* files, re-run check + test. This is `/design recolor` (finish), not a new mode.

### P1 — Accent system half-tokenized
**Evidence:** 26 files on raw `blue-*`, 8 on `accent` tokens. CSS unification done. The accent now reads as two slightly different blues depending on surface.
**Why it matters:** Inconsistent accent erodes the "designed, not assembled" impression and makes future re-authoring (one token change) impossible until complete.
**Next move:** Finish `/design recolor` — migrate the remaining files (LicenseStatusCard, LicenseActivationDialog, ReplaceImageConfirmDialog, AboutPanel, LibraryCard, LibraryPopup, WorkspacePanel, AIPanel, TagEditor, LinkNode, GroupNode, SettingsApp, GeneralPanel, RecordingNode, ImageNode, AssetNode, DeleteView/FolderConfirmDialog, routes/index.tsx drop overlay).

### P1 — Canvas screen-reader semantics still weak
**Evidence:** `role="application"` landmark added (good), but node visuals use `role="presentation"` on interactive divs and there is no `aria-live` region. Screen-reader users cannot traverse or count canvas contents.
**Why it matters:** A spatial canvas is inherently hard for AT, but the current state offers no equivalent path beyond search.
**Next move:** `/design surface` — add a polite `aria-live` region announcing selection/counts, replace `role="presentation"` on interactive node divs with appropriate roles, document search as the accessible alternative from the empty state.

### P2 — Neutrals not tinted toward brand hue
**Evidence:** Stone/neutral surfaces are pure gray. Next to the ink-blue accent they read cold and unrelated.
**Next move:** `/design refine` or follow-up `/design recolor` — add a trace of chroma (<0.02) to the neutral scale, clamped at lightness extremes.

### P2 — 12/13px density layer not tokenized
**Evidence:** `text-[12px]`×31 and `text-[13px]`×47 remain arbitrary, concentrated in settings/panels. The micro scale (10/11px) was tokenized; this mid layer wasn't.
**Next move:** `/design typeset` follow-up — decide whether 13px aligns to `text-sm` (14px) or gets its own token, then migrate.

### P2 — Dark mode is inversion, not authored
**Evidence:** Dark surfaces are light-mode surfaces inverted. No accent chroma reduction (accents glow), no neutral hue cast, no line-height compensation for light-on-dark.
**Next move:** `/design refine` — reduce accent chroma ~10-15% in dark, tint dark neutrals, add line-height/letter-spacing compensation to light-on-dark text.

### P2 — No in-app motion control
**Evidence:** `prefers-reduced-motion` honored via OS media query only.
**Next move:** `/design responsive` or `/design motion` — add a Settings motion preference (None / Reduced / Standard) defaulting to OS.

## What's working (do not lose these)

- **Pure-CSS pushpin** — authored, domain-specific, crisp at any zoom. A real point of view.
- **Zoomed-out skeleton layout** — cards stay scannable instead of rendering unreadable tiny text. A genuine hierarchy decision.
- **Undo-over-confirm** with the correct exception (folder delete). Right split.
- **Single-click-to-open** model, consistently applied.
- **Comprehensive keyboard layer** that offsets React Flow's `disableKeyboardA11y`.
- **FocusedView full-bleed vs centered-shell distinction** with `⌘←/→` navigation and traffic-light-aware chrome.
- **HSL group tokens** for canvas groups — restrained, real palette.
- **Honest type system** — system-UI stack declared explicitly, not a fake Inter claim.

## Recommendations (ordered)

1. **`/design recolor` (finish)** — resolve the P0 broken build + complete the 18-file migration. Nothing else should proceed until this is green.
2. **`/design surface`** — harden canvas SR semantics (live-region, node roles, search as documented accessible path).
3. **`/design refine`** — tint neutrals, author dark mode (chroma reduction + line-height compensation).
4. **`/design typeset` (follow-up)** — tokenize the 12/13px density layer.
5. **`/design responsive`** — add in-app motion control; verify narrow-window chrome.

## Cognitive load / risk

- **PASS:** Flow holds end-to-end; multiple paths to every action; undo safety net; authored details; honest type.
- **WATCH:** Accent inconsistency (transient); SR access; dark-mode authorship; density-layer tokenization; motion control.
- **FAIL:** Build is currently broken from the interrupted recolor (P0, transient).
