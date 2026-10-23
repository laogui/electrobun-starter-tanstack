import {
  EASE_OUT_QUINT,
  FOCUS_CLOSE_TRANSITION,
  FOCUS_OPEN_TRANSITION,
} from '@/lib/motion';

import type {
  FocusLayerProps,
  FocusTransition,
  FocusTransitionContext,
  FocusViewportSize,
} from './types';

/**
 * Floor for the expand morph's starting scale. A tiny floor makes the panel
 * grow from a blurry, reflowed thumbnail; a gentle floor keeps the content
 * crisp so the open reads as a smooth settle rather than a zoom pop.
 */
const OPEN_MIN_SCALE = 0.86;
const OPEN_MAX_SCALE = 0.92;
const OPEN_OPACITY_S = 0.18;
const REDUCED_OPEN_S = 0.1;
const REDUCED_CLOSE_S = 0.08;

/**
 * FLIP-style expand metrics: the full-bleed shell scales up from the card's
 * center so the open path reads as "this card grew into focus mode".
 */
export function getExpandFromRect(
  rect: DOMRect,
  viewport: FocusViewportSize
): { scale: number; transformOrigin: string } {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const transformOrigin = `${(centerX / viewport.width) * 100}% ${
    (centerY / viewport.height) * 100
  }%`;
  const scale = Math.max(
    OPEN_MIN_SCALE,
    Math.min(
      rect.width / viewport.width,
      rect.height / viewport.height,
      OPEN_MAX_SCALE
    )
  );
  return { scale, transformOrigin };
}

function layer(context: FocusTransitionContext): FocusLayerProps {
  if (context.reducedMotion) {
    return {
      animate: { opacity: 1 },
      exit: {
        opacity: 0,
        transition: { duration: REDUCED_CLOSE_S, ease: EASE_OUT_QUINT },
      },
      initial: { opacity: 0 },
      transition: { duration: REDUCED_OPEN_S },
    };
  }
  const { scale, transformOrigin } = getExpandFromRect(
    context.sourceRect,
    context.viewport
  );
  return {
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale, transition: FOCUS_CLOSE_TRANSITION },
    initial: { opacity: 0, scale },
    style: { transformOrigin },
    transition: {
      default: FOCUS_OPEN_TRANSITION,
      opacity: { duration: OPEN_OPACITY_S, ease: EASE_OUT_QUINT },
    },
  };
}

/**
 * Default transition: shell and content scale together from the card center
 * (the pre-refactor behaviour, now a tween instead of a spring).
 */
export const scaleMorph: FocusTransition = {
  id: 'scaleMorph',
  label: 'Scale morph',
  plan(context) {
    const props = layer(context);
    return { content: props, shell: props };
  },
};
