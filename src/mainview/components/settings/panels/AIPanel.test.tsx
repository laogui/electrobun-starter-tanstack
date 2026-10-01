// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  createSettingsClient,
  DEFAULT_SETTINGS,
  type SettingsClient,
} from '@/settingsClient';
import { getLocaleStrings } from '../i18n/getLocaleStrings';
import { AIPanel } from './AIPanel';

function Harness({ client }: { client: SettingsClient }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  return (
    <AIPanel
      client={client}
      key={settings.aiProvider}
      onUpdate={(patch) =>
        setSettings((previous) => ({ ...previous, ...patch }))
      }
      settings={settings}
      strings={getLocaleStrings('zh')}
    />
  );
}

describe('AI provider settings UI', () => {
  it('restores independent models/URLs, saves the selected provider key, and tests unsaved configuration', async () => {
    const strings = getLocaleStrings('zh');
    const client = {
      ...createSettingsClient(),
      getAICredentialStatus: vi.fn(async () => ({ hasApiKey: true })),
      setAIApiKey: vi.fn(async () => ({ success: true })),
      testAIConnection: vi.fn(async () => ({ success: true })),
    };
    const user = userEvent.setup();
    render(<Harness client={client} />);
    await user.click(
      screen.getByRole('combobox', { name: strings.aiProviderLabel })
    );
    await user.click(
      await screen.findByRole('option', { name: strings.aiProviderCustom })
    );
    fireEvent.change(screen.getByLabelText(strings.aiModelLabel), {
      target: { value: 'my-custom-model' },
    });
    fireEvent.change(screen.getByLabelText(strings.aiBaseUrlLabel), {
      target: { value: 'https://model.example/v1' },
    });
    fireEvent.change(screen.getByLabelText(strings.aiApiKeyLabel), {
      target: { value: 'private-test-key' },
    });
    expect(
      screen.getByRole('button', { name: strings.aiTestConnection })
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: strings.aiApiKeySave })
    );
    await waitFor(() =>
      expect(client.setAIApiKey).toHaveBeenCalledWith(
        'private-test-key',
        'custom'
      )
    );
    await user.click(
      screen.getByRole('button', { name: strings.aiTestConnection })
    );
    await screen.findByText(strings.aiTestSuccess);
    expect(client.testAIConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        aiProvider: 'custom',
        aiModel: 'my-custom-model',
        aiBaseUrl: 'https://model.example/v1',
      })
    );
    await user.click(
      screen.getByRole('combobox', { name: strings.aiProviderLabel })
    );
    await user.click(
      await screen.findByRole('option', { name: strings.aiProviderOpenai })
    );
    expect(screen.getByLabelText(strings.aiBaseUrlLabel)).toHaveValue('');
    expect(screen.getByLabelText(strings.aiModelLabel)).toHaveValue(
      'gpt-4.1-mini'
    );
    await user.click(
      screen.getByRole('combobox', { name: strings.aiProviderLabel })
    );
    await user.click(
      await screen.findByRole('option', { name: strings.aiProviderCustom })
    );
    expect(screen.getByLabelText(strings.aiBaseUrlLabel)).toHaveValue(
      'https://model.example/v1'
    );
    expect(screen.getByLabelText(strings.aiModelLabel)).toHaveValue(
      'my-custom-model'
    );
    expect(screen.getByLabelText(strings.aiApiKeyLabel)).toHaveValue('');
  });
});
