import type { FocusedItem } from '@/store/canvasStore';
import { useCanvasStore } from '@/store/canvasStore';

import { getActiveFocusTransition } from './registry';
import { VIEW_TRANSITION_ID } from './viewTransition';
import {
  closeWithViewTransition,
  openWithViewTransition,
} from './viewTransitionController';

export type FocusTransitionRequest =
  | {
      direction: 'open';
      /** The canvas card being opened (or any element inside its node). */
      source: Element | null | undefined;
    }
  | {
      direction: 'close';
      /** The canvas card to return to, resolved after the state update. */
      target?: () => Element | null | undefined;
    };

/**
 * Single choke point for focus open / close state changes. For every variant
 * except `viewTransition` this just calls `update()`; for that variant it
 * wraps the update in `document.startViewTransition`.
 */
export function runFocusTransition(
  update: () => void,
  request: FocusTransitionRequest
): void {
  if (getActiveFocusTransition().id !== VIEW_TRANSITION_ID) {
    update();
    return;
  }
  if (request.direction === 'open') {
    openWithViewTransition(update, { source: request.source });
    return;
  }
  closeWithViewTransition(update, { target: request.target });
}

function canvasNodeElement(id: string): Element | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(id)}"]`
  );
}

/**
 * Canvas element the focused item returns to on close: its own node, an
 * expanded folder child visual, or the owning folder card.
 */
export function findFocusTargetElement(item: FocusedItem): Element | null {
  const own = canvasNodeElement(item.id);
  if (own) {
    return own;
  }
  if (typeof item.folderId !== 'string') {
    return null;
  }
  const expanded = Array.from(
    document.querySelectorAll<HTMLElement>('[data-folder-expanded-visual-id]')
  ).find((element) => element.dataset.folderExpandedVisualId === item.id);
  return expanded ?? canvasNodeElement(item.folderId);
}

/** Close the focused view (through the active transition). */
export function closeFocusedViewWithTransition(): void {
  const { focusedNode } = useCanvasStore.getState();
  if (!focusedNode) {
    return;
  }
  runFocusTransition(
    () => {
      useCanvasStore.getState().setFocusedNode(null);
    },
    {
      direction: 'close',
      target: () => findFocusTargetElement(focusedNode),
    }
  );
}
