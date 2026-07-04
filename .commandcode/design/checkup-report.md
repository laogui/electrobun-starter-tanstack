# GhostBoard — Design Checkup

- **Mode:** checkup
- **Date:** 2026-07-04
- **Score:** 45 / 60
- **Verdict:** WATCH — mostly healthy, ship with targeted fixes
- **Surface audited:** Renderer canvas app (`src/mainview/`), Electrobun desktop build. Evidence taken from `routes/index.tsx`, `routes/__root.tsx`, `hooks/useCanvasKeyboard.ts`, `components/canvas/*`, `components/ui/*`, `components/search/SearchDialog.tsx`, `index.css`. App was not launched in this pass; vitals are read from implementation.

## TL;DR

GhostBoard is a sticky-note / canvas knowledge tool built on React Flow. The design is **intentional**, not assembled from defaults: a Whisper-level blue accent, dual light/dark canvases with HSL group tokens, a tuned empty/onboarding state, zoomed-out card skeletons, and an undo-over-confirm deletion pattern. Usability is strong — create, organize, connect, and locate notes all have several paths (drag-drop, paste, context menu, create menu, keyboard, search-to-locate).

The watch items are real but contained: **low-contrast secondary text** (gray-400 / neutral-400 at 10–12px ≈ 2.8:1, fails WCAG AA), weak **screen-reader semantics** on the spatial canvas, **narrow-window** behavior that is unverified, and **runtime speed** that I could not measure without launching Electrobun. None block continued work; the contrast and a11y-semantic items should be fixed before ship.

**Primary recommendation:** run `/design surface` to harden the canvas's accessibility contract (contrast pass + ARIA landmark/live-region for the pane) and `/design responsive` to verify narrow windows and add an in-app motion control.

## Vital signs

| # | Vital | Status | Score | Key finding |
|---|---|---|---|---|
| 1 | Intentionality | Healthy | 10/10 | Authored tokens, dual-theme canvas, considered empty/zoomed-out states; generic blue accent is the only reflex (defensible at Whisper level). |
| 2 | Readability | Healthy | 10/10 | Clear type hierarchy, tuned note-preview line-heights, `isColorDark()` flips card text; minor 10–11px metadata at the lower edge. |
| 3 | Usability | Healthy | 10/10 | Primary task fully supported via multiple paths; undo-toasts beat confirm; single-click-open model is well-reasoned. |
| 4 | Responsiveness | Watch | 5/10 | Desktop app (mobile gauntlet N/A), but narrow-window crowding unverified; reduced-motion is OS-media-query only; physical L/R positioning (RTL N/A for en/zh). |
| 5 | Speed | Watch | 5/10 | Strong perf patterns in code (rAF throttle, node-identity cache, compositing isolation, hydration gate); runtime jank not verified in this pass. |
| 6 | Accessibility | Watch | 5/10 | Comprehensive custom keyboard layer + focus rings + aria-labels + reduced-motion query; but small gray-400 text fails AA contrast and the spatial canvas lacks SR semantics. |

## Composition vital sign

Surface is an **Operate** canvas: tools (create menu, context menu), targets (nodes), feedback (selection outline, helper lines, drop overlay), and undo (delete toasts) are all close to the hand. Composition matches the work. Pass.

## Prompt fidelity vital sign

Name (GhostBoard), category (canvas knowledge tool), and core artifact (sticky/cards/connections) are visible and domain-specific. The empty-state proof object (create-note / templates / library) belongs to this product and would be wrong elsewhere. Pass.

## Evidence bar

Vitals are based on visible implementation: React Flow props, the keyboard hook, focus-ring class strings, color/size utility classes, and the CSS token + reduced-motion blocks. The app was **not launched**, so Speed is marked Watch (runtime unverified) rather than Healthy. No vital was marked healthy without file evidence.

## What's working

- **Intentional token + theme system.** `:root` HSL group tokens (`index.css`), `better-themes` dark/light switching, canvas background presets (`default/paper/mono`) with dark fallback `#141414`, and `isColorDark()` flipping card text color. Not default Tailwind soup.
- **Comprehensive keyboard command layer.** `useCanvasKeyboard.ts` spatially navigates nodes with Arrow keys (+ auto-center off-screen), Enter opens focused view / edits stickies, Delete removes, full clipboard (copy/cut/paste/duplicate), group/ungroup, undo/redo, zoom, Cmd+K search, and type-to-search. This offsets React Flow's `disableKeyboardA11y`.
- **Undo beats confirm.** Node and view deletes emit a Sonner toast with an Undo action rather than a blocking confirm dialog; folder deletes still confirm (irreversible-ish) — the right split.
- **Zoomed-out legibility.** `CardNode` swaps the full preview for a title + skeleton-bar layout when zoomed out, keeping cards scannable at low zoom instead of rendering unreadable tiny text.
- **Performance-conscious rendering.** `decoratedNodesCacheRef` preserves node object identity across store updates (avoids whole-canvas re-render each drag frame), rAF-throttled drag-over, `isolation: isolate` per node to stop repaint flicker, and a hydration gate with `Loader`.
- **Strong empty/onboarding state.** `EmptyCanvasOverlay` teaches the space (create / templates / library) with a drop + create-menu hint row, focus rings, and dark variants.

