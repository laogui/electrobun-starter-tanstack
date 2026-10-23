import { describe, expect, it } from 'vitest';

import {
  CLIP_CARD_RADIUS_PX,
  clipInset,
  clipReveal,
  FULL_CLIP,
  getClipInsets,
} from './clipReveal';
import { summarizeFrames } from './focusAnimProbe';
import {
  DEFAULT_FOCUS_TRANSITION,
  FOCUS_TRANSITIONS,
  selectFocusTransition,
} from './registry';
import { scaleMorph } from './scaleMorph';
import type { FocusTransition, FocusTransitionContext } from './types';

const context = (
  overrides: Partial<FocusTransitionContext> = {}
): FocusTransitionContext => ({
  cardColor: '#FFF4C2',
  reducedMotion: false,
  // Plain rect: the node test environment has no DOMRect.
  sourceRect: { height: 160, left: 100, top: 100, width: 320 } as DOMRect,
  surface: 'note',
  viewport: { height: 800, width: 1200 },
  ...overrides,
});

const stub: FocusTransition = {
  id: 'stub',
  label: 'Stub',
  plan: () => ({ content: {}, shell: {} }),
};

describe('focus transition selection', () => {
  it('defaults to clipReveal and keeps scaleMorph registered', () => {
    expect(DEFAULT_FOCUS_TRANSITION).toBe(clipReveal);
    expect(FOCUS_TRANSITIONS[clipReveal.id]).toBe(clipReveal);
    expect(FOCUS_TRANSITIONS[scaleMorph.id]).toBe(scaleMorph);
  });

  it('resolves known ids and falls back for unknown / empty ones', () => {
    const registry = { [stub.id]: stub, [scaleMorph.id]: scaleMorph };
    expect(selectFocusTransition('stub', registry)).toBe(stub);
    expect(selectFocusTransition('nope', registry)).toBe(clipReveal);
    expect(selectFocusTransition('nope', registry, scaleMorph)).toBe(
      scaleMorph
    );
    expect(selectFocusTransition(null, registry, scaleMorph)).toBe(scaleMorph);
    expect(selectFocusTransition('', registry, scaleMorph)).toBe(scaleMorph);
    // Prototype keys must not resolve to a non-transition.
    expect(selectFocusTransition('toString', registry, scaleMorph)).toBe(
      scaleMorph
    );
  });
});

describe('scaleMorph', () => {
  it('scales both layers from the card center with a clamped start scale', () => {
    const plan = scaleMorph.plan(context());
    expect(plan.shell.initial).toEqual({ opacity: 0, scale: 0.86 });
    expect(plan.content.initial).toEqual({ opacity: 0, scale: 0.86 });
    expect(plan.shell.style).toEqual({
      transformOrigin: `${(260 / 1200) * 100}% 22.5%`,
    });
    expect(plan.shell.animate).toEqual({ opacity: 1, scale: 1 });
  });

  it('uses a plain fade under reduced motion', () => {
    const plan = scaleMorph.plan(context({ reducedMotion: true }));
    expect(plan.shell.initial).toEqual({ opacity: 0 });
    expect(plan.shell.style).toBeUndefined();
  });
});

type VariantMap = Record<string, unknown>;
const variantsOf = (props: { variants?: unknown }) =>
  props.variants as VariantMap;
const resolveExit = (props: { variants?: unknown }) =>
  (variantsOf(props).clipRevealExit as () => Record<string, unknown>)();

