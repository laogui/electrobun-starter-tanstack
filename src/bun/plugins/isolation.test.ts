import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createOperationContext,
  createPluginSession,
} from '../../shared/plugins/session';
import { pluginIsolationMatrix } from './isolationMatrix';
import { loadPluginDirectory } from './loadDirectory';
import { runPluginCommand } from './logicRuntime';
import { createProbeHost } from './probeHost';

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
  it.each([
    'return ctx.content.readSelection({ value: 1n });',
    'const value = {}; value.self = value; return ctx.content.readSelection(value);',
    'return { value: 1n };',
  ])('rejects non-JSON QuickJS traffic without crashing the host: %s', async (body) => {
    const loaded = await loadPluginDirectory(TITLE_TOOLS_DIR);
    const session = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_invalid',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read', 'content.selection.write'],
    });
    const probe = createProbeHost([]);
    await expect(
      runPluginCommand({
        session,
        commandId: 'normalize-titles',
        source: `export async function normalizeTitles(ctx) { ${body} }`,
        probe,
      })
    ).rejects.toMatchObject({ code: 'protocol-error' });
    expect(probe.calls).toEqual([]);
    expect(session.disposed).toBe(true);
    expect(session.pendingRequestIds.size).toBe(0);
    const next = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_invalid',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read', 'content.selection.write'],
    });
    await expect(
      runPluginCommand({
        session: next,
        commandId: 'normalize-titles',
        source: loaded.sources['main.js'] ?? '',
        probe,
      })
    ).resolves.toMatchObject({ preview: [] });
  });

  it('records the current-desktop isolation matrix honestly', () => {
    const matrix = pluginIsolationMatrix();
    expect(matrix.rendererBundleCEF).toBe(false);
    expect(matrix.logicQuickJS).toBe('unverified');
    expect(matrix.nativeBridge).toBe('host-proxy-only');
    expect(matrix.extraBrowserView).toBe('unverified');
    expect(matrix.sandboxIframe).toBe('unverified');
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      expect(pluginIsolationMatrix(platform).logicQuickJS).toBe('unverified');
    }
  });

  it('runs title-tools in QuickJS and keeps the host usable after timeout and crash', async () => {
    const loaded = await loadPluginDirectory(TITLE_TOOLS_DIR);
    const probe = createProbeHost([
      { token: 'sel_a', title: '  Hello   world ', revision: 1 },
    ]);

    const okSession = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_iso',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read', 'content.selection.write'],
    });
    const ok = await runPluginCommand({
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
      grantedPermissions: ['content.selection.read', 'content.selection.write'],
    });
    const hangStarted = Date.now();
    await expect(
      runPluginCommand({
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
      grantedPermissions: ['content.selection.read', 'content.selection.write'],
    });
    const recovered = await runPluginCommand({
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
      grantedPermissions: ['content.selection.read', 'content.selection.write'],
    });
    await expect(
      runPluginCommand({
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
      grantedPermissions: ['content.selection.read', 'content.selection.write'],
    });
    const stillWorks = await runPluginCommand({
      session: afterCrash,
      commandId: 'normalize-titles',
      source: loaded.sources['main.js'] ?? '',
      probe,
      timeoutMs: 2000,
    });
    expect(stillWorks.preview).toHaveLength(1);
  }, 15_000);
});
