import type { Node } from '@xyflow/react';
import { routeUndoRedo } from '@/lib/routeUndoRedo';
import {
  rpcCommitPluginInstall,
  rpcCreateNote,
  rpcEnablePlugin,
  rpcGetLocalHttpEndpoint,
  rpcLoadBlockNote,
  rpcSaveBlockNote,
} from '@/lib/rpc';
import { unifiedUndoHistory } from '@/lib/unifiedUndoHistory';
import { useCanvasStore } from '@/store/canvasStore';
import type { PluginContext } from '../../../../packages/plugin-sdk';
import type { PluginInstallPreview } from '../../../shared/plugins/management';
import { pluginRuntime } from '../runtime';

declare global {
  var __trustedPluginHistory: { app: PluginContext } | undefined;
}

const NOTE_ID = 't2-history-note';
const ORIGINAL_TITLE = 'T2 history original';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, label: string) {
  const deadline = Date.now() + 15_000;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out: ${label}; ${JSON.stringify(unifiedUndoHistory.getSnapshot())}`
      );
    }
    await sleep(30);
  }
}

async function waitForTitle(app: PluginContext, title: string, label: string) {
  const deadline = Date.now() + 15_000;
  while ((await app.content.get(NOTE_ID))?.title !== title) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out: ${label}`);
    }
    await sleep(30);
  }
}

function addCanvasMarker(id: string) {
  useCanvasStore.getState().saveSnapshot();
  useCanvasStore.setState((state) => ({
    nodes: [
      ...state.nodes,
      {
        id,
        type: 'sticky',
        position: { x: state.nodes.length * 120, y: 0 },
        data: { color: '#fef3c7', content: id },
      } as Node,
    ],
  }));
}

function hasMarker(id: string) {
  return useCanvasStore.getState().nodes.some((node) => node.id === id);
}

function cursorState() {
  const snapshot = unifiedUndoHistory.getSnapshot();
  return JSON.stringify({ future: snapshot.future, past: snapshot.past });
}

