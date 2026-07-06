// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/settingsClient';

import { SettingsDialog } from './SettingsDialog';

const createSettingsClientMock = vi.hoisted(() =>
  vi.fn(() => ({ client: true }))
);

vi.mock('@/settingsClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/settingsClient')>();
  return {
    ...actual,
    createSettingsClient: createSettingsClientMock,
  };
});

vi.mock('./SettingsApp', () => ({
  SettingsApp: ({
    onSettingsChange,
  }: {
    onSettingsChange: (settings: typeof DEFAULT_SETTINGS) => void;
  }) => (
    <button
      onClick={() =>
        onSettingsChange({
          ...DEFAULT_SETTINGS,
          locale: 'zh',
          theme: 'dark',
        })
      }
      type="button"
    >
      Change settings
    </button>
  ),
}));

describe('SettingsDialog', () => {
  beforeEach(() => {
    createSettingsClientMock.mockClear();
  });

  it('forwards settings changes and dispatches the shared settings-updated event', async () => {
    const onSettingsChange = vi.fn();
    const eventHandler = vi.fn();
    globalThis.addEventListener('settings-updated', eventHandler);

    render(
      <SettingsDialog
        onOpenChange={vi.fn()}
        onSettingsChange={onSettingsChange}
        open
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Change settings' })
    );

    const expected = {
      ...DEFAULT_SETTINGS,
      locale: 'zh',
      theme: 'dark',
    };
    expect(onSettingsChange).toHaveBeenCalledWith(expected);
    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect((eventHandler.mock.calls[0]?.[0] as CustomEvent).detail).toEqual(
      expected
    );

    globalThis.removeEventListener('settings-updated', eventHandler);
  });
});
