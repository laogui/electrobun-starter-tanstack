import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createOperationContext,
  createPluginSession,
  disposeSession,
  receivePluginMessage,
} from '../../shared/plugins/session';
import { loadPluginDirectory, PluginDirectoryError } from './loadDirectory';
import { runPluginCommand } from './logicRuntime';
import { createProbeHost } from './probeHost';

const TITLE_TOOLS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/plugins/title-tools'
);

describe('title-tools directory probe', () => {
  it('loads a command-only fixture that does not import GhostBoard source', async () => {
    const loaded = await loadPluginDirectory(TITLE_TOOLS_DIR);
    expect(loaded.manifest.id).toBe('community.example.title-tools');
    expect(loaded.manifest.contributes.commands).toHaveLength(1);
    expect(loaded.manifest.contributes.canvasTypes).toEqual([]);
    expect(loaded.manifest.contributes.panels).toEqual([]);
    expect(loaded.sources['main.js']).not.toContain('instanceId');
    expect(loaded.sources['main.js']).not.toContain('useCanvasStore');
    expect(loaded.sources['main.js']).not.toContain('electrobun');
  });

  it('runs normalize-titles over operation context and echoes host selection tokens', async () => {
    const loaded = await loadPluginDirectory(TITLE_TOOLS_DIR);
    const session = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_probe',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read'],
    });
    const probe = createProbeHost([
      { token: 'sel_a', title: '  Hello   world ', revision: 3 },
      { token: 'sel_b', title: 'Notes', revision: 1 },
    ]);

    const result = await runPluginCommand({
      session,
      commandId: 'normalize-titles',
      source: loaded.sources['main.js'] ?? '',
      probe,
    });

    expect(session.context.kind).toBe('operation');
    expect(result.preview).toEqual([
      { token: 'sel_a', title: 'Hello world' },
      { token: 'sel_b', title: 'Notes' },
    ]);
    expect(probe.calls).toEqual([
      { method: 'content.readSelection', args: { fields: ['title'] } },
    ]);
  });

  it('denies ungranted host calls and refuses commands after dispose', async () => {
    const loaded = await loadPluginDirectory(TITLE_TOOLS_DIR);
    const session = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_probe',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read'],
    });
    expect(
      receivePluginMessage(session, {
        type: 'host-call',
        payload: { method: 'fs.read' },
      })
    ).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(
      receivePluginMessage(session, {
        type: 'host-call',
        payload: { method: 'content.applyBatch' },
      })
    ).toMatchObject({ ok: false, error: { code: 'permission-denied' } });

    disposeSession(session);
    await expect(
      runPluginCommand({
        session,
        commandId: 'normalize-titles',
        source: loaded.sources['main.js'] ?? '',
        probe: createProbeHost([]),
      })
    ).rejects.toMatchObject({ code: 'runtime-unavailable' });
  });

  it('rejects a fixture that imports GhostBoard source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'plugin-host-import-'));
    await writeFile(
      join(dir, 'ghostboard.plugin.json'),
      JSON.stringify({
        manifestVersion: 1,
        id: 'community.evil.host-import',
        name: 'Evil',
        version: '1.0.0',
        engines: { hostApi: '>=1.0.0 <2.0.0' },
        contributes: {
          commands: [
            {
              id: 'steal',
              name: 'Steal',
              handler: 'main.js#steal',
            },
          ],
        },
      })
    );
    await writeFile(
      join(dir, 'main.js'),
      "import { useCanvasStore } from '../../../src/mainview/store/canvasStore';\nexport async function steal() { return useCanvasStore.getState(); }\n"
    );

    await expect(loadPluginDirectory(dir)).rejects.toBeInstanceOf(
      PluginDirectoryError
    );
    await expect(loadPluginDirectory(dir)).rejects.toMatchObject({
      code: 'host-import',
    });
  });
});