export async function runT2HistoryProbe() {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('Packaged app required');
  }
  const request = async <T>(route: string, body?: unknown): Promise<T> => {
    const response = await fetch(
      `${endpoint.baseUrl}/plugin-t2-history/${route}`,
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
    stage: 'T2/unified native canvas and plugin note history',
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
      await rpcCreateNote(NOTE_ID, ORIGINAL_TITLE, 'note');
      const seeded = await rpcSaveBlockNote(
        NOTE_ID,
        { title: ORIGINAL_TITLE, color: 'red' },
        [
          {
            id: 'history-block',
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Unified history probe', styles: {} },
            ],
            children: [],
          },
        ],
        '',
        0
      );
      check('seedNote', seeded.success && seeded.revision === 1);
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
      () => Boolean(globalThis.__trustedPluginHistory),
      'external history plugin'
    );
    await waitFor(
      () => useCanvasStore.getState()._hydrated,
      'canvas hydration'
    );
    const app = globalThis.__trustedPluginHistory!.app;
    const workspaceId = pluginRuntime.getSnapshot().workspaceId;
    const viewId = useCanvasStore.getState().activeViewId;

    if (phase === 'initial') {
      useCanvasStore.getState().reset();
      useCanvasStore.getState().hydrate([], []);
      unifiedUndoHistory.setContext(workspaceId, viewId);

      addCanvasMarker('history-a');
      const beforeBatch = await app.content.get(NOTE_ID);
      if (!beforeBatch?.revision) {
        throw new Error('Seeded history note is unavailable');
      }
      const batch = await app.content.updateMany(
        [
          {
            id: NOTE_ID,
            expectedRevision: beforeBatch.revision,
            changes: { title: 'T2 history batch B' },
          },
        ],
        { label: 'History batch B', operationId: 'history-batch-b' }
      );
      check('pluginBatchCommitted', batch.changed);
      await waitFor(
        () =>
          unifiedUndoHistory.getSnapshot().past.at(-1)?.kind === 'plugin-note',
        'plugin batch history registration'
      );
      addCanvasMarker('history-c');
      check(
        'orderedTimelineRecorded',
        unifiedUndoHistory
          .getSnapshot()
          .past.map((entry) => entry.kind)
          .join(',') === 'canvas,plugin-note,canvas'
      );

      routeUndoRedo('undo');
      await waitFor(() => !hasMarker('history-c'), 'native undo C');
      routeUndoRedo('undo');
      await waitForTitle(app, ORIGINAL_TITLE, 'native undo B');
      await waitFor(
        () => !unifiedUndoHistory.getSnapshot().pending,
        'native undo B completion'
      );
      routeUndoRedo('undo');
      await waitFor(() => !hasMarker('history-a'), 'native undo A');
      check(
        'nativeUndoOrder',
        unifiedUndoHistory.getSnapshot().past.length === 0 &&
          unifiedUndoHistory.getSnapshot().future.length === 3
      );

      routeUndoRedo('redo');
      await waitFor(() => hasMarker('history-a'), 'native redo A');
      routeUndoRedo('redo');
      await waitForTitle(app, 'T2 history batch B', 'native redo B');
      await waitFor(
        () => !unifiedUndoHistory.getSnapshot().pending,
        'native redo B completion'
      );
      routeUndoRedo('redo');
      await waitFor(() => hasMarker('history-c'), 'native redo C');
      check(
        'nativeRedoOrder',
        unifiedUndoHistory.getSnapshot().past.length === 3 &&
          unifiedUndoHistory.getSnapshot().future.length === 0
      );

      routeUndoRedo('undo');
      await waitFor(() => !hasMarker('history-c'), 'branch setup undo');
      addCanvasMarker('history-d');
      const branchState = cursorState();
      routeUndoRedo('redo');
      await sleep(100);
      check(
        'newChangeAbandonsRedoBranch',
        hasMarker('history-d') &&
          !hasMarker('history-c') &&
          unifiedUndoHistory.getSnapshot().future.length === 0 &&
          cursorState() === branchState
      );

      useCanvasStore.getState().reset();
      useCanvasStore.getState().hydrate([], []);
      unifiedUndoHistory.setContext(workspaceId, viewId);
      const beforeConflict = await app.content.get(NOTE_ID);
      if (!beforeConflict?.revision) {
        throw new Error('History note missing before conflict batch');
      }
      await app.content.updateMany(
        [
          {
            id: NOTE_ID,
            expectedRevision: beforeConflict.revision,
            changes: { title: 'T2 history conflict batch' },
          },
        ],
        { label: 'History conflict batch', operationId: 'history-conflict' }
      );
      await waitFor(
        () => unifiedUndoHistory.getSnapshot().past.length === 1,
        'conflict history registration'
      );
      const conflictNote = await app.content.get(NOTE_ID);
      const loaded = await rpcLoadBlockNote(NOTE_ID);
      if (
        !(
          conflictNote?.revision &&
          loaded.success &&
          Array.isArray(loaded.blocks)
        )
      ) {
        throw new Error('History note missing before outside edit');
      }
      const outside = await rpcSaveBlockNote(
        NOTE_ID,
        { title: 'T2 history outside edit', color: conflictNote.color },
        loaded.blocks,
        '',
        conflictNote.revision
      );
      check('outsideEditAdvancesRevision', outside.success);
      const beforeFailedUndo = cursorState();
      const toastCount = document.querySelectorAll(
        '[data-sonner-toast]'
      ).length;
      routeUndoRedo('undo');
      await waitFor(
        () =>
          !unifiedUndoHistory.getSnapshot().pending &&
          document.querySelectorAll('[data-sonner-toast]').length > toastCount,
        'visible native conflict failure'
      );
      check(
        'conflictLeavesNoteAndCursorStationary',
        (await app.content.get(NOTE_ID))?.title === 'T2 history outside edit' &&
          cursorState() === beforeFailedUndo
      );

      const beforeViewBatch = await app.content.get(NOTE_ID);
      if (!beforeViewBatch?.revision) {
        throw new Error('History note missing before view batch');
      }
      await app.content.updateMany(
        [
          {
            id: NOTE_ID,
            expectedRevision: beforeViewBatch.revision,
            changes: { title: 'T2 history view batch' },
          },
        ],
        { label: 'History view batch', operationId: 'history-view-batch' }
      );
      await waitFor(
        () => unifiedUndoHistory.getSnapshot().past.length === 2,
        'view batch history registration'
      );
      addCanvasMarker('history-view-canvas');
      useCanvasStore.getState().setActiveView('history-secondary-view');
      await waitFor(
        () =>
          unifiedUndoHistory.getSnapshot().viewId === 'history-secondary-view',
        'secondary view history context'
      );
      useCanvasStore.getState().hydrate([], []);
      useCanvasStore.getState().setActiveView(viewId);
      useCanvasStore.getState().hydrate([], []);
      await waitFor(
        () => unifiedUndoHistory.getSnapshot().viewId === viewId,
        'restored view history context'
      );
      check(
        'viewSwitchClearsMixedHistory',
        unifiedUndoHistory.getSnapshot().past.length === 0 &&
          unifiedUndoHistory.getSnapshot().future.length === 0
      );
      routeUndoRedo('undo');
      await sleep(100);
      check(
        'nativeUndoDoesNotCrossViewBoundary',
        (await app.content.get(NOTE_ID))?.title === 'T2 history view batch'
      );
      await app.content.undo('history-view-batch', {
        operationId: 'history-view-explicit-undo',
      });
      check(
        'explicitSdkUndoSurvivesViewBoundary',
        (await app.content.get(NOTE_ID))?.title === 'T2 history outside edit'
      );

      const beforeRestartBatch = await app.content.get(NOTE_ID);
      if (!beforeRestartBatch?.revision) {
        throw new Error('History note missing before restart batch');
      }
      await app.content.updateMany(
        [
          {
            id: NOTE_ID,
            expectedRevision: beforeRestartBatch.revision,
            changes: { title: 'T2 history restart batch' },
          },
        ],
        { label: 'History restart batch', operationId: 'history-restart-batch' }
      );
      await waitForTitle(app, 'T2 history restart batch', 'restart batch');
    } else {
      check(
        'restartClearsMixedHistory',
        unifiedUndoHistory.getSnapshot().past.length === 0 &&
          unifiedUndoHistory.getSnapshot().future.length === 0
      );
      routeUndoRedo('undo');
      await sleep(100);
      check(
        'nativeUndoDoesNotClaimDurableHistoryAfterRestart',
        (await app.content.get(NOTE_ID))?.title === 'T2 history restart batch'
      );
      await app.content.undo('history-restart-batch', {
        operationId: 'history-restart-explicit-undo',
      });
      check(
        'explicitSdkUndoSurvivesRestart',
        (await app.content.get(NOTE_ID))?.title === 'T2 history outside edit'
      );
    }
    report.history = unifiedUndoHistory.getSnapshot();
    report.passed = true;
  } catch (error) {
    report.error =
      error instanceof Error
        ? `${error.message}\n${error.stack ?? ''}`
        : String(error);
    report.runtime = pluginRuntime.getSnapshot();
    report.history = unifiedUndoHistory.getSnapshot();
  }
  report.finishedAt = new Date().toISOString();
  await request('report', report);
}
