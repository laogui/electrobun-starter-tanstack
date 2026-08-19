// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

import { SettingsApp } from './SettingsApp';
import { applyTheme, normalizeSettings } from './settingsState';

const overlayScrollbarsPropsMock = vi.hoisted(() => vi.fn());

vi.mock('overlayscrollbars-react', async () => {
  const React = await import('react');

  return {
    OverlayScrollbarsComponent: ({
      children,
      defer,
      element = 'div',
      options,
      ...props
    }: {
      children: React.ReactNode;
      defer?: unknown;
      element?: keyof React.JSX.IntrinsicElements;
      options?: unknown;
      [key: string]: unknown;
    }) => {
      overlayScrollbarsPropsMock({ defer, element, options, ...props });

      return React.createElement(
        element,
        {
          ...props,
          'data-testid': 'settings-overlay-scrollbars',
        },
        children
      );
    },
  };
});

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
  getAICredentialStatus: vi.fn().mockResolvedValue({ hasApiKey: false }),
  setAIApiKey: vi.fn().mockResolvedValue({ success: true }),
});

function renderSettingsApp(
  client: SettingsClient,
  props: {
    onSettingsChange?: (settings: AppSettings) => void;
    variant?: 'dialog' | 'window';
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsApp client={client} {...props} />
    </QueryClientProvider>
  );
}

describe('SettingsApp helpers', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.lang = 'en';
    document.documentElement.removeAttribute('data-base-ui-scroll-locked');
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
    overlayScrollbarsPropsMock.mockClear();
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
    overlayScrollbarsPropsMock.mockClear();
  });

  it('loads settings into localized Tailwind/Base UI controls', async () => {
    const client = createClient({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      locale: 'zh',
    });

    renderSettingsApp(client);

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

  it('uses OverlayScrollbars for dialog content with the settings scrollbar theme', async () => {
    const client = createClient({
      ...DEFAULT_SETTINGS,
      theme: 'system',
      locale: 'en',
    });

    renderSettingsApp(client, { variant: 'dialog' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Settings' })
    ).toBeVisible();

    const scrollArea = screen.getByTestId('settings-overlay-scrollbars');
    expect(scrollArea.tagName).toBe('SECTION');
    expect(scrollArea).toHaveClass('settings-scrollbar');
    expect(scrollArea).not.toHaveClass('overflow-y-auto');
    expect(overlayScrollbarsPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defer: true,
        element: 'section',
        options: expect.objectContaining({
          overflow: { x: 'hidden' },
          scrollbars: expect.objectContaining({
            autoHide: 'leave',
            theme: 'os-theme-settings',
          }),
        }),
      })
    );
  });

  it('saves when a setting changes', async () => {
    const client = createClient({
      ...DEFAULT_SETTINGS,
      theme: 'system',
      locale: 'en',
    });

    renderSettingsApp(client);

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

  it('notifies the host when a setting changes so the main window can share UI state', async () => {
    const client = createClient({
      ...DEFAULT_SETTINGS,
      theme: 'system',
      locale: 'en',
    });
    const onSettingsChange = vi.fn();

    renderSettingsApp(client, { onSettingsChange });

    const user = userEvent.setup();
    const themeSelect = await screen.findByRole('combobox', { name: 'Theme' });
    await user.click(themeSelect);
    await user.click(await screen.findByRole('option', { name: 'Dark' }));

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalledWith({
        ...DEFAULT_SETTINGS,
        theme: 'dark',
        locale: 'en',
      });
    });
  });

  it('saves when the snap-to-grid setting changes', async () => {
    const client = createClient({
      ...DEFAULT_SETTINGS,
      canvasSnapToGrid: true,
      locale: 'en',
    });

    renderSettingsApp(client);

    const user = userEvent.setup();
    const snapSelect = await screen.findByRole('combobox', {
      name: 'Snap to grid',
    });
    await user.click(snapSelect);
    await user.click(await screen.findByRole('option', { name: 'Off' }));

    await waitFor(() => {
      expect(client.saveSettings).toHaveBeenCalledWith({
        ...DEFAULT_SETTINGS,
        canvasSnapToGrid: false,
        locale: 'en',
      });
    });
  });

  it('saves when the minimap setting changes', async () => {
    const client = createClient({
      ...DEFAULT_SETTINGS,
      canvasShowMinimap: true,
      locale: 'en',
    });

    renderSettingsApp(client);

    const user = userEvent.setup();
    const minimapSelect = await screen.findByRole('combobox', {
      name: 'Show minimap',
    });
    await user.click(minimapSelect);
    await user.click(await screen.findByRole('option', { name: 'Off' }));

    await waitFor(() => {
      expect(client.saveSettings).toHaveBeenCalledWith({
        ...DEFAULT_SETTINGS,
        canvasShowMinimap: false,
        locale: 'en',
      });
    });
  });

  it('opens the canvas types panel empty state', async () => {
    const client = createClient({
      ...DEFAULT_SETTINGS,
      locale: 'en',
    });

    renderSettingsApp(client);

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Canvas Types' })
    );

    expect(
      await screen.findByText('No canvas types are registered in this build.')
    ).toBeVisible();
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
    renderSettingsApp(client);
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

    renderSettingsApp(client);
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

    renderSettingsApp(client);
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

    renderSettingsApp(client);
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

    renderSettingsApp(client);
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

    renderSettingsApp(client);
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
