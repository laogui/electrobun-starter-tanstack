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
  rpcPreparePluginInstallFromFile: vi.fn(),
  rpcPreparePluginInstallFromUrl: vi.fn(),
}));

vi.mock('@/lib/rpc', () => rpc);

const plugin: PluginPackageSummary = {
  capabilities: ['files'],
  signatureStatus: 'unverified',
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
    expect(
      await screen.findByText('Enabled for this workspace (runtime pending)')
    ).toBeVisible();
    expect(
      await screen.findByText('Saved workspace enablement for Title tools.')
    ).toBeVisible();
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

  it('displays capabilities as claims and makes unverified signatures explicit', async () => {
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
        'Author identity and signature not verified. Signed updates are pending T4.'
      )
    ).toBeVisible();
    expect(
      screen.getByText('Declared update source: Not declared')
    ).toBeVisible();
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
