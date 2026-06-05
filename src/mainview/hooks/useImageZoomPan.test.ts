import { describe, expect, it } from 'vitest';

import { clampPan } from './useImageZoomPan';

describe('clampPan', () => {
  it('returns 0 when zoom is 1 or less', () => {
    expect(clampPan(50, 1, 800)).toBe(0);
    expect(clampPan(-30, 0.5, 800)).toBe(0);
  });

  it('clamps positive pan to max boundary', () => {
    const maxPan = ((2 - 1) * 800) / 2;
    expect(clampPan(500, 2, 800)).toBe(maxPan);
  });

  it('clamps negative pan to min boundary', () => {
    const minPan = -(((2 - 1) * 800) / 2);
    expect(clampPan(-500, 2, 800)).toBe(minPan);
  });

  it('allows pan within bounds', () => {
    expect(clampPan(100, 2, 800)).toBe(100);
    expect(clampPan(-100, 2, 800)).toBe(-100);
  });

  it('scales max pan proportionally with zoom', () => {
    expect(clampPan(1000, 3, 800)).toBe(800);
    expect(clampPan(-1000, 3, 800)).toBe(-800);
  });
});
