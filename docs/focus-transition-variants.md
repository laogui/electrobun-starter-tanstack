# Focus transition variants

The card → focused-view open / close animation is pluggable
(`src/mainview/components/canvas/focusTransition/`). Each variant registers in
`registry.ts`; in dev builds any registered one can be selected at runtime:

```js
localStorage.setItem('gb:focus-transition', '<id>'); location.reload();
```

## D — View Transitions API (`viewTransition`)

**What it does.** Uses same-document `document.startViewTransition`. On open
the canvas card's rounded surface (`.node-visual`) gets
`view-transition-name: gb-focus-card` and its title `gb-focus-title`; inside
the transition's update callback the focus state is set with `flushSync`, the
names move to the note's reading column (`[data-focus-surface]`, or the
fullscreen root when a surface has no column) and to the static preview title
(`[data-focus-title]`), and the source card is hidden so it does not stay
behind. WebKit then morphs the card into that column. Targeting the viewport
stretches the text snapshot to the screen, then the centered column snaps
back. Close is the reverse (column → card, editor title → card title), wrapped
around `setFocusedNode(null)`.

- Pseudo-element styling lives in `index.css` under `.gb-vt-focus` (a class on
  `<html>` only while one of these transitions runs): 280 ms open / 220 ms
  close, ease-out-quint, page (`root`) crossfade disabled. Snapshots are not
  scaled (`object-fit: none` inside a clipping group; titles at natural size),
  so text never stretches; the corner radius animates 24 px → 0 via
  `clip-path` on the image pair.
- Motion layers get no-op props for VT sessions, so AnimatePresence has no
  exit to run (no double animation). "Open complete" (deferred editor mount,
  canvas `visibility: hidden`) is the transition's `finished`, delivered
  through the plan's new `waitForOpen`.
- All open / close call sites go through `runFocusTransition(update, …)`
  (`runFocusTransition.ts`): canvas click / double-click
  (`openNodeFocusedView`), library (`openFocusedById`), keyboard Enter / Esc,
  the focused view's back button / Esc (host `handleClose`), and the extension
  host `closeDetail`. For any other variant the helper just calls `update()`.

**Requirements.** Same-document View Transitions: Safari / WKWebView 18.0+
(macOS 15 Sequoia, or macOS 13.x/14.x with Safari 18 installed — WKWebView
uses the system WebKit). Chromium 111+ also works.

**Fallback.** `scaleMorph` is used (the plan returns `scaleMorph.plan`) when
`startViewTransition` is missing, `prefers-reduced-motion` is set, the source
card is not on screen (e.g. culled), or the view was opened by a path that is
not routed through the helper (search navigation, context menu, extension
`openDetail`, folder views). Those sessions close with `scaleMorph` too.

**How to test.**

1. `bun run dev:hmr`, open a canvas, click a note card / press Enter on a
   selected one, then close with the back button or Esc. Also open from the
   library popup and an image card (lightbox).
2. DevTools console: each run logs
   `[focus-anim] open viewTransition ready +Nms` (snapshot capture → animation
   start), `… finished +Nms`, and the rAF frame stats
   (`[focus-anim] open viewTransition: N frames in Nms, dropped(>20ms)=…`),
   likewise for `close viewTransition`. Fallback sessions log
   `[focus-anim] open viewTransition: …` from the host probe only (no
   ready / finished lines).
3. Force the fallback: `document.startViewTransition = undefined` in the
   console, or enable Reduce Motion in System Settings.
