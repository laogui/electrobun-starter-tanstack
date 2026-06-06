// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AppSettings,
  DEFAULT_SETTINGS,
  type SettingsClient,
  TRASH_UPDATED_EVENT,
  type TrashEntry,
  type UnlinkedFileEntry,
} from '@/settingsClient';

import { applyTheme, normalizeSettings, SettingsApp } from './SettingsApp';

interface ClientOverrides {
  clearAllTrash?: () => Promise<{ purged: number; success: boolean }>;
  deleteUnlinkedNotes?: (
    files: string[]
  ) => Promise<{ deleted: string[]; skipped: string[] }>;
  listTrash?: () => Promise<TrashEntry[]>;
  purgeTrash?: (trashId: string) => Promise<{ success: boolean }>;
  restoreTrash?: (trashId: string) => Promise<{ success: boolean }>;
  scanUnlinkedNotes?: () => Promise<UnlinkedFileEntry[]>;
}

const createClient = (
  settings: AppSettings,
  overrides: ClientOverrides = {}
): SettingsClient => ({
  getSettings: vi.fn().mockResolvedValue(settings),
  saveSettings: vi.fn().mockResolvedValue({ success: true }),
  listTrash: vi.fn(overrides.listTrash ?? (() => Promise.resolve([]))),
  restoreTrash: vi.fn(
    overrides.restoreTrash ?? (() => Promise.resolve({ success: true }))
  ),
  purgeTrash: vi.fn(
    overrides.purgeTrash ?? (() => Promise.resolve({ success: true }))
  ),
  clearAllTrash: vi.fn(
    overrides.clearAllTrash ??
      (() => Promise.resolve({ success: true, purged: 0 }))
  ),
  scanUnlinkedNotes: vi.fn(
    overrides.scanUnlinkedNotes ?? (() => Promise.resolve([]))
  ),
  deleteUnlinkedNotes: vi.fn(
    overrides.deleteUnlinkedNotes ??
      (() => Promise.resolve({ deleted: [], skipped: [] }))
  ),
  getWorkspaceInfo: vi.fn().mockResolvedValue({
    path: '/tmp/workspace',
    isDefault: true,
  }),
  openWorkspaceFolder: vi.fn().mockResolvedValue({ success: true }),
  switchWorkspace: vi
    .fn()
    .mockResolvedValue({ canceled: true, success: false }),
  exportWorkspaceArchive: vi
    .fn()
    .mockResolvedValue({ canceled: true, success: false }),
  getAppInfo: vi.fn().mockResolvedValue({
    version: '1.0.0',
    hash: 'abcdef0123456789',
    channel: 'dev',
    name: 'GhostBoard',
    identifier: 'dev.ghostboard',
  }),
  checkForUpdate: vi.fn().mockResolvedValue({
    currentHash: 'abcdef0123456789',
    hash: 'abcdef0123456789',
    version: '1.0.0',
    updateAvailable: false,
  }),
});

describe('SettingsApp helpers', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.lang = 'en';
    document.documentElement.removeAttribute('data-base-ui-scroll-locked');
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
  });

  it('normalizes invalid persisted settings back to defaults', () => {
    expect(
      normalizeSettings({
        locale: 'fr' as never,
        theme: 'sepia' as never,
      })
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('applies explicit and system theme classes', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveClass('dark');

    applyTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');

    vi.mocked(globalThis.matchMedia).mockReturnValueOnce({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    });
    applyTheme('system');
    expect(document.documentElement).toHaveClass('dark');
  });
});

describe('SettingsApp', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.lang = 'en';
    document.documentElement.removeAttribute('data-base-ui-scroll-locked');
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
    document.title = '';
  });

  it('loads settings into localized Tailwind/Base UI controls', async () => {
    const client = createClient({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      locale: 'zh',
    });

    render(<SettingsApp client={client} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: '设置' })
    ).toBeVisible();
    expect(screen.getByRole('combobox', { name: '主题' })).toHaveTextContent(
      '深色'
    );
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.lang).toBe('zh');
    expect(document.title).toBe('设置');
  });

  it('saves when a setting changes', async () => {
    const client = createClient({
      ...DEFAULT_SETTINGS,
      theme: 'system',
      locale: 'en',
    });

    render(<SettingsApp client={client} />);

    const user = userEvent.setup();
    const themeSelect = await screen.findByRole('combobox', { name: 'Theme' });
    await user.click(themeSelect);
    await user.click(await screen.findByRole('option', { name: 'Dark' }));

    await waitFor(() => {
      expect(client.saveSettings).toHaveBeenCalledWith({
        ...DEFAULT_SETTINGS,
        theme: 'dark',
        locale: 'en',
      });
    });
  });
});

