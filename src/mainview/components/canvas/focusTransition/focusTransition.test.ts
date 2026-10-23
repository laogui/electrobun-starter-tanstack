import { describe, expect, it } from 'vitest';

import { summarizeFrames } from './focusAnimProbe';
import {
  DEFAULT_FOCUS_TRANSITION,
  FOCUS_TRANSITIONS,
  selectFocusTransition,
} from './registry';
import { scaleMorph } from './scaleMorph';
import {
  cubicBezierAt,
  getCardMetrics,
  radiusKeyframes,
  scaleTuned,
} from './scaleTuned';
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

const CLOSE_TRANSLATE = /^translate\(10px, 20px\)/;

const stub: FocusTransition = {
  id: 'stub',
  label: 'Stub',
  plan: () => ({ content: {}, shell: {} }),
};

describe('focus transition selection', () => {
  it('defaults to scaleTuned and keeps scaleMorph registered', () => {
    expect(DEFAULT_FOCUS_TRANSITION).toBe(scaleTuned);
    expect(FOCUS_TRANSITIONS[scaleTuned.id]).toBe(scaleTuned);
    expect(FOCUS_TRANSITIONS[scaleMorph.id]).toBe(scaleMorph);
  });

  it('resolves known ids and falls back for unknown / empty ones', () => {
    const registry = { [stub.id]: stub, [scaleMorph.id]: scaleMorph };
    const select = (id: string | null) =>
      selectFocusTransition(id, registry, scaleMorph);
    expect(select('stub')).toBe(stub);
    expect(select('nope')).toBe(scaleMorph);
    expect(select(null)).toBe(scaleMorph);
    expect(select('')).toBe(scaleMorph);
    // Prototype keys must not resolve to a non-transition.
    expect(select('toString')).toBe(scaleMorph);
    expect(selectFocusTransition('nope', registry)).toBe(scaleTuned);
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

describe('scaleTuned', () => {
  const viewport = { height: 800, width: 1200 };
  const rect = { height: 160, left: 100, top: 100, width: 320 };

  it('starts the plate exactly on the card rect', () => {
    const metrics = getCardMetrics(rect, viewport);
    expect(metrics.scaleX).toBeCloseTo(320 / 1200);
    expect(metrics.scaleY).toBeCloseTo(160 / 800);
    expect(metrics.shellTransform).toBe(
      'translate(100px, 100px) scale(0.267, 0.2)'
    );
  });

  it('fits the content uniformly inside the card, centered', () => {
    const metrics = getCardMetrics(rect, viewport);
    // contain fit (0.2) * lag (0.94) = 0.188, centered on (260, 180).
    expect(metrics.contentTransform).toBe(
      'translate(147.2px, 104.8px) scale(0.188, 0.188)'
    );
  });

  it('counter-scales the radius so the visible corner eases to 0', () => {
    const open = radiusKeyframes(24, 0.25, 0.2, true);
    expect(open[0]).toBe('96px / 120px');
    expect(open.at(-1)).toBe('0px / 0px');
    const close = radiusKeyframes(24, 0.25, 0.2, false);
    expect(close[0]).toBe('0px / 0px');
    expect(close.at(-1)).toBe('96px / 120px');
  });

  it('evaluates the easing curve', () => {
    const ease = [0.22, 1, 0.36, 1] as const;
    expect(cubicBezierAt(ease, 0)).toBe(0);
    expect(cubicBezierAt(ease, 1)).toBe(1);
    expect(cubicBezierAt([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 4);
    expect(cubicBezierAt(ease, 0.5)).toBeGreaterThan(0.85);
  });

  it('tints the plate with a note card colour and re-reads the rect on close', () => {
    let reads = 0;
    const plan = scaleTuned.plan(
      context({
        readSourceRect: () => {
          reads += 1;
          return { height: 100, left: 10, top: 20, width: 200 } as DOMRect;
        },
        sourceRadius: 24,
      })
    );
    expect(plan.shell.style).toEqual({
      backgroundColor: '#FFF4C2',
      transformOrigin: '0 0',
    });
    expect(plan.overlay).toBeUndefined();
    expect(plan.shell.exit).toBe('close');
    expect(reads).toBe(0);
    const close = plan.shell.variants?.close;
    expect(typeof close).toBe('function');
    if (typeof close === 'function') {
      const target = close(undefined, {}, {});
      expect(reads).toBe(1);
      expect(typeof target === 'object' && target.transform).toMatch(
        CLOSE_TRANSLATE
      );
    }
  });

  it('cross-fades a coloured non-note card via an overlay', () => {
    const plan = scaleTuned.plan(context({ surface: 'panel' }));
    expect(plan.overlay).toBeDefined();
    expect(plan.shell.style).toEqual({ transformOrigin: '0 0' });
  });

  it('uses a plain fade under reduced motion', () => {
    const plan = scaleTuned.plan(context({ reducedMotion: true }));
    expect(plan.content.initial).toEqual({ opacity: 0 });
    expect(plan.overlay).toBeUndefined();
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
