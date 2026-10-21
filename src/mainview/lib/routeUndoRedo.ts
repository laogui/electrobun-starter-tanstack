import { toast } from 'sonner';
import { createPluginContent } from '@/plugins/runtime/content';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { useWidgetStore } from '@/store/widgetStore';
import * as m from '../../paraglide/messages.js';
import { unifiedUndoHistory } from './unifiedUndoHistory';

/*
 * Undo/redo routing between GhostBoard's four history stacks
 * -----------------------------------------------------------
 * The stacks do not know about each other; this module is the only place
 * that decides which one a Cmd+Z / menu Undo goes to. First match wins:
 *
 * 1. Extension instance stack (extensionInstanceStore.undoInstance/redo):
 *    per-instance state history of a canvas-type extension. Chosen when the
 *    event target sits inside `[data-extension-instance]`, or when the
 *    focused (detail) node is an `extension` node.
 * 2. Legacy widget stack (widgetStore.undoWidget/redoWidget): per-widget
 *    data history. Chosen when the focused (detail) node is a `widget`.
 * 3. Native text editing: when an input/textarea/contentEditable has focus,
 *    keyboard shortcuts return false so the browser's own edit stack runs;
 *    the native menu path calls document.execCommand instead.
 * 4. Unified history (unifiedUndoHistory): the canvas-level timeline that
 *    interleaves canvas snapshots (lib/undoRedo.ts via canvasStore.undo/redo,
 *    the third stack) with committed plugin note batches, so they replay in
 *    the order they happened. With no active workspace/view context it falls
 *    back to the canvas snapshot stack directly.
 *
 * Consequences worth knowing: while a widget or extension is focused, canvas
 * edits are not reachable by Cmd+Z until focus leaves it, and the per-node
 * stacks never enter the unified timeline. Migrating legacy widgets onto the
 * unified history is tracked in PRD §2.9. Covered by routeUndoRedo.test.ts.
 */

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

function routeUnifiedHistory(kind: 'redo' | 'undo'): void {
  unifiedUndoHistory
    .perform(kind, {
      canvas: (action) => useCanvasStore.getState()[action](),
      plugin: async (entry, action, operationId) => {
        const content = createPluginContent({
          pluginId: entry.pluginId,
          workspaceId: entry.workspaceId,
          signal: new AbortController().signal,
        });
        await content[action](entry.batchId, { operationId });
      },
    })
    .catch((error) => {
      console.error(
        `[history] ${kind === 'undo' ? 'Undo' : 'Redo'} failed:`,
        error
      );
      toast.error(
        kind === 'undo' ? m.toast_undo_failed() : m.toast_redo_failed()
      );
    });
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

  routeUnifiedHistory(kind);
  return true;
}
