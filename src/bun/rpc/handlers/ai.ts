import { isAIProvider } from '../../../shared/ai/providerConfig';
import { testAIConnection } from '../../ai';
import { buildAIConfig, getProviderKey } from '../../aiConfig';
import { saveAIApiKey } from '../../aicredentials';
import { runAITask } from '../../aiTasks';
import { appState } from '../../appState';
import { getCachedSettings } from '../../settings';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createAIHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  'getAICredentialStatus' | 'setAIApiKey' | 'testAIConnection' | 'aiRunTask'
> {
  const { wsPath } = ctx;
  return {
    getAICredentialStatus: ({
      provider = getCachedSettings().aiProvider,
    } = {}) => ({
      hasApiKey: Boolean(getProviderKey(provider)),
      source: appState.cachedAIKeys[provider]
        ? 'stored'
        : getProviderKey(provider)
          ? 'environment'
          : 'none',
    }),

    setAIApiKey: async ({
      apiKey,
      provider = getCachedSettings().aiProvider,
    }) => {
      if (!isAIProvider(provider)) {
        return { success: false };
      }
      await saveAIApiKey(apiKey, provider);
      if (apiKey?.trim()) {
        appState.cachedAIKeys[provider] = apiKey.trim();
      } else {
        delete appState.cachedAIKeys[provider];
      }
      appState.mainRpc?.send?.settingsUpdated(getCachedSettings());
      return { success: true };
    },

    testAIConnection: async (settings) => {
      if (
        !isAIProvider(settings.aiProvider) ||
        typeof settings.aiModel !== 'string' ||
        typeof settings.aiBaseUrl !== 'string'
      ) {
        return { success: false, error: 'configuration' };
      }
      const config = buildAIConfig(settings);
      return config
        ? testAIConnection(config)
        : { success: false, error: 'configuration' };
    },

    aiRunTask: async (params) => {
      const config = buildAIConfig();
      if (!config) {
        return { success: false, error: 'ai-disabled' };
      }
      return runAITask(params, config, wsPath);
    },
  };
}
