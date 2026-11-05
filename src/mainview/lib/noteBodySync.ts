import type { NoteMetadataChange } from '../../shared/contentEvents';
import { invalidateBlockNotePrefetch } from './blockNotePrefetch';
import { applyNoteMetadataChanges } from './noteMetadataProjection';
import { rpcLoadBlockNote } from './rpc';

export interface NoteBodySnapshot {
  before: NoteMetadataChange['before'];
  blocks: unknown[];
  color: string;
  id: string;
  preview: { html: string; excerpt: string; blocks: number; version: number };
  revision: number;
  text: string;
  title: string;
}
interface Editor {
  apply(snapshot: NoteBodySnapshot): void;
  canApply(snapshot: NoteBodySnapshot): boolean;
}
const editors = new Map<string, Set<Editor>>();
export function registerNoteBodyEditor(
  id: string,
  editor: Editor,
  workspaceId: string
): () => void {
  const key = `${workspaceId}\0${id}`;
  const group = editors.get(key) ?? new Set<Editor>();
  group.add(editor);
  editors.set(key, group);
  return () => {
    group.delete(editor);
    if (!group.size) {
      editors.delete(key);
    }
  };
}

interface State {
  focusedFolder: { data: Record<string, unknown> } | null;
  focusedNode: { data: Record<string, unknown> } | null;
  nodes: { data: Record<string, unknown> }[];
}

/** One coordinator per host bridge. Invalidate before any workspace switch. */
export function createNoteBodySync<S extends State>(
  project: (apply: (state: S) => S) => void
) {
  const pending = new Map<string, NoteMetadataChange>();
  let epoch = 0;
  const refresh = (workspaceId: string, incoming: NoteMetadataChange) => {
    // Any external revision makes a prefetched body stale.
    invalidateBlockNotePrefetch(incoming.id);
    const previous = pending.get(incoming.id);
    if (incoming.metadataOnly && !previous) {
      return;
    }
    const change = {
      ...incoming,
      before: previous?.before ?? incoming.before,
      metadataOnly: false,
    };
    pending.set(change.id, change);
    const started = epoch;
    rpcLoadBlockNote(change.id, workspaceId)
      .then((response) => {
        if (epoch !== started || pending.get(change.id) !== change) {
          return;
        }
        if (
          !response.success ||
          response.workspaceId !== workspaceId ||
          response.revision !== change.after.revision ||
          !Array.isArray(response.blocks) ||
          !response.preview ||
          typeof response.text !== 'string'
        ) {
          return;
        }
        const snapshot: NoteBodySnapshot = {
          ...change.after,
          before: change.before,
          id: change.id,
          blocks: response.blocks,
          preview: response.preview,
          text: response.text,
        };
        const participants = [
          ...(editors.get(`${workspaceId}\0${change.id}`) ?? []),
        ];
        if (participants.some((editor) => !editor.canApply(snapshot))) {
          pending.delete(change.id);
          return;
        }
        for (const editor of participants) {
          editor.apply(snapshot);
        }
        project((state) =>
          applyNoteMetadataChanges(state, [change], {
            content: snapshot.text,
            editor: 'blocknote',
            previewHtml: snapshot.preview.html,
            previewExcerpt: snapshot.preview.excerpt,
            previewBlocks: snapshot.preview.blocks,
            previewVersion: snapshot.preview.version,
          })
        );
        pending.delete(change.id);
      })
      .catch((error) => {
        if (epoch === started && pending.get(change.id) === change) {
          console.warn('[blocknote] Failed to refresh external body:', error);
        }
      });
  };
  return {
    refresh,
    reset() {
      epoch += 1;
      pending.clear();
    },
  };
}
