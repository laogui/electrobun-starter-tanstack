import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { useWidgetStore } from '@/store/widgetStore';

function isEditingElement(element: Element | null): boolean {
  if (typeof HTMLElement === 'undefined' || !element) {
    return false;
  }
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

function focusedExtensionInstanceId(
  eventTarget: EventTarget | null
): string | null {
  const focused = useCanvasStore.getState().focusedNode;
  const extensionHost =
    typeof Element !== 'undefined' && eventTarget instanceof Element
      ? eventTarget.closest('[data-extension-instance]')
      : null;
  return (
    extensionHost?.getAttribute('data-extension-instance') ??
    (focused?.type === 'extension' &&
    typeof focused.data.instanceId === 'string'
      ? focused.data.instanceId
      : null)
  );
}

/**
 * Route Undo/Redo the same way for the canvas keyboard handler and the
 * native application menu. Native `{ role: 'undo' }` never reaches this
 * function — Electrobun delivers it to WKWebView's own edit stack.
 *
 * Returns whether the caller should preventDefault on a keydown.
 */
export function routeUndoRedo(
  kind: 'redo' | 'undo',
  options?: { eventTarget?: EventTarget | null; fromKeyboard?: boolean }
): boolean {
  const instanceId = focusedExtensionInstanceId(options?.eventTarget ?? null);
  if (instanceId) {
    const extensionStore = useExtensionInstanceStore.getState();
    if (kind === 'redo') {
      extensionStore.redoInstance(instanceId);
    } else {
      extensionStore.undoInstance(instanceId);
    }
    return true;
  }

  const focused = useCanvasStore.getState().focusedNode;
  if (focused?.type === 'widget') {
    const widgetId = focused.data.widgetId;
    if (typeof widgetId === 'string' && widgetId) {
      const widgetStore = useWidgetStore.getState();
      if (kind === 'redo') {
        widgetStore.redoWidget(widgetId);
      } else {
        widgetStore.undoWidget(widgetId);
      }
      return true;
    }
  }

  if (isEditingElement(document.activeElement)) {
    if (options?.fromKeyboard) {
      return false;
    }
    if (typeof document.execCommand === 'function') {
      document.execCommand(kind);
    }
    return true;
  }

  if (kind === 'redo') {
    useCanvasStore.getState().redo();
  } else {
    useCanvasStore.getState().undo();
  }
  return true;
}
