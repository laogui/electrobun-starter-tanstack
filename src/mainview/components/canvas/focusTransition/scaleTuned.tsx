import type { TargetAndTransition } from 'motion/react';
import * as motion from 'motion/react-m';

import { EASE_OUT_QUINT, FOCUS_CLOSE_MS, FOCUS_OPEN_MS } from '@/lib/motion';

import type {
  FocusLayerProps,
  FocusTransition,
  FocusTransitionContext,
  FocusTransitionPlan,
  FocusViewportSize,
} from './types';

/**
 * Variant A, "scale-tuned": keep the uniform-scale idea but make the first
 * frame actually look like the card.
 *
 * - Shell = a solid colour plate. Because it has no content it can scale
 *   non-uniformly, so it starts at exactly the card's rect (translate +
 *   scaleX/scaleY from a 0 0 origin) with the card's colour, and grows to the
 *   viewport. Its border-radius is counter-scaled per axis so the *visible*
 *   corner goes from the card's radius to 0 without stretching.
 * - Content = the note itself, scaled uniformly (never distorted) with a
 *   "contain" fit inside the plate, slightly smaller so it trails the plate,
 *   and only fading in from ~40% through, once the plate is big enough for the
 *   text to read as text rather than a thumbnail.
 * - Non-note surfaces with a card colour get an overlay plate in the card
 *   colour that cross-fades to the surface colour (opacity only, no
 *   background-color animation).
 * - Transforms are full `transform` strings (not motion's independent x /
 *   scale values) so motion can hand them to WAAPI and run them on the
 *   compositor; opacity likewise. Only the plate's radius ticks on the main
 *   thread, and that is a solid-colour repaint.
 * - Close re-reads the card's live rect when the exit starts (variant
 *   resolver) and mirrors the open back onto it.
 */

const OPEN_S = FOCUS_OPEN_MS / 1000;
const CLOSE_S = FOCUS_CLOSE_MS / 1000;
/** Content fit relative to the plate: <1 makes it trail the plate edges. */
const CONTENT_LAG = 0.94;
/** Fraction of the open after which the content starts fading in. */
const CONTENT_FADE_START = 0.4;
const CONTENT_FADE_SPAN = 0.45;
/** Fraction of the open over which the plate fades in over the card. */
const SHELL_FADE_IN = 0.25;
/** Fraction of the close the content takes to fade out. */
const CONTENT_FADE_OUT = 0.45;
/** Fallback on-screen card radius when the host cannot measure it. */
const DEFAULT_CARD_RADIUS = 12;
/** Radius keyframe samples (linear between them, eased via sampling). */
const RADIUS_SAMPLES = 10;
const MIN_SCALE = 0.01;
const REDUCED_OPEN_S = 0.1;
const REDUCED_CLOSE_S = 0.08;

const EASE = [...EASE_OUT_QUINT] as [number, number, number, number];

export interface RectLike {
  height: number;
  left: number;
  top: number;
  width: number;
}

/** Cubic-bezier easing y(x), same curve CSS / motion use for `EASE`. */
export function cubicBezierAt(
  [x1, y1, x2, y2]: readonly [number, number, number, number],
  x: number
): number {
  if (x <= 0) {
    return 0;
  }
  if (x >= 1) {
    return 1;
  }
  const sample = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  // Bisection on t for x(t) = x: monotone in [0, 1] for valid curves.
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let index = 0; index < 30; index += 1) {
    const value = sample(x1, x2, t);
    if (Math.abs(value - x) < 1e-6) {
      break;
    }
    if (value < x) {
      lo = t;
    } else {
      hi = t;
    }
    t = (lo + hi) / 2;
  }
  return sample(y1, y2, t);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface CardMetrics {
  /** Content layer start transform (uniform scale, origin 0 0). */
  contentTransform: string;
  /** Plate start scale per axis. */
  scaleX: number;
  scaleY: number;
  /** Plate start transform (non-uniform scale, origin 0 0). */
  shellTransform: string;
}

