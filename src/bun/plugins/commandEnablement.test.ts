import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PluginCommandGrantStore,
  pluginCommandWorkspaceKey,
} from './commandEnablement';

describe('PluginCommandGrantStore', () => {
  it('keeps grants app-local and bound to one resolved workspace path', async () => {
    const appDataRoot = await mkdtemp(join(tmpdir(), 'plugin-grants-app-'));
    const workspace = await mkdtemp(join(tmpdir(), 'plugin-grants-workspace-'));
    const copiedWorkspace = await mkdtemp(
      join(tmpdir(), 'plugin-grants-workspace-copy-')
    );
    const store = new PluginCommandGrantStore({
      appDataRoot,
      workspacePath: workspace,
    });

    expect(pluginCommandWorkspaceKey(workspace)).not.toBe(
      pluginCommandWorkspaceKey(copiedWorkspace)
    );
    await store.enable({
      digest: 'a'.repeat(64),
      grantedPermissions: [
        'content.selection.write',
        'content.selection.read',
        'content.selection.read',
      ],
      packageFingerprint: 'b'.repeat(64),
      pluginId: 'community.example.title-tools',
      version: '1.0.0',
    });

    await expect(
      store.get({
        digest: 'a'.repeat(64),
        packageFingerprint: 'b'.repeat(64),
        pluginId: 'community.example.title-tools',
        version: '1.0.0',
      })
    ).resolves.toEqual(['content.selection.read', 'content.selection.write']);
    await expect(
      store.get({
        digest: 'a'.repeat(64),
        packageFingerprint: 'c'.repeat(64),
        pluginId: 'community.example.title-tools',
        version: '1.0.0',
      })
    ).resolves.toBeUndefined();
    await expect(
      new PluginCommandGrantStore({
        appDataRoot,
        workspacePath: copiedWorkspace,
      }).get({
        digest: 'a'.repeat(64),
        packageFingerprint: 'b'.repeat(64),
        pluginId: 'community.example.title-tools',
        version: '1.0.0',
      })
    ).resolves.toBeUndefined();

    const grantFile = join(appDataRoot, 'plugin-command-grants.json');
    expect(await readFile(grantFile, 'utf8')).not.toContain(workspace);
    expect((await stat(grantFile)).mode.toString(8).slice(-3)).toBe('600');
    await expect(store.disable('community.example.title-tools')).resolves.toBe(
      true
    );
    await expect(
      store.get({
        digest: 'a'.repeat(64),
        packageFingerprint: 'b'.repeat(64),
        pluginId: 'community.example.title-tools',
        version: '1.0.0',
      })
    ).resolves.toBeUndefined();
  });
});
