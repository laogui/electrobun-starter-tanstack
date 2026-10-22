import type {
  AIConnectionSettings,
  AIProvider,
} from '../shared/ai/providerConfig';
import { type AIServerConfig, validateAIConfig } from './ai';
import { appState } from './appState';
import { getCachedSettings } from './settings';

/**
 * Assemble the live AI server config from cached settings + the API key stored
 * in `~/.ghostboard/{channel}/ai-credentials.json`. Returns null when AI is disabled or a
 * cloud provider is missing its key, which makes /ai/chat reply 503.
 */
export function getProviderKey(provider: AIProvider): string | undefined {
  const environmentKey =
    process.env[`GHOSTBOARD_AI_${provider.toUpperCase()}_API_KEY`] ||
    (provider === appState.legacyEnvProvider
      ? process.env.GHOSTBOARD_AI_API_KEY
      : undefined);
  return appState.cachedAIKeys[provider] || environmentKey;
}

export function buildAIConfig(
  settings: AIConnectionSettings = getCachedSettings()
): AIServerConfig | null {
  if (settings === getCachedSettings() && !getCachedSettings().aiEnabled) {
    return null;
  }
  const config: AIServerConfig = {
    provider: settings.aiProvider,
    model: settings.aiModel.trim(),
    apiKey: getProviderKey(settings.aiProvider),
    baseUrl: settings.aiBaseUrl.trim() || undefined,
  };
  return validateAIConfig(config) ? config : null;
}
