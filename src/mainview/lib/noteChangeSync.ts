import { clearBlockNotePrefetch } from '@/lib/blockNotePrefetch';
import { createNoteBodySync } from '@/lib/noteBodySync';
import {
  applyNoteMetadataChanges,
  isNoteMetadataChange,
  publishNoteMetadataChanges,
} from '@/lib/noteMetadataProjection';
import { useCanvasStore } from '@/store/canvasStore';
import {
  NOTE_CHANGED_EVENT,
  type NoteChangedEvent,
} from '../../shared/contentEvents';

function isNoteChangedEvent(value: unknown): value is NoteChangedEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const event = value as NoteChangedEvent;
  return (
    typeof event.workspaceId === 'string' &&
    Array.isArray(event.changes) &&
    event.changes.every(isNoteMetadataChange)
  );
}

/**
 * Mirror BlockNote saves committed in the main process onto the canvas: card
 * titles, colours and bodies. Each revision is applied once; a stale or
 * repeated event is ignored.
 */
export function connectNoteChangeSync(target: Window = window): () => void {
  let workspaceId = '';
  const revisions = new Map<string, number>();
  const bodies = createNoteBodySync<ReturnType<typeof useCanvasStore.getState>>(
    (apply) => useCanvasStore.setState(apply)
  );
  const noteChanged = (event: Event) => {
    const payload: unknown = (event as CustomEvent).detail;
    if (!isNoteChangedEvent(payload)) {
      return;
    }
    if (payload.workspaceId !== workspaceId) {
      if (workspaceId) {
        revisions.clear();
        bodies.reset();
        clearBlockNotePrefetch();
      }
      workspaceId = payload.workspaceId;
    }
    const changes = payload.changes.filter((change) => {
      if (change.after.revision <= (revisions.get(change.id) ?? -1)) {
        return false;
      }
      revisions.set(change.id, change.after.revision);
      return true;
    });
    if (changes.length === 0) {
      return;
    }
    const projectable = publishNoteMetadataChanges(changes);
    for (const change of changes) {
      bodies.refresh(workspaceId, change);
    }
    useCanvasStore.setState((state) =>
      applyNoteMetadataChanges(state, projectable)
    );
  };
  target.addEventListener(NOTE_CHANGED_EVENT, noteChanged);
  return () => {
    bodies.reset();
    target.removeEventListener(NOTE_CHANGED_EVENT, noteChanged);
  };
}
