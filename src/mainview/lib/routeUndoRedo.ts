import { toast } from 'sonner';
import { createPluginContent } from '@/plugins/runtime/content';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { useWidgetStore } from '@/store/widgetStore';
import * as m from '../../paraglide/messages.js';
import { unifiedUndoHistory } from './unifiedUndoHistory';

/*
 * Undo/redo routing
 * -----------------
 * Every history source registers its entries with the unified coordinator
 * (lib/unifiedUndoHistory.ts): canvas snapshots, legacy widget edits,
 * canvas-type extension instance edits and committed plugin note batches.
 * This module decides who handles a Cmd+Z / menu Undo. First match wins:
 *
 * 1. Focused extension instance (`[data-extension-instance]` ancestor of the
 *    event target, or an `extension` detail view): that instance's own stack.
 * 2. Focused legacy widget detail view: that widget's own stack.
 *    Both keep local ownership so a checklist undo never reverts an unrelated
 *    canvas move; the stores report the local move back to the coordinator,
 *    which keeps the global timeline consistent with it.
 * 3. Native text editing: while an input/textarea/contentEditable (including
 *    BlockNote) has focus, keyboard shortcuts return false so the editor's own
 *    stack runs; the native menu path calls document.execCommand instead.
 * 4. Otherwise the unified timeline: the most recent entry from any source is
 *    reverted, so canvas edits, inline widget/extension edits and plugin
 *    batches undo in the order they happened. With no active workspace/view
 *    context it falls back to the canvas snapshot stack directly.
 *
 * Covered by routeUndoRedo.test.ts and unifiedUndoHistory.test.ts.
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
      widget: (widgetId, action) => {
        const widgets = useWidgetStore.getState();
        return action === 'undo'
          ? widgets.undoWidget(widgetId)
          : widgets.redoWidget(widgetId);
      },
      extensionInstance: (instanceId, action) => {
        const instances = useExtensionInstanceStore.getState();
        return action === 'undo'
          ? instances.undoInstance(instanceId)
          : instances.redoInstance(instanceId);
      },
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