describe('SettingsApp trash section', () => {
  const baseSettings: AppSettings = {
    ...DEFAULT_SETTINGS,
    theme: 'light',
    locale: 'en',
  };

  const trashEntry: TrashEntry = {
    trashId: 'trash_abc',
    deletedAt: Date.UTC(2025, 0, 15, 12, 30),
    trashFile: 'trash/trash_abc.canvas.json',
    view: { id: 'view_x', name: 'My Canvas', file: 'views/view_x.canvas.json' },
  };

  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.lang = 'en';
    document.documentElement.removeAttribute('data-base-ui-scroll-locked');
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
    document.title = '';
  });

  /**
   * Trash + cleanup live inside the Workspace panel after the Phase 8
   * sidebar refactor. Switch to that panel before asserting on trash UI.
   */
  const openWorkspace = async () => {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Workspace' }));
    return user;
  };

  it('shows the empty state when trash is empty', async () => {
    const client = createClient(baseSettings);
    render(<SettingsApp client={client} />);
    await openWorkspace();

    expect(
      await screen.findByRole('heading', { name: 'Deleted Canvases' })
    ).toBeVisible();
    expect(screen.getByText('No deleted canvases.')).toBeVisible();
  });

  it('lists trash entries and restores them', async () => {
    const client = createClient(baseSettings, {
      listTrash: vi
        .fn()
        .mockResolvedValueOnce([trashEntry])
        .mockResolvedValueOnce([]),
    });

    render(<SettingsApp client={client} />);
    const user = await openWorkspace();

    expect(await screen.findByText('My Canvas')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Restore My Canvas' }));

    await waitFor(() => {
      expect(client.restoreTrash).toHaveBeenCalledWith('trash_abc');
    });
    await waitFor(() => {
      expect(screen.getByText('No deleted canvases.')).toBeVisible();
    });
  });

  it('purges trash entries after confirmation', async () => {
    const client = createClient(baseSettings, {
      listTrash: vi
        .fn()
        .mockResolvedValueOnce([trashEntry])
        .mockResolvedValueOnce([]),
    });

    render(<SettingsApp client={client} />);
    const user = await openWorkspace();

    await user.click(
      await screen.findByRole('button', {
        name: 'Permanently delete My Canvas',
      })
    );

    await user.click(
      await screen.findByRole('button', { name: 'Delete Forever' })
    );

    await waitFor(() => {
      expect(client.purgeTrash).toHaveBeenCalledWith('trash_abc');
    });
    await waitFor(() => {
      expect(screen.getByText('No deleted canvases.')).toBeVisible();
    });
  });

  it('shows an error message when restore fails', async () => {
    const client = createClient(baseSettings, {
      listTrash: vi.fn().mockResolvedValue([trashEntry]),
      restoreTrash: vi.fn().mockResolvedValue({ success: false }),
    });

    render(<SettingsApp client={client} />);
    const user = await openWorkspace();

    await user.click(
      await screen.findByRole('button', { name: 'Restore My Canvas' })
    );

    expect(await screen.findByText('Unable to restore canvas.')).toBeVisible();
  });

  it('reloads when a trash-updated event is dispatched', async () => {
    const listTrash = vi
      .fn<() => Promise<TrashEntry[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([trashEntry]);
    const client = createClient(baseSettings, { listTrash });

    render(<SettingsApp client={client} />);
    await openWorkspace();

    expect(await screen.findByText('No deleted canvases.')).toBeVisible();

    globalThis.dispatchEvent(new CustomEvent(TRASH_UPDATED_EVENT));

    expect(await screen.findByText('My Canvas')).toBeVisible();
    expect(listTrash).toHaveBeenCalledTimes(2);
  });

  it('clears all trash entries after second confirmation', async () => {
    const client = createClient(baseSettings, {
      listTrash: vi
        .fn<() => Promise<TrashEntry[]>>()
        .mockResolvedValueOnce([trashEntry])
        .mockResolvedValueOnce([]),
      clearAllTrash: vi.fn().mockResolvedValue({ success: true, purged: 1 }),
    });

    render(<SettingsApp client={client} />);
    const user = await openWorkspace();

    await user.click(await screen.findByRole('button', { name: 'Empty all' }));
    await user.click(
      await screen.findByRole('button', { name: 'Delete Forever' })
    );

    await waitFor(() => {
      expect(client.clearAllTrash).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('No deleted canvases.')).toBeVisible();
    });
  });
});
