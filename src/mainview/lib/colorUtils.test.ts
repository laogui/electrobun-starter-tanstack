import { describe, expect, it } from 'vitest';

import {
  colorToStyle,
  DEFAULT_PUSHPIN_BACKGROUND,
  isColorDark,
  stickyPushpinBackground,
} from '@/lib/colorUtils';

describe('colorToStyle', () => {
  it('returns a backgroundColor style for a valid hex color', () => {
    expect(colorToStyle('#FF0000')).toEqual({ backgroundColor: '#FF0000' });
  });

  it('returns undefined for undefined input', () => {
    expect(colorToStyle(undefined)).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(colorToStyle('')).toBeUndefined();
  });

  it('returns undefined for a non-hex string', () => {
    expect(colorToStyle('red')).toBeUndefined();
    expect(colorToStyle('rgb(0,0,0)')).toBeUndefined();
  });
});

describe('isColorDark', () => {
  it('returns true for black', () => {
    expect(isColorDark('#000000')).toBe(true);
  });

  it('returns false for white', () => {
    expect(isColorDark('#FFFFFF')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isColorDark(undefined)).toBe(false);
  });

  it('returns false for non-hex strings', () => {
    expect(isColorDark('red')).toBe(false);
    expect(isColorDark('')).toBe(false);
  });

  it('classifies dark colors correctly', () => {
    expect(isColorDark('#1a1a2e')).toBe(true);
    expect(isColorDark('#16213e')).toBe(true);
  });

  it('classifies light colors correctly', () => {
    expect(isColorDark('#FEF08A')).toBe(false);
    expect(isColorDark('#DBEAFE')).toBe(false);
    expect(isColorDark('#FDF2F8')).toBe(false);
  });
});

const PUSHPIN_GRADIENT_RE =
  /^linear-gradient\(135deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 100%\)$/;
const HEX_STOP_RE = /#[0-9a-f]{6}/g;

describe('stickyPushpinBackground', () => {
  it('falls back to the green default when no color is given', () => {
    expect(stickyPushpinBackground(undefined)).toBe(DEFAULT_PUSHPIN_BACKGROUND);
    expect(stickyPushpinBackground('')).toBe(DEFAULT_PUSHPIN_BACKGROUND);
    expect(stickyPushpinBackground('red')).toBe(DEFAULT_PUSHPIN_BACKGROUND);
  });

  it('falls back to the default for achromatic (white/gray) colors', () => {
    expect(stickyPushpinBackground('#FFFFFF')).toBe(DEFAULT_PUSHPIN_BACKGROUND);
    expect(stickyPushpinBackground('#808080')).toBe(DEFAULT_PUSHPIN_BACKGROUND);
  });

  it('derives a 135deg gradient that keeps the source hue', () => {
    const yellow = stickyPushpinBackground('#FEF08A');
    expect(yellow).toMatch(PUSHPIN_GRADIENT_RE);
    // Pastel yellow stays in the yellow range: red & green high, blue low.
    const stops = yellow.match(HEX_STOP_RE) ?? [];
    expect(stops).toHaveLength(2);
    for (const stop of stops) {
      const r = Number.parseInt(stop.slice(1, 3), 16);
      const g = Number.parseInt(stop.slice(3, 5), 16);
      const b = Number.parseInt(stop.slice(5, 7), 16);
      expect(r).toBeGreaterThan(b);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('produces different gradients for different hues', () => {
    expect(stickyPushpinBackground('#BFDBFE')).not.toBe(
      stickyPushpinBackground('#FBCFE8')
    );
  });
});
