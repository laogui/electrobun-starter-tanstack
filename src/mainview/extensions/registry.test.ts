import { describe, expect, it } from 'vitest';

const DUPLICATE_ID_RE = /Duplicate canvas type id/;

import { COUNTER_CANVAS_TYPE_ID } from '../../shared/extensions/demo/counter';

import { counterCanvasType } from './builtin/counter';
import { createCanvasTypeRegistry } from './registry';

describe('CanvasTypeRegistry', () => {
  it('registers a type and resolves availability without a business union', () => {
    const registry = createCanvasTypeRegistry();
    registry.register(counterCanvasType);

    expect(registry.get(COUNTER_CANVAS_TYPE_ID)?.id).toBe(
      COUNTER_CANVAS_TYPE_ID
    );
    expect(registry.availability(COUNTER_CANVAS_TYPE_ID, [])).toBe('available');
    expect(
      registry.availability(COUNTER_CANVAS_TYPE_ID, [COUNTER_CANVAS_TYPE_ID])
    ).toBe('disabled');
    expect(registry.availability('ghostboard.future/unknown', [])).toBe(
      'unknown'
    );
    expect(registry.listEnabled([COUNTER_CANVAS_TYPE_ID])).toEqual([]);
    expect(registry.listEnabled([]).map((type) => type.id)).toEqual([
      COUNTER_CANVAS_TYPE_ID,
    ]);
  });

  it('rejects a duplicate id', () => {
    const registry = createCanvasTypeRegistry();
    registry.register(counterCanvasType);
    expect(() => registry.register(counterCanvasType)).toThrow(DUPLICATE_ID_RE);
  });

  it('does not mention checklist or image in its public surface', () => {
    const registry = createCanvasTypeRegistry();
    registry.register(counterCanvasType);
    const ids = registry.list().map((type) => type.id);
    expect(ids.some((id) => id.includes('checklist'))).toBe(false);
    expect(ids.some((id) => id.includes('image'))).toBe(false);
  });
});
