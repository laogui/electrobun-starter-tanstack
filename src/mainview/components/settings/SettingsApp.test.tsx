// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSettings, SettingsClient } from '@/settingsClient';

import { applyTheme, normalizeSettings, SettingsApp } from './SettingsApp';

const createClient = (settings: AppSettings): SettingsClient => ({
  getSettings: vi.fn().mockResolvedValue(settings),
  saveSettings: vi.fn().mockResolvedValue({ success: true }),
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
        defaultLayoutMode: 'grid' as never,
        locale: 'fr' as never,
        theme: 'sepia' as never,
      })
    ).toEqual({
      theme: 'system',
      locale: 'en',
      defaultLayoutMode: 'canvas',
    });
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
      theme: 'dark',
      locale: 'zh',
      defaultLayoutMode: 'document',
    });

    render(<SettingsApp client={client} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: '设置' })
    ).toBeVisible();
    expect(screen.getByRole('combobox', { name: '主题' })).toHaveTextContent(
      '深色'
    );
    expect(
      screen.getByRole('combobox', { name: '默认布局' })
    ).toHaveTextContent('文档');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.lang).toBe('zh');
    expect(document.title).toBe('设置');
  });

  it('saves when a setting changes', async () => {
    const client = createClient({
      theme: 'system',
      locale: 'en',
      defaultLayoutMode: 'canvas',
    });

    render(<SettingsApp client={client} />);

    const user = userEvent.setup();
    const themeSelect = await screen.findByRole('combobox', { name: 'Theme' });
    await user.click(themeSelect);
    await user.click(await screen.findByRole('option', { name: 'Dark' }));

    await waitFor(() => {
      expect(client.saveSettings).toHaveBeenCalledWith({
        theme: 'dark',
        locale: 'en',
        defaultLayoutMode: 'canvas',
      });
    });
  });
});
