import { appState } from '../../appState';
import { getCachedSettings, persistSettings } from '../../settings';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createSettingsHandlers(
  _ctx: RpcContext
): RpcRequestHandlers<'getSettings' | 'saveSettings'> {
  return {
    getSettings: () => getCachedSettings(),

    saveSettings: async (settings) => {
      await persistSettings(settings);
      appState.mainRpc?.send?.settingsUpdated(getCachedSettings());
      return { success: true };
    },
  };
}
