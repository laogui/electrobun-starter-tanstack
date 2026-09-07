import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createOperationContext,
  createPluginSession,
} from '../../shared/plugins/session';
import { pluginIsolationMatrix } from './isolationMatrix';
import { loadPluginDirectory } from './loadDirectory';
import { createProbeHost } from './probeHost';
import { runPluginCommandInWorker } from './workerRuntime';

const TITLE_TOOLS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/plugins/title-tools'
);

const HANG_SOURCE = `export async function normalizeTitles() {
  while (true) {}
}
`;

const CRASH_SOURCE = `export async function normalizeTitles() {
  throw new Error('plugin exploded');
}
`;

describe('plugin isolation', () => {
  it('records the current-desktop isolation matrix honestly', () => {
    const matrix = pluginIsolationMatrix();
    expect(matrix.rendererBundleCEF).toBe(false);
    expect(matrix.logicWorkerTerminate).toBe('verified');
    expect(matrix.nativeBridge).toBe('host-proxy-only');
    expect(matrix.extraBrowserView).toBe('unverified');
    if (process.platform === 'darwin') {
      expect(matrix.sandboxIframe).toBe('host-proxy-only');
    }
  });

  it('runs title-tools in a worker and keeps the host usable after timeout and crash', async () => {
    const loaded = await loadPluginDirectory(TITLE_TOOLS_DIR);
    const probe = createProbeHost([
      { token: 'sel_a', title: '  Hello   world ', revision: 1 },
    ]);

    const okSession = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_iso',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read'],
    });
    const ok = await runPluginCommandInWorker({
      session: okSession,
      commandId: 'normalize-titles',
      source: loaded.sources['main.js'] ?? '',
      probe,
      timeoutMs: 2000,
    });
    expect(ok.preview).toEqual([{ token: 'sel_a', title: 'Hello world' }]);

    const hangSession = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_iso',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read'],
    });
    const hangStarted = Date.now();
    await expect(
      runPluginCommandInWorker({
        session: hangSession,
        commandId: 'normalize-titles',
        source: HANG_SOURCE,
        probe,
        timeoutMs: 200,
      })
    ).rejects.toMatchObject({ code: 'timeout' });
    expect(Date.now() - hangStarted).toBeLessThan(2000);

    const afterTimeout = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_iso',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read'],
    });
    const recovered = await runPluginCommandInWorker({
      session: afterTimeout,
      commandId: 'normalize-titles',
      source: loaded.sources['main.js'] ?? '',
      probe,
      timeoutMs: 2000,
    });
    expect(recovered.preview?.[0]?.token).toBe('sel_a');

    const crashSession = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_iso',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read'],
    });
    await expect(
      runPluginCommandInWorker({
        session: crashSession,
        commandId: 'normalize-titles',
        source: CRASH_SOURCE,
        probe,
        timeoutMs: 2000,
      })
    ).rejects.toThrow('plugin exploded');
    expect(crashSession.disposed).toBe(true);

    const afterCrash = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_iso',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read'],
    });
    const stillWorks = await runPluginCommandInWorker({
      session: afterCrash,
      commandId: 'normalize-titles',
      source: loaded.sources['main.js'] ?? '',
      probe,
      timeoutMs: 2000,
    });
    expect(stillWorks.preview).toHaveLength(1);
  }, 15_000);
});
