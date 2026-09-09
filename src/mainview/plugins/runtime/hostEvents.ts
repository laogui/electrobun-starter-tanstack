import { useCanvasStore } from '@/store/canvasStore';
import type { ContentChangedEvent } from '../../../../packages/plugin-sdk';
import type { PluginRuntime } from './PluginRuntime';

function isContentChange(value: unknown): value is ContentChangedEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const event = value as ContentChangedEvent;
  return (
    typeof event.workspaceId === 'string' &&
    ['note', 'widget', 'extension'].includes(event.kind) &&
    ['upsert', 'delete'].includes(event.operation) &&
    Array.isArray(event.ids) &&
    event.ids.every((id) => typeof id === 'string')
  );
}

export function connectPluginHostEvents(
  runtime: PluginRuntime,
  target: Window = window
): () => void {
  const contentChanged = (event: Event) => {
    const payload: unknown = (event as CustomEvent).detail;
    if (isContentChange(payload)) {
      runtime.emitHostEvent('content.changed', payload);
    }
  };
  let lastSelection = '';
  const selectionChanged = () => {
    const workspaceId = runtime.getSnapshot().workspaceId;
    if (!workspaceId) {
      return;
    }
    const state = useCanvasStore.getState();
    const payload = {
      workspaceId,
      viewId: state._hydrated ? state.activeViewId : null,
      placementIds: state._hydrated
        ? state.nodes
            .filter((node) => node.selected)
            .map((node) => node.id)
            .sort()
        : [],
    };
    const key = JSON.stringify(payload);
    if (key === lastSelection) {
      return;
    }
    lastSelection = key;
    runtime.emitHostEvent('selection.changed', payload);
  };
  target.addEventListener('plugin-content-changed', contentChanged);
  const unsubscribeCanvas = useCanvasStore.subscribe(selectionChanged);
  const unsubscribeRuntime = runtime.subscribe(selectionChanged);
  return () => {
    target.removeEventListener('plugin-content-changed', contentChanged);
    unsubscribeCanvas();
    unsubscribeRuntime();
  };
}
