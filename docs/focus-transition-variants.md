# Focus transition variants

The card → focused-view animation is pluggable: see
`src/mainview/components/canvas/focusTransition/` (`types.ts` for the
interface, `registry.ts` for the default and the dev override).

## Variant C — FLIP shell + content fade (`flipShell`)

Default on branch `anim/c-flip`. Implementation: `focusTransition/flipShell.ts`.

**What it does**

- **Shell** — an empty layer painted in the card color (uncolored notes: the
  white editor surface; lightbox / panel surfaces keep their own background).
  It is FLIPped with a non-uniform `translate(x, y) scale(sx, sy)` (origin
  `0 0`) from exactly the card's screen rect to the full viewport, 280ms
  ease-out-quint. It fades in over the first 70ms so the card's own text
  crossfades away instead of popping.
- **Corners** — the shell's `border-radius` is animated in layer space as an
  elliptical `rx / ry` counter-scaled per axis, so the corners stay circular
  on screen (≈20px → 0). Keyframe times are placed on the transform's easing
  curve so the radius tracks the flight.
- **Content** (static note preview + chrome) never scales: it fades in from
  45% of the shell duration (126ms) with `translateY(12px) scale(0.985)` → 0,
  180ms. The open "completes" on the content layer (~306ms), so the editor
  mounts and the canvas is hidden only once the content is fully opaque.
- **Close** — content fades out in 100ms; from 80ms the shell flies back to the
  card's *current* DOM rect (re-measured when the exit starts via
  `context.measureSourceRect`, so sibling navigation or the recentring pan is
  honoured; folder children fall back to the open-time rect) and fades out
  over the last ~28% so the canvas card takes over without a pop. ≈300ms.
- **Reduced motion** — plain 100ms / 80ms opacity fade on both layers.

**Why**

The shell holds no text, so non-uniform scaling is free of distortion and the
silhouette tracks the card exactly (scaleMorph can only approximate it with a
clamped uniform scale). Transform and opacity are animated as whole
`transform` / `opacity` values, which motion hands to WAAPI — WebKit runs them
on the compositor, so React commits or the editor chunk landing mid-flight do
not stall the shell. The text-bearing content layer is never scaled, so it is
never blurry or reflowed.

**Trade-offs / risks**

- `border-radius` is the one non-compositor property: it is JS-driven and
  repaints the (flat color) shell each frame while the radius is non-zero. If
  the `[focus-anim]` numbers or WebKit paint flashing show it costs frames,
  drop the radius keyframes (set `CARD_RADIUS_PX = 0`); corners then start
  square.
- The screen radius is a constant (20px) — the canvas zoom is not in the
  transition context, so at very low / high zoom the start corners differ
  slightly from the card's.
- No ghost title overlay (the context carries no title); the card text fades
  under the shell instead.

**How to test**

1. `bun run dev:hmr`, open a few notes (colored, uncolored, tall / wide
   cards, from a zoomed-out canvas), navigate siblings with ⌘←/⌘→, close with
   Esc and the back button, also after panning the card off-screen.
2. Read the dev console `[focus-anim] open flipShell: …` /
   `[focus-anim] close flipShell: …` lines (frames, dropped frames > 20ms,
   longest frame) and compare against other variants.
3. Switch variants at runtime (dev builds only):

   ```js
   localStorage.setItem('gb:focus-transition', 'scaleMorph'); location.reload();
   localStorage.setItem('gb:focus-transition', 'flipShell'); location.reload();
   localStorage.removeItem('gb:focus-transition'); location.reload(); // default
   ```
4. macOS: System Settings → Accessibility → Display → Reduce motion to check
   the fade fallback.
