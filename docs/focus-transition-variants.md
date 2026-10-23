# Focus transition variants

The focused-view open / close animation is pluggable
(`src/mainview/components/canvas/focusTransition/`). Each variant implements
`FocusTransition` and is registered in `registry.ts`; the branch default is
`DEFAULT_FOCUS_TRANSITION`.

## Testing any variant

1. `bun run dev:hmr`
2. Open a few notes from the canvas (different sizes, colors, zoom levels,
   one inside an expanded folder) and close them with Esc / the back button.
3. Read the dev console: every open / close logs a line such as
   `[focus-anim] open scaleTuned: 17 frames in 286ms, dropped(>20ms)=0, longest=17.1ms`.
4. Switch variants at runtime without rebuilding (dev builds only):

   ```js
   localStorage.setItem('gb:focus-transition', 'scaleMorph'); location.reload();
   localStorage.removeItem('gb:focus-transition'); location.reload(); // back to default
   ```

   Unknown ids fall back to the default.

## Variant A: `scaleTuned` (default on `anim/a-scale`)

Registered ids on this branch: `scaleTuned` (default), `scaleMorph` (the
anim/base behaviour, kept for comparison).

**What it does**

- **Shell = card-shaped colour plate.** It starts on exactly the card's screen
  rect: `translate(left, top) scale(w / W, h / H)` from a `0 0` origin, so
  there is no 0.86 floor and no "origin trick". A plain plate has no content,
  so it can scale non-uniformly. That makes the first frame match the card's
  proportions with transform only, with no clip-path. It fades in over the
  first 25% of the open, covering the real card, then grows to the viewport.
- **Corner radius counter-scaled per axis.** The radius is written as
  `rx/sx px / rx/sy px` and sampled in time with the same easing as the
  transform. The *visible* corner then goes smoothly from the card's on-screen
  radius (CSS radius × canvas zoom, measured from `.node-visual`, fallback
  12px) to 0, without stretching.
- **Colour.** A note's focused surface is tinted with the card colour, so the
  plate keeps the card's hex colour the whole time and the landing frame
  matches the editor. Non-note surfaces with a card colour get an overlay
  plate in the card colour that cross-fades (opacity only) to the surface
  colour.
- **Content trails.** The note layer scales uniformly, so text never distorts.
  It uses a centred "contain" fit inside the plate × 0.94, so it sits just
  inside the plate and lands at the same time. It stays transparent until 40%
  of the open, then fades in. Before that point the text would read as a
  blurry thumbnail.
- **Compositor-friendly.** Transforms are full `transform` strings rather than
  motion's independent `x` / `scale` values, so motion can run them, and
  opacity, through WAAPI off the main thread. That matters while the editor
  chunk mounts. Only the plate's border-radius ticks on the main thread, and
  it is a solid-colour repaint.
- **Close mirrors the open** back onto the card's *current* rect. The exit is
  a variant resolver that calls `ctx.readSourceRect()` when the exit starts,
  re-reading the card's DOM rect (fallback: the open-time rect). Content fades
  out in the first 45%. The plate fades out over the last 40% to reveal the
  real card underneath.
- **Reduced motion:** a plain 100ms / 80ms fade.

**Why:** scaleMorph clamped the start scale to 0.86 to 0.92. So the "card"
the open grew from was really a nearly full-screen panel at the card's centre:
wrong size, wrong aspect, no corners, wrong colour. The open read as a fade
and zoom pop, not as "this card became the page". The close also aimed at the
open-time rect.

**Interface additions** (optional, backward compatible) in
`FocusTransitionContext`: `readSourceRect?()` (live DOM rect) and
`sourceRadius?` (on-screen card radius). Both are filled in by `FocusedView`.

**Known trade-offs**

- Between the plate covering the card (~70ms) and the content fading in
  (~110ms) the card's text is briefly hidden behind a blank plate. This is
  intended, but worth judging by eye.
- Under heavy main-thread jank the WAAPI transform keeps moving while the JS
  radius lags. Corners can be briefly off.
- Expanded folder children: the close re-reads `[data-id=<child id>]`. If
  that element is not found, the close lands on the open-time rect.
