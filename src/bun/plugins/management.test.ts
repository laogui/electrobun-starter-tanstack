import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { PluginManagementService, pluginInstallRoot } from './management';

const FIXTURES_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/plugins'
);
const TITLE_TOOLS_ZIP = join(
  FIXTURES_ROOT,
  'community.example.title-tools-1.0.0.zip'
);

describe('PluginManagementService', () => {
  it('previews and then commits a local package without exposing its path', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'plugin-management-'));
    const appDataRoot = await mkdtemp(join(tmpdir(), 'plugin-management-app-'));
    const service = new PluginManagementService(workspace, { appDataRoot });

    expect(pluginInstallRoot(workspace)).toBe(
      join(workspace, '.ghostboard', 'plugins')
    );
    expect(await service.list()).toEqual([]);

    const preview = await service.prepareFromFile(TITLE_TOOLS_ZIP);
    expect(preview.plugin).toMatchObject({
      id: 'community.example.title-tools',
      name: '标题整理',
      version: '1.0.0',
      contributionKinds: ['command'],
    });
    expect(preview.source).toEqual({
      kind: 'file',
      label: 'community.example.title-tools-1.0.0.zip',
    });

    const installed = await service.commit(preview.transactionId);
    expect(installed).toMatchObject({
      pluginId: 'community.example.title-tools',
      name: '标题整理',
      status: 'stored',
      source: preview.source,
      plugin: { contributionKinds: ['command'] },
    });
    expect(JSON.stringify(installed)).not.toContain(workspace);
    expect(await service.list()).toEqual([installed]);
  });

  it('rejects a local file that is not a plugin archive before reading it', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'plugin-management-'));
    const appDataRoot = await mkdtemp(join(tmpdir(), 'plugin-management-app-'));
    const service = new PluginManagementService(workspace, { appDataRoot });

    await expect(
      service.prepareFromFile('/tmp/not-a-plugin.txt')
    ).rejects.toMatchObject({
      code: 'invalid-package',
    });
  });

  it('activates only saved commands and runs them through the constrained title host', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'plugin-management-'));
    const appDataRoot = await mkdtemp(join(tmpdir(), 'plugin-management-app-'));
    mkdirSync(join(workspace, 'content', '.ghostboard', 'blocknote'), {
      recursive: true,
    });
    writeFileSync(
      join(workspace, 'content', '.ghostboard', 'blocknote', 'note_a.json'),
      JSON.stringify({
        blocks: [],
        noteId: 'note_a',
        revision: 3,
        schema: 'ghostboard-blocknote/v1',
        title: '  Hello   world ',
        updatedAt: new Date().toISOString(),
      })
    );
    const fs = await import('node:fs');
    vi.stubGlobal('Bun', {
      file: vi.fn((filePath: string) => ({
        exists: async () => fs.existsSync(filePath),
        json: async () => JSON.parse(fs.readFileSync(filePath, 'utf8')),
        text: async () => fs.readFileSync(filePath, 'utf8'),
      })),
      write: vi.fn(async (filePath: string, data: string) => {
        await writeFile(filePath, data);
      }),
    });
    try {
      const service = new PluginManagementService(workspace, { appDataRoot });
      const preview = await service.prepareFromFile(TITLE_TOOLS_ZIP);
      const installed = await service.commit(preview.transactionId);

      expect(installed.commandActivation).toEqual({
        enabled: false,
        grantedPermissions: [],
      });
      await expect(
        service.runEnabledCommand({
          commandId: 'normalize-titles',
          noteIds: ['note_a'],
          pluginId: 'community.example.title-tools',
        })
      ).rejects.toMatchObject({ code: 'invalid-state' });

      const enabled = await service.enableCommands({
        digest: installed.digest,
        pluginId: installed.pluginId,
      });
      expect(enabled.commandActivation).toEqual({
        enabled: true,
        grantedPermissions: [
          'content.selection.read',
          'content.selection.write',
        ],
      });
      await expect(service.listEnabledCommands()).resolves.toEqual([
        {
          commandId: 'normalize-titles',
          commandName: '整理选中资料标题',
          pluginId: 'community.example.title-tools',
          pluginName: '标题整理',
        },
      ]);

      await expect(
        service.runEnabledCommand({
          commandId: 'normalize-titles',
          noteIds: ['note_a'],
          pluginId: 'community.example.title-tools',
        })
      ).resolves.toMatchObject({ titles: { note_a: 'Hello world' } });

      await service.disableCommands({
        digest: installed.digest,
        pluginId: installed.pluginId,
      });
      await expect(service.listEnabledCommands()).resolves.toEqual([]);
      await expect(
        service.runEnabledCommand({
          commandId: 'normalize-titles',
          noteIds: ['note_a'],
          pluginId: 'community.example.title-tools',
        })
      ).rejects.toMatchObject({ code: 'invalid-state' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
