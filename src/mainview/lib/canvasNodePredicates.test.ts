import { describe, expect, it } from 'vitest';

import {
  isCanvasContentNode,
  isFocusableNode,
  isFolderChildNode,
  isGroupChildNode,
  isRejectedFolderChildNode,
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
    ['widget', false],
    ['unknown', false],
    [undefined, false],
  ] as const)('returns %s for %s', (type, expected) => {
    expect(isFolderChildNode(type)).toBe(expected);
  });
});

describe('isRejectedFolderChildNode', () => {
  it.each([
    ['widget', true],
    ['sticky', true],
    ['folder', true],
    ['group', true],
    ['card', false],
    ['image', false],
    ['asset', false],
    ['link', false],
    ['unknown', false],
    [undefined, false],
  ] as const)('returns %s for %s', (type, expected) => {
    expect(isRejectedFolderChildNode(type)).toBe(expected);
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
  });

  it('rejects structural, widget, and undefined types', () => {
    expect(isFocusableNode('folder')).toBe(false);
    expect(isFocusableNode('group')).toBe(false);
    expect(isFocusableNode('sticky')).toBe(false);
    // Widgets edit in place on the canvas; they must not open FocusedView.
    expect(isFocusableNode('widget')).toBe(false);
    expect(isFocusableNode(undefined)).toBe(false);
  });
});
