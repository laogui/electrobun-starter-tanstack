# Focus transition variants

The card → focused view open / close animation is pluggable
(`src/mainview/components/canvas/focusTransition/`). Each variant implements
`FocusTransition` and is listed in `registry.ts`; `DEFAULT_FOCUS_TRANSITION`
picks the shipped one.

## How to test any variant

1. `bun run dev:hmr`, open a board, open / close a few notes (click, Enter,
   Cmd+←/→ between siblings, Esc), at different zoom levels and with cards
   near the viewport edges.
2. Open the web inspector console and read the dev-only frame probe:
   `[focus-anim] open clipReveal: N frames in Xms, dropped(>20ms)=D, longest=Lms`
   (one line per open and per close). Compare `dropped` / `longest` across
   variants on the same note.
3. Switch variants at runtime (dev builds only), no rebuild:

   ```js
   localStorage.setItem('gb:focus-transition', 'clipReveal'); location.reload();
   localStorage.setItem('gb:focus-transition', 'scaleMorph'); location.reload();
   localStorage.removeItem('gb:focus-transition'); location.reload(); // default
   ```

   Unknown ids fall back to the default.

## B. Clip reveal (`clipReveal`, default on `anim/b-clip`)

**What it does.** Nothing scales. Shell and content are laid out at full
size from frame 0 and revealed through a `clip-path: inset(t r b l round 12px)`
window that grows from the card's screen rect to
`inset(0px 0px 0px 0px round 0px)` (280ms tween, ease-out-quint). The shell
starts in the card color; for notes the editor surface *is* the card color, so
it stays constant, and for panel surfaces (checklist, link…) it blends to
`--focus-shell-surface` (white / zinc-950). The content layer gets the same
window and additionally fades 30% → 100% (200ms) and settles 8px → 0. Close
(220ms) re-reads the card's live DOM rect when the exit starts (the canvas is
un-hidden synchronously before that, and an off-screen card has already been
re-centered), clips back to it, and fades the content out so the card-colored
shell lands on the real card. Reduced motion, or a card that is not on screen,
gets a plain fade.

**Why.** Scaling the full-size note means either a blurry upscaled raster or
re-rasterising text every frame, and the text visibly "zooms". A clip reveal
keeps text crisp and at its final position (only an 8px drift), so the
preview → editor crossfade after the open has nothing to correct, and it reads
as the card opening like a window onto the note.

**Implementation notes.**

- Insets are px-only (`round 0px` too) so start / end interpolate
  component-wise; insets are clamped to the viewport.
- The content layer is translated by `translateY`, which also moves its
  clip-path; its window is offset by the same amount (`top − y`,
  `bottom + y`). Both use the same duration and ease, so the two windows stay
  pixel-aligned for the whole animation.
- `transform` is animated as a string (not motion's `y`) so motion can run
  clipPath, opacity and transform through WAAPI rather than per-frame JS.
  Background color still runs on motion's JS loop (only for colored panel
  surfaces; notes keep a constant color).
- After the open lands, `transitionEnd` sets `clip-path: none` /
  `transform: none` (a full clip still clips fixed-position descendants and
  keeps a clip layer). The close therefore uses explicit two-keyframe arrays.
- The close target is computed in a function variant
  (`clipRevealExit`), resolved by motion when the exit starts, via the new
  optional `FocusTransitionContext.readSourceRect()`.

**Tradeoff / risk: WebKit compositing.** WKWebView does not composite
`clip-path` animations: even through WAAPI, each frame is a main-thread style
recalc + repaint of the clipped area (motion lists clipPath as
WAAPI-acceleratable, but WebKit is not known to composite it; verify with the
probe). Cost scales with what is under the clip, which is why
the content during the open is the static `FocusedNotePreview` (sanitised
HTML, no ProseMirror; the editor mounts after the open lands) and the canvas
is hidden only after the open. Two layers are clipped (shell + content), so
paint area is roughly 2× the window. If the `[focus-anim]` probe shows dropped
frames on large / image-heavy notes, the fallbacks are: (a) clip only the
shell and fade the content without a clip, (b) shorten the open, or (c) use
`scaleMorph`. Other known gaps: the card radius is a fixed 12px (cards are
24px in flow space, so it matches ~50% zoom; the context carries no zoom), and
folder children close to their stored rect when their DOM element is not
rendered.
