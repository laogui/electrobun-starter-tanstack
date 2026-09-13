// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  InstalledPluginSummary,
  PluginInstallPreview,
  PluginPackageSummary,
} from '../../../../shared/plugins/management';

import { getLocaleStrings } from '../i18n/getLocaleStrings';
import { PluginsPanel } from './PluginsPanel';

const rpc = vi.hoisted(() => ({
  rpcCancelPluginInstall: vi.fn(),
  rpcCommitPluginInstall: vi.fn(),
  rpcDisablePlugin: vi.fn(),
  rpcEnablePlugin: vi.fn(),
  rpcListPluginPackages: vi.fn(),
  rpcPrepareNormalPluginStart: vi.fn(),
  rpcPreparePluginInstallFromFile: vi.fn(),
  rpcPreparePluginDevelopmentDirectory: vi.fn(),
  rpcPreparePluginInstallFromUrl: vi.fn(),
  rpcPreparePluginUpdate: vi.fn(),
  rpcRollbackPlugin: vi.fn(),
  rpcRestorePluginMigrationBackup: vi.fn(),
}));

vi.mock('@/lib/rpc', () => rpc);

const plugin: PluginPackageSummary = {
  capabilities: ['files'],
  signatureStatus: 'unsigned',
  description: 'Normalize selected note titles.',
  ghostboard: '>=1.0.0 <2.0.0',
  id: 'community.example.title-tools',
  name: 'Title tools',
  version: '1.0.0',
};

const preview: PluginInstallPreview = {
  digest: '4e3e4a6a56f3c3f0163a67cb392ea3c14b0d38dfbe367a0fb2f3994afe4c4b4e',
  plugin,
  source: { kind: 'file', label: 'title-tools.zip' },
  transactionId: 'plginst_123',
};

const storedPlugin: InstalledPluginSummary = {
  digest: preview.digest,
  enabled: false,
  installedAt: '2026-09-08T12:00:00.000Z',
  name: plugin.name,
  plugin,
  pluginId: plugin.id,
  source: preview.source,
  status: 'stored',
  version: plugin.version,
};

const enabledPlugin: InstalledPluginSummary = {
  ...storedPlugin,
  enabled: true,
};

