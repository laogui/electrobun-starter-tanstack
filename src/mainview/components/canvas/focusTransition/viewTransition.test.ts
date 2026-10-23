// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scaleMorph } from './scaleMorph';
import type { FocusTransitionContext } from './types';
import { viewTransition } from './viewTransition';
import {
  closeWithViewTransition,
  isViewTransitionSession,
  openWithViewTransition,
  resetViewTransitionStateForTests,
  VT_CARD_NAME,
  VT_ROOT_CLASS,
  VT_TITLE_NAME,
  waitForFocusOpen,
} from './viewTransitionController';

const context: FocusTransitionContext = {
  cardColor: undefined,
  reducedMotion: false,
  sourceRect: new DOMRect(100, 100, 320, 160),
  surface: 'note',
  viewport: { height: 800, width: 1200 },
};

interface VtDocument {
  startViewTransition?: unknown;
}
const vtDocument = () => document as unknown as VtDocument;

interface FakeTransition {
  finish: () => void;
  namesInOld: Map<string, Element>;
}

/** Minimal same-document view transition: snapshots names, runs the update. */
function installFakeViewTransitions(): FakeTransition[] {
  const started: FakeTransition[] = [];
  vtDocument().startViewTransition = (callback: () => void) => {
    const namesInOld = new Map<string, Element>();
    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      const name = element.style.getPropertyValue('view-transition-name');
      if (name) {
        namesInOld.set(name, element);
      }
    }
    callback();
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    started.push({ finish, namesInOld });
    return {
      finished,
      ready: Promise.resolve(),
      skipTransition: () => finish(),
      updateCallbackDone: Promise.resolve(),
    };
  };
  return started;
}

function mountCard(): { card: HTMLElement; title: HTMLElement } {
  document.body.innerHTML = `
    <div class="react-flow__node" data-id="n1">
      <div class="node-visual"><h2 data-focus-title>Title</h2></div>
    </div>`;
  const card = document.querySelector<HTMLElement>('.node-visual');
  const title = card?.querySelector<HTMLElement>('[data-focus-title]');
  if (!(card && title)) {
    throw new Error('fixture');
  }
  const onScreen = () => new DOMRect(10, 10, 200, 100);
  card.getBoundingClientRect = onScreen;
  title.getBoundingClientRect = onScreen;
  return { card, title };
}

function mountFocusedView(): HTMLElement {
  const root = document.createElement('div');
  root.dataset.focusTransition = 'viewTransition';
  root.innerHTML = '<h1 data-focus-title>Title</h1>';
  const title = root.querySelector<HTMLElement>('h1');
  if (title) {
    title.getBoundingClientRect = () => new DOMRect(200, 48, 700, 45);
  }
  document.body.append(root);
  return root;
}

const name = (element: Element | null | undefined) =>
  (element as HTMLElement | null)?.style.getPropertyValue(
    'view-transition-name'
  ) ?? '';

beforeEach(() => {
  resetViewTransitionStateForTests();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vtDocument().startViewTransition = undefined;
  document.body.innerHTML = '';
  document.documentElement.className = '';
  vi.restoreAllMocks();
});

describe('viewTransition plan', () => {
  it('falls back to scaleMorph outside a view-transition session', () => {
    expect(viewTransition.plan(context)).toEqual(scaleMorph.plan(context));
  });

  it('falls back to scaleMorph when the API is missing', () => {
    const { card } = mountCard();
    const update = vi.fn();
    openWithViewTransition(update, { source: card });
    expect(update).toHaveBeenCalledOnce();
    expect(isViewTransitionSession()).toBe(false);
  });
});

describe('view transition open / close', () => {
  it('moves the shared names card → focused view → card', async () => {
    const started = installFakeViewTransitions();
    const { card, title } = mountCard();
    const mounted: { root: HTMLElement | null } = { root: null };

    openWithViewTransition(
      () => {
        mounted.root = mountFocusedView();
      },
      { source: card }
    );
    const root = mounted.root as HTMLElement | null;
    const open = started[0];
    expect(open?.namesInOld.get(VT_CARD_NAME)).toBe(card);
    expect(open?.namesInOld.get(VT_TITLE_NAME)).toBe(title);
    expect(isViewTransitionSession()).toBe(true);
    // New state: names now on the focused view, card hidden behind it.
    expect(name(root)).toBe(VT_CARD_NAME);
    expect(name(root?.querySelector('h1'))).toBe(VT_TITLE_NAME);
    expect(name(card)).toBe('');
    expect(card.style.visibility).toBe('hidden');
    expect(document.documentElement.classList.contains(VT_ROOT_CLASS)).toBe(
      true
    );

    const plan = viewTransition.plan(context);
    expect(plan.shell).toEqual({});
    expect(plan.content).toEqual({});
    expect(plan.waitForOpen).toBeTypeOf('function');

    const landed = vi.fn();
    waitForFocusOpen().then(landed);
    open?.finish();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(landed).toHaveBeenCalledOnce();
    expect(name(root)).toBe('');
    expect(card.style.visibility).toBe('');
    expect(document.documentElement.classList.contains(VT_ROOT_CLASS)).toBe(
      false
    );

    closeWithViewTransition(
      () => {
        root?.remove();
      },
      { target: () => card }
    );
    const close = started[1];
    expect(close?.namesInOld.get(VT_CARD_NAME)).toBe(root);
    expect(name(card)).toBe(VT_CARD_NAME);
    expect(name(title)).toBe(VT_TITLE_NAME);
    close?.finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(name(card)).toBe('');
    expect(isViewTransitionSession()).toBe(false);
  });

  it('closes without a transition when the session was not opened by one', () => {
    installFakeViewTransitions();
    const update = vi.fn();
    closeWithViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });
});
