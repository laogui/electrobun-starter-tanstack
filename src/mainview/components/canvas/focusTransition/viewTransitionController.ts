/**
 * Runtime half of the `viewTransition` focus variant: wraps a focus open /
 * close state change in a same-document `document.startViewTransition`, moves
 * the shared `view-transition-name`s from the canvas card to the focused view
 * (and back), and tracks whether the current focus session was opened through
 * a view transition so the motion plan can stay out of the way.
 *
 * Kept free of store / registry imports: callers decide whether this variant
 * is active (see `runFocusTransition.ts`).
 */
import { flushSync } from 'react-dom';
import { prefersReducedMotion } from '@/lib/motion';
import { startFocusAnimProbe } from './focusAnimProbe';

export const VT_CARD_NAME = 'gb-focus-card';
export const VT_TITLE_NAME = 'gb-focus-title';
/** On `<html>` while one of our transitions runs (scopes the pseudo CSS). */
export const VT_ROOT_CLASS = 'gb-vt-focus';
export const VT_OPEN_CLASS = 'gb-vt-focus-open';
export const VT_CLOSE_CLASS = 'gb-vt-focus-close';
/** Marks titles that morph (canvas card title, focused preview / editor). */
export const FOCUS_TITLE_SELECTOR = '[data-focus-title]';
/** The focused view's root (`FocusedView` sets `data-focus-transition`). */
export const FOCUS_ROOT_SELECTOR = '[data-focus-transition]';
/**
 * Note reading column. The card morphs into this instead of the fullscreen
 * root: the root's box is the viewport, and WebKit then stretches the text
 * snapshot to the screen before the centered column settles.
 */
export const FOCUS_SURFACE_SELECTOR = '[data-focus-surface]';

export type FocusTransitionDirection = 'open' | 'close';

interface ViewTransitionLike {
  finished: Promise<void>;
  ready: Promise<void>;
  skipTransition(): void;
  updateCallbackDone: Promise<void>;
}

type StartViewTransition = (callback: () => void) => ViewTransitionLike;

interface Running {
  cleanup: () => void;
  direction: FocusTransitionDirection;
  /** True until the update callback has run (the DOM still shows the old state). */
  pending: boolean;
  transition: ViewTransitionLike;
}

let running: Running | null = null;
/** The focused view currently on screen was opened through a view transition. */
let session = false;
let openFinished: Promise<void> | null = null;
/** Focus root hidden for a close snapshot; restored if the view is reused. */
let hiddenFocusRoot: HTMLElement | null = null;

function getStartViewTransition(): StartViewTransition | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const start = (
    document as Document & { startViewTransition?: StartViewTransition }
  ).startViewTransition;
  return typeof start === 'function' ? start.bind(document) : null;
}

/** Same-document View Transitions (Safari / WKWebView 18+, Chromium 111+). */
export function isViewTransitionSupported(): boolean {
  return getStartViewTransition() !== null;
}

/** The current focus session was opened via a view transition. */
export function isViewTransitionSession(): boolean {
  return session;
}

/** A focus view transition is running (host skips its own frame probe). */
export function isFocusViewTransitionRunning(): boolean {
  return running !== null;
}

/**
 * Resolves when the running open transition finishes (or immediately). The
 * focused view treats this as "open complete": editor mount + canvas hide.
 */
export function waitForFocusOpen(): Promise<void> {
  return openFinished ?? Promise.resolve();
}

/** Host hook: focus became null outside a routed close. */
export function notifyFocusCleared(): void {
  if (running?.direction !== 'close') {
    session = false;
  }
}

/** Host hook: a focused view opened (by any path). */
export function notifyFocusOpened(): void {
  if (hiddenFocusRoot) {
    hiddenFocusRoot.style.visibility = '';
    hiddenFocusRoot = null;
  }
}

function setName(element: Element | null | undefined, name: string): void {
  if (element instanceof HTMLElement) {
    element.style.setProperty('view-transition-name', name);
  }
}

function clearName(element: Element | null | undefined): void {
  if (element instanceof HTMLElement) {
    element.style.removeProperty('view-transition-name');
  }
}

/** Keep a nested title group inside the card snapshot, not on the viewport. */
function containGroup(element: HTMLElement | null | undefined): void {
  element?.style.setProperty('view-transition-group', 'contain');
}

function clearGroup(element: HTMLElement | null | undefined): void {
  element?.style.removeProperty('view-transition-group');
}

/** The newest visible focused view root, if any. */
export function findFocusRoot(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const roots = Array.from(
    document.querySelectorAll<HTMLElement>(FOCUS_ROOT_SELECTOR)
  ).filter((element) => element.style.visibility !== 'hidden');
  return roots.at(-1) ?? null;
}

/**
 * Element the card morphs into. Notes mark their reading column with
 * `[data-focus-surface]`; everything else morphs the fullscreen root.
 * Prefer the live editor's column once it has been revealed.
 */
