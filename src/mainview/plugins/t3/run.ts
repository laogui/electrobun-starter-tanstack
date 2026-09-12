import {
  rpcCommitPluginInstall,
  rpcDisablePlugin,
  rpcEnablePlugin,
  rpcGetLocalHttpEndpoint,
  rpcListPluginPackages,
  rpcSaveManifest,
  rpcScanUnlinkedNotes,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import type { PluginContext } from '../../../../packages/plugin-sdk';
import type { PluginInstallPreview } from '../../../shared/plugins/management';
import { pluginRuntime } from '../runtime';
import { verifyT3ExitPackages } from './exitPackages';

interface OperationRecord {
  ids: string[];
  operationId: string;
}

interface ProbeConfig {
  operation: OperationRecord | null;
  phase: 'download' | 'local' | 'restart';
}

declare global {
  var __ghostboardT3Combined: Readonly<{ app: PluginContext }> | undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out: ${label}; ${JSON.stringify(pluginRuntime.getSnapshot())}`
      );
    }
    await sleep(30);
  }
}

function importedItems(app: PluginContext) {
  return app.content
    .query({ text: 'First, quoted', limit: 100 })
    .then(({ items }) =>
      items.filter((item) => item.title === 'First, quoted')
    );
}

export async function runT3Probe(): Promise<void> {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('Packaged app required');
  }
  const request = async <T>(route: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${endpoint.baseUrl}/plugin-t3/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${route}: ${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };
  const checks: Record<string, boolean> = {};
  const report: Record<string, unknown> = {
    stage: 'T3/importer and final-user distribution',
    passed: false,
    checks,
    startedAt: new Date().toISOString(),
    page: location.href,
    userAgent: navigator.userAgent,
  };
  const check = (name: string, value: boolean) => {
    checks[name] = value;
    if (!value) {
      throw new Error(`Failed: ${name}`);
    }
  };
  const select = (scenario: string) =>
    request<{ selected: string }>('select', { scenario });
  const startImporter = async () => {
    await pluginRuntime.startImporterSession('t3.combined', 'notes-csv');
    const session = pluginRuntime.getSnapshot().importSession;
    if (session?.status === 'configuring' && session.canPrepare) {
      await pluginRuntime.prepareImporterSession(session.operationId);
    }
    return pluginRuntime.getSnapshot().importSession;
  };
  const waitForCombined = async () => {
    await waitFor(
      () =>
        pluginRuntime
          .getSnapshot()
          .plugins.some(
            (plugin) =>
              plugin.pluginId === 't3.combined' && plugin.status === 'running'
          ),
      'combined plugin activation'
    );
    const snapshot = pluginRuntime.getSnapshot();
    check(
      'fourContributionTypes',
      snapshot.commands.filter((item) => item.pluginId === 't3.combined')
        .length === 1 &&
        snapshot.panels.filter((item) => item.pluginId === 't3.combined')
          .length === 1 &&
        snapshot.canvasTypes.filter((item) => item.pluginId === 't3.combined')
          .length === 1 &&
        snapshot.importers.filter((item) => item.pluginId === 't3.combined')
          .length === 1
    );
    await waitFor(
      () => Boolean(globalThis.__ghostboardT3Combined),
      'combined plugin probe context'
    );
    return globalThis.__ghostboardT3Combined!.app;
  };
  const install = async (route: 'prepare-file' | 'prepare-url') => {
    const preview = await request<PluginInstallPreview>(route, {});
    check(
      'packagePreview',
      preview.plugin.id === 't3.combined' &&
        preview.plugin.signatureStatus === 'unverified' &&
        preview.plugin.capabilities.includes('files') &&
        preview.source.kind === (route === 'prepare-file' ? 'file' : 'url')
    );
    const committed = await rpcCommitPluginInstall(preview.transactionId);
    if (!committed.success) {
      throw new Error(committed.error);
    }
    const stored = (await rpcListPluginPackages()).plugins.find(
      (plugin) => plugin.pluginId === 't3.combined'
    );
    check(
      'commitDoesNotEnable',
      Boolean(stored && !stored.enabled && stored.status === 'stored')
    );
    const enabled = await rpcEnablePlugin({
      digest: committed.plugin.digest,
      pluginId: committed.plugin.pluginId,
    });
    if (!enabled.success) {
      throw new Error(enabled.error);
    }
    return enabled.plugin;
  };
  try {
    check('releaseScheme', location.href.startsWith('views://mainview/'));
    const config = await request<ProbeConfig>('config');
    await waitFor(
      () => Boolean(pluginRuntime.getSnapshot().workspaceId),
      'host snapshot'
    );
    await verifyT3ExitPackages({
      check,
      phase: config.phase,
      request,
      waitFor,
    });
    if (config.phase === 'restart') {
      check(
        'operationPersisted',
        Boolean(
          config.operation?.operationId.startsWith('plgimport_') &&
            config.operation.ids.length === 2
        )
      );
      const app = await waitForCombined();
      const operation = config.operation!;
      check(
        'notesSurviveRestart',
        (await app.content.getMany(operation.ids)).every(Boolean)
      );
      const undone = await app.content.undo(operation.operationId, {
        operationId: 't3-restart-undo',
      });
      check(
        'durableUndo',
        undone.removedIds?.length === 2 &&
          (await app.content.getMany(operation.ids)).every(
            (item) => item === null
          )
      );
      check(
        'undoUpdatesLibrary',
        !(await rpcScanUnlinkedNotes()).some((entry) =>
          operation.ids.includes(entry.noteId ?? '')
        )
      );
      const redone = await app.content.redo(operation.operationId, {
        operationId: 't3-restart-redo',
      });
      check(
        'durableRedo',
        redone.items.length === 2 &&
          redone.items.every((item) => item.revision === 3) &&
          redone.items
            .map((item) => item.id)
            .sort()
            .join(',') === [...operation.ids].sort().join(',')
      );
    } else {
      const installed = await install(
        config.phase === 'local' ? 'prepare-file' : 'prepare-url'
      );
      let app = await waitForCombined();
      check(
        'workbenchDiscoversImporter',
        document.body.textContent?.includes('Import notes from CSV') === true
      );
      await select('cancel');
      await startImporter();
      check(
        'pickerCancelClearsSession',
        !pluginRuntime.getSnapshot().importSession
      );

      if (config.phase === 'local') {
        for (const [scenario, message] of [
          ['invalid-utf8', 'valid UTF-8'],
          ['oversized', 'limited to'],
          ['too-many', 'more than 5,000 notes'],
        ] as const) {
          await select(scenario);
          await startImporter();
          const failed = pluginRuntime.getSnapshot().importSession;
          check(
            `reject-${scenario}`,
            failed?.status === 'failed' &&
              failed.error?.includes(message) === true &&
              failed.notes.length === 0
          );
          pluginRuntime.cancelImporterSession(failed!.operationId);
        }

        await select('missing-title');
        await pluginRuntime.startImporterSession('t3.combined', 'notes-csv');
        const unmapped = pluginRuntime.getSnapshot().importSession!;
        check(
          'reject-missing-title',
          unmapped.status === 'configuring' &&
            !unmapped.canPrepare &&
            unmapped.mapping?.title === null
        );
        pluginRuntime.cancelImporterSession(unmapped.operationId);

        await select('segmented');
        const segmented = (await startImporter())!;
        check(
          'segmentedPreview',
          segmented.status === 'preview' &&
            segmented.totalNotes === 205 &&
            segmented.segments.length === 3 &&
            segmented.segments
              .map((segment) => segment.end - segment.start + 1)
              .join(',') === '100,100,5'
        );
        const originalFetch = globalThis.fetch;
        let loseSecondSegmentResponse = true;
        const interceptingSegmentFetch = async (
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1]
        ) => {
          const url = input instanceof Request ? input.url : String(input);
          const body =
            typeof init?.body === 'string'
              ? (JSON.parse(init.body) as {
                  action?: string;
                  operationId?: string;
                })
              : {};
          if (
            loseSecondSegmentResponse &&
            new URL(url).pathname === '/plugins/content' &&
            body.action === 'create' &&
            body.operationId?.endsWith('_segment_2')
          ) {
            loseSecondSegmentResponse = false;
            await originalFetch(input, init);
            return Response.json(
              { code: 'transport-error', error: 'Synthetic segment loss' },
              { status: 503 }
            );
          }
          return originalFetch(input, init);
        };
        globalThis.fetch = Object.assign(interceptingSegmentFetch, {
          preconnect: originalFetch.preconnect,
        });
        try {
          await pluginRuntime.confirmImporterSession(segmented.operationId);
        } finally {
          globalThis.fetch = originalFetch;
        }
        const paused = pluginRuntime.getSnapshot().importSession!;
        check(
          'segmentedFailureRange',
          paused.status === 'failed' &&
            paused.completedNotes === 100 &&
            paused.canConfirm &&
            paused.canRollback &&
            paused.segments[0]?.status === 'completed' &&
            paused.segments[1]?.status === 'failed' &&
            (await app.content.query({ text: 'Segmented', limit: 500 })).items
              .length === 200
        );
        await pluginRuntime.confirmImporterSession(segmented.operationId);
        const completed = pluginRuntime.getSnapshot().importSession!;
        const importedSegments = (
          await app.content.query({ text: 'Segmented', limit: 500 })
        ).items;
        check(
          'segmentedRetryContinues',
          completed.status === 'completed' &&
            completed.completedNotes === 205 &&
            importedSegments.length === 205
        );
        const edited = importedSegments.find(
          (item) => item.title === 'Segmented 101'
        )!;
        await app.content.updateMany(
          [
            {
              changes: { title: 'Segmented 101 user edit' },
              expectedRevision: edited.revision!,
              id: edited.id,
            },
          ],
          { label: 'Simulate later user edit', operationId: 't3-user-edit' }
        );
        await pluginRuntime.rollbackImporterSession(segmented.operationId);
        const rolledBack = pluginRuntime.getSnapshot().importSession!;
        const preserved = (
          await app.content.query({ text: 'Segmented', limit: 500 })
        ).items;
        check(
          'conflictSafeSegmentRollback',
          rolledBack.status === 'rollback-conflict' &&
            rolledBack.completedNotes === 100 &&
            rolledBack.segments[0]?.status === 'rolled-back' &&
            rolledBack.segments[1]?.status === 'rollback-conflict' &&
            rolledBack.segments[2]?.status === 'rolled-back' &&
            preserved.length === 100 &&
            preserved.some((item) => item.title === 'Segmented 101 user edit')
        );
        pluginRuntime.cancelImporterSession(segmented.operationId);

        await select('valid');
        const cancellable = (await startImporter())!;
        check(
          'hostPreview',
          cancellable.status === 'preview' &&
            cancellable.file?.name === 'selected.csv' &&
            cancellable.notes.length === 2 &&
            cancellable.warnings[0] === 'Skipped 1 empty row(s)'
        );
        await waitFor(
          () =>
            document.body.textContent?.includes('First, quoted') === true &&
            document.body.textContent?.includes('Skipped 1 empty row(s)') ===
              true,
          'Workbench preview rendering'
        );
        pluginRuntime.cancelImporterSession(cancellable.operationId);
        check(
          'previewCancelWritesNothing',
          (await importedItems(app)).length === 0
        );

        await select('valid');
        const placeable = (await startImporter())!;
        const canvas = useCanvasStore.getState();
        check('targetCanvasHydrated', canvas._hydrated);
        pluginRuntime.updateImporterPlacement(placeable.operationId, {
          mode: 'canvas',
          strategy: 'grid',
          viewId: canvas.activeViewId,
        });
        await pluginRuntime.confirmImporterSession(placeable.operationId);
        const placedNotes = (
          await app.content.query({ limit: 500 })
        ).items.filter((item) =>
          ['First, quoted', 'Second'].includes(item.title)
        );
        const placedNoteIds = new Set(placedNotes.map((item) => item.id));
        const placedNodeIds = useCanvasStore
          .getState()
          .nodes.filter((node) =>
            placedNoteIds.has(
              String((node.data as Record<string, unknown>).noteId ?? '')
            )
          )
          .map((node) => node.id);
        check(
          'canvasPlacement',
          !pluginRuntime.getSnapshot().importSession &&
            placedNotes.length === 2 &&
            placedNodeIds.length === 2 &&
            placedNodeIds.every((id) =>
              id.startsWith(`node-${placeable.operationId}-`)
            )
        );
        useCanvasStore.getState().deleteNodes(placedNodeIds);
        const placementCleanup = useCanvasStore.getState();
        check(
          'persistCanvasPlacementCleanup',
          (
            await rpcSaveManifest(
              placementCleanup.activeViewId,
              placementCleanup.nodes,
              placementCleanup.edges
            )
          ).success
        );
        const removedPlacementBatch = await app.content.undo(
          placeable.operationId,
          { operationId: 't3-canvas-placement-cleanup' }
        );
        check(
          'canvasPlacementCleanup',
          removedPlacementBatch.removedIds?.length === 2 &&
            (await importedItems(app)).length === 0
        );

        await select('wait');
        await pluginRuntime.startImporterSession('t3.combined', 'notes-csv');
        const configurable = pluginRuntime.getSnapshot().importSession!;
        const parsing = pluginRuntime.prepareImporterSession(
          configurable.operationId
        );
        await waitFor(
          () => pluginRuntime.getSnapshot().importSession?.status === 'parsing',
          'blocked importer parse'
        );
        const retiredApp = app;
        const disabled = await rpcDisablePlugin({
          digest: installed.digest,
          pluginId: installed.pluginId,
        });
        if (!disabled.success) {
          throw new Error(disabled.error);
        }
        await waitFor(
          () =>
            !pluginRuntime
              .getSnapshot()
              .plugins.some((plugin) => plugin.pluginId === 't3.combined'),
          'workspace disable'
        );
        await parsing;
        check(
          'disableCancelsParse',
          retiredApp.signal.aborted &&
            pluginRuntime.getSnapshot().importSession === null
        );
        const reenabled = await rpcEnablePlugin({
          digest: installed.digest,
          pluginId: installed.pluginId,
        });
        if (!reenabled.success) {
          throw new Error(reenabled.error);
        }
        app = await waitForCombined();
      }

      await select('valid');
      await startImporter();
      const operationId =
        pluginRuntime.getSnapshot().importSession?.operationId ?? '';
      check('stableOperationCreated', operationId.startsWith('plgimport_'));
      if (config.phase === 'local') {
        const originalFetch = globalThis.fetch;
        let intercept = true;
        const interceptingFetch = async (
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1]
        ) => {
          const url = input instanceof Request ? input.url : String(input);
          if (
            intercept &&
            new URL(url).pathname === '/plugins/content' &&
            init?.method === 'POST'
          ) {
            intercept = false;
            await originalFetch(input, init);
            return Response.json(
              { code: 'transport-error', error: 'Synthetic lost response' },
              { status: 503 }
            );
          }
          return originalFetch(input, init);
        };
        globalThis.fetch = Object.assign(interceptingFetch, {
          preconnect: originalFetch.preconnect,
        });
        try {
          await pluginRuntime.confirmImporterSession(operationId);
        } finally {
          globalThis.fetch = originalFetch;
        }
        const retry = pluginRuntime.getSnapshot().importSession!;
        check(
          'uncertainFailureRetainsPreview',
          retry.status === 'failed' &&
            retry.operationId === operationId &&
            retry.notes.length === 2 &&
            retry.canConfirm
        );
        check(
          'firstRequestActuallyCommitted',
          (await importedItems(app)).length === 1
        );
        await pluginRuntime.confirmImporterSession(operationId);
        check(
          'retryDeduplicatedAndClosed',
          pluginRuntime.getSnapshot().importSession === null &&
            (await importedItems(app)).length === 1
        );
        const created = (await app.content.query({ limit: 500 })).items.filter(
          (item) => ['First, quoted', 'Second'].includes(item.title)
        );
        check('twoNotesCreated', created.length === 2);
        const library = await rpcScanUnlinkedNotes();
        check(
          'notesDiscoverableInLibrary',
          created.every((item) =>
            library.some((entry) => entry.noteId === item.id)
          )
        );
        await request('record-operation', {
          ids: created.map((item) => item.id),
          operationId,
        });
      } else {
        pluginRuntime.cancelImporterSession(operationId);
        check(
          'downloadPreviewCanCancel',
          !pluginRuntime.getSnapshot().importSession
        );
      }
    }
    report.passed = true;
  } catch (error) {
    report.error =
      error instanceof Error
        ? `${error.message}\n${error.stack ?? ''}`
        : String(error);
    report.runtime = pluginRuntime.getSnapshot();
  }
  report.finishedAt = new Date().toISOString();
  await request('report', report);
}
