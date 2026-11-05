import { isHexColor } from '@/lib/hexColor';

const STORAGE_KEY = 'ghostboard.canvas-bg-customs';
const MAX_CUSTOM_COLORS = 12;

export const CARD_COLOR_CUSTOMS_KEY = 'ghostboard.card-color-customs';

export function loadCanvasBackgroundCustoms(): string[] {
  return loadColorCustoms(STORAGE_KEY);
}

export function saveCanvasBackgroundCustoms(colors: string[]): void {
  saveColorCustoms(STORAGE_KEY, colors);
}

/** Saved custom swatches under `key` (canvas background, card colour). */
export function loadColorCustoms(key: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((value): value is string => typeof value === 'string')
      .filter(isHexColor)
      .slice(0, MAX_CUSTOM_COLORS);
  } catch {
    return [];
  }
}

export function saveColorCustoms(key: string, colors: string[]): void {
  try {
    const next = colors.filter(isHexColor).slice(0, MAX_CUSTOM_COLORS);
    globalThis.localStorage?.setItem(key, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode failures; in-session state still works.
  }
}

export function addCanvasBackgroundCustom(
  colors: string[],
  color: string
): string[] {
  if (!isHexColor(color)) {
    return colors;
  }
  const without = colors.filter(
    (existing) => existing.toLowerCase() !== color.toLowerCase()
  );
  return [color, ...without].slice(0, MAX_CUSTOM_COLORS);
}

export function removeCanvasBackgroundCustom(
  colors: string[],
  color: string
): string[] {
  return colors.filter(
    (existing) => existing.toLowerCase() !== color.toLowerCase()
  );
}