describe('clipReveal', () => {
  const viewport = { height: 800, width: 1200 };

  it('computes viewport insets and clamps off-screen edges', () => {
    expect(
      getClipInsets({ height: 160, left: 100, top: 100, width: 320 }, viewport)
    ).toEqual({ bottom: 540, left: 100, right: 780, top: 100 });
    expect(
      getClipInsets({ height: 100, left: -50, top: 750, width: 200 }, viewport)
    ).toEqual({ bottom: 0, left: 0, right: 1050, top: 750 });
    expect(
      getClipInsets({ height: 100, left: 1300, top: 0, width: 200 }, viewport)
    ).toBeNull();
  });

  it('formats px-only inset() so keyframes interpolate', () => {
    const insets = { bottom: 540, left: 100, right: 780, top: 100 };
    expect(clipInset(insets, 12)).toBe(
      'inset(100px 780px 540px 100px round 12px)'
    );
    // Content is translated down by 8px, so its window shifts up by 8px.
    expect(clipInset(insets, 12, 8)).toBe(
      'inset(92px 780px 548px 100px round 12px)'
    );
    expect(FULL_CLIP).toBe('inset(0px 0px 0px 0px round 0px)');
  });

  it('opens the shell from the card rect in the card color, no scale', () => {
    const plan = clipReveal.plan(context());
    const variants = variantsOf(plan.shell);
    expect(plan.shell.initial).toBe('clipRevealFrom');
    expect(plan.shell.animate).toBe('clipRevealTo');
    expect(plan.shell.exit).toBe('clipRevealExit');
    expect(variants.clipRevealFrom).toEqual({
      backgroundColor: '#FFF4C2',
      clipPath: `inset(100px 780px 540px 100px round ${CLIP_CARD_RADIUS_PX}px)`,
    });
    expect(variants.clipRevealTo).toMatchObject({
      backgroundColor: '#FFF4C2',
      clipPath: FULL_CLIP,
      transitionEnd: { clipPath: 'none' },
    });
    expect(JSON.stringify(plan)).not.toContain('scale');
  });

  it('clips content with the shell window and fades it up from 30%', () => {
    const plan = clipReveal.plan(context());
    const from = variantsOf(plan.content).clipRevealFrom;
    expect(from).toEqual({
      clipPath: 'inset(92px 780px 548px 100px round 12px)',
      opacity: 0.3,
      transform: 'translateY(8px)',
    });
  });

  it('blends panel surfaces from the card color into the shell surface', () => {
    const variants = variantsOf(
      clipReveal.plan(context({ surface: 'panel' })).shell
    );
    expect(variants.clipRevealTo).toMatchObject({
      backgroundColor: 'var(--focus-shell-surface)',
    });
    const lightbox = variantsOf(
      clipReveal.plan(context({ cardColor: undefined, surface: 'lightbox' }))
        .shell
    );
    expect(lightbox.clipRevealFrom).not.toHaveProperty('backgroundColor');
  });

  it('closes to the card rect re-read at close time', () => {
    let live: DOMRect | null = {
      height: 100,
      left: 600,
      top: 400,
      width: 200,
    } as DOMRect;
    const plan = clipReveal.plan(context({ readSourceRect: () => live }));
    expect(resolveExit(plan.shell).clipPath).toEqual([
      FULL_CLIP,
      'inset(400px 400px 300px 600px round 12px)',
    ]);
    expect(resolveExit(plan.content)).toMatchObject({
      clipPath: [FULL_CLIP, 'inset(392px 400px 308px 600px round 12px)'],
      opacity: 0,
      transform: ['translateY(0px)', 'translateY(8px)'],
    });
    // Card gone from the DOM: fall back to the open rect.
    live = null;
    expect(resolveExit(plan.shell).clipPath).toEqual([
      FULL_CLIP,
      'inset(100px 780px 540px 100px round 12px)',
    ]);
  });

  it('uses a plain fade under reduced motion or with an off-screen card', () => {
    for (const plan of [
      clipReveal.plan(context({ reducedMotion: true })),
      clipReveal.plan(
        context({
          sourceRect: {
            height: 10,
            left: -500,
            top: 0,
            width: 10,
          } as DOMRect,
        })
      ),
    ]) {
      expect(plan.shell.initial).toEqual({ opacity: 0 });
      expect(plan.content.animate).toEqual({ opacity: 1 });
      expect(plan.shell.variants).toBeUndefined();
    }
  });
});

describe('focus animation probe', () => {
  it('counts frames, dropped frames and the longest gap', () => {
    expect(summarizeFrames([0, 16, 32, 60, 76, 120])).toEqual({
      droppedFrames: 2,
      durationMs: 120,
      frames: 5,
      longestFrameMs: 44,
    });
    expect(summarizeFrames([])).toEqual({
      droppedFrames: 0,
      durationMs: 0,
      frames: 0,
      longestFrameMs: 0,
    });
  });
});
