import { describe, expect, it } from 'vitest';

import { colorToStyle, isColorDark } from '@/lib/colorUtils';

describe('colorToStyle', () => {
  it('returns a backgroundColor style for a valid hex color', () => {
    expect(colorToStyle('#FF0000')).toEqual({ backgroundColor: '#FF0000' });
  });

  it('returns undefined for undefined input', () => {
    expect(colorToStyle()).toBeUndefined();
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
    expect(isColorDark()).toBe(false);
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
