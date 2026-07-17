import { isHexColor } from '@/lib/hexColor';

/** Named canvas background presets (Settings + quick picker). */
export const CANVAS_BG_LIGHT_PRESETS = {
  default: '#EFF3F4',
  paper: '#F6F0E4',
  cream: '#F8F5F2',
  mono: '#F4F4F4',
  lavender: '#E8DDE8',
  sage: '#E4EDD4',
  mist: '#D9EBE8',
  sand: '#F0E4DA',
  ivory: '#FEF7EC',
  mint: '#F2FFE4',
  lichen: '#F2F7E7',
} as const;

export const CANVAS_BG_DARK_PRESETS = {
  default: '#141414',
  paper: '#1E1A14',
  cream: '#1B1917',
  mono: '#1C1C1C',
  lavender: '#1F1A1F',
  sage: '#1A1E16',
  mist: '#161C1B',
  sand: '#1E1A17',
  ivory: '#1F1B16',
  mint: '#161C14',
  lichen: '#181B16',
} as const;

export type CanvasBackgroundPreset = keyof typeof CANVAS_BG_LIGHT_PRESETS;

export const CANVAS_BG_PRESET_ORDER = [
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
] as const satisfies readonly CanvasBackgroundPreset[];

export function isCanvasBackgroundPreset(
  value: string
): value is CanvasBackgroundPreset {
  return Object.hasOwn(CANVAS_BG_LIGHT_PRESETS, value);
}

export function isCanvasBackgroundSetting(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (isCanvasBackgroundPreset(value) || isHexColor(value))
  );
}

export function resolveCanvasBackground(
  setting: string,
  isDarkTheme: boolean
): string {
  if (isHexColor(setting)) {
    return setting;
  }

  const presets = isDarkTheme
    ? CANVAS_BG_DARK_PRESETS
    : CANVAS_BG_LIGHT_PRESETS;

  if (isCanvasBackgroundPreset(setting)) {
    return presets[setting];
  }

  return presets.default;
}
