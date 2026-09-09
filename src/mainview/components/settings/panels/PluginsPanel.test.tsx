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
  rpcDisablePluginCommands: vi.fn(),
  rpcEnablePluginCommands: vi.fn(),
  rpcListPluginPackages: vi.fn(),
  rpcPreparePluginInstallFromFile: vi.fn(),
  rpcPreparePluginInstallFromUrl: vi.fn(),
}));

vi.mock('@/lib/rpc', () => rpc);

const plugin: PluginPackageSummary = {
  commands: [
    {
      id: 'normalize-titles',
      name: 'Normalize titles',
    },
  ],
  contributionKinds: ['command'],
  description: 'Normalize selected note titles.',
  hostApi: '>=1.0.0 <2.0.0',
  id: 'community.example.title-tools',
  name: 'Title tools',
  permissions: {
    optional: [],
    required: [
      {
        id: 'content.selection.read',
        reason: 'Reads the current selection to update titles.',
      },
    ],
  },
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
  commandActivation: {
    enabled: true,
    grantedPermissions: ['content.selection.read'],
  },
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
      await screen.findByText(
        'No plugin packages are stored in this workspace.'
      )
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Choose package…' }));

    expect(await screen.findByText('Review package')).toBeVisible();
    expect(screen.getByText('Title tools')).toBeVisible();
    expect(
      screen.getByText(
        'GhostBoard checked this archive without executing its code. Review the package before storing it in this workspace.'
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
    expect(await screen.findByText('Stored — not activated')).toBeVisible();
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

  it('requires a second confirmation before granting and enabling commands', async () => {
    const user = userEvent.setup();
    rpc.rpcListPluginPackages
      .mockResolvedValueOnce({ available: true, plugins: [storedPlugin] })
      .mockResolvedValueOnce({ available: true, plugins: [enabledPlugin] });
    rpc.rpcEnablePluginCommands.mockResolvedValue({
      plugin: enabledPlugin,
      success: true,
    });

    render(<PluginsPanel strings={getLocaleStrings('en')} />);

    await user.click(
      await screen.findByRole('button', { name: 'Enable 1 command(s)' })
    );
    expect(
      await screen.findByText('Enable Title tools commands?')
    ).toBeVisible();
    expect(rpc.rpcEnablePluginCommands).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Grant and enable commands' })
    );

    await waitFor(() => {
      expect(rpc.rpcEnablePluginCommands).toHaveBeenCalledWith({
        digest: storedPlugin.digest,
        pluginId: storedPlugin.pluginId,
      });
    });
    expect(await screen.findByText('Commands enabled')).toBeVisible();
    expect(
      await screen.findByText('Enabled commands from Title tools.')
    ).toBeVisible();
  });
});