export function findFocusCard(root: Element | null): HTMLElement | null {
  if (!(root instanceof HTMLElement)) {
    return null;
  }
  const surfaces = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUS_SURFACE_SELECTOR)
  );
  const inReadyEditor = surfaces.find(
    (surface) =>
      surface.closest<HTMLElement>('[data-focus-editor-ready]')?.dataset
        .focusEditorReady === 'true'
  );
  if (inReadyEditor) {
    return inReadyEditor;
  }
  return (
    surfaces.find((surface) => !surface.closest('[data-focus-editor-ready]')) ??
    surfaces[0] ??
    root
  );
}

/**
 * The visible title inside the focused view: the live editor's title once it
 * has been revealed, otherwise the static preview's.
 */
export function findFocusTitle(root: Element | null): HTMLElement | null {
  if (!root) {
    return null;
  }
  const titles = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUS_TITLE_SELECTOR)
  );
  const inReadyEditor = titles.find(
    (title) =>
      title.closest<HTMLElement>('[data-focus-editor-ready]')?.dataset
        .focusEditorReady === 'true'
  );
  if (inReadyEditor) {
    return inReadyEditor;
  }
  return (
    titles.find((title) => !title.closest('[data-focus-editor-ready]')) ??
    titles[0] ??
    null
  );
}

/** The card surface for a canvas node element (rounded visual, not the RF wrapper). */
export function resolveCardSurface(
  element: Element | null | undefined
): HTMLElement | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  const node = element.closest<HTMLElement>('.react-flow__node') ?? element;
  return node.querySelector<HTMLElement>('.node-visual') ?? node;
}

function isOnScreen(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.top < window.innerHeight
  );
}

function setRootClasses(direction: FocusTransitionDirection | null): void {
  const html = document.documentElement;
  html.classList.toggle(VT_ROOT_CLASS, direction !== null);
  html.classList.toggle(VT_OPEN_CLASS, direction === 'open');
  html.classList.toggle(VT_CLOSE_CLASS, direction === 'close');
}

function logPhase(label: string, startedAt: number, phase: string): void {
  if (import.meta.env.DEV) {
    console.info(
      `[focus-anim] ${label} ${phase} +${Math.round(performance.now() - startedAt)}ms`
    );
  }
}

/** Finish (skip) the running transition and run its cleanup synchronously. */
function settleRunning(): void {
  const current = running;
  if (!current) {
    return;
  }
  try {
    current.transition.skipTransition();
  } finally {
    current.cleanup();
  }
}

function startSafely(
  start: StartViewTransition,
  update: () => void,
  cleanup: () => void,
  fallback: () => void
): ViewTransitionLike | null {
  let invoked = false;
  try {
    return start(() => {
      invoked = true;
      try {
        update();
      } catch (error) {
        cleanup();
        throw error;
      }
    });
  } catch (error) {
    cleanup();
    console.warn('[focus] View transition unavailable:', error);
    if (!invoked) {
      fallback();
    }
    return null;
  }
}

function track(
  direction: FocusTransitionDirection,
  transition: ViewTransitionLike,
  cleanupOnce: () => void
): Running {
  const entry: Running = {
    cleanup: cleanupOnce,
    direction,
    pending: true,
    transition,
  };
  transition.updateCallbackDone
    .catch(() => undefined)
    .finally(() => {
      entry.pending = false;
    });
  transition.ready.catch(() => undefined);
  transition.finished.then(cleanupOnce, cleanupOnce);
  return entry;
}

function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (!done) {
      done = true;
      fn();
    }
  };
}

export interface OpenOptions {
  /** The canvas card element (or anything inside its React Flow node). */
  source: Element | null | undefined;
}

export interface CloseOptions {
  /** Resolves the canvas card to shrink back into, after the state update. */
  target?: () => Element | null | undefined;
}

/**
 * Run `update` (which must set the focused node) inside a view transition
 * morphing the source card into the focused view. Falls back to calling
 * `update` directly when unsupported or there is no visible source card.
 */