/** Start-state transforms that put both layers on the card's rect. */
export function getCardMetrics(
  rect: RectLike,
  viewport: FocusViewportSize
): CardMetrics {
  const scaleX = Math.max(MIN_SCALE, rect.width / viewport.width);
  const scaleY = Math.max(MIN_SCALE, rect.height / viewport.height);
  const contentScale = Math.min(scaleX, scaleY) * CONTENT_LAG;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const contentX = centerX - (contentScale * viewport.width) / 2;
  const contentY = centerY - (contentScale * viewport.height) / 2;
  return {
    contentTransform: `translate(${round(contentX)}px, ${round(contentY)}px) scale(${round(contentScale)}, ${round(contentScale)})`,
    scaleX,
    scaleY,
    shellTransform: `translate(${round(rect.left)}px, ${round(rect.top)}px) scale(${round(scaleX)}, ${round(scaleY)})`,
  };
}

const IDENTITY = 'translate(0px, 0px) scale(1, 1)';

/**
 * Counter-scaled radius keyframes for the plate. Sampled in time and eased
 * with the same curve as the transform, so at every sample the visible corner
 * is `radius * (1 - progress)` despite the per-axis scale. `fromCard` true =
 * open (card → full), false = close (full → card).
 */
export function radiusKeyframes(
  radius: number,
  scaleX: number,
  scaleY: number,
  fromCard: boolean
): string[] {
  const frames: string[] = [];
  for (let index = 0; index <= RADIUS_SAMPLES; index += 1) {
    const eased = cubicBezierAt(EASE, index / RADIUS_SAMPLES);
    const progress = fromCard ? eased : 1 - eased;
    const sx = scaleX + (1 - scaleX) * progress;
    const sy = scaleY + (1 - scaleY) * progress;
    const visible = radius * (1 - progress);
    frames.push(`${round(visible / sx)}px / ${round(visible / sy)}px`);
  }
  return frames;
}

function isHexColor(color: string | undefined): color is string {
  return typeof color === 'string' && color.startsWith('#');
}

function liveViewport(fallback: FocusViewportSize): FocusViewportSize {
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;
  return typeof width === 'number' && width > 0 && height > 0
    ? { height, width }
    : fallback;
}

