import {
  rpcCommitPluginInstall,
  rpcCreateNote,
  rpcDisablePlugin,
  rpcEnablePlugin,
  rpcGetLocalHttpEndpoint,
  rpcListPluginPackages,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import type {
  ContentChangedEvent,
  JsonValue,
  PluginContext,
} from '../../../../packages/plugin-sdk';
import type { PluginInstallPreview } from '../../../shared/plugins/management';
import { pluginRuntime } from '../runtime';

declare global {
  var __trustedPluginA4:
    | {
        app: PluginContext;
        ticks: number;
        pastTicks: number;
        activated: number;
        content: ContentChangedEvent[];
        selection: { placementIds: readonly string[] }[];
        previousWorkspace?: JsonValue;
        previousApp?: JsonValue;
      }
    | undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check: () => boolean, label: string) {
  const deadline = Date.now() + 12_000;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out: ${label}; ${JSON.stringify(pluginRuntime.getSnapshot())}`
      );
    }
    await sleep(30);
  }
}

export async function runT2A4Probe() {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('A4 requires the packaged desktop app');
  }
  const request = async <T>(route: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${endpoint.baseUrl}/plugin-t2-a4/${route}`, {
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
    stage: 'T2/A4 only',
    passed: false,
    checks,
    startedAt: new Date().toISOString(),
    page: location.href,
    userAgent: navigator.userAgent,
  };
  const check = (name: string, passed: boolean) => {
    checks[name] = passed;
    if (!passed) {
      throw new Error(`Failed: ${name}`);
    }
  };
  try {
    check('releaseScheme', location.href.startsWith('views://mainview/'));
    const { phase } = await request<{ phase: string }>('config');
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
    }
    const list = await rpcListPluginPackages();
    const plugin = list.plugins.find((item) => item.pluginId === 't2.a4');
    if (!plugin) {
      throw new Error('Fixture not connected');
    }
    if (phase === 'workspace') {
      check(
        'newWorkspaceNotEnabled',
        !(plugin.enabled || globalThis.__trustedPluginA4)
      );
    }
    if (!plugin.enabled) {
      const result = await rpcEnablePlugin({
        pluginId: plugin.pluginId,
        digest: plugin.digest,
      });
      if (!result.success) {
        throw new Error(result.error);
      }
    }
    await waitFor(
      () =>
        pluginRuntime
          .getSnapshot()
          .commands.some((item) => item.pluginId === 't2.a4'),
      'plugin activation'
    );
    const probe = globalThis.__trustedPluginA4!;
    check('activationEvent', probe.activated === 1);
    report.workspaceId = probe.app.workspaceId;
    if (phase === 'initial' || phase === 'workspace') {
      check('emptyWorkspaceKV', probe.previousWorkspace === undefined);
    } else {
      check(
        'restartWorkspaceKV',
        JSON.stringify(probe.previousWorkspace) ===
          JSON.stringify({ owner: probe.app.workspaceId, count: 7 })
      );
    }
    check(
      'applicationKVScope',
      phase === 'initial'
        ? probe.previousApp === undefined
        : probe.previousApp === 'application-value'
    );
    if (phase !== 'workspace') {
      await pluginRuntime.runCommand('t2.a4', 'persist');
      check(
        'commandKVWrite',
        JSON.stringify(await probe.app.storage.workspace.get('persist')) ===
          JSON.stringify({ owner: probe.app.workspaceId, count: 7 })
      );
    } else {
      await probe.app.storage.workspace.set('workspace-b-only', true);
    }
    if (phase === 'return') {
      check(
        'noCrossWorkspaceKey',
        (await probe.app.storage.workspace.get('workspace-b-only')) ===
          undefined
      );
    }
    await probe.app.storage.workspace.set('temporary/null', null);
    check(
      'nullAndPrefix',
      (await probe.app.storage.workspace.get('temporary/null')) === null &&
        (await probe.app.storage.workspace.list('temporary/')).join() ===
          'temporary/null'
    );
    await probe.app.storage.workspace.delete('temporary/null');
    check(
      'deleteKV',
      (await probe.app.storage.workspace.get('temporary/null')) === undefined
    );
    await waitFor(() => probe.ticks > 0, 'scheduled task');
    check('pastTaskSkipped', probe.pastTicks === 0);
    const noteId = `a4-${phase}`;
    await rpcCreateNote(noteId, 'A4 content event', 'text');
    await waitFor(
      () => probe.content.some((event) => event.ids.includes(noteId)),
      'Bun content push'
    );
    check(
      'contentWorkspaceIdentity',
      probe.content.every(
        (event) => event.workspaceId === probe.app.workspaceId
      )
    );
    await waitFor(
      () => useCanvasStore.getState()._hydrated,
      'canvas hydration'
    );
    const nodes = useCanvasStore.getState().nodes;
    useCanvasStore.setState({
      nodes: [
        ...nodes,
        {
          id: 'a4-selection',
          type: 'sticky',
          position: { x: 0, y: 0 },
          data: {},
          selected: true,
        },
      ],
    });
    check(
      'selectionPush',
      probe.selection.some((event) =>
        event.placementIds.includes('a4-selection')
      )
    );
    useCanvasStore.setState({ nodes });
    const disabled = await rpcDisablePlugin({
      pluginId: plugin.pluginId,
      digest: plugin.digest,
    });
    if (!disabled.success) {
      throw new Error(disabled.error);
    }
    await waitFor(() => probe.app.signal.aborted, 'disable cleanup');
    const ticks = probe.ticks;
    const events = probe.content.length;
    await rpcCreateNote(`a4-after-disable-${phase}`, 'Disabled probe', 'text');
    await sleep(200);
    check(
      'disabledTasksAndEventsStop',
      probe.ticks === ticks && probe.content.length === events
    );
    let aborted = false;
    try {
      await probe.app.storage.workspace.set('must-not-write', true);
    } catch (error) {
      aborted = (error as Error).name === 'AbortError';
    }
    check('retiredStorageRejects', aborted);
    const enabled = await rpcEnablePlugin({
      pluginId: plugin.pluginId,
      digest: plugin.digest,
    });
    if (!enabled.success) {
      throw new Error(enabled.error);
    }
    await waitFor(
      () =>
        globalThis.__trustedPluginA4 !== probe &&
        Boolean(globalThis.__trustedPluginA4?.activated),
      're-enable'
    );
    check(
      'disableRetainsKV',
      phase === 'workspace' ||
        JSON.stringify(globalThis.__trustedPluginA4!.previousWorkspace) ===
          JSON.stringify({ owner: probe.app.workspaceId, count: 7 })
    );
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
