import { describe, expect, it } from 'vitest';

import {
  isCanvasBackgroundPreset,
  isCanvasBackgroundSetting,
  resolveCanvasBackground,
} from './canvasBackground';

describe('resolveCanvasBackground', () => {
  it('resolves named presets by theme', () => {
    expect(resolveCanvasBackground('paper', false)).toBe('#F6F0E4');
    expect(resolveCanvasBackground('paper', true)).toBe('#1E1A14');
  });

  it('passes through custom hex colors', () => {
    expect(resolveCanvasBackground('#CADBA2', false)).toBe('#CADBA2');
    expect(resolveCanvasBackground('#CADBA2', true)).toBe('#CADBA2');
  });

  it('falls back to default for unknown values', () => {
    expect(resolveCanvasBackground('unknown', false)).toBe('#EFF3F4');
  });
});

describe('isCanvasBackgroundSetting', () => {
  it('accepts presets and hex', () => {
    expect(isCanvasBackgroundSetting('lavender')).toBe(true);
    expect(isCanvasBackgroundSetting('#B3D7D3')).toBe(true);
    expect(isCanvasBackgroundSetting('nope')).toBe(false);
  });

  it('detects presets', () => {
    expect(isCanvasBackgroundPreset('sage')).toBe(true);
    expect(isCanvasBackgroundPreset('#sage')).toBe(false);
  });
});
