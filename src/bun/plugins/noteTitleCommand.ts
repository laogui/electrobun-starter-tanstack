import {
  createOperationContext,
  createPluginSession,
} from '../../shared/plugins/session';
import { ContentBatchStore } from './contentBatch';
import {
  type LoadedPluginDirectory,
  loadPluginDirectory,
} from './loadDirectory';
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

export async function runPluginCommandOnWorkspaceNotes(input: {
  commandId: string;
  grantedPermissions: Iterable<string>;
  loaded?: LoadedPluginDirectory;
  noteIds: string[];
  pluginDirectory?: string;
  workspacePath: string;
}): Promise<{
  operationId: string;
  titles: Record<string, string>;
}> {
  const loaded =
    input.loaded ??
    (input.pluginDirectory
      ? await loadPluginDirectory(input.pluginDirectory)
      : undefined);
  if (!loaded) {
    throw new Error('Plugin command package is unavailable.');
  }
  const command = loaded.manifest.contributes.commands.find(
    (entry) => entry.id === input.commandId
  );
  if (!command) {
    throw new Error(`Unknown plugin command: ${input.commandId}`);
  }
  const handlerPath = command.handler.split('#')[0] ?? '';
  const source = loaded.sources[handlerPath];
  if (source === undefined) {
    throw new Error(`Missing plugin command source: ${handlerPath}`);
  }
  const store = await ContentBatchStore.openNotes(input.workspacePath);
  const session = createPluginSession({
    manifest: loaded.manifest,
    workspaceId: input.workspacePath,
    context: createOperationContext(),
    grantedPermissions: input.grantedPermissions,
  });
  const operationId =
    session.context.kind === 'operation' ? session.context.operationId : '';
  await store.freezeSelection({
    operationId,
    entityIds: input.noteIds,
  });
  await runPluginCommand({
    session,
    commandId: input.commandId,
    source,
    probe: createContentBatchProbeHost(store, operationId, input.workspacePath),
  });
  return {
    operationId,
    titles: await titlesFor(store, input.noteIds),
  };
}

export async function runNormalizeTitlesOnWorkspaceNotes(input: {
  noteIds: string[];
  pluginDirectory: string;
  workspacePath: string;
}): Promise<{
  operationId: string;
  titles: Record<string, string>;
}> {
  return await runPluginCommandOnWorkspaceNotes({
    ...input,
    commandId: 'normalize-titles',
    grantedPermissions: ['content.selection.read', 'content.selection.write'],
  });
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
