import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildFolderExpansionNodes,
  calculateFolderShelfLayout,
  FOLDER_EXPANDED_CHILD_NODE_TYPE,
  type FolderExpandedChildData,
  getFolderChildPreviewSize,
  getFolderThumbnailContentTransform,
  getFolderThumbnailSlots,
  getFolderThumbnailTransform,
  getFolderThumbnailTransformFromOrigin,
  MAX_FOLDER_EXPANDED_CHILDREN,
  MAX_FOLDER_PREVIEWS,
  THUMBNAIL_HEIGHT_PERCENT,
  THUMBNAIL_WIDTH_PERCENT,
} from './folderExpansion';

function folder(children: Array<{ id: string; type?: string }>): Node {
  return {
    id: 'folder-1',
    type: 'folder',
    position: { x: 500, y: 600 },
    style: { width: 280, height: 280 },
    data: {
      children: children.map((child) => ({
        id: child.id,
        type: child.type ?? 'card',
        data: { title: child.id, content: child.id },
      })),
    },
  };
}

describe('buildFolderExpansionNodes', () => {
  it('uses a distinct tucked composition for every visible card count', () => {
    for (let count = 1; count <= MAX_FOLDER_PREVIEWS; count += 1) {
      const childIds = Array.from(
        { length: count },
        (_, index) => `child-${index}`
      );
      const slots = getFolderThumbnailSlots(childIds);

      expect(slots).toHaveLength(count);
      expect(new Set(slots.map((slot) => slot.rotation))).toHaveLength(count);
      expect(
        slots.every((slot) => slot.topPercent >= 16 && slot.topPercent <= 24)
      ).toBe(true);
      expect(getFolderThumbnailSlots(childIds)).toEqual(slots);
    }
  });

  it('selects stable pseudo-random variants from each card-count family', () => {
    for (let count = 1; count <= MAX_FOLDER_PREVIEWS; count += 1) {
      const variants = new Set(
        Array.from({ length: 24 }, (_, seed) =>
          JSON.stringify(
            getFolderThumbnailSlots(
              Array.from(
                { length: count },
                (_, index) => `folder-${seed}-child-${index}`
              )
            )
          )
        )
      );

      expect(variants.size).toBeGreaterThan(1);
    }
  });

  it('materializes up to eight render-only React Flow children above the folder', () => {
    const source = folder(
      Array.from({ length: 10 }, (_, index) => ({ id: `child-${index}` }))
    );
    const expanded = buildFolderExpansionNodes({
      allNodes: [source],
      closing: false,
      folderId: source.id,
    });

    expect(expanded).toHaveLength(MAX_FOLDER_EXPANDED_CHILDREN);
    expect(
      expanded.every((node) => node.type === FOLDER_EXPANDED_CHILD_NODE_TYPE)
    ).toBe(true);
    expect(expanded.every((node) => node.position.y < source.position.y)).toBe(
      true
    );
    expect(expanded.every((node) => node.draggable === false)).toBe(true);
  });

  it('packs seven mixed-size cards into bottom-aligned four-plus-three shelves', () => {
    const folderRect = { left: 500, right: 780, top: 600, bottom: 880 };
    const sizes = [
      { width: 230, height: 356 },
      { width: 330, height: 467 },
      { width: 155, height: 200 },
      { width: 151, height: 136 },
      { width: 240, height: 352 },
      { width: 480, height: 350 },
      { width: 255, height: 352 },
    ];
    const slots = calculateFolderShelfLayout({ folderRect, sizes });
    const topRow = slots.slice(0, 4);
    const bottomRow = slots.slice(4);

    expect(new Set(topRow.map((slot) => slot.y + slot.height))).toHaveLength(1);
    expect(new Set(bottomRow.map((slot) => slot.y + slot.height))).toHaveLength(
      1
    );
    expect(bottomRow[0]!.y + bottomRow[0]!.height).toBe(578);
    expect(topRow[0]!.y + topRow[0]!.height).toBe(204);
    expect(bottomRow[1]!.x - (bottomRow[0]!.x + bottomRow[0]!.width)).toBe(22);

    const centerX = (folderRect.left + folderRect.right) / 2;
    const topLeft = Math.min(...topRow.map((slot) => slot.x));
    const topRight = Math.max(...topRow.map((slot) => slot.x + slot.width));
    const bottomLeft = Math.min(...bottomRow.map((slot) => slot.x));
    const bottomRight = Math.max(
      ...bottomRow.map((slot) => slot.x + slot.width)
    );
    expect((topLeft + topRight) / 2).toBe(centerX);
    expect((bottomLeft + bottomRight) / 2).toBe(centerX);
  });

  it('preserves a stored child aspect ratio while bounding its expanded size', () => {
    const landscape = getFolderChildPreviewSize('image', {
      width: 700,
      height: 400,
    });
    const portrait = getFolderChildPreviewSize('image', {
      width: 320,
      height: 700,
    });

    expect(landscape).toEqual({ width: 476, height: 272 });
    expect(portrait).toEqual({ width: 218, height: 476 });
    expect(landscape.width / landscape.height).toBeCloseTo(700 / 400, 2);
    expect(portrait.width / portrait.height).toBeCloseTo(320 / 700, 2);
  });

  it('uses distinct thumbnail origins and keeps the row centered on the folder', () => {
    const source = folder([
      { id: 'a' },
      { id: 'b', type: 'image' },
      { id: 'c' },
    ]);
    const expanded = buildFolderExpansionNodes({
      allNodes: [source],
      closing: false,
      folderId: source.id,
    });
    const firstOrigin = expanded[0]!.data.origin as { x: number; y: number };
    const lastOrigin = expanded[2]!.data.origin as { x: number; y: number };
    expect(firstOrigin).not.toEqual(lastOrigin);

    const left = Math.min(...expanded.map((node) => node.position.x));
    const right = Math.max(
      ...expanded.map(
        (node) =>
          node.position.x + ((node.style as { width: number }).width ?? 0)
      )
    );
    expect((left + right) / 2).toBeCloseTo(640, 5);
    expect(expanded[0]!.data.target).toMatchObject({
      height: expect.any(Number),
      width: expect.any(Number),
      x: expanded[0]!.position.x - source.position.x,
      y: expanded[0]!.position.y - source.position.y,
    });
    const firstData = expanded[0]!.data as FolderExpandedChildData;
    expect(firstData.target.width * firstData.origin.scaleX).toBeCloseTo(
      280 * (THUMBNAIL_WIDTH_PERCENT / 100),
      5
    );
    expect(firstData.target.height * firstData.origin.scaleY).toBeCloseTo(
      280 * (THUMBNAIL_HEIGHT_PERCENT / 100),
      5
    );
  });

  it('switches the shared-element nodes into the reverse closing phase', () => {
    const source = folder([{ id: 'a' }]);
    const expanded = buildFolderExpansionNodes({
      allNodes: [source],
      closing: true,
      folderId: source.id,
    });
    expect(expanded[0]!.data.phase).toBe('closing');
  });

  it('places expansion children above the existing React Flow z-index range', () => {
    const source = folder([{ id: 'a' }, { id: 'b' }]);
    source.zIndex = 3200;
    const expanded = buildFolderExpansionNodes({
      allNodes: [source],
      closing: false,
      folderId: source.id,
    });

    expect(expanded.every((node) => (node.zIndex ?? 0) > 4200)).toBe(true);
  });

  it('matches closed-stack thumbnail scale to the expansion origin frame', () => {
    const childIds = ['a', 'b'];
    const source = folder([
      { id: childIds[0]! },
      { id: childIds[1]!, type: 'image' },
    ]);
    const expanded = buildFolderExpansionNodes({
      allNodes: [source],
      closing: false,
      folderId: source.id,
    });
    const slots = getFolderThumbnailSlots(childIds);

    for (const [index, node] of expanded.entries()) {
      const data = node.data as FolderExpandedChildData;
      const slot = slots[index]!;
      const thumbnail = getFolderThumbnailTransform({
        folderHeight: 280,
        folderWidth: 280,
        rotation: slot.rotation,
        type: data.child.type,
      });
      expect(data.origin.scaleX).toBeCloseTo(thumbnail.scaleX, 5);
      expect(data.origin.scaleY).toBeCloseTo(thumbnail.scaleY, 5);
      expect(data.origin.rotation).toBe(slot.rotation);
      expect(data.target.width).toBe(thumbnail.width);
      expect(data.target.height).toBe(thumbnail.height);
      // Motion order: scale then rotate (not rotate then scale).
      expect(thumbnail.transform).toBe(
        `translate(-50%, -50%) scale(${thumbnail.scaleX}, ${thumbnail.scaleY}) rotate(${slot.rotation}deg)`
      );
      expect(
        getFolderThumbnailTransformFromOrigin({
          height: data.target.height,
          rotation: data.origin.rotation,
          scaleX: data.origin.scaleX,
          scaleY: data.origin.scaleY,
          width: data.target.width,
        }).transform
      ).toBe(thumbnail.transform);
    }
  });

  it('counter-scales wide thumbnail contents without exposing the frame', () => {
    const content = getFolderThumbnailContentTransform({
      scaleX: 0.8,
      scaleY: 0.4,
    });

    expect(content.scaleX).toBe(0.5);
    expect(content.widthPercent).toBe(200);
    expect(content.transform).toBe('scaleX(0.5)');
    expect(content.scaleX * content.widthPercent).toBe(100);
    expect(0.8 * content.scaleX).toBe(0.4);
  });
});
