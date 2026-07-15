import type { CanvasBackgroundSetting } from '@/settingsClient';

/** Light-theme canvas background colors (Settings → General). */
export const CANVAS_BG_LIGHT_PRESETS = {
  default: '#EFF3F4',
  paper: '#F6F0E4', // warm beige
  mono: '#F4F4F4', // neutral gray
} as const satisfies Record<CanvasBackgroundSetting, string>;

/** Dark-theme canvas background colors (Settings → General). */
export const CANVAS_BG_DARK_PRESETS = {
  default: '#141414',
  paper: '#1E1A14', // warm charcoal
  mono: '#1C1C1C', // neutral near-black
} as const satisfies Record<CanvasBackgroundSetting, string>;

export const CANVAS_BG_PRESET_ORDER = [
  'default',
  'paper',
  'mono',
] as const satisfies readonly CanvasBackgroundSetting[];

export function resolveCanvasBackground(
  preset: CanvasBackgroundSetting,
  isDarkTheme: boolean
): string {
  const presets = isDarkTheme
    ? CANVAS_BG_DARK_PRESETS
    : CANVAS_BG_LIGHT_PRESETS;
  return presets[preset] ?? presets.default;
}
