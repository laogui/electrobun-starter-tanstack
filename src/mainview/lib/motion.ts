import { cubicBezier } from 'motion';

/* Shared motion tokens. CSS mirrors these as `--motion-*` in index.css. */

/** Strong ease-out for entrances and responses to user actions. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** Ease-out-quint used by the folder / focus morphs. */
export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

/** Spring for small anchored popovers (context menu, selection toolbar). */
export const POPOVER_SPRING = {
  type: 'spring',
  duration: 0.22,
  bounce: 0,
} as const;

/** Exits are quicker than entrances so dismissal never blocks the user. */
export const POPOVER_EXIT = { duration: 0.12, ease: EASE_OUT } as const;

/** Crossfade from the static note preview to the live editor. */
export const FOCUS_EDITOR_SWAP_MS = 120;

export const VIEWPORT_ZOOM_MS = 200;
export const VIEWPORT_PAN_MS = 240;

/** Slightly longer than the `node-enter` CSS animation. */
const NODE_ENTER_WINDOW_MS = 400;
const enteringNodeIds = new Set<string>();

/**
 * Flag freshly created nodes so the canvas renders them with `node-entering`.
 * Loaded, undone, or remounted nodes are never flagged, so they appear
 * without an entrance.
 */
export function markNodesEntering(ids: Iterable<string>): void {
  const added = [...ids];
  for (const id of added) {
    enteringNodeIds.add(id);
  }
  setTimeout(() => {
    for (const id of added) {
      enteringNodeIds.delete(id);
    }
  }, NODE_ENTER_WINDOW_MS);
}

export function isNodeEntering(id: string): boolean {
  return enteringNodeIds.has(id);
}

const easeOut = cubicBezier(...EASE_OUT);

export function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export interface ViewportMotionOptions {
  duration: number;
  ease: (t: number) => number;
  interpolate: 'linear';
}

/**
 * Options for React Flow viewport helpers (`setCenter`, `zoomIn`, `zoomTo`…).
 * Linear view interpolation keeps same-zoom pans from dipping out and back in;
 * reduced motion jumps instantly.
 */
export function viewportMotion(duration: number): ViewportMotionOptions {
  return {
    duration: prefersReducedMotion() ? 0 : duration,
    ease: easeOut,
    interpolate: 'linear',
  };
}
