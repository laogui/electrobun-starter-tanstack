import { describe, expect, it } from 'vitest';

import {
  isCanvasContentNode,
  isFocusableNode,
  isFolderChildNode,
  isGroupChildNode,
} from '@/lib/canvasNodePredicates';

describe('isCanvasContentNode', () => {
  it.each([
    ['card', true],
    ['image', true],
    ['sticky', true],
    ['asset', true],
    ['link', true],
    ['folder', false],
    ['group', false],
    ['unknown', false],
    [undefined, false],
    ['', false],
  ] as const)('returns %s for %s', (type, expected) => {
    expect(isCanvasContentNode(type)).toBe(expected);
  });
});

describe('isGroupChildNode', () => {
  it.each([
    ['card', true],
    ['image', true],
    ['sticky', true],
    ['folder', true],
    ['asset', true],
    ['link', true],
    ['group', false],
    ['unknown', false],
    [undefined, false],
  ] as const)('returns %s for %s', (type, expected) => {
    expect(isGroupChildNode(type)).toBe(expected);
  });
});

describe('isFolderChildNode', () => {
  it.each([
    ['card', true],
    ['image', true],
    ['asset', true],
    ['link', true],
    ['sticky', false],
    ['folder', false],
    ['group', false],
    ['unknown', false],
    [undefined, false],
  ] as const)('returns %s for %s', (type, expected) => {
    expect(isFolderChildNode(type)).toBe(expected);
  });
});

describe('isFocusableNode', () => {
  it('matches card and image (MVP focus parity)', () => {
    expect(isFocusableNode('card')).toBe(true);
    expect(isFocusableNode('image')).toBe(true);
  });

  it('reserves a true branch for asset / link', () => {
    expect(isFocusableNode('asset')).toBe(true);
    expect(isFocusableNode('link')).toBe(true);
    expect(isFocusableNode('widget')).toBe(true);
  });

  it('rejects structural and undefined types', () => {
    expect(isFocusableNode('folder')).toBe(false);
    expect(isFocusableNode('group')).toBe(false);
    expect(isFocusableNode('sticky')).toBe(false);
    expect(isFocusableNode(undefined)).toBe(false);
  });
});
