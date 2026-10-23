import { clipReveal } from './clipReveal';
import { scaleMorph } from './scaleMorph';
import type { FocusTransition } from './types';

/**
 * ── Switch the focus animation here ──────────────────────────────────────
 * Variant branches add their implementation to `FOCUS_TRANSITIONS` and point
 * `DEFAULT_FOCUS_TRANSITION` at it. In dev builds the default can also be
 * overridden at runtime, without rebuilding:
 *
 *   localStorage.setItem('gb:focus-transition', '<id>'); location.reload();
 */
export const FOCUS_TRANSITIONS: Readonly<Record<string, FocusTransition>> = {
  [clipReveal.id]: clipReveal,
  [scaleMorph.id]: scaleMorph,
};

export const DEFAULT_FOCUS_TRANSITION: FocusTransition = clipReveal;

export const FOCUS_TRANSITION_OVERRIDE_KEY = 'gb:focus-transition';

/**
 * Resolve a transition id against a registry, falling back to the default
 * for unknown / empty ids so a stale override can never break opening.
 */
export function selectFocusTransition(
  id: string | null | undefined,
  registry: Readonly<Record<string, FocusTransition>> = FOCUS_TRANSITIONS,
  fallback: FocusTransition = DEFAULT_FOCUS_TRANSITION
): FocusTransition {
  if (!id) {
    return fallback;
  }
  return Object.hasOwn(registry, id) ? (registry[id] ?? fallback) : fallback;
}

function readDevOverride(): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  try {
    return (
      globalThis.localStorage?.getItem(FOCUS_TRANSITION_OVERRIDE_KEY) ?? null
    );
  } catch {
    return null;
  }
}

let active: FocusTransition | null = null;

/** The transition FocusedView uses (resolved once per session). */
export function getActiveFocusTransition(): FocusTransition {
  if (!active) {
    active = selectFocusTransition(readDevOverride());
  }
  return active;
}
