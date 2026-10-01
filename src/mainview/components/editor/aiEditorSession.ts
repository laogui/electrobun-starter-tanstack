import type { BlockNoteEditor } from '@blocknote/core';
import { AIExtension } from '@blocknote/xl-ai';

const requests = new WeakMap<BlockNoteEditor, AbortController>();
export function getAIRequestSignal(editor: BlockNoteEditor): AbortSignal {
  let controller = requests.get(editor);
  if (!controller) {
    controller = new AbortController();
    requests.set(editor, controller);
  }
  return controller.signal;
}
export function abortAIEditorRequest(editor: BlockNoteEditor): Promise<void> {
  requests.get(editor)?.abort();
  return editor.getExtension(AIExtension)?.abort() ?? Promise.resolve();
}

/** Only closed sessions contain committed JSON. Suggestions live in ProseMirror marks. */
export function hasPendingAIChanges(editor: BlockNoteEditor): boolean {
  const ai = editor.getExtension(AIExtension);
  return Boolean(ai && ai.store.state.aiMenuState !== 'closed');
}

/** Subscribe before edits; accept/reject close after their transactions have completed. */
export function observeAIEditorSession(
  editor: BlockNoteEditor,
  onCommit: () => void,
  onPending: (pending: boolean) => void
) {
  const ai = editor.getExtension(AIExtension);
  if (!ai) {
    return () => undefined;
  }
  let pending = ai.store.state.aiMenuState !== 'closed';
  let disposed = false;
  let previousStatus =
    ai.store.state.aiMenuState === 'closed'
      ? 'closed'
      : ai.store.state.aiMenuState.status;
  const unsubscribe = ai.store.subscribe(() => {
    const state = ai.store.state.aiMenuState;
    const status = state === 'closed' ? 'closed' : state.status;
    if (status === 'thinking' && previousStatus !== 'thinking') {
      requests.set(editor, new AbortController());
    }
    previousStatus = status;
    const next = ai.store.state.aiMenuState !== 'closed';
    onPending(next);
    if (pending && !next && !disposed) {
      onCommit();
    }
    pending = next;
  });
  return () => {
    disposed = true;
    unsubscribe();
    // Abort synchronously signals the tools before its first await. Revert without
    // committing draft JSON; the note saver already holds the last committed body.
    abortAIEditorRequest(editor).catch(() => undefined);
    if (ai.store.state.aiMenuState !== 'closed') {
      ai.rejectChanges();
    }
  };
}
