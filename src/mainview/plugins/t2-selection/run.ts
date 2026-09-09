import {
  rpcCommitPluginInstall,
  rpcCreateNote,
  rpcDisablePlugin,
  rpcEnablePlugin,
  rpcGetLocalHttpEndpoint,
  rpcListPluginPackages,
  rpcSaveBlockNote,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import type {
  ContentBatchResult,
  NoteContentSnapshot,
  PlacementSelectionSnapshot,
  PluginContext,
  SelectionSnapshot,
} from '../../../../packages/plugin-sdk';
import type { PluginInstallPreview } from '../../../shared/plugins/management';
import { pluginRuntime } from '../runtime';

declare global {
  var __trustedPluginSelection:
    | {
        app: PluginContext;
        hooks: {
          items: readonly NoteContentSnapshot[];
          state: SelectionSnapshot;
          placements: PlacementSelectionSnapshot;
        } | null;
        notifications: number;
        renders: number;
        mounts: number;
        unmounts: number;
        sharedHooks: boolean;
        captured: readonly NoteContentSnapshot[];
        result: ContentBatchResult | null;
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
export async function runT2SelectionProbe() {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('Packaged app required');
  }
  const request = async <T>(route: string, body?: unknown): Promise<T> => {
    const response = await fetch(
      `${endpoint.baseUrl}/plugin-t2-selection/${route}`,
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
    stage: 'T2/note selection and React hooks only',
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
  const title = (id: string) => `  Selection   note ${id}  `;
  let restore: (() => void) | undefined;
  try {
    check('releaseScheme', location.href.startsWith('views://mainview/'));
    const { phase } = await request<{ phase: string }>('config');
    await waitFor(
      () => Boolean(pluginRuntime.getSnapshot().workspaceId),
      'host snapshot'
    );
    if (phase === 'initial') {
      for (const id of ['a', 'b', 'c']) {
        await rpcCreateNote(`selection-${id}`, title(id), 'note');
        const saved = await rpcSaveBlockNote(
          `selection-${id}`,
          { title: title(id), color: 'red' },
          [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Canonical selection body', styles: {} },
              ],
              children: [],
            },
          ],
          '',
          0
        );
        check(`seed-${id}`, saved.success && saved.revision === 1);
      }
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
      () =>
        pluginRuntime
          .getSnapshot()
          .commands.some((item) => item.pluginId === 't2.selection'),
      'external selection plugin'
    );
    const probe = globalThis.__trustedPluginSelection!;
    await waitFor(
      () => useCanvasStore.getState()._hydrated,
      'canvas hydration'
    );
    const original = useCanvasStore.getState().nodes;
    restore = () => useCanvasStore.setState({ nodes: original });
    const note = (id: string, suffix = '') => ({
      id: `placement-${id}${suffix}`,
      type: 'card',
      selected: true,
      position: { x: 0, y: 0 },
      data: {
        noteId: `selection-${id}`,
        title: phase === 'initial' ? title(id) : `Selection note ${id}`,
        color: 'red',
        blocknoteRevision: phase === 'initial' ? 1 : 2,
      },
    });
    const nodes = [
      note('a'),
      note('a', '-duplicate'),
      note('b'),
      {
        id: 'folder',
        type: 'folder',
        selected: true,
        position: { x: 400, y: 0 },
        data: { children: [{ id: 'inside', noteId: 'selection-c' }] },
      },
      {
        id: 'image',
        type: 'image',
        selected: true,
        position: { x: 800, y: 0 },
        data: {},
      },
    ];
    useCanvasStore.setState({ nodes });
    await waitFor(
      () =>
        probe.hooks?.state.status === 'ready' && probe.hooks.items.length === 2,
      'public hooks selected notes'
    );
    const selection = await probe.app.selection.get();
    check(
      'deduplicatedCanonicalSnapshots',
      selection.length === 2 &&
        selection[0]?.id === 'selection-a' &&
        selection[1]?.id === 'selection-b' &&
        selection.every((item) =>
          item.text.includes('Canonical selection body')
        )
    );
    check(
      'frozenSnapshots',
      Object.isFrozen(selection) && Object.isFrozen(selection[0])
    );
    const placements = probe.app.selection.getPlacements();
    check(
      'distinctPlacementApi',
      placements.items.length === 5 &&
        placements.items.filter((item) => item.content?.id === 'selection-a')
          .length === 2 &&
        placements.items.find((item) => item.id === 'folder')?.content === null
    );
    check(
      'publicReactSubpathAndSharedIdentity',
      probe.sharedHooks &&
        Boolean(document.querySelector('[data-selection-probe]'))
    );
    check(
      'hooksHaveCorrectScope',
      probe.hooks!.placements.items.length === 5 &&
        probe.hooks!.items.length === 2
    );
    const mounts = probe.mounts;
    if (phase === 'initial') {
      await pluginRuntime.runCommand('t2.selection', 'normalize');
      check(
        'commandOnlyMutatesUniqueSelectedNotes',
        probe.result?.items.length === 2 &&
          probe.result.items.every((item) => item.revision === 2)
      );
      await waitFor(
        () =>
          probe.hooks?.items.every((item) => item.revision === 2) === true &&
          probe.hooks.items.length === 2,
        'content invalidation refreshes hooks'
      );
      check(
        'hookRefreshWithoutRemount',
        probe.mounts === mounts &&
          probe.hooks!.items[0]?.title === 'Selection note a'
      );
      check(
        'unselectedFolderContentsUntouched',
        (await probe.app.content.get('selection-c'))?.revision === 1
      );
      check(
        'capturedSnapshotDoesNotMutate',
        probe.captured[0]?.revision === 1 &&
          probe.captured[0]?.title === title('a')
      );
      let conflict = false;
      try {
        await probe.app.content.updateMany(
          probe.captured.map((item) => ({
            id: item.id,
            expectedRevision: item.revision!,
            changes: { title: 'Stale overwrite' },
          })),
          { label: 'Stale selection' }
        );
      } catch (error) {
        conflict = (error as { code?: string }).code === 'revision-conflict';
      }
      check('staleSelectionRevisionRejected', conflict);
    } else {
      check(
        'restartReadsCommittedSelection',
        selection.every((item) => item.revision === 2)
      );
      await pluginRuntime.runCommand('t2.selection', 'undo');
      await waitFor(
        () =>
          probe.hooks?.items.length === 2 &&
          probe.hooks.items.every((item) => item.revision === 3),
        'persistent undo updates hooks'
      );
      check(
        'persistedUndoRefreshesHooks',
        probe.hooks!.items[0]?.title === title('a') && probe.mounts === mounts
      );
    }
    useCanvasStore.setState({
      nodes: nodes.map((item) => ({ ...item, selected: false })),
    });
    await waitFor(
      () =>
        probe.hooks?.state.status === 'ready' &&
        probe.hooks.items.length === 0 &&
        probe.hooks.placements.items.length === 0,
      'empty selection hooks'
    );
    check(
      'selectionClearIsNotStale',
      (await probe.app.selection.get()).length === 0
    );
    const stable = probe.app.selection.getSnapshot();
    await sleep(100);
    check(
      'cachedSnapshotIsStable',
      probe.app.selection.getSnapshot() === stable
    );
    if (phase === 'restart') {
      const plugin = (await rpcListPluginPackages()).plugins.find(
        (item) => item.pluginId === 't2.selection'
      )!;
      const disabled = await rpcDisablePlugin({
        pluginId: plugin.pluginId,
        digest: plugin.digest,
      });
      if (!disabled.success) {
        throw new Error(disabled.error);
      }
      await waitFor(
        () => probe.app.signal.aborted && probe.unmounts > 0,
        'selection retirement'
      );
      const notifications = probe.notifications;
      useCanvasStore.setState({ nodes });
      let aborted = false;
      try {
        await probe.app.selection.get();
      } catch (error) {
        aborted = (error as Error).name === 'AbortError';
      }
      check(
        'retiredSelectionRejectsAndUnsubscribes',
        aborted &&
          probe.notifications === notifications &&
          !document.querySelector('[data-selection-probe]')
      );
    }
    report.passed = true;
  } catch (error) {
    report.error =
      error instanceof Error
        ? `${error.message}\n${error.stack ?? ''}`
        : String(error);
    report.runtime = pluginRuntime.getSnapshot();
  } finally {
    restore?.();
  }
  report.finishedAt = new Date().toISOString();
  await request('report', report);
}
