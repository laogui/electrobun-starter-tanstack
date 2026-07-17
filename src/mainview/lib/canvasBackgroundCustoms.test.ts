import { describe, expect, it } from 'vitest';

import {
  addCanvasBackgroundCustom,
  removeCanvasBackgroundCustom,
} from './canvasBackgroundCustoms';

describe('canvasBackgroundCustoms', () => {
  it('adds a custom color to the front and dedupes case-insensitively', () => {
    expect(addCanvasBackgroundCustom(['#aabbcc'], '#AABBCC')).toEqual([
      '#AABBCC',
    ]);
    expect(addCanvasBackgroundCustom(['#112233'], '#ffee00')).toEqual([
      '#ffee00',
      '#112233',
    ]);
  });

  it('removes a custom color case-insensitively', () => {
    expect(
      removeCanvasBackgroundCustom(['#ffee00', '#112233'], '#FFEE00')
    ).toEqual(['#112233']);
  });
});
