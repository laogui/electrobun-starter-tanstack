import { describe, expect, it } from 'vitest';

import {
  canvasTypeMenuActionId,
  generateInstanceId,
  isCanvasTypeId,
  isInstanceId,
  parseCanvasTypeId,
  parseCanvasTypeMenuActionId,
} from './ids';

describe('canvas type ids', () => {
  it('accepts namespaced kebab-case keys', () => {
    expect(isCanvasTypeId('ghostboard.demo/counter')).toBe(true);
    expect(isCanvasTypeId('ghostboard.media/image')).toBe(true);
    expect(parseCanvasTypeId('ghostboard.productivity/pomodoro')).toEqual({
      namespace: 'ghostboard.productivity',
      typeId: 'pomodoro',
    });
  });

  it('rejects transferred or malformed keys', () => {
    expect(isCanvasTypeId('demo/counter')).toBe(false);
    expect(isCanvasTypeId('ghostboard.Demo/counter')).toBe(false);
    expect(isCanvasTypeId('ghostboard.demo/Counter')).toBe(false);
    expect(isCanvasTypeId('ghostboard.demo/counter/extra')).toBe(false);
    expect(parseCanvasTypeId('not-a-type')).toBeNull();
  });
});

describe('instance ids', () => {
  it('generates a valid extinst_ id', () => {
    const id = generateInstanceId();
    expect(isInstanceId(id)).toBe(true);
    expect(id.startsWith('extinst_')).toBe(true);
  });

  it('rejects traversal and spaces', () => {
    expect(isInstanceId('../etc/passwd')).toBe(false);
    expect(isInstanceId('extinst_ with space')).toBe(false);
    expect(isInstanceId('widget_abc')).toBe(false);
  });
});

describe('create-menu action ids', () => {
  it('round-trips a canvas type through menu action ids', () => {
    const id = canvasTypeMenuActionId('ghostboard.demo/counter');
    expect(id).toBe('ext:ghostboard.demo/counter');
    expect(parseCanvasTypeMenuActionId(id)).toBe('ghostboard.demo/counter');
    expect(parseCanvasTypeMenuActionId(`new-${id}`)).toBe(
      'ghostboard.demo/counter'
    );
  });

  it('ignores core create actions', () => {
    expect(parseCanvasTypeMenuActionId('note')).toBeUndefined();
    expect(parseCanvasTypeMenuActionId('new-note')).toBeUndefined();
  });
});
