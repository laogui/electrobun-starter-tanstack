import { describe, expect, it } from 'vitest';
import {
  AI_PROVIDER_DEFAULTS,
  normalizeAIProfiles,
  switchAIProvider,
} from './providerConfig';

describe('provider configuration', () => {
  it('keeps model and URL isolated when switching providers and restores edited profiles', () => {
    const original = {
      aiProvider: 'custom' as const,
      aiModel: 'my-model',
      aiBaseUrl: 'https://example.test/v1',
    };
    const openai = switchAIProvider(original, 'openai');
    expect(openai.aiBaseUrl).toBe('');
    expect(openai.aiModel).toBe(AI_PROVIDER_DEFAULTS.openai.model);
    const anthropic = switchAIProvider(openai, 'anthropic');
    expect(anthropic.aiModel).toBe(AI_PROVIDER_DEFAULTS.anthropic.model);
    expect(switchAIProvider(anthropic, 'custom')).toMatchObject(original);
  });
  it('drops malformed profiles and does not copy secrets into settings', () => {
    expect(
      normalizeAIProfiles({
        custom: {
          model: 'm',
          baseUrl: 'https://api.test/v1',
          apiKey: 'secret',
        },
        openai: null,
        anthropic: { model: 1 },
      })
    ).toEqual({ custom: { model: 'm', baseUrl: 'https://api.test/v1' } });
  });
});
