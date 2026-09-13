import {
  rpcCommitPluginInstall,
  rpcDisablePlugin,
  rpcEnablePlugin,
  rpcListPluginPackages,
  rpcSaveManifest,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import type { PluginContext } from '../../../../packages/plugin-sdk';
import type {
  InstalledPluginSummary,
  PluginInstallPreview,
} from '../../../shared/plugins/management';
import { canvasTypeRegistry } from '../../extensions/registry';
import { pluginRuntime } from '../runtime';

export type T3ExitPackageName = 'canvas' | 'command' | 'importer' | 'panel';

interface ExitEvidence {
  apps: Partial<Record<T3ExitPackageName, PluginContext>>;
  commandRuns: number;
}

declare global {
  var __ghostboardT3Exit: ExitEvidence | undefined;
}

interface ExitProbeOptions {
  check: (name: string, value: boolean) => void;
  phase: 'download' | 'local' | 'restart';
  request: <T>(route: string, body?: unknown) => Promise<T>;
  waitFor: (check: () => boolean, label: string) => Promise<void>;
}

const exitPackages: ReadonlyArray<{
  capabilities: string[];
  contribution: T3ExitPackageName;
  id: string;
}> = [
  { capabilities: [], contribution: 'command', id: 't3.exit.command' },
  { capabilities: [], contribution: 'panel', id: 't3.exit.panel' },
  { capabilities: [], contribution: 'canvas', id: 't3.exit.canvas' },
  {
    capabilities: ['files'],
    contribution: 'importer',
    id: 't3.exit.importer',
  },
];

function contributionCount(
  pluginId: string,
  contribution: T3ExitPackageName
): number {
  const snapshot = pluginRuntime.getSnapshot();
  const collection =
    contribution === 'command'
      ? snapshot.commands
      : contribution === 'panel'
        ? snapshot.panels
        : contribution === 'canvas'
          ? snapshot.canvasTypes
          : snapshot.importers;
  return collection.filter((item) => item.pluginId === pluginId).length;
}

function hasExactIndependentContributions(): boolean {
  return exitPackages.every(({ contribution, id }) =>
    exitPackages.every(
      ({ contribution: candidate }) =>
        contributionCount(id, candidate) ===
        (candidate === contribution ? 1 : 0)
    )
  );
}

function allRunning(): boolean {
  const snapshot = pluginRuntime.getSnapshot();
  return exitPackages.every(({ id }) =>
    snapshot.plugins.some(
      (plugin) => plugin.pluginId === id && plugin.status === 'running'
    )
  );
}

async function installPackages(options: ExitProbeOptions) {
  const installed: InstalledPluginSummary[] = [];
  for (const item of exitPackages) {
    const preview = await options.request<PluginInstallPreview>(
      options.phase === 'download' ? 'prepare-url' : 'prepare-file',
      { package: item.contribution }
    );
    options.check(
      `exit-${item.contribution}-preview`,
      preview.plugin.id === item.id &&
        preview.plugin.signatureStatus === 'unsigned' &&
        preview.plugin.capabilities.join(',') === item.capabilities.join(',') &&
        preview.source.kind === (options.phase === 'download' ? 'url' : 'file')
    );
    const committed = await rpcCommitPluginInstall(preview.transactionId);
    if (!committed.success) {
      throw new Error(committed.error);
    }
    const stored = (await rpcListPluginPackages()).plugins.find(
      (plugin) => plugin.pluginId === item.id
    );
    options.check(
      `exit-${item.contribution}-commit-disabled`,
      Boolean(stored && !stored.enabled && stored.status === 'stored')
    );
    const enabled = await rpcEnablePlugin({
      digest: committed.plugin.digest,
      pluginId: committed.plugin.pluginId,
    });
    if (!enabled.success) {
      throw new Error(enabled.error);
    }
    installed.push(enabled.plugin);
  }
  return installed;
}

async function exerciseCommand(options: ExitProbeOptions) {
  const before = globalThis.__ghostboardT3Exit?.commandRuns ?? 0;
  await pluginRuntime.runCommand('t3.exit.command', 'record');
  options.check(
    'exit-command-runs',
    globalThis.__ghostboardT3Exit?.commandRuns === before + 1
  );
}

async function exercisePanel(options: ExitProbeOptions) {
  pluginRuntime.openPanel('t3.exit.panel', 'status');
  await options.waitFor(
    () =>
      document.querySelector('[data-t3-exit-panel]')?.textContent ===
      'Independent panel is running',
    'independent panel render'
  );
  options.check('exit-panel-renders', true);
  pluginRuntime.closePanel('t3.exit.panel', 'status');
  await options.waitFor(
    () => !document.querySelector('[data-t3-exit-panel]'),
    'independent panel cleanup'
  );
}

async function exerciseCanvas(options: ExitProbeOptions) {
  const canvasTypeId = 't3.exit.canvas/counter';
  const type = canvasTypeRegistry.get(canvasTypeId);
  if (!type) {
    throw new Error('Independent canvas type was not published');
  }
  await options.waitFor(
    () => useCanvasStore.getState()._hydrated,
    'independent canvas hydration'
  );
  const state = type.createInitialState();
  const record = await useExtensionInstanceStore.getState().createInstance({
    canvasTypeId,
    dataVersion: type.dataVersion,
    presentation: type.buildPresentation(state),
    state,
  });
  options.check('exit-canvas-instance', Boolean(record?.id));
  const nodeId = await useCanvasStore
    .getState()
    .createExtensionNode(canvasTypeId, record!.id, null, {
      anchorCenter: { x: 360, y: 260 },
      focusViewport: false,
      size: type.surface.defaultSize,
    });
  options.check('exit-canvas-placement', Boolean(nodeId));
  await options.waitFor(
    () => Boolean(document.querySelector('[data-t3-exit-canvas]')),
    'independent canvas render'
  );
  document.querySelector<HTMLButtonElement>('[data-t3-exit-canvas]')?.click();
  await options.waitFor(() => {
    const current = useExtensionInstanceStore.getState().records[record!.id];
    return Boolean(
      current &&
        'state' in current &&
        (current.state as { count?: unknown }).count === 1
    );
  }, 'independent canvas interaction');
  await useExtensionInstanceStore.getState().saveNow(record!.id);
  const edited = useExtensionInstanceStore.getState().records[record!.id];
  options.check(
    'exit-canvas-persists',
    Boolean(
      edited &&
        'state' in edited &&
        edited.presentation.title === 'Independent count: 1'
    )
  );
  useCanvasStore.getState().deleteNodes([nodeId!]);
  const canvas = useCanvasStore.getState();
  options.check(
    'exit-canvas-cleanup',
    (await rpcSaveManifest(canvas.activeViewId, canvas.nodes, canvas.edges))
      .success
  );
}

async function exerciseImporter(options: ExitProbeOptions) {
  await options.request('select', { scenario: 'exit-valid' });
  await pluginRuntime.startImporterSession('t3.exit.importer', 'notes-csv');
  let session = pluginRuntime.getSnapshot().importSession;
  if (session?.status === 'configuring' && session.canPrepare) {
    await pluginRuntime.prepareImporterSession(session.operationId);
  }
  session = pluginRuntime.getSnapshot().importSession;
  options.check(
    'exit-importer-preview',
    session?.status === 'preview' &&
      session.notes.length === 1 &&
      session.notes[0]?.title === 'Independent package'
  );
  const operationId = session!.operationId;
  await pluginRuntime.confirmImporterSession(operationId);
  const app = globalThis.__ghostboardT3Exit?.apps.importer;
  if (!app) {
    throw new Error('Independent importer context is unavailable');
  }
  const imported = await app.content.query({
    limit: 10,
    text: 'Independent package',
  });
  options.check(
    'exit-importer-commits',
    imported.items.length === 1 &&
      imported.items[0]?.title === 'Independent package'
  );
  const undone = await app.content.undo(operationId, {
    operationId: `t3-exit-importer-cleanup-${options.phase}`,
  });
  options.check(
    'exit-importer-undo',
    undone.removedIds?.length === 1 &&
      (await app.content.query({ limit: 10, text: 'Independent package' }))
        .items.length === 0
  );
}

async function verifyDisableIsolation(
  installed: InstalledPluginSummary[],
  options: ExitProbeOptions
) {
  for (const item of exitPackages) {
    const plugin = installed.find(
      (candidate) => candidate.pluginId === item.id
    );
    if (!plugin) {
      throw new Error(`Missing installed summary for ${item.id}`);
    }
    const disabled = await rpcDisablePlugin({
      digest: plugin.digest,
      pluginId: plugin.pluginId,
    });
    if (!disabled.success) {
      throw new Error(disabled.error);
    }
    await options.waitFor(
      () =>
        contributionCount(item.id, item.contribution) === 0 &&
        exitPackages
          .filter((candidate) => candidate.id !== item.id)
          .every(
            (candidate) =>
              contributionCount(candidate.id, candidate.contribution) === 1
          ),
      `disable isolation for ${item.id}`
    );
    options.check(`exit-${item.contribution}-isolated-disable`, true);
    const enabled = await rpcEnablePlugin({
      digest: plugin.digest,
      pluginId: plugin.pluginId,
    });
    if (!enabled.success) {
      throw new Error(enabled.error);
    }
    await options.waitFor(
      () => contributionCount(item.id, item.contribution) === 1,
      `reenable ${item.id}`
    );
  }
}

export async function verifyT3ExitPackages(options: ExitProbeOptions) {
  const installed =
    options.phase === 'restart' ? [] : await installPackages(options);
  await options.waitFor(
    () => allRunning() && hasExactIndependentContributions(),
    'four independent package activations'
  );
  options.check('four-independent-packages-running', true);
  options.check('four-packages-one-contribution-each', true);
  await options.waitFor(
    () =>
      exitPackages.every(({ contribution }) =>
        Boolean(globalThis.__ghostboardT3Exit?.apps[contribution])
      ),
    'independent package contexts'
  );
  await exerciseCommand(options);
  await exercisePanel(options);
  if (options.phase !== 'restart') {
    await exerciseCanvas(options);
    await exerciseImporter(options);
    await verifyDisableIsolation(installed, options);
  }
}
