import {
  rpcCommitPluginInstall,
  rpcEnablePlugin,
  rpcGetLocalHttpEndpoint,
  rpcListPluginPackages,
  rpcPrepareNormalPluginStart,
  rpcRestorePluginMigrationBackup,
  rpcRollbackPlugin,
} from '@/lib/rpc';
import type {
  InstalledPluginSummary,
  PluginInstallPreview,
  PluginUpdatePreview,
} from '../../../shared/plugins/management';
import { pluginRuntime } from '../runtime';

const PLUGIN_ID = 'community.example.t4';
const INSTANCE_ID = 'extinst_t4migration';

type T4Phase = 'migration' | 'safe-mode' | 'safe-recovery' | 'update';

interface T4Config {
  phase: T4Phase;
}

interface MigrationResponse {
  error?: string;
  record?: {
    appVersion: string;
    dataVersion: number;
    id: string;
    presentation: { title: string };
    revision: number;
    state: { count: number };
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 20_000;
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
  pluginId = PLUGIN_ID
): InstalledPluginSummary | undefined {
  return plugins.find((plugin) => plugin.pluginId === pluginId);
}

export async function runT4Probe(): Promise<void> {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('Packaged app required');
  }
  const request = async <T>(route: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${endpoint.baseUrl}/plugin-t4/${route}`, {
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
    stage: 'T4/trusted plugin recovery and migration',
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
  const waitForRuntimeWorkspace = async () => {
    await waitFor(
      () => Boolean(pluginRuntime.getSnapshot().workspaceId),
      'plugin host snapshot'
    );
  };
  const waitForPlugin = async (version: string) => {
    await waitFor(
      () =>
        pluginRuntime
          .getSnapshot()
          .plugins.some(
            (plugin) =>
              plugin.pluginId === PLUGIN_ID &&
              plugin.version === version &&
              plugin.status === 'running'
          ),
      `plugin ${PLUGIN_ID}@${version} activation`
    );
  };
  const commitPreview = async (preview: PluginInstallPreview) => {
    const committed = await rpcCommitPluginInstall(preview.transactionId);
    if (!committed.success) {
      throw new Error(committed.error);
    }
    return committed.plugin;
  };
  const expectSafeMode = async (active: boolean) => {
    await waitForRuntimeWorkspace();
    const listed = await rpcListPluginPackages();
    check(`safeModeActive-${active}`, listed.safeMode.active === active);
    check(
      `safeModeNextStart-${active}`,
      listed.safeMode.nextStart === 'normal' ||
        listed.safeMode.nextStart === 'safe-mode'
    );
    check(
      `runtimeEmpty-${active}`,
      pluginRuntime.getSnapshot().plugins.length === 0
    );
    return listed.safeMode;
  };

  try {
    check('releaseScheme', location.href.startsWith('views://mainview/'));
    const config = await request<T4Config>('config');
    report.phase = config.phase;

    if (config.phase === 'safe-mode') {
      const safeMode = await expectSafeMode(true);
      check('explicitSafeModeReason', safeMode.reason === 'explicit');
      const prepared = await rpcPrepareNormalPluginStart();
      check(
        'safeModeRecoveryPrepared',
        prepared.success &&
          prepared.safeMode.active &&
          prepared.safeMode.nextStart === 'normal'
      );
    } else if (config.phase === 'safe-recovery') {
      const safeMode = await expectSafeMode(false);
      check('safeModeRecovered', !safeMode.active);
      check('safeModeRecoveryReasonCleared', safeMode.reason === undefined);
    } else if (config.phase === 'update') {
      await waitForRuntimeWorkspace();
      const firstPreview = await request<PluginInstallPreview>('prepare-file', {
        package: 'v1',
      });
      check(
        'signedInitialPreview',
        firstPreview.plugin.id === PLUGIN_ID &&
          firstPreview.plugin.version === '1.0.0' &&
          firstPreview.plugin.signatureStatus === 'verified' &&
          firstPreview.source.kind === 'file'
      );
      const first = await commitPreview(firstPreview);
      const afterCommit = await rpcListPluginPackages();
      const committedRow = pluginRow(afterCommit.plugins);
      check(
        'commitStartsDisabled',
        Boolean(
          committedRow &&
            !committedRow.enabled &&
            committedRow.version === '1.0.0' &&
            committedRow.plugin?.signatureStatus === 'verified'
        )
      );
      const enabledFirst = await rpcEnablePlugin({
        digest: first.digest,
        pluginId: first.pluginId,
      });
      if (!enabledFirst.success) {
        throw new Error(enabledFirst.error);
      }
      await waitForPlugin('1.0.0');
      check(
        'initialRuntimeVersion',
        pluginRuntime
          .getSnapshot()
          .plugins.some(
            (plugin) =>
              plugin.pluginId === PLUGIN_ID && plugin.version === '1.0.0'
          )
      );

      const updatePreview = await request<PluginUpdatePreview>(
        'prepare-update',
        { digest: first.digest, pluginId: PLUGIN_ID }
      );
      check(
        'updatePreviewBindsSource',
        updatePreview.currentVersion === '1.0.0' &&
          updatePreview.plugin.id === PLUGIN_ID &&
          updatePreview.plugin.version === '1.1.0' &&
          updatePreview.plugin.signatureStatus === 'verified' &&
          updatePreview.source.kind === 'url'
      );
      const second = await commitPreview(updatePreview);
      const afterUpdateCommit = await rpcListPluginPackages();
      const updateRow = pluginRow(afterUpdateCommit.plugins);
      check(
        'updateRetainsPreviousVersion',
        Boolean(
          updateRow &&
            !updateRow.enabled &&
            updateRow.version === '1.1.0' &&
            updateRow.previousVersion === '1.0.0'
        )
      );
      const enabledSecond = await rpcEnablePlugin({
        digest: second.digest,
        pluginId: second.pluginId,
      });
      if (!enabledSecond.success) {
        throw new Error(enabledSecond.error);
      }
      await waitForPlugin('1.1.0');
      check(
        'updatedRuntimeVersion',
        pluginRuntime
          .getSnapshot()
          .plugins.some(
            (plugin) =>
              plugin.pluginId === PLUGIN_ID && plugin.version === '1.1.0'
          )
      );

      let keyChangeError = '';
      try {
        await request<PluginInstallPreview>('prepare-file', {
          package: 'keyChange',
        });
      } catch (error) {
        keyChangeError = String(error);
      }
      check(
        'rejectsAuthorKeyChange',
        keyChangeError.toLowerCase().includes('author key changed')
      );
      const afterKeyChange = await rpcListPluginPackages();
      const unchanged = pluginRow(afterKeyChange.plugins);
      check(
        'keyChangeKeepsCurrent',
        Boolean(
          unchanged &&
            unchanged.version === '1.1.0' &&
            unchanged.enabled &&
            unchanged.digest === second.digest
        )
      );

      const rolledBack = await rpcRollbackPlugin({
        digest: second.digest,
        pluginId: PLUGIN_ID,
      });
      if (!rolledBack.success) {
        throw new Error(rolledBack.error);
      }
      check(
        'rollbackRestoresPreviousCode',
        rolledBack.plugin.version === '1.0.0' &&
          rolledBack.plugin.digest === first.digest &&
          !rolledBack.plugin.enabled &&
          rolledBack.plugin.previousVersion === undefined
      );
      await waitFor(
        () =>
          !pluginRuntime
            .getSnapshot()
            .plugins.some((plugin) => plugin.pluginId === PLUGIN_ID),
        'runtime release after rollback'
      );

      await request('descriptor-mode', { mode: 'bad' });
      let badDigestError = '';
      try {
        await request<PluginUpdatePreview>('prepare-update', {
          digest: first.digest,
          pluginId: PLUGIN_ID,
        });
      } catch (error) {
        badDigestError = String(error);
      }
      check(
        'rejectsBadReleaseDigest',
        badDigestError.toLowerCase().includes('sha256')
      );
      const afterBadDigest = await rpcListPluginPackages();
      const afterBad = pluginRow(afterBadDigest.plugins);
      check(
        'badDigestKeepsRollbackTarget',
        Boolean(
          afterBad &&
            afterBad.version === '1.0.0' &&
            afterBad.digest === first.digest &&
            !afterBad.enabled
        )
      );
    } else {
      await waitForRuntimeWorkspace();
      const seeded = await request<MigrationResponse>('migration', {
        action: 'seed',
      });
      check(
        'migrationSeed',
        seeded.record?.id === INSTANCE_ID &&
          seeded.record.dataVersion === 1 &&
          seeded.record.revision === 1 &&
          seeded.record.state.count === 1
      );
      const failedUpgrade = await request<MigrationResponse>('migration', {
        action: 'failed-upgrade',
      });
      check(
        'failedMigrationPreservesLiveData',
        failedUpgrade.error === 'revision-conflict' &&
          failedUpgrade.record?.dataVersion === 1 &&
          failedUpgrade.record.revision === 1 &&
          failedUpgrade.record.state.count === 1 &&
          failedUpgrade.record.presentation.title === 'Before migration'
      );
      const upgraded = await request<MigrationResponse>('migration', {
        action: 'upgrade',
      });
      check(
        'migrationUpgrade',
        upgraded.record?.dataVersion === 2 &&
          upgraded.record.revision === 2 &&
          upgraded.record.state.count === 2
      );
      const beforeRestore = await rpcListPluginPackages();
      const migrationRow = pluginRow(beforeRestore.plugins);
      check('migrationBackupVisible', migrationRow?.migrationBackupCount === 1);
      check(
        'migrationPluginDisabledBeforeRestore',
        migrationRow?.enabled === false
      );
      const restored = await rpcRestorePluginMigrationBackup(PLUGIN_ID);
      check(
        'migrationRestore',
        restored.success && restored.restored === 1 && restored.skipped === 0
      );
      const restoredInstance = await request<MigrationResponse>('migration', {
        action: 'read',
      });
      check(
        'migrationDataRestored',
        restoredInstance.record?.id === INSTANCE_ID &&
          restoredInstance.record.dataVersion === 1 &&
          restoredInstance.record.revision === 3 &&
          restoredInstance.record.state.count === 1 &&
          restoredInstance.record.presentation.title === 'Before migration'
      );
      const afterRestore = await rpcListPluginPackages();
      const restoredRow = pluginRow(afterRestore.plugins);
      check(
        'migrationBackupConsumed',
        restoredRow?.migrationBackupCount === undefined ||
          restoredRow.migrationBackupCount === 0
      );
      check('migrationPluginRemainsDisabled', restoredRow?.enabled === false);
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
