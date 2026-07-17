import { isCanvasBackgroundSetting } from '@/lib/canvasBackground';
import {
  AI_PROVIDER_OPTIONS,
  type AIProviderSetting,
  type AppSettings,
  AUTO_SAVE_INTERVAL_OPTIONS,
  type AutoSaveIntervalSetting,
  DEFAULT_SETTINGS,
  type FontFamilySetting,
  type LocaleSetting,
  type ThemeSetting,
} from '@/settingsClient';

const THEME_VALUES: readonly ThemeSetting[] = ['system', 'light', 'dark'];
const LOCALE_VALUES: readonly LocaleSetting[] = ['en', 'zh'];
const FONT_VALUES: readonly FontFamilySetting[] = ['system', 'serif', 'mono'];

function includesValue<TValue extends number | string>(
  values: readonly TValue[],
  value: unknown
): value is TValue {
  return values.includes(value as TValue);
}

export function normalizeSettings(
  settings: Partial<AppSettings> | null | undefined
): AppSettings {
  const canvasBackground = settings?.canvasBackground;

  return {
    theme: includesValue(THEME_VALUES, settings?.theme)
      ? settings.theme
      : DEFAULT_SETTINGS.theme,
    locale: includesValue(LOCALE_VALUES, settings?.locale)
      ? settings.locale
      : DEFAULT_SETTINGS.locale,
    fontFamily: includesValue(FONT_VALUES, settings?.fontFamily)
      ? settings.fontFamily
      : DEFAULT_SETTINGS.fontFamily,
    canvasBackground: isCanvasBackgroundSetting(canvasBackground)
      ? canvasBackground
      : DEFAULT_SETTINGS.canvasBackground,
    canvasShowMinimap:
      typeof settings?.canvasShowMinimap === 'boolean'
        ? settings.canvasShowMinimap
        : DEFAULT_SETTINGS.canvasShowMinimap,
    canvasSnapToGrid:
      typeof settings?.canvasSnapToGrid === 'boolean'
        ? settings.canvasSnapToGrid
        : DEFAULT_SETTINGS.canvasSnapToGrid,
    autoSaveInterval: includesValue(
      AUTO_SAVE_INTERVAL_OPTIONS,
      settings?.autoSaveInterval
    )
      ? (settings.autoSaveInterval as AutoSaveIntervalSetting)
      : DEFAULT_SETTINGS.autoSaveInterval,
    aiEnabled:
      typeof settings?.aiEnabled === 'boolean'
        ? settings.aiEnabled
        : DEFAULT_SETTINGS.aiEnabled,
    aiProvider: includesValue(AI_PROVIDER_OPTIONS, settings?.aiProvider)
      ? (settings.aiProvider as AIProviderSetting)
      : DEFAULT_SETTINGS.aiProvider,
    aiModel:
      typeof settings?.aiModel === 'string' && settings.aiModel.length > 0
        ? settings.aiModel
        : DEFAULT_SETTINGS.aiModel,
    aiBaseUrl:
      typeof settings?.aiBaseUrl === 'string'
        ? settings.aiBaseUrl
        : DEFAULT_SETTINGS.aiBaseUrl,
  };
}

export function applyTheme(theme: ThemeSetting) {
  const html = document.documentElement;

  if (theme === 'dark') {
    html.classList.add('dark');
    return;
  }

  if (theme === 'light') {
    html.classList.remove('dark');
    return;
  }

  html.classList.toggle(
    'dark',
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches
  );
}
