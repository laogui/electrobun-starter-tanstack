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

/** Default green pushpin gradient used when a sticky has no usable color. */
export const DEFAULT_PUSHPIN_BACKGROUND =
  'linear-gradient(135deg, #2bf07a 0%, #00913a 100%)';

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return [0, 0, l];
  }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return [h / 6, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tn = t;
    if (tn < 0) {
      tn += 1;
    }
    if (tn > 1) {
      tn -= 1;
    }
    if (tn < 1 / 6) {
      return p + (q - p) * 6 * tn;
    }
    if (tn < 1 / 2) {
      return q;
    }
    if (tn < 2 / 3) {
      return p + (q - p) * (2 / 3 - tn) * 6;
    }
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = l;
    g = l;
    b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Derive a glossy pushpin gradient from a sticky's (usually pastel) background
 * color by keeping its hue but saturating and darkening it into a vivid ball.
 * Falls back to the green default when the color is missing or achromatic
 * (white/gray), where saturating would invent an arbitrary hue.
 */
export function stickyPushpinBackground(color: string | undefined): string {
  if (!color?.startsWith('#') || color.length < 7) {
    return DEFAULT_PUSHPIN_BACKGROUND;
  }
  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return DEFAULT_PUSHPIN_BACKGROUND;
  }
  const [h, s] = rgbToHsl(r, g, b);
  if (s < 0.12) {
    return DEFAULT_PUSHPIN_BACKGROUND;
  }
  const sat = Math.min(1, Math.max(s, 0.7));
  const light = hslToHex(h, sat, 0.6);
  const dark = hslToHex(h, Math.min(1, sat), 0.34);
  return `linear-gradient(135deg, ${light} 0%, ${dark} 100%)`;
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
