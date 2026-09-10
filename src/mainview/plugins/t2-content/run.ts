import {
  rpcCommitPluginInstall,
  rpcCreateNote,
  rpcDisablePlugin,
  rpcEnablePlugin,
  rpcGetLocalHttpEndpoint,
  rpcListPluginPackages,
  rpcLoadBlockNote,
  rpcSaveBlockNote,
  rpcSaveManifest,
  rpcSearchCanvas,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import type {
  ContentBatchResult,
  ContentChangedEvent,
  PluginContext,
} from '../../../../packages/plugin-sdk';
import type { PluginInstallPreview } from '../../../shared/plugins/management';
import { pluginRuntime } from '../runtime';

declare global {
  var __trustedPluginContent:
    | {
        app: PluginContext;
        events: ContentChangedEvent[];
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
export async function runT2ContentProbe() {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('Packaged app required');
  }
  const request = async <T>(route: string, body?: unknown): Promise<T> => {
    const response = await fetch(
      `${endpoint.baseUrl}/plugin-t2-content/${route}`,
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
    stage: 'T2/note metadata and plain-text body transactions',
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
  const originalTitle = (id: string) => `  T2   Content probe ${id}  `;
  try {
    check('releaseScheme', location.href.startsWith('views://mainview/'));
    const { phase } = await request<{ phase: string }>('config');
    await waitFor(
      () => Boolean(pluginRuntime.getSnapshot().workspaceId),
      'host snapshot'
    );
    if (phase === 'initial') {
      for (const id of ['a', 'b']) {
        await rpcCreateNote(`t2-note-${id}`, originalTitle(id), 'note');
        const saved = await rpcSaveBlockNote(
          `t2-note-${id}`,
          { title: originalTitle(id), color: 'red' },
          [
            {
              id: `block-${id}`,
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'T2 Content probe body survives',
                  styles: {},
                },
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
          .commands.some((item) => item.pluginId === 't2.content'),
      'external content plugin'
    );
    const probe = globalThis.__trustedPluginContent!;
    const first = await probe.app.content.get('t2-note-a');
    check('queryPlainText', Boolean(first?.text.includes('body survives')));
    await waitFor(
      () => useCanvasStore.getState()._hydrated,
      'canvas hydration'
    );
    const originalNodes = useCanvasStore.getState().nodes;
    if (phase === 'initial') {
      const node = {
        id: 't2-placement',
        type: 'card',
        position: { x: 0, y: 0 },
        data: {
          noteId: 't2-note-a',
          title: originalTitle('a'),
          color: 'red',
          blocknoteRevision: 1,
        },
      };
      const folder = {
        id: 't2-folder',
        type: 'folder',
        position: { x: 100, y: 100 },
        data: {
          children: [
            {
              id: 't2-child',
              type: 'card',
              noteId: 't2-note-a',
              data: { ...node.data },
            },
          ],
        },
      };
      useCanvasStore.setState({ nodes: [node, folder] });
      check(
        'persistPlacements',
        (
          await rpcSaveManifest(
            useCanvasStore.getState().activeViewId,
            [node, folder],
            []
          )
        ).success
      );
      await pluginRuntime.runCommand('t2.content', 'normalize');
      check(
        'batchTwoNotes',
        probe.result?.changed === true && probe.result.items.length === 2
      );
      await waitFor(
        () =>
          useCanvasStore.getState().nodes.find((item) => item.id === node.id)
            ?.data.title === 'T2 Content probe a',
        'canvas metadata projection'
      );
      const projected = useCanvasStore.getState().nodes;
      check(
        'projectionRevisionAndColor',
        projected[0]?.data.blocknoteRevision === 2 &&
          projected[0]?.data.color === 'blue'
      );
      const children = projected[1]?.data.children as {
        data: { title: string; color: string; blocknoteRevision: number };
      }[];
      check(
        'folderProjection',
        children[0]?.data.title === 'T2 Content probe a' &&
          children[0].data.blocknoteRevision === 2
      );
      const search = await rpcSearchCanvas('T2 Content probe a');
      check(
        'searchUsesCommittedTitle',
        Array.isArray(search) &&
          search.some(
            (item) =>
              item &&
              typeof item === 'object' &&
              'title' in item &&
              item.title === 'T2 Content probe a'
          )
      );
      let rejected = false;
      try {
        rejected = !(
          await rpcSaveManifest(
            useCanvasStore.getState().activeViewId,
            [node],
            []
          )
        ).success;
      } catch {
        rejected = true;
      }
      check('staleManifestRejected', rejected);
      check(
        'staleManifestDoesNotOverwrite',
        (await probe.app.content.get('t2-note-a'))?.title ===
          'T2 Content probe a'
      );
      await pluginRuntime.runCommand('t2.content', 'undo');
      check(
        'singleUndoRestoresBatch',
        (await probe.app.content.get('t2-note-a'))?.title ===
          originalTitle('a') &&
          (await probe.app.content.get('t2-note-b'))?.revision === 3
      );
      await pluginRuntime.runCommand('t2.content', 'redo');
      check(
        'redoUsesFreshRevision',
        (await probe.app.content.get('t2-note-a'))?.revision === 4
      );
    } else {
      check(
        'restartPreservesMetadata',
        first?.revision === 4 && first.title === 'T2 Content probe a'
      );
      await pluginRuntime.runCommand('t2.content', 'undo');
      const restored = await probe.app.content.get('t2-note-a');
      check(
        'restartPreservesUndoHistory',
        restored?.revision === 5 && restored.title === originalTitle('a')
      );
      const saved = await rpcSaveBlockNote(
        't2-note-a',
        { title: restored!.title, color: restored!.color },
        [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'User edits after undo', styles: {} },
            ],
            children: [],
          },
        ],
        '',
        5
      );
      check('ordinaryEditorWrite', saved.success && saved.revision === 6);
      let conflict = false;
      try {
        await probe.app.content.redo('original-batch');
      } catch (error) {
        conflict = (error as { code?: string }).code === 'revision-conflict';
      }
      check(
        'redoConflictIsWholeBatch',
        conflict && (await probe.app.content.get('t2-note-b'))?.revision === 5
      );
    }
    if (phase === 'initial') {
      await rpcCreateNote('t2-note-body', 'Body replacement', 'note');
      const seeded = await rpcSaveBlockNote(
        't2-note-body',
        { title: 'Body replacement', color: 'red' },
        [
          {
            id: 'rich-original',
            type: 'heading',
            props: { level: 2 },
            content: [
              {
                type: 'text',
                text: 'Original rich body',
                styles: { bold: true },
              },
            ],
            children: [],
          },
        ],
        '',
        0
      );
      check('bodySeed', seeded.success && seeded.revision === 1);
      const result = await probe.app.content.updateMany(
        [
          {
            id: 't2-note-body',
            expectedRevision: 1,
            changes: {
              text: 'Replacement body\n第二行 <script>literal</script>',
            },
          },
        ],
        { label: 'Replace body', operationId: 'body-batch' }
      );
      check(
        'bodyReplacement',
        result.changed && result.items[0]?.revision === 2
      );
      const loaded = await rpcLoadBlockNote('t2-note-body');
      check(
        'bodyLoadsLiteralText',
        loaded.success &&
          JSON.stringify(loaded.blocks).includes('<script>literal</script>')
      );
      check(
        'bodyQueryable',
        (
          await probe.app.content.query({ text: 'Replacement body' })
        ).items.some((item) => item.id === 't2-note-body')
      );
    } else {
      check(
        'bodyPersistsAcrossRestart',
        (await probe.app.content.get('t2-note-body'))?.text.includes(
          '第二行'
        ) === true
      );
      await probe.app.content.undo('body-batch', { operationId: 'body-undo' });
      const restoredBody = await rpcLoadBlockNote('t2-note-body');
      check(
        'bodyUndoRestoresRichBlocks',
        JSON.stringify(restoredBody.blocks).includes('rich-original') &&
          JSON.stringify(restoredBody.blocks).includes('"bold":true')
      );
      await probe.app.content.redo('body-batch', { operationId: 'body-redo' });
      check(
        'bodyRedo',
        (await probe.app.content.get('t2-note-body'))?.revision === 4
      );
    }
    await waitFor(
      () =>
        probe.events.some((event) =>
          event.noteChanges?.some(
            (change) => change.id === 't2-note-body' && !change.metadataOnly
          )
        ),
      'body change notification'
    );
    check('bodyEventsAreNotMetadataOnly', true);
    useCanvasStore.setState({ nodes: originalNodes });
    check(
      'contentEventsCarryMetadata',
      probe.events.some((event) =>
        event.noteChanges?.some((change) => change.metadataOnly)
      )
    );
    const plugin = (await rpcListPluginPackages()).plugins.find(
      (item) => item.pluginId === 't2.content'
    )!;
    if (phase === 'restart') {
      const disabled = await rpcDisablePlugin({
        pluginId: plugin.pluginId,
        digest: plugin.digest,
      });
      if (!disabled.success) {
        throw new Error(disabled.error);
      }
      await waitFor(() => probe.app.signal.aborted, 'disable content plugin');
      let aborted = false;
      try {
        await probe.app.content.get('t2-note-a');
      } catch (error) {
        aborted = (error as Error).name === 'AbortError';
      }
      check('retiredContentApiRejects', aborted);
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