describe('PluginsPanel', () => {
  beforeEach(() => {
    for (const mock of Object.values(rpc)) {
      mock.mockReset();
    }
    rpc.rpcListPluginPackages.mockResolvedValue({
      available: true,
      plugins: [],
    });
    rpc.rpcCancelPluginInstall.mockResolvedValue({ success: true });
  });

  it('requires explicit review confirmation before storing a selected package', async () => {
    const user = userEvent.setup();
    rpc.rpcPreparePluginInstallFromFile.mockResolvedValue({
      preview,
      success: true,
    });
    rpc.rpcCommitPluginInstall.mockResolvedValue({
      plugin: storedPlugin,
      success: true,
    });

    render(<PluginsPanel strings={getLocaleStrings('en')} />);

    expect(
      await screen.findByText('No plugin packages are installed.')
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Choose package…' }));

    expect(await screen.findByText('Review package')).toBeVisible();
    expect(screen.getByText('Title tools')).toBeVisible();
    expect(
      screen.getByText(
        'GhostBoard checked this archive without executing its code. Review it before installing for this application. Installation does not enable it.'
      )
    ).toBeVisible();
    expect(rpc.rpcCommitPluginInstall).not.toHaveBeenCalled();

    rpc.rpcListPluginPackages.mockResolvedValue({
      available: true,
      plugins: [storedPlugin],
    });
    await user.click(screen.getByRole('button', { name: 'Install package' }));

    await waitFor(() => {
      expect(rpc.rpcCommitPluginInstall).toHaveBeenCalledWith('plginst_123');
    });
    expect(await screen.findByText('Installed Title tools.')).toBeVisible();
    expect(
      await screen.findByText('Installed, not enabled in this workspace')
    ).toBeVisible();
  });

  it('keeps management available in recovery safe mode and prepares a normal next launch', async () => {
    const user = userEvent.setup();
    rpc.rpcListPluginPackages.mockResolvedValue({
      available: true,
      plugins: [enabledPlugin],
      safeMode: {
        active: true,
        nextStart: 'safe-mode',
        reason: 'previous-startup-incomplete',
      },
    });
    rpc.rpcPrepareNormalPluginStart.mockResolvedValue({
      success: true,
      safeMode: {
        active: true,
        nextStart: 'normal',
        reason: 'previous-startup-incomplete',
      },
    });

    render(<PluginsPanel strings={getLocaleStrings('en')} />);

    expect(await screen.findByText('Plugin safe mode is active')).toBeVisible();
    expect(
      screen.getByText(
        'GhostBoard entered safe mode automatically because the previous plugin startup did not finish.'
      )
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Disable for workspace' })
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: 'Try enabled plugins on next launch',
      })
    );
    await waitFor(() =>
      expect(rpc.rpcPrepareNormalPluginStart).toHaveBeenCalledOnce()
    );
    expect(
      await screen.findByText(
        'The next launch will try enabled plugins. This session remains in safe mode.'
      )
    ).toBeVisible();
  });

  it('reviews and connects a development directory without enabling or executing it', async () => {
    const user = userEvent.setup();
    const directoryPreview = {
      ...preview,
      source: { kind: 'directory' as const, label: '/outside/hello' },
    };
    rpc.rpcPreparePluginDevelopmentDirectory.mockResolvedValue({
      success: true,
      preview: directoryPreview,
    });
    rpc.rpcCommitPluginInstall.mockResolvedValue({
      success: true,
      plugin: { ...storedPlugin, source: directoryPreview.source },
    });
    render(<PluginsPanel strings={getLocaleStrings('en')} />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Connect development directory…',
      })
    );
    expect(
      await screen.findByText(getLocaleStrings('en').pluginsDirectoryPreview)
    ).toBeVisible();
    expect(
      screen.getByText(
        getLocaleStrings('en').pluginsDirectoryFingerprint(preview.digest)
      )
    ).toBeVisible();
    expect(rpc.rpcCommitPluginInstall).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Connect directory' }));
    await waitFor(() =>
      expect(rpc.rpcCommitPluginInstall).toHaveBeenCalledWith(
        preview.transactionId
      )
    );
    expect(rpc.rpcEnablePlugin).not.toHaveBeenCalled();
  });

  it('cancels a reviewed package without committing it', async () => {
    const user = userEvent.setup();
    rpc.rpcPreparePluginInstallFromFile.mockResolvedValue({
      preview,
      success: true,
    });

    render(<PluginsPanel strings={getLocaleStrings('en')} />);

    await user.click(
      await screen.findByRole('button', { name: 'Choose package…' })
    );
    expect(await screen.findByText('Review package')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(rpc.rpcCancelPluginInstall).toHaveBeenCalledWith('plginst_123');
    });
    expect(screen.queryByText('Review package')).not.toBeInTheDocument();
    expect(rpc.rpcCommitPluginInstall).not.toHaveBeenCalled();
  });

  it('uses the same review flow for a package URL', async () => {
    const user = userEvent.setup();
    rpc.rpcPreparePluginInstallFromUrl.mockResolvedValue({
      preview,
      success: true,
    });

    render(<PluginsPanel strings={getLocaleStrings('en')} />);

    await user.type(
      await screen.findByRole('textbox', { name: 'Package URL' }),
      'https://example.com/title-tools.zip'
    );
    await user.click(screen.getByRole('button', { name: 'Inspect link' }));

    await waitFor(() => {
      expect(rpc.rpcPreparePluginInstallFromUrl).toHaveBeenCalledWith(
        'https://example.com/title-tools.zip'
      );
    });
    expect(await screen.findByText('Review package')).toBeVisible();
  });

  it('requires high-trust confirmation before saving workspace enablement', async () => {
    const user = userEvent.setup();
    rpc.rpcListPluginPackages
      .mockResolvedValueOnce({ available: true, plugins: [storedPlugin] })
      .mockResolvedValueOnce({ available: true, plugins: [enabledPlugin] });
    rpc.rpcEnablePlugin.mockResolvedValue({
      plugin: enabledPlugin,
      success: true,
    });

    render(<PluginsPanel strings={getLocaleStrings('en')} />);

    await user.click(
      await screen.findByRole('button', { name: 'Enable for workspace' })
    );
    expect(await screen.findByText('Enable Title tools?')).toBeVisible();
    expect(rpc.rpcEnablePlugin).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'I trust this plugin, enable' })
    );

    await waitFor(() => {
      expect(rpc.rpcEnablePlugin).toHaveBeenCalledWith({
        digest: storedPlugin.digest,
        pluginId: storedPlugin.pluginId,
      });
    });
    expect(await screen.findByText('Enabled for this workspace')).toBeVisible();
    expect(
      await screen.findByText('Saved workspace enablement for Title tools.')
    ).toBeVisible();
  });
  it('keeps a disable action available for an invalid enabled plugin', async () => {
    rpc.rpcListPluginPackages.mockResolvedValue({
      available: true,
      plugins: [
        {
          ...enabledPlugin,
          status: 'invalid',
          validationError: 'Broken manifest',
        },
      ],
    });
    rpc.rpcDisablePlugin.mockResolvedValue({
      success: true,
      plugin: { ...storedPlugin, status: 'invalid' },
    });
    render(<PluginsPanel strings={getLocaleStrings('en')} />);
    const user = userEvent.setup();
    expect(await screen.findByText('Broken manifest')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Disable for workspace' })
    );
    await waitFor(() =>
      expect(rpc.rpcDisablePlugin).toHaveBeenCalledWith({
        pluginId: plugin.id,
        digest: preview.digest,
      })
    );
    expect(
      screen.queryByRole('button', { name: 'Enable for workspace' })
    ).not.toBeInTheDocument();
  });

  it('shows legacy packages without an enable action', async () => {
    rpc.rpcListPluginPackages.mockResolvedValue({
      available: true,
      plugins: [{ ...storedPlugin, status: 'legacy', plugin: undefined }],
    });
    render(<PluginsPanel strings={getLocaleStrings('zh')} />);
    expect(await screen.findByText('旧契约，需重新安装 v2 版本')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '为此工作区启用' })
    ).not.toBeInTheDocument();
  });

  it('displays capabilities as claims and makes unsigned packages explicit', async () => {
    rpc.rpcListPluginPackages.mockResolvedValue({
      available: true,
      plugins: [storedPlugin],
    });
    render(<PluginsPanel strings={getLocaleStrings('en')} />);
    expect(
      await screen.findByText('Declared capabilities (not enforced)')
    ).toBeVisible();
    expect(screen.getByText('files')).toBeVisible();
    expect(
      screen.getByText(
        'Unsigned package. It can be used locally but cannot update this plugin ID in place.'
      )
    ).toBeVisible();
    expect(
      screen.getByText('Declared update source: Not declared')
    ).toBeVisible();
  });

  it('shows verified author continuity for signed packages', async () => {
    rpc.rpcListPluginPackages.mockResolvedValue({
      available: true,
      plugins: [
        {
          ...storedPlugin,
          plugin: { ...plugin, signatureStatus: 'verified' },
        },
      ],
    });
    render(<PluginsPanel strings={getLocaleStrings('en')} />);
    expect(
      await screen.findByText(
        'Author signature verified. Updates must keep this author key and update source.'
      )
    ).toBeVisible();
  });

  it('checks a signed fixed update source and presents the verified package for review', async () => {
    const user = userEvent.setup();
    const signed = {
      ...storedPlugin,
      plugin: {
        ...plugin,
        signatureStatus: 'verified' as const,
        updateUrl: 'https://example.com/releases.json',
      },
    };
    rpc.rpcListPluginPackages.mockResolvedValue({
      available: true,
      plugins: [signed],
    });
    rpc.rpcPreparePluginUpdate.mockResolvedValue({
      success: true,
      preview: {
        ...preview,
        currentVersion: '1.0.0',
        plugin: { ...signed.plugin, version: '1.1.0' },
      },
    });
    render(<PluginsPanel strings={getLocaleStrings('en')} />);

    await user.click(
      await screen.findByRole('button', { name: 'Check for update' })
    );
    expect(
      await screen.findByText('Verified update 1.1.0 is ready for review.')
    ).toBeVisible();
    expect(screen.getByText('Review package')).toBeVisible();
    expect(rpc.rpcPreparePluginUpdate).toHaveBeenCalledWith({
      digest: signed.digest,
      pluginId: signed.pluginId,
    });
  });

  it('offers explicit code rollback and keeps the restored version disabled', async () => {
    const user = userEvent.setup();
    const current = {
      ...storedPlugin,
      previousVersion: '0.9.0',
      version: '1.0.0',
    };
    const restored = {
      ...current,
      previousVersion: undefined,
      version: '0.9.0',
    };
    rpc.rpcListPluginPackages
      .mockResolvedValueOnce({ available: true, plugins: [current] })
      .mockResolvedValueOnce({ available: true, plugins: [restored] });
    rpc.rpcRollbackPlugin.mockResolvedValue({
      success: true,
      plugin: restored,
    });
    render(<PluginsPanel strings={getLocaleStrings('en')} />);

    await user.click(
      await screen.findByRole('button', {
        name: 'Roll back code to 0.9.0',
      })
    );
    expect(
      await screen.findByText(
        'Rolled back to 0.9.0. The plugin remains disabled until you review and enable it.'
      )
    ).toBeVisible();
    expect(rpc.rpcRollbackPlugin).toHaveBeenCalledWith({
      digest: current.digest,
      pluginId: current.pluginId,
    });
  });
  it('warns before restoring migrated instance data and reports the disabled result', async () => {
    const user = userEvent.setup();
    const migrated = {
      ...storedPlugin,
      enabled: true,
      migrationBackupCount: 2,
    };
    rpc.rpcListPluginPackages
      .mockResolvedValueOnce({ available: true, plugins: [migrated] })
      .mockResolvedValueOnce({
        available: true,
        plugins: [{ ...storedPlugin, enabled: false }],
      });
    rpc.rpcRestorePluginMigrationBackup.mockResolvedValue({
      restored: 2,
      skipped: 0,
      success: true,
    });
    render(<PluginsPanel strings={getLocaleStrings('en')} />);

    await user.click(
      await screen.findByRole('button', {
        name: 'Restore 2 pre-migration backup',
      })
    );
    expect(
      screen.getByText('Restore data from before migration?')
    ).toBeVisible();
    expect(
      screen.getByText(
        'This disables the plugin and replaces migrated instance data with the latest pre-migration copies. Changes made after migration may be lost. A guard copy of the current data is retained on disk.'
      )
    ).toBeVisible();
    expect(rpc.rpcRestorePluginMigrationBackup).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Restore backed-up data' })
    );
    expect(
      await screen.findByText(
        'Restored 2 instance data backup. The plugin remains disabled.'
      )
    ).toBeVisible();
    expect(rpc.rpcRestorePluginMigrationBackup).toHaveBeenCalledWith(
      migrated.pluginId
    );
  });
  it('keeps a failed cancellation review available for retry', async () => {
    const user = userEvent.setup();
    rpc.rpcPreparePluginInstallFromFile.mockResolvedValue({
      preview,
      success: true,
    });
    rpc.rpcCancelPluginInstall.mockResolvedValueOnce({ success: false });
    render(<PluginsPanel strings={getLocaleStrings('en')} />);
    await user.click(
      await screen.findByRole('button', { name: 'Choose package…' })
    );
    expect(await screen.findByText('Review package')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Choose package…' })
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByText('Review package')).toBeVisible();
    expect(rpc.rpcCommitPluginInstall).not.toHaveBeenCalled();
  });
});
