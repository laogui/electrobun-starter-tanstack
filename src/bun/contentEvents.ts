import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type {
  NoteChangedEvent,
  NoteMetadataChange,
} from '../shared/contentEvents';
import { deferWorkspaceEffect } from './workspaceFileJournal';

type Listener = (event: NoteChangedEvent) => void;

const listeners = new Set<Listener>();

/** Stable id for a workspace folder; the renderer keys note caches by it. */
export function workspaceIdForPath(workspacePath: string): string {
  return createHash('sha256').update(resolve(workspacePath)).digest('hex');
}

/** One workspace per process (switching restarts), so no workspace key. */
export function subscribeNoteChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyNoteChanged(
  workspacePath: string,
  change: NoteMetadataChange
): void {
  if (deferWorkspaceEffect(() => notifyNoteChanged(workspacePath, change))) {
    return;
  }
  const event = {
    changes: [change],
    workspaceId: workspaceIdForPath(workspacePath),
  };
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      // Delivery failure must not turn an already committed save into a failure.
      console.warn('[content] Note change notification failed:', error);
    }
  }
}
