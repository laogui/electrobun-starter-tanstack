import { describe, expect, it } from 'vitest';
import {
  flipFromRect,
  flipRadiusKeyframes,
  flipShell,
  invertEase,
  isOpen,
  resolveCloseTarget,
  toTransform,
} from './flipShell';
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
  it('defaults to flipShell and keeps scaleMorph registered', () => {
    expect(DEFAULT_FOCUS_TRANSITION).toBe(flipShell);
    expect(FOCUS_TRANSITIONS[flipShell.id]).toBe(flipShell);
    expect(FOCUS_TRANSITIONS[scaleMorph.id]).toBe(scaleMorph);
  });

  it('resolves known ids and falls back for unknown / empty ones', () => {
    const registry = { [stub.id]: stub, [scaleMorph.id]: scaleMorph };
    expect(selectFocusTransition('stub', registry)).toBe(stub);
    expect(selectFocusTransition('scaleMorph', registry)).toBe(scaleMorph);
    expect(selectFocusTransition('nope', registry)).toBe(
      DEFAULT_FOCUS_TRANSITION
    );
    expect(selectFocusTransition(null, registry)).toBe(
      DEFAULT_FOCUS_TRANSITION
    );
    expect(selectFocusTransition('', registry, stub)).toBe(stub);
    // Prototype keys must not resolve to a non-transition.
    expect(selectFocusTransition('toString', registry)).toBe(
      DEFAULT_FOCUS_TRANSITION
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

describe('flipShell', () => {
  it('maps a full-viewport layer exactly onto the card rect', () => {
    const flip = flipFromRect(
      { height: 160, left: 100, top: 100, width: 320 },
      { height: 800, width: 1200 }
    );
    expect(flip).toEqual({ scaleX: 320 / 1200, scaleY: 0.2, x: 100, y: 100 });
    // Card corners land where the FLIP says (origin 0 0).
    expect(flip.x + 1200 * flip.scaleX).toBeCloseTo(420);
    expect(flip.y + 800 * flip.scaleY).toBeCloseTo(260);
  });

  it('counter-scales the corner radius so it stays circular on screen', () => {
    const from = { scaleX: 0.25, scaleY: 0.5, x: 0, y: 0 };
    const to = { scaleX: 1, scaleY: 1, x: 0, y: 0 };
    const { times, values } = flipRadiusKeyframes(
      from,
      to,
      20,
      0,
      [0.22, 1, 0.36, 1]
    );
    expect(values[0]).toBe('80px / 40px');
    expect(values.at(-1)).toBe('0px / 0px');
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(1);
    // Ease-out: half the progress is reached well before half the time.
    expect(invertEase([0.22, 1, 0.36, 1], 0.5)).toBeLessThan(0.3);
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]).toBeGreaterThan(times[index - 1] ?? 0);
    }
  });

  it('plans an empty colored shell and a non-scaling delayed content fade', () => {
    const plan = flipShell.plan(context());
    expect(plan.completeOn).toBe('content');
    expect(plan.shell.style).toEqual({
      backgroundColor: '#FFF4C2',
      transformOrigin: '0 0',
    });
    expect(plan.shell.initial).toMatchObject({
      opacity: 0,
      transform: toTransform({
        scaleX: 320 / 1200,
        scaleY: 0.2,
        x: 100,
        y: 100,
      }),
    });
    expect(plan.content.initial).toEqual({
      opacity: 0,
      transform: 'translateY(12px) scale(0.985)',
    });
    expect(plan.content.transition).toMatchObject({ delay: 0.28 * 0.45 });
  });

  it('stops replaying the corner keyframes once the shell is open', () => {
    const plan = flipShell.plan(context());
    const variants = plan.shell.variants as Record<
      string,
      (
        custom: unknown,
        current: Record<string, unknown>
      ) => {
        borderRadius: unknown;
      }
    >;
    const identity = toTransform({ scaleX: 1, scaleY: 1, x: 0, y: 0 });
    expect(isOpen({ transform: identity })).toBe(true);
    expect(
      variants.flipOpen?.(undefined, { transform: identity })
    ).toMatchObject({ borderRadius: '0px / 0px' });
    expect(Array.isArray(variants.flipOpen?.(undefined, {}).borderRadius)).toBe(
      true
    );
  });

  it('closes onto the re-measured card rect when available', () => {
    const moved = { height: 100, left: 50, top: 40, width: 200 } as DOMRect;
    const target = resolveCloseTarget(
      context({ measureSourceRect: () => moved })
    );
    const viewport = {
      height: globalThis.innerHeight ?? 800,
      width: globalThis.innerWidth ?? 1200,
    };
    expect(target.transform).toBe(toTransform(flipFromRect(moved, viewport)));
    expect(target.opacity).toEqual([1, 1, 0]);
  });

  it('defaults uncolored notes to the white editor surface', () => {
    const plan = flipShell.plan(context({ cardColor: undefined }));
    expect(plan.shell.style).toMatchObject({ backgroundColor: '#FFFFFF' });
    const panel = flipShell.plan(
      context({ cardColor: undefined, surface: 'panel' })
    );
    expect(panel.shell.style).toEqual({ transformOrigin: '0 0' });
  });

  it('uses a plain fade under reduced motion', () => {
    const plan = flipShell.plan(context({ reducedMotion: true }));
    expect(plan.shell.initial).toEqual({ opacity: 0 });
    expect(plan.content.initial).toEqual({ opacity: 0 });
    expect(plan.shell.style).toBeUndefined();
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
