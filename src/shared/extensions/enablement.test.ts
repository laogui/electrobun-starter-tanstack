import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EXTENSION_ENABLEMENT,
  isCanvasTypeEnabled,
  parseExtensionEnablement,
} from './enablement';

describe('parseExtensionEnablement', () => {
  it('defaults to every type enabled', () => {
    expect(parseExtensionEnablement(null)).toEqual(
      DEFAULT_EXTENSION_ENABLEMENT
    );
    expect(parseExtensionEnablement({})).toEqual(DEFAULT_EXTENSION_ENABLEMENT);
  });

  it('keeps only valid canvas type ids', () => {
    expect(
      parseExtensionEnablement({
        disabledCanvasTypes: [
          'ghostboard.demo/counter',
          'ghostboard.demo/counter',
          'not-valid',
          12,
        ],
      })
    ).toEqual({
      schema: 'ghostboard-extension-enablement/v1',
      disabledCanvasTypes: ['ghostboard.demo/counter'],
    });
  });
});

describe('isCanvasTypeEnabled', () => {
  it('treats missing entries as enabled', () => {
    expect(isCanvasTypeEnabled('ghostboard.demo/counter', [])).toBe(true);
    expect(
      isCanvasTypeEnabled('ghostboard.demo/counter', ['ghostboard.media/image'])
    ).toBe(true);
    expect(
      isCanvasTypeEnabled('ghostboard.demo/counter', [
        'ghostboard.demo/counter',
      ])
    ).toBe(false);
  });
});
