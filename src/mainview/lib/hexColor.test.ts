import { describe, expect, it } from 'vitest';

import { hexToRgba, isHexColor, rgbaToHex } from './hexColor';

describe('isHexColor', () => {
  it('accepts 3/6/8 digit hex colors', () => {
    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('#EFF3F4')).toBe(true);
    expect(isHexColor('#FF573380')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isHexColor('default')).toBe(false);
    expect(isHexColor('#gg0000')).toBe(false);
    expect(isHexColor('EFF3F4')).toBe(false);
  });
});

describe('hexToRgba / rgbaToHex', () => {
  it('round-trips opaque colors', () => {
    expect(hexToRgba('#CADBA2')).toEqual({ r: 202, g: 219, b: 162, a: 1 });
    expect(rgbaToHex(202, 219, 162, 1)).toBe('#cadba2');
  });

  it('preserves alpha when below 1', () => {
    expect(rgbaToHex(255, 0, 0, 0.5)).toBe('#ff000080');
    const parsed = hexToRgba('#ff000080');
    expect(parsed).toMatchObject({ r: 255, g: 0, b: 0 });
    expect(parsed?.a).toBeCloseTo(0.5, 2);
  });
});