function isUsableRect(rect: RectLike | null | undefined): rect is RectLike {
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

/** Where the close lands: the card's live rect, else the open-time rect. */
function closeMetrics(context: FocusTransitionContext): CardMetrics {
  const live = context.readSourceRect?.();
  const rect = isUsableRect(live) ? live : context.sourceRect;
  return getCardMetrics(rect, liveViewport(context.viewport));
}

function reducedPlan(context: FocusTransitionContext): FocusTransitionPlan {
  const props: FocusLayerProps = {
    animate: { opacity: 1 },
    exit: {
      opacity: 0,
      transition: { duration: REDUCED_CLOSE_S, ease: EASE },
    },
    initial: { opacity: 0 },
    transition: { duration: REDUCED_OPEN_S },
  };
  const background =
    context.surface === 'note' && isHexColor(context.cardColor)
      ? context.cardColor
      : undefined;
  return {
    content: props,
    shell: background
      ? { ...props, style: { backgroundColor: background } }
      : props,
  };
}

export function planScaleTuned(
  context: FocusTransitionContext
): FocusTransitionPlan {
  if (context.reducedMotion || !isUsableRect(context.sourceRect)) {
    return reducedPlan(context);
  }
  const open = getCardMetrics(context.sourceRect, context.viewport);
  const radius = context.sourceRadius ?? DEFAULT_CARD_RADIUS;
  const isNote = context.surface === 'note';
  const cardColor = isHexColor(context.cardColor)
    ? context.cardColor
    : undefined;
  // A note's focused surface is tinted with the card colour, so the plate
  // keeps that colour throughout; other surfaces cross-fade via an overlay.
  const plateColor = isNote ? cardColor : undefined;
  const crossfadeColor = isNote ? undefined : cardColor;

  const openTween = { duration: OPEN_S, ease: EASE };
  const closeTween = { duration: CLOSE_S, ease: EASE };
  const openRadius = {
    duration: OPEN_S,
    ease: 'linear' as const,
  };
  const closeRadius = { duration: CLOSE_S, ease: 'linear' as const };

  const plateStyle = {
    transformOrigin: '0 0',
    ...(plateColor ? { backgroundColor: plateColor } : {}),
  };

  const shellClose = (): TargetAndTransition => {
    const target = closeMetrics(context);
    return {
      borderRadius: radiusKeyframes(
        radius,
        target.scaleX,
        target.scaleY,
        false
      ),
      opacity: [1, 1, 0],
      transform: target.shellTransform,
      transition: {
        borderRadius: closeRadius,
        default: closeTween,
        opacity: { duration: CLOSE_S, ease: 'linear', times: [0, 0.6, 1] },
      },
    };
  };

  const shell: FocusLayerProps = {
    animate: {
      borderRadius: radiusKeyframes(radius, open.scaleX, open.scaleY, true),
      opacity: 1,
      transform: IDENTITY,
    },
    exit: 'close',
    initial: {
      borderRadius: radiusKeyframes(radius, open.scaleX, open.scaleY, true)[0],
      opacity: 0,
      transform: open.shellTransform,
    },
    style: plateStyle,
    transition: {
      borderRadius: openRadius,
      default: openTween,
      opacity: { duration: OPEN_S * SHELL_FADE_IN, ease: 'linear' },
    },
    variants: { close: shellClose },
  };

  const contentClose = (): TargetAndTransition => ({
    opacity: 0,
    transform: closeMetrics(context).contentTransform,
    transition: {
      default: closeTween,
      opacity: { duration: CLOSE_S * CONTENT_FADE_OUT, ease: EASE },
    },
  });

  const content: FocusLayerProps = {
    animate: { opacity: 1, transform: 'translate(0px, 0px) scale(1, 1)' },
    exit: 'close',
    initial: { opacity: 0, transform: open.contentTransform },
    style: { transformOrigin: '0 0' },
    transition: {
      default: openTween,
      opacity: {
        delay: OPEN_S * CONTENT_FADE_START,
        duration: OPEN_S * CONTENT_FADE_SPAN,
        ease: EASE,
      },
    },
    variants: { close: contentClose },
  };

  const overlay = crossfadeColor ? (
    <motion.div
      animate={{
        borderRadius: radiusKeyframes(radius, open.scaleX, open.scaleY, true),
        opacity: [0, 1, 1, 0],
        transform: IDENTITY,
      }}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      exit="close"
      initial={{
        borderRadius: radiusKeyframes(
          radius,
          open.scaleX,
          open.scaleY,
          true
        )[0],
        opacity: 0,
        transform: open.shellTransform,
      }}
      key="scale-tuned-crossfade"
      style={{ backgroundColor: crossfadeColor, transformOrigin: '0 0' }}
      transition={{
        borderRadius: openRadius,
        default: openTween,
        opacity: {
          duration: OPEN_S,
          ease: 'linear',
          times: [0, SHELL_FADE_IN, 0.45, 0.9],
        },
      }}
      variants={{
        close: (): TargetAndTransition => {
          const target = closeMetrics(context);
          return {
            borderRadius: radiusKeyframes(
              radius,
              target.scaleX,
              target.scaleY,
              false
            ),
            opacity: [0, 0, 1, 0],
            transform: target.shellTransform,
            transition: {
              borderRadius: closeRadius,
              default: closeTween,
              opacity: {
                duration: CLOSE_S,
                ease: 'linear',
                times: [0, 0.3, 0.65, 1],
              },
            },
          };
        },
      }}
    />
  ) : undefined;

  return { completeOn: 'shell', content, overlay, shell };
}

export const scaleTuned: FocusTransition = {
  id: 'scaleTuned',
  label: 'Scale tuned',
  plan: planScaleTuned,
};
