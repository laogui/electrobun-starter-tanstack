import { scaleMorph } from './scaleMorph';
import type { FocusTransition } from './types';
import {
  isViewTransitionSession,
  waitForFocusOpen,
} from './viewTransitionController';

export const VIEW_TRANSITION_ID = 'viewTransition';

/**
 * Variant D: the browser's View Transitions API morphs the canvas card into
 * the focused view (`view-transition-name: gb-focus-card` on the note column
 * `[data-focus-surface]`, otherwise the fullscreen root; title as
 * `gb-focus-title`). The open / close state change is wrapped by
 * `runFocusTransition` (see `viewTransitionController.ts`); the pseudo-element
 * animation lives in index.css (`.gb-vt-focus`).
 *
 * The motion layers therefore get no-op props (nothing to double-animate, no
 * AnimatePresence exit) and "open complete" is the transition's `finished`.
 * When this session was not opened through a view transition (API missing,
 * reduced motion, no visible source card, or an unrouted open path) the plan
 * falls back to `scaleMorph`.
 *
 * Not strictly pure: reads whether the current focus session was opened via a
 * view transition. FocusedView memoizes the plan on its context, so it is
 * decided at mount and stays stable for the session.
 */
export const viewTransition: FocusTransition = {
  id: VIEW_TRANSITION_ID,
  label: 'View Transitions API',
  plan(context) {
    if (context.reducedMotion || !isViewTransitionSession()) {
      return scaleMorph.plan(context);
    }
    return { content: {}, shell: {}, waitForOpen: waitForFocusOpen };
  },
};
