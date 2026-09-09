import {
  applyNoteMetadataChanges,
  isNoteMetadataChange,
  publishNoteMetadataChanges,
} from '@/lib/noteMetadataProjection';
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
    event.ids.every((id) => typeof id === 'string') &&
    (event.noteChanges === undefined ||
      (Array.isArray(event.noteChanges) &&
        event.noteChanges.every(isNoteMetadataChange)))
  );
}

export function connectPluginHostEvents(
  runtime: PluginRuntime,
  target: Window = window
): () => void {
  let workspaceId = runtime.getSnapshot().workspaceId;
  const revisions = new Map<string, number>();
  const syncWorkspace = () => {
    const current = runtime.getSnapshot().workspaceId;
    if (current !== workspaceId) {
      workspaceId = current;
      revisions.clear();
    }
  };
  const contentChanged = (event: Event) => {
    syncWorkspace();
    const payload: unknown = (event as CustomEvent).detail;
    if (
      !(isContentChange(payload) && workspaceId) ||
      payload.workspaceId !== workspaceId
    ) {
      return;
    }
    if (
      payload.kind === 'note' &&
      payload.operation === 'upsert' &&
      payload.noteChanges
    ) {
      const changes = payload.noteChanges.filter((change) => {
        if (
          !payload.ids.includes(change.id) ||
          change.after.revision <= (revisions.get(change.id) ?? -1)
        ) {
          return false;
        }
        revisions.set(change.id, change.after.revision);
        return true;
      });
      if (changes.length > 0) {
        const projectable = publishNoteMetadataChanges(changes);
        useCanvasStore.setState((state) =>
          applyNoteMetadataChanges(state, projectable)
        );
      }
    }
    runtime.emitHostEvent('content.changed', payload);
  };
  let lastSelection = '';
  const selectionChanged = () => {
    syncWorkspace();
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