export function openWithViewTransition(
  update: () => void,
  { source }: OpenOptions
): void {
  const start = getStartViewTransition();
  const card = resolveCardSurface(source);
  if (!(start && card && isOnScreen(card)) || prefersReducedMotion()) {
    update();
    return;
  }
  if (running?.pending) {
    const previous = running;
    previous.transition.updateCallbackDone
      .catch(() => undefined)
      .finally(() => openWithViewTransition(update, { source }));
    return;
  }
  settleRunning();

  const label = 'open viewTransition';
  const startedAt = performance.now();
  const stopProbe = startFocusAnimProbe(label);
  const sourceTitle = card.querySelector<HTMLElement>(FOCUS_TITLE_SELECTOR);
  setName(card, VT_CARD_NAME);
  containGroup(card);
  setName(sourceTitle, VT_TITLE_NAME);
  setRootClasses('open');

  let focusRoot: HTMLElement | null = null;
  let focusCard: HTMLElement | null = null;
  let focusTitle: HTMLElement | null = null;
  let resolveOpen: () => void = () => undefined;
  const finishedPromise = new Promise<void>((resolve) => {
    resolveOpen = resolve;
  });
  openFinished = finishedPromise;

  const cleanup = once(() => {
    clearName(card);
    clearGroup(card);
    clearName(sourceTitle);
    clearName(focusRoot);
    clearName(focusCard);
    clearGroup(focusCard);
    clearName(focusTitle);
    card.style.visibility = '';
    if (!running || running.cleanup === cleanup) {
      running = null;
      setRootClasses(null);
    }
    if (openFinished === finishedPromise) {
      openFinished = null;
    }
    stopProbe();
    resolveOpen();
  });

  const transition = startSafely(
    start,
    () => {
      clearName(card);
      clearGroup(card);
      clearName(sourceTitle);
      session = true;
      flushSync(update);
      focusRoot = findFocusRoot();
      if (!focusRoot) {
        // The update did not open anything (guarded call site).
        session = false;
        return;
      }
      focusCard = findFocusCard(focusRoot);
      setName(focusCard, VT_CARD_NAME);
      containGroup(focusCard);
      focusTitle = sourceTitle ? findFocusTitle(focusRoot) : null;
      setName(focusTitle, VT_TITLE_NAME);
      // The card "moved" into the focused view: do not leave a copy behind.
      card.style.visibility = 'hidden';
    },
    cleanup,
    update
  );
  if (!transition) {
    return;
  }
  running = track('open', transition, cleanup);
  transition.ready.then(
    () => logPhase(label, startedAt, 'ready'),
    () => logPhase(label, startedAt, 'skipped')
  );
  transition.finished.then(
    () => logPhase(label, startedAt, 'finished'),
    () => undefined
  );
}

/**
 * Run `update` (which must clear the focused node) inside a view transition
 * shrinking the focused view back into its canvas card. Calls `update`
 * directly when this session was not opened through a view transition.
 */
export function closeWithViewTransition(
  update: () => void,
  { target }: CloseOptions = {}
): void {
  const start = getStartViewTransition();
  if (!(start && session)) {
    update();
    return;
  }
  if (running?.pending) {
    if (running.direction === 'close') {
      // Second close (e.g. Esc handled twice) while the first is pending.
      return;
    }
    const previous = running;
    previous.transition.updateCallbackDone
      .catch(() => undefined)
      .finally(() => closeWithViewTransition(update, { target }));
    return;
  }
  settleRunning();

  const focusRoot = findFocusRoot();
  if (!focusRoot) {
    session = false;
    update();
    return;
  }

  const label = 'close viewTransition';
  const startedAt = performance.now();
  const stopProbe = startFocusAnimProbe(label);
  const focusCard = findFocusCard(focusRoot);
  const rootTitle = findFocusTitle(focusRoot);
  // A title scrolled out of view would morph in from off screen.
  const focusTitle = rootTitle && isOnScreen(rootTitle) ? rootTitle : null;
  setName(focusCard, VT_CARD_NAME);
  containGroup(focusCard);
  setName(focusTitle, VT_TITLE_NAME);
  setRootClasses('close');

  let card: HTMLElement | null = null;
  let cardTitle: HTMLElement | null = null;

  const cleanup = once(() => {
    clearName(focusRoot);
    clearName(focusCard);
    clearGroup(focusCard);
    clearName(focusTitle);
    clearName(card);
    clearGroup(card);
    clearName(cardTitle);
    focusRoot.style.visibility = '';
    if (hiddenFocusRoot === focusRoot) {
      hiddenFocusRoot = null;
    }
    if (!running || running.cleanup === cleanup) {
      running = null;
      setRootClasses(null);
      session = false;
    }
    stopProbe();
  });

  const transition = startSafely(
    start,
    () => {
      clearName(focusRoot);
      clearName(focusCard);
      clearGroup(focusCard);
      clearName(focusTitle);
      // AnimatePresence may keep the exiting view mounted for a tick; it must
      // not be part of the "new" snapshot.
      focusRoot.style.visibility = 'hidden';
      hiddenFocusRoot = focusRoot;
      flushSync(update);
      card = resolveCardSurface(target?.() ?? null);
      if (card) {
        setName(card, VT_CARD_NAME);
        containGroup(card);
        if (focusTitle) {
          cardTitle = card.querySelector<HTMLElement>(FOCUS_TITLE_SELECTOR);
          setName(cardTitle, VT_TITLE_NAME);
        }
      }
    },
    cleanup,
    update
  );
  if (!transition) {
    return;
  }
  running = track('close', transition, cleanup);
  transition.ready.then(
    () => logPhase(label, startedAt, 'ready'),
    () => logPhase(label, startedAt, 'skipped')
  );
  transition.finished.then(
    () => logPhase(label, startedAt, 'finished'),
    () => undefined
  );
}

/** Test-only: reset module state. */
export function resetViewTransitionStateForTests(): void {
  running = null;
  session = false;
  openFinished = null;
  hiddenFocusRoot = null;
}
