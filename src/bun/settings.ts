import { join } from 'node:path';
import {
  type AIProviderProfiles,
  normalizeAIProfiles,
} from '../shared/ai/providerConfig';
import { atomicWrite } from './workspace';

export const FONT_FAMILY_VALUES = ['system', 'serif', 'mono'] as const;

export type FontFamilySetting = (typeof FONT_FAMILY_VALUES)[number];

export const CANVAS_BACKGROUND_PRESETS = [
  'default',
  'paper',
  'cream',
  'mono',
  'lavender',
  'sage',
  'mist',
  'sand',
  'ivory',
  'mint',
  'lichen',
] as const;

export const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isCanvasBackgroundSetting(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (includes(CANVAS_BACKGROUND_PRESETS, value) || HEX_COLOR_RE.test(value))
  );
}

export const AUTO_SAVE_INTERVAL_VALUES = [500, 800, 2000, 5000] as const;

export type AutoSaveIntervalSetting =
  (typeof AUTO_SAVE_INTERVAL_VALUES)[number];

export const AI_PROVIDER_VALUES = [
  'openai',
  'anthropic',
  'ollama',
  'custom',
] as const;

export interface AppSettings {
  aiBaseUrl: string;
  aiEnabled: boolean;
  aiModel: string;
  aiProfiles?: AIProviderProfiles;
  aiProvider: (typeof AI_PROVIDER_VALUES)[number];
  autoSaveInterval: AutoSaveIntervalSetting;
  canvasBackground: string;
  canvasShowMinimap: boolean;
  canvasSnapToGrid: boolean;
  fontFamily: FontFamilySetting;
  locale: string;
  theme: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  locale: 'en',
  fontFamily: 'system',
  canvasBackground: 'default',
  canvasShowMinimap: false,
  canvasSnapToGrid: true,
  autoSaveInterval: 800,
  aiEnabled: false,
  aiProvider: 'openai',
  aiModel: 'gpt-4.1-mini',
  aiBaseUrl: '',
};

export function includes<T extends string | number>(
  values: readonly T[],
  value: unknown
): value is T {
  return values.includes(value as T);
}

export function normalizeAppSettings(raw: Partial<AppSettings>): AppSettings {
  return {
    theme: typeof raw.theme === 'string' ? raw.theme : DEFAULT_SETTINGS.theme,
    locale:
      typeof raw.locale === 'string' ? raw.locale : DEFAULT_SETTINGS.locale,
    fontFamily: includes(FONT_FAMILY_VALUES, raw.fontFamily)
      ? raw.fontFamily
      : DEFAULT_SETTINGS.fontFamily,
    canvasBackground: isCanvasBackgroundSetting(raw.canvasBackground)
      ? raw.canvasBackground
      : DEFAULT_SETTINGS.canvasBackground,
    canvasShowMinimap:
      typeof raw.canvasShowMinimap === 'boolean'
        ? raw.canvasShowMinimap
        : DEFAULT_SETTINGS.canvasShowMinimap,
    canvasSnapToGrid:
      typeof raw.canvasSnapToGrid === 'boolean'
        ? raw.canvasSnapToGrid
        : DEFAULT_SETTINGS.canvasSnapToGrid,
    autoSaveInterval: includes(AUTO_SAVE_INTERVAL_VALUES, raw.autoSaveInterval)
      ? raw.autoSaveInterval
      : DEFAULT_SETTINGS.autoSaveInterval,
    ...(raw.aiProfiles
      ? { aiProfiles: normalizeAIProfiles(raw.aiProfiles) }
      : {}),
    aiEnabled:
      typeof raw.aiEnabled === 'boolean'
        ? raw.aiEnabled
        : DEFAULT_SETTINGS.aiEnabled,
    aiProvider: includes(AI_PROVIDER_VALUES, raw.aiProvider)
      ? raw.aiProvider
      : DEFAULT_SETTINGS.aiProvider,
    aiModel:
      typeof raw.aiModel === 'string' ? raw.aiModel : DEFAULT_SETTINGS.aiModel,
    aiBaseUrl:
      typeof raw.aiBaseUrl === 'string'
        ? raw.aiBaseUrl
        : DEFAULT_SETTINGS.aiBaseUrl,
  };
}

// Cached in memory, backed by settings.json on disk
let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };

let settingsFilePath = '';

export async function loadSettings(wsPath: string): Promise<AppSettings> {
  settingsFilePath = join(wsPath, '.ghostboard', 'settings.json');
  const file = Bun.file(settingsFilePath);
  if (await file.exists()) {
    try {
      const raw = (await file.json()) as Partial<AppSettings>;
      cachedSettings = normalizeAppSettings({ ...DEFAULT_SETTINGS, ...raw });
    } catch {
      cachedSettings = { ...DEFAULT_SETTINGS };
    }
  } else {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

export async function persistSettings(settings: AppSettings) {
  const normalized = normalizeAppSettings(settings);
  if (settingsFilePath) {
    await atomicWrite(settingsFilePath, JSON.stringify(normalized, null, 2));
  }
  cachedSettings = normalized;
}

/** Current in-memory settings (the object `loadSettings`/`persistSettings` last stored). */
export function getCachedSettings(): AppSettings {
  return cachedSettings;
}
