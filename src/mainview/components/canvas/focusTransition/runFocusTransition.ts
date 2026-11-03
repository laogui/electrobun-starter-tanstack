import { requestRegisteredFocusClose } from '@/lib/focusedCloseRequest';
import type { FolderChildEntry } from '@/store/canvas/folderChildren';
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

let latestRequest = 0;

/**
 * Single choke point for focus open / close state changes. For every variant
 * except `viewTransition` this just calls `update()`; for that variant it
 * wraps the update in `document.startViewTransition`.
 */
export function runFocusTransition(
  update: () => void,
  request: FocusTransitionRequest
): void {
  const requestId = ++latestRequest;
  const before = useCanvasStore.getState();
  const guardedUpdate = () => {
    const current = useCanvasStore.getState();
    if (
      requestId !== latestRequest ||
      current._focusSession !== before._focusSession ||
      current._canvasGeneration !== before._canvasGeneration ||
      current.activeViewId !== before.activeViewId
    ) {
      return;
    }
    if (
      request.direction === 'close' &&
      (current._focusSession !== before._focusSession ||
        current.focusedNode?.id !== before.focusedNode?.id ||
        current.focusedNode?.folderId !== before.focusedNode?.folderId)
    ) {
      return;
    }
    update();
    if (request.direction === 'open') {
      const next = useCanvasStore.getState();
      const focused = next.focusedNode;
      if (!focused) {
        return;
      }
      const parent = focused.folderId
        ? next.nodes.find((node) => node.id === focused.folderId)
        : undefined;
      const children = parent?.data.children;
      const item = focused.folderId
        ? Array.isArray(children)
          ? (children as FolderChildEntry[]).find(
              (child) => child?.id === focused.id
            )
          : undefined
        : next.nodes.find((node) => node.id === focused.id);
      if (!item) {
        next.setFocusedNode(null);
      } else if (item.data) {
        next.setFocusedNode({ ...focused, data: item.data, type: item.type });
      }
    }
  };
  if (getActiveFocusTransition().id !== VIEW_TRANSITION_ID) {
    guardedUpdate();
    return;
  }
  if (request.direction === 'open') {
    openWithViewTransition(guardedUpdate, { source: request.source });
    return;
  }
  closeWithViewTransition(guardedUpdate, { target: request.target });
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
export function closeFocusedViewWithTransition(confirmed = false): void {
  const { focusedNode } = useCanvasStore.getState();
  if (!focusedNode) {
    return;
  }
  if (!confirmed && requestRegisteredFocusClose(focusedNode.id)) {
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
