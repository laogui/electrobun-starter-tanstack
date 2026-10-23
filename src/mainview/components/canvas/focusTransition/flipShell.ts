import type { TargetAndTransition } from 'motion/react';

import {
  EASE_OUT,
  EASE_OUT_QUINT,
  FOCUS_CLOSE_MS,
  FOCUS_OPEN_MS,
} from '@/lib/motion';

import type {
  FocusLayerProps,
  FocusTransition,
  FocusTransitionContext,
  FocusViewportSize,
} from './types';

/**
 * Variant C — "FLIP shell + content fade".
 *
 * The shell is an empty colored layer, so it can be FLIPped with a
 * non-uniform translate + scaleX / scaleY from the card rect to the viewport
 * without distorting anything: there is no text in it. The content layer
 * (static preview + chrome) never scales; it fades / settles in once the
 * shell is mostly open. Everything animated is transform / opacity, except
 * the shell's corner radius (see `flipRadiusKeyframes`).
 */

const OPEN_S = FOCUS_OPEN_MS / 1000;
/** Close shell flight; the content fade-out runs first. */
const CLOSE_SHELL_S = FOCUS_CLOSE_MS / 1000;
/** Content starts appearing at this fraction of the shell open. */
const CONTENT_DELAY_FRACTION = 0.45;
const CONTENT_IN_S = 0.18;
const CONTENT_OFFSET_Y = 12;
const CONTENT_START_SCALE = 0.985;
const CONTENT_OUT_S = 0.1;
/** Shell close waits for most of the content fade before flying back. */
const CLOSE_SHELL_DELAY_S = 0.08;
/**
 * The shell fades in over the first part of the open (and out over the last
 * part of the close) so the card's own text crossfades instead of popping.
 */
const SHELL_FADE_IN_S = 0.07;
const SHELL_FADE_OUT_FROM = 0.72;
/** Screen-space corner radius of a card (rounded-3xl ≈ 24px at ~0.8 zoom). */
const CARD_RADIUS_PX = 20;
const RADIUS_SAMPLES = 8;
const REDUCED_OPEN_S = 0.1;
const REDUCED_CLOSE_S = 0.08;
/** Note editor default surface when the card has no hex color. */
const NOTE_DEFAULT_SURFACE = '#FFFFFF';

export interface FlipTransform {
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}

interface RectLike {
  height: number;
  left: number;
  top: number;
  width: number;
}

/**
 * FLIP "invert" step: the transform (origin 0 0) that maps a full-viewport
 * layer exactly onto `rect`.
 */
export function flipFromRect(
  rect: RectLike,
  viewport: FocusViewportSize
): FlipTransform {
  const safe = (value: number) => (value > 0 ? value : 1);
  return {
    scaleX: safe(rect.width) / safe(viewport.width),
    scaleY: safe(rect.height) / safe(viewport.height),
    x: rect.left,
    y: rect.top,
  };
}

type Bezier = readonly [number, number, number, number];

function bezierAxis(s: number, p1: number, p2: number): number {
  const inv = 1 - s;
  return 3 * inv * inv * s * p1 + 3 * inv * s * s * p2 + s * s * s;
}

