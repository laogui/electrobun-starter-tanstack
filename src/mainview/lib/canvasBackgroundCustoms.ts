import { isHexColor } from '@/lib/hexColor';

const STORAGE_KEY = 'ghostboard.canvas-bg-customs';
const MAX_CUSTOM_COLORS = 12;

export function loadCanvasBackgroundCustoms(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
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

export function saveCanvasBackgroundCustoms(colors: string[]): void {
  try {
    const next = colors.filter(isHexColor).slice(0, MAX_CUSTOM_COLORS);
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
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
