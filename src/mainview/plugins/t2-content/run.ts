import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import BlockNoteEditor from '@/components/editor/BlockNoteEditor';
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
  rpcScanUnlinkedNotes,
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

function setTextAreaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  if (!setter) {
    throw new Error('Textarea value setter unavailable');
  }
  element.focus();
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
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
    stage: 'T2/note creation, transactions and live reconciliation',
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
  let bodyRoot: Root | undefined;
  let bodyElement: HTMLDivElement | undefined;
  let conflictRoot: Root | undefined;
  let conflictElement: HTMLDivElement | undefined;
  const mountBodyEditor = async (app: PluginContext) => {
    const note = await app.content.get('t2-note-body');
    if (!note || note.revision === null) {
      throw new Error('Missing body note');
    }
    const data = {
      noteId: note.id,
      title: note.title,
      color: note.color,
      blocknoteRevision: note.revision,
      content: note.text,
    };
    const node = {
      id: 'body-live-placement',
      type: 'card',
      position: { x: 300, y: 0 },
      data,
    };
    useCanvasStore.setState((state) => ({ nodes: [...state.nodes, node] }));
    bodyElement = document.createElement('div');
    document.body.append(bodyElement);
    bodyRoot = createRoot(bodyElement);
    bodyRoot.render(
      createElement(BlockNoteEditor, {
        nodeId: node.id,
        noteId: note.id,
        data,
        title: note.title,
        color: note.color,
        onMarkdownChange: () => {},
        onTitleChange: () => {},
      })
    );
    await waitFor(
      () => Boolean(bodyElement?.querySelector('.bn-editor')),
      'real editor mount'
    );
  };
  const mountConflictEditor = async (app: PluginContext) => {
    const note = await app.content.get('t2-note-conflict');
    if (!note || note.revision === null) {
      throw new Error('Missing conflict note');
    }
    const data = {
      noteId: note.id,
      title: note.title,
      color: note.color,
      blocknoteRevision: note.revision,
      content: note.text,
    };
    const node = {
      id: 'conflict-live-placement',
      type: 'card',
      position: { x: 500, y: 0 },
      data,
    };
    useCanvasStore.setState((state) => ({ nodes: [...state.nodes, node] }));
    conflictElement = document.createElement('div');
    document.body.append(conflictElement);
    conflictRoot = createRoot(conflictElement);
    conflictRoot.render(
      createElement(BlockNoteEditor, {
        nodeId: node.id,
        noteId: note.id,
        data,
        title: note.title,
        color: note.color,
        onMarkdownChange: () => {},
        onTitleChange: () => {},
      })
    );
    await waitFor(
      () => Boolean(conflictElement?.querySelector('.bn-editor')),
      'real conflict editor mount'
    );
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
      await mountBodyEditor(probe.app);
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
      await waitFor(
        () => Boolean(bodyElement?.textContent?.includes('Replacement body')),
        'live editor body replacement'
      );
      await waitFor(
        () =>
          useCanvasStore
            .getState()
            .nodes.find((node) => node.id === 'body-live-placement')?.data
            .blocknoteRevision === 2,
        'live canvas preview'
      );
      check(
        'liveEditorAndPlacement',
        useCanvasStore
          .getState()
          .nodes.find((node) => node.id === 'body-live-placement')
          ?.data.previewExcerpt?.toString()
          .includes('Replacement body') === true
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
      await mountBodyEditor(probe.app);
      await probe.app.content.undo('body-batch', { operationId: 'body-undo' });
      await waitFor(
        () => Boolean(bodyElement?.textContent?.includes('Original rich body')),
        'live editor undo'
      );
      check('liveRichUndo', Boolean(bodyElement?.querySelector('h2')));
      const restoredBody = await rpcLoadBlockNote('t2-note-body');
      check(
        'bodyUndoRestoresRichBlocks',
        JSON.stringify(restoredBody.blocks).includes('rich-original') &&
          JSON.stringify(restoredBody.blocks).includes('"bold":true')
      );
      await probe.app.content.redo('body-batch', { operationId: 'body-redo' });
      await waitFor(
        () => Boolean(bodyElement?.textContent?.includes('Replacement body')),
        'live editor redo'
      );
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
    if (phase === 'initial') {
      await rpcCreateNote('t2-note-conflict', 'Conflict probe', 'note');
      const seeded = await rpcSaveBlockNote(
        't2-note-conflict',
        { title: 'Conflict probe', color: 'red' },
        [
          {
            id: 'conflict-original',
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Original conflict body',
                styles: {},
              },
            ],
            children: [],
          },
        ],
        '',
        0
      );
      check('conflictSeed', seeded.success && seeded.revision === 1);
      await mountConflictEditor(probe.app);
      const titleInput = conflictElement?.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Note title"]'
      );
      if (!titleInput) {
        throw new Error('Real editor title input missing');
      }
      const localDiscardedTitle = 'Local draft to discard';
      setTextAreaValue(titleInput, localDiscardedTitle);
      check(
        'localDraftVisibleBeforeConflict',
        titleInput.value === localDiscardedTitle
      );
      const beforeSavedChoice = await probe.app.content.get('t2-note-conflict');
      if (!beforeSavedChoice || beforeSavedChoice.revision === null) {
        throw new Error('Conflict note missing before saved-version choice');
      }
      await probe.app.content.updateMany(
        [
          {
            id: 't2-note-conflict',
            expectedRevision: beforeSavedChoice.revision,
            changes: {
              text: 'Saved plugin version wins first conflict',
              title: 'Saved plugin title',
            },
          },
        ],
        {
          label: 'Create saved-version conflict',
          operationId: 'conflict-saved',
        }
      );
      await sleep(50);
      check(
        'pluginRefreshPreservesDirtyDraft',
        titleInput.value === localDiscardedTitle &&
          !conflictElement?.textContent?.includes('Saved plugin version wins')
      );
      titleInput.blur();
      await waitFor(
        () =>
          conflictElement?.querySelector('[data-note-conflict="ready"]') !==
          null,
        'saved-version conflict banner'
      );
      check(
        'conflictComparisonShowsBothVersions',
        Boolean(
          conflictElement?.textContent?.includes(localDiscardedTitle) &&
            conflictElement.textContent.includes('Saved plugin title')
        )
      );
      conflictElement
        ?.querySelector<HTMLElement>('[data-note-conflict-action="saved"]')
        ?.click();
      await waitFor(
        () =>
          titleInput.value === 'Saved plugin title' &&
          Boolean(
            conflictElement?.textContent?.includes(
              'Saved plugin version wins first conflict'
            )
          ) &&
          conflictElement?.querySelector('[data-note-conflict]') === null,
        'adopt saved version'
      );
      const adopted = await probe.app.content.get('t2-note-conflict');
      check(
        'savedChoiceDoesNotWriteDraft',
        adopted?.title === 'Saved plugin title' &&
          adopted.text.includes('Saved plugin version wins first conflict') &&
          adopted.revision === beforeSavedChoice.revision + 1
      );

      const localKeptTitle = 'Local draft kept intentionally';
      setTextAreaValue(titleInput, localKeptTitle);
      await probe.app.content.updateMany(
        [
          {
            id: 't2-note-conflict',
            expectedRevision: adopted!.revision!,
            changes: {
              text: 'Newer plugin version loses second conflict',
              title: 'Newer plugin title',
            },
          },
        ],
        {
          label: 'Create local-version conflict',
          operationId: 'conflict-local',
        }
      );
      await sleep(50);
      check(
        'secondConflictPreservesDraft',
        titleInput.value === localKeptTitle
      );
      titleInput.blur();
      await waitFor(
        () =>
          conflictElement?.querySelector('[data-note-conflict="ready"]') !==
          null,
        'local-version conflict banner'
      );
      conflictElement
        ?.querySelector<HTMLElement>('[data-note-conflict-action="local"]')
        ?.click();
      await waitFor(
        () => conflictElement?.querySelector('[data-note-conflict]') === null,
        'keep local version'
      );
      const kept = await probe.app.content.get('t2-note-conflict');
      check(
        'localChoiceRebasesAndSaves',
        kept?.title === localKeptTitle &&
          kept.text.includes('Saved plugin version wins first conflict') &&
          kept.revision === adopted!.revision! + 2
      );
    }
    const creationInput = [
      {
        title: 'SDK created first',
        text: 'Created through SDK\n第二段',
        color: 'blue',
      },
      { title: 'SDK created empty' },
    ];
    if (phase === 'initial') {
      const created = await probe.app.content.createMany(creationInput, {
        label: 'Create two notes',
        operationId: 'creation-batch',
      });
      check(
        'createTwoNotes',
        created.items.length === 2 &&
          created.items.every((note) => note.revision === 1)
      );
      const ids = created.items.map((note) => note.id);
      await probe.app.storage.workspace.set('created-ids', ids);
      const repeated = await probe.app.content.createMany(creationInput, {
        label: 'Create two notes',
        operationId: 'creation-batch',
      });
      check(
        'creationRetryKeepsIds',
        JSON.stringify(repeated) === JSON.stringify(created)
      );
      const library = await rpcScanUnlinkedNotes();
      check(
        'creationDiscoverableInLibrary',
        ids.every((id) => library.some((entry) => entry.noteId === id))
      );
      const beforePlacement = useCanvasStore.getState().nodes;
      const note = created.items[0]!;
      const placement = {
        id: 'creation-reference',
        type: 'card',
        position: { x: 400, y: 0 },
        data: {
          noteId: note.id,
          title: note.title,
          color: note.color,
          blocknoteRevision: note.revision,
        },
      };
      useCanvasStore.setState({ nodes: [...beforePlacement, placement] });
      let protectedLive = false;
      try {
        await probe.app.content.undo('creation-batch');
      } catch (error) {
        protectedLive =
          (error as { code?: string }).code === 'content-referenced';
      }
      check('creationUndoProtectsLivePlacement', protectedLive);
      check(
        'persistCreatedPlacement',
        (
          await rpcSaveManifest(
            useCanvasStore.getState().activeViewId,
            [...beforePlacement, placement],
            []
          )
        ).success
      );
      useCanvasStore.setState({ nodes: beforePlacement });
      let protectedPersisted = false;
      try {
        await probe.app.content.undo('creation-batch');
      } catch (error) {
        protectedPersisted =
          (error as { code?: string }).code === 'content-referenced';
      }
      check('creationUndoProtectsPersistedPlacement', protectedPersisted);
      check(
        'removeCreatedPlacement',
        (
          await rpcSaveManifest(
            useCanvasStore.getState().activeViewId,
            beforePlacement,
            []
          )
        ).success
      );
    } else {
      const ids = (await probe.app.storage.workspace.get(
        'created-ids'
      )) as string[];
      check(
        'createdNotesSurviveRestart',
        (await probe.app.content.getMany(ids)).every(
          (note) => note?.revision === 1
        )
      );
      const undone = await probe.app.content.undo('creation-batch', {
        operationId: 'creation-undo',
      });
      check(
        'creationUndoRemovesBatch',
        undone.removedIds?.length === 2 &&
          (await probe.app.content.getMany(ids)).every((note) => note === null)
      );
      const library = await rpcScanUnlinkedNotes();
      check(
        'creationUndoRemovesLibraryEntries',
        !library.some((entry) => ids.includes(entry.noteId ?? ''))
      );
      check(
        'stalePlacementCannotRecreateUndoneNote',
        !(
          await rpcSaveManifest(
            useCanvasStore.getState().activeViewId,
            [
              {
                id: 'stale-creation',
                type: 'card',
                position: { x: 0, y: 0 },
                data: { noteId: ids[0], title: 'Stale', blocknoteRevision: 1 },
              },
            ],
            []
          )
        ).success
      );
      const redone = await probe.app.content.redo('creation-batch');
      check(
        'creationRedoRestoresIds',
        redone.items.every(
          (note, index) => note.id === ids[index] && note.revision === 3
        )
      );
      await probe.app.content.updateMany(
        [
          {
            id: ids[1]!,
            expectedRevision: 3,
            changes: { text: 'User-modified creation' },
          },
        ],
        { label: 'Edit created note' }
      );
      let conflict = false;
      try {
        await probe.app.content.undo('creation-batch');
      } catch (error) {
        conflict = (error as { code?: string }).code === 'revision-conflict';
      }
      check(
        'creationUndoPreservesModifiedBatch',
        conflict && (await probe.app.content.get(ids[0]!))?.revision === 3
      );
    }
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
  } finally {
    conflictRoot?.unmount();
    conflictElement?.remove();
    bodyRoot?.unmount();
    bodyElement?.remove();
  }
  report.finishedAt = new Date().toISOString();
  await request('report', report);
}