## Priority issues

### P1 — Low-contrast secondary text fails WCAG AA
**Evidence:** `text-gray-400` / `text-neutral-400` (≈ #9ca3af) at `text-[10px]`–`text-xs` (10–12px) on white: ~2.8:1, below the 4.5:1 AA minimum for normal text. Occurrences: titlebar kbd hint (`__root.tsx`), view node-count (`ViewSwitcher.tsx`), search result meta + group count (`SearchDialog.tsx`). `text-gray-500` excerpt text is borderline-pass (~4.8:1).
**Why it matters:** Low-vision users lose secondary wayfinding (counts, match fields, shortcut hints) — exactly the cues that help orientation.
**FIX:** Raise every secondary text under 14px to `gray-500`/`neutral-500` minimum (≥4.5:1), or bump size to ≥14px. Audit with a contrast check across both themes; `gray-400` on `neutral-900` dark surfaces is fine, the light-theme pair is the failure.

### P1 — Spatial canvas has weak screen-reader semantics
**Evidence:** The React Flow pane is not exposed as a labeled application/landmark, and nodes have no programmatic labels or roles a screen reader can traverse (React Flow renders to divs/SVG). `disableKeyboardA11y` + `nodesFocusable={false}` removes the built-in focus chain, replaced by a custom key handler that has no SR-equivalent announcements.
**Why it matters:** Screen-reader users cannot perceive the canvas's contents, count, or current selection. The keyboard layer helps sighted keyboard users but not non-sighted ones.
**FIX:** Wrap the pane in `role="application" aria-label="Note canvas"` with a keyboard-shortcut hint; add a polite `aria-live` region announcing selection/counts (the store already tracks `nodes.length` and selection); keep the search dialog as the documented accessible alternative path and surface it from the empty state.

### P2 — First-load keyboard entry point may strand users
**Evidence:** Arrow-key navigation in `useCanvasKeyboard` calls `selectNodeInDirection` from the currently selected node; on a freshly hydrated canvas with no selection, arrow keys may have no anchor. `Cmd+K` (search), `Cmd+N` (create), and type-to-search still work, so users are not fully stranded.
**Why it matters:** A keyboard-only user landing on a populated canvas has no obvious first move beyond opening search.
**FIX:** On hydration, focus a logical first node (or a canvas landmark) so arrow nav has a starting selection; add a `?` / help affordance listing the keyboard map.

### P2 — Narrow-window behavior unverified
**Evidence:** Bottom controls are `fixed bottom-6 left-1/2 -translate-x-1/2` and the titlebar search is `min-w-[14rem] max-w-md` centered. No breakpoints guard these for narrow widths; the canvas itself is pannable so content is fine, but chrome could crowd/overlap below ~700px.
**Why it matters:** Desktop users run in half-width windows frequently; overlapping floating controls read as broken.
**FIX:** Test at 600–800px width; clamp or stack the bottom cluster and titlebar search; ensure the minimap/controls don't collide.

### P2 — Reduced-motion has no in-app control
**Evidence:** `index.css` honors `@media (prefers-reduced-motion: reduce)` globally (good baseline), but there is no Settings toggle for motion preference.
**Why it matters:** Users who want less motion without changing an OS setting, or more expressive motion, have no control.
**FIX:** Add a motion preference to Settings (None / Reduced / Standard) defaulting to the OS value.

### P2 — Runtime speed unverified
**Evidence:** Code shows strong patterns (identity cache, rAF throttle, compositing isolation, hydration gate, devtools hidden until hover) but actual load time and pan/drag jank were not measured without launching the Electrobun build.
**Why it matters:** Canvas tools live or die on drag/pan smoothness at scale.
**FIX:** Run `bun run dev:hmr` on a large canvas (200+ nodes), check pan, drag, resize, and modal-open latency; watch for layout shift on hydration.

## Cognitive load / risk

- **PASS:** Multiple redundant paths to every primary action; undo safety net; clear empty state; zoomed-out legibility; strong keyboard map.
- **WATCH:** Secondary-text contrast; SR semantics on canvas; narrow-window chrome; runtime speed; first-load keyboard anchor.
- **FAIL:** None blocking.

## Next modes

- `/design surface` — harden the canvas accessibility contract (contrast pass + ARIA landmark/live-region + keyboard-map help).
- `/design responsive` — verify narrow windows, clamp floating chrome, add motion control.
- `/design review` — if a deeper scored critique is wanted before ship.
- `/design deslop` — only if you want to rethink the generic blue accent for a more authored hue (optional; current Whisper usage is defensible).
