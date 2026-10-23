import type { TargetAndTransition, Variants } from 'motion/react';

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
 * Corner radius of the clip window at the card end. Matches the card at
 * roughly 50% zoom (cards are `rounded-3xl` = 24px in flow space); the
 * transition context carries no zoom, so this is a fixed compromise.
 */
export const CLIP_CARD_RADIUS_PX = 12;
/** Content starts slightly transparent and below its resting position. */
export const CLIP_CONTENT_START_OPACITY = 0.3;
export const CLIP_CONTENT_OFFSET_Y_PX = 8;
const CONTENT_OPACITY_OPEN_S = 0.2;
const CONTENT_OPACITY_CLOSE_S = 0.14;
const REDUCED_OPEN_S = 0.1;
const REDUCED_CLOSE_S = 0.08;
/**
 * Full-bleed surface behind non-note focus surfaces (mirrors the shell's
 * `bg-white dark:bg-zinc-950`). Hex so motion's JS color mixer can blend it
 * with the card color; defined in index.css.
 */
const SHELL_SURFACE_VAR = 'var(--focus-shell-surface)';
/** Focused notes paint the card color edge to edge (FocusedNotePreview). */
const DEFAULT_NOTE_SURFACE = '#FFFFFF';

/** Variant labels; namespaced so descendants never resolve them by accident. */
const FROM = 'clipRevealFrom';
const TO = 'clipRevealTo';
const EXIT = 'clipRevealExit';

export interface ClipInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export const FULL_CLIP = 'inset(0px 0px 0px 0px round 0px)';

/**
 * Insets (px from each viewport edge) of the card rect, clamped to the
 * viewport. Returns null when the card is not on screen (or degenerate):
 * the caller then falls back to a plain fade.
 */
export function getClipInsets(
  rect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>,
  viewport: FocusViewportSize
): ClipInsets | null {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewport.width, rect.left + rect.width);
  const bottom = Math.min(viewport.height, rect.top + rect.height);
  if (!(right - left >= 1 && bottom - top >= 1)) {
    return null;
  }
  return {
    bottom: viewport.height - bottom,
    left,
    right: viewport.width - right,
    top,
  };
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

/**
 * `inset()` with every component in px (including `round 0px` at full size),
 * so start and end keyframes interpolate component-wise. `offsetY` shifts the
 * window up by that many px: the content layer is translated down by the
 * same amount, so its clip stays pixel-aligned with the shell's.
 */
export function clipInset(
  insets: ClipInsets,
  radius: number,
  offsetY = 0
): string {
  return `inset(${px(insets.top - offsetY)} ${px(insets.right)} ${px(
    insets.bottom + offsetY
  )} ${px(insets.left)} round ${px(radius)})`;
}

function isHexColor(color: string | undefined): color is string {
  return typeof color === 'string' && color.startsWith('#');
}

/** Shell background keyframe targets: card color at the card, surface open. */
function shellColors(context: FocusTransitionContext): {
  from?: string;
  to?: string;
} {
  if (context.surface === 'note') {
    // The editor surface *is* the card color: constant, nothing to blend.
    const color = isHexColor(context.cardColor)
      ? context.cardColor
      : DEFAULT_NOTE_SURFACE;
    return { from: color, to: color };
  }
  if (context.surface === 'panel' && isHexColor(context.cardColor)) {
    return { from: context.cardColor, to: SHELL_SURFACE_VAR };
  }
  return {};
}