/** Time fraction at which a cubic-bezier ease reaches `progress`. */
export function invertEase(ease: Bezier, progress: number): number {
  const [x1, y1, x2, y2] = ease;
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < 32; step += 1) {
    const mid = (lo + hi) / 2;
    if (bezierAxis(mid, y1, y2) < progress) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return bezierAxis((lo + hi) / 2, x1, x2);
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Corner radius keyframes for a layer scaled from `from` to `to`, counter-
 * scaled per axis (elliptical `rx / ry` in layer space) so the corners stay
 * circular on screen while the screen radius eases from `fromRadius` to
 * `toRadius`. Keyframe `times` are placed where the transform ease reaches
 * each sampled progress, so a linear tween between them tracks the eased
 * transform closely. Only the radius repaints; the layer is a flat color.
 */
export function flipRadiusKeyframes(
  from: FlipTransform,
  to: FlipTransform,
  fromRadius: number,
  toRadius: number,
  ease: Bezier
): { times: number[]; values: string[] } {
  const times: number[] = [];
  const values: string[] = [];
  for (let index = 0; index <= RADIUS_SAMPLES; index += 1) {
    const progress = index / RADIUS_SAMPLES;
    const scaleX = from.scaleX + (to.scaleX - from.scaleX) * progress;
    const scaleY = from.scaleY + (to.scaleY - from.scaleY) * progress;
    const radius = fromRadius + (toRadius - fromRadius) * progress;
    times.push(
      index === 0
        ? 0
        : index === RADIUS_SAMPLES
          ? 1
          : invertEase(ease, progress)
    );
    values.push(`${round(radius / scaleX)}px / ${round(radius / scaleY)}px`);
  }
  return { times, values };
}

const IDENTITY: FlipTransform = { scaleX: 1, scaleY: 1, x: 0, y: 0 };
const OPEN_RADIUS = '0px / 0px';

/**
 * One `transform` string rather than motion's independent x / scaleX…
 * values: motion hands a whole-`transform` (and `opacity`) animation to WAAPI,
 * which WebKit runs on the compositor, so main-thread work during the open
 * (React commits, the editor chunk) cannot stall the flight.
 */
export function toTransform({ scaleX, scaleY, x, y }: FlipTransform): string {
  return `translate(${round(x)}px, ${round(y)}px) scale(${scaleX}, ${scaleY})`;
}

const IDENTITY_TRANSFORM = toTransform(IDENTITY);

/** The shell already sits at the identity transform (open has landed). */
export function isOpen(current: Record<string, unknown> | undefined): boolean {
  return current?.transform === IDENTITY_TRANSFORM;
}

function cardRadius(rect: RectLike): number {
  return Math.min(CARD_RADIUS_PX, rect.width / 2, rect.height / 2);
}

function shellBackground(context: FocusTransitionContext): string | undefined {
  if (context.cardColor?.startsWith('#')) {
    return context.cardColor;
  }
  // The focused note paints its own surface (white by default); other
  // surfaces keep the shell's class background.
  return context.surface === 'note' ? NOTE_DEFAULT_SURFACE : undefined;
}

function liveViewport(fallback: FocusViewportSize): FocusViewportSize {
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;
  return typeof width === 'number' && width > 0 && height > 0
    ? { height, width }
    : fallback;
}

/** Close target, resolved when the exit starts (the card may have moved). */
export function resolveCloseTarget(
  context: FocusTransitionContext
): TargetAndTransition {
  const rect = context.measureSourceRect?.() ?? context.sourceRect;
  const flip = flipFromRect(rect, liveViewport(context.viewport));
  const radius = flipRadiusKeyframes(
    IDENTITY,
    flip,
    0,
    cardRadius(rect),
    EASE_OUT_QUINT
  );
  const flight = {
    delay: CLOSE_SHELL_DELAY_S,
    duration: CLOSE_SHELL_S,
    ease: EASE_OUT_QUINT,
  };
  return {
    borderRadius: radius.values,
    opacity: [1, 1, 0],
    transition: {
      borderRadius: { ...flight, ease: 'linear', times: radius.times },
      default: flight,
      opacity: {
        ...flight,
        ease: 'linear',
        times: [0, SHELL_FADE_OUT_FROM, 1],
      },
    },
    transform: toTransform(flip),
  };
}

function reducedLayer(): FocusLayerProps {
  return {
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: REDUCED_CLOSE_S } },
    initial: { opacity: 0 },
    transition: { duration: REDUCED_OPEN_S, ease: EASE_OUT_QUINT },
  };
}

function shellLayer(context: FocusTransitionContext): FocusLayerProps {
  const backgroundColor = shellBackground(context);
  const from = flipFromRect(context.sourceRect, context.viewport);
  const radius = flipRadiusKeyframes(
    from,
    IDENTITY,
    cardRadius(context.sourceRect),
    0,
    EASE_OUT_QUINT
  );
  return {
    animate: 'flipOpen',
    exit: 'flipClose',
    initial: {
      borderRadius: radius.values[0],
      opacity: 0,
      transform: toTransform(from),
    },
    style: {
      ...(backgroundColor ? { backgroundColor } : {}),
      transformOrigin: '0 0',
    },
    transition: {
      borderRadius: { duration: OPEN_S, ease: 'linear', times: radius.times },
      default: { duration: OPEN_S, ease: EASE_OUT_QUINT },
      opacity: { duration: SHELL_FADE_IN_S, ease: 'linear' },
    },
    // Resolved by motion when the exit starts, so the shell lands on the
    // card's *current* rect rather than the one captured at open.
    variants: {
      flipClose: () => resolveCloseTarget(context),
      // Motion re-resolves this on every render. Once the shell is open,
      // return a static radius: sibling navigation changes `sourceRect`, and
      // new keyframes would otherwise replay the corner animation on an
      // already full-screen shell.
      flipOpen: (
        _custom: unknown,
        current: Record<string, unknown>
      ): TargetAndTransition => ({
        borderRadius: isOpen(current) ? OPEN_RADIUS : radius.values,
        opacity: 1,
        transform: IDENTITY_TRANSFORM,
      }),
    },
  };
}

function contentLayer(): FocusLayerProps {
  return {
    animate: {
      opacity: 1,
      transform: 'translateY(0px) scale(1)',
      // A lingering transform would make this layer the containing block
      // for the editor's position: fixed menus.
      transitionEnd: { transform: 'none' },
    },
    exit: {
      opacity: 0,
      transition: { duration: CONTENT_OUT_S, ease: EASE_OUT },
    },
    initial: {
      opacity: 0,
      transform: `translateY(${CONTENT_OFFSET_Y}px) scale(${CONTENT_START_SCALE})`,
    },
    transition: {
      delay: OPEN_S * CONTENT_DELAY_FRACTION,
      duration: CONTENT_IN_S,
      ease: EASE_OUT_QUINT,
    },
  };
}

export const flipShell: FocusTransition = {
  id: 'flipShell',
  label: 'FLIP shell + content fade',
  plan(context) {
    if (context.reducedMotion) {
      const props = reducedLayer();
      return { content: props, shell: props };
    }
    return {
      // The content lands last (≈306ms); the editor mounts only after it is
      // fully opaque so its mount cost never lands mid-fade.
      completeOn: 'content',
      content: contentLayer(),
      shell: shellLayer(context),
    };
  },
};
