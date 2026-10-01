import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMocks = vi.hoisted(() => ({
  rpcCheckForUpdate: vi.fn(),
  rpcClearAllTrash: vi.fn(),
  rpcDeleteUnlinkedNotes: vi.fn(),
  rpcExportWorkspaceArchive: vi.fn(),
  rpcGetAICredentialStatus: vi.fn(),
  rpcGetAppInfo: vi.fn(),
  rpcGetSettings: vi.fn(),
  rpcGetWorkspaceInfo: vi.fn(),
  rpcListTrash: vi.fn(),
  rpcOpenWorkspaceFolder: vi.fn(),
  rpcPurgeTrash: vi.fn(),
  rpcRestoreTrash: vi.fn(),
  rpcSaveSettings: vi.fn(),
  rpcScanUnlinkedNotes: vi.fn(),
  rpcSetAIApiKey: vi.fn(),
  rpcTestAIConnection: vi.fn(),
  rpcSwitchWorkspace: vi.fn(),
}));

vi.mock('@/lib/rpc', () => rpcMocks);

const loadModule = async () => await import('./settingsClient');

beforeEach(() => {
  vi.resetModules();
  for (const fn of Object.values(rpcMocks)) {
    fn.mockReset();
  }
});

describe('createSettingsClient', () => {
  it('uses the main renderer RPC wrappers for settings operations', async () => {
    const { createSettingsClient, DEFAULT_SETTINGS } = await loadModule();
    const client = createSettingsClient();
    const trash = [
      {
        deletedAt: 1,
        trashFile: 'trash/trash_1.canvas.json',
        trashId: 'trash_1',
        view: {
          file: 'views/old.canvas.json',
          id: 'old',
          name: 'Old Canvas',
        },
      },
    ];
    const unlinked = [
      {
        file: 'content/orphan.md',
        hasFrontmatterId: true,
        modifiedAt: 2,
        noteId: 'note_orphan',
        size: 10,
        title: 'Orphan',
      },
    ];

    rpcMocks.rpcGetSettings.mockResolvedValue(DEFAULT_SETTINGS);
    rpcMocks.rpcSaveSettings.mockResolvedValue({ success: true });
    rpcMocks.rpcListTrash.mockResolvedValue(trash);
    rpcMocks.rpcRestoreTrash.mockResolvedValue({ success: true });
    rpcMocks.rpcPurgeTrash.mockResolvedValue({ success: true });
    rpcMocks.rpcClearAllTrash.mockResolvedValue({ purged: 1, success: true });
    rpcMocks.rpcScanUnlinkedNotes.mockResolvedValue(unlinked);
    rpcMocks.rpcDeleteUnlinkedNotes.mockResolvedValue({
      deleted: ['content/orphan.md'],
      skipped: [],
    });
    rpcMocks.rpcGetWorkspaceInfo.mockResolvedValue({
      isDefault: false,
      path: '/tmp/workspace',
    });
    rpcMocks.rpcOpenWorkspaceFolder.mockResolvedValue({ success: true });
    rpcMocks.rpcSwitchWorkspace.mockResolvedValue({
      path: '/tmp/next-workspace',
      success: true,
    });
    rpcMocks.rpcExportWorkspaceArchive.mockResolvedValue({
      filePath: '/tmp/archive.zip',
      success: true,
    });
    rpcMocks.rpcGetAppInfo.mockResolvedValue({
      channel: 'prod',
      hash: 'hash',
      identifier: 'com.ghostboard.app',
      name: 'GhostBoard',
      version: '1.0.0',
    });
    rpcMocks.rpcCheckForUpdate.mockResolvedValue({
      currentHash: 'hash',
      hash: 'next',
      updateAvailable: true,
      version: '1.1.0',
    });
    rpcMocks.rpcGetAICredentialStatus.mockResolvedValue({ hasApiKey: true });
    rpcMocks.rpcSetAIApiKey.mockResolvedValue({ success: true });

    await expect(client.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    await expect(client.saveSettings(DEFAULT_SETTINGS)).resolves.toEqual({
      success: true,
    });
    await expect(client.listTrash()).resolves.toEqual(trash);
    await expect(client.restoreTrash('trash_1')).resolves.toEqual({
      success: true,
    });
    await expect(client.purgeTrash('trash_1')).resolves.toEqual({
      success: true,
    });
    await expect(client.clearAllTrash()).resolves.toEqual({
      purged: 1,
      success: true,
    });
    await expect(client.scanUnlinkedNotes()).resolves.toEqual(unlinked);
    await expect(
      client.deleteUnlinkedNotes(['content/orphan.md'])
    ).resolves.toEqual({
      deleted: ['content/orphan.md'],
      skipped: [],
    });
    await expect(client.getWorkspaceInfo()).resolves.toEqual({
      isDefault: false,
      path: '/tmp/workspace',
    });
    await expect(client.openWorkspaceFolder()).resolves.toEqual({
      success: true,
    });
    await expect(client.switchWorkspace()).resolves.toEqual({
      path: '/tmp/next-workspace',
      success: true,
    });
    await expect(client.exportWorkspaceArchive()).resolves.toEqual({
      filePath: '/tmp/archive.zip',
      success: true,
    });
    await expect(client.getAppInfo()).resolves.toMatchObject({
      name: 'GhostBoard',
    });
    await expect(client.checkForUpdate()).resolves.toMatchObject({
      updateAvailable: true,
    });
    await expect(client.getAICredentialStatus()).resolves.toEqual({
      hasApiKey: true,
    });
    await expect(client.setAIApiKey('sk-test')).resolves.toEqual({
      success: true,
    });

    expect(rpcMocks.rpcSaveSettings).toHaveBeenCalledWith(DEFAULT_SETTINGS);
    expect(rpcMocks.rpcRestoreTrash).toHaveBeenCalledWith('trash_1');
    expect(rpcMocks.rpcPurgeTrash).toHaveBeenCalledWith('trash_1');
    expect(rpcMocks.rpcDeleteUnlinkedNotes).toHaveBeenCalledWith([
      'content/orphan.md',
    ]);
    expect(rpcMocks.rpcSetAIApiKey).toHaveBeenCalledWith('sk-test');
  });
});
