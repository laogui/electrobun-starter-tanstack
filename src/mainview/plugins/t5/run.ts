import {
  rpcCommitPluginInstall,
  rpcEnablePlugin,
  rpcGetLocalHttpEndpoint,
  rpcListPluginPackages,
  rpcSaveManifest,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import type {
  InstalledPluginSummary,
  PluginInstallPreview,
  PluginUpdatePreview,
} from '../../../shared/plugins/management';
import { canvasTypeRegistry } from '../../extensions/registry';
import { pluginRuntime } from '../runtime';

type T5Phase = 'install' | 'picker' | 'restart';

interface T5Example {
  id: string;
  installSha256: string;
  installUrl: string;
  installVersion: string;
  releasesUrl: string;
  updateVersion?: string;
}

interface T5Config {
  baseUrl: string;
  examples: T5Example[];
  hostRange: string;
  phase: T5Phase;
  picker: 'manual' | 'scripted';
  publicKey: string;
}

const HELLO = 'example.hello';
const REACT_HELLO = 'example.react-hello';
const CSV_IMPORTER = 'example.csv-importer';
const COMBINED = 'example.combined';
const EXAMPLE_IDS = [HELLO, REACT_HELLO, CSV_IMPORTER, COMBINED] as const;

/** Exactly one contribution set per template; the probe asserts nothing more is registered. */
const EXPECTED_CONTRIBUTIONS: Record<
  (typeof EXAMPLE_IDS)[number],
  { canvasTypes: number; commands: number; importers: number; panels: number }
> = {
  [HELLO]: { canvasTypes: 0, commands: 1, importers: 0, panels: 1 },
  [REACT_HELLO]: { canvasTypes: 0, commands: 1, importers: 0, panels: 1 },
  [CSV_IMPORTER]: { canvasTypes: 0, commands: 0, importers: 1, panels: 0 },
  [COMBINED]: { canvasTypes: 1, commands: 1, importers: 1, panels: 1 },
};

const MANUAL_PICKER_TIMEOUT_MS = 5 * 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  check: () => boolean,
  label: string,
  timeoutMs = 20_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out: ${label}; ${JSON.stringify(pluginRuntime.getSnapshot())}`
      );
    }
    await sleep(30);
  }
}

function pluginRow(
  plugins: readonly InstalledPluginSummary[],
  pluginId: string
): InstalledPluginSummary | undefined {
  return plugins.find((plugin) => plugin.pluginId === pluginId);
}

function isRunning(pluginId: string, version?: string): boolean {
  return pluginRuntime
    .getSnapshot()
    .plugins.some(
      (plugin) =>
        plugin.pluginId === pluginId &&
        plugin.status === 'running' &&
        (version === undefined || plugin.version === version)
    );
}

function contributions(pluginId: string) {
  const snapshot = pluginRuntime.getSnapshot();
  const count = (items: readonly { pluginId: string }[]) =>
    items.filter((item) => item.pluginId === pluginId).length;
  return {
    canvasTypes: count(snapshot.canvasTypes),
    commands: count(snapshot.commands),
    importers: count(snapshot.importers),
    panels: count(snapshot.panels),
  };
}

function hasExpectedContributions(): boolean {
  return EXAMPLE_IDS.every((id) => {
    const actual = contributions(id);
    const expected = EXPECTED_CONTRIBUTIONS[id];
    return (
      actual.canvasTypes === expected.canvasTypes &&
      actual.commands === expected.commands &&
      actual.importers === expected.importers &&
      actual.panels === expected.panels
    );
  });
}

function panelElement(pluginId: string, panelId: string) {
  return document.querySelector<HTMLElement>(
    `[data-plugin-panel="${pluginId}/${panelId}"]`
  );
}

function panelCounter(pluginId: string, panelId: string) {
  return [
    ...(panelElement(pluginId, panelId)?.querySelectorAll('button') ?? []),
  ].find((button) => button.textContent?.startsWith('Count:'));
}

export async function runT5Probe(): Promise<void> {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('Packaged app required');
  }
  const request = async <T>(route: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${endpoint.baseUrl}/plugin-t5/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${route}: ${response.status} ${text}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`${route}: host returned invalid JSON`);
    }
  };
  const checks: Record<string, boolean> = {};
  const report: Record<string, unknown> = {
    stage: 'T5/public distribution and support platform',
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
  const acknowledgeStartup = async () => {
    const response = await fetch(`${endpoint.baseUrl}/plugins/startup-ready`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${endpoint.token}` },
    });
    if (!response.ok) {
      throw new Error(`startup-ready: ${response.status}`);
    }
  };
  const waitForRuntimeWorkspace = () =>
    waitFor(
      () => Boolean(pluginRuntime.getSnapshot().workspaceId),
      'plugin host snapshot'
    );
  const commitPreview = async (preview: PluginInstallPreview) => {
    const committed = await rpcCommitPluginInstall(preview.transactionId);
    if (!committed.success) {
      throw new Error(committed.error);
    }
    return committed.plugin;
  };
  const enable = async (plugin: { digest: string; pluginId: string }) => {
    const enabled = await rpcEnablePlugin({
      digest: plugin.digest,
      pluginId: plugin.pluginId,
    });
    if (!enabled.success) {
      throw new Error(enabled.error);
    }
    return enabled.plugin;
  };

  const installExample = async (example: T5Example) => {
    const preview = await request<PluginInstallPreview>('prepare-url', {
      pluginId: example.id,
    });
    check(
      `public-install-preview-${example.id}`,
      preview.plugin.id === example.id &&
        preview.plugin.version === example.installVersion &&
        preview.plugin.signatureStatus === 'verified' &&
        preview.source.kind === 'url' &&
        preview.source.label.startsWith('https://') &&
        preview.digest === example.installSha256
    );
    const committed = await commitPreview(preview);
    const stored = pluginRow(
      (await rpcListPluginPackages()).plugins,
      example.id
    );
    check(
      `public-install-commit-disabled-${example.id}`,
      Boolean(
        stored &&
          !stored.enabled &&
          stored.status === 'stored' &&
          stored.plugin?.signatureStatus === 'verified'
      )
    );
    const enabled = await enable(committed);
    await waitFor(
      () => isRunning(example.id, example.installVersion),
      `${example.id}@${example.installVersion} activation`
    );
    return enabled;
  };

  const exerciseDomPanel = async (pluginId: string, panelId: string) => {
    await pluginRuntime.runCommand(
      pluginId,
      pluginId === COMBINED ? 'open-import-help' : 'open-hello'
    );
    await waitFor(
      () => Boolean(panelElement(pluginId, panelId)),
      `${pluginId} panel open`
    );
    if (pluginId !== COMBINED) {
      // A React panel mounts its contents after the host container appears.
      await waitFor(
        () => panelCounter(pluginId, panelId)?.textContent === 'Count: 0',
        `${pluginId} initial panel content`
      );
      const counter = panelCounter(pluginId, panelId);
      check(`panel-initial-${pluginId}`, counter?.textContent === 'Count: 0');
      counter?.click();
      await waitFor(
        () => panelCounter(pluginId, panelId)?.textContent === 'Count: 1',
        `${pluginId} panel interaction`
      );
    }
    check(
      `panel-open-${pluginId}`,
      pluginRuntime
        .getSnapshot()
        .panels.some(
          (panel) =>
            panel.pluginId === pluginId && panel.id === panelId && panel.open
        )
    );
    pluginRuntime.closePanel(pluginId, panelId);
    await waitFor(
      () => !panelElement(pluginId, panelId),
      `${pluginId} panel cleanup`
    );
    check(`panel-close-${pluginId}`, true);
  };

  const exerciseCanvasType = async () => {
    const canvasTypeId = `${COMBINED}/counter`;
    const type = canvasTypeRegistry.get(canvasTypeId);
    if (!type) {
      throw new Error('Example canvas type was not published');
    }
    await waitFor(
      () => useCanvasStore.getState()._hydrated,
      'canvas hydration'
    );
    const state = type.createInitialState();
    const record = await useExtensionInstanceStore.getState().createInstance({
      canvasTypeId,
      dataVersion: type.dataVersion,
      presentation: type.buildPresentation(state),
      state,
    });
    check('canvas-instance', Boolean(record?.id));
    const nodeId = await useCanvasStore
      .getState()
      .createExtensionNode(canvasTypeId, record!.id, null, {
        anchorCenter: { x: 360, y: 260 },
        focusViewport: false,
        size: type.surface.defaultSize,
      });
    check('canvas-placement', Boolean(nodeId));
    const counterButton = () =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === 'Count: 0'
      );
    await waitFor(() => Boolean(counterButton()), 'canvas render');
    counterButton()?.click();
    await waitFor(() => {
      const current = useExtensionInstanceStore.getState().records[record!.id];
      return Boolean(
        current &&
          'state' in current &&
          (current.state as { count?: unknown }).count === 1
      );
    }, 'canvas interaction');
    await useExtensionInstanceStore.getState().saveNow(record!.id);
    const edited = useExtensionInstanceStore.getState().records[record!.id];
    check(
      'canvas-persists',
      Boolean(
        edited &&
          'state' in edited &&
          edited.presentation.title === 'Counter: 1'
      )
    );
    useCanvasStore.getState().deleteNodes([nodeId!]);
    const canvas = useCanvasStore.getState();
    check(
      'canvas-cleanup',
      (await rpcSaveManifest(canvas.activeViewId, canvas.nodes, canvas.edges))
        .success
    );
  };

  const exerciseScriptedImporter = async () => {
    await request('select', { scenario: 'valid' });
    await pluginRuntime.startImporterSession(CSV_IMPORTER, 'notes-csv');
    let session = pluginRuntime.getSnapshot().importSession;
    if (session?.status === 'configuring' && session.canPrepare) {
      check(
        'importer-suggested-mapping',
        session.mapping?.title === 'title' &&
          session.mapping.text === 'text' &&
          session.mapping.color === 'color'
      );
      await pluginRuntime.prepareImporterSession(session.operationId);
    }
    session = pluginRuntime.getSnapshot().importSession;
    check(
      'importer-preview',
      session?.status === 'preview' &&
        session.notes.length === 101 &&
        session.segments.length === 2 &&
        session.notes[0]?.title === 'Public example'
    );
    const operationId = session!.operationId;
    await pluginRuntime.confirmImporterSession(operationId);
    await waitFor(
      () => pluginRuntime.getSnapshot().importSession?.status === 'completed',
      'importer commit'
    );
    session = pluginRuntime.getSnapshot().importSession;
    check(
      'importer-commits',
      session?.completedNotes === 101 && session.canRollback === true
    );
    await pluginRuntime.rollbackImporterSession(operationId);
    await waitFor(
      () => pluginRuntime.getSnapshot().importSession?.status === 'rolled-back',
      'importer rollback'
    );
    check('importer-rollback', true);
    pluginRuntime.cancelImporterSession(operationId);
  };

  const exerciseUpdate = async (
    example: T5Example,
    installed: InstalledPluginSummary
  ) => {
    if (!example.updateVersion) {
      throw new Error(`${example.id} has no update version to exercise`);
    }
    const preview = await request<PluginUpdatePreview>('prepare-update', {
      digest: installed.digest,
      pluginId: example.id,
    });
    check(
      'public-update-preview',
      preview.currentVersion === example.installVersion &&
        preview.plugin.id === example.id &&
        preview.plugin.version === example.updateVersion &&
        preview.plugin.signatureStatus === 'verified' &&
        preview.source.kind === 'url' &&
        preview.source.label.startsWith('https://')
    );
    const committed = await commitPreview(preview);
    const row = pluginRow((await rpcListPluginPackages()).plugins, example.id);
    check(
      'public-update-retains-previous',
      Boolean(
        row &&
          !row.enabled &&
          row.version === example.updateVersion &&
          row.previousVersion === example.installVersion
      )
    );
    await enable(committed);
    await waitFor(
      () => isRunning(example.id, example.updateVersion),
      `${example.id}@${example.updateVersion} activation`
    );
    check('public-update-runtime-version', true);
  };

  const runManualPicker = async () => {
    const note = (step: string, message: string) =>
      request('picker-note', { message, step });
    await waitFor(() => isRunning(CSV_IMPORTER), 'importer activation', 60_000);
    const pickerOutcome: Record<string, unknown> = {};
    report.manualPicker = pickerOutcome;

    await note(
      'select',
      'Native picker opened: choose manual-picker-sample.csv from the evidence directory.'
    );
    const selectStarted = Date.now();
    await pluginRuntime.startImporterSession(CSV_IMPORTER, 'notes-csv');
    await waitFor(
      () => {
        const session = pluginRuntime.getSnapshot().importSession;
        return session === null || session.status !== 'selecting';
      },
      'manual selection',
      MANUAL_PICKER_TIMEOUT_MS
    );
    let session = pluginRuntime.getSnapshot().importSession;
    check('manual-picker-selected', session !== null && session.file !== null);
    if (session?.status === 'configuring' && session.canPrepare) {
      await pluginRuntime.prepareImporterSession(session.operationId);
    }
    session = pluginRuntime.getSnapshot().importSession;
    pickerOutcome.select = {
      durationMs: Date.now() - selectStarted,
      fileName: session?.file?.name,
      fileSize: session?.file?.size,
      notes: session?.notes.length,
      status: session?.status,
    };
    check(
      'manual-picker-preview',
      session?.status === 'preview' && session.notes.length > 0
    );
    pluginRuntime.cancelImporterSession(session!.operationId);
    await waitFor(
      () => pluginRuntime.getSnapshot().importSession === null,
      'manual selection cleanup'
    );

    await note(
      'cancel',
      'Native picker opened again: press Cancel without choosing a file.'
    );
    const cancelStarted = Date.now();
    await pluginRuntime.startImporterSession(CSV_IMPORTER, 'notes-csv');
    await waitFor(
      () => {
        const current = pluginRuntime.getSnapshot().importSession;
        return current === null || current.status !== 'selecting';
      },
      'manual cancellation',
      MANUAL_PICKER_TIMEOUT_MS
    );
    session = pluginRuntime.getSnapshot().importSession;
    pickerOutcome.cancel = {
      durationMs: Date.now() - cancelStarted,
      sessionCleared: session === null,
    };
    check('manual-picker-cancelled', session === null);
    check('manual-picker-no-residual-session', isRunning(CSV_IMPORTER));
  };

  try {
    check('releaseScheme', location.href.startsWith('views://mainview/'));
    const config = await request<T5Config>('config');
    report.phase = config.phase;
    report.baseUrl = config.baseUrl;
    report.picker = config.picker;
    report.hostRange = config.hostRange;
    check('publicHttpsBase', config.baseUrl.startsWith('https://'));
    const byId = new Map(config.examples.map((item) => [item.id, item]));
    const example = (id: string) => {
      const found = byId.get(id);
      if (!found) {
        throw new Error(`Inventory is missing ${id}`);
      }
      return found;
    };
    await waitForRuntimeWorkspace();

    if (config.phase === 'install') {
      const installed = new Map<string, InstalledPluginSummary>();
      for (const id of EXAMPLE_IDS) {
        installed.set(id, await installExample(example(id)));
      }
      await waitFor(
        () => EXAMPLE_IDS.every((id) => isRunning(id)),
        'four public examples running'
      );
      check('four-public-examples-running', true);
      await waitFor(hasExpectedContributions, 'template contributions');
      check('template-contributions-exact', true);
      await exerciseDomPanel(HELLO, 'hello');
      await exerciseDomPanel(REACT_HELLO, 'hello');
      await exerciseDomPanel(COMBINED, 'import-help');
      await exerciseCanvasType();
      if (config.picker === 'scripted') {
        await exerciseScriptedImporter();
      }
      await exerciseUpdate(example(HELLO), installed.get(HELLO)!);
      await pluginRuntime.runCommand(HELLO, 'open-hello');
      await waitFor(
        () => Boolean(panelElement(HELLO, 'hello')),
        'updated hello panel'
      );
      pluginRuntime.closePanel(HELLO, 'hello');
      check('updated-command-still-runs', true);
    } else if (config.phase === 'restart') {
      const hello = example(HELLO);
      await waitFor(
        () =>
          EXAMPLE_IDS.every((id) =>
            isRunning(
              id,
              id === HELLO
                ? (hello.updateVersion ?? hello.installVersion)
                : example(id).installVersion
            )
          ),
        'four public examples restored after restart',
        60_000
      );
      check('restart-restores-four-examples', true);
      await waitFor(hasExpectedContributions, 'template contributions');
      check('restart-contributions-exact', true);
      const listed = await rpcListPluginPackages();
      check(
        'restart-signatures-verified',
        EXAMPLE_IDS.every(
          (id) =>
            pluginRow(listed.plugins, id)?.plugin?.signatureStatus ===
            'verified'
        )
      );
      check(
        'restart-update-history-kept',
        pluginRow(listed.plugins, HELLO)?.previousVersion ===
          hello.installVersion
      );
      await exerciseDomPanel(HELLO, 'hello');
    } else {
      check('manual-picker-mode', config.picker === 'manual');
      await runManualPicker();
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
  try {
    await acknowledgeStartup();
  } catch (error) {
    report.startupReadyError = String(error);
    report.passed = false;
  }
  await request('report', report);
}
