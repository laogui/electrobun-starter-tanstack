import type { HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * What the focused surface renders, so a variant can treat a full-bleed note
 * differently from an image lightbox or a centered detail panel.
 */
export type FocusSurfaceKind = 'note' | 'lightbox' | 'panel';

export interface FocusViewportSize {
  height: number;
  width: number;
}

/** Everything a transition may read to plan an open / close. */
export interface FocusTransitionContext {
  /**
   * Card background color (a hex / css color from the note's `data.color`),
   * or undefined for non-note surfaces and uncolored cards.
   */
  cardColor: string | undefined;
  /**
   * Re-reads the source card's current screen rect from the DOM (null when
   * it is not rendered). Call it lazily (e.g. from a variant resolved at
   * close start), never during `plan`, so close can return to where the card
   * is now even after the canvas panned or zoomed behind the focused view.
   */
  readSourceRect?: () => DOMRect | null;
  /** Honour `prefers-reduced-motion`: keep it to a short fade. */
  reducedMotion: boolean;
  /**
   * Screen rect of the source card at open time (and of the currently
   * focused card after sibling navigation, so close returns to it).
   */
  sourceRect: DOMRect;
  surface: FocusSurfaceKind;
  viewport: FocusViewportSize;
}

/**
 * Motion props for one layer. Spread verbatim onto a `motion/react-m` div, so
 * anything framer-motion accepts works (`variants` too). `exit` should carry
 * its own `transition` when it differs from the open one.
 */
export type FocusLayerProps = Pick<
  HTMLMotionProps<'div'>,
  'animate' | 'exit' | 'initial' | 'style' | 'transition' | 'variants'
> & {
  /** Extra classes appended to the layer (the base is `absolute inset-0`). */
  className?: string;
};

export interface FocusTransitionPlan {
  /**
   * Which layer's `onAnimationComplete` marks the open as finished (the editor
   * mounts and the canvas is hidden at that moment). Defaults to `'shell'`.
   */
  completeOn?: 'content' | 'shell';
  /** Content layer: chrome + note preview / editor. Sits above the shell. */
  content: FocusLayerProps;
  /** Called at the start of the close, before the exit animation runs. */
  onCloseStart?: () => void;
  /** Called once when the open animation lands. */
  onOpenComplete?: () => void;
  /**
   * Optional extra element rendered between shell and content (a ghost card,
   * a clip mask…). It lives inside the AnimatePresence subtree, so a motion
   * element with `exit` here also delays unmount until it finishes.
   */
  overlay?: ReactNode;
  /** Shell layer: the full-bleed background behind the content. */
  shell: FocusLayerProps;
}

/**
 * A pluggable open / close animation for the focused view. Implementations
 * must be pure: `plan` is called during render whenever the context changes.
 */
export interface FocusTransition {
  /** Stable id, used by the dev override (`localStorage['gb:focus-transition']`). */
  readonly id: string;
  /** Human readable label for logs. */
  readonly label: string;
  plan(context: FocusTransitionContext): FocusTransitionPlan;
}