function fadeLayer(): FocusLayerProps {
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

/** Current card insets for the close: live DOM rect, else the open rect. */
function closeInsets(context: FocusTransitionContext): ClipInsets | null {
  const live = context.readSourceRect?.();
  return (
    (live ? getClipInsets(live, context.viewport) : null) ??
    getClipInsets(context.sourceRect, context.viewport)
  );
}

function shellLayer(
  context: FocusTransitionContext,
  insets: ClipInsets
): FocusLayerProps {
  const colors = shellColors(context);
  const withColor = (
    target: TargetAndTransition,
    color: string | undefined
  ): TargetAndTransition =>
    color ? { ...target, backgroundColor: color } : target;
  const variants: Variants = {
    [FROM]: withColor(
      { clipPath: clipInset(insets, CLIP_CARD_RADIUS_PX) },
      colors.from
    ),
    [TO]: withColor(
      {
        clipPath: FULL_CLIP,
        // A clip-path (even a full one) clips fixed descendants and keeps a
        // clip layer alive: drop it once the window is fully open.
        transitionEnd: { clipPath: 'none' },
      },
      colors.to
    ),
    // Resolved when the close starts, so it re-reads the card's rect then.
    [EXIT]: () => {
      const target = closeInsets(context);
      if (!target) {
        return {
          opacity: 0,
          transition: { duration: REDUCED_CLOSE_S, ease: EASE_OUT_QUINT },
        };
      }
      return withColor(
        {
          // Explicit keyframes: the live value is `none` after the open.
          clipPath: [FULL_CLIP, clipInset(target, CLIP_CARD_RADIUS_PX)],
          transition: FOCUS_CLOSE_TRANSITION,
        },
        colors.from
      );
    },
  };
  return {
    animate: TO,
    exit: EXIT,
    initial: FROM,
    transition: FOCUS_OPEN_TRANSITION,
    variants,
  };
}

const translateY = (y: number) => `translateY(${px(y)})`;

function contentLayer(
  context: FocusTransitionContext,
  insets: ClipInsets
): FocusLayerProps {
  const dy = CLIP_CONTENT_OFFSET_Y_PX;
  // `transform` as a string (not `y`) so motion can hand it to WAAPI along
  // with clipPath and opacity instead of driving it from rAF.
  const variants: Variants = {
    [FROM]: {
      clipPath: clipInset(insets, CLIP_CARD_RADIUS_PX, dy),
      opacity: CLIP_CONTENT_START_OPACITY,
      transform: translateY(dy),
    },
    [TO]: {
      clipPath: FULL_CLIP,
      opacity: 1,
      transform: translateY(0),
      transitionEnd: { clipPath: 'none', transform: 'none' },
    },
    [EXIT]: () => {
      const target = closeInsets(context);
      if (!target) {
        return {
          opacity: 0,
          transition: { duration: REDUCED_CLOSE_S, ease: EASE_OUT_QUINT },
        };
      }
      return {
        clipPath: [FULL_CLIP, clipInset(target, CLIP_CARD_RADIUS_PX, dy)],
        // Fade fully: the shell (card color) is what lands on the card.
        opacity: 0,
        transform: [translateY(0), translateY(dy)],
        transition: {
          default: FOCUS_CLOSE_TRANSITION,
          opacity: { duration: CONTENT_OPACITY_CLOSE_S, ease: EASE_OUT_QUINT },
        },
      };
    },
  };
  return {
    animate: TO,
    exit: EXIT,
    initial: FROM,
    transition: {
      default: FOCUS_OPEN_TRANSITION,
      opacity: { duration: CONTENT_OPACITY_OPEN_S, ease: EASE_OUT_QUINT },
    },
    variants,
  };
}

/**
 * Variant B: nothing scales. The full-size shell and content are revealed
 * through a `clip-path: inset(… round …)` window that grows from the card's
 * screen rect to the viewport, so the card "opens like a window". The content
 * is laid out at full size from frame 0 (no reflow, no blurry upscaled
 * text) and fades in from 30% while settling 8px upward.
 */
export const clipReveal: FocusTransition = {
  id: 'clipReveal',
  label: 'Clip reveal',
  plan(context) {
    const insets = context.reducedMotion
      ? null
      : getClipInsets(context.sourceRect, context.viewport);
    if (!insets) {
      const fade = fadeLayer();
      return { content: fade, shell: fade };
    }
    return {
      content: contentLayer(context, insets),
      shell: shellLayer(context, insets),
    };
  },
};
