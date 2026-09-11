import {
  rpcCommitPluginInstall,
  rpcDisablePlugin,
  rpcEnablePlugin,
  rpcGetLocalHttpEndpoint,
  rpcListPluginPackages,
  rpcSaveManifest,
  rpcSearchCanvas,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import type { PluginContext } from '../../../../packages/plugin-sdk';
import type { PluginInstallPreview } from '../../../shared/plugins/management';
import { canvasTypeRegistry } from '../../extensions/registry';
import { pluginRuntime } from '../runtime';

declare global {
  var __trustedPluginCanvas: { app: PluginContext } | undefined;
}

const CANVAS_TYPE_ID = 't2.canvas/score-card';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isCanvasSearchResult(entry: unknown, instanceId: string): boolean {
  if (!(entry && typeof entry === 'object' && 'extension' in entry)) {
    return false;
  }
  const extension = entry.extension;
  return Boolean(
    extension &&
      typeof extension === 'object' &&
      'canvasTypeId' in extension &&
      extension.canvasTypeId === CANVAS_TYPE_ID &&
      'instanceId' in extension &&
      extension.instanceId === instanceId
  );
}

async function waitFor(check: () => boolean, label: string) {
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

export async function runT2CanvasProbe() {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('Packaged app required');
  }
  const request = async <T>(route: string, body?: unknown): Promise<T> => {
    const response = await fetch(
      `${endpoint.baseUrl}/plugin-t2-canvas/${route}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${endpoint.token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }
    );
    if (!response.ok) {
      throw new Error(`${route}: ${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };
  const checks: Record<string, boolean> = {};
  const report: Record<string, unknown> = {
    stage: 'T2/custom canvas types',
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
  try {
    check('releaseScheme', location.href.startsWith('views://mainview/'));
    const { phase } = await request<{ phase: 'initial' | 'restart' }>('config');
    await waitFor(
      () => Boolean(pluginRuntime.getSnapshot().workspaceId),
      'host snapshot'
    );
    if (phase === 'initial') {
      const preview = await request<PluginInstallPreview>('prepare', {});
      const installed = await rpcCommitPluginInstall(preview.transactionId);
      if (!installed.success) {
        throw new Error(installed.error);
      }
      const enabled = await rpcEnablePlugin({
        pluginId: installed.plugin.pluginId,
        digest: installed.plugin.digest,
      });
      if (!enabled.success) {
        throw new Error(enabled.error);
      }
    }
    await waitFor(
      () => Boolean(canvasTypeRegistry.get(CANVAS_TYPE_ID)),
      'public canvas type publication'
    );
    check(
      'pluginOwnedCanonicalId',
      pluginRuntime
        .getSnapshot()
        .canvasTypes.some(
          (entry) =>
            entry.pluginId === 't2.canvas' && entry.id === CANVAS_TYPE_ID
        )
    );
    await waitFor(
      () => useCanvasStore.getState()._hydrated,
      'canvas hydration'
    );
    if (phase === 'initial') {
      const type = canvasTypeRegistry.get(CANVAS_TYPE_ID)!;
      const state = type.createInitialState();
      const record = await useExtensionInstanceStore.getState().createInstance({
        canvasTypeId: CANVAS_TYPE_ID,
        dataVersion: type.dataVersion,
        presentation: type.buildPresentation(state),
        state,
      });
      check('createPersistentInstance', Boolean(record?.id));
      const nodeId = await useCanvasStore
        .getState()
        .createExtensionNode(CANVAS_TYPE_ID, record!.id, null, {
          anchorCenter: { x: 240, y: 180 },
          focusViewport: false,
          size: type.surface.defaultSize,
        });
      check('createPlacement', Boolean(nodeId));
      const canvas = useCanvasStore.getState();
      check(
        'persistPlacement',
        (await rpcSaveManifest(canvas.activeViewId, canvas.nodes, canvas.edges))
          .success
      );
      await waitFor(
        () => Boolean(document.querySelector('[data-t2-canvas-increment]')),
        'plugin card render'
      );
      const button = document.querySelector<HTMLButtonElement>(
        '[data-t2-canvas-increment]'
      );
      button?.click();
      await waitFor(() => {
        const current =
          useExtensionInstanceStore.getState().records[record!.id];
        return Boolean(
          current &&
            'state' in current &&
            (current.state as { count?: unknown }).count === 1
        );
      }, 'interactive state edit');
      await useExtensionInstanceStore.getState().saveNow(record!.id);
      const edited = useExtensionInstanceStore.getState().records[record!.id];
      check(
        'editPersistsSummary',
        Boolean(
          edited &&
            'state' in edited &&
            edited.revision === 2 &&
            edited.presentation.title === 'Release score: 1'
        )
      );
      const search = await rpcSearchCanvas('Release score count 1');
      check(
        'searchUsesHostSummary',
        Array.isArray(search) &&
          search.some((entry) => isCanvasSearchResult(entry, record!.id))
      );
      const installed = (await rpcListPluginPackages()).plugins.find(
        (entry) => entry.pluginId === 't2.canvas'
      );
      if (!installed) {
        throw new Error('Installed canvas plugin disappeared');
      }
      const disabled = await rpcDisablePlugin({
        pluginId: installed.pluginId,
        digest: installed.digest,
      });
      check('disablePlugin', disabled.success);
      await waitFor(
        () => !canvasTypeRegistry.get(CANVAS_TYPE_ID),
        'plugin type retirement'
      );
      await waitFor(
        () => document.body.textContent?.includes('Release score: 1') === true,
        'saved summary fallback'
      );
      check(
        'missingPluginKeepsOpaqueState',
        Boolean(
          useExtensionInstanceStore.getState().records[record!.id] &&
            document.body.textContent?.includes(
              'This canvas type is unavailable. Data is kept.'
            )
        )
      );
      const enabled = await rpcEnablePlugin({
        pluginId: installed.pluginId,
        digest: installed.digest,
      });
      check('reenablePlugin', enabled.success);
      await waitFor(
        () => Boolean(canvasTypeRegistry.get(CANVAS_TYPE_ID)),
        'plugin type republish'
      );
    } else {
      const extensionNode = useCanvasStore
        .getState()
        .nodes.find(
          (node) =>
            node.type === 'extension' &&
            node.data.canvasTypeId === CANVAS_TYPE_ID
        );
      const instanceId = extensionNode?.data.instanceId;
      check('restartRestoresPlacement', typeof instanceId === 'string');
      await waitFor(() => {
        const current =
          useExtensionInstanceStore.getState().records[instanceId as string];
        return Boolean(
          current &&
            'state' in current &&
            current.dataVersion === 2 &&
            (current.state as { unit?: unknown }).unit === 'points'
        );
      }, 'revision-checked state migration');
      const migrated =
        useExtensionInstanceStore.getState().records[instanceId as string];
      check(
        'migrationPersists',
        Boolean(
          migrated &&
            'state' in migrated &&
            migrated.revision === 3 &&
            migrated.presentation.subtitle === 'Migrated score'
        )
      );
      await waitFor(
        () => Boolean(document.querySelector('[data-t2-canvas-unit]')),
        'migrated card render'
      );
      const search = await rpcSearchCanvas('points');
      check(
        'migratedSummarySearchable',
        Array.isArray(search) &&
          search.some((entry) =>
            isCanvasSearchResult(entry, instanceId as string)
          )
      );
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
