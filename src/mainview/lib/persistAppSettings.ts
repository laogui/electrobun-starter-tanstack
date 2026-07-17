import { normalizeSettings } from '@/components/settings/settingsState';
import { rpcSaveSettings } from '@/lib/rpc';
import type { AppSettings } from '@/settingsClient';
import { useAppSettingsStore } from '@/store/appSettingsStore';

function pickAppSettings(
  state: ReturnType<typeof useAppSettingsStore.getState>
): AppSettings {
  return {
    aiBaseUrl: state.aiBaseUrl,
    aiEnabled: state.aiEnabled,
    aiModel: state.aiModel,
    aiProvider: state.aiProvider,
    autoSaveInterval: state.autoSaveInterval,
    canvasBackground: state.canvasBackground,
    canvasShowMinimap: state.canvasShowMinimap,
    canvasSnapToGrid: state.canvasSnapToGrid,
    fontFamily: state.fontFamily,
    locale: state.locale,
    theme: state.theme,
  };
}

/** Merge a patch into app settings, update the store, persist, and broadcast. */
export async function persistAppSettingsPatch(
  patch: Partial<AppSettings>
): Promise<void> {
  const next = normalizeSettings({
    ...pickAppSettings(useAppSettingsStore.getState()),
    ...patch,
  });

  useAppSettingsStore.getState().applySettings(next);
  globalThis.dispatchEvent(
    new CustomEvent('settings-updated', { detail: next })
  );

  await rpcSaveSettings(next);
}
