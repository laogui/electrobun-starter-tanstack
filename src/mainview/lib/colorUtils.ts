import type React from 'react';

export const CARD_COLORS = [
  '#FFFFFF',
  '#FDF2F8',
  '#EAF2B8',
  '#DBEAFE',
  '#FEF3C7',
  '#E0E7FF',
] as const;

export const STICKY_COLORS = [
  '#FEF08A',
  '#BBF7D0',
  '#FBCFE8',
  '#BFDBFE',
  '#FED7AA',
  '#E9D5FF',
] as const;

export const GROUP_COLORS = [
  'blue',
  'green',
  'yellow',
  'pink',
  'orange',
] as const;

/** Convert a hex color to an inline background-color style for rendering. */
export function colorToStyle(
  color: string | undefined
): React.CSSProperties | undefined {
  if (!color) {
    return;
  }
  if (!color.startsWith('#')) {
    return;
  }
  return { backgroundColor: color };
}

/** Returns true if a hex color is "dark" (should use light text). */
export function isColorDark(hex: string | undefined): boolean {
  if (!hex?.startsWith('#')) {
    return false;
  }
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}
