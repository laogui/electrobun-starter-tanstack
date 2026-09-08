import {
  createOperationContext,
  createPluginSession,
} from '../../shared/plugins/session';
import { ContentBatchStore } from './contentBatch';
import { loadPluginDirectory } from './loadDirectory';
import { runPluginCommand } from './logicRuntime';
import { createContentBatchProbeHost } from './probeHost';

async function titlesFor(
  store: ContentBatchStore,
  noteIds: string[]
): Promise<Record<string, string>> {
  const titles: Record<string, string> = {};
  for (const noteId of noteIds) {
    const record = await store.get(noteId);
    if (record) {
      titles[noteId] = record.title;
    }
  }
  return titles;
}

export async function runNormalizeTitlesOnWorkspaceNotes(input: {
  noteIds: string[];
  pluginDirectory: string;
  workspacePath: string;
}): Promise<{
  operationId: string;
  titles: Record<string, string>;
}> {
  const loaded = await loadPluginDirectory(input.pluginDirectory);
  const store = await ContentBatchStore.openNotes(input.workspacePath);
  const session = createPluginSession({
    manifest: loaded.manifest,
    workspaceId: input.workspacePath,
    context: createOperationContext(),
    grantedPermissions: ['content.selection.read', 'content.selection.write'],
  });
  const operationId =
    session.context.kind === 'operation' ? session.context.operationId : '';
  await store.freezeSelection({
    operationId,
    entityIds: input.noteIds,
  });
  await runPluginCommand({
    session,
    commandId: 'normalize-titles',
    source: loaded.sources['main.js'] ?? '',
    probe: createContentBatchProbeHost(store, operationId, input.workspacePath),
  });
  return {
    operationId,
    titles: await titlesFor(store, input.noteIds),
  };
}

export async function undoNormalizeTitlesOnWorkspaceNotes(input: {
  noteIds: string[];
  operationId: string;
  workspacePath: string;
}): Promise<Record<string, string>> {
  const store = await ContentBatchStore.openNotes(input.workspacePath);
  await store.undo(input.operationId);
  return titlesFor(store, input.noteIds);
}

export async function redoNormalizeTitlesOnWorkspaceNotes(input: {
  noteIds: string[];
  operationId: string;
  workspacePath: string;
}): Promise<Record<string, string>> {
  const store = await ContentBatchStore.openNotes(input.workspacePath);
  await store.redo(input.operationId);
  return titlesFor(store, input.noteIds);
}
