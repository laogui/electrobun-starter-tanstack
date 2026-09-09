import {
  applyNoteMetadataChanges,
  isNoteMetadataChange,
  publishNoteMetadataChanges,
} from '@/lib/noteMetadataProjection';
import { useCanvasStore } from '@/store/canvasStore';
import type { ContentChangedEvent } from '../../../../packages/plugin-sdk';
import { canvasSelection } from './canvasSelection';
import type { PluginRuntime } from './PluginRuntime';
import { EMPTY_PLACEMENTS } from './selection';

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
  let selectionNeedsHydration = false;
  let sawUnhydrated = false;
  const syncWorkspace = () => {
    const current = runtime.getSnapshot().workspaceId;
    if (current !== workspaceId) {
      if (workspaceId) {
        selectionNeedsHydration = true;
        sawUnhydrated = false;
      }
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
    if (selectionNeedsHydration) {
      if (!state._hydrated) {
        sawUnhydrated = true;
      } else if (sawUnhydrated) {
        selectionNeedsHydration = false;
      }
    }
    const selection = selectionNeedsHydration
      ? EMPTY_PLACEMENTS
      : canvasSelection(state);
    runtime.updateSelection(workspaceId, selection);
    const payload = {
      workspaceId,
      viewId: selection.viewId,
      placementIds: selection.items.map((item) => item.id),
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
  selectionChanged();
  return () => {
    runtime.updateSelection(
      runtime.getSnapshot().workspaceId,
      EMPTY_PLACEMENTS
    );
    target.removeEventListener('plugin-content-changed', contentChanged);
    unsubscribeCanvas();
    unsubscribeRuntime();
  };
}
