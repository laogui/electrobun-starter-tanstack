export interface RgbaColor {
  a: number;
  b: number;
  g: number;
  r: number;
}

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const HEX_HASH_RE = /^#/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

export function rgbaToHex(r: number, g: number, b: number, a = 1): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');

  const alpha = Number.isNaN(a) ? 255 : Math.round(a * 255);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${alpha === 255 ? '' : toHex(alpha)}`;
}

export function hexToRgba(hex: string): RgbaColor | null {
  if (!hex) {
    return null;
  }

  let normalized = hex.replace(HEX_HASH_RE, '');
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (normalized.length !== 6 && normalized.length !== 8) {
    return null;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const a =
    normalized.length === 8
      ? Number.parseInt(normalized.slice(6, 8), 16) / 255
      : 1;

  if ([r, g, b, a].some((value) => Number.isNaN(value))) {
    return null;
  }

  return { r, g, b, a };
}
