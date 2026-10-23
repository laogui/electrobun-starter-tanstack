import { describe, expect, it } from 'vitest';

import { summarizeFrames } from './focusAnimProbe';
import {
  DEFAULT_FOCUS_TRANSITION,
  FOCUS_TRANSITIONS,
  selectFocusTransition,
} from './registry';
import { scaleMorph } from './scaleMorph';
import type { FocusTransition, FocusTransitionContext } from './types';
import { viewTransition } from './viewTransition';

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
  it('defaults to viewTransition and keeps scaleMorph registered', () => {
    expect(DEFAULT_FOCUS_TRANSITION).toBe(viewTransition);
    expect(FOCUS_TRANSITIONS[viewTransition.id]).toBe(viewTransition);
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
    expect(selectFocusTransition('', registry)).toBe(DEFAULT_FOCUS_TRANSITION);
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
