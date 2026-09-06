import { describe, expect, it } from 'vitest';

import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
import {
  isCanvasContentNode,
  isDetachableNode,
  isFocusableNode,
  isFolderChildNode,
  isGroupChildNode,
  isRejectedFolderChildNode,
} from '@/lib/canvasNodePredicates';
import {
  FILE_CANVAS_TYPE_ID,
  IMAGE_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
  RECORDING_CANVAS_TYPE_ID,
} from '../../shared/extensions/builtinIds';

registerBuiltinCanvasTypes();

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

describe('isDetachableNode', () => {
  it('keeps dual-read for legacy card, image, link, and asset types', () => {
    expect(isDetachableNode('card')).toBe(true);
    expect(isDetachableNode('image')).toBe(true);
    expect(isDetachableNode('link')).toBe(true);
    expect(isDetachableNode('asset')).toBe(true);
  });

  it('honors canDetach on link, image, and file extensions', () => {
    expect(
      isDetachableNode('extension', { canvasTypeId: LINK_CANVAS_TYPE_ID })
    ).toBe(true);
    expect(
      isDetachableNode('extension', { canvasTypeId: IMAGE_CANVAS_TYPE_ID })
    ).toBe(true);
    expect(
      isDetachableNode('extension', { canvasTypeId: FILE_CANVAS_TYPE_ID })
    ).toBe(true);
  });

  it('rejects recording extensions and structural types', () => {
    expect(
      isDetachableNode('extension', {
        canvasTypeId: RECORDING_CANVAS_TYPE_ID,
      })
    ).toBe(false);
    expect(isDetachableNode('group')).toBe(false);
    expect(isDetachableNode('recording')).toBe(false);
    expect(isDetachableNode(undefined)).toBe(false);
  });
});
