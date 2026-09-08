import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ContentBatchStore } from '../../src/bun/plugins/contentBatch';
import { loadPluginDirectory } from '../../src/bun/plugins/loadDirectory';
import { runPluginCommand } from '../../src/bun/plugins/logicRuntime';
import { requireGhostboardPluginSamplesRoot } from '../../src/bun/plugins/outOfRepoSamples';
import {
  closePluginPanel,
  communicateWithPanel,
  openPluginPanel,
  reopenPluginPanel,
} from '../../src/bun/plugins/panelRuntime';
import { createContentBatchProbeHost } from '../../src/bun/plugins/probeHost';
import {
  createOperationContext,
  createPluginSession,
} from '../../src/shared/plugins/session';

const HOST_MARKERS = [
  'instanceId',
  'useCanvasStore',
  'electrobun',
  "from '@/",
  'from "@/',
  'node:fs',
  'src/bun',
  'src/mainview',
];

function forbiddenMarkers(source: string): string[] {
  return HOST_MARKERS.filter((marker) => source.includes(marker));
}

export async function runOutOfRepoSamplesProbe() {
  const samplesRoot = requireGhostboardPluginSamplesRoot();
  const title = await loadPluginDirectory(join(samplesRoot, 'title-tools'));
  const panel = await loadPluginDirectory(join(samplesRoot, 'notes-panel'));
  const store = new ContentBatchStore();
  store.seed([{ entityId: 'note_a', title: '  Hello   world ', revision: 3 }]);
  const session = createPluginSession({
    manifest: title.manifest,
    workspaceId: 'ws_out_of_repo',
    context: createOperationContext(),
    grantedPermissions: ['content.selection.read', 'content.selection.write'],
  });
  const operationId =
    session.context.kind === 'operation' ? session.context.operationId : '';
  await store.freezeSelection({
    operationId,
    entityIds: ['note_a'],
  });
  const command = await runPluginCommand({
    session,
    commandId: 'normalize-titles',
    source: title.sources['main.js'] ?? '',
    probe: createContentBatchProbeHost(store, operationId, 'ws_out_of_repo'),
  });
  const titleAfterApply = (await store.get('note_a'))?.title;
  await store.undo(operationId);
  const titleAfterUndo = (await store.get('note_a'))?.title;
  const opened = openPluginPanel({
    manifest: panel.manifest,
    workspaceId: 'ws_out_of_repo',
    viewId: 'notes',
  });
  const firstView =
    opened.session.context.kind === 'view'
      ? opened.session.context.viewSessionId
      : '';
  communicateWithPanel(opened, { ping: true });
  const reopened = reopenPluginPanel(opened);
  const secondView =
    reopened.session.context.kind === 'view'
      ? reopened.session.context.viewSessionId
      : '';
  closePluginPanel(reopened);

  return {
    date: new Date().toISOString(),
    bun: Bun.version,
    samplesRoot,
    insideHostRepo: samplesRoot.includes('electrobun-starter-tanstack'),
    command: {
      id: title.manifest.id,
      directory: title.directory,
      hostMarkers: forbiddenMarkers(title.sources['main.js'] ?? ''),
      contextKind: session.context.kind,
      hasInstanceId: 'instanceId' in session.context,
      preview: command.preview,
      titleAfterApply,
      titleAfterUndo,
    },
    panel: {
      id: panel.manifest.id,
      directory: panel.directory,
      hostMarkers: forbiddenMarkers(panel.sources['panel.html'] ?? ''),
      firstViewSessionId: firstView,
      secondViewSessionId: secondView,
      sessionChanged: firstView !== secondView,
      contextKind: opened.session.context.kind,
      hasInstanceId: 'instanceId' in opened.session.context,
    },
  };
}

if (import.meta.main) {
  const evidence = await runOutOfRepoSamplesProbe();
  const outputDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../docs/features/In Progress/plugin-container-evidence/2026-09-08'
  );
  await mkdir(outputDir, { recursive: true });
  const output = join(outputDir, 'out-of-repo-samples.json');
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('OUT_OF_REPO_SAMPLES_RESULT', output);
  console.log(JSON.stringify(evidence, null, 2));
  if (
    evidence.insideHostRepo ||
    evidence.command.hostMarkers.length > 0 ||
    evidence.panel.hostMarkers.length > 0 ||
    evidence.command.hasInstanceId ||
    evidence.panel.hasInstanceId ||
    !evidence.panel.sessionChanged ||
    evidence.command.titleAfterApply !== 'Hello world' ||
    evidence.command.titleAfterUndo !== '  Hello   world '
  ) {
    process.exitCode = 1;
  }
}
